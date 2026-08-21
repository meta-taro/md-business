/**
 * 指摘の往復（`#@ review state=<状態列> target=<対象列>`）。
 *
 * レビューは 1 往復では終わらない。指摘を出し、対応案を返し、現物へ反映し、反映されたことを
 * 確かめて返信する。この 4 つは別々の手で行われるので、**記録だけが先に進む**ことが起きる。
 * 実際に起きたのは「対応案を出しただけの指摘を『反映済み』にしてしまい、現物が直らないまま
 * 返信が出た」という形で、渡した相手からは直っていないことしか見えない。
 *
 * 状態を書かせるだけでは同じことが起きる。書いた本人が間違っているのだから、書いた内容を
 * 根拠にできない。**指摘が指している行が、基準版から実際に変わっているか**を突き合わせる。
 * 変わっていなければ「反映済み」は嘘であり、そこで止める。
 *
 * ## 「反映済み」だけが変更を要求する
 *
 * 「クローズ」には要求しない。「対応しないと決めて閉じる」指摘は実在するので、要求すると
 * その行が永久に赤いまま残る。赤が消えない表は、しばらくすると誰も赤を見なくなる。
 *
 * ## 比べられないときは黙る
 *
 * 基準版が無い・指し先を開いていない・行まで指していない、のいずれでも裏取りはできない。
 * できないものを赤くすると、赤いのが普通になって本物の指摘が埋もれる（`#@ link` で
 * 「読めないのは警告どまり」にしたのと同じ判断）。
 *
 * ここは突き合わせの判定だけを持つ純関数で、どの版を基準にするか（git のどのコミットか）も、
 * 指し先のファイルをどう読むかも扱わない。前者は呼ぶ側の都合で変わり、後者は I/O。
 */
import type { TsvDocument } from './parse.js';
import { findRowsByCell, parseCellLink } from './link.js';

/** ディレクティブの種別語。 */
const REVIEW_DIRECTIVE = 'review';

/**
 * 宣言の書き方。順序は固定する。
 *
 * 列名に空白を含められるよう `state=` と `target=` の位置で切る（`#@ style` のように
 * 空白区切りにすると、`対応 状態` という列名が書けなくなる）。前半を最短一致にしてあるので、
 * `state=対応 状態 target=対象 セル` は `対応 状態` と `対象 セル` に分かれる。
 */
const REVIEW_PATTERN = /^state=(.+?)\s+target=(.+)$/;

/**
 * 実際に現物が変わっていることを要求する状態。
 *
 * ここに「クローズ」を入れない。理由はファイル冒頭のとおり。
 */
const APPLIED = '反映済み';

/** 状態列と対象列の位置。 */
export interface ReviewColumns {
  /** 状態を書く列の位置。 */
  stateColumn: number;
  /** 対象（指し先）を書く列の位置。 */
  targetColumn: number;
}

/** 指摘の往復で見つかる食い違い。 */
export type ReviewIssueCode =
  | 'review_target_blank'
  | 'review_target_unreadable'
  | 'review_target_file_missing'
  | 'review_target_column_missing'
  | 'review_target_not_found'
  | 'review_target_ambiguous'
  | 'review_unverifiable'
  | 'review_not_applied';

/** 見つかった食い違い 1 件。位置はすべて指摘の一覧（`doc`）の側。 */
export interface ReviewIssue {
  code: ReviewIssueCode;
  severity: 'error' | 'warning';
  /** 指摘の行の位置。 */
  row: number;
  /** 指摘の列の位置。間違っている側の列を指す（状態の書き過ぎなら状態列）。 */
  column: number;
  /** 判断のもとにしたセルの値。 */
  value: string;
  /** 日本語の説明。 */
  message: string;
}

/** 指し先 1 ファイルの、いまの中身と「基準版から変わった行」。 */
export interface ReviewTarget {
  doc: TsvDocument;
  /**
   * 基準版から変わった行の位置（いまの版での位置）。
   *
   * 比べられないときは `null`。空の集合（＝比べたうえで 1 行も変わっていない）と
   * 区別する必要がある。混ぜると「比べていない」が「変わっていない」に化ける。
   */
  changedRows: ReadonlySet<number> | null;
}

/**
 * 指し先のファイルを引き当てる。
 *
 * パスを省いた形（同じシートの中を指す）は `null` で渡る。読めなければ `null` を返す。
 */
export type ReviewTargetLookup = (path: string | null) => ReviewTarget | null;

/**
 * ディレクティブ群から状態列・対象列を読む。宣言が無い・列定義に無い列を指している・
 * 状態と対象が同じ列、のいずれかなら `null`（＝この表では往復の検証をしない）。
 * 同じ宣言が 2 本あれば後勝ち。
 */
