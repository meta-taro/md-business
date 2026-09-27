# Third-party notices

md-business itself is MIT licensed (see [LICENSE](./LICENSE)). The desktop app ships with the
JavaScript dependencies below bundled into it. This file lists everything that is **not** MIT or
ISC, because those two are already covered by the same terms md-business is released under.

Rust crates linked into the Tauri binary are not enumerated here; run `cargo tree` in
`apps/desktop/src-tauri` for that list.

## elkjs — EPL-2.0 OR GPL-3.0-or-later

Used through [zumen](https://github.com/meta-taro/zumen) to lay out architecture diagrams.

We take it under the **Eclipse Public License 2.0**. The unmodified source of the version we bundle
is available from <https://github.com/kieler/elkjs> and from the npm registry
(`npm pack elkjs@0.12.0`). We have not modified it.

Full text: <https://www.eclipse.org/legal/epl-2.0/>

## Other non-MIT / non-ISC dependencies

| Package | License |
| ------- | ------- |
| `dompurify` | MPL-2.0 OR Apache-2.0 |
| `@chevrotain/types` | Apache-2.0 |
| `@tauri-apps/api` | Apache-2.0 OR MIT |
| `@tauri-apps/plugin-dialog` | MIT OR Apache-2.0 |
| `@tauri-apps/plugin-opener` | MIT OR Apache-2.0 |
| `@tauri-apps/plugin-process` | MIT OR Apache-2.0 |
| `@tauri-apps/plugin-updater` | MIT OR Apache-2.0 |
| `json-schema-typed` | BSD-2-Clause |
| `d3-array`, `d3-ease`, `d3-path`, `d3-sankey`, `d3-shape` | BSD-3-Clause |
| `fast-uri`, `qs`, `rw` | BSD-3-Clause |
| `robust-predicates` | Unlicense (public domain) |
| `khroma` | MIT (stated in its README; no `license` field in its `package.json`) |

`dompurify` is dual licensed; we take it under Apache-2.0. The Tauri packages are dual licensed; we
take them under MIT.

## How this list was produced

```
pnpm --filter @md-business/desktop licenses list --prod
```

Re-run it after changing dependencies and update this file if anything outside MIT / ISC appears.
