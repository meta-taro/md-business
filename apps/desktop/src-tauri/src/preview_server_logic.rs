//! ブラウザ表示用サーバーの純ロジック（TCP / Tauri 非依存）。
//!
//! 受け取った要求行をどう読むか、どのページを返すか、応答をどう組むかだけをここに置く。
//! 実際に待ち受ける配線は [`crate::preview_server`] にある。
//!
//! 返す中身は**アプリが組み立て済みのページだけ**で、要求されたパスからファイルを
//! 探しには行かない。探しに行かなければ、`..` を並べられても辿る先が無い。

/// 要求行（`GET /path HTTP/1.1`）から読み取るもの。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RequestLine {
    pub method: String,
    pub target: String,
}

/// 要求の行き先。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Route {
    /// 組み立て済みのページ（このキーで引く）。
    Page(String),
    /// 中身が入れ替わったかの問い合わせ。
    Version,
    /// 該当なし。合鍵違いもここに落とす（合鍵の有無を返り分けない）。
    NotFound,
}

/// 中身が入れ替わったかを問い合わせる先。ページから見て絶対パスで指す
/// （下の階層のページからでも同じ先に届くように）。
pub const VERSION_PATH: &str = "__version";

/// 一覧ページ。合鍵だけで来たときはこれを返す。
const INDEX: &str = "index.html";

/// 要求行を「方法」と「行き先」に分ける。形になっていなければ読まない。
pub fn parse_request_line(line: &str) -> Option<RequestLine> {
    let mut parts = line.split_whitespace();
    let method = parts.next()?;
    let target = parts.next()?;
    Some(RequestLine {
        method: method.to_string(),
        target: target.to_string(),
    })
}

/// 行き先を、引くべきページのキーに直す。
///
/// 合鍵が合わないものは、理由を分けずにまとめて [`Route::NotFound`] にする。
/// 「合鍵は合っているがページが無い」と返り分けると、合鍵の当たりが外から分かってしまう。
pub fn route(token: &str, target: &str) -> Route {
    if token.is_empty() {
        return Route::NotFound;
    }
    // 問い合わせ文字列と見出し位置はページのキーに含めない。
    let path = target.split(['?', '#']).next().unwrap_or("");
    let Some(rest) = path.strip_prefix('/') else {
        return Route::NotFound;
    };
    if rest.len() < token.len() || !token_matches(&rest.as_bytes()[..token.len()], token.as_bytes())
    {
        return Route::NotFound;
    }
    // 合鍵は照合済み＝そこまでは合鍵と同じバイト列なので、切り口は文字の途中に来ない。
    // それでも `get` で取るのは、合鍵に多バイト文字が混じった場合に落とさないため。
    let Some(rest) = rest.get(token.len()..) else {
        return Route::NotFound;
    };
    let rest = match rest {
        "" => "",
        other => match other.strip_prefix('/') {
            Some(after) => after,
            // 合鍵で始まってはいるが、区切りの位置が違う（別の合鍵の頭が一致しただけ）。
            None => return Route::NotFound,
        },
    };

    let key = decode_percent(rest);
    if key.is_empty() {
        return Route::Page(INDEX.to_string());
    }
    if key == VERSION_PATH {
        return Route::Version;
    }
    Route::Page(key)
}

/// 合鍵を、合っている文字数だけ長く見る形にならないように照合する。
///
/// `==` や `strip_prefix` は違ったバイトを見つけた時点で戻る。返るまでの時間が
/// 合っている文字数で変わるので、1 文字ずつ当てていけば総当たりより桁違いに少ない試行で
/// 合鍵が割れる。待ち受けているのは localhost だけだが、同じ機械で動いている別のものからは
/// 叩ける（そこを塞ぐために合鍵を置いている）。
///
/// 長さが違えばそこで戻る。合鍵の長さは秘密ではない（出した URL に見えている）。
fn token_matches(head: &[u8], token: &[u8]) -> bool {
    if head.len() != token.len() {
        return false;
    }
    let mut diff = 0u8;
    for (a, b) in head.iter().zip(token.iter()) {
        diff |= a ^ b;
    }
    diff == 0
}

/// 拡張子から中身の種類を決める。表に無いものは決めつけない。
pub fn content_type(path: &str) -> &'static str {
    let ext = path.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
    match ext.as_str() {
        "html" | "htm" => "text/html; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "json" | "webmanifest" => "application/json; charset=utf-8",
        "xml" => "application/xml; charset=utf-8",
        "svg" => "image/svg+xml",
        "txt" | "md" => "text/plain; charset=utf-8",
        "tsv" => "text/tab-separated-values; charset=utf-8",
        "csv" => "text/csv; charset=utf-8",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "ico" => "image/vnd.microsoft.icon",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "ttf" => "font/ttf",
        "otf" => "font/otf",
        "wasm" => "application/wasm",
        "pdf" => "application/pdf",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        _ => "application/octet-stream",
    }
}

