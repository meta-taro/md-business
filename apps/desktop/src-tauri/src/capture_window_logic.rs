//! 窓を撮るときの決めごと（画面にも OS にも触らない部分）。
//!
//! 撮る口そのものは OS ごとに違うが、「どの大きさで撮るか」「撮れたものが何ピクセルか」は
//! どこで撮っても同じ話なので、ここに分けて自動テストの下に置く。

/// 撮る指示。CSS ピクセルの見える範囲と、そこへ掛ける倍率。
///
/// 倍率を分けて持つのは、**窓の見た目の大きさと、出てくる画像の大きさが別物**だから。
/// 画面の拡大率が 150% の窓は、CSS で 853px 幅でも実際には 1280px で描かれている。
#[derive(Debug, Clone, PartialEq)]
pub struct ShotPlan {
    pub css_width: f64,
    pub css_height: f64,
    pub scale: f64,
}

/// 長辺の指定に許す幅。
///
/// 下限があるのは、潰れて読めない画像を撮っても誰の役にも立たないため。
/// 上限があるのは、撮ったものが制御チャネルを base64 で通るため
/// （大きすぎると通り道のほうが先に音を上げる）。
pub const MIN_MAX_EDGE: u32 = 200;
pub const MAX_MAX_EDGE: u32 = 4000;

/// 指定が無いときの長辺。読める大きさのうち、やり取りが重くならない側に寄せてある。
pub const DEFAULT_MAX_EDGE: u32 = 1400;

/// 撮る大きさを決める。
///
/// `physical_*` は窓が実際に描かれているピクセル数、`scale_factor` は画面の拡大率。
/// **長辺が `max_edge` を超えるときだけ縮める。小さい窓を引き伸ばすことはしない**
/// （無いものを足した画像になり、見て確かめる用途に合わない）。
pub fn plan_shot(
    physical_width: u32,
    physical_height: u32,
    scale_factor: f64,
    max_edge: u32,
) -> Result<ShotPlan, String> {
    if physical_width == 0 || physical_height == 0 {
        // 畳まれている窓はここへ来る。中身の無いものを撮って白い画像を返すより、
        // 撮れなかったと言ったほうが次の一手が決まる。
        return Err("窓の大きさが取れません（畳まれていないか確かめてください）".to_string());
    }
    if !scale_factor.is_finite() || scale_factor <= 0.0 {
        return Err("画面の拡大率を読めません".to_string());
    }
    if !(MIN_MAX_EDGE..=MAX_MAX_EDGE).contains(&max_edge) {
        return Err(format!(
            "長辺は {MIN_MAX_EDGE} 〜 {MAX_MAX_EDGE} で指してください（指定: {max_edge}）"
        ));
    }

    let longest = f64::from(physical_width.max(physical_height));
    // 収まっているときは 1.0 のまま。ここで割り算に寄せると、収まっている窓まで
    // わずかに拡大され、等倍で撮ったことにならない。
    let shrink = if longest > f64::from(max_edge) {
        f64::from(max_edge) / longest
    } else {
        1.0
    };

    Ok(ShotPlan {
        css_width: f64::from(physical_width) / scale_factor,
        css_height: f64::from(physical_height) / scale_factor,
        scale: scale_factor * shrink,
    })
}

/// 撮る指示（`Page.captureScreenshot`）。
pub fn screenshot_params(plan: &ShotPlan) -> String {
    serde_json::json!({
        "format": "png",
        // 窓の外まで撮ると、画面に出ていない下のほうまで写る。ここで欲しいのは
        // 「利用者に今見えているもの」なので、見える面だけに切る。
        "captureBeyondViewport": false,
        "clip": {
            "x": 0.0,
            "y": 0.0,
            "width": plan.css_width,
            "height": plan.css_height,
            "scale": plan.scale,
        },
    })
    .to_string()
}

