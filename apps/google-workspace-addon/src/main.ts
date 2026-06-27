/// <reference types="google-apps-script" />

import { parseMdTable, mdTableToValues } from './lib/mdTable.js';
import validateTestSpec from '@md-business/schema-test-spec/validate';
import {
  planSheetWriteOps,
  applySheetValuesToSpec,
  validateSheetValues,
  resolveSheetName,
  type SheetValidationIssue,
  type SheetWriteOps,
} from './lib/testSpecSheetOps.js';
import {
  buildContentsUrl,
  buildContentsPutPayload,
  maskPat,
  parseRepositoryField,
  type RepoRef,
} from './lib/githubApi.js';
import {
  extractFrontmatter,
  appendColumnToFrontmatter,
  removeLastColumnFromFrontmatter,
  applyTestSpecTemplate,
  type ColumnType,
  type TestSpecTemplateKey,
} from './lib/frontmatterEdit.js';
import { validateUploadedMarkdown } from './lib/uploadMarkdown.js';
import {
  parseTestSpecForSidebar,
  type ParseForSidebarResult,
} from './lib/parseTestSpecForSidebar.js';
import { buildPushPlan } from './lib/pushTestSpec.js';

const KEY_GITHUB_PAT = 'GITHUB_PAT';

/**
 * Workspace Add-on のホーム画面（Docs / Sheets / Slides 共通カード）。
 * Why: アドオンを開いた直後にユーザが「サイドバーを開く」アクションへ到達できるようにする。
 *      Workspace Add-on は homepage trigger をエントリポイントにする規約。
 */
export function onHomepage(_e: unknown): GoogleAppsScript.Card_Service.Card {
  const card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle('md-business'))
    .addSection(
      CardService.newCardSection()
        .addWidget(
          CardService.newTextParagraph().setText(
            'Markdown 業務文書を Docs / Sheets / Slides ⇔ md で双方向編集します。',
          ),
        )
        .addWidget(
          CardService.newTextButton()
            .setText('サイドバーを開く')
            .setOnClickAction(CardService.newAction().setFunctionName('showSidebar')),
        ),
    )
    .build();
  return card;
}

/**
 * Editor Add-on 互換のメニュー追加トリガ。Sheets 側でメニュー「アドオン → md-business → サイドバー」を生成。
 * Why: Workspace Add-on UI とは別経路で Apps Script Editor 直開きでも動作確認できるよう残す。
 */
export function onOpen(_e: unknown): void {
  try {
    const ui = SpreadsheetApp.getUi();
    ui.createAddonMenu().addItem('サイドバーを開く', 'showSidebar').addToUi();
  } catch {
    // Docs / Slides の onOpen からも呼ばれる可能性があるため、Sheets 以外では握りつぶす。
  }
}

export function onInstall(e: unknown): void {
  onOpen(e);
}

export function showSidebar(): void {
  const html = HtmlService.createHtmlOutputFromFile('Sidebar').setTitle('md-business');
  SpreadsheetApp.getUi().showSidebar(html);
}

export function getSidebarHtml(): string {
  return HtmlService.createHtmlOutputFromFile('Sidebar').getContent();
}

/**
 * Markdown table 文字列を現在の Sheet にインポートする（雛形）。
 *
 * NOTE: Sidebar からは非露出（Issue #21 / 2026-06-22）。schema-test-spec v0.7.0 完成に伴い、
 * frontmatter の `列定義` から DataValidation + ConditionalFormat 入りシートを生成する本命機能は
 * `setupTestSpecSheet` (`検証シート: セットアップ` ボタン) に統一。本関数は Apps Script の
 * 公開シンボルとして残置するが、将来 UI に再露出する場合は本命機能と明確にラベル区別すること。
 */
export function importMarkdownTableToActiveSheet(markdown: string): {
  ok: true;
  rows: number;
} | {
  ok: false;
  error: string;
} {
  const table = parseMdTable(markdown);
  if (!table) {
    return { ok: false, error: 'No Markdown table detected in input.' };
  }
  const values = mdTableToValues(table);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const range = sheet.getRange(1, 1, values.length, values[0]?.length ?? 0);
  range.setValues(values);
  return { ok: true, rows: values.length };
}

