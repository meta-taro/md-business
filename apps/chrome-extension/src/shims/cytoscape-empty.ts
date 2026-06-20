/**
 * Empty shim for `cytoscape` and its extensions.
 *
 * mermaid 11.x の架空 / マインドマップ / アーキテクチャ図は cytoscape +
 * cytoscape-cose-bilkent / cytoscape-fcose をレイアウトエンジンに使うが、
 * cytoscape 本体は UMD root detector で `Function("return this")()` を、
 * cytoscape にバンドルされる lodash は `require("util").types` を含むため
 * Chrome MV3 CSP (`script-src 'self'`) を通らない（pre-push scan-bundle で
 * 検出）。
 *
 * md-business では ER / flowchart / sequence の 3 種類だけを対象に絞り、
 * cytoscape 依存の diagram type は使わない方針。Vite の resolve.alias で
 * これらの import をこの空 module に差し替え、bundle から実装を完全に外す。
 *
 * mermaid は cytoscape を **dynamic `import()` 経由** でしか触らないので、
 * 該当 diagram 種を runtime で起動しない限りこの shim は呼ばれない。
 * （architecture / mindmap の syntax を含む markdown を開いた場合のみ、
 * mermaid の lazy loader がこの shim を取得し、空 default で renderer が
 * 失敗 → 描画失敗時のエラー表示 fallback に乗る。）
 */
const cytoscapeShim: unknown = () => {
  // No-op: a renderer that ends up calling this means an unsupported diagram
  // type was requested. Throwing surfaces the situation to renderMermaid's
  // try/catch, which keeps the source visible and shows an inline error.
  throw new Error('Cytoscape-based diagrams (mindmap / architecture) are not supported in this build.');
};

export default cytoscapeShim;
export const use = (): void => {
  // Extension registration entrypoint (cytoscape-cose-bilkent / cytoscape-fcose).
  // We accept and discard — registering an extension on a no-op core is harmless.
};
