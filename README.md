# md-business

[![CI](https://github.com/meta-taro/md-business/actions/workflows/ci.yml/badge.svg)](https://github.com/meta-taro/md-business/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](./LICENSE)
[![Node.js 24 LTS](https://img.shields.io/badge/node-24%20LTS-brightgreen.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-required-F69220.svg)](https://pnpm.io/)
[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-published-4285F4.svg)](https://chromewebstore.google.com/detail/lmdplkkfmgapnhombimeohjliinifgjh)

**[⬇ Download the desktop app](https://meta-taro.github.io/md-business/download/)** (Windows / macOS) — installers, no build step. Or add the [Chrome extension](https://chromewebstore.google.com/detail/lmdplkkfmgapnhombimeohjliinifgjh) to read and print Markdown business documents in the browser.

> **English** | [日本語](./README.ja.md)

> AI-native business documents, powered by Markdown as the source of truth.

**md-business** is an open-source framework for managing business documents as Markdown files with structured frontmatter, schemas, validation, Git history, and human-friendly viewers.

It is not just a Markdown viewer, a PDF generator, or a template collection.

md-business treats Markdown as the canonical source of truth for invoices, test specifications, design documents, API documents, database design documents, estimates, meeting notes, and other operational documents. AI agents can create, edit, validate, diff, and render these documents directly, while humans can review and consume them through familiar interfaces such as PDF, Google Workspace, Chrome, VS Code, PWA, desktop apps, or GitHub.

## Why this exists

Most business documents still live inside tools designed primarily for humans:

- Word processors
- Spreadsheets
- PDFs
- Cloud drives
- Office suites
- SaaS back-office tools
- Internal web forms

These tools are useful for human input and review, but they are not ideal as an AI-operable source of truth.

AI agents can read and summarize these documents, but they often cannot safely and continuously operate them as structured business assets. They struggle with reliable editing, validation, diffing, version control, automation, and handoff across multiple agents or systems.

md-business starts from a different premise:

**Business documents should be stored in a format that AI agents can operate directly.**

Markdown provides the human-readable body.
YAML frontmatter provides machine-readable metadata.
JSON Schema provides validation.
Git provides history, review, branching, and rollback.
Renderers and viewers provide human-facing output.

## Core idea

```text
Markdown source of truth
        ↓
Schema validation
        ↓
AI agent editing
        ↓
Git diff / review / approval
        ↓
PDF / Sheets / Docs / browser / desktop / SaaS integration
```

The important layer is the Markdown source.

Viewers and integrations are only access points for humans and existing workflows. They exist so that non-technical users can review, approve, print, share, or submit documents without needing to understand Markdown, Git, or AI agents.

## What md-business is

md-business is:

- A schema-driven business document system
- A Markdown-first source-of-truth layer
- A document format designed for AI agents
- A Git-friendly alternative to opaque office files
- A bridge between AI workflows and human-facing business documents
- A foundation for local-first and agent-driven business operations

## What md-business is not

md-business is not:

- A Notion clone
- A Google Docs clone
- A spreadsheet replacement
- A simple Markdown viewer
- A PDF-only generator
- A closed SaaS workflow tool

Existing office suites and SaaS tools can still be useful as review surfaces, delivery channels, or regulated backends. md-business focuses on the source-of-truth layer that AI agents can actually operate.

## Why Markdown

Markdown is a practical base format for AI-native business operations because:

- AI agents can edit it reliably
- Humans can read it without special software
- Git can track every change
- Pull requests can be used for review and approval
- Frontmatter can hold structured business data
- JSON Schema can validate document correctness
- Renderers can produce PDF, HTML, Sheets, Docs, or other outputs
- Local repositories can be operated by desktop tools or autonomous agents

## Human role

md-business does not remove humans from responsibility.

It moves humans away from repetitive document manipulation and places them at the review, approval, exception handling, and business decision layers.

AI agents operate the source files.
Humans approve the outcomes.
Viewers provide the interface.

## Example use cases

### Test specifications

AI agents generate and update test cases as Markdown.
Schemas validate required fields.
Git tracks changes.
A Google Sheets or browser viewer allows non-engineers to execute and review test results.

### Design documents

AI agents maintain basic design documents, API specifications, database design documents, and implementation notes as version-controlled Markdown.
Mermaid diagrams, structured frontmatter, and schema validation keep the documents reviewable and automatable.

### Invoices and estimates

AI agents update dates, line items, tax fields, customer information, and payment terms in Markdown.
Schemas validate required fields.
PDF renderers generate human-facing documents.
External accounting tools can be treated as integration targets rather than the primary editing surface.

## Distribution channels

md-business provides multiple human-facing viewers and automation channels:

| Channel                 | Purpose                                                           | Status    |
| ----------------------- | ----------------------------------------------------------------- | --------- |
| Tauri Desktop App       | Local-first repository operation and document workflow automation | Available |
| Chrome Extension        | Open and preview Markdown business documents in the browser       | Available |
| Google Workspace Add-on | Review and display documents in familiar office workflows         | In review |
| VS Code Extension       | Developer and agent-oriented editing                              | Planned   |
| PWA                     | Cross-platform human-facing viewer                                | Planned   |
| GitHub Action           | CI validation and automatic rendering                             | Planned   |
| LINE LIFF               | Mobile-first access for Japanese business workflows               | Planned   |

These channels are not the core product.
They are adapters around the Markdown source of truth.

## Current templates

| Template           | Schema         | Location                                              |
| ------------------ | -------------- | ----------------------------------------------------- |
| Invoice / quote / receipt | `invoice/v1` | [`templates/invoice/`](./templates/invoice/) — 6 variants |
| Test specification | `test-spec/v1` | [`templates/test-spec/`](./templates/test-spec/)      |
| Design document    | `spec/v1`      | [`templates/spec/`](./templates/spec/)                |

### Using a template

Every shipped template uses dummy data — no real company names, registration numbers, bank accounts, or invoice numbers. **Copy the file into your own workspace and edit the values in place.**

**Invoice templates** (`templates/invoice/`):

- `standard.md` — English baseline, single item at 10%
- `standard-ja.md` — Japanese baseline, mixed 10% / 8% tax rates, bank account, and 適格請求書発行事業者 registration number (T + 13-digit dummy)
- `tax-exempt-ja.md` — 免税事業者 (tax-exempt sole proprietor) variant — no registration number, with the 2023–2029 経過措置 footnote
- `inbound-eligible.md` — Multi-item invoice exercising both the standard and the reduced tax rate
- `quote-ja.md` — Quotation (`種別: 見積書`) with a validity date instead of a payment due date
- `receipt-ja.md` — Receipt (`種別: 領収書`) with a 但し書き line and an opt-in revenue stamp box

Open any of these in the Chrome extension viewer or render via `@md-business/renderer-pdf` to produce a print-ready PDF without writing any code.

Future templates may include meeting notes, contracts, API documents, database design documents, operational checklists, and other business documents.

## Screenshots

Screenshots will be added under [`docs/screenshots/`](./docs/screenshots/). See [`docs/screenshots/README.md`](./docs/screenshots/README.md) for capture specs (1280 × 800 px / PNG) and the list of planned shots:

- Chrome extension viewer rendering a qualified invoice
- Chrome extension A4 PDF preview
- Google Workspace Add-on test-spec sheet view
- Google Workspace Add-on "GitHub push" sidebar action

For now, see the published Chrome Web Store listing for the viewer screenshots: <https://chromewebstore.google.com/detail/lmdplkkfmgapnhombimeohjliinifgjh>.

## Forking & customization

md-business is MIT-licensed and explicitly designed to be forked for in-house, consulting, and per-vendor deployments. See [`docs/fork-guide/`](./docs/fork-guide/README.md) for the recommended fork strategies, upstream sync workflow, per-package customization points, and distribution channel notes.

## Long-term vision

md-business aims to make business documents operable by AI agents.

Instead of placing AI on top of opaque SaaS screens, PDFs, spreadsheets, and office files, md-business places structured Markdown at the center of the workflow.

This enables a different kind of organization:

- Documents are version-controlled
- Changes are reviewable
- AI agents can work directly on source files
- Humans approve through familiar views
- Local repositories can become operational workspaces
- Back-office and upstream engineering processes can be automated without locking the source of truth inside a specific SaaS

The goal is not to replace every business tool.

The goal is to make the canonical business document layer open, portable, reviewable, automatable, and AI-native.

## Documentation

| Schema | Spec | Package |
| --- | --- | --- |
| Invoice / quote / receipt (Japanese インボイス制度) | `invoice/v1` | [docs/spec/invoice-v1.md](./docs/spec/invoice-v1.md) → [packages/schema-invoice/](./packages/schema-invoice/README.md) |
| Design document | `spec/v1` | [docs/spec/spec-v1.md](./docs/spec/spec-v1.md) → [packages/schema-spec/](./packages/schema-spec/README.md) |
| Test specification | `test-spec/v1` | [docs/spec/test-spec-v1.md](./docs/spec/test-spec-v1.md) → [packages/schema-test-spec/](./packages/schema-test-spec/README.md) |

Each spec document includes the JSON Schema link, top-level field table, YAML frontmatter sample, and validation examples.

### Desktop app

The desktop app (Tauri 2 + SvelteKit) opens the six business-document types in purpose-built viewers, edits Markdown in a live split view, and exports A4 PDF.

- **Download** (Windows / macOS): <https://meta-taro.github.io/md-business/download/>
- **User guide (English)**: <https://meta-taro.github.io/md-business/manual/>
- **操作マニュアル (日本語)**: <https://meta-taro.github.io/md-business/manual/ja/>

#### Built-in MCP server

The desktop app is where the source-of-truth layer becomes operable by an AI agent. It starts a local MCP server on launch, so an AI client can read, validate, search, create, and update the business documents in the folder you have open.

- Connect by pasting one JSON snippet: the app copies a ready-to-use `mcpServers` entry to the clipboard.
- The connection details persist across restarts, so the settings you paste once keep working.
- The document tools are `list_schemas`, `get_schema`, `read_document`, `validate_document`, `create_document`, `update_document` and `search_documents`, plus `read_tsv`, `append_tsv_row` and `update_tsv_row` for test sheets. Every call is validated against the declared schema and listed in the app.
- Test sheets are the tab-separated format, not Markdown, so the agent fills them in row by row: rows it did not touch stay out of the diff. `search_documents` lists them alongside the Markdown documents, so the agent can find a sheet without being told its path.
- When the folder is a git repository, `git_status`, `git_diff` and `git_commit` let the agent review what it changed and record it — so a day of edits ends as readable history rather than an untracked pile.
- `export_pdf` asks the app to open a document and bring up the print dialog, so the agent can hand you a finished A4 page to save — where it goes is still your choice.
- Reach is limited to the folder currently open in the app, the server binds to loopback only, and requests without the matching token are rejected.
- When the agent writes, the file list and preview follow along on their own — no reload, no manual refresh.

`git push` is deliberately not exposed as a tool, and the server never receives secrets or API keys. See [packages/mcp-server/](./packages/mcp-server/README.md) for the protocol details.

### Conventions

- [Data cell convention](./docs/data-cell-conventions.md) — Empty cells are the only canonical representation for unfilled data. Do not fill table cells with `—` / `–` / `―` / `N/A` / `TBD`.

## Quick Start

### Use it

No build step, no Node.js, no package manager.

1. **[Download the desktop app](https://meta-taro.github.io/md-business/download/)** (Windows `.msi` / `.exe`, macOS `.dmg`) and install it. Or add the [Chrome extension](https://chromewebstore.google.com/detail/lmdplkkfmgapnhombimeohjliinifgjh) if you only need to read and print documents in the browser.
2. Open a folder. Any `.md` file with a `schema:` frontmatter key opens in the viewer for that document type; `.tsv` test sheets open in the grid editor.
3. Start from a template — copy one out of [`templates/`](./templates/), or create a test sheet from a column preset with the ＋ button in the file list.
4. Print to A4 PDF from the preview.

The [user guide](https://meta-taro.github.io/md-business/manual/) ([日本語](https://meta-taro.github.io/md-business/manual/ja/)) covers the rest.

To let an AI agent edit those documents, point your MCP client at the server the desktop app runs. Open the `MCP` tab in the right-hand panel: **Add settings to the open folder** writes `.mcp.json` there — clients that read it (Claude Code among them) pick it up on their own — or **Copy client settings** puts the same entry on the clipboard for a client configured elsewhere. Either way it looks like this, with the port and token already filled in:

```json
{
  "mcpServers": {
    "md-business": {
      "type": "http",
      "url": "http://127.0.0.1:<PORT>/mcp",
      "headers": { "Authorization": "Bearer <TOKEN>" }
    }
  }
}
```

`<PORT>` and `<TOKEN>` are shown in that panel and persist across restarts, so the settings you paste once keep working. The token is an access credential: in a Git repository the app adds `.mcp.json` to `.gitignore` when it writes it. The server binds to loopback, rejects requests without the matching token, and reaches no further than the folder you have open.

To run the server standalone instead — without the desktop app — see [packages/mcp-server/](./packages/mcp-server/README.md).

### Develop

Requires [Node.js 24+](https://nodejs.org/) and pnpm (via corepack). npm and yarn are not supported. Building the desktop app additionally needs the [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/) (Rust toolchain and the platform WebView).

```bash
corepack enable
pnpm install
pnpm dev
```

Checks — all of these must pass before a change lands:

```bash
pnpm lint       # svelte-check (desktop) / tsc --noEmit (everything else)
pnpm typecheck  # same checkers, run as their own task
pnpm test:run   # Vitest, with coverage where it is configured
pnpm build      # every package and app
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for details.

## Contributing

Issues and PRs are welcome. For adding new schemas or distribution channels, see [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

MIT — fork and customize freely. Derivative repos that don't merge back upstream (e.g. `schema-invoice-custom`) are also encouraged.
