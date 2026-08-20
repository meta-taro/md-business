//! 画像出力の「何を撮るか」だけを持つ層（OS に依らない）。
//!
//! 実際に撮るのは OS ごとに別物（Windows は WebView2 の DevTools Protocol、
//! macOS は WKWebView の takeSnapshot）で、共通化できない。共通化できるのは
//! 「寸法・倍率・形式が妥当か」「その注文を何という文字列で渡すか」までなので、
//! そこをここへ寄せて OS を問わず単体検査する。

use serde::Deserialize;

/// 出す画像の形式。
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "lowercase", tag = "type")]
pub enum ImageFormat {
    Png {
        /// 背景を抜くか。抜くと透過 PNG になる。
        #[serde(default)]
        transparent: bool,
    },
    Jpeg {
        /// 1〜100。小さいほど軽く、粗くなる。
        quality: u8,
    },
}

/// 撮る注文 1 件ぶん。
#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct ShotSpec {
    /// CSS ピクセルでの幅。実際に出る画像は これ × 倍率 になる。
    pub width: u32,
    /// CSS ピクセルでの高さ。
    pub height: u32,
    /// 倍率。OGP を 2 倍で撮る、のような指定に使う。
    pub scale: f64,
    pub format: ImageFormat,
}

/// 各辺の上限。Chromium 側の描画面の限界がこのあたりにあり、
/// これを越える注文は撮る前に断ったほうが原因が分かりやすい。
const MAX_SIDE: u32 = 16_384;
/// 倍率を掛けた後の総ピクセル数の上限（8000×8000 相当）。
/// 辺だけ見ていると 16384×16384 = 2.6 億ピクセルが通ってしまう。
const MAX_PIXELS: u64 = 64_000_000;

/// よく使う寸法の型。名前は画面と MCP の両方から同じものを指せるよう固定する。
pub fn preset_size(name: &str) -> Option<(u32, u32)> {
    match name {
        "instagram-post" => Some((1080, 1080)),
        "instagram-story" => Some((1080, 1920)),
        "x-post" => Some((1200, 675)),
        "ogp" => Some((1200, 630)),
        "full-hd" => Some((1920, 1080)),
        "web-banner" => Some((728, 90)),
        _ => None,
    }
}

/// 注文が通せるかを見る。通せない理由は利用者にそのまま出す文にする。
pub fn validate(spec: &ShotSpec) -> Result<(), String> {
    if spec.width == 0 || spec.height == 0 {
        return Err("画像の幅と高さは 1 以上で指定してください。".into());
    }
    if spec.width > MAX_SIDE || spec.height > MAX_SIDE {
        return Err(format!(
            "画像の幅と高さは {MAX_SIDE} までです（指定は {}×{}）。",
            spec.width, spec.height
        ));
    }
    if !(0.1..=4.0).contains(&spec.scale) {
        return Err(format!(
            "倍率は 0.1〜4.0 の範囲で指定してください（指定は {}）。",
            spec.scale
        ));
    }
    let pixels = (f64::from(spec.width) * spec.scale).round() as u64
        * (f64::from(spec.height) * spec.scale).round() as u64;
    if pixels > MAX_PIXELS {
        return Err(format!(
            "倍率を掛けた大きさが大きすぎます（{pixels} ピクセル。上限は {MAX_PIXELS}）。"
        ));
    }
    if let ImageFormat::Jpeg { quality } = spec.format {
        if !(1..=100).contains(&quality) {
            return Err(format!(
                "JPEG の品質は 1〜100 で指定してください（指定は {quality}）。"
            ));
        }
    }
    Ok(())
}

/// 撮る前に寸法と倍率を決めさせる指示（`Emulation.setDeviceMetricsOverride`）。
pub fn metrics_params(spec: &ShotSpec) -> String {
    serde_json::json!({
        "width": spec.width,
        "height": spec.height,
        "deviceScaleFactor": spec.scale,
        "mobile": false,
    })
    .to_string()
}

/// 撮る指示（`Page.captureScreenshot`）。
///
/// `captureBeyondViewport` を立てるのは、窓に収まっていない部分まで撮るため。
/// これが無いと、実際の窓の大きさに切り詰められる。
pub fn screenshot_params(spec: &ShotSpec) -> String {
    match spec.format {
        ImageFormat::Png { .. } => serde_json::json!({
            "format": "png",
            "captureBeyondViewport": true,
        }),
        ImageFormat::Jpeg { quality } => serde_json::json!({
            "format": "jpeg",
            "quality": quality,
            "captureBeyondViewport": true,
        }),
    }
    .to_string()
}

/// 背景を抜く指示（`Emulation.setDefaultBackgroundColorOverride`）。
/// 透過 PNG のときだけ送る。
pub fn transparent_background_params() -> String {
    serde_json::json!({ "color": { "r": 0, "g": 0, "b": 0, "a": 0 } }).to_string()
}

