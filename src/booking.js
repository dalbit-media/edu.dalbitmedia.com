export const PAID_SERVICE = Object.freeze({
  name: '달빛에듀 전문가 심층 상담',
  amount: 150000,
  priceNote: '부가세 포함',
  currency: 'KRW',
  durationMinutes: 60,
  description: '최대 60분',
});

export const HOLD_MINUTES = 15;
export const FREE_MINUTES = 15;

export function koreanDate(value) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date(value));
}

export function koreanTime(value) {
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
}

export function appointmentLabel(value) {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value)) + ' (한국시간)';
}

export function monthDays(month) {
  const [year, number] = month.split('-').map(Number);
  const first = new Date(Date.UTC(year, number - 1, 1));
  const count = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return [
    ...Array(first.getUTCDay()).fill(null),
    ...Array.from({ length: count }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`),
  ];
}

export function shiftMonth(month, change) {
  const [year, number] = month.split('-').map(Number);
  return new Date(Date.UTC(year, number - 1 + change, 1)).toISOString().slice(0, 7);
}