/// ページを出すときに、その中の script をどこまで動かすか。
///
/// 動かしてよいかを決めるのは `md-business.yml` の宣言と、この PC での同意の両方だが、
/// ここが見るのはその結果だけで、**宣言そのものは読まない**。読み手を 2 つ持つと、
/// 同じファイルに 2 つの答えが出たときに「動かす」と読んだ側が勝つ。
#[derive(Debug, Clone, Default, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SitePolicy {
    /// 利用者が書いた script を動かすか。既定は動かさない。
    pub scripts: bool,
    /// プロジェクト自身のファイル以外に、script を取り寄せてよい置き先。
    #[serde(default)]
    pub script_origins: Vec<String>,
}

/// 宣言と同意を突き合わせて、実際に何を動かすかを決める。
///
/// 宣言（`md-business.yml`）はプロジェクトの中にあるので、中身を書いた側が自由に書ける。
/// 止めているのは常に同意——この PC で人が 1 回押したかどうか——のほうで、
/// ここはその突き合わせを 1 か所に集めている。
///
/// 同意が無いまま script を求められたら、動かさない形へ落とさずに断る。
/// 黙って落とすと、書いた本人には「宣言が読まれていない」と見え、
/// 宣言のほうを書き換えて回ることになる。
pub fn resolve_policy(declared: SitePolicy, trusted: bool) -> Result<SitePolicy, String> {
    if !declared.scripts {
        return Ok(SitePolicy::default());
    }
    if !trusted {
        return Err("このフォルダはまだ許可されていません。JavaScript を動かすには、アプリでこのフォルダを 1 回許可してください。"
            .to_string());
    }
    Ok(declared)
}

/// 手元を指しているか。`http://` を通すのはここだけ。
fn is_local_host(host: &str) -> bool {
    if let Some(rest) = host.strip_prefix('[') {
        // IPv6 は `[::1]:8080` の形で来る。括弧の中だけを見る。
        return rest.split_once(']').is_some_and(|(inner, _)| inner == "::1");
    }
    let name = host.split(':').next().unwrap_or("");
    name == "localhost" || name == "127.0.0.1"
}

/// 置き先として並べてよいものだけを通す。
///
/// 宣言は Git に乗る＝プロジェクト側が自由に書ける。`*` や `https:` のような
/// 「どこでも」を組み立ててしまうと、宣言を 1 行足すだけで外のコードが動くようになる。
/// 引用符・空白・`;` は CSP の区切りなので、混ざったものはそこで別の指示に化ける。
fn usable_origin(origin: &str) -> bool {
    if origin.contains(['*', '\'', '"', ' ', '\t', ';', ',']) {
        return false;
    }
    let Some(host) = origin
        .strip_prefix("https://")
        .or_else(|| origin.strip_prefix("http://"))
    else {
        return false;
    };
    // 置き先は scheme と host だけ。道筋まで書かれていても、ブラウザが見るのは
    // 置き先ぜんぶなので、書いてあるより広く許すことになる。
    if host.is_empty() || host.contains('/') {
        return false;
    }
    // 平文の経路は手元に限る。途中で差し替えられる先から script を引かない。
    !origin.starts_with("http://") || is_local_host(host)
}

/// ページに付ける Content-Security-Policy。
///
/// 返すのはアプリが組み立てたページだけだが、その中身には利用者や AI が書いた HTML が
/// そのまま入る。ここで閉じておかないと、本文に script を 1 行書くだけで、
/// 同じ待ち受けの中を読める。
///
/// 業務文書のページで動く script は、**差し込んだ入れ替えの仕掛け 1 つに限る**。
/// 印（nonce）が付いたものだけを通すので、本文に書かれた script は場所を問わず動かない。
/// web モードは利用者が script を書くところなので、プロジェクト自身の script を通す。
/// 同意はプロジェクトへ与えられているから、別ファイルか本文の中かは問わない。
pub fn content_security_policy(policy: &SitePolicy, nonce: &str) -> String {
    let script_src = if policy.scripts {
        let mut sources = vec!["'self'".to_string(), "'unsafe-inline'".to_string()];
        sources.extend(
            policy
                .script_origins
                .iter()
                .filter(|origin| usable_origin(origin))
                .cloned(),
        );
        sources.join(" ")
    } else {
        format!("'nonce-{nonce}'")
    };
    [
        "default-src 'self'".to_string(),
        format!("script-src {script_src}"),
        // 見た目は本文に直に書かれることがある（表の桁揃え・図の色）。ここを閉じると
        // 業務文書の見え方が崩れるが、閉じないことで増える危険は script ほどではない。
        "style-src 'self' 'unsafe-inline'".to_string(),
        "img-src 'self' data:".to_string(),
        "font-src 'self' data:".to_string(),
        "connect-src 'self'".to_string(),
        // 差し込む先を持たない＝古い仕掛けで囲いを抜けられない。
        "object-src 'none'".to_string(),
        // 相対の解決先を書き換えられると、`'self'` が指す先ごと動く。
        "base-uri 'self'".to_string(),
        format!("frame-ancestors {}", frame_ancestors()),
        "form-action 'self'".to_string(),
    ]
    .join("; ")
}

