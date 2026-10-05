'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, type Attendance, type Profile } from '@/lib/supabase';
import { formatTime, inMonth, statusOf } from '@/lib/attendance';
import { AppHeader, AttendanceTable, MonthNavigator, StatusBadge, TodayAttendanceCard } from '@/components/attendance';

export default function Page() {
 const [userId, setUserId] = useState<string | null>(null);
 const [ready, setReady] = useState(false);
 const [loaded, setLoaded] = useState(false);
 const [profile, setProfile] = useState<Profile | null>(null);
 const [employees, setEmployees] = useState<Profile[]>([]);
 const [rows, setRows] = useState<Attendance[]>([]);
 const [month, setMonth] = useState('');
 const [today, setToday] = useState('');
 const [location, setLocation] = useState<'office' | 'remote'>('office');
 const [zone, setZone] = useState('Asia/Dubai');
 const [search, setSearch] = useState('');
 const [locationFilter, setLocationFilter] = useState('all');
 const [statusFilter, setStatusFilter] = useState('all');
 const [email, setEmail] = useState('');
 const [password, setPassword] = useState('');
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState('');
 const [notice, setNotice] = useState('');
 const generation = useRef(0);
 const currentUser = useRef<string | null>(null);
 async function readAttendance() {
  const data: Attendance[] = [];
  if (!supabase) return { data, error: null };
  // Supabase caps each response; page through records so older months remain complete.
  for (let offset = 0; ; offset += 1000) {
   const result = await supabase.from('attendance').select('*').order('created_at', { ascending: false }).order('id').range(offset, offset + 999);
   if (result.error) return { data, error: result.error };
   data.push(...result.data);
   if (result.data.length < 1000) return { data, error: null };
  }
 }
 const reload = useCallback(async () => {
  if (!supabase || !userId) return;
  const token = ++generation.current;
  try {
   const [p, a, z, d] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).single(),
    readAttendance(),
    supabase.rpc('attendance_timezone'), supabase.rpc('attendance_today')
   ]);
   if (p.error) throw p.error; if (a.error) throw a.error; if (z.error) throw z.error; if (d.error) throw d.error;
   let people: Profile[] = [];
   if (p.data.role === 'hr') {
    const result = await supabase.from('profiles').select('*').eq('role', 'employee').order('full_name');
    if (result.error) throw result.error; people = result.data;
   }
   if (token !== generation.current) return;
   setProfile(p.data); setRows(a.data); setZone(z.data); setEmployees(people);
   setToday(d.data); setMonth(previous => previous || d.data.slice(0, 7)); setLoaded(true); setError('');
  } catch (e) { if (token === generation.current) setError((e as { message: string }).message || 'Attendance could not be loaded. Please retry.'); }
 }, [userId]);
 useEffect(() => {
  if (!supabase) { setReady(true); return; }
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
   const id = session?.user.id || null;
   if (currentUser.current !== id) {
    currentUser.current = id; generation.current++; setUserId(id); setProfile(null); setRows([]); setEmployees([]);
    setLoaded(false); setMonth(''); setToday(''); setError(''); setNotice(''); setSearch(''); setLocationFilter('all'); setStatusFilter('all');
   }
   setReady(true);
  });
  return () => subscription.unsubscribe();
 }, []);
 useEffect(() => {
  if (!supabase || !userId) return;
  void reload();
  const channel = supabase.channel(`attendance-${userId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, () => void reload()).subscribe(status => { if (status === 'SUBSCRIBED') void reload(); });
  const refresh = () => { if (document.visibilityState === 'visible') void reload(); };
  document.addEventListener('visibilitychange', refresh); window.addEventListener('online', refresh);
  const interval = window.setInterval(refresh, 15000);
  return () => { generation.current++; void supabase?.removeChannel(channel); window.clearInterval(interval); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('online', refresh); };
 }, [userId, reload]);
 async function action(name: string, args: Record<string, string>, message: string) {
  if (!supabase || busy) return;
  setBusy(true); setError(''); setNotice('');
  try { const result = await supabase.rpc(name, args); if (result.error) throw result.error; await reload(); setNotice(message); }
  catch (e) { setError((e as { message: string }).message || 'Something went wrong. Please try again.'); }
  finally { setBusy(false); }
 }
 async function signIn(event: React.FormEvent) {
  event.preventDefault(); if (!supabase || busy) return; setBusy(true); setError('');
  try { const { error } = await supabase.auth.signInWithPassword({ email, password }); if (error) throw error; setPassword(''); }
  catch (e) { setError((e as { message: string }).message); } finally { setBusy(false); }
 }
 async function signOut() {
  if (!supabase || busy) return; setBusy(true);
  try { const { error } = await supabase.auth.signOut(); if (error) throw error; }
  catch (e) { setError((e as { message: string }).message); } finally { setBusy(false); }
 }
 const names = useMemo(() => new Map(employees.map(person => [person.id, person.full_name])), [employees]);
 const isHR = profile?.role === 'hr';
 const active = rows.find(row => row.employee_id === userId && !row.out_time);
 const todayRow = active || rows.find(row => row.employee_id === userId && row.work_date === today);
 const pending = rows.filter(row => !row.in_time);
 const monthly = rows.filter(row => inMonth(row, month, zone) && (isHR || row.employee_id === userId));
 const filtered = isHR ? monthly.filter(row => (names.get(row.employee_id) || 'Employee').toLowerCase().includes(search.trim().toLowerCase()) && (locationFilter === 'all' || row.location === locationFilter) && (statusFilter === 'all' || statusOf(row) === statusFilter)) : monthly.filter(row => row.in_time);
 const attended = monthly.filter(row => row.in_time);
 const dayCount = new Set(attended.map(row => row.work_date)).size;
 return <><AppHeader profile={profile} signedIn={!!userId} busy={busy} onSignOut={() => void signOut()}/><main>
 {!ready ? <section className="panel loading-panel" role="status">Loading Attender…</section> : !supabase ? <section className="login panel"><span className="eyebrow">ICONIC · ATTENDER</span><h1>Connect your workspace</h1><p>Configure the Supabase connection to access your attendance register.</p></section> : !userId ? <section className="login panel"><span className="eyebrow">ICONIC · ATTENDER</span><h1>Welcome back</h1><p>Sign in to your attendance register.</p><form onSubmit={signIn}><label htmlFor="email">Email</label><input id="email" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required/><label htmlFor="password">Password</label><input id="password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required/><button className="primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button></form><p className="fine">Use the account provided by ICONIC HR.</p></section> : !loaded || !profile ? <section className="panel loading-panel"><p role="status">Loading your dashboard…</p><button className="quiet" onClick={() => void reload()}>Retry</button></section> : <>
 <div className="page-heading"><div><span className="eyebrow">{isHR ? 'HR PORTAL' : 'EMPLOYEE PORTAL'}</span><h1>{isHR ? 'HR Dashboard' : 'Employee Dashboard'}</h1><p>{isHR ? 'Manage employee attendance' : <>Name: <strong>{profile.full_name || 'Employee'}</strong></>}</p></div><span className="timezone"><span aria-hidden="true">◷</span> UAE Time (GMT+4)</span></div>
 {isHR ? <section className="panel requests"><div className="section-heading"><span className="step" aria-hidden="true">01</span><h2>Pending Check-In Requests</h2><span className="count">{pending.length}</span></div>{pending.length ? <div className="pending-list">{pending.map(row => <div className="request" key={row.id}><div><strong>{names.get(row.employee_id) || 'Employee'}</strong><div className="request-meta"><span className={`location ${row.location}`}>{row.location === 'office' ? 'Office' : 'Remote'}</span><span>Requested {new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: zone }).format(new Date(row.created_at))}, {formatTime(row.created_at, zone)}</span><StatusBadge status="pending"/></div></div><button className="primary" disabled={busy} onClick={() => void action('approve_check_in', { p_attendance_id: row.id }, 'Check-in approved. The official In time has been recorded.')}>Approve <span aria-hidden="true">✓</span></button></div>)}</div> : <p className="requests-empty">No pending requests. New check-ins will appear here.</p>}</section> : <TodayAttendanceCard row={todayRow} today={today} zone={zone} busy={busy} location={location} onLocation={setLocation} onRequest={() => void action('request_check_in', { p_location: location }, 'Check-in requested. Waiting for HR approval.')} onCheckout={id => void action('check_out', { p_attendance_id: id }, 'Attendance complete. Your Out time has been recorded.')}/>}
 <section className="panel timesheet"><div className="table-heading"><div className="section-heading"><span className="step" aria-hidden="true">02</span><h2>{isHR ? 'Attendance Records' : 'Monthly Attendance'}</h2></div><MonthNavigator month={month} onChange={setMonth}/></div>
 {isHR ? <div className="record-filters"><div className="filter search-filter"><label htmlFor="search">Search employee</label><input id="search" type="search" placeholder="Search by name" value={search} onChange={e => setSearch(e.target.value)}/></div><div className="filter"><label htmlFor="location-filter">Location</label><select id="location-filter" value={locationFilter} onChange={e => setLocationFilter(e.target.value)}><option value="all">All Locations</option><option value="office">Office</option><option value="remote">Remote</option></select></div><div className="filter"><label htmlFor="status-filter">Status</label><select id="status-filter" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="all">All Statuses</option><option value="pending">Pending</option><option value="checked-in">Checked In</option><option value="completed">Completed</option></select></div></div> : <div className="month-summary"><span>Days Attended <strong>{dayCount}</strong></span><span>Office <strong>{new Set(attended.filter(row => row.location === 'office').map(row => row.work_date)).size}</strong></span><span>Remote <strong>{new Set(attended.filter(row => row.location === 'remote').map(row => row.work_date)).size}</strong></span></div>}
 <AttendanceTable rows={filtered} zone={zone} month={month} hr={isHR} names={names}/></section>
 </>}{notice && <div className="notice" role="status">{notice}</div>}{error && <div className="error" role="alert">{error}</div>}<footer><span>ICONIC · ATTENDER</span><span>Internal Attendance Register</span></footer></main></>;
}
