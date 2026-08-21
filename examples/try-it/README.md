# Try it

A set of files to **open, click and scroll through** — one after another — to see whether the app feels right.
The examples in [`../`](../) show what a finished document looks like; this folder is aimed at
**the application instead of the document**. What matters here is how things render and respond, not whether the contents are correct.

This is not a test sheet. There is nothing to grade row by row. Open them in order; anything that feels off is what this folder was for.

## What is in here

| File | What to look at |
| --- | --- |
| [`01-invoice.md`](./01-invoice.md) | Invoice — digit grouping, two tax rates in one breakdown, seal placement |
| [`02-spec.md`](./02-spec.md) | Design document — three kinds of Mermaid diagram (graph, sequence, flowchart) |
| [`03-test-spec.md`](./03-test-spec.md) | Test sheet (Markdown flavour) — dropdown column and row colouring |
| [`04-db-spec.md`](./04-db-spec.md) | Database design — wide tables, indexes, foreign keys, a long SQL block in the body |
| [`05-nosql-db-spec.md`](./05-nosql-db-spec.md) | Database design (NoSQL) — nested maps, arrays, TTL, security rules |
| [`06-api-spec.md`](./06-api-spec.md) | API specification — four endpoints, an error catalogue, cross-references to the other documents |
| [`07-freeform.md`](./07-freeform.md) | Plain Markdown with no schema — headings, a wide table, code, diagrams, images, URLs, footnotes |
| [`08-sheet-large.tsv`](./08-sheet-large.tsv) | 300-row grid — scrolling, a computed column, stowed rows, colour rules |
| [`09-sheet-small.tsv`](./09-sheet-small.tsv) | 10-row grid — newlines inside cells, column groups, right alignment |
| [`10-invoice-exchange.json`](./10-invoice-exchange.json) | Inbound invoice data. Opens as a tree; there is no way to write back |
| [`11-bank-statement.xml`](./11-bank-statement.xml) | Inbound bank statement — attributes, a namespace, CDATA |
| [`12-static.html`](./12-static.html) | HTML with no script in it |
| [`13-interactive.html`](./13-interactive.html) | HTML with script. Buttons change the table; nothing is sent anywhere |
| [`14-portrait.png`](./14-portrait.png) | Portrait, 800×1200 |
| [`15-landscape.png`](./15-landscape.png) | Landscape, 1600×900 — checks and thin lines, to see resampling |
| [`16-transparent.png`](./16-transparent.png) | Transparency, 512×512 — does the background show through |
| [`17-logo.svg`](./17-logo.svg) | SVG — do the strokes hold up when enlarged |
| [`18-worklog.jsonl`](./18-worklog.jsonl) | 4,200 one-record-per-line log entries — can you narrow it down without opening it whole |
| [`19-investigation.md`](./19-investigation.md) | Investigation report over `18-worklog.jsonl`, with its evidence in [`evidence/`](./evidence/) |

## Worth watching

- **The moment a file opens** — does it stall, does the text jump before the width settles
- **Switching** — opening documents back to back, does the previous scroll position leak in
- **A narrow window** — can wide tables scroll sideways, do columns overlap
- **Light and dark** — does the meaning of the colouring survive, is colour the only cue
- **The 300-row grid** — scroll to the bottom and watch row hit-testing and the selection colour
- **Zooming** — images versus SVG

## None of it is real

Company names, rooms, registration numbers, bank accounts, addresses, users and log entries are all invented.
`T1234567890123` is not a valid registration number, and `example.com` is reserved for documentation.

The `OK` / `NG` values in the `結果` column of `08-sheet-large.tsv`, `09-sheet-small.tsv` and `03-test-spec.md`
are there **so you can see the colouring**. They are not a record of anyone having checked anything.
In a real sheet, that column is filled in only by the person who operated the software and looked at the result.

## Opening these

- **Desktop app** — open this folder. `.md` renders beside its source; `.tsv` opens as a grid
- **Chrome extension** — open a `.md` file and export A4 PDF
- **MCP server** — point an agent here to narrow down the `.jsonl` or read the `.json` / `.xml` as a tree

Every Markdown file here is validated in CI against its JSON Schema. A broken example teaches a broken shape.
