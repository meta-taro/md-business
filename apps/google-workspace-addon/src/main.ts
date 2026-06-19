/// <reference types="google-apps-script" />

import { parseMdTable, mdTableToValues, valuesToMdTable } from './lib/mdTable.js';
import { parseTestSpecMarkdown } from '@md-business/schema-test-spec';
import type { TestSpec } from '@md-business/schema-test-spec';
import validateTestSpec from '@md-business/schema-test-spec/validate';
import {
  planSheetWriteOps,
  applySheetValuesToSpec,
  validateSheetValues,
  type SheetValidationIssue,
  type SheetWriteOps,
} from './lib/testSpecSheetOps.js';
import {
  buildContentsUrl,
  buildContentsPutPayload,
  extractRepoRefFromSpec,
  type RepoRef,
} from './lib/githubApi.js';
import {
  prepareAutoSyncCommit,
  parseAutoSyncState,
  serializeAutoSyncState,
  type AutoSyncState,
} from './lib/autoSync.js';
import {
  extractFrontmatter,
  appendColumnToFrontmatter,
  removeLastColumnFromFrontmatter,
  applyTestSpecTemplate,
  type ColumnType,
  type TestSpecTemplateKey,
} from './lib/frontmatterEdit.js';

/**
 * Phase 3C 自動同期 PropertiesService キー。
 * Why: trigger 跨ぎで状態を保持する必要があるが、PropertiesService は string only
 *      なのでキー文字列を 1 箇所に集約しておく（misspell 防止）。
 */
const KEY_FRONTMATTER = 'TS_AUTO_SYNC_FRONTMATTER';
const KEY_FRONTMATTER_BLOCK = 'TS_AUTO_SYNC_FRONTMATTER_BLOCK';
const KEY_SHEET_NAME = 'TS_AUTO_SYNC_SHEET_NAME';
const KEY_REPO_REF = 'TS_AUTO_SYNC_REPO_REF';
const KEY_EDIT_TRIGGER_ID = 'TS_AUTO_SYNC_EDIT_TRIGGER_ID';
const KEY_DEBOUNCE_TRIGGER_ID = 'TS_AUTO_SYNC_DEBOUNCE_TRIGGER_ID';
const KEY_STATE = 'TS_AUTO_SYNC_STATE';
const KEY_GITHUB_PAT = 'GITHUB_PAT';

const DEBOUNCE_MS = 2000;

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
 * Why: schema-test-spec が完成するまでの先行スパイク用。本実装は schema-test-spec
 *      の `テスト項目 | OK/NG | 備考` を Sheets row + checkbox に変換するため、
 *      core 側 schema 確定後に拡張する。
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
 * 現在の Sheet（または選択範囲）を Markdown table 文字列に変換して返す。
 * Why: 双方向同期の片方向（Sheets → md）。Phase 2 完成形では `onEdit` で GitHub API へ自動 commit する予定だが、
 *      Phase C 動作確認段階でも手動コピペ経路があると検収しやすい。
 */
