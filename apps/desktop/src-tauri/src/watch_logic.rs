//! ファイル監視の純ロジック（Tauri / notify 非依存）。
//!
//! 監視イベントの「分類」と「自己書き込み由来のエコー抑制」の判断だけをここに寄せ、
//! `#[cfg(test)]` から実 FS もランタイムも使わずに単体検査する。notify クレートの
//! イベント型 → [`RawEvent`] への写像と実際の監視配線は lib.rs 側（配線層）で行う。

use serde::Serialize;
use std::path::{Component, Path, PathBuf};
use std::time::{Duration, Instant};

use crate::workspace::{is_excluded_dir, ALLOWED_EXTS};

/// notify のイベント種別を、判断に必要な粒度へ畳んだもの。
/// 配線層（lib.rs）が `notify::EventKind` からこの値へ写像して渡す。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RawEvent {
    /// ファイル内容の変更（開いていれば再読込の候補）。
    Modified,
    /// 新規作成（ツリー構造が変わる → 再走査）。
    Created,
    /// 削除（ツリー構造が変わる → 再走査）。
    Removed,
    /// リネーム（ツリー構造が変わる → 再走査）。
    Renamed,
    /// アクセス等、画面反映に無関係なイベント（無視）。
    Other,
}

/// フロントへ通知する 1 変更。serde は camelCase 化して `{ relPath, kind }` に一致させる。
#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FileChange {
    pub rel_path: String,
    pub kind: FileChangeKind,
}

/// 変更の種別。フロントは `'modified' | 'rescan'` として受ける。
#[derive(Serialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum FileChangeKind {
    /// 開いているファイルの内容が変わった。未編集なら再読込する。
    Modified,
    /// ツリー構造が変わった。再走査する。
    Rescan,
}

/// 監視イベントを、フロントへ通知する [`FileChange`] 群へ分類する。
///
/// - `.md` / `.tsv` 以外、除外ディレクトリ（`.git` / `node_modules` / `dist` / `build`）配下、
///   root 外のパスは捨てる。
/// - 作成 / 削除 / リネームは `rescan`、内容変更は `modified` に写す。
/// - `Other` は空 Vec（何も通知しない）。
///
/// root 配下判定はレキシカル（`strip_prefix`）で行う。配線層は notify が報告する絶対パスと
/// 揃うよう、canonicalize 済みの root を渡すこと（削除済みファイルは canonicalize できないため
/// ここでは実 FS を触らない）。
pub fn classify_event(raw: RawEvent, paths: &[PathBuf], root: &Path) -> Vec<FileChange> {
    let kind = match raw {
        RawEvent::Modified => FileChangeKind::Modified,
        RawEvent::Created | RawEvent::Removed | RawEvent::Renamed => FileChangeKind::Rescan,
        RawEvent::Other => return Vec::new(),
    };
    paths
        .iter()
        .filter_map(|p| rel_under_root(p, root).map(|rel_path| FileChange { rel_path, kind }))
        .collect()
}

/// `path` が root 配下の対象ファイル（md/tsv・除外ディレクトリ外）なら、`/` 区切りの
/// 相対パスを返す。対象外・root 外は None。
fn rel_under_root(path: &Path, root: &Path) -> Option<String> {
    let rel = path.strip_prefix(root).ok()?;
    // パス構成要素に除外ディレクトリ名が 1 つでもあれば対象外。
    for comp in rel.components() {
        if let Component::Normal(os) = comp {
            if os.to_str().is_some_and(is_excluded_dir) {
                return None;
            }
        }
    }
    // 拡張子ゲート（削除済みでも文字列判定なので成立する）。
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase());
    match ext {
        Some(e) if ALLOWED_EXTS.contains(&e.as_str()) => {}
        _ => return None,
    }
    Some(rel.to_string_lossy().replace('\\', "/"))
}