/// 枠に入れてよい側。
///
/// プレビューの枠を持っているのはアプリ自身なので、そこだけを並べる。閉じ切ると
/// アプリの中では何も出せず、ブラウザで開くまで中身を確かめられない。
/// アプリの置き先は動かす場所ごとに違うため、まとめて並べておく。
///
/// 開発中はアプリ自身が手元の待ち受けから読み込まれるので、その分を足す
/// （`tauri.conf.json` の `devUrl` と同じ番号）。
fn frame_ancestors() -> String {
    let app = "'self' tauri://localhost http://tauri.localhost";
    if cfg!(debug_assertions) {
        format!("{app} http://localhost:1430")
    } else {
        app.to_string()
    }
}

/// 中身が入れ替わったかを見に行き、変わっていたら読み直す仕掛け。
///
/// 繋ぎっぱなしにせず、一定間隔で聞きに行く形にしている。繋ぎっぱなしだと
/// アプリを閉じるときに残った接続を畳む手当てが要るうえ、サーバーが消えたときに
/// ブラウザ側が待ったままになる。聞きに行く形なら、返らなくなればそこで止まるだけで済む。
pub fn reload_script(token: &str) -> String {
    format!(
        "(function(){{\
var seen=null;\
setInterval(function(){{\
fetch('/{token}/{VERSION_PATH}',{{cache:'no-store'}})\
.then(function(r){{return r.ok?r.text():null}})\
.then(function(v){{\
if(v===null)return;\
if(seen===null){{seen=v;return}}\
if(v!==seen)location.reload()\
}}).catch(function(){{}})\
}},1000)\
}})()"
    )
}

/// 本文の終わりに仕掛けを差し込む。閉じ札が無ければ末尾に足す。
///
/// 印（nonce）を付けるのは、業務文書のページでは印の付いた script しか動かないため。
/// 付け忘れると、入れ替わりを見に行く仕掛けそのものが止まる。
pub fn inject_reload(html: &str, token: &str, nonce: &str) -> String {
    let script = format!("<script nonce=\"{nonce}\">{}</script>", reload_script(token));
    match html.rfind("</body>") {
        Some(at) => format!("{}{}{}", &html[..at], script, &html[at..]),
        None => format!("{html}{script}"),
    }
}

/// 応答を組む。長さは文字数ではなくバイト数で数える。
pub fn http_response(status: u16, content_type: &str, body: &str) -> Vec<u8> {
    http_response_bytes(status, content_type, body.as_bytes())
}

/// 文字にならない中身（画像）を返すときの応答。組み立ては上と同じ。
pub fn http_response_bytes(status: u16, content_type: &str, body: &[u8]) -> Vec<u8> {
    build_response(status, content_type, body, None)
}

/// ページを返すときの応答。**script をどこまで動かすかを載せるのはここだけ**で、
/// 画像や文字だけの応答には効かない（読む側がその指示を見ない）。
pub fn html_response(body: &str, csp: &str) -> Vec<u8> {
    build_response(200, "text/html; charset=utf-8", body.as_bytes(), Some(csp))
}

fn build_response(status: u16, content_type: &str, body: &[u8], csp: Option<&str>) -> Vec<u8> {
    let reason = match status {
        200 => "OK",
        400 => "Bad Request",
        404 => "Not Found",
        _ => "Error",
    };
    let policy = match csp {
        Some(value) => format!("Content-Security-Policy: {value}\r\n"),
        None => String::new(),
    };
    // 手元で見るためのものなので、覚えられると入れ替えが効かなくなる。
    // 別の出どころから読ませる設定（CORS）は付けない。
    let head = format!(
        "HTTP/1.1 {status} {reason}\r\n\
Content-Type: {content_type}\r\n\
Content-Length: {}\r\n\
Cache-Control: no-store\r\n\
{policy}\
Connection: close\r\n\
\r\n",
        body.len()
    );
    let mut out = head.into_bytes();
    out.extend_from_slice(body);
    out
}

