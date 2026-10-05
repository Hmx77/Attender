import type { Attendance } from './supabase';
export type AttendanceStatus = 'pending' | 'checked-in' | 'completed';
export function statusOf(row: Attendance): AttendanceStatus {
 return !row.in_time ? 'pending' : row.out_time ? 'completed' : 'checked-in';
}
export function recordDate(row: Attendance, zone = 'Asia/Dubai'): string {
 if (row.work_date) return row.work_date;
 return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(row.created_at));
}
export function shiftMonth(month: string, delta: number): string {
 const [year, value] = month.split('-').map(Number);
 const date = new Date(Date.UTC(year, value - 1 + delta, 1));
 return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}
export function monthLabel(month: string): string {
 return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T12:00:00Z`));
}
export function formatTime(value: string | null, zone = 'Asia/Dubai'): string {
 return value ? new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: zone }).format(new Date(value)) : '—';
}
export function inMonth(row: Attendance, month: string, zone = 'Asia/Dubai'): boolean {
 return recordDate(row, zone).slice(0, 7) === month;
}
