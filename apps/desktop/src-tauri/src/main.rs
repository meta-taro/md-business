// Windows のリリースビルドで余計なコンソールウィンドウを出さない（削除禁止）。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    md_business_desktop_lib::run()
}
