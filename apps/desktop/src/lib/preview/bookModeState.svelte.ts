/**
 * プレビューを本のように読む（見開きでめくる）かどうか。
 *
 * 読み方の好みなので、文書ごとではなくアプリ全体で 1 つ持ち、開き直しても残す。
 */
export const PREVIEW_BOOK_STORAGE_KEY = 'md-business:desktop:preview-book';

function readStored(): boolean {
  try {
    return localStorage.getItem(PREVIEW_BOOK_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

class BookModeState {
  value = $state<boolean>(readStored());

  toggle(): void {
    this.value = !this.value;
    try {
      localStorage.setItem(PREVIEW_BOOK_STORAGE_KEY, this.value ? '1' : '0');
    } catch {
      // 保存できない環境でも、このセッションの表示は変わる
    }
  }
}

export const bookMode = new BookModeState();
