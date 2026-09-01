/**
 * 上の行に並べていた操作を、言葉のメニューへ収めるための組み立て。
 *
 * 画面から切り離してあるのは、押せる/押せないの条件が増えたときに
 * ここだけを読めば済むようにするため。実際の実行（保存する・書き出す）は
 * それぞれの担当が持っているので、ここは「何を並べ、いつ押せるか」だけを決める。
 */

export type MenuId = 'file' | 'export' | 'view';

export type MenuItemId =
	| 'openFolder'
	| 'newWindow'
	| 'save'
	| 'autosave'
	| 'webMode'
	| 'revokeTrust'
	| 'pdf'
	| 'html'
	| 'image'
	| 'site'
	| 'browser'
	| 'publish'
	| 'theme'
	| 'timeline'
	| 'language';

/** ヘルプは押すとその場で開くだけなので、開閉するメニューとしては数えない。 */
export const MENU_IDS: readonly MenuId[] = ['file', 'export', 'view'];

export const MENU_ITEMS: Record<MenuId, readonly MenuItemId[]> = {
	file: ['openFolder', 'newWindow', 'save', 'autosave', 'webMode', 'revokeTrust'],
	export: ['pdf', 'html', 'image', 'site', 'browser', 'publish'],
	view: ['theme', 'timeline', 'language'],
};

/** 今の状態。押せるかどうかの判断に要るものだけを持つ。 */
export interface MenuCaps {
	loading: boolean;
	hasRoot: boolean;
	canSave: boolean;
	autosaveOn: boolean;
	/** 開いているフォルダを、この PC で web モードとして動かしてよいと許してあるか。 */
	trusted: boolean;
	/** 開いているフォルダが web モードを名乗っているか。印にしか使わない。 */
	declaredWeb: boolean;
	/** その宣言をアプリから書き換えられるか（手で書いた宣言には手を出さない）。 */
	canDeclareWeb: boolean;
	canPdf: boolean;
	canHtml: boolean;
	canImage: boolean;
	imagePicking: boolean;
	canSite: boolean;
	canPublish: boolean;
	browserBusy: boolean;
	timelineOpen: boolean;
	/** もう 1 つ窓を開けるか（同時に開ける数には上限がある）。 */
	canNewWindow: boolean;
}

export function itemsOf(menu: MenuId): readonly MenuItemId[] {
	return MENU_ITEMS[menu];
}

export function isItemEnabled(item: MenuItemId, caps: MenuCaps): boolean {
	switch (item) {
		case 'openFolder':
			// 開く先はその窓で選ぶので、こちらで何か開いている必要は無い。
			return !caps.loading;
		case 'newWindow':
			// 上限に達していたら灰色にする。押しても何も起きない項目を残すと、
			// 開かなかったのが不具合なのか上限なのか区別が付かない。
			return !caps.loading && caps.canNewWindow;
		case 'save':
			return caps.canSave;
		case 'autosave':
		case 'theme':
		case 'language':
			return true;
		case 'pdf':
			return caps.canPdf;
		case 'html':
			return caps.canHtml;
		case 'image':
			// 選んでいる最中は、同じ場所から閉じられるように押せたままにする。
			return caps.canImage || caps.imagePicking;
		case 'site':
			return caps.canSite;
		case 'browser':
			// 押せば開くだけ。出しているかは見ない（開いていれば、そのまま同じ先へ開く）。
			return !caps.browserBusy && caps.hasRoot;
		case 'publish':
			// 下見を取りに行けるかだけ。出せる/出せないの判断は、下見を見てから。
			return caps.canPublish;
		case 'webMode':
			// 宣言を置くだけで、動かす許可にはならない。
			// 手で書いた宣言があるときは押せない（中身を崩さない）。
			return caps.canDeclareWeb;
		case 'revokeTrust':
			// 許してあるフォルダでだけ押せる。許していないときに押せると、
			// 何も起きない操作が「効かない」と読まれる。
			return caps.trusted;
		case 'timeline':
			return caps.hasRoot || caps.timelineOpen;
	}
}

/** 入り切りするものは今どちらかを返す。一度きりの操作は null（チェック印を出さない）。 */
export function itemToggleState(item: MenuItemId, caps: MenuCaps): boolean | null {
	switch (item) {
		case 'autosave':
			return caps.autosaveOn;
		case 'webMode':
			return caps.declaredWeb;
		case 'timeline':
			return caps.timelineOpen;
		default:
			return null;
	}
}

/** 左右キーで隣のメニューへ。端まで来たら反対の端へ回り込む。 */
export function nextMenuId(current: MenuId, step: 1 | -1): MenuId {
	const index = MENU_IDS.indexOf(current);
	const size = MENU_IDS.length;
	return MENU_IDS[(index + step + size) % size];
}
