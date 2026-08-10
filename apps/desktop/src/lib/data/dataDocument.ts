/**
 * 参考データ（.json / .xml）を、画面に並べられる行の列にする。
 *
 * 正本は Markdown と TSV のままで、ここは「隣に置いてある参考データを読むだけ」の経路。
 * 書き戻しは無い（このモジュールは結果を作るだけで、保存側の関数を一切持たない）。
 *
 * 読み取りと安全側の判断（DTD・外部実体参照・深さ / 件数 / 大きさの上限）は
 * `@md-business/data-tree` が持つ。ここが足すのは表示のための 3 点だけ:
 *   - 開く対象かどうかの判定（拡張子）
 *   - 木を、深さ付きの平坦な行へ（画面が再帰を持たなくて済むように）
 *   - JSON の根に名前が無い問題（ファイル名を当てる）
 *
 * 木のまま渡して画面側で再帰する手もあるが、そうすると並び順・深さ・鍵の付け方が
 * テストの外に出る。ここで行にしておけば、表示の並びそのものを単体で検査できる。
 */
import {
  detectDataFormat,
  readDataFile,
  type DataAttribute,
  type DataFormat,
  type DataLimits,
  type DataProblem,
  type DataTreeNode,
  type DataValueType,
} from '@md-business/data-tree';

/** 画面の 1 行。木の 1 節点に対応する。 */
export interface DataTreeRow {
  /** {#each} の鍵。同名の兄弟があっても衝突しないよう、経路の位置で作る。 */
  key: string;
  /** 根を 0 とする深さ（字下げ量）。 */
  depth: number;
  name: string;
  /** 葉の値。子を持つ節点は値を持たない。 */
  value: string | null;
  valueType: DataValueType | null;
  /** XML の属性。無ければ空配列（画面側で場合分けしないで済むように）。 */
  attributes: DataAttribute[];
  hasChildren: boolean;
}

export type DataDocument =
  | { kind: 'tree'; format: DataFormat; rows: DataTreeRow[] }
  | { kind: 'refused'; format: DataFormat | null; problem: DataProblem };

/** そのファイルを参考データとして開くか。開いていなければ false。 */
export function isDataFile(fileName: string | null): boolean {
  return fileName !== null && detectDataFormat(fileName) !== null;
}

/**
 * ファイル名と中身から、表示する行（または断る理由）を作る。
 *
 * 対象外の拡張子でも投げずに `unsupported` を返す。呼び違いを黙って空の木にすると、
 * 中身が空のファイルと見分けが付かなくなる。
 */
export function readDataDocument(
  fileName: string,
  source: string,
  limits: DataLimits = {},
): DataDocument {
  const result = readDataFile(fileName, source, limits);
  if (!result.ok) {
    return { kind: 'refused', format: result.format, problem: result.problem };
  }
  return { kind: 'tree', format: result.format, rows: flattenTree(result.root, fileName) };
}

/** 木を、表示順（深さ優先・元の並び）の行へ。 */
function flattenTree(root: DataTreeNode, fileName: string): DataTreeRow[] {
  const rows: DataTreeRow[] = [];
  const push = (node: DataTreeNode, depth: number, key: string, name: string): void => {
    rows.push({
      key,
      depth,
      name,
      value: node.value ?? null,
      valueType: node.valueType ?? null,
      attributes: node.attributes ?? [],
      hasChildren: node.children.length > 0,
    });
    node.children.forEach((child, index) => {
      push(child, depth + 1, `${key}/${index}`, child.name);
    });
  };
  // JSON の根は名前を持たない（配列でも物でもキーが無い）。空欄を出すより、
  // 何を開いているかが分かるファイル名を当てる。XML の根は要素名を持つのでそのまま。
  push(root, 0, '$', root.name === '' ? baseName(fileName) : root.name);
  return rows;
}

function baseName(path: string): string {
  const segments = path.split(/[\\/]/);
  return segments[segments.length - 1] ?? path;
}
