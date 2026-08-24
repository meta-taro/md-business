//! フォルダごとの同意の純ロジック（ファイル / Tauri 非依存）。
//!
//! ここが答えるのは「この PC で、このフォルダについて、人が 1 回押したか」だけ。
//! プロジェクトが何を求めているか（設定ファイルの宣言）は見ない。宣言はプロジェクト側が
//! 中身を自由に書けるので、それを条件にすると許可を自分で書けることになる。
//! この一覧はアプリの設定領域にあり、プロジェクトからは書けない。
//!
//! 実際の読み書きと正規化の入口は [`crate::trust`] にある。

use std::path::{Component, Path, MAIN_SEPARATOR};

use serde::{Deserialize, Serialize};

/// 保存する形の版。読めない版は空として扱う。
pub const TRUST_STORE_VERSION: u32 = 1;

/// 同意を与えたフォルダ 1 件。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TrustedProject {
    /// 引き当てに使う鍵。
    pub key: String,
    /// 人へ見せる元の綴り。
    pub path: String,
    /// 押した時刻（Unix 秒）。
    pub granted_at: i64,
}

/// 同意の一覧。
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct TrustStore {
    pub projects: Vec<TrustedProject>,
}

/// 大文字小文字の違いを無視するか。
///
/// Windows は `C:\Work` と `c:\work` を同じフォルダとして開くので、揃えないと
/// 同じ場所を綴り違いで何度も聞くことになる。畳むのは ASCII だけにする。
/// Unicode 全体で畳むと、言語によっては別の文字どうしが一致してしまい、
/// 「許した覚えの無いフォルダが通る」側へ倒れる。畳み残しは聞き直しになるだけ。
#[cfg(windows)]
fn fold(text: &str) -> String {
    text.to_ascii_lowercase()
}

/// 大文字小文字が違えば別のフォルダ。実際に別のフォルダとして並べて作れる。
#[cfg(not(windows))]
fn fold(text: &str) -> String {
    text.to_owned()
}

#[cfg(windows)]
fn prefix_text(prefix: std::path::PrefixComponent<'_>) -> String {
    use std::path::Prefix;

    // `canonicalize` が返す `\\?\C:\...` と、人が渡す `C:\...` は同じ場所を指す。
    // 綴りのまま鍵にすると、どちらの経路で来たかで同意が別物になる。
    match prefix.kind() {
        Prefix::Disk(drive) | Prefix::VerbatimDisk(drive) => {
            format!("{}:", (drive as char).to_ascii_lowercase())
        }
        Prefix::UNC(server, share) | Prefix::VerbatimUNC(server, share) => format!(
            r"\\{}\{}",
            fold(&server.to_string_lossy()),
            fold(&share.to_string_lossy())
        ),
        Prefix::Verbatim(name) => format!(r"\\?\{}", fold(&name.to_string_lossy())),
        Prefix::DeviceNS(name) => format!(r"\\.\{}", fold(&name.to_string_lossy())),
    }
}

/// フォルダを引き当てる鍵を作る。指し先が定まらない綴りには作らない。
///
/// 綴りの違い（末尾の区切り・`\\?\` 付き・Windows での大文字小文字）を吸収する
/// 一方で、**別のフォルダが同じ鍵になることは無い**。ここで畳みすぎると、
/// 許した覚えの無い場所が同意済みとして通る。
pub fn project_key(path: &Path) -> Option<String> {
    // 相対パスは、呼ぶ側の現在位置しだいで別の場所を指す。同意の相手が定まらない。
    if !path.is_absolute() {
        return None;
    }

    let mut key = String::new();
    for component in path.components() {
        match component {
            #[cfg(windows)]
            Component::Prefix(prefix) => key.push_str(&prefix_text(prefix)),
            #[cfg(not(windows))]
            Component::Prefix(_) => return None,
            Component::RootDir => key.push(MAIN_SEPARATOR),
            Component::CurDir => {}
            // `work/shop/../other` を畳んで通すと、許した覚えの無い場所が
            // 同意済みとして出てくる。畳まずに断る。
            Component::ParentDir => return None,
            Component::Normal(name) => {
                if !key.ends_with(MAIN_SEPARATOR) {
                    key.push(MAIN_SEPARATOR);
                }
                key.push_str(&fold(&name.to_string_lossy()));
            }
        }
    }
    Some(key)
}

/// 同意済みか。
///
/// 鍵が丸ごと一致したときだけ。前方一致にはしない。親フォルダの同意が下へ
/// 広がると、後から中へ置かれたものまで最初の 1 回で許したことになる。
pub fn is_trusted(store: &TrustStore, key: &str) -> bool {
    store.projects.iter().any(|project| project.key == key)
}

