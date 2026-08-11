# Changelog — @md-business/desktop

Changes to this app. Versions follow [Semantic Versioning](https://semver.org/).

Japanese is the source of truth for this file; see [CHANGELOG.md](./CHANGELOG.md).

## 0.7.1

### Fixed

- **Fixed the places that stayed in Japanese when the display language was set to something else**. The test sheet grid itself, the row toolbar below it, and the menu you get by right-clicking a column all came out in Japanese even after choosing English, Chinese, or Korean. This is the app's main screen, so for anyone not reading Japanese, picking a language did almost nothing.
  - The default name for a column group still keeps the language it was created in. That name is written into the file, so changing it when the display language changes would look like a name you chose being rewritten behind your back.
- **The three recent entries in the update notice now follow the display language too**. 0.7.0 started showing them, but their text was Japanese only.

## 0.7.0

### Added

- **JSON and XML can now be opened as a tree**. You can inspect configuration files and imported data without moving them to another tool. Even JSON packed into a single line becomes readable once you can fold it and walk down. **They cannot be edited** (read only). Unlike Markdown, these are not treated as the document of record here, and letting the app write them would blur which copy is the real one.
  - XML nested too deeply, or declaring an external reference (DTD), is refused with a reason instead of being read. Merely opening a file should not pull in something you did not ask for.
  - AI can read them too. Point at a node and only that part comes back. Returning the whole file makes a single response grow with the file, so the default stops after two levels and notes how many children were left behind. Trimming silently would make "few children" and "no children" look the same.
- **A cell in a test sheet can now link to another place or another file**. Write the link into the cell and you can open the design-document heading a step refers to, or the sheet it depends on, from where you are. No hunting for the related material again. Links are written relative to the folder, so handing the whole folder to someone else does not break them.
- **A column whose value follows from other columns can now be declared as a computed column**. Nobody has to type the same thing twice, and it follows along when the source column changes. Computed columns cannot be written by hand or by AI (an attempted write is refused, naming which columns are computed). Where you can write and where you cannot is visible from the sheet itself.
- **Where time is being spent can now be measured inside the app** (diagnostics panel). When something feels slow, you can point at the place with numbers instead of reporting a feeling.

### Changed

- **A cell with a fixed set of choices now opens with its list in one click**. It used to take two moves: one to select the cell, another to bring up the list. Filling dozens of rows in a column you only ever pick from — like the result column — now takes half the actions.
- **The update notice now shows the last three releases even when you are up to date**. Until now nothing appeared when there was no update, so there was no way on screen to confirm how far along the version you are running is. "See more" opens the full list in a browser.
- **The built-in MCP server can now be checked without entering its listen loop** (`--version` / `--health`). You can tell whether the configuration is right before connecting from the AI side. Previously you had to connect to find out whether the setup was wrong or the server simply was not running.
- In the quotation and receipt templates, the number field was still labelled as it is on an invoice; each form now uses its own name.

### Fixed

- **Fixed editing a test sheet getting heavier as rows were added**. Every keystroke rebuilt the whole table, so the delay grew in proportion to the row count. Only the visible range is drawn now, and typing feels the same no matter how many rows there are. This was measured before it was fixed (the diagnostics panel above was built for that).
- Updated dependencies to versions with security fixes.

## 0.6.0

### Added

- **A test sheet can now be created with its columns already in place**. You used to start from a blank file and type the column names, and those few minutes were repeated in full every time a sheet was made. Use ＋ at the top right of the list on the left, or right-click a folder, and pick either "test cases" or "checkpoints"; the sheet is created with columns and colouring already set, and opens straight into the grid.
- **The same value can now be filled down** (Ctrl+D). Columns that repeat for dozens of rows — result, date, owner — can be filled in one action. Select a range and press it to send the top row's value down; select a single cell and press it to pull the value from directly above.
- **Rows can now be set aside**. A place to keep wording you rewrote, so you do not have to decide whether it is safe to delete every time. A row set aside leaves the table but stays in the file. The count is always shown, as in "show 3 set aside", so you do not forget you removed it. This is the equivalent of hidden rows in a spreadsheet.
- **Quotations and receipts can now be written in the same format as invoices**. Change `種別` (kind) and the title, validity period, and note switch with it. The format built for invoices carries over, so you do not need a separate template per form.
- **The built-in MCP server can now be put to use right away**. The connection settings can be written out into the folder you have open, so the AI-side configuration file does not have to be assembled by hand. When Node is not found, the app shows where to install it. If Node is installed but not on PATH, the usual locations are searched.

### Changed

- In the row-operation bar of the test grid, the buttons now read "＋ add row at end" and "duplicate below selection", so where the row will appear is clear before you press. Also fixed the bar changing height when a narrow window wrapped the labels onto a second line.
- The change notes in the update notice are now rendered instead of showing their markup.

### Fixed

- **Rows in a test sheet now carry a stable marker separate from their displayed number**. Inserting one row shifted every number after it, so anything that refers to a row (colouring, row height, set-aside) ended up pointing at a different row. The marker belongs to the row itself, so settings follow the row when it moves.
- Tightened the check that prevents AI from writing to files outside the folder you have open. When a shortcut pointing outside (a symbolic link) sits inside the folder, the check used to look only at the name, which left a way through. The real destination is resolved before writing.
- Updated dependencies to versions with security fixes.

## 0.5.0

### Added

- **AI can now review its own edits and record them in history**. Until now, after having AI fix a document, you had to come back to the app just to see what changed and record it. `git_status` (which branch you are on and what changed) / `git_diff` (the content of the change) / `git_commit` (record it) are available from AI, so "fix it, show me the diff, record it" can be asked in one go. A day's work is left as readable history rather than a pile of unnamed files.
  - **Pushing to a remote is not included**. The step where a person looks at the content before it goes out is unchanged.
  - Commit checks (the inspection that runs before saving) are not bypassed. A record made by AI passes the same checks as one made by a person.
- **PDF output can now be requested from AI**. `export_pdf` makes the app open the print dialog for the document you have open. The PDF uses what is on screen, so it cannot drift from a version reassembled on the AI side. What comes back is only "the dialog opened"; saving is a human action.
- **AI can now find test sheets on its own**. Tools that read and write test sheets (tab-separated form) required a file path, so AI could not look for them unless a person supplied the name. Test sheets now appear in search results and can be told apart by the title line in their header.
- **Column alignment in the test grid can now be specified**. You can right-align an amount column, left-align a heading, and so on. Pick "align" from the right-click menu and the column name, data, input field, and group heading all line up together. The setting is saved in the test sheet, so it holds the next time you open it.

### Changed

- The source-control panel and the diff view stayed in Japanese; they now follow the display language. In English, Chinese, and Korean, the commit box description, the change list, and the diff headings appear in that language.
- Reworded the explanation shown when frontmatter cannot be read, for the person who wrote it. English technical wording (`bad indentation of a mapping entry`) used to come through as is. It now says which line and what is wrong with it — indentation, tabs, a duplicated key, an unclosed quote — in the display language. Line numbers are counted from the top of the file, so they line up with the editor's.

### Fixed

- **Copying a range that contains multi-line cells in the test grid no longer breaks the layout**. Copying and pasting a cell written as a bulleted list split that one cell across two rows and shifted every column after it. Cells containing newlines or tabs are now quoted the way Excel and Google Sheets do, so moving data to and from a spreadsheet works as it is.
- **Range selection in the test grid can now be done with the mouse**. Selecting multiple cells used to be arrow keys only (Shift + arrow); dragging did nothing. The range now runs from the cell you pressed to the cell you passed over.
- The original file is no longer corrupted if the app or the machine goes down while AI is writing it. Writes go through a replacement, so an interrupted write leaves the previous content intact. This matters for files like test sheets, where a single write rewrites the whole document.
- AI can no longer create files with names the operating system handles badly (reserved names such as `CON.md`, names containing a colon). Names with a colon are refused in particular, because a write can succeed while the content lands somewhere that never appears in the file list.
- Changed how the built-in MCP server's connection token is compared, so its content cannot be inferred from response time.
- Updated dependencies to versions with security fixes.

## 0.4.0

### Added

- **Test sheets can now be edited directly from AI**. Only Markdown documents could be handled through the built-in MCP server; test sheets (tab-separated form) were out of reach. Ask for something like "set the result on row 3 to OK and fill in the date" and only that row changes.
  - Columns are addressed by name, so reordering them does not break anything.
  - Rows you did not touch are left alone, so no extra lines appear in the diff.
  - Half-entered values (a result that is not one of the choices, for example) are written as given, along with a report of which cells do not match the type. Work in progress is allowed to stay that way.
  - The tools added are `read_tsv` (read), `append_tsv_row` (add a row), and `update_tsv_row` (update a row).
- **The format can now be checked before you start writing a document**. `get_schema` returns the required fields, types, and choices for each document kind as they are. Previously you had to write it once, read the validation errors, and go back.

### Changed

- When a test-sheet row is added or updated over MCP, the file list and preview now follow along (the same behaviour as creating or updating Markdown).

### Fixed

- Fixed rows silently disappearing when AI was asked to write to the same test sheet several times at once. Writes to one sheet are now processed in order.
- Put an upper bound on the size of a single test-sheet cell and of the file. An attempt to write an enormous value returns a reason without rewriting the file.
- Fixed reading deeply nested frontmatter, or frontmatter referring to the same content many times over, stalling for a long time. Reading is now bounded, cutting off without changing the speed of ordinary documents.
- Fixed the depth check for Japanese-key conversion applying to only some document kinds. The same limit now applies to all six.

## 0.3.0

### Added

- **An MCP server built into the app**. A local-only (`127.0.0.1`) MCP server starts with the app, letting an AI client read and write the business documents in the folder you have open. The target follows along whenever you switch folders.
- **MCP panel**. The `MCP` tab in the right side panel shows the address, a copy of the connection settings, how to connect, and a log of tool calls. Available in English, Japanese, Chinese, and Korean.
- **Copy connection settings**. Copies JSON you can paste straight into an AI client's MCP configuration.
- **Fixed connection target**. The port and connection token are saved, so the next start comes up at the same address. Settings you pasted once keep working.
- **Writes by AI appear automatically**. When a document is created or updated over MCP, the app's file list and preview follow along.

### Changed

- Nothing else in the app stops when the MCP server cannot start (no Node runtime found, for example). The panel shows the reason and the app carries on.

### Fixed

- Fixed the MCP indicator in the status bar reading "disconnected" regardless of the actual state. Running, starting, and stopped are now shown in colour.

## 0.2.0

### Added

- **Live sync with outside edits**. A file you have open is reloaded when another tool changes it. If it changes while you are editing, a conflict banner lets you choose between reloading and keeping your own changes.
- **Help menu**. The help item in the top bar opens the manual, the version, keyboard shortcuts, and licences.
- **Multilingual UI** (English / Japanese / Chinese / Korean), and one search across files and the test grid.
- **Editing improvements**. A right-click menu in the file tree; overflow display for long cells, undo / redo, and autosave in the TSV grid; row colouring, history, and key handling in the test grid; and the app remembering where you were.

### Fixed

- Fixed documents with Japanese keys always failing validation on the MCP server.

## 0.1.0

First distributed release.

### Added

- A Tauri desktop app that opens six kinds of business document (invoice / spec / test-spec / db-spec / nosql-db-spec / api-spec) in a viewer suited to each, and edits Markdown live in a two-pane layout with PDF output.
- TSV grid editing for test-spec (spreadsheet-style input widgets with a round trip to the editor).
- **Automatic updates inside the app**. New versions are checked at startup, and can be checked by hand from "check for updates" in the help menu. Updates are applied after verifying the signed artifacts on GitHub Releases.

### Distribution

- Installers for Windows (`.msi` / `.exe`) and macOS (universal `.dmg`) are distributed through GitHub Releases.
- Code signing (Windows Authenticode / Apple notarisation) is not in place. The first install may warn that the publisher is unknown.