/**
 * 検証シート frontmatter（fenced markdown 形式の文字列）を受け取り、現在の Sheet を
 * - 1 行目に列名
 * - 各列に DataValidation (enum→list / date / number / checkbox / url)
 * - visual に従う ConditionalFormat（行背景 / セル背景 / 文字色）
 * - 1 行目固定（FrozenRows）
 * で初期化する（schemaToSheet）。
 *
 * Why: PdM 決定 2026-06-18 D-1。検証シートは spec 駆動でセル制約を自動投入する。
 *      Apps Script API 呼び出し部分は純粋関数 `planSheetWriteOps` の結果を流すだけにし、
 *      バリデーション・優先度判定は副作用ゼロでテスト可能な層に閉じる。
 */
export function setupTestSpecSheet(markdownSource: string): {
  ok: true;
  columns: number;
  dataValidations: number;
  conditionalFormats: number;
  bodyRows: number;
  columnWidths: number;
  columnWraps: number;
} | {
  ok: false;
  error: string;
} {
  const parsed = parseTestSpec(markdownSource);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const ops = planSheetWriteOps(parsed.spec, parsed.body);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  applyOpsToSheet(sheet, ops);

  return {
    ok: true,
    columns: ops.headerValues.length,
    dataValidations: ops.dataValidations.length,
    conditionalFormats: ops.conditionalFormats.length,
    bodyRows: ops.bodyRows.length,
    columnWidths: ops.columnWidths.length,
    columnWraps: ops.columnWraps.length,
  };
}

/**
 * 現在のシートを spec に照らしてバリデーションする（validateSheet）。
 * D-1 確定設計: 検出して通知（捨てない／取り込まない）。
 * - issue ごとに該当セルに `setNote` で日本語メッセージを残す
 * - 結果のサマリをサイドバーに返す
 */
export function validateActiveTestSpecSheet(markdownFrontmatter: string): {
  ok: true;
  issues: SheetValidationIssue[];
} | {
  ok: false;
  error: string;
} {
  const parsed = parseTestSpec(markdownFrontmatter);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const values = sheet.getDataRange().getValues();
  const issues = validateSheetValues(parsed.spec, values);
  annotateIssues(sheet, issues);
  return { ok: true, issues };
}

/**
 * 現在のシートを spec に適用し、frontmatter + body を結合した md 文字列を返す（sheetToSchema）。
 * Why: Phase C-2 手動エクスポート経路。Phase 3C で onEdit + GitHub API による auto-commit に拡張する。
 */
export function exportTestSpecMarkdown(markdownFrontmatter: string): {
  ok: true;
  markdown: string;
} | {
  ok: false;
  error: string;
} {
  const parsed = parseTestSpec(markdownFrontmatter);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const values = sheet.getDataRange().getValues();
  const { body } = applySheetValuesToSpec(parsed.spec, values);

  const fm = extractFrontmatterBlock(markdownFrontmatter);
  const markdown = fm ? `${fm}\n\n${body}\n` : body;
  return { ok: true, markdown };
}

function parseTestSpec(src: string): ParseForSidebarResult {
  return parseTestSpecForSidebar(src, validateTestSpec);
}

function extractFrontmatterBlock(src: string): string | null {
  const { yaml } = extractFrontmatter(src);
  if (yaml === '') return null;
  return `---\n${yaml}\n---`;
}

function applyOpsToSheet(
  sheet: GoogleAppsScript.Spreadsheet.Sheet,
  ops: SheetWriteOps,
): void {
  if (ops.headerValues.length === 0) return;
  renameSheetFromOps(sheet, ops.sheetName);
  sheet.getRange(1, 1, 1, ops.headerValues.length).setValues([ops.headerValues]);
  sheet.setFrozenRows(ops.frozenRows);
  writeBodyRowsToSheet(sheet, ops);
  applyDataValidations(sheet, ops);
  applyConditionalFormats(sheet, ops);
  applyColumnWidths(sheet, ops);
  applyColumnWraps(sheet, ops);
}

/**
 * spec の `幅倍率` を Sheet 列幅に反映する。
 * 100 px base × widthScale。指定のない列は Sheet デフォルト（100 px）のまま。
 */
function applyColumnWidths(
  sheet: GoogleAppsScript.Spreadsheet.Sheet,
  ops: SheetWriteOps,
): void {
  for (const w of ops.columnWidths) {
    sheet.setColumnWidth(w.columnIndex + 1, w.widthPx);
  }
}

/**
 * spec の `折り返し` を Sheet の text-wrap に反映する。デフォルト wrap=true。
 * 人が読むスプレなので全行・全列に適用（ヘッダー含む）。
 */