/// PNG のヘッダから寸法を読む。PNG に見えないものは None。
///
/// 撮る前に計算した値ではなく**撮れたものそのもの**を数えるために要る。
/// 予想と実物がずれたとき、返した数字のほうが正しいことにはならない。
pub fn png_size(bytes: &[u8]) -> Option<(u32, u32)> {
    const SIGNATURE: [u8; 8] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    // 署名 8 + 長さ 4 + "IHDR" 4 + 幅 4 + 高さ 4。
    if bytes.len() < 24 || bytes[..8] != SIGNATURE || &bytes[12..16] != b"IHDR" {
        return None;
    }
    let read = |at: usize| -> u32 {
        u32::from_be_bytes([bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]])
    };
    Some((read(16), read(20)))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn png_header(width: u32, height: u32) -> Vec<u8> {
        let mut bytes = vec![0x89, b'P', b'N', b'G', b'\r', b'\n', 0x1a, b'\n'];
        bytes.extend_from_slice(&13u32.to_be_bytes());
        bytes.extend_from_slice(b"IHDR");
        bytes.extend_from_slice(&width.to_be_bytes());
        bytes.extend_from_slice(&height.to_be_bytes());
        bytes.extend_from_slice(&[8, 6, 0, 0, 0]);
        bytes
    }

    #[test]
    fn 収まっている窓は等倍で撮る() {
        let plan = plan_shot(1280, 800, 1.0, 1400).expect("撮れるはず");
        assert_eq!(plan.css_width, 1280.0);
        assert_eq!(plan.css_height, 800.0);
        assert_eq!(plan.scale, 1.0);
    }

    #[test]
    fn 小さい窓を長辺に合わせて引き伸ばさない() {
        let plan = plan_shot(800, 600, 1.0, 1400).expect("撮れるはず");
        assert_eq!(plan.scale, 1.0);
    }

    #[test]
    fn 長辺を超えた分だけ縮める() {
        let plan = plan_shot(2800, 1600, 1.0, 1400).expect("撮れるはず");
        // 長辺 2800 を 1400 に収める＝半分。
        assert_eq!(plan.scale, 0.5);
        assert_eq!(plan.css_width, 2800.0);
    }

    #[test]
    fn 画面の拡大率のぶんは倍率に乗る() {
        // 拡大率 150% で 1920x1200 に描かれている窓は、CSS では 1280x800。
        let plan = plan_shot(1920, 1200, 1.5, 4000).expect("撮れるはず");
        assert_eq!(plan.css_width, 1280.0);
        assert_eq!(plan.css_height, 800.0);
        // 縮める必要が無いので、実際に描かれているとおりの 1920x1200 が出る。
        assert_eq!(plan.scale, 1.5);
    }

    #[test]
    fn 拡大率と縮小が両方あっても実際のピクセル数から決める() {
        // 実際は 1920 幅。長辺 960 に収めるので半分。CSS 1280 × 0.75 = 960。
        let plan = plan_shot(1920, 1200, 1.5, 960).expect("撮れるはず");
        assert_eq!(plan.scale, 0.75);
        assert_eq!(plan.css_width * plan.scale, 960.0);
    }

    #[test]
    fn 大きさの取れない窓は撮らない() {
        assert!(plan_shot(0, 800, 1.0, 1400).is_err());
        assert!(plan_shot(1280, 0, 1.0, 1400).is_err());
    }

    #[test]
    fn 拡大率が数として使えないときは撮らない() {
        assert!(plan_shot(1280, 800, 0.0, 1400).is_err());
        assert!(plan_shot(1280, 800, -1.0, 1400).is_err());
        assert!(plan_shot(1280, 800, f64::NAN, 1400).is_err());
    }

    #[test]
    fn 長辺の指定が範囲の外なら撮らない() {
        assert!(plan_shot(1280, 800, 1.0, MIN_MAX_EDGE - 1).is_err());
        assert!(plan_shot(1280, 800, 1.0, MAX_MAX_EDGE + 1).is_err());
        assert!(plan_shot(1280, 800, 1.0, MIN_MAX_EDGE).is_ok());
        assert!(plan_shot(1280, 800, 1.0, MAX_MAX_EDGE).is_ok());
    }

    #[test]
    fn 撮る指示は見える範囲だけを指す() {
        let plan = plan_shot(2800, 1600, 1.0, 1400).expect("撮れるはず");
        let params: serde_json::Value =
            serde_json::from_str(&screenshot_params(&plan)).expect("JSON のはず");
        assert_eq!(params["format"], "png");
        // 窓の外まで撮ると、見えていない下のほうまで写る。撮るのは見えている面。
        assert_eq!(params["captureBeyondViewport"], false);
        assert_eq!(params["clip"]["x"], 0.0);
        assert_eq!(params["clip"]["y"], 0.0);
        assert_eq!(params["clip"]["width"], 2800.0);
        assert_eq!(params["clip"]["height"], 1600.0);
        assert_eq!(params["clip"]["scale"], 0.5);
    }

    #[test]
    fn 撮れた画像の寸法をヘッダから読む() {
        assert_eq!(png_size(&png_header(1400, 800)), Some((1400, 800)));
    }

    #[test]
    fn 画像に見えないものからは寸法を読まない() {
        assert_eq!(png_size(b""), None);
        assert_eq!(png_size(b"not a png at all......."), None);
        // 頭は PNG でも IHDR まで無いもの。
        assert_eq!(png_size(&png_header(10, 10)[..20]), None);
    }
}
