# Changelog

## 0.2.1

### Fixed

- Test-spec sheets (`.tsv`) opened as an empty table, because the script that draws the grid was left out of the 0.2.0 package.

## 0.2.0

### Added

- **Investigation reports** (`schema: investigation/v1`) are previewed with their cover, findings and body.
- **`chart` code blocks** are drawn in the preview as bar, line or pie charts from a TSV file next to the document.
- **`data` code blocks** quote a TSV file next to the document as a table.

### Changed

- Architecture diagrams (`zumen`) are drawn with zumen 0.7.0.
- A code block that cannot be drawn stays in the preview with the reason above it, instead of silently showing the raw block.

## 0.1.1

- Icon, categories and Marketplace description.

## 0.1.0

- First release: schema errors in the Problems panel, print preview, TSV test-spec grid, and the md-business MCP tools for agent mode.
