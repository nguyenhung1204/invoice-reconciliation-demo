import test from 'node:test';
import assert from 'node:assert/strict';
import { filterByDateRange } from './dashboardMetrics.ts';

test('dashboard date filter excludes records outside the selected period and missing dates', () => {
  const rows = [
    { id: 1, date: '2026-10-01' },
    { id: 2, date: '2026-10-31' },
    { id: 3, date: '2026-09-30' },
    { id: 4, date: '' },
  ];

  assert.deepEqual(
    filterByDateRange(rows, (row) => row.date, { start: '2026-10-01', end: '2026-10-31' }).map((row) => row.id),
    [1, 2],
  );
  assert.equal(filterByDateRange(rows, (row) => row.date, { start: null, end: null }).length, 4);
});
