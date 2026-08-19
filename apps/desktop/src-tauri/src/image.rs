//! 画像を開く入口（Tauri command）。中身は [`crate::image_logic`]。

use std::path::Path;

use crate::image_logic::{read_image_impl, ImageData};

/// ルート配下の画像 1 枚を読み、そのまま `<img src>` に入る形で返す。
#[tauri::command]
pub fn read_image(root: String, rel_path: String) -> Result<ImageData, String> {
    read_image_impl(Path::new(&root), &rel_path)
}