/// `path` が直近の自己書き込み（`recent` に記録済み）に `window` 以内で一致するか。
/// 一致すれば、自分の保存が跳ね返ったエコーとみなして通知を抑制する。
///
/// `path` と `recent` のパスはいずれも配線層で canonicalize 済みを前提に等価比較する。
pub fn is_recent_self_write(
    path: &Path,
    recent: &[(PathBuf, Instant)],
    now: Instant,
    window: Duration,
) -> bool {
    recent
        .iter()
        .any(|(p, t)| p == path && now.saturating_duration_since(*t) <= window)
}

/// `window` を過ぎた自己書き込み記録を捨てる（記録が無限に伸びるのを防ぐ）。
pub fn prune_expired(recent: &mut Vec<(PathBuf, Instant)>, now: Instant, window: Duration) {
    recent.retain(|(_, t)| now.saturating_duration_since(*t) <= window);
}

/// 分類済みの変更列から、同一 `(rel_path, kind)` の重複を畳む。
/// notify は 1 回の保存で同一ファイルの複数イベントを報告しがちなので、発行前に潰す。
pub fn map_changes_dedup(mut changes: Vec<FileChange>) -> Vec<FileChange> {
    changes.sort_by(|a, b| {
        a.rel_path
            .cmp(&b.rel_path)
            .then((a.kind as u8).cmp(&(b.kind as u8)))
    });
    changes.dedup();
    changes
}

#[cfg(test)]
mod tests {
    use super::*;

    fn root() -> PathBuf {
        PathBuf::from("/ws")
    }

    fn join(rel: &str) -> PathBuf {
        root().join(rel)
    }

    // ── classify_event ───────────────────────────────────────────────────

    #[test]
    fn 内容変更のmdはmodifiedに分類する() {
        let changes = classify_event(RawEvent::Modified, &[join("a.md")], &root());
        assert_eq!(
            changes,
            vec![FileChange {
                rel_path: "a.md".into(),
                kind: FileChangeKind::Modified,
            }]
        );
    }

    #[test]
    fn 作成削除リネームはrescanに分類する() {
        for raw in [RawEvent::Created, RawEvent::Removed, RawEvent::Renamed] {
            let changes = classify_event(raw, &[join("docs/x.tsv")], &root());
            assert_eq!(
                changes,
                vec![FileChange {
                    rel_path: "docs/x.tsv".into(),
                    kind: FileChangeKind::Rescan,
                }],
                "raw={:?}",
                raw
            );
        }
    }

    #[test]
    fn otherイベントは何も通知しない() {
        assert!(classify_event(RawEvent::Other, &[join("a.md")], &root()).is_empty());
    }

    #[test]
    fn md_tsv以外の拡張子は捨てる() {
        assert!(classify_event(RawEvent::Modified, &[join("a.txt")], &root()).is_empty());
        assert!(classify_event(RawEvent::Created, &[join("img.png")], &root()).is_empty());
        // 拡張子なし（ディレクトリ等）も捨てる。
        assert!(classify_event(RawEvent::Created, &[join("subdir")], &root()).is_empty());
    }

    #[test]
    fn 除外ディレクトリ配下は捨てる() {
        for rel in [".git/x.md", "node_modules/p/y.md", "dist/o.md", "build/o.md"] {
            assert!(
                classify_event(RawEvent::Modified, &[join(rel)], &root()).is_empty(),
                "rel={}",
                rel
            );
        }
    }

    #[test]
    fn root外のパスは捨てる() {
        let outside = PathBuf::from("/other/secret.md");
        assert!(classify_event(RawEvent::Modified, &[outside], &root()).is_empty());
    }

    #[test]
    fn 拡張子は大文字でも小文字化して判定する() {
        let changes = classify_event(RawEvent::Modified, &[join("A.MD")], &root());
        assert_eq!(changes.len(), 1);
        assert_eq!(changes[0].rel_path, "A.MD");
    }