export function exportActiveSheetToMarkdown(): {
  ok: true;
  markdown: string;
  rows: number;
} | {
  ok: false;
  error: string;
} {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const range = sheet.getDataRange();
  const values = range.getValues();
  if (values.length === 0) {
    return { ok: false, error: 'シートに値がありません。' };
  }
  const markdown = valuesToMdTable(values);
  return { ok: true, markdown, rows: values.length };
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
export function setupTestSpecSheet(markdownFrontmatter: string): {
  ok: true;
  columns: number;
  dataValidations: number;
  conditionalFormats: number;
} | {
  ok: false;
  error: string;
} {
  const parsed = parseTestSpec(markdownFrontmatter);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const ops = planSheetWriteOps(parsed.spec);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  applyOpsToSheet(sheet, ops);

  return {
    ok: true,
    columns: ops.headerValues.length,
    dataValidations: ops.dataValidations.length,
    conditionalFormats: ops.conditionalFormats.length,
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

function parseTestSpec(
  src: string,
):
  | { ok: true; spec: TestSpec }
  | { ok: false; error: string } {
  const result = parseTestSpecMarkdown(src, validateTestSpec);
  if (!result.ok) {
    return { ok: false, error: result.errors.map((e) => e.message).join(' / ') };
  }
  return { ok: true, spec: result.testSpec };
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
  sheet.getRange(1, 1, 1, ops.headerValues.length).setValues([ops.headerValues]);
  sheet.setFrozenRows(ops.frozenRows);
  applyDataValidations(sheet, ops);
  applyConditionalFormats(sheet, ops);
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
// Phase 3C-2b: 自動同期 (Sheets ⇄ GitHub) trigger 層
// ---------------------------------------------------------------------------
// Why: Phase 3C-1 / 3C-2a で純粋関数は実装済み。本層は SpreadsheetApp /
//      ScriptApp / UrlFetchApp / PropertiesService / Utilities への副作用に閉じる。
//      テストは autoSync.test.ts / githubApi.test.ts でカバー済み。
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
 * 検証シート frontmatter を受け取り、現在のシートに onEdit installable trigger を
 * 設置して GitHub 自動同期を有効化する。
 * - spec.repository が存在しなければエラー
 * - 既存の trigger は idempotent に削除してから新規作成
 */
export function installTestSpecAutoSync(markdownFrontmatter: string): {
  ok: true;
  sheetName: string;
  repoRef: string;
} | {
  ok: false;
  error: string;
} {
  const parsed = parseTestSpec(markdownFrontmatter);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  if (typeof parsed.spec.repository !== 'string' || parsed.spec.repository.length === 0) {
    return {
      ok: false,
      error: 'frontmatter に repository が未設定です（例: repository: owner/repo@main:verify/login.md）。',
    };
  }
  const repoRef = extractRepoRefFromSpec(parsed.spec);
  if (repoRef === null) {
    return { ok: false, error: 'repository の形式が不正です（owner/repo@branch:path）。' };
  }
  const frontmatterBlock = extractFrontmatterBlock(markdownFrontmatter);
  if (frontmatterBlock === null) {
    return { ok: false, error: 'frontmatter ブロック (--- ... ---) を抽出できませんでした。' };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getActiveSheet();
  const sheetName = sheet.getName();

  removeStoredTriggers();

  const trigger = ScriptApp.newTrigger('handleTestSpecEdit').forSpreadsheet(ss).onEdit().create();
  const props = PropertiesService.getDocumentProperties();
  props.setProperties({
    [KEY_FRONTMATTER]: markdownFrontmatter,
    [KEY_FRONTMATTER_BLOCK]: frontmatterBlock,
    [KEY_SHEET_NAME]: sheetName,
    [KEY_REPO_REF]: parsed.spec.repository,
    [KEY_EDIT_TRIGGER_ID]: trigger.getUniqueId(),
    [KEY_STATE]: serializeAutoSyncState({ kind: 'idle' }),
  });
  return { ok: true, sheetName, repoRef: parsed.spec.repository };
}

export function uninstallTestSpecAutoSync(): { ok: true } {
  removeStoredTriggers();
  const props = PropertiesService.getDocumentProperties();
  [
    KEY_FRONTMATTER,
    KEY_FRONTMATTER_BLOCK,
    KEY_SHEET_NAME,
    KEY_REPO_REF,
    KEY_EDIT_TRIGGER_ID,
    KEY_DEBOUNCE_TRIGGER_ID,
    KEY_STATE,
  ].forEach((k) => props.deleteProperty(k));
  return { ok: true };
}

/**
 * onEdit installable trigger 本体。ScriptApp に登録済みのみ実行される。
 * Why: シートが頻繁に編集されるたびに GitHub へ commit するのは過剰なので、
 *      編集を 2 秒間 debounce する。次の編集が来たら time-based trigger を
 *      作り直して延期、無編集が 2 秒続いたら flushPendingTestSpecSync が発火する。
 */
export function handleTestSpecEdit(e: GoogleAppsScript.Events.SheetsOnEdit): void {
  const props = PropertiesService.getDocumentProperties();
  const stored = props.getProperty(KEY_FRONTMATTER);
  if (stored === null) return;

  const targetSheetName = props.getProperty(KEY_SHEET_NAME);
  if (targetSheetName !== null && e.range && e.range.getSheet().getName() !== targetSheetName) {
    return;
  }

  removeDebounceTrigger(props);
  const debounce = ScriptApp.newTrigger('flushPendingTestSpecSync').timeBased().after(DEBOUNCE_MS).create();
  props.setProperty(KEY_DEBOUNCE_TRIGGER_ID, debounce.getUniqueId());
  props.setProperty(
    KEY_STATE,
    serializeAutoSyncState({ kind: 'pending', lastEditAt: new Date().toISOString() }),
  );
}

/**
 * debounce 切れ時に発火する time-based trigger 本体。
 * 純粋関数 prepareAutoSyncCommit に検証 + markdown 構築を委譲し、
 * 本体は UrlFetchApp の GET (sha 取得) → PUT (commit) と
 * 結果の状態保存に閉じる。
 */
export function flushPendingTestSpecSync(): void {
  const props = PropertiesService.getDocumentProperties();
  const frontmatter = props.getProperty(KEY_FRONTMATTER);
  const frontmatterBlock = props.getProperty(KEY_FRONTMATTER_BLOCK);
  const sheetName = props.getProperty(KEY_SHEET_NAME);
  if (frontmatter === null || frontmatterBlock === null || sheetName === null) {
    saveErrorState(props, 'state_missing', '設置時の状態が見つかりません。再度有効化してください。');
    return;
  }
  const pat = PropertiesService.getUserProperties().getProperty(KEY_GITHUB_PAT);
  if (pat === null || pat.length === 0) {
    saveErrorState(props, 'no_pat', 'GitHub PAT が未設定です。サイドバーから登録してください。');
    return;
  }
  const parsed = parseTestSpec(frontmatter);
  if (!parsed.ok) {
    saveErrorState(props, 'spec_invalid', parsed.error);
    return;
  }
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (sheet === null) {
    saveErrorState(props, 'sheet_missing', `シート「${sheetName}」が見つかりません。`);
    return;
  }
  const values = sheet.getDataRange().getValues();
  const plan = prepareAutoSyncCommit({
    spec: parsed.spec,
    sheetValues: values,
    sheetName,
    isoTimestamp: new Date().toISOString(),
    frontmatterBlock,
  });
  if (plan.kind === 'skip') {
    if (plan.reason === 'validation_failed') {
      saveErrorState(
        props,
        'validation_failed',
        `${plan.validationIssues?.length ?? 0} 件の検証エラーで sync を中断しました。`,
      );
    } else {
      saveErrorState(props, plan.reason, 'repository 設定が不正です。');
    }
    return;
  }
  pushMarkdownToGithub(props, pat, plan.repoRef, plan.markdown, plan.commitMessage);
}

/**
 * 現在の自動同期状態をサイドバー向けに集約する。
 * - installed: trigger が PropertiesService に登録されているか
 * - hasPat: PAT が UserProperties にあるか
 * - sheetName / repoRef: 設置時の binding 内容
 * - state: 最後の sync 結果 (idle / pending / success / error)
 */
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

export function getTestSpecAutoSyncStatus(): {
  installed: boolean;
  hasPat: boolean;
  sheetName: string | null;
  repoRef: string | null;
  state: AutoSyncState;
} {
  const props = PropertiesService.getDocumentProperties();
  const editTriggerId = props.getProperty(KEY_EDIT_TRIGGER_ID);
  const stateJson = props.getProperty(KEY_STATE);
  return {
    installed: editTriggerId !== null,
    hasPat: hasGithubPat(),
    sheetName: props.getProperty(KEY_SHEET_NAME),
    repoRef: props.getProperty(KEY_REPO_REF),
    state: parseAutoSyncState(stateJson),
  };
}

function pushMarkdownToGithub(
  props: GoogleAppsScript.Properties.Properties,
  pat: string,
  repoRef: RepoRef,
  markdown: string,
  commitMessage: string,
): void {
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
    saveErrorState(props, `github_${getCode}`, `GET ${repoRef.path} で ${getCode} が返りました。`);
    return;
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
    saveErrorState(
      props,
      `github_${putCode}`,
      `PUT ${repoRef.path} で ${putCode} が返りました: ${putRes.getContentText().slice(0, 200)}`,
    );
    return;
  }
  let commitSha = '';
  try {
    const body = JSON.parse(putRes.getContentText());
    if (body && body.commit && typeof body.commit.sha === 'string') commitSha = body.commit.sha;
  } catch {
    // 成功時の commit sha 取得失敗は記録だけ落として続行
  }
  const bytes = Utilities.newBlob(markdown).getBytes().length;
  props.setProperty(
    KEY_STATE,
    serializeAutoSyncState({
      kind: 'success',
      syncedAt: new Date().toISOString(),
      commitSha,
      bytes,
    }),
  );
}

function saveErrorState(
  props: GoogleAppsScript.Properties.Properties,
  reason: string,
  details: string,
): void {
  props.setProperty(
    KEY_STATE,
    serializeAutoSyncState({
      kind: 'error',
      failedAt: new Date().toISOString(),
      reason,
      details,
    }),
  );
}

function removeStoredTriggers(): void {
  const props = PropertiesService.getDocumentProperties();
  removeTriggerById(props.getProperty(KEY_EDIT_TRIGGER_ID));
  props.deleteProperty(KEY_EDIT_TRIGGER_ID);
  removeDebounceTrigger(props);
}

function removeDebounceTrigger(props: GoogleAppsScript.Properties.Properties): void {
  removeTriggerById(props.getProperty(KEY_DEBOUNCE_TRIGGER_ID));
  props.deleteProperty(KEY_DEBOUNCE_TRIGGER_ID);
}

function removeTriggerById(id: string | null): void {
  if (id === null) return;
  const triggers = ScriptApp.getProjectTriggers();
  for (const t of triggers) {
    if (t.getUniqueId() === id) {
      ScriptApp.deleteTrigger(t);
      return;
    }
  }
}
