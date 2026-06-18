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
  const m = src.match(/^---\r?\n[\s\S]*?\r?\n---/);
  return m ? m[0] : null;
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
