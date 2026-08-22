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
        "js" => "text/javascript; charset=utf-8",
        "json" => "application/json; charset=utf-8",
        "svg" => "image/svg+xml",
        "txt" | "md" => "text/plain; charset=utf-8",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        _ => "application/octet-stream",
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
pub fn inject_reload(html: &str, token: &str) -> String {
    let script = format!("<script>{}</script>", reload_script(token));
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
    let reason = match status {
        200 => "OK",
        400 => "Bad Request",
        404 => "Not Found",
        _ => "Error",
    };
    // 手元で見るためのものなので、覚えられると入れ替えが効かなくなる。
    // 別の出どころから読ませる設定（CORS）は付けない。
    let head = format!(
        "HTTP/1.1 {status} {reason}\r\n\
Content-Type: {content_type}\r\n\
Content-Length: {}\r\n\
Cache-Control: no-store\r\n\
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
    fn 知らない拡張子は種類を決めつけない() {
        assert_eq!(content_type("a.bin"), "application/octet-stream");
    }

    #[test]
    fn 本文の終わりに入れ替えの仕掛けを入れる() {
        let out = inject_reload("<html><body><h1>a</h1></body></html>", TOKEN);
        assert!(out.contains("<script>"));
        assert!(out.contains(TOKEN));
        // 本文の外に出すと、閉じたあとの中身として無視される場合がある。
        assert!(out.ends_with("</body></html>"));
    }

    #[test]
    fn 本文の終わりが無ければ末尾に足す() {
        let out = inject_reload("<h1>a</h1>", TOKEN);
        assert!(out.starts_with("<h1>a</h1>"));
        assert!(out.contains("<script>"));
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
}