/// 背景を抜く注文かどうか。
pub fn wants_transparency(spec: &ShotSpec) -> bool {
    matches!(spec.format, ImageFormat::Png { transparent: true })
}

/// 保存するときの拡張子。
pub fn extension(format: &ImageFormat) -> &'static str {
    match format {
        ImageFormat::Png { .. } => "png",
        ImageFormat::Jpeg { .. } => "jpg",
    }
}

/// ファイル名に使えない字。Windows が禁じているものに揃える。作れる OS で作ると、
/// 受け取った側で開けないファイルができる。
const FORBIDDEN: [char; 9] = ['<', '>', ':', '"', '|', '?', '*', '/', '\\'];

/// 機器に取られていて、ファイル名にできない語（拡張子を付けても駄目）。
const DEVICE_NAMES: [&str; 22] = [
    "con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8",
    "com9", "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
];

/// 名前の長さの上限（文字数）。パス全体の上限より十分手前で切る。
const MAX_STEM_CHARS: usize = 100;

/// 差し込んだ名前を、そのままファイル名にしてよいか確かめる。
///
/// 一括生成では出す名前が表の中身で決まる。表は人が書くものなので、区切り文字も
/// `..` も普通に入ってくる。**置き場を移せる形を通すと、任意の場所へ書ける口が空く**ので、
/// 直して通すのではなく断る（直すと、頼んだ名前と出た名前が違う理由が誰にも分からない）。
pub fn safe_file_stem(name: &str) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("名前が空です。".into());
    }
    if trimmed.chars().count() > MAX_STEM_CHARS {
        return Err(format!("名前が長すぎます（{MAX_STEM_CHARS} 文字まで）: {trimmed}"));
    }
    if trimmed
        .chars()
        .any(|letter| FORBIDDEN.contains(&letter) || letter.is_control())
    {
        return Err(format!("名前に使えない字が入っています: {trimmed}"));
    }
    // Windows は末尾の点を黙って落とす。落ちた先が既にあると、別の行が同じ名前になる。
    if trimmed.ends_with('.') {
        return Err(format!("名前を点で終えられません: {trimmed}"));
    }
    let head = trimmed
        .split('.')
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();
    if DEVICE_NAMES.contains(&head.as_str()) {
        return Err(format!("その名前は機器に取られています: {trimmed}"));
    }
    Ok(trimmed.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn png(width: u32, height: u32, scale: f64) -> ShotSpec {
        ShotSpec {
            width,
            height,
            scale,
            format: ImageFormat::Png { transparent: false },
        }
    }

    #[test]
    fn 型の名前から寸法が引ける() {
        assert_eq!(preset_size("ogp"), Some((1200, 630)));
        assert_eq!(preset_size("instagram-story"), Some((1080, 1920)));
        assert_eq!(preset_size("web-banner"), Some((728, 90)));
    }

    #[test]
    fn 知らない型の名前は引けない() {
        assert_eq!(preset_size("ogp "), None);
        assert_eq!(preset_size("OGP"), None);
        assert_eq!(preset_size(""), None);
    }

    #[test]
    fn 寸法と倍率が指示に載る() {
        let params = metrics_params(&png(1200, 630, 2.0));
        let parsed: serde_json::Value = serde_json::from_str(&params).expect("JSON");
        assert_eq!(parsed["width"], 1200);
        assert_eq!(parsed["height"], 630);
        assert_eq!(parsed["deviceScaleFactor"], 2.0);
        assert_eq!(parsed["mobile"], false);
    }

    #[test]
    fn 窓に収まらない部分まで撮る指示が入る() {
        let params = screenshot_params(&png(1080, 1920, 1.0));
        let parsed: serde_json::Value = serde_json::from_str(&params).expect("JSON");
        assert_eq!(parsed["format"], "png");
        assert_eq!(parsed["captureBeyondViewport"], true);
        // PNG に品質の指定は無い。付けると Chromium 側が受け取らない。
        assert!(parsed.get("quality").is_none());
    }

    #[test]
    fn jpeg_のときだけ品質が載る() {
        let spec = ShotSpec {
            format: ImageFormat::Jpeg { quality: 85 },
            ..png(1200, 675, 1.0)
        };
        let parsed: serde_json::Value =
            serde_json::from_str(&screenshot_params(&spec)).expect("JSON");
        assert_eq!(parsed["format"], "jpeg");
        assert_eq!(parsed["quality"], 85);
    }

    #[test]
    fn 背景を抜くのは透過を頼まれたときだけ() {
        assert!(!wants_transparency(&png(800, 400, 1.0)));
        assert!(wants_transparency(&ShotSpec {
            format: ImageFormat::Png { transparent: true },
            ..png(800, 400, 1.0)
        }));
        // JPEG は透過を持てない形式なので、頼まれようが無い。
        assert!(!wants_transparency(&ShotSpec {
            format: ImageFormat::Jpeg { quality: 85 },
            ..png(800, 400, 1.0)
        }));
    }

    #[test]
    fn 拡張子が形式から決まる() {
        assert_eq!(extension(&ImageFormat::Png { transparent: false }), "png");
        assert_eq!(extension(&ImageFormat::Png { transparent: true }), "png");
        assert_eq!(extension(&ImageFormat::Jpeg { quality: 85 }), "jpg");
    }

    #[test]
    fn まっとうな注文は通る() {
        assert!(validate(&png(1200, 630, 2.0)).is_ok());
        assert!(validate(&png(1, 1, 0.1)).is_ok());
        assert!(validate(&png(16_384, 1, 1.0)).is_ok());
    }

    #[test]
    fn 大きさが零の注文は断る() {
        let message = validate(&png(0, 630, 1.0)).expect_err("断るはず");
        assert!(message.contains("1 以上"), "{message}");
        assert!(validate(&png(1200, 0, 1.0)).is_err());
    }

    #[test]
    fn 辺が長すぎる注文は断る() {
        let message = validate(&png(16_385, 630, 1.0)).expect_err("断るはず");
        assert!(message.contains("16384"), "{message}");
    }

    #[test]
    fn 倍率を掛けた大きさが上限を越えたら断る() {
        // 辺だけ見れば上限内だが、4 倍すると 6553.6 万ピクセルを越える。
        let message = validate(&png(4_000, 4_000, 4.0)).expect_err("断るはず");
        assert!(message.contains("大きすぎ"), "{message}");
    }

    #[test]
    fn 倍率が範囲の外なら断る() {
        assert!(validate(&png(1200, 630, 0.0)).is_err());
        assert!(validate(&png(1200, 630, 4.1)).is_err());
        assert!(validate(&png(1200, 630, -1.0)).is_err());
    }

    #[test]
    fn jpeg_の品質が範囲の外なら断る() {
        let spec = ShotSpec {
            format: ImageFormat::Jpeg { quality: 0 },
            ..png(1200, 675, 1.0)
        };
        let message = validate(&spec).expect_err("断るはず");
        assert!(message.contains("1〜100"), "{message}");
    }

    #[test]
    fn 差し込んだ名前がそのまま使える() {
        assert_eq!(safe_file_stem("春の新商品"), Ok("春の新商品".into()));
        assert_eq!(safe_file_stem("  item-01  "), Ok("item-01".into()));
    }

    #[test]
    fn 名前で置き場を移す指定は断る() {
        for name in ["../外", "サブ/中", "サブ\\中", "..", ".", "/", "C:\\誰か"] {
            assert!(safe_file_stem(name).is_err(), "通してはいけない: {name}");
        }
    }

    #[test]
    fn 名前が空なら断る() {
        assert!(safe_file_stem("").is_err());
        assert!(safe_file_stem("   ").is_err());
    }

    #[test]
    fn ファイル名に使えない字は断る() {
        for name in ["a<b", "a>b", "a:b", "a\"b", "a|b", "a?b", "a*b", "a\0b", "a\nb"] {
            assert!(safe_file_stem(name).is_err(), "通してはいけない: {name:?}");
        }
    }

    #[test]
    fn 機器に取られている名前は断る() {
        // Windows では作れないので、作れる OS で作ると相手先で開けない。
        for name in ["CON", "con", "nul", "COM1", "lpt9", "AUX.png"] {
            assert!(safe_file_stem(name).is_err(), "通してはいけない: {name}");
        }
    }

    #[test]
    fn 名前が長すぎれば断る() {
        assert!(safe_file_stem(&"あ".repeat(100)).is_ok());
        let message = safe_file_stem(&"あ".repeat(101)).expect_err("断るはず");
        assert!(message.contains("100"), "{message}");
    }

    #[test]
    fn 末尾の点や空白は残さない() {
        // Windows は末尾の点と空白を黙って落とすので、同じ名前が 2 つできる。
        assert!(safe_file_stem("名前.").is_err());
    }

    #[test]
    fn 注文を外から受け取れる() {
        let spec: ShotSpec = serde_json::from_str(
            r#"{"width":1200,"height":630,"scale":2,"format":{"type":"png","transparent":true}}"#,
        )
        .expect("読めるはず");
        assert_eq!(spec.width, 1200);
        assert_eq!(spec.scale, 2.0);
        assert_eq!(spec.format, ImageFormat::Png { transparent: true });

        let jpeg: ShotSpec = serde_json::from_str(
            r#"{"width":1200,"height":675,"scale":1,"format":{"type":"jpeg","quality":85}}"#,
        )
        .expect("読めるはず");
        assert_eq!(jpeg.format, ImageFormat::Jpeg { quality: 85 });
    }
}
