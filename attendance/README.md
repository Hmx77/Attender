# Simple Attendance

Next.js, TypeScript, Tailwind CSS and Supabase. Exactly two role-based dashboards and the six requested timesheet columns. No hours, payroll, analytics or other HR features.

## Setup

1. Use Node.js 20.9+ and pnpm. Run `pnpm install`.
2. Create a Supabase project. Run `supabase/migrations/202610010001_attendance.sql` in its SQL editor (or apply with Supabase CLI). Use a new project, or review existing table names before applying.
3. Attendance uses **UTC by default**. Before applying, replace `'UTC'` in `attendance_timezone()` with your business IANA timezone, such as `Asia/Dubai`. The frontend obtains this same value from the database. Work date comes from approval time in this timezone; overnight checkout preserves that date.
4. Copy `.env.example` to `.env.local`. Set your Supabase URL and **public publishable key** (legacy anon key also works). Never put a service role key in this app.
5. In Supabase Authentication, disable public signups. Create employee and HR users using the dashboard's **Add user / Create new user** option with a password. Profiles are created automatically as employees. Set their names and promote the HR account with administrator SQL:

   ```sql
   update public.profiles set full_name = 'Employee Name' where id = '<employee-user-uuid>';
   update public.profiles set full_name = 'HR Name', role = 'hr' where id = '<hr-user-uuid>';
   ```

   Users created before the migration need a profile inserted by an administrator. Employees cannot edit profiles or roles. Account provisioning/password administration remains in Supabase; there is no extra HR administration dashboard.
6. Run `pnpm dev` and visit http://localhost:3000. Sign in with the provided credentials.

## Deploy to Vercel

Import this directory as a Next.js project. Install using `pnpm install --frozen-lockfile` and build using `pnpm build`. Add both `.env.example` variables to the Vercel environment before building. Configure your production URL in Supabase Authentication URL settings. Apply the migration before first use. Redeploy after changing public environment variables.

## How it works

- A pending request is an attendance row with null In, Out, work date and approver, and false signature.
- `request_check_in(location)` derives the employee from the authenticated session. A partial unique index prevents multiple pending/active rows, including concurrent requests.
- `approve_check_in(id)` requires an HR profile, locks the pending row, then writes `clock_timestamp()`, the business work date, approver and signature atomically. It cannot approve the caller's own row.
- `check_out(id)` locks only the caller's active row and uses the database clock. Checkout cannot be repeated or edited.
- RLS limits read visibility; direct writes are revoked. RPCs validate authorization in the database and use an empty search path. User metadata never grants HR privileges.
- Realtime publishes attendance changes under RLS. The UI also reconciles on reconnect, tab visibility and every 15 seconds as a fallback. No browser-generated attendance timestamps.
- The unique index releases after checkout, permitting another session on the same day. There is no one-session-per-day rule in the requirements.

## Validation

`pnpm test` runs actual embedded PostgreSQL tests for Office and Remote request → approval → checkout, signature integrity, duplicate sessions, role escalation, direct-write denial, employee data isolation, anonymous denial and invalid/repeated operations. Embedded PostgreSQL excludes only the Supabase replication publication line.

`pnpm typecheck` checks TypeScript. `pnpm build` creates the production build.

A live Supabase project is needed to verify Auth and Realtime end to end. In separate browser sessions, sign in as employee and HR. Request Office check-in, verify it appears for HR, approve, verify employee In time, then check out and confirm HR Out updates. Repeat for Remote. Check isolation with a second employee. No real users or fabricated attendance are seeded by this app.

## ICONIC monthly attendance update

For an existing installation, apply `supabase/migrations/202610050001_daily_attendance.sql` before deploying this update. It preserves historical rows and RLS, adds the server UAE date RPC, and serializes check-in/approval on the employee profile to prevent new attendance after same-day checkout. Existing duplicate historical rows are retained. New installations apply both migrations in filename order.

Both portals default to the server's current UAE month. Arrow navigation filters by the official `work_date`; pending HR records use their request date in Asia/Dubai. HR pending approvals stay visible independently of the selected month. The Today card stays independent of the historical month and keeps previous-day open sessions available for checkout. Monthly summaries count distinct attended dates, never hours. Profile `full_name` is used verbatim; administrators can set real names in Supabase.

The shared header uses a tightly cropped, lossless PNG of the supplied ICONIC symbol. Original symbol pixels and proportions are preserved; only surrounding black canvas is removed. It is displayed at 46px high on desktop and 38px on mobile, with no added shape.