/// 同意を足す。既にあれば何もしない（押した時刻は最初の判断のもの）。
pub fn grant(store: &mut TrustStore, key: &str, path: &str, granted_at: i64) {
    if is_trusted(store, key) {
        return;
    }
    store.projects.push(TrustedProject {
        key: key.to_owned(),
        path: path.to_owned(),
        granted_at,
    });
}

/// 同意を外す。外すものがあったかを返す。
pub fn revoke(store: &mut TrustStore, key: &str) -> bool {
    let before = store.projects.len();
    store.projects.retain(|project| project.key != key);
    store.projects.len() != before
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StoredProject<'a> {
    key: &'a str,
    path: &'a str,
    granted_at: i64,
}

#[derive(Serialize)]
struct StoredFile<'a> {
    version: u32,
    projects: Vec<StoredProject<'a>>,
}

/// 読み取り用。欠けた項目を型で弾かず、1 件ずつ見て落とせるようにしてある。
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReadProject {
    key: Option<String>,
    path: Option<String>,
    granted_at: Option<i64>,
}

#[derive(Deserialize)]
struct ReadFile {
    version: Option<u32>,
    projects: Option<Vec<ReadProject>>,
}

/// 保存してある一覧を読む。
///
/// 読めなければ空を返す。空は「まだ誰も許していない」＝もう一度聞くだけで済む。
/// 読めたことにして先へ進めると、壊れたファイルが同意の代わりになる。
pub fn parse_store(text: &str) -> TrustStore {
    let Ok(file) = serde_json::from_str::<ReadFile>(text) else {
        return TrustStore::default();
    };
    // 知らない版は、同じ綴りが同じ意味とは限らない。読めたふりをしない。
    if file.version != Some(TRUST_STORE_VERSION) {
        return TrustStore::default();
    }
    let projects = file
        .projects
        .unwrap_or_default()
        .into_iter()
        .filter_map(|project| {
            // 欠けている 1 件だけを落とす。1 件の壊れで全部の同意が消えると、
            // 人は身に覚えのないまま全プロジェクトを押し直すことになる。
            let key = project.key.filter(|key| !key.is_empty())?;
            Some(TrustedProject {
                key,
                path: project.path?,
                granted_at: project.granted_at?,
            })
        })
        .collect();
    TrustStore { projects }
}

