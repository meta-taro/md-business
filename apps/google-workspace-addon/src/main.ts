/// <reference types="google-apps-script" />

import { parseMdTable, mdTableToValues } from './lib/mdTable.js';

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