fn hex_value(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

/// percent encode を戻す。戻した結果が文字として読めなければ、元のまま扱う
/// （引く先が無いだけで済み、壊れた文字列を鍵にしなくて済む）。
pub fn decode_percent(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(high), Some(low)) = (hex_value(bytes[i + 1]), hex_value(bytes[i + 2])) {
                out.push(high * 16 + low);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8(out).unwrap_or_else(|_| value.to_string())
}

/// 選んだブラウザを、この OS で呼ぶときの名前へ直す。
///
/// 画面から届くのは選択肢の名前（`chrome` / `edge` / `default`）だけで、
/// **起動するものの名前はここの表から引く**。届いた文字列をそのまま起動すると、
/// ページを開く口が、任意のプログラムを起動する口になる。
///
/// `default` は相手を選ばない（OS の既定に任せる）。表に無いものは当てずっぽうで
/// 起動せずに断る。名前を間違えて起動すると、何も起きないのか、別のものが
/// 立ち上がったのかが画面から分からない。
pub fn browser_program(choice: &str, os: &str) -> Result<Option<&'static str>, String> {
    if choice == "default" {
        return Ok(None);
    }
    // 同じブラウザでも、呼ぶ名前は OS ごとに違う。
    let name = match (choice, os) {
        ("chrome", "windows") => "chrome",
        ("chrome", "macos") => "Google Chrome",
        ("chrome", "linux") => "google-chrome",
        ("edge", "windows") => "msedge",
        ("edge", "macos") => "Microsoft Edge",
        ("edge", "linux") => "microsoft-edge",
        ("chrome" | "edge", _) => {
            return Err(format!("{os} でのブラウザの呼び名を知りません"))
        }
        _ => return Err(format!("知らないブラウザです: {choice}")),
    };
    Ok(Some(name))
}

/// 選んだブラウザが、この PC のどこにあり得るか。**在るかどうかは見ない**（見るのは呼ぶ側）。
///
/// 在り処を当たらずに起動を頼むと、無かったときに何も起きない。押した側からは
/// 「効かないボタン」にしか見えないので、先に当たっておいて、無ければそう言えるようにする。
///
/// 環境変数が引けない置き場は候補に出さない。空の親から組み立てると、
/// 根から始まる別の場所を指してしまう。
pub fn browser_probe_paths(
    choice: &str,
    os: &str,
    env: &dyn Fn(&str) -> Option<String>,
) -> Vec<String> {
    match (choice, os) {
        ("chrome", "windows") => windows_paths(env, r"Google\Chrome\Application\chrome.exe"),
        ("edge", "windows") => windows_paths(env, r"Microsoft\Edge\Application\msedge.exe"),
        ("chrome", "macos") => mac_paths(env, "Google Chrome.app"),
        ("edge", "macos") => mac_paths(env, "Microsoft Edge.app"),
        // Linux は置き場が配布ごとに違う。PATH に載っている名前で呼ぶので、そこを当たる。
        ("chrome", "linux") => path_entries(env, "google-chrome"),
        ("edge", "linux") => path_entries(env, "microsoft-edge"),
        _ => Vec::new(),
    }
}

/// 32bit 側と利用者ごとの置き場も並べる。どれに入るかは入れ方で変わる。
fn windows_paths(env: &dyn Fn(&str) -> Option<String>, tail: &str) -> Vec<String> {
    ["ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"]
        .iter()
        .filter_map(|name| env(name))
        .map(|base| format!(r"{base}\{tail}"))
        .collect()
}

fn mac_paths(env: &dyn Fn(&str) -> Option<String>, app: &str) -> Vec<String> {
    let mut out = vec![format!("/Applications/{app}")];
    if let Some(home) = env("HOME") {
        out.push(format!("{home}/Applications/{app}"));
    }
    out
}