function applyColumnWraps(
  sheet: GoogleAppsScript.Spreadsheet.Sheet,
  ops: SheetWriteOps,
): void {
  const rows = Math.max(sheet.getMaxRows(), 1);
  for (const w of ops.columnWraps) {
    sheet.getRange(1, w.columnIndex + 1, rows, 1).setWrap(w.wrap);
  }
}

/**
 * bodyRows を 2 行目以降に setValues する。
 * Why: DataValidation 適用「前」に値を書き込むことで、setAllowInvalid(true) でも
 *      警告マーカーが立たない。空配列なら何もせずスキップ。
 */
function writeBodyRowsToSheet(
  sheet: GoogleAppsScript.Spreadsheet.Sheet,
  ops: SheetWriteOps,
): void {
  if (ops.bodyRows.length === 0) return;
  const numCols = ops.headerValues.length;
  const normalized = ops.bodyRows.map((row) => {
    const padded = row.slice(0, numCols);
    while (padded.length < numCols) padded.push('');
    return padded;
  });
  sheet.getRange(2, 1, normalized.length, numCols).setValues(normalized);
}

function renameSheetFromOps(
  sheet: GoogleAppsScript.Spreadsheet.Sheet,
  desiredName: string,
): void {
  if (!desiredName) return;
  if (sheet.getName() === desiredName) return;
  const spreadsheet = sheet.getParent();
  const existing = spreadsheet
    .getSheets()
    .filter((s) => s.getSheetId() !== sheet.getSheetId())
    .map((s) => s.getName());
  const resolved = resolveSheetName(desiredName, existing);
  sheet.setName(resolved);
}

function applyDataValidations(
  sheet: GoogleAppsScript.Spreadsheet.Sheet,
  ops: SheetWriteOps,
): void {
  const lastRow = Math.max(sheet.getMaxRows() - 1, 1);
  for (const v of ops.dataValidations) {
    const range = sheet.getRange(2, v.columnIndex + 1, lastRow, 1);
    const builder = SpreadsheetApp.newDataValidation().setAllowInvalid(true);
    switch (v.kind) {
      case 'list':
        if (v.values) builder.requireValueInList(v.values, true);
        break;
      case 'date':
        builder.requireDate();
        break;
      case 'number':
        if (v.min !== undefined && v.max !== undefined) {
          builder.requireNumberBetween(v.min, v.max);
        } else {
          builder.requireNumberGreaterThan(Number.MIN_SAFE_INTEGER);
        }
        break;
      case 'checkbox':
        builder.requireCheckbox();
        break;
      case 'url':
        builder.requireTextIsUrl();
        break;
    }
    range.setDataValidation(builder.build());
  }
}

function applyConditionalFormats(
  sheet: GoogleAppsScript.Spreadsheet.Sheet,
  ops: SheetWriteOps,
): void {
  if (ops.conditionalFormats.length === 0) return;
  const lastRow = Math.max(sheet.getMaxRows() - 1, 1);
  const rules = sheet.getConditionalFormatRules();
  const columnCount = ops.headerValues.length;

  for (const c of ops.conditionalFormats) {
    const range =
      c.scope === 'row'
        ? sheet.getRange(2, 1, lastRow, columnCount)
        : sheet.getRange(2, c.columnIndex + 1, lastRow, 1);
    const ruleBuilder = SpreadsheetApp.newConditionalFormatRule().setRanges([range]);

    if (c.scope === 'row') {
      const colLetter = columnLetter(c.columnIndex + 1);
      ruleBuilder.whenFormulaSatisfied(`=$${colLetter}2="${escapeFormulaString(c.matchValue)}"`);
    } else {
      ruleBuilder.whenTextEqualTo(c.matchValue);
    }

    if (c.backgroundColor) ruleBuilder.setBackground(c.backgroundColor);
    if (c.color) ruleBuilder.setFontColor(c.color);
    rules.push(ruleBuilder.build());
  }

  sheet.setConditionalFormatRules(rules);
}

function annotateIssues(
  sheet: GoogleAppsScript.Spreadsheet.Sheet,
  issues: ReadonlyArray<SheetValidationIssue>,
): void {
  for (const issue of issues) {
    if (issue.col <= 0) continue;
    const cell = sheet.getRange(issue.row, issue.col);
    cell.setNote(formatIssueNote(issue));
  }
}

