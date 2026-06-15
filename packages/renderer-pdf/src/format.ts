const jpyFormatter = new Intl.NumberFormat('ja-JP', {
  style: 'currency',
  currency: 'JPY',
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat('ja-JP', {
  maximumFractionDigits: 2,
});

export function formatJpy(amount: number): string {
  return jpyFormatter.format(amount);
}

export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

export function formatDateIso(iso: string): string {
  // Render an ISO YYYY-MM-DD as YYYY年MM月DD日 without TZ math.
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const [, year, month, day] = match;
  return `${year}年${month}月${day}日`;
}