    #[test]
    fn 複数パスをまとめて分類し対象外だけ捨てる() {
        let paths = [join("a.md"), join("b.txt"), join("docs/c.tsv")];
        let changes = classify_event(RawEvent::Modified, &paths, &root());
        let rels: Vec<&str> = changes.iter().map(|c| c.rel_path.as_str()).collect();
        assert_eq!(rels, vec!["a.md", "docs/c.tsv"]);
    }

    #[test]
    fn バックスラッシュ区切りをスラッシュへ正規化する() {
        // Windows で root と path が `\` 区切りでも rel は `/` 区切りになる。
        let win_root = PathBuf::from(r"C:\ws");
        let win_path = PathBuf::from(r"C:\ws\docs\x.md");
        let changes = classify_event(RawEvent::Modified, &[win_path], &win_root);
        assert_eq!(changes.len(), 1);
        assert_eq!(changes[0].rel_path, "docs/x.md");
    }

    // ── is_recent_self_write / prune_expired ─────────────────────────────

    #[test]
    fn 記録直後の同一パスは自己書き込みとして抑制する() {
        let base = Instant::now();
        let window = Duration::from_millis(500);
        let recent = vec![(join("a.md"), base)];
        assert!(is_recent_self_write(
            &join("a.md"),
            &recent,
            base + Duration::from_millis(100),
            window
        ));
    }

    #[test]
    fn 窓を過ぎた記録は抑制しない() {
        let base = Instant::now();
        let window = Duration::from_millis(500);
        let recent = vec![(join("a.md"), base)];
        assert!(!is_recent_self_write(
            &join("a.md"),
            &recent,
            base + Duration::from_millis(600),
            window
        ));
    }

    #[test]
    fn 別パスは自己書き込みとして抑制しない() {
        let base = Instant::now();
        let window = Duration::from_millis(500);
        let recent = vec![(join("a.md"), base)];
        assert!(!is_recent_self_write(
            &join("b.md"),
            &recent,
            base + Duration::from_millis(100),
            window
        ));
    }

    #[test]
    fn map_changes_dedupは同一relpathkindの重複を畳む() {
        let changes = vec![
            FileChange {
                rel_path: "a.md".into(),
                kind: FileChangeKind::Modified,
            },
            FileChange {
                rel_path: "a.md".into(),
                kind: FileChangeKind::Modified,
            },
            FileChange {
                rel_path: "b.tsv".into(),
                kind: FileChangeKind::Rescan,
            },
        ];
        let deduped = map_changes_dedup(changes);
        assert_eq!(
            deduped,
            vec![
                FileChange {
                    rel_path: "a.md".into(),
                    kind: FileChangeKind::Modified,
                },
                FileChange {
                    rel_path: "b.tsv".into(),
                    kind: FileChangeKind::Rescan,
                },
            ]
        );
    }

    #[test]
    fn map_changes_dedupは同一パスでも種別が違えば残す() {
        let changes = vec![
            FileChange {
                rel_path: "a.md".into(),
                kind: FileChangeKind::Rescan,
            },
            FileChange {
                rel_path: "a.md".into(),
                kind: FileChangeKind::Modified,
            },
        ];
        let deduped = map_changes_dedup(changes);
        assert_eq!(deduped.len(), 2, "modified と rescan は別種として残る");
    }

    #[test]
    fn prune_expiredは窓を過ぎた記録だけ捨てる() {
        let base = Instant::now();
        let window = Duration::from_millis(500);
        let mut recent = vec![
            (join("old.md"), base),
            (join("fresh.md"), base + Duration::from_millis(400)),
        ];
        // base から 600ms 後：old(600ms経過)は破棄、fresh(200ms経過)は残す。
        prune_expired(&mut recent, base + Duration::from_millis(600), window);
        let rels: Vec<_> = recent.iter().map(|(p, _)| p.clone()).collect();
        assert_eq!(rels, vec![join("fresh.md")]);
    }
}
