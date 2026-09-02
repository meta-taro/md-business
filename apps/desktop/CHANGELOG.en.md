# Changelog — @md-business/desktop

Changes to this app. Versions follow [Semantic Versioning](https://semver.org/).

Japanese is the source of truth for this file; see [CHANGELOG.md](./CHANGELOG.md).

## 0.30.2

### Fixed

- **Two capture requests at once killed the app.** The machinery a capture uses cannot be started twice at the same time inside one process. It does not refuse — it **halts on the spot**, so the caller gets nothing back and the app disappears. Any number of windows can be open and requests from outside can arrive together, so overlap is ordinary. Captures now run one at a time; the rest wait their turn.

- **The preview pane now says what it is showing and where it comes from.** In web mode two servers can be running — the one this app builds and serves, and the project's own, declared in `md-business.yml`. Which one a pane shows depends on the open document (business documents come from the former, site parts from the latter), so the pane alone gave you no way to tell them apart. The heading now names the source and its address. **The server that is not on this pane is named too** — with only one of them written down, you cannot tell whether the other is down or simply showing somewhere else, and that changes what you do next. **What each pane shows is unchanged**: business documents are still built inside the app.

## 0.30.1

### Fixed

- **Asking from outside to open a file did nothing for site parts.** The list shows `.astro` and `.ts`, but the entry point that opens a file from outside only accepted Markdown and images, and silently dropped everything else. The caller was told it had succeeded, so with the app still sitting on "Select a document" you would carry on believing it had opened. The entry point now accepts the same range the list does. Along with it, **a file that isn't there is refused before the app is started**: that entry point only starts the app and never hears back whether it accepted the path, so a typo used to come back as a success.

- **Tabs could be picked up but not reordered — the cursor showed the "no drop" sign.** Reordering was added in 0.16.0 and has never worked on Windows since. The cause is not in the page but in the window: a window comes with a receiver for files dropped from the desktop, and while that is on, **WebView2 takes over every drag over the surface**. A reorder that never leaves the page is taken along with the rest, so a tab can be picked up and never put down. This app does not use drops from the desktop, so the receiver is now off. **It applies to every open window** — later windows are built from the first window's settings. A test fails if the setting comes back, since it would bring the same breakage with it.

## 0.30.0

### Added

- **Two folders can now be open side by side, in two windows.** Add one from "New window" in the File menu. Each window holds one folder, and keeps its own file watcher, its own preview and its own endpoint for agents. You can fix a site you are building in one window while filling in a test sheet in the next. Each window remembers its own last folder, so the same pair comes back the next time you start the app. **The taskbar and Alt+Tab now show the name of the open folder** — two identical entries tell you nothing about which is which. It is the folder name rather than the document name because an entry that renames itself every time you switch documents is impossible to follow. Up to eight windows can be open at once; past that, "New window" is greyed out. Each window keeps things running of its own, so an unbounded count is more than a machine can carry — and leaving a menu item that does nothing when pressed makes it impossible to tell a limit from a fault.

- **Opening the same folder in a second window is now refused.** The things each window keeps one of would otherwise contend for the same place. In particular the connection details for agents are written into the folder itself, and each window writes a different endpoint there. If a later window overwrites an earlier one's, **an agent you believed was connected to the first window quietly works on the other window's folder instead.** Along with the refusal, the window that already has that folder is brought to the front — if it is minimised, there is no way to go looking for it. A parent folder and a folder inside it point at different places, so both still open.

- **An agent can now take a picture of the app's window and get it back as an image** (`capture_window` over MCP). An agent can read what a document says, but **not what the app is actually drawing**. A column running off the edge, a row that never got its colour, a dialog sitting behind another — none of that shows up however many times the file is read. What is captured is the surface the app holds, not the screen, so **nothing stacked in front of it appears, and it works while the window is minimised** (capturing the screen would hand over whatever other app happened to be in front at the time). Only this app's windows can be captured — not other applications, not the desktop. The long edge is scaled down to 1400 by default (200–4000 can be asked for; small windows are not enlarged). What comes back is **exactly what the person is looking at**, so the tool's own description says to check with them before pasting it anywhere visible from outside, such as an issue or a pull request.

## 0.29.0

### Added

- **A folder can now call itself a site.** Write `mode: web` in `md-business.yml` and that folder lists HTML, CSS and JavaScript alongside Markdown, and its preview runs as a real page. **What is written in the file is a declaration, not permission to run it.** Whether it runs is decided once, by a person, on this machine. That permission does not travel with the folder (if it did, whoever received the folder would have its scripts running before they had looked inside). The declaration can be written and withdrawn from the app; the permission can be revoked afterwards. **The two are cleared separately** — withdrawing the declaration leaves the permission, and revoking the permission leaves the declaration. If one erased the other, you would always end up with either a folder you fixed for others that still runs here, or a folder you refused here that still declares itself to everyone else. The dialog also says plainly not to allow a folder whose contents you do not know.

- **Whether the preview runs scripts is now a per-folder decision.** A page that is allowed to run carries a statement of where it may load from — nothing that is not in the declaration. **The same statement is baked into the folder you export.** Being strict only in your own preview protects only your own screen; what you handed out is what other people open.

- **A dev server running outside the app can now be shown in the same pane.** Write `devServer: http://localhost:4321` under `web:` and the preview pane shows it. **The app never starts that server.** If it did, opening a folder would run the project's own commands, which would make the consent above meaningless. Starting and stopping stay in your terminal, as before; the app only shows the result. Only an address on this machine (`localhost`) is accepted.

- **Site files can now be handled by an agent** (MCP): writing, reading back, listing, and a way to write only the declaration. What is written arrives in the open window as it is (the preview changes without reopening). The app opens these **read-only** — the place to fix them is the file itself, and fixing a copy changes nothing.

- **A ```` ```data ```` block in the body now draws a table from another file in place.** Write where the table is in `source:`. Copying numbers into the body means the body is left stale the moment the table is corrected. When the block cannot be read, it does not quietly go blank: it says which line of the block failed and why.

### Fixed

- **Rewriting the declaration left the old file list in place.** Fixed.
- **Site files are no longer rebuilt when only their contents changed.** Every live update had been rebuilding all of them.

## 0.28.0

### Added

- **Markdown footnotes (`[^1]`) now read as notes.** A footnote leaves only a superscript number in place and folds its body down to the end of the document. On paper you can turn back a page; on screen, **moving your eyes to the end is enough to lose your place**. In the middle of a table or a figure, coming back means hunting for the same row again. Hovering the superscript now shows the body right there. The list at the end stays as it was — **the list is the real one and what appears inline is a copy of the same text**; printing and screen readers see only the list. It is not read twice: the superscript already points at the body at the end, so reading the copy as well would speak the same sentence twice in a row. **The back-reference arrow (`↩`) is not printed.** On screen it is the way back from the list to the body; on paper it is an unpressable glyph sitting next to the number, and readers lose time working out what it is for. The block is set smaller than body text with a rule above it, and does not inherit section-heading decoration, because notes are not a section.

### Fixed

- **The heading above the notes was printed as the English `Footnotes` even in Japanese documents.** The default heading is English, and it carries a class meant to hide it visually while leaving it for screen readers. No stylesheet here defines that class, so **the English heading was simply shown**. It is now shown deliberately, in the document's language (注釈 / Notes / 注释 / 주석), rather than hidden. The screen-reader label on the back-reference arrow follows the same language. Only the glyph is visible, so it is easy to miss, but read aloud it was one stretch of English in the middle of the document.

## 0.27.0

### Added

- **Cells can now carry notes.** The only place to record "why is this value what it is" was the `備考` column. Putting it there **loses which cell it is about** — once three reasons sit in one row, the reader cannot tell which column each belongs to. Writing it into the cell itself makes the table unreadable instead. Notes are the place for it: **body text attached to a cell, held outside the table**. On screen a small mark appears at the top-right of the cell, and hovering or focusing it shows the body (Ctrl / ⌘ + Alt + M to add; right-click to edit or delete). **They are a separate declaration from marks (`#@ mark`)**: a mark means "this changed" and goes away in the next revision, while a note means "this is why" and stays until the value changes. Merged into one, clearing marks would clear notes too. Any number can sit on one cell, kept in the order they were written rather than merged, because they have to be removable one at a time. **Rows are addressed by row ID** — by row number, inserting a single row makes the note belong to a different cell. On paper and in PDF the cell carries **only the number** and the bodies are collected at the end of the document; expanding them into the cells on paper would return to the `備考` column problem. Numbers are **assigned top-down at print time** and never stored in the file: inserting one note would renumber everything after it and the diff would stop being readable. Notes can go into a submission format too, but **only when the format says so** — the recipient decides the columns, so a column appearing unannounced breaks their import. **Neither a mistyped column name nor a note pointing at a row kept aside is silently dropped**; discarding them on load would hide the fact that a note exists at all. Agents can **read them but not write them**: a note is where a person records their own reasoning in their own words, and if the same field can be filled in by an agent, a later reader cannot tell whose reasoning it is.

## 0.26.0

### Added

- **The table can now be narrowed to just the rows you want to look at.** Past a couple of hundred rows, reaching the row you want to fix means scrolling for it. Search (Ctrl+F) only **jumps to a hit**; everything it did not hit stays on screen, so "work through every row whose `結果` is NG" was not possible. Two ways in were added: keep only the rows holding the same value as the selected cell, and keep only the rows the search matched. Each press narrows further. **Nothing is written to the file** — this is the decisive difference from rows kept aside: save while narrowed and the rows taken out of view are still there in their original places, and reopening the file clears the filter. **Exports are unaffected too.** A row silently dropping out of a submission because it was not on screen is the worst way this could break. The rows to take out are **decided at the moment you press and then held fixed**: recomputing the match continuously would make a row vanish the instant you change its `結果` from NG to OK, and a row disappearing while you are editing it looks like a fault however it is explained. For the same reason, rows added while narrowed stay visible. **Numbering is not recalculated while narrowed** — running `rowNumber()` over only the visible rows would burn a sequence with the hidden rows skipped straight into the file. It is recalculated once the filter is cleared and every row is present again. The number of rows currently out of view is always on screen; without it, rows simply look deleted.

## 0.25.0

### Added

- **A sheet sent out in a submission format can now be brought back into the source of truth once it returns.** The previous version added a way out but none back. The other side writes their results into the copy they were given, so moving those results back was a person copying cells by eye — and **a missed cell only ever shows up on their copy**, never on ours, however long we stare at it. Declare which column identifies a row and the returned table can be read straight from a paste. **Rows are never matched by position**: while the copy is with them it gets sorted, rows get inserted and unwanted rows get deleted, so "the fourth row" of what comes back has nothing to do with the fourth row that went out. **No rows are added or removed.** A key that is not in the sheet is reported and nothing else — taking in a row they added would break the numbering, the row IDs and the computed columns all at once. **Only cells whose value actually differs** are brought back, because the sheet has been edited on this side too while the copy was away, and writing every cell back would silently revert those edits. Computed columns, the row-ID column and any column the format emits twice are never written — for the last of these, when only one of the two comes back changed there is no way here to tell which side is the real one. A format that folds newlines into spaces **refuses the import outright**: a folded newline is indistinguishable from a space that was typed, so importing would strip newlines out of cells nobody touched. Pressing the button first reports **how many cells can go back, which keys did not match and which columns were left alone**; you write back after reading that. Doing it in one step hides the case where not a single key matched — "0 cells changed" also reads as "everything is already in". Undo restores whatever was written.

### Fixed

- **The browser-preview key is no longer compared in a way that takes longer the more of it is right.** The comparison stopped at the first byte that differed, so timing the response reveals the key one character at a time — far fewer attempts than guessing it whole. The server only listens locally, but anything else running on the same machine can reach it, which is precisely what the key is there to stop. The comparison now always reads to the end.

## 0.24.0

### Added

- **A test sheet can now be previewed as it will print, and exported straight to PDF, HTML or an image.** Test sheets are TSV by default, and the right pane opens them as an editing grid. A grid has no printable surface, so **no export was available at all while one was open**. When paper was required, the same content ended up being kept a second time as Markdown — and **with two copies, one of them is always out of date**. Sending the stale one is not something the sender can see. The grid itself is never printed: it squeezes column widths to fit the screen, virtualises rows and boxes the cell being edited, none of which survives on paper. Instead you switch to a "print view" laid out for the page. Header rows repeat on every page after the first, and newlines inside a cell stay newlines. Row tints are printed as a background, but **colour never carries meaning on its own** — the verdict text stays. **Rows kept aside and the row-ID column do not appear on paper either**: something absent from the table but present on the printout shows the recipient exactly what was supposed to be gone. Landscape A4 is the default, since these sheets run wide. The print view, PDF, HTML and image all go through one and the same build, so **what you checked on screen is what goes out**. Switching does not rewrite the file — entering the print view does not mark it as edited.

## 0.23.0

### Added

- **An existing repository can now be cloned into the empty folder you have open.** Until now the app could only turn a local folder into a new repository; there was **no way to bring down something that already exists on the host**. The app holds no credentials and asks for none — authentication is left to the OS git credential store and SSH. On top of that, URLs with credentials embedded, unencrypted `http://`, and schemes that can run an arbitrary command are refused at the door. When authentication does not go through, git is not allowed to ask for a username or password; it fails on the spot with a reason you can read (a child process has nobody to answer it, so once it starts asking it simply hangs where no one is looking). The clone goes into the folder you have open, and is refused unless that folder is empty.
- **Branches can be created and switched to, and a branch you just created can be pushed.** The branch list was already being read but never shown, so there was no way to switch. A branch without an upstream could not be pushed, so one could be created and never sent. The destination follows the upstream when there is one, and is only decided when there is not: `origin` if it exists, the single remote if there is exactly one, and **refused** when several exist and none is `origin` — picking the wrong one sends your contents somewhere you did not intend. There is no operating-mode setting (plain / branch / PR). What keeps anyone off main is the host's protection settings, not a screen in this app; holding it as a setting would make something unprotected **look protected**.
- **After a push, the pointer the host sends back can be opened in a browser.** Push a new branch and the host puts a "continue here" URL — the page for opening a pull request — in its output. That string is picked up and shown next to the push confirmation. The URL is never assembled here: every host shapes that page differently, and a guess leads somewhere that does not exist. No API and no token are involved. Nor is git's output handed to a browser as-is — only something that starts with `https://`, has a host, carries no credentials and is not overly long gets through. When it does not, the affordance simply does not appear and the push still succeeded. The pointer clears when it is used and when anything else is done, so an old URL cannot end up attached to the result of a different operation.

## 0.22.0

### Added

- **A sheet can now be compared against a past version, and what changed is marked.** The convention is to hand-colour what was fixed, and because that is done by hand, a row nobody remembered to colour goes out as a row that did not change. Pick a past version and the rows are matched by their IDs: changed cells, and rows and columns that the older version did not have, are marked. Rows that disappeared have nowhere to sit in the current table, so they are listed below it with their contents. Counts of changed cells, added rows and deleted rows are shown too. A version without row IDs is not compared at all, rather than being reported as unchanged.
- **Whether a review comment was actually applied is now checked against the document.** Raising a comment, replying with a plan, applying it, and confirming before answering are four separate hands, so **the record runs ahead of the work**. What happened in practice: a comment that had only been answered with a plan was marked as applied, the reply went out, and the document was still untouched — which is all the other side could see. What the author wrote about their own work cannot serve as evidence, so **the row each comment points at is checked against the version being compared**, and a comment marked as applied whose target did not change is reported in place. Closed comments are not asked for this: a comment can legitimately be closed as "not doing it", and demanding a change would leave that row red forever — and nobody keeps looking at a table whose red never clears. Nothing is said while no version is selected for comparison. A "Review comments" starter layout was added for new sheets.
- **A submission format can be declared once, and the sheet copied out in that shape.** The source of truth orders its columns for whoever writes them and leaves blanks blank. A submission follows the recipient's format: fixed column order, blanks filled with a placeholder, and no newlines inside a cell. Today someone rebuilds the paste-ready copy for every submission, and because the same steps are repeated by hand, it drifts in one particular way — **the source gets fixed and the submission does not get rebuilt**. The drift only shows on the submitted side, so looking at your own copy will never find it. Declare the format and it is one pick plus Copy to get something that pastes into a spreadsheet. Rows kept aside are left out. Filling blanks and folding newlines apply **only on the way out**; the source of truth is not rewritten.
- **Shared viewpoints can now be pulled into a sheet.** Permissions, length limits, repeated taps, tab order — the wording of these barely changes from feature to feature. They are copied out by hand per feature, so adding one viewpoint never reaches the sheets that already exist. A missed copy only ever shows up as an absence, which is not something you can spot by reading the sheet. Point at a shared table and only the viewpoints missing from this sheet are added. **Rows that are already there are left alone** — results somebody entered, steps adjusted to how things actually work, none of it is overwritten with the shared wording. It would look tidier, and nobody would see what was lost. Which columns to copy has to be stated every time: a default of "every column with the same name" would carry the `結果` column across, filling the sheet with rows that **claim to have been tried already**, and looking perfectly correct while doing so. Viewpoints that have since gone from the shared table are reported.
- **Cells can now be marked by hand.** Some cases cannot be derived from a comparison: there is no earlier version at all, the value is the same but means something different, or an unchanged cell needs marking as the counterpart of one that changed. Ctrl / ⌘ + M marks and unmarks the selection. Marking and unmarking share one key, so there is no separate way to remove them for people to forget — a stale mark going out is worse than no mark. Marks show even when nothing is being compared, since being unable to compare is exactly why they get placed by hand.

## 0.21.0

### Changed

- **The top row is now purely for moving the window.** That row is the title bar the app draws itself, and the only place to grab is whatever space the buttons leave behind. Nine controls sat there — save, exports, view toggles — and every new export ate more of the grip. All of them have moved down a row, so **anywhere on the top row now drags the window**.
- **The controls are stowed in a menu row.** The second row holds three words — File, Export, View — plus Help, with the former buttons inside them. The five export actions (PDF, HTML, image, site, open in browser) collapse into the single word "Export", so **the top row will not grow no matter how many features arrive**. Only the words themselves are clickable, so the empty space on the second row drags the window too. While a menu is open, the arrow keys move to the neighbouring menu and Esc closes it. The image size picker opens under Export, and export results appear on the right of the second row.

## 0.20.0

### Added

- **Ctrl+F now searches inside a verification sheet.** Until now the search bar only worked on the editor and the preview, so it was useless while a sheet was open as a table. Matching cells are tinted, and Enter / Shift+Enter step forward and back through them. Matches are counted per cell, so a term appearing several times in one cell is still a single stop. The search starts from the current cell and wraps to the top after the last match. Rows outside the visible area are scrolled into view, but focus stays in the search box — otherwise the next keystroke would land in a cell instead.
- **A copied range now stays outlined with a dashed border.** Nothing happened on screen after a copy, so there was no clue as to what had been taken (a spreadsheet marches a dashed border around it). The copied range is now outlined, and Esc clears it. It also clears when the document changes, since an outline left behind would no longer match what is on the clipboard. Copying a whole row outlines it the same way.
- **The AI can now ask what is open and close a given document.** Opening was all it could ask for, so there was no way to tidy up what it had opened and tabs piled up the more it was asked to do. The listing also says which document is in front and whether it has unsaved edits. Closing writes out unsaved edits first; if that write fails the document stays open and the failure is reported with its reason, so nothing carries on as though it had closed. A document that is not open cannot be closed.

### Fixed

- **Fixed selected text being invisible against the background.** The tint used behind a selection was almost the same colour as the page in both the light and the dark theme, so there was no way to see what had been selected. Both themes now carry a dedicated selection colour, and it looks the same whether the selection is in the editor, in the preview or anywhere else.

### Changed

- **Removed the empty headings (Git / Diff / AI) from the side panel.** They were listed as placeholders that could not be clicked, taking up width and showing nothing but unfinished work. Only headings with something behind them are listed now.

## 0.19.0

### Added

- **Selecting a range in a table now shows a summary of the numbers in it.** Count, sum, average, minimum and maximum appear at the bottom, so selecting a column of amounts reads out its total on the spot. Only cells that parse as numbers are counted, so headings and blanks mixed into the selection do not skew the average. Thousands separators are stripped. Sums are scaled to the finest decimal place before adding, so 0.1 + 0.2 does not come out as 0.30000000000000004. Nothing is shown for fewer than two numbers, to keep moving a single cell quiet.

## 0.18.0

### Fixed

- **Fixed choice lists being hard to use on rows near the bottom of a table.** The list is drawn by the WebView rather than by the app, and a cell close to the bottom of the visible area opens downward, hidden behind the row action bar or off the window. The direction cannot be dictated from here, so the table is now scrolled until there is room below the cell before the list opens. The last row is the end of the table and cannot be scrolled further, so space is now kept below the table — but not for a short table that already fits, which would otherwise gain a scrollbar over nothing.

## 0.17.0

### Fixed

- **Fixed opening a folder on a network share sometimes never returning.** Preparing to watch a folder walked everything underneath it and asked the other side about each entry one at a time. On a local disk that finishes at once; across a network each entry costs a round trip, so with enough of them the wait never ends. That preparation is now skipped when the folder is not local. A rename arrives as a create and a delete, both of which lead to a re-read, so what appears on screen is unchanged.
- **The app now starts without reopening a folder whose previous load never finished.** The last folder was always reopened as it was, so remembering a share that had stopped responding meant stopping in the same place on every start, with no way out from inside the app. A mark is now written before the load and cleared when it finishes. If the mark is still there on start, that folder is left closed, the app comes up empty, and the reason is shown.

## 0.16.0

### Added

- **A file handed over from outside the app now opens together with its folder.** A document passed in from another program could not be opened if it sat outside the current folder. The path is walked upward to the nearest folder under version control, and that is offered as the place to open. Nothing moves until the offer is accepted, and a drive root is never chosen — otherwise the whole machine would be listed.
- **Notes above a table are now folded when there are many.** The more conventions were listed as notes, the further the table itself was pushed down, until nothing useful was visible on opening. Four or more are folded to a count. Whether they are folded is remembered per sheet.
- **Tabs can now be reordered.** They only ever sat in the order they were opened, so two documents worth comparing drifted apart. Drag one where it belongs; the order is kept for next time.
- **A verification sheet with rows broken by a raw newline inside a cell is now reported.** This format keeps one record per line so that changes stay readable, but writing to it with another tool leaves real newlines in place and splits a record across several lines. That is hard to see on screen and ships unnoticed. The count is shown on opening and the broken row can be jumped to. It is not repaired here — guessing where the break belongs would silently change the contents.
- **A sheet can now be inspected from AI without being written to.** Every sheet in the folder is checked at once and only the broken ones are listed. No row contents are returned.
- **A URL written inside ordinary text is now clickable.** A reference written into a step or a note was plain text unless the whole column was typed as a URL. Now only the URL part responds, and the text around it is left as it is. Trailing punctuation is not taken as part of the address.

### Fixed

- **Fixed the tree on the left still pointing elsewhere after switching tabs.** Switching to a document inside a collapsed folder left no way to tell from the screen what was being viewed. The ancestors are now expanded and the row is scrolled into view.

## 0.15.0

### Added

- **Images can now be written out in bulk, one per row of a table.** Only one could be shot at a time, so building a set of price tags or name cards — same layout, different contents — meant rewriting the document and shooting again once per item. Declaring the table to draw from and the name to give each file at the top of the document makes `{{column}}` in the body take that row's value, and one image per row lands in the same folder as the document. What was shot stays written in the document, so producing the same set again needs no memory of which buttons were pressed. Progress is shown while shooting and it can be stopped partway; whatever was written before stopping stays.
- **A font that is not installed is now refused before shooting.** A missing font is silently substituted, so noticing after a hundred images means producing all of them again. The names of the missing fonts are reported and nothing is written.

## 0.14.0

### Added

- **A record of the work asked of the AI now stays in the folder.** It used to scroll past on screen while the app was open and vanish when it closed. There was no way to check afterwards what had been written to which file, so tracing "what changed in last week's work" meant inferring it from the commit history. The record accumulates inside the workspace, one line per entry, split by day, so the existing filtering and aggregation tools work on it as they are. Whether to keep it, how many days to hold, and whether to fold or drop what expires are decided per folder (the default keeps and folds).
- **Network recordings (`.har`) can now be read.** Looking into "it works on screen but fails over the wire" starts with finding which exchange failed, and there was nothing in the app for that. The format written by browser developer tools and capture tools is read as-is. An overview comes first — count, time range, by status, by host, slowest — and one entry is then pointed at for its contents. Response bodies come back only when asked for; most of them are images and scripts and are no help to an investigation.

### Fixed

- **Cookie values inside a network recording no longer come back unredacted.** Cookies are named freely, so a rule that decides by the name let them through. When the container itself says these are cookies, every value inside is redacted; the names remain, so which cookies were attached can still be read.

## 0.13.0

### Added

- **Several documents can now be open at once, with tabs to move between them.** Only one could be open, which ruled out reading a spec against its test sheet, or two invoices side by side. A tab with unsaved work is saved before it closes. If a file changes outside the app while another tab is in front, a mark says so on return. Test sheets remember, per document, which cell was selected and how far it was scrolled.
- **Figures can now be drawn from the numbers in a table.** A `chart` block in the text says which table, which columns, and how to draw them: line, bar, or pie. The numbers stay in the table, so correcting the table changes the figure on the spot — nothing is copied into the picture. When a figure cannot be drawn, the reason and the original block both remain.

### Fixed

- **An image export no longer drops the pictures placed in the document.** The shot is taken in a separate window, and the images were never carried there. The preview showed them, so this was invisible until the exported file was opened.
- **Diagrams (Mermaid) no longer come out as a code block in HTML, image, and site exports.** They appeared on screen and in PDF, so only the exports fell back to text.

## 0.12.0

### Added

- **Images can now be opened and viewed inside the app.** They did not appear in the file list, so checking a photo or a screenshot meant opening the folder outside the app. Fit-to-window and actual-size can be toggled, and the dimensions and file size are shown.
- **Images placed in a document now appear in the preview and in exports.** Pointing at a neighbouring file with `![](./figure.png)` produced nothing at all. A single-file HTML export carries the images with it, so nothing breaks on the receiving end. A static site export carries images as files rather than embedding them into every page, so reusing one photo across many documents costs nothing extra. The browser preview, before any export, shows the same thing.

### Changed

- **A missing image, or one pointing outside the folder, no longer takes the document down with it.** Only that one image is dropped; the rest of the text and the other images read as before.

### Known limitations

- An image written directly as HTML, such as `<img src="figure.png">`, does not appear: raw HTML is dropped when the text is turned into HTML. The `![](figure.png)` form works.

## 0.11.0

### Added

- **You can now choose which files go into a commit.** Everything that had changed was taken as one, so holding a half-written file meant either putting it all in a single commit or reaching for `git` outside the app.
- **Commit history is now visible in the source control panel.** Seeing only the current changes meant leaving the app just to check what went in last.
- **A folder that is not under Git can now be made into a repository on the spot.** Until now the source control features were unavailable entirely, and `git init` had to be run with another tool first.
- **A share link now opens the same document on the other person's machine.** Even when documents are shared through one repository, *which file* had to be conveyed by voice or chat. Hand over the link and the recipient lands in the same place. The app starts if it is not running, and comes to the front if it is.
- **An AI can now say which document to open** (built-in MCP server). If that folder is not open yet, it is opened first.

### Changed

- **The window no longer freezes while history is read or a repository is created.** On a repository with many commits, nothing responded for the whole read.

### Fixed

- **Asking an AI to commit specific files no longer sweeps in other changes.** The named files were added to the commit, but anything staged separately beforehand went in with them — and that only shows up later, in the history.

## 0.10.1

### Fixed

- **Typing in a test sheet no longer stalls.** When a column pointed at another sheet — a link, a count, or a list of choices read from elsewhere — the referenced file was read again on every keystroke. Which file gets read is decided by the sheet's header alone and has nothing to do with what you type. If that file lived somewhere not local, such as a shared folder, the read time landed directly on the keystroke.
- **Editing a test sheet after opening a preview no longer gets heavy.** While the table was on screen, the preview nobody was looking at was still being rebuilt from the whole document on every keystroke.

## 0.10.0

### Added

- **Investigation findings can now be kept in a form you can hand over as-is**. Opening an investigation report renders it in the preview. The evidence field takes no prose — only a reference to a file and the lines inside it. This is to keep out reports written from "it looked like", and reports whose source file can no longer be confirmed later.
- **Several logs can now be interleaved in time order** (timeline). Every line keeps the file and line number it came from. What you need while investigating is the order across logs, not the order inside one log, and until now that was matched up by hand.
- **The same HTML you see in the preview can now be written out as a single file**. Until now the only output was PDF, which is bound to paper and suits neither reading on screen nor sending to someone. Images and styling all go into that one file, so it does not fall apart at the other end.
- **The documents in a folder can now be written out together as a static site**. A single-file export is not enough to hand over something made of several documents. The output goes to `dist/` directly under the folder, and links between documents still work.
- **You can now view the open folder in a browser before writing anything out**. It is served at an address that only reaches this PC, so nothing is visible from outside. You can preview without creating `dist/`.
- **The open document can now be written out as PNG or JPEG** (Windows). No need to open the PDF and re-capture it to paste into a deck or a chat. It is captured with the display engine the app already carries, so the installer does not grow.
- **The preview can now be viewed at phone width**. Where lines wrap on a narrow screen cannot be told without changing the width and letting it re-flow. Scaling it down only makes the text smaller — the wrapping stays as it was on a PC.
- **An AI can now switch which document is shown** (built-in MCP server). Until now the only way to move the display was PDF export, so even just showing something ran all the way to printing. It will not open anything outside the folder you have open.

### Changed

- **Startup is lighter again**. The JS read before the window appears went from 1,009KB to 298KB. With nothing opened yet, it was waiting on six validators, the whole PDF renderer, and the full changelog.
- **Opening a document now reads only what that document's format needs**. Opening a single invoice was loading the validators for API specs and database designs too.
- **How a document's accent colour (headings, rules, emphasis) is taken has been brought into one place**. The same handling was copied per format, so a difference in one of them only showed up once you lined the outputs up side by side. A colour that cannot be read is now reported instead of being silently dropped.

### Fixed

- **Black windows no longer flash open on every startup**. On Windows three console windows opened before the app became usable. They take the foreground, so clicks during that time were lost.
- **Fixed the display jumping when you scroll with a cell selected in the verification grid**. It was pulled back to the selected row, which made longer sheets unreadable.
- **Fixed the app freezing when opening a folder over the network (a shared folder)**. Once it happened, restoring the folder at the next startup put it in the same state. The folder scan was blocking the main work.
- **Fixed the freeze that happened when you kept typing after a pause**. The change check that runs after an autosave was holding the screen for its whole duration. File reads and writes and the git calls were moved off the path that blocks the screen.
- **Fixed Ctrl+Z / Ctrl+Y not working while editing a cell in the verification grid**. Undo while editing was left to the browser, where nothing happens by design, so pressing it did nothing. Undo also now steps back a whole cell's worth of typing at once instead of one character at a time.
- **Fixed the table shaking and scrolling unevenly on sheets that have rows holding long text**. The height of the whole table changed as you scrolled, by the amount the wrapped rows had grown.

## 0.9.0

### Added

- **Diagrams (Mermaid) are now drawn in the preview**. Flowcharts and sequence diagrams written in a design document appear as diagrams instead of sitting there as code. Until now, the place you wrote a diagram and the place a diagram appeared were not the same place.
  - A document with no diagrams in it does not load the drawing engine at all, so it stays as light as before for anyone not using diagrams.
  - A diagram that fails to draw is left as the original text, so unfinished markup does not swallow the surrounding page.
  - Diagrams carry into the PDF as well — sharp at any zoom, and kept from breaking across a page.
- **A column in a test sheet can now point at another sheet**. Declare in the header which column of which sheet a value is supposed to appear in, and the cross-check runs on its own. The lookup table you used to keep by hand with spreadsheet functions is no longer needed. The check runs both ways: values missing from the destination, and rows nothing points at.
- **The number of times a row is pointed at can now be counted as a column**. "How many tests hang off this checkpoint" no longer has to be recounted every time the sheet is opened.
- **A set of choices can now be pulled from a column of another sheet**. Listing choices in the column declaration means editing every sheet's header whenever the list changes. If the list already exists as a sheet, that sheet can be the source of truth instead.
  - When the destination cannot be read, the column is simply not checked. No choices are offered, but the values already written stay as they are. Turning every existing value red just because a sheet is not open would bury the real violations under red nobody can fix.
- **Right-clicking a row number in the test grid now brings up the row operations** (duplicate / copy / clear / set aside / delete). The row toolbar below has grown and folds up in a narrow window, so the most-used ones are also reachable from the row itself. Only the row you right-clicked is affected, and the selection moves to it as the menu opens, so which row will be affected is visible before you press.
- **Who last changed a row, and when, can now be seen on the row** (history). Several people touch different rows of the same test sheet, so a row marked NG gave no clue whether it was today's result or one left over from six months ago. Point at the row number and you get "3 days ago · who · what the change was". Reading the history costs a lookup every time, so it is off by default and turned on from the row toolbar. Rows with no history show nothing.
- **AI can now investigate a log without reading all of it** (built-in MCP server). Six tools: search lines, take a line range, filter one-record-per-line logs, count by time bucket or key, merge separate logs into one timeline, and save what was extracted as evidence. Handing over a whole log exhausts the reading budget before the investigation starts, and lets credentials and email addresses through unredacted. These are a separate entrance from the business-document tools.
- **Added a format for investigation reports**. Log investigations and network investigations share one format. The evidence field takes structured references only, not prose, and files listed require a hash — so that "it looked that way" cannot slip into the record, and neither can a file nobody can identify later. For now it is available from the AI side (MCP).

### Changed

- **Startup is lighter**. Of the roughly 1,660KB read before the window appeared, over 60% was the editor, none of which is needed until something is opened. It is now loaded when you open a file.
- **In-cell line breaks now match spreadsheets**. Alt + Enter, Ctrl + Enter, and Shift + Enter all insert a line break; which one means "line break" differs between spreadsheet applications, so all three are accepted rather than committing the cell on a misremembered one. Enter on its own still commits and moves down.
- **Columns that accept a line break are now marked in the header** (a ↵ after the column name). Which columns accept one was invisible until you tried, and in a column that does not, the keystroke commits and drops you to the row below.

### Fixed

- **Links inside the app did nothing when clicked.** "See more" in the update notice, the pointers in Help, external links written in a preview or a test sheet, and "Show in folder" from a file's right-click menu were all unresponsive. The permission to open a browser or a file explorer was missing the list of destinations it was allowed to open, so the app itself refused the request. Nothing was shown when it was refused, so from the outside there was no way to tell whether the app was broken or the click was wrong.
  - A test now fails if the same gap reappears. A gap like this passes both the build and the type check, so nobody finds it until a person clicks.
- **Fixed typing in the test grid replacing one character at a time, and losing focus.** A second keystroke wiped the first, and focus left the field mid-conversion, so a table could not be filled in one pass.
- Cleared the outstanding dependency advisories.

## 0.8.0

### Added

- **Right-click a file to see what it actually is** ("File info"). Size, modification time, line count, character encoding, line endings, SHA-256, and how Git sees it, all in one place. You can check whether a file someone sent you is really what they said it was, where garbled text is coming from, or whether a change is still uncommitted — without opening another tool.
  - Size and modification time appear first; the values that require reading the whole file (line count, encoding, SHA-256) catch up afterwards. Right-clicking a large file should not freeze the window.
  - Encoding is only reported as far as a BOM and UTF-8 validity can tell. Guessing "probably Shift_JIS" would get believed, converted, and the file destroyed.
- **AI can now quote a repeating part of JSON or XML as a Markdown table**. A list of line items copies into a document without losing a column or shifting the alignment. Anything that could not be put in the table — items that branch further, items appearing more than once in a row, rows past the limit — is reported by name or count rather than dropped in silence. A broken table still looks like a table, so a missed value is hard for a person to spot.

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