function formatIssueNote(issue: SheetValidationIssue): string {
  switch (issue.kind) {
    case 'unknown_column':
      return `未知の列「${issue.headerName ?? ''}」: frontmatter columns に定義されていません`;
    case 'missing_column':
      return `必須列「${issue.headerName ?? ''}」が見つかりません`;
    case 'enum_out_of_values':
      return `enum 値「${issue.cellValue ?? ''}」は frontmatter columns.values にありません`;
    case 'invalid_date':
      return `日付が ISO-8601 (YYYY-MM-DD) 形式ではありません: ${issue.cellValue ?? ''}`;
    case 'invalid_number':
      return `数値として解釈できません: ${issue.cellValue ?? ''}`;
    case 'number_out_of_range':
      return `数値が許容範囲外です: ${issue.cellValue ?? ''}`;
    case 'invalid_checkbox':
      return `チェックボックスは TRUE/FALSE のみ受け付けます: ${issue.cellValue ?? ''}`;
    case 'invalid_url':
      return `URL は http:// または https:// で始める必要があります: ${issue.cellValue ?? ''}`;
  }
}

function columnLetter(index1: number): string {
  let n = index1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function escapeFormulaString(s: string): string {
  return s.replace(/"/g, '""');
}

// ---------------------------------------------------------------------------
// GitHub Push (manual button)
// ---------------------------------------------------------------------------
// Why: Workspace Add-on context は OAuth scope `script.scriptapp` を許可しない
//      ため、onEdit installable trigger による 2 秒 debounce auto-sync が
//      動かない（Google 公式制限）。代わりに「git push」と同じメンタルモデルで
//      ユーザが保存したい瞬間に 1 回ボタンを押す形にする。trigger 不要 →
//      編集中の小刻みな commit で履歴が汚れる問題も同時に解決する。
// PAT は baseline §15 により PdM (田中さん) が手動投入する。AI は投入しない。

/**
 * GitHub PAT を UserProperties に保存する（サイドバー経由）。
 * Why: baseline §15 により credential 投入は人間のみ。サイドバーで PdM 自身が
 *      貼り付けて保存する経路を提供する（PropertiesService の Editor 直編集よりも安全）。
 */
export function setGithubPat(pat: string): { ok: true } | { ok: false; error: string } {
  if (typeof pat !== 'string' || pat.trim().length === 0) {
    return { ok: false, error: 'PAT が空です。' };
  }
  PropertiesService.getUserProperties().setProperty(KEY_GITHUB_PAT, pat.trim());
  return { ok: true };
}

export function clearGithubPat(): { ok: true } {
  PropertiesService.getUserProperties().deleteProperty(KEY_GITHUB_PAT);
  return { ok: true };
}

export function hasGithubPat(): boolean {
  const pat = PropertiesService.getUserProperties().getProperty(KEY_GITHUB_PAT);
  return typeof pat === 'string' && pat.length > 0;
}

/**
 * サイドバー初期化時に「PAT は登録済みです」を可視化するためのマスク値を返す。
 * Why: 投入後に画面に何も出ないと、PdM は「保存できたのか？」を毎回不安になる。
 *      完全表示は秘密を画面に晒すため不可、頭4 + 末尾4 のみ可視化する。
 *      未登録時は null（サイドバー側で未設定 UI を出す）。
 */
export function getMaskedPat(): string | null {
  const pat = PropertiesService.getUserProperties().getProperty(KEY_GITHUB_PAT);
  return maskPat(pat);
}

/**
 * サイドバーの textarea 内容から push 先 RepoRef をプレビュー用に抽出する純粒度の API。
 * Why: 「コミット先リポジトリ」を frontmatter で指定したあと、push 前にユーザが
 *      「どこに行くのか」を視覚で確認できるようにする。サイドバーから直接呼ぶ。
 */
export function previewPushTarget(markdownSource: string): RepoRef | null {
  return parseRepositoryField(markdownSource);
}

/**
 * Phase 3E: アイコンパレット UX 用の純粋関数 expose 層。
 * サイドバーが google.script.run 経由で呼び、frontmatter を直書きせず
 * 「列名入力 + アイコンクリック」で columns を編集できるようにする。
 * 副作用なし (SpreadsheetApp / PropertiesService に触れない)。
 */
export function appendTestSpecColumn(
  currentSrc: string,
  name: string,
  type: string,
  values?: string[] | null,
): { ok: true; newSrc: string } | { ok: false; error: string } {
  const column =
    values && values.length > 0
      ? { name, type: type as ColumnType, values }
      : { name, type: type as ColumnType };
  return appendColumnToFrontmatter(currentSrc, column);
}

export function removeLastTestSpecColumn(
  currentSrc: string,
): { ok: true; newSrc: string } | { ok: false; error: string } {
  return removeLastColumnFromFrontmatter(currentSrc);
}

export function applyTestSpecTemplateAction(
  templateKey: string,
): { ok: true; newSrc: string } | { ok: false; error: string } {
  if (templateKey !== 'minimal' && templateKey !== 'full' && templateKey !== 'clear') {
    return { ok: false, error: `unknown template: ${templateKey}` };
  }
  return { ok: true, newSrc: applyTestSpecTemplate(templateKey as TestSpecTemplateKey) };
}

export function validateUploadedMarkdownAction(
  content: string,
  fileName: string,
): { ok: true; src: string } | { ok: false; error: string } {
  return validateUploadedMarkdown(content, fileName);
}

/**
 * 「GitHub に push」ボタン押下時のエントリポイント。
 * サイドバーの textarea 内容（frontmatter + 本文）と現在の active sheet から、
 * 検証 + markdown 組立 + GitHub Contents API への PUT までを 1 ショットで行う。
 * 副作用層（SpreadsheetApp / PropertiesService / UrlFetchApp）に閉じ、
 * 検証・markdown 組立は lib/pushTestSpec.buildPushPlan に委譲する。
 */
export function pushTestSpecToGithub(markdownSource: string): {
  ok: true;
  commitSha: string;
  commitUrl: string;
  bytes: number;
} | {
  ok: false;
  error: string;
} {
  const pat = PropertiesService.getUserProperties().getProperty(KEY_GITHUB_PAT);
  if (pat === null || pat.length === 0) {
    return {
      ok: false,
      error: 'GitHub PAT が未設定です。サイドバーから登録してください。',
    };
  }
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const sheetName = sheet.getName();
  const values = sheet.getDataRange().getValues();
  const plan = buildPushPlan({
    markdownSource,
    sheetValues: values,
    sheetName,
    isoTimestamp: new Date().toISOString(),
    validate: validateTestSpec,
  });
  if (!plan.ok) {
    return { ok: false, error: plan.error };
  }
  return pushMarkdownToGithub(pat, plan.repoRef, plan.markdown, plan.commitMessage);
}

function pushMarkdownToGithub(
  pat: string,
  repoRef: RepoRef,
  markdown: string,
  commitMessage: string,
): { ok: true; commitSha: string; commitUrl: string; bytes: number } | { ok: false; error: string } {
  const contentBase64 = Utilities.base64Encode(markdown, Utilities.Charset.UTF_8);
  const url = buildContentsUrl(repoRef);
  const headers = {
    Authorization: `Bearer ${pat}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  let existingSha: string | undefined;
  const getRes = UrlFetchApp.fetch(url, {
    method: 'get',
    headers,
    muteHttpExceptions: true,
  });
  const getCode = getRes.getResponseCode();
  if (getCode === 200) {
    try {
      const body = JSON.parse(getRes.getContentText());
      if (body && typeof body.sha === 'string') existingSha = body.sha;
    } catch {
      // sha 取得失敗は無視して新規 commit として進める（404 と同じ扱い）
    }
  } else if (getCode !== 404) {
    return {
      ok: false,
      error: `GET ${repoRef.path} で ${getCode} が返りました。`,
    };
  }

  const putPayload = buildContentsPutPayload(
    existingSha === undefined
      ? {
          message: commitMessage,
          contentBase64,
          branch: repoRef.branch,
        }
      : {
          message: commitMessage,
          contentBase64,
          branch: repoRef.branch,
          sha: existingSha,
        },
  );
  const putRes = UrlFetchApp.fetch(url, {
    method: 'put',
    headers: { ...headers, 'Content-Type': 'application/json' },
    payload: JSON.stringify(putPayload),
    muteHttpExceptions: true,
  });
  const putCode = putRes.getResponseCode();
  if (putCode !== 200 && putCode !== 201) {
    return {
      ok: false,
      error: `PUT ${repoRef.path} で ${putCode} が返りました: ${putRes
        .getContentText()
        .slice(0, 200)}`,
    };
  }
  let commitSha = '';
  try {
    const body = JSON.parse(putRes.getContentText());
    if (body && body.commit && typeof body.commit.sha === 'string') commitSha = body.commit.sha;
  } catch {
    // 成功時の commit sha 取得失敗は無視（empty で続行）
  }
  const bytes = Utilities.newBlob(markdown).getBytes().length;
  const commitUrl = commitSha
    ? `https://github.com/${repoRef.owner}/${repoRef.repo}/commit/${commitSha}`
    : '';
  return { ok: true, commitSha, commitUrl, bytes };
}