/// 保存する形にする。
pub fn serialize_store(store: &TrustStore) -> String {
    let file = StoredFile {
        version: TRUST_STORE_VERSION,
        projects: store
            .projects
            .iter()
            .map(|project| StoredProject {
                key: &project.key,
                path: &project.path,
                granted_at: project.granted_at,
            })
            .collect(),
    };
    serde_json::to_string_pretty(&file).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    /// 走らせている OS でそのまま通じる絶対パスを組む。
    fn abs(parts: &[&str]) -> String {
        let mut path = PathBuf::from(if cfg!(windows) { r"C:\" } else { "/" });
        for part in parts {
            path.push(part);
        }
        path.to_string_lossy().into_owned()
    }

    fn key_of(path: &str) -> Option<String> {
        project_key(&PathBuf::from(path))
    }

    // ---- 鍵の作り方 ----

    #[test]
    fn 同じフォルダは末尾の区切りが違っても同じ鍵になる() {
        let plain = key_of(&abs(&["work", "shop"])).unwrap();
        let trailing = key_of(&format!("{}{}", abs(&["work", "shop"]), MAIN_SEPARATOR)).unwrap();
        assert_eq!(plain, trailing);
    }

    #[test]
    fn 別のフォルダは別の鍵になる() {
        assert_ne!(
            key_of(&abs(&["work", "shop"])),
            key_of(&abs(&["work", "other"]))
        );
    }

    #[test]
    fn 名前の先頭が重なるだけのフォルダを同じ扱いにしない() {
        // `work/shop` を許したときに `work/shopping` まで通ると、
        // 隣に作られたフォルダが黙って実行できることになる。
        assert_ne!(
            key_of(&abs(&["work", "shop"])),
            key_of(&abs(&["work", "shopping"]))
        );
    }

    #[test]
    fn 相対パスには鍵を作らない() {
        // どこを指すかが呼ぶ側の現在位置で変わる。同意の相手が定まらない。
        assert_eq!(key_of("shop"), None);
        assert_eq!(key_of("./shop"), None);
    }

    #[test]
    fn 上へ戻る綴りが混ざったパスには鍵を作らない() {
        // 畳んで通すと、許した覚えの無い場所が同意済みとして出てくる。
        let sneaky = format!(
            "{}{}..{}other",
            abs(&["work", "shop"]),
            MAIN_SEPARATOR,
            MAIN_SEPARATOR
        );
        assert_eq!(key_of(&sneaky), None);
    }

    #[cfg(windows)]
    #[test]
    fn 大文字小文字の違いで聞き直さない() {
        assert_eq!(key_of(r"C:\work\shop"), key_of(r"c:\WORK\Shop"));
    }

    #[cfg(not(windows))]
    #[test]
    fn 大文字小文字が違えば別のフォルダ() {
        assert_ne!(key_of("/work/shop"), key_of("/work/Shop"));
    }

    #[cfg(windows)]
    #[test]
    fn 長いパス表記を素の綴りと同じ鍵にする() {
        // `canonicalize` は `\\?\C:\...` を返す。人が渡す綴りと食い違うと聞き直しになる。
        assert_eq!(key_of(r"\\?\C:\work\shop"), key_of(r"C:\work\shop"));
    }

    // ---- 引き当て ----

    #[test]
    fn 許していないフォルダは通らない() {
        let store = TrustStore::default();
        assert!(!is_trusted(&store, "k"));
    }

    #[test]
    fn 許したフォルダは通る() {
        let mut store = TrustStore::default();
        grant(&mut store, "k", "somewhere", 1_700_000_000);
        assert!(is_trusted(&store, "k"));
    }

    #[test]
    fn 親を許しても中のフォルダは通らない() {
        // 開いたフォルダそのものだけを見る。親の同意が下へ広がると、
        // 後から中へ置かれたものまで最初の 1 回で許したことになる。
        let mut store = TrustStore::default();
        let parent_path = abs(&["work"]);
        let parent = key_of(&parent_path).unwrap();
        grant(&mut store, &parent, &parent_path, 1);
        let child = key_of(&abs(&["work", "shop"])).unwrap();
        assert!(!is_trusted(&store, &child));
    }

    #[test]
    fn 同じフォルダを二度許しても一件のまま最初の時刻が残る() {
        // 二度目は人が押していない。押した時刻は最初の判断のもの。
        let mut store = TrustStore::default();
        grant(&mut store, "k", "somewhere", 100);
        grant(&mut store, "k", "somewhere", 200);
        assert_eq!(store.projects.len(), 1);
        assert_eq!(store.projects[0].granted_at, 100);
    }

    #[test]
    fn 取り消すと通らなくなる() {
        let mut store = TrustStore::default();
        grant(&mut store, "k", "somewhere", 1);
        assert!(revoke(&mut store, "k"));
        assert!(!is_trusted(&store, "k"));
    }

    #[test]
    fn 無いものを取り消しても壊れない() {
        let mut store = TrustStore::default();
        assert!(!revoke(&mut store, "k"));
    }

    // ---- 保存した形の読み書き ----

    #[test]
    fn 書いたものを読み戻せる() {
        let mut store = TrustStore::default();
        grant(&mut store, "k", &abs(&["work", "shop"]), 1_700_000_000);
        assert_eq!(parse_store(&serialize_store(&store)), store);
    }

    #[test]
    fn 読めない中身は空として扱う() {
        // 壊れていたら「まだ誰も許していない」に落ちる。もう一度聞くだけで済む。
        assert_eq!(parse_store("{"), TrustStore::default());
        assert_eq!(parse_store(""), TrustStore::default());
        assert_eq!(parse_store("[]"), TrustStore::default());
    }

    #[test]
    fn 知らない版は空として扱う() {
        // 新しいアプリが書いた形は、意味が同じとは限らない。読めたふりをしない。
        let text = r#"{"version":99,"projects":[{"key":"k","path":"p","grantedAt":1}]}"#;
        assert_eq!(parse_store(text), TrustStore::default());
    }

    #[test]
    fn 知らない項目が増えていても読める() {
        let text = r#"{"version":1,"note":"x","projects":[{"key":"k","path":"p","grantedAt":1,"extra":true}]}"#;
        assert_eq!(parse_store(text).projects.len(), 1);
    }

    #[test]
    fn 欠けた一件だけを落として残りは読む() {
        let text =
            r#"{"version":1,"projects":[{"path":"p","grantedAt":1},{"key":"k","path":"p","grantedAt":1}]}"#;
        let store = parse_store(text);
        assert_eq!(store.projects.len(), 1);
        assert_eq!(store.projects[0].key, "k");
    }
}
