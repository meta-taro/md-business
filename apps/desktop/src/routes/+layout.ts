// Tauri デスクトップは SPA として webview で動かすため SSR は無効。
// adapter-static の fallback（index.html）で全ルートをクライアント解決する。
export const ssr = false;
export const prerender = false;
