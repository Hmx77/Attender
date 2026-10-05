import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shiftMonth, monthLabel, recordDate, inMonth, statusOf } from '../lib/attendance.ts';
const row = { id: 'test', employee_id: 'employee', work_date: null, location: 'office', in_time: null, out_time: null, signature_approved: false, created_at: '2026-09-30T20:10:00Z' };
test('month navigation handles year rollover and leap months', () => {
 assert.equal(shiftMonth('2026-12', 1), '2027-01');
 assert.equal(shiftMonth('2027-01', -1), '2026-12');
 assert.equal(shiftMonth('2028-03', -1), '2028-02');
 assert.equal(monthLabel('2026-10'), 'October 2026');
});
test('pending requests use UAE request date; approved rows use official work date', () => {
 assert.equal(recordDate(row), '2026-10-01');
 assert.equal(inMonth(row, '2026-10'), true);
 assert.equal(inMonth(row, '2026-09'), false);
 const approved = { ...row, work_date: '2026-11-01', in_time: '2026-10-31T20:05:00Z' };
 assert.equal(inMonth(approved, '2026-11'), true);
 assert.equal(inMonth(approved, '2026-10'), false);
});
test('attendance states derive from existing timestamps', () => {
 assert.equal(statusOf(row), 'pending');
 assert.equal(statusOf({ ...row, in_time: '2026-10-01T08:00:00Z' }), 'checked-in');
 assert.equal(statusOf({ ...row, in_time: '2026-10-01T08:00:00Z', out_time: '2026-10-01T12:00:00Z' }), 'completed');
});
