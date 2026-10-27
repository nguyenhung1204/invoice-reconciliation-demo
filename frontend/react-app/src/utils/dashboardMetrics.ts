export interface DashboardDateRange {
  start: string | null;
  end: string | null;
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function getMonthPeriod(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function getDashboardDateRange(
  period: string,
  customStart: string,
  customEnd: string,
  now: Date = new Date(),
): DashboardDateRange {
  if (period === 'ALL') return { start: null, end: null };
  if (period === 'CUSTOM') return { start: customStart || null, end: customEnd || null };
  if (period === 'LAST_90_DAYS') {
    const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    startDate.setDate(startDate.getDate() - 89);
    return { start: dateKey(startDate), end: dateKey(now) };
  }
  if (/^\d{4}-\d{2}$/.test(period)) {
    const [year, month] = period.split('-').map(Number);
    return {
      start: `${period}-01`,
      end: dateKey(new Date(year, month, 0)),
    };
  }
  return { start: null, end: null };
}

export function filterByDateRange<T>(
  items: T[],
  getDate: (item: T) => string | null | undefined,
  range: DashboardDateRange,
): T[] {
  if (!range.start && !range.end) return items;
  return items.filter((item) => {
    const value = getDate(item)?.slice(0, 10) || '';
    if (!value) return false;
    return (!range.start || value >= range.start) && (!range.end || value <= range.end);
  });
}
