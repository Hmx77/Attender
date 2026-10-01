'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, type Attendance, type Profile } from '@/lib/supabase';

function time(value: string | null, zone: string) { return value ? new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: zone }).format(new Date(value)) : '—'; }
function Timesheet({ rows, zone }: { rows: Attendance[]; zone: string }) {
 return <div className="table-scroll"><table><thead><tr>{['Day','Date','Location','In','Out','Signature'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{rows.length ? rows.map(row => <tr key={row.id}><td>{new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${row.work_date}T12:00:00Z`))}</td><td>{row.work_date?.split('-').reverse().join('/')}</td><td><span className={`location ${row.location}`}>{row.location === 'office' ? 'Office' : 'Remote'}</span></td><td>{time(row.in_time, zone)}</td><td>{time(row.out_time, zone)}</td><td><span className="signature" aria-label={row.signature_approved ? 'HR approved' : 'Not approved'}>{row.signature_approved ? '✓' : '—'}</span></td></tr>) : <tr><td colSpan={6} className="empty">No attendance recorded yet.</td></tr>}</tbody></table></div>;
}
export default function Page() {
 const [userId, setUserId] = useState<string | null>(null);
 const [ready, setReady] = useState(false);
 const [profile, setProfile] = useState<Profile | null>(null);
 const [employees, setEmployees] = useState<Profile[]>([]);
 const [rows, setRows] = useState<Attendance[]>([]);
 const [selected, setSelected] = useState('');
 const [location, setLocation] = useState<'office' | 'remote'>('office');
 const [zone, setZone] = useState('UTC');
 const [email, setEmail] = useState('');
 const [password, setPassword] = useState('');
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState('');
 const generation = useRef(0);
 const currentUser = useRef<string | null>(null);
 const reload = useCallback(async () => {
  if (!supabase || !userId) return;
  const token = ++generation.current;
  try {
   const [p, a, z] = await Promise.all([supabase.from('profiles').select('*').eq('id', userId).single(), supabase.from('attendance').select('*').order('created_at', { ascending: false }), supabase.rpc('attendance_timezone')]);
   if (p.error) throw p.error; if (a.error) throw a.error; if (z.error) throw z.error;
   let people: Profile[] = [];
   if (p.data.role === 'hr') { const result = await supabase.from('profiles').select('*').eq('role', 'employee').order('full_name'); if(result.error) throw result.error; people = result.data; }
   if(token !== generation.current) return;
   setProfile(p.data); setRows(a.data); setZone(z.data); setEmployees(people);
   setSelected(previous => people.some(person => person.id === previous) ? previous : people[0]?.id || '');
  } catch (e) { if(token === generation.current) setError(e instanceof Error ? e.message : (e as {message:string}).message); }
 }, [userId]);
 useEffect(() => {
  if(!supabase) { setReady(true); return; }
  const {data: {subscription}} = supabase.auth.onAuthStateChange((_event, session) => { const id = session?.user.id || null; if(currentUser.current !== id) { currentUser.current = id; generation.current++; setUserId(id); setProfile(null); setRows([]); setEmployees([]); setError(''); } setReady(true); });
  return () => subscription.unsubscribe();
 }, []);
 useEffect(() => {
  if(!supabase || !userId) return;
  void reload();
  const channel = supabase.channel(`attendance-${userId}`).on('postgres_changes', {event: '*', schema: 'public', table: 'attendance'}, () => void reload()).subscribe(status => { if(status === 'SUBSCRIBED') void reload(); });
  // Reconcile after network interruptions and when returning to the tab.
  const refresh = () => { if(document.visibilityState === 'visible') void reload(); };
  document.addEventListener('visibilitychange', refresh);
  window.addEventListener('online', refresh);
  const interval = window.setInterval(refresh, 15000);
  return () => { generation.current++; void supabase?.removeChannel(channel); window.clearInterval(interval); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('online', refresh); };
 }, [userId, reload]);
 async function action(name: string, args: Record<string, string>) {
  if(!supabase || busy) return;
  setBusy(true); setError('');
  try { const result = await supabase.rpc(name, args); if(result.error) throw result.error; await reload(); }
  catch(e) { setError((e as {message:string}).message || 'Something went wrong. Please try again.'); }
  finally { setBusy(false); }
 }
 async function signIn(event: React.FormEvent) {
  event.preventDefault(); if(!supabase || busy) return; setBusy(true); setError('');
  try { const {error} = await supabase.auth.signInWithPassword({email, password}); if(error) throw error; setPassword(''); }
  catch(e) { setError((e as {message:string}).message); } finally {setBusy(false);}
 }
 const active = rows.find(row => row.employee_id === userId && !row.out_time);
 const pending = rows.filter(row => !row.in_time);
 const history = rows.filter(row => row.in_time && row.employee_id === (profile?.role === 'hr' ? selected : userId));
 return <><header className="topbar"><div className="brand"><span className="brand-icon" aria-hidden="true">✓</span> Attendance</div>{userId && <button className="quiet" disabled={busy} onClick={async () => { if(!supabase) return; setBusy(true); const {error} = await supabase.auth.signOut(); if(error) setError(error.message); setBusy(false); }}>Sign out <span aria-hidden="true">↗</span></button>}</header><main>
 {!ready ? <p role="status">Loading…</p> : !supabase ? <section className="login panel"><span className="eyebrow">ATTENDANCE</span><h1>Connect your workspace</h1><p>The app is ready for your Supabase connection. Follow the included README to configure the database and sign in.</p></section> : !userId ? <section className="login panel"><span className="eyebrow">WELCOME BACK</span><h1>Sign in to Attendance</h1><p>Your working day, simply recorded.</p><form onSubmit={signIn}><label htmlFor="email">Email</label><input id="email" type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required/><label htmlFor="password">Password</label><input id="password" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/><button className="primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button></form><p className="fine">Use the account provided by your HR team.</p></section> : !profile ? <section className="panel"><p role="status">Loading your dashboard…</p><button className="quiet" onClick={()=>void reload()}>Retry</button></section> : <>
 <div className="page-heading"><div><span className="eyebrow">ATTENDANCE REGISTER</span><h1>{profile.role === 'hr' ? 'HR Dashboard' : 'Employee Dashboard'}</h1><p>Name: <strong>{profile.full_name}</strong></p></div><span className="timezone">Times shown in {zone}</span></div>
 {profile.role === 'employee' ? <section className="panel checkin"><div className="section-heading"><span className="step" aria-hidden="true">01</span><h2>Your check-in</h2></div>{!active ? <><fieldset disabled={busy}><legend>Location</legend><div className="location-options">{(['office','remote'] as const).map(value=><label key={value} className={location === value ? 'choice selected' : 'choice'}><input type="radio" name="location" checked={location===value} onChange={()=>setLocation(value)}/><span>{value === 'office' ? 'Office' : 'Remote'}</span><span className="radio-dot" aria-hidden="true"/></label>)}</div></fieldset><button className="primary" disabled={busy} onClick={()=>void action('request_check_in',{p_location:location})}>{busy ? 'Sending request…' : 'Request Check-In'}<span aria-hidden="true">→</span></button><p className="fine">Your In time is recorded when HR approves your request.</p></> : !active.in_time ? <div className="session"><span className={`location ${active.location}`}>{active.location === 'office' ? 'Office' : 'Remote'}</span><h3>Awaiting HR approval</h3><p>Your request has been sent. Your check-in will appear here once approved.</p><button className="primary" disabled>Request sent ✓</button></div> : <div className="session"><span className={`location ${active.location}`}>{active.location === 'office' ? 'Office' : 'Remote'}</span><h3>Checked In</h3><p className="in-time">In: {time(active.in_time, zone)}</p><button className="primary" disabled={busy} onClick={()=>void action('check_out',{p_attendance_id:active.id})}>{busy ? 'Checking out…' : 'Check Out'}<span aria-hidden="true">→</span></button></div>}</section> : <section className="panel requests"><div className="section-heading"><span className="step" aria-hidden="true">01</span><h2>Check-In Requests</h2><span className="count">{pending.length}</span></div>{pending.length ? pending.map(row=><div className="request" key={row.id}><div><strong>{employees.find(p=>p.id===row.employee_id)?.full_name || 'Employee'}</strong><p>Location: {row.location === 'office' ? 'Office' : 'Remote'}</p></div><button className="primary" disabled={busy} onClick={()=>void action('approve_check_in',{p_attendance_id:row.id})}>Approve <span aria-hidden="true">✓</span></button></div>) : <p className="requests-empty">No pending requests. New check-ins will appear here.</p>}</section>}
 <section className="panel timesheet"><div className="table-heading"><div className="section-heading"><span className="step" aria-hidden="true">02</span><h2>{profile.role === 'hr' ? 'Employee Attendance' : 'Your attendance'}</h2></div>{profile.role === 'hr' && <div className="employee-picker"><label htmlFor="employee">Employee</label><select id="employee" value={selected} onChange={e=>setSelected(e.target.value)}>{!employees.length && <option value="">No employees yet</option>}{employees.map(p=><option key={p.id} value={p.id}>{p.full_name}</option>)}</select></div>}</div><Timesheet rows={history} zone={zone}/><div className="table-footer"><span className="signature">✓</span> Signature represents HR approval.</div></section>
 </>}{error && <div className="error" role="alert">{error}</div>}
 <footer>ATTENDANCE <span>A simple record of your working day.</span></footer></main></>;
}
