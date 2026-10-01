# Validation results

- Production build: **passed** with `next build --webpack` (Next.js 16.3.7).
- TypeScript: **passed** as part of the production build.
- Database tests: **passed** using embedded PostgreSQL (PGlite), with the actual migration and RLS/grants/functions. Tests cover Office and Remote request/approval/checkout, duplicate pending and active sessions, repeated approval/checkout, invalid location, cross-employee isolation, anonymous access denial, direct writes, role escalation and signature protection.
- Browser rendering: **passed**, desktop 1440px and mobile 390px. Six exact table columns; mobile table scrolls horizontally within its container without widening the page.
- Browser interaction: **passed with mocked Supabase responses**, exercising sign-in, Remote request, HR approval, employee checkout and HR table update. No page exceptions or framework error overlay. Screenshots use test data and do not represent real attendance.
- Live Supabase Auth, Realtime delivery and deployment: **not verified**. No project URL/key or deployment account was provided. Realtime SQL publication and subscriptions are implemented, but the browser test uses reconciliation after mocked changes rather than a live Realtime channel.

The default Turbopack build could not create its worker port in this local environment. The project uses Next.js's supported Webpack dev/build mode and builds successfully.
