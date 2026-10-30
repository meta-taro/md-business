# md-business for VS Code

Markdown-first business documents in VS Code: invoices, basic design specs, test specs, DB specs and API specs written as Markdown frontmatter + JSON Schema, plus test-spec sheets in TSV.

## What it does

1. **Schema errors in the Problems panel.** Documents that declare a schema (`schema: invoice/v1`, `schema: spec/v1`, …) are validated as you type and on save, and each error points at its line. Test-spec TSV files (first line `#! md-business:test-spec-tsv/v1`) are checked too: the header line, column definitions, required cells and values outside the allowed choices. Markdown files without a schema declaration are left alone.
2. **See the document the way it is used.**
   - **md-business: 業務文書としてプレビュー** (the briefcase button at the top right of the editor) opens the document as it will be printed, beside the source. Architecture diagrams written as `zumen` code blocks are drawn as diagrams.

     ![Basic design spec with an architecture diagram in the preview](images/preview-zumen.png)

   - **表で開く** (the table button) opens a `.tsv` test-spec sheet as a grid. The text stays the source of truth: each cell you change is written back to that row only, so undo, save and diffs work as usual.

     ![Test-spec sheet opened in the grid editor](images/tsv-grid.png)

3. **The md-business MCP tools for agent mode.** The MCP server ships inside the extension and is registered for each workspace folder, running on VS Code's own Node: nothing else to install. In Copilot Chat agent mode you can ask it to validate, read, create or update documents and test-spec rows. `open_in_app` opens the document inside VS Code (Markdown with its preview, TSV in the grid editor).

   ![Copilot agent mode validating a spec and opening it](images/copilot-mcp.png)

Not in this version: PDF export, adding / removing / reordering rows in the grid.

## Try it

Install **md-business** from the Marketplace, open a Markdown file that starts with `schema: spec/v1` frontmatter, and press the briefcase button. Templates for every document type are in [`templates/`](https://github.com/meta-taro/md-business/tree/main/templates).

From this repository:

```bash
pnpm install
pnpm --filter md-business-vscode test:run
pnpm --filter md-business-vscode package   # writes md-business-vscode-<version>.vsix
```

## License

MIT
