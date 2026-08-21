# Examples

Filled-in documents, not blank forms. [`templates/`](../templates/) gives you the shape to start from; this folder shows what the shape looks like once a real project has been written into it.

Everything here describes one fictional system — an internal **equipment lending** tool at a made-up company. The documents cross-reference each other, so you can follow a single project from design through to the invoice for the hardware it runs on.

| File | Schema | What it is |
| --- | --- | --- |
| [`project-docs/spec.md`](./project-docs/spec.md) | `spec/v1` | Design document — scope, features, screens, decisions |
| [`project-docs/api-spec.md`](./project-docs/api-spec.md) | `api-spec/v1` | REST endpoints, request / response fields, error catalogue |
| [`project-docs/db-spec.md`](./project-docs/db-spec.md) | `db-spec/v1` | Tables, columns, indexes, foreign keys |
| [`project-docs/test-spec.tsv`](./project-docs/test-spec.tsv) | `test-spec-tsv/v1` | Test sheet — opens as a grid in the desktop app |
| [`invoice/invoice.md`](./invoice/invoice.md) | `invoice/v1` | Qualified invoice for the tablets being lent out |
| [`investigation/`](./investigation/) | `investigation/v1` | Investigation report with its saved evidence files |

## If you want to exercise the app instead

[`try-it/`](./try-it/) holds a separate set meant to be **opened, clicked and scrolled through**:
all seven schemas, plain Markdown, a large and a small grid, inbound JSON and XML, HTML with and without
script, images, an SVG and a 4,200-line log — written around a different fictional project (meeting-room booking).
It is there to exercise rendering and interaction, not to be read.

## If you want to chart numbers

[`snapshot/`](./snapshot/) holds **numbers as they were fetched**, plus a document that charts them.
One `.tsv` per month, one row per day, with `取得日時` (when it was fetched) and `取得元` (where from)
carried on every row. Re-fetched figures are appended rather than overwritten, so the fact that a
number changed stays visible. The convention is written up in
[`docs/spec/snapshot-tsv-v1.md`](../docs/spec/snapshot-tsv-v1.md).

## Nothing here is real

Company names, registration numbers, bank accounts, addresses and employee codes are all invented. `T1234567890123` is not a valid registration number, and `example.com` is reserved for documentation. Copy the shape, not the values.

## The `結果` column is left empty on purpose

In the test sheet every row still says `未実施` (not run). Rows are drafted by whoever writes the sheet — often an AI agent — and the pass / fail column is filled in by the person who actually operates the software and looks at the result. Keeping those two roles apart is the point of the sheet; a sheet where the author graded their own work records nothing.

## Opening these

- **Desktop app** — open this folder. Markdown documents render with a preview; `test-spec.tsv` opens as an editable grid.
- **Chrome extension** — open any `.md` file to preview and export A4 PDF.
- **MCP server** — point an AI agent at this folder and it can read, validate and update these documents through the same schemas.

Every Markdown file here is validated in CI against its JSON Schema, the same way the templates are. A broken example teaches a broken shape.