fn path_entries(env: &dyn Fn(&str) -> Option<String>, name: &str) -> Vec<String> {
    let Some(path) = env("PATH") else {
        return Vec::new();
    };
    path.split(':')
        .filter(|dir| !dir.is_empty())
        .map(|dir| format!("{}/{name}", dir.trim_end_matches('/')))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    const TOKEN: &str = "0123456789abcdef";

    fn head(body: &[u8]) -> String {
        String::from_utf8_lossy(body).to_string()
    }

    #[test]
    fn 要求行から方法と行き先を取る() {
        let parsed = parse_request_line("GET /a/b.html HTTP/1.1").expect("読める");
        assert_eq!(parsed.method, "GET");
        assert_eq!(parsed.target, "/a/b.html");
    }

    #[test]
    fn 形になっていない要求行は読まない() {
        assert!(parse_request_line("").is_none());
        assert!(parse_request_line("GET").is_none());
    }

    #[test]
    fn 合鍵だけなら一覧ページ() {
        assert_eq!(
            route(TOKEN, &format!("/{}/", TOKEN)),
            Route::Page("index.html".to_string())
        );
        assert_eq!(
            route(TOKEN, &format!("/{}", TOKEN)),
            Route::Page("index.html".to_string())
        );
    }

    #[test]
    fn 合鍵の後ろがページのキーになる() {
        assert_eq!(
            route(TOKEN, &format!("/{}/設計/仕様.html", TOKEN)),
            Route::Page("設計/仕様.html".to_string())
        );
    }

    // 合鍵が無ければ中身は出さない。同じ機械で動く別のプログラムから
    // 覗かれる先になってしまうため。
    #[test]
    fn 合鍵が違えば中身を返さない() {
        assert_eq!(route(TOKEN, "/index.html"), Route::NotFound);
        assert_eq!(route(TOKEN, "/ちがう合鍵/index.html"), Route::NotFound);
        assert_eq!(route(TOKEN, "/"), Route::NotFound);
    }

    // 合鍵の照合は、合っている文字数で返るまでの時間を変えない。違った位置で戻る書き方だと、
    // 1 文字ずつ当てるだけで総当たりより桁違いに少ない試行で合鍵が割れる。
    #[test]
    fn 合鍵の照合は違う位置で打ち切らない() {
        assert!(token_matches(TOKEN.as_bytes(), TOKEN.as_bytes()));
        // 末尾だけ違う / 先頭だけ違う / 長さが違う。どれも合わない。
        assert!(!token_matches(b"0123456789abcdee", TOKEN.as_bytes()));
        assert!(!token_matches(b"1123456789abcdef", TOKEN.as_bytes()));
        assert!(!token_matches(b"0123456789abcde", TOKEN.as_bytes()));
    }

    // 合鍵の直後が多バイト文字のことがある。バイトで切るなら、切り口が文字の途中に
    // 来ても落ちてはいけない。
    #[test]
    fn 合鍵の直後が多バイト文字でも落ちない() {
        assert_eq!(route(TOKEN, &format!("/{}日本語", TOKEN)), Route::NotFound);
    }

    // リンクは percent encode された形で届く（日本語のファイル名がそう変わる）。
    #[test]
    fn percent_encodeを戻してから引く() {
        assert_eq!(
            route(TOKEN, &format!("/{}/%E4%BB%95%E6%A7%98.html", TOKEN)),
            Route::Page("仕様.html".to_string())
        );
    }

    #[test]
    fn 問い合わせ文字列と見出し位置は落とす() {
        assert_eq!(
            route(TOKEN, &format!("/{}/a.html?x=1", TOKEN)),
            Route::Page("a.html".to_string())
        );
        assert_eq!(
            route(TOKEN, &format!("/{}/a.html#節", TOKEN)),
            Route::Page("a.html".to_string())
        );
    }

    // 上へ辿る指定が来ても、引く先は組み立て済みのページの一覧しかない。
    // そこに無いキーになるだけで、ファイルを探しには行かない。
    #[test]
    fn 上へ辿る指定はページのキーにしかならない() {
        assert_eq!(
            route(TOKEN, &format!("/{}/../../etc/passwd", TOKEN)),
            Route::Page("../../etc/passwd".to_string())
        );
    }

    #[test]
    fn 入れ替え確認の受け口がある() {
        assert_eq!(
            route(TOKEN, &format!("/{}/__version", TOKEN)),
            Route::Version
        );
    }

    #[test]
    fn 拡張子から種類を決める() {
        assert!(content_type("a.html").starts_with("text/html"));
        assert!(content_type("assets/spec.css").starts_with("text/css"));
        assert!(content_type("a.html").contains("utf-8"));
    }

    #[test]
    fn サイトに置くものの種類も決める() {
        assert!(content_type("app.mjs").starts_with("text/javascript"));
        assert!(content_type("data/sales.tsv").starts_with("text/tab-separated-values"));
        assert!(content_type("data/sales.csv").starts_with("text/csv"));
        assert_eq!(content_type("font/x.woff2"), "font/woff2");
        assert_eq!(content_type("favicon.ico"), "image/vnd.microsoft.icon");
        assert!(content_type("feed.xml").starts_with("application/xml"));
    }

    #[test]
    fn 知らない拡張子は種類を決めつけない() {
        assert_eq!(content_type("a.bin"), "application/octet-stream");
    }

    #[test]
    fn 本文の終わりに入れ替えの仕掛けを入れる() {
        let out = inject_reload("<html><body><h1>a</h1></body></html>", TOKEN, "abc123");
        assert!(out.contains("<script nonce=\"abc123\">"));
        assert!(out.contains(TOKEN));
        // 本文の外に出すと、閉じたあとの中身として無視される場合がある。
        assert!(out.ends_with("</body></html>"));
    }

    #[test]
    fn 本文の終わりが無ければ末尾に足す() {
        let out = inject_reload("<h1>a</h1>", TOKEN, "abc123");
        assert!(out.starts_with("<h1>a</h1>"));
        assert!(out.contains("<script nonce=\"abc123\">"));
    }

    #[test]
    fn 応答に長さと種類が入る() {
        let out = head(&http_response(200, "text/html; charset=utf-8", "あ"));
        assert!(out.starts_with("HTTP/1.1 200 "));
        assert!(out.contains("Content-Type: text/html; charset=utf-8\r\n"));
        // 長さは文字数ではなくバイト数（日本語は 1 文字 3 バイト）。
        assert!(out.contains("Content-Length: 3\r\n"));
        assert!(out.ends_with("\r\n\r\nあ"));
    }

    // 手元で見るためのものなので、覚えられて後から出されると入れ替えが効かない。
    #[test]
    fn 応答を覚えさせない() {
        let out = head(&http_response(200, "text/html", "a"));
        assert!(out.contains("Cache-Control: no-store"));
    }

    // ブラウザで開いている別のサイトから中身を読めるようにはしない。
    #[test]
    fn 別の出どころへ読ませる設定は返さない() {
        let out = head(&http_response(200, "text/html", "a")).to_ascii_lowercase();
        assert!(!out.contains("access-control-allow-origin"));
    }

    #[test]
    fn 見つからないときも応答を返す() {
        let out = head(&http_response(404, "text/plain", "not found"));
        assert!(out.starts_with("HTTP/1.1 404 "));
    }

    #[test]
    fn percent_encodeを戻す() {
        assert_eq!(decode_percent("%E4%BB%95%E6%A7%98"), "仕様");
        assert_eq!(decode_percent("a%20b"), "a b");
    }

    // 戻せない並びは、戻さずそのまま扱う（引く先が無いだけで済む）。
    #[test]
    fn 戻せない並びはそのまま残す() {
        assert_eq!(decode_percent("%zz"), "%zz");
        assert_eq!(decode_percent("%E4"), "%E4");
    }

    fn directive<'a>(csp: &'a str, name: &str) -> &'a str {
        csp.split(';')
            .map(str::trim)
            .find(|part| part == &name || part.starts_with(&format!("{} ", name)))
            .unwrap_or_else(|| panic!("{} が無い: {}", name, csp))
    }

    fn document_policy() -> SitePolicy {
        SitePolicy {
            scripts: false,
            script_origins: Vec::new(),
        }
    }

    fn web_policy(origins: &[&str]) -> SitePolicy {
        SitePolicy {
            scripts: true,
            script_origins: origins.iter().map(|o| (*o).to_string()).collect(),
        }
    }

    // 業務文書のページでは、利用者が書いた script を動かさない。動くのは入れ替えの
    // 仕掛けだけで、それは印を付けた 1 つに限る。
    #[test]
    fn 業務文書では差し込んだ仕掛けだけが動く() {
        let csp = content_security_policy(&document_policy(), "abc123");
        assert_eq!(directive(&csp, "script-src"), "script-src 'nonce-abc123'");
    }

    // web モードで動かすのはプロジェクト自身の script。同意はプロジェクトへ与えられて
    // いるので、別ファイルか本文の中かの違いは問わない。
    #[test]
    fn webモードでは自分自身のscriptが動く() {
        let csp = content_security_policy(&web_policy(&[]), "abc123");
        let script = directive(&csp, "script-src");
        assert!(script.contains("'self'"), "{}", script);
        assert!(script.contains("'unsafe-inline'"), "{}", script);
    }

    // 外から持ってくる置き先は、宣言に並べたものだけ。
    #[test]
    fn 宣言した置き先だけが並ぶ() {
        let csp = content_security_policy(&web_policy(&["https://cdn.example.com"]), "abc123");
        let script = directive(&csp, "script-src");
        assert!(script.contains("https://cdn.example.com"), "{}", script);
        assert!(!script.contains("https://other.example.com"), "{}", script);
    }

    // 「全部許す」が書けてしまうと、宣言を 1 行足すだけで外のコードが動く。
    // そう書かれていても組み立てない。
    #[test]
    fn 全部許す書き方は組み立てない() {
        let csp = content_security_policy(&web_policy(&["*", "https:", "https://*"]), "abc123");
        let script = directive(&csp, "script-src");
        assert_eq!(script, "script-src 'self' 'unsafe-inline'");
    }

    // 業務文書のページでは、宣言に置き先が並んでいても見ない。
    #[test]
    fn 業務文書では置き先を見ない() {
        let policy = SitePolicy {
            scripts: false,
            script_origins: vec!["https://cdn.example.com".to_string()],
        };
        let csp = content_security_policy(&policy, "abc123");
        assert!(!csp.contains("cdn.example.com"), "{}", csp);
    }

    // プレビューの枠を持っているのはアプリ自身。ここを閉じ切ると、アプリの中では
    // 何も出せず、ブラウザで開くまで中身を確かめられない。
    #[test]
    fn アプリの枠の中では開ける() {
        let csp = content_security_policy(&document_policy(), "abc123");
        let ancestors = directive(&csp, "frame-ancestors");
        assert!(ancestors.contains("http://tauri.localhost"), "{}", ancestors);
        assert!(ancestors.contains("tauri://localhost"), "{}", ancestors);
    }

    // 外の頁から枠に入れられない。手元の待ち受けを外から覗く道にしない。
    #[test]
    fn 外の頁からは枠に入れられない() {
        let csp = content_security_policy(&document_policy(), "abc123");
        let ancestors = directive(&csp, "frame-ancestors");
        assert!(!ancestors.contains('*'), "{}", ancestors);
        assert!(!ancestors.contains("https://"), "{}", ancestors);
    }

    // 宣言はプロジェクトの中にあり、書いた側が自由に書ける。動かしてよいと決めるのは同意のほう。
    #[test]
    fn 同意があって初めて動かす() {
        let declared = SitePolicy {
            scripts: true,
            script_origins: vec!["https://cdn.example.com".to_string()],
        };
        let allowed = resolve_policy(declared, true).expect("通る");
        assert!(allowed.scripts);
        assert_eq!(
            allowed.script_origins,
            vec!["https://cdn.example.com".to_string()]
        );
    }

    // 動かさない形へ黙って落とすと「なぜ動かないのか」が画面から消える。断る。
    #[test]
    fn 同意が無ければ立てない() {
        let declared = SitePolicy {
            scripts: true,
            script_origins: vec![],
        };
        let refused = resolve_policy(declared, false).expect_err("断る");
        assert!(refused.contains("許可"), "{}", refused);
    }

    // 業務文書はもともと何も動かさないので、同意を聞く場面ではない。
    #[test]
    fn 業務文書は同意が無くても出せる() {
        let allowed = resolve_policy(SitePolicy::default(), false).expect("通る");
        assert!(!allowed.scripts);
    }

    // 置き先は script を動かすときだけの話。動かさないなら持ち回らない。
    #[test]
    fn 業務文書では宣言された置き先を持ち回らない() {
        let declared = SitePolicy {
            scripts: false,
            script_origins: vec!["https://cdn.example.com".to_string()],
        };
        let allowed = resolve_policy(declared, true).expect("通る");
        assert!(allowed.script_origins.is_empty());
    }

    // どちらのモードでも、既定の取り寄せ先は自分自身に閉じる。
    #[test]
    fn どちらでも既定は自分自身に閉じる() {
        for policy in [document_policy(), web_policy(&["https://cdn.example.com"])] {
            let csp = content_security_policy(&policy, "abc123");
            assert_eq!(directive(&csp, "default-src"), "default-src 'self'");
            assert_eq!(directive(&csp, "object-src"), "object-src 'none'");
            assert_eq!(directive(&csp, "base-uri"), "base-uri 'self'");
        }
    }

    // 印は毎回変わる。使い回すと、次に出すページでも同じ印で紛れ込める。
    #[test]
    fn 印は与えられたものをそのまま使う() {
        let csp = content_security_policy(&document_policy(), "zzz999");
        assert!(csp.contains("'nonce-zzz999'"), "{}", csp);
    }

    // 業務文書のページでは印の付いた script しか動かない。差し込む仕掛けにも
    // 同じ印を付けないと、入れ替えの確認そのものが止まる。
    #[test]
    fn 差し込む仕掛けに印を付ける() {
        let out = inject_reload("<html><body></body></html>", TOKEN, "abc123");
        assert!(out.contains("<script nonce=\"abc123\">"), "{}", out);
    }

    // 画面から届くのは選択肢の名前だけで、起動するものの名前はこちら側の表から引く。
    // 届いた文字列をそのまま起動すると、ページを開く口が任意のプログラムを起動する口になる。
    #[test]
    fn 知らない名前では何も起動しない() {
        assert!(browser_program("firefox", "windows").is_err());
        assert!(browser_program("cmd", "windows").is_err());
        assert!(browser_program("", "windows").is_err());
    }

    // 既定は相手を選ばない（OS に任せる）。
    #[test]
    fn 既定は相手を選ばない() {
        assert_eq!(browser_program("default", "windows"), Ok(None));
        assert_eq!(browser_program("default", "macos"), Ok(None));
        assert_eq!(browser_program("default", "linux"), Ok(None));
    }

    // 同じブラウザでも、呼ぶ名前が OS ごとに違う。
    #[test]
    fn 呼ぶ名前はosごとに違う() {
        assert_eq!(browser_program("chrome", "windows"), Ok(Some("chrome")));
        assert_eq!(browser_program("edge", "windows"), Ok(Some("msedge")));
        assert_eq!(browser_program("chrome", "macos"), Ok(Some("Google Chrome")));
        assert_eq!(browser_program("edge", "macos"), Ok(Some("Microsoft Edge")));
        assert_eq!(browser_program("chrome", "linux"), Ok(Some("google-chrome")));
        assert_eq!(browser_program("edge", "linux"), Ok(Some("microsoft-edge")));
    }

    // 名前を知らない OS では、当てずっぽうで起動しない。
    #[test]
    fn 知らないosでは名指ししない() {
        assert!(browser_program("chrome", "freebsd").is_err());
        // 相手を選ばないなら OS を知らなくても困らない。
        assert_eq!(browser_program("default", "freebsd"), Ok(None));
    }

    // 置き場は OS ごとに違う。無い環境変数の分は候補に出さない
    // （空の親を持つ path を作ると、根から始まる別の場所を指す）。
    #[test]
    fn windowsでは実行ファイルの置き場を当たる() {
        let env = |name: &str| match name {
            "ProgramFiles" => Some(r"C:\Program Files".to_string()),
            "LOCALAPPDATA" => Some(r"C:\Users\me\AppData\Local".to_string()),
            _ => None,
        };
        let paths = browser_probe_paths("chrome", "windows", &env);
        assert!(
            paths.contains(&r"C:\Program Files\Google\Chrome\Application\chrome.exe".to_string()),
            "{paths:?}"
        );
        assert!(
            paths.contains(
                &r"C:\Users\me\AppData\Local\Google\Chrome\Application\chrome.exe"
                    .to_string()
            ),
            "{paths:?}"
        );
        // 32bit 側は環境変数が無いので、候補にも出ない。
        assert!(!paths.iter().any(|p| p.contains("(x86)")), "{paths:?}");

        let edge = browser_probe_paths("edge", "windows", &env);
        assert!(
            edge.contains(&r"C:\Program Files\Microsoft\Edge\Application\msedge.exe".to_string()),
            "{edge:?}"
        );
    }

    #[test]
    fn macでは_applications_を当たる() {
        let env = |name: &str| (name == "HOME").then(|| "/Users/me".to_string());
        let paths = browser_probe_paths("chrome", "macos", &env);
        assert!(paths.contains(&"/Applications/Google Chrome.app".to_string()), "{paths:?}");
        assert!(
            paths.contains(&"/Users/me/Applications/Google Chrome.app".to_string()),
            "{paths:?}"
        );
        let edge = browser_probe_paths("edge", "macos", &env);
        assert!(edge.contains(&"/Applications/Microsoft Edge.app".to_string()), "{edge:?}");
    }

    // Linux は置き場が配布ごとに違うので、PATH に載っているかで見る。
    #[test]
    fn linuxではpathの中を当たる() {
        let env = |name: &str| (name == "PATH").then(|| "/usr/bin:/usr/local/bin".to_string());
        let paths = browser_probe_paths("chrome", "linux", &env);
        assert_eq!(
            paths,
            vec![
                "/usr/bin/google-chrome".to_string(),
                "/usr/local/bin/google-chrome".to_string(),
            ]
        );
    }

    // 相手を選ばないなら、当たる先は無い（OS の既定に任せる）。
    #[test]
    fn 既定では在り処を当たらない() {
        let env = |_: &str| None;
        assert!(browser_probe_paths("default", "windows", &env).is_empty());
        assert!(browser_probe_paths("chrome", "freebsd", &env).is_empty());
    }
}
