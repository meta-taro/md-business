//! エクスプローラの「プログラムから開く」に、このアプリを候補として載せる（Windows）。
//!
//! 起動のたびに、自分の実行ファイルの場所で利用者の領域（HKCU）へ書く。インストーラに
//! 任せないのは、MSI と NSIS の 2 種類を配っていて、どちらから入れても同じに載せたいため。
//! 実行ファイルの場所が変わっても（入れ直し・別の場所への導入）、次の起動で書き直される。
//!
//! **既定のアプリは奪わない。** `.md` の既定値（どのアプリで開くか）には書かず、候補の
//! 一覧（`OpenWithProgids` / `SupportedTypes`）へ名前を足すだけにする。利用者が既に
//! 別のエディタで開いているなら、それはそのまま残る。既定にするかは利用者が選ぶ。

/// 候補に載せる種類。画面が書き込みまで扱える業務文書だけにする。
///
/// JSON / XML は読むだけで書き戻す口が無いので、そこへ誘うと「開けたのに直せない」になる。
pub const EXTS: [&str; 2] = ["md", "tsv"];

/// 候補の一覧に出す名前。
const APP_NAME: &str = "md-business";

/// 1 件の書き込み。`HKCU\Software\Classes\` から下のキー、値の名前（`""` は既定値）、値。
#[derive(Debug, PartialEq, Eq)]
pub struct Entry {
    pub key: String,
    pub name: String,
    pub value: String,
}

fn entry(key: impl Into<String>, name: impl Into<String>, value: impl Into<String>) -> Entry {
    Entry { key: key.into(), name: name.into(), value: value.into() }
}

/// 種類ごとの ProgID。アプリ名を前に付け、他のアプリの名前と重ならないようにする。
fn prog_id(ext: &str) -> String {
    format!("mdbusiness.{ext}")
}

/// 書き込む中身を並べる。
///
/// `exe_path` は実行ファイルの絶対パス、`exe_name` はそのファイル名。
/// パスは空白を含みうる（`Program Files`）ので、実行ファイルも渡すファイルも引用符で囲む。
pub fn entries(exe_path: &str, exe_name: &str) -> Vec<Entry> {
    let command = format!("\"{exe_path}\" \"%1\"");
    let icon = format!("\"{exe_path}\",0");
    let app_key = format!("Applications\\{exe_name}");

    let mut out = Vec::new();
    for ext in EXTS {
        let id = prog_id(ext);
        out.push(entry(&id, "", format!("{APP_NAME} ({ext})")));
        out.push(entry(format!("{id}\\DefaultIcon"), "", &icon));
        out.push(entry(format!("{id}\\shell\\open\\command"), "", &command));
        // 値の名前が ProgID で、中身は空。ここに並んだものが「プログラムから開く」の候補になる。
        out.push(entry(format!(".{ext}\\OpenWithProgids"), id, ""));
    }
    // 「別のアプリを選択」の一覧は、実行ファイル単位の登録も見る。表示名もここで決まる。
    out.push(entry(&app_key, "FriendlyAppName", APP_NAME));
    out.push(entry(format!("{app_key}\\shell\\open\\command"), "", &command));
    for ext in EXTS {
        out.push(entry(format!("{app_key}\\SupportedTypes"), format!(".{ext}"), ""));
    }
    out
}

/// 自分の実行ファイルで登録する。失敗しても起動は続ける（候補に出ないだけで、他は困らない）。
///
/// 開発ビルドでは書かない。実行ファイルの名前が配布物と同じなので、書くと入れてある方の
/// 登録を開発ビルドが上書きし、候補から開いたときに開発ビルド（単体では画面が出ない）が立ち上がる。
#[cfg(windows)]
pub fn register() {
    if cfg!(debug_assertions) {
        return;
    }
    let Ok(exe) = std::env::current_exe() else {
        return;
    };
    let Some(name) = exe.file_name().map(|n| n.to_string_lossy().into_owned()) else {
        return;
    };
    let path = exe.to_string_lossy().into_owned();
    let mut wrote = false;
    for e in entries(&path, &name) {
        wrote |= win::write(&e).is_ok();
    }
    if wrote {
        win::notify_changed();
    }
}