export function readReviewColumns(
  directives: readonly string[],
  columnNames: readonly string[],
): ReviewColumns | null {
  let found: ReviewColumns | null = null;

  for (const directive of directives) {
    if (!directive.startsWith(`${REVIEW_DIRECTIVE} `)) continue;
    const body = directive.slice(REVIEW_DIRECTIVE.length + 1).trim();

    const match = REVIEW_PATTERN.exec(body);
    if (match === null) continue;

    const stateColumn = indexOfColumn(columnNames, match[1] as string);
    const targetColumn = indexOfColumn(columnNames, match[2] as string);
    if (stateColumn < 0 || targetColumn < 0) continue;
    // 同じ列だと、状態を書いた瞬間に対象が消える。宣言として成り立たない。
    if (stateColumn === targetColumn) continue;

    found = { stateColumn, targetColumn };
  }

  return found;
}

/** 列名から位置を引く。同じ名前が 2 つあれば先に出たほう（名前で指す仕組みは全部そう）。 */
function indexOfColumn(columnNames: readonly string[], name: string): number {
  const wanted = name.trim();
  return columnNames.findIndex((column) => column.trim() === wanted);
}

function issue(
  code: ReviewIssueCode,
  severity: 'error' | 'warning',
  row: number,
  column: number,
  value: string,
  message: string,
): ReviewIssue {
  return { code, severity, row, column, value, message };
}

/**
 * 指摘の一覧を 1 行ずつ見て、状態と現物の食い違いを返す。
 *
 * 状態が空の行は起こしただけの行なので何も言わない。書く前から赤いと、書く気が失せる。
 */
export function checkReview(
  doc: TsvDocument,
  columns: ReviewColumns,
  lookup: ReviewTargetLookup,
): ReviewIssue[] {
  const issues: ReviewIssue[] = [];

  doc.rows.forEach((cells, row) => {
    const state = (cells[columns.stateColumn] ?? '').trim();
    if (state === '') return;

    const applied = state === APPLIED;
    const raw = (cells[columns.targetColumn] ?? '').trim();

    if (raw === '') {
      // 現物を直したと言っているのに、どこを直したかが無い。反映済み以外は
      // 指し先が定まっていない段階があるので咎めない。
      if (applied) {
        issues.push(
          issue(
            'review_target_blank',
            'error',
            row,
            columns.targetColumn,
            raw,
            '反映済みですが、対象が空です。直した行を指してください。',
          ),
        );
      }
      return;
    }

    const link = parseCellLink(raw);
    if (link === null) {
      issues.push(
        issue(
          'review_target_unreadable',
          'error',
          row,
          columns.targetColumn,
          raw,
          '対象を指し先として読めません（例 `ケース.tsv#No.=12`）。',
        ),
      );
      return;
    }

    if (link.kind !== 'row') {
      // ファイル全体・見出し・外部リンクは、どの行が変わるべきかを決められない。
      // 黙って通すと、確かめたうえで通ったのと見分けが付かなくなる。
      if (applied) {
        issues.push(
          issue(
            'review_unverifiable',
            'warning',
            row,
            columns.stateColumn,
            state,
            '対象が行を指していないため、反映されたか確かめられません。',
          ),
        );
      }
      return;
    }

    const target = lookup(link.path);
    if (target === null) {
      // ワークスペースの一部だけを開いていることがある。読めないだけで止めない。
      issues.push(
        issue(
          'review_target_file_missing',
          'warning',
          row,
          columns.targetColumn,
          raw,
          '対象のファイルを読めないため、反映されたか確かめられません。',
        ),
      );
      return;
    }

    const lookedUp = findRowsByCell(target.doc, link.column, link.value);
    if (lookedUp.column < 0) {
      issues.push(
        issue(
          'review_target_column_missing',
          'warning',
          row,
          columns.targetColumn,
          raw,
          `対象の指し先に「${link.column}」列がありません。`,
        ),
      );
      return;
    }

    if (lookedUp.rows.length === 0) {
      issues.push(
        issue(
          'review_target_not_found',
          'error',
          row,
          columns.targetColumn,
          raw,
          `対象の指し先に「${link.value}」の行がありません。`,
        ),
      );
      return;
    }

    if (lookedUp.rows.length > 1) {
      issues.push(
        issue(
          'review_target_ambiguous',
          'warning',
          row,
          columns.targetColumn,
          raw,
          `対象が ${lookedUp.rows.length} 行に当たります。1 行に決まる値で指してください。`,
        ),
      );
    }

    if (!applied) return;
    // 基準版が無ければ裏取りはできない。できないことを赤くしない。
    if (target.changedRows === null) return;

    const changed = lookedUp.rows.some((at) => target.changedRows?.has(at) === true);
    if (!changed) {
      issues.push(
        issue(
          'review_not_applied',
          'error',
          row,
          columns.stateColumn,
          state,
          '反映済みですが、対象の行は基準版から変わっていません。',
        ),
      );
    }
  });

  return issues;
}
