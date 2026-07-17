/**
 * CodeMirror 6 の Markdown（YAML frontmatter 付き）エディターを構築する
 * 命令的ラッパー（DESIGN §6.1）。
 *
 * テーマは §2 デザイントークン（CSS 変数）で組むため、CodeMirror の DOM が
 * アプリ文書ツリー内に置かれる＝`:root[data-theme]` のライト/ダークが自動で
 * 継承される（右ペインの iframe と違い刻印不要）。よって light/dark 2 種は
 * CSS 変数の解決結果として無コストで両対応する。
 *
 * DOM 依存のため単体テストは持たず（happy-dom では CodeMirror のレイアウト前提が
 * 崩れやすい）、tauri dev / vite build で実機検証する。編集イベントの間引き
 * （debounce）は純ロジックとして別途 TDD 済み（[[debounce]]）。
 */
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { indentWithTab } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { yamlFrontmatter } from '@codemirror/lang-yaml';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

export interface MarkdownEditorOptions {
  /** マウント先の要素。 */
  parent: HTMLElement;
  /** 初期ドキュメント（生の .md）。 */
  doc: string;
  /** ユーザー編集でドキュメントが変わるたびに呼ばれる（プログラム更新では発火しない）。 */
  onChange: (value: string) => void;
}

export interface MarkdownEditorHandle {
  /** 内部の EditorView（高度な操作用）。 */
  view: EditorView;
  /** プログラム的にドキュメントを差し替える（onChange は発火しない）。Phase 3 のファイルオープン用。 */
  setDoc(value: string): void;
  /** 現在のドキュメント全文。 */
  getDoc(): string;
  /** リソース破棄（onDestroy から呼ぶ）。 */
  destroy(): void;
}

// エディターの外枠（背景・キャレット・選択・ガター）は CSS 変数で組み、
// アプリテーマに自動追従させる。
const tokenTheme = EditorView.theme({
  '&': {
    height: '100%',
    color: 'var(--text-primary)',
    backgroundColor: 'var(--bg-app)',
    fontSize: 'var(--text-sm-size)',
  },
  '.cm-scroller': {
    fontFamily: 'var(--font-mono)',
    lineHeight: '1.7',
  },
  '.cm-content': {
    caretColor: 'var(--accent)',
    padding: 'var(--space-4) 0',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--accent)',
  },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
    {
      backgroundColor: 'var(--accent-subtle)',
    },
  '.cm-gutters': {
    backgroundColor: 'var(--bg-app)',
    color: 'var(--text-tertiary)',
    border: 'none',
    borderRight: '1px solid var(--border)',
  },
  '.cm-activeLine': {
    backgroundColor: 'var(--bg-subtle)',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'var(--bg-subtle)',
    color: 'var(--text-secondary)',
  },
  '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
    backgroundColor: 'var(--accent-subtle)',
    outline: '1px solid var(--accent-border)',
  },
});

// 構文ハイライトも CSS 変数で。Markdown（見出し/強調/リンク/コード/引用/罫線）と
// YAML frontmatter（キー/文字列/数値/真偽）を §2 トークンに寄せる。
const tokenHighlight = HighlightStyle.define([
  { tag: t.heading, color: 'var(--accent)', fontWeight: '700' },
  { tag: t.strong, color: 'var(--text-primary)', fontWeight: '700' },
  { tag: t.emphasis, color: 'var(--text-primary)', fontStyle: 'italic' },
  { tag: [t.link, t.url], color: 'var(--accent)', textDecoration: 'underline' },
  { tag: t.monospace, color: 'var(--schema-api-spec)' },
  { tag: t.quote, color: 'var(--text-secondary)', fontStyle: 'italic' },
  { tag: t.list, color: 'var(--text-secondary)' },
  { tag: t.contentSeparator, color: 'var(--text-tertiary)' },
  // YAML frontmatter
  { tag: [t.definition(t.propertyName), t.propertyName], color: 'var(--accent)' },
  { tag: t.keyword, color: 'var(--accent)' },
  { tag: t.string, color: 'var(--text-primary)' },
  { tag: [t.number, t.bool, t.null], color: 'var(--schema-db-spec)' },
  { tag: t.comment, color: 'var(--text-tertiary)', fontStyle: 'italic' },
  { tag: t.meta, color: 'var(--text-tertiary)' },
]);

function baseExtensions(): Extension {
  return [
    basicSetup,
    keymap.of([indentWithTab]),
    // YAML frontmatter を YAML として、本文を Markdown としてハイライト。
    yamlFrontmatter({ content: markdown() }),
    syntaxHighlighting(tokenHighlight),
    tokenTheme,
    EditorState.tabSize.of(2),
    EditorView.lineWrapping,
  ];
}

export function createMarkdownEditor(options: MarkdownEditorOptions): MarkdownEditorHandle {
  const { parent, doc, onChange } = options;

  // プログラム更新（setDoc）中は onChange を抑止し、外部差し替え→再描画の
  // 無限ループを避ける。
  let settingDoc = false;

  const updateListener = EditorView.updateListener.of((update) => {
    if (update.docChanged && !settingDoc) {
      onChange(update.state.doc.toString());
    }
  });

  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [baseExtensions(), updateListener],
    }),
  });

  return {
    view,
    setDoc(value: string): void {
      if (value === view.state.doc.toString()) return;
      settingDoc = true;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
      });
      settingDoc = false;
    },
    getDoc(): string {
      return view.state.doc.toString();
    },
    destroy(): void {
      view.destroy();
    },
  };
}