#[cfg(windows)]
mod win {
    use windows::core::HSTRING;
    use windows::Win32::System::Registry::{
        RegCloseKey, RegCreateKeyW, RegSetValueExW, HKEY, HKEY_CURRENT_USER, REG_SZ,
    };
    use windows::Win32::UI::Shell::{SHChangeNotify, SHCNE_ASSOCCHANGED, SHCNF_IDLIST};

    use super::Entry;

    /// 1 件書く。キーが無ければ作る。
    pub fn write(e: &Entry) -> Result<(), ()> {
        let sub = HSTRING::from(format!("Software\\Classes\\{}", e.key));
        let mut key = HKEY::default();
        // SAFETY: 引数はすべてこの関数の中で生きている値を指す。開いたキーは下で必ず閉じる。
        let opened = unsafe { RegCreateKeyW(HKEY_CURRENT_USER, &sub, &mut key) };
        if opened.is_err() {
            return Err(());
        }
        // REG_SZ は終端の NUL まで含めて渡す。
        let data: Vec<u8> = e
            .value
            .encode_utf16()
            .chain(std::iter::once(0))
            .flat_map(u16::to_le_bytes)
            .collect();
        let name = HSTRING::from(e.name.as_str());
        // SAFETY: key は上で開けたもの。data はこの呼び出しの間だけ借りる。
        let set = unsafe { RegSetValueExW(key, &name, None, REG_SZ, Some(&data)) };
        // SAFETY: 開けたキーを 1 回だけ閉じる。
        let _ = unsafe { RegCloseKey(key) };
        if set.is_err() {
            return Err(());
        }
        Ok(())
    }

    /// 関連付けが変わったことをエクスプローラへ知らせる。知らせないと、次にサインインし直すまで
    /// 古い一覧のまま出ることがある。
    pub fn notify_changed() {
        // SAFETY: 付けて渡すものが無い通知（項目は両方 None）。
        unsafe { SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_IDLIST, None, None) };
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const EXE: &str = r"C:\Program Files\md-business\md-business-desktop.exe";
    const NAME: &str = "md-business-desktop.exe";

    #[test]
    fn 既定のアプリは書き換えない() {
        // `.md` の既定値に書くと、既に選んでいるエディタから既定を奪う。
        for e in entries(EXE, NAME) {
            let is_ext_root = e.key.starts_with('.') && !e.key.contains('\\');
            assert!(!(is_ext_root && e.name.is_empty()), "既定値に書いている: {e:?}");
        }
    }

    #[test]
    fn mdとtsvの候補に名前を足す() {
        let all = entries(EXE, NAME);
        for ext in ["md", "tsv"] {
            let want = entry(format!(".{ext}\\OpenWithProgids"), format!("mdbusiness.{ext}"), "");
            assert!(all.contains(&want), ".{ext} の候補が無い");
        }
    }

    #[test]
    fn 空白を含むパスでも引用符で囲んで渡す() {
        let all = entries(EXE, NAME);
        let open = all
            .iter()
            .find(|e| e.key == "mdbusiness.md\\shell\\open\\command")
            .expect("開く命令が無い");
        assert_eq!(open.value, format!("\"{EXE}\" \"%1\""));
    }

    #[test]
    fn 実行ファイル単位の登録にも同じ種類を載せる() {
        let all = entries(EXE, NAME);
        let app = format!("Applications\\{NAME}");
        assert!(all.contains(&entry(&app, "FriendlyAppName", "md-business")));
        for ext in ["md", "tsv"] {
            assert!(all.contains(&entry(format!("{app}\\SupportedTypes"), format!(".{ext}"), "")));
        }
    }

    #[test]
    fn 読むだけの種類は載せない() {
        for e in entries(EXE, NAME) {
            assert!(!e.key.contains("json") && !e.name.contains("json"), "{e:?}");
            assert!(!e.key.contains("xml") && !e.name.contains("xml"), "{e:?}");
        }
    }
}
