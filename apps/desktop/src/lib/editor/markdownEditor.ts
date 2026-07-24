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
import { EditorState, Prec, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { indentWithTab } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { yamlFrontmatter } from '@codemirror/lang-yaml';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import type { EditorFocusInfo } from '$lib/layout/scrollSync';
import { searchHighlightField } from './editorSearchBinding';

export interface MarkdownEditorOptions {
  /** マウント先の要素。 */
  parent: HTMLElement;
  /** 初期ドキュメント（生の .md）。 */
  doc: string;
  /** ユーザー編集でドキュメントが変わるたびに呼ばれる（プログラム更新では発火しない）。 */
  onChange: (value: string) => void;
  /**
   * フォーカス位置が変わるたびに「フォーカス行＋スクロール寸法」を渡す（プレビュー追従用）。
   * - スクロール時: 表示領域の先頭行を focusLine とする（rAF で 1 フレーム 1 回に間引き）。
   * - カーソル移動時: カーソルのある行を focusLine とする。
   * 親側（+page）がこの行の文言をプレビューで検索して位置合わせする（[[scrollSync]]）。
   */
  onSync?: (info: EditorFocusInfo) => void;
  /**
   * Mod+F（Ctrl/Cmd+F）が押されたとき呼ばれる。CodeMirror 既定の検索パネルを使わず、
   * アプリ共通の SearchBar を開くための橋。未指定なら既定の検索キー無効化のみ。
   */
  onFind?: () => void;
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
  // 共通検索のマッチ強調（全マッチ＝淡いアクセント地／現在マッチ＝濃く枠付き）。
  '.cm-search-match': {
    backgroundColor: 'var(--accent-subtle)',
    borderRadius: '2px',
  },
  '.cm-search-match-current': {
    backgroundColor: 'var(--accent)',
    color: 'var(--bg-app)',
    outline: '1px solid var(--accent)',
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
    searchHighlightField,
    EditorState.tabSize.of(2),
    EditorView.lineWrapping,
  ];
}

// Mod+F を横取りして共通 SearchBar を開く（basicSetup 同梱の検索パネルを出さない）。
// Prec.highest で basicSetup の searchKeymap より先に評価させ、true を返して既定を止める。
function findKeymap(onFind?: () => void): Extension {
  return Prec.highest(
    keymap.of([
      {
        key: 'Mod-f',
        run: () => {
          onFind?.();
          return true;
        },
      },
    ]),
  );
}

export function createMarkdownEditor(options: MarkdownEditorOptions): MarkdownEditorHandle {
  const { parent, doc, onChange, onSync, onFind } = options;

  // プログラム更新（setDoc）中は onChange を抑止し、外部差し替え→再描画の
  // 無限ループを避ける。
  let settingDoc = false;

  // view 生成後に代入。updateListener が構築中に発火しても TDZ に触れないよう前方宣言。
  let scroller: HTMLElement | null = null;

  // フォーカス行＋スクロール寸法を親へ渡す共通処理。focusLine は 1 始まり。
  const emit = (focusLine: number): void => {
    if (!scroller) return; // 構築中の初回発火（scroller 未設定）はスキップ＝先頭のまま
    onSync?.({
      focusLine,
      scrollTop: scroller.scrollTop,
      scrollHeight: scroller.scrollHeight,
      clientHeight: scroller.clientHeight,
    });
  };

  const updateListener = EditorView.updateListener.of((update) => {
    if (update.docChanged && !settingDoc) {
      onChange(update.state.doc.toString());
    }
    // カーソル移動（選択変更）のたびにカーソル行を親へ通知。プログラム更新中は除く。
    if (update.selectionSet && !settingDoc && onSync) {
      const head = update.state.selection.main.head;
      emit(update.state.doc.lineAt(head).number);
    }
  });

  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [findKeymap(onFind), baseExtensions(), updateListener],
    }),
  });

  // スクロール追従: scrollDOM の scroll を rAF で 1 フレーム 1 回に間引き、表示領域の
  // 先頭行（＝スクロール時はフォーカスを先頭行に置く方針）を focusLine として通知する。
  scroller = view.scrollDOM;
  let rafId = 0;
  const topVisibleLine = (): number => {
    // lineBlockAtHeight は内容座標での高さ→行ブロック。scrollTop は表示領域上端の内容座標。
    const block = view.lineBlockAtHeight(view.scrollDOM.scrollTop);
    return view.state.doc.lineAt(block.from).number;
  };
  const emitScroll = (): void => {
    rafId = 0;
    emit(topVisibleLine());
  };
  const handleScroll = (): void => {
    if (rafId !== 0) return; // 既に次フレームで発火予約済み
    rafId = requestAnimationFrame(emitScroll);
  };
  if (onSync) scroller.addEventListener('scroll', handleScroll, { passive: true });

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
      scroller?.removeEventListener('scroll', handleScroll);
      if (rafId !== 0) cancelAnimationFrame(rafId);
      view.destroy();
    },
  };
}
