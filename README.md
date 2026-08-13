# KNUST Library Mall

KNUST Library Mall is a responsive library discovery, physical-borrowing, digital-reading, inventory, and circulation system built with Next.js 16 and Supabase. The public catalogue is available at `/`; authenticated students continue at `/library`, librarians work from `/librarian`, and administrators manage the complete system at `/admin`.

When Supabase is configured, catalogue, stock, requests, loans, notifications, staff actions, and analytics are persisted in Postgres. A local preview fallback remains available when Supabase variables are absent, but it is not a substitute for the database-backed presentation flow.

## Product capabilities

- Public, paginated live catalogue and active-category discovery with title, author, category, description, and ISBN search
- Personal-email confirmation with sign-in by personal email, KNUST student email, or index/student number
- Student academic and residence intake, private student-ID upload, and a consented administrator-only face-presence snapshot (no biometric matching)
- Physical borrow basket with a student-selected, immutable 1–7 day period
- Free self pickup or on-campus delivery with a fixed GHS 5 simulated payment
- Staff approval, separate delivery dispatch, student-side receipt confirmation, and dual-control failed-delivery returns
- In-app approval, dispatch, receipt, due-soon, overdue, return, and rejection notifications
- Exact copy-level stock allocation and return processing
- Student return requests, staff acceptance of the exact copy, and GHS 3.50 fines per completed 24-hour overdue period
- Per-loan simulated Card/MoMo fine settlement, immutable receipts, 48-hour student alerts, and Critical fines ledgers shown with GH₵ indicators
- Digital editions, chapter publishing, online reading, favourites, and reading progress
- Administrator book, cover, stock, student, verification, librarian, circulation, request-audit, analytics, and settings tools
- Super-administrator generation, suspension, and safe removal of normal administrator accounts with one-time credentials
- Librarian operational dashboard with approval/dispatch history and no guardian, ID-document, or facial data
- Librarian performance ranking based on approvals, dispatches, and student-confirmed deliveries
- Row Level Security, narrow role views, immutable audit events, private storage, and server-only privileged Auth operations

## Requirements

- Node.js 20.9 or newer
- npm
- A Supabase project for the real database-backed flow

## Install and run

```bash
npm install
cp .env.example .env.local
```

Fill `.env.local` with values from Supabase Dashboard → Project Settings → API:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
APP_URL=http://localhost:3000
ALLOW_PRESENTATION_SEED=false
PRESENTATION_SUPABASE_PROJECT_REF=YOUR_PROJECT_REF
```

`SUPABASE_SERVICE_ROLE_KEY` is server-only. Never rename it with a `NEXT_PUBLIC_` prefix, expose it to browser code, commit it, or include it in screenshots.

`APP_URL` is the canonical trusted origin used in confirmation and password-reset emails. Set it to the exact production origin when deploying. In local development, same-origin requests through localhost or ngrok use their browser-facing URL, while production recovery links never trust an arbitrary forwarded host.

For an ngrok presentation, add both `http://localhost:3000/**` and the exact current `https://YOUR-NGROK-HOST/**` to Supabase Dashboard → Authentication → URL Configuration → Redirect URLs. Supabase will not follow a confirmation or recovery redirect that is absent from that allow-list. If ngrok gives you a new hostname, update that Redirect URLs entry before testing email links.

Start the app:

```bash
npm run dev
```

The default development command uses Next.js's supported Webpack mode because the
Turbopack process was observed exhausting the Node heap during long, image-upload
presentation sessions. `npm run dev:turbopack` remains available for short local
experiments. For the most stable presentation run, use `npm run build` followed by
`npm start`, then point ngrok at port 3000.

Open `http://localhost:3000`. The public home stays at `/`; a successfully authenticated student is routed to `/library`.

## Install or upgrade the Supabase schema

1. Open Supabase Dashboard → SQL Editor and create a **new query**.
2. Paste the complete raw contents of [`supabase/knust_library_schema.sql`](supabase/knust_library_schema.sql).
3. Make sure no fragment is highlighted, then choose **Run** once so the transaction executes as a whole.
4. Wait for a successful completion before running seed or verification commands.

The schema is designed to be rerunnable after a failed or older installation. It creates the tables, relations, indexes, views, RPCs, RLS policies, starter catalogue, audit/notification support, and both storage buckets:

- `book-covers` — public reads, administrator writes
- `student-ids` — private, administrator review only; signup upload is performed by the server route

If the SQL Editor reports an error, rerun the complete current file in a new query rather than running a selected fragment.

### Create the first administrator

1. Sign up through the application using one registered student email/ID pair
   from the signup allow-list and the personal email that should own the admin portal.
2. Confirm that personal email and allow the profile row to be created.
3. Replace the example email and run this statement separately in SQL Editor:

```sql
update public.profiles
set role = 'super_admin'
where lower(email) = lower('your-personal-email@example.com');
```

Sign out and back in. The account will then route to `/admin`.

### Auth redirect configuration

Keep email confirmation enabled. In Supabase Authentication → URL Configuration,
set the Site URL to the main browser-facing URL for the presentation and add
both browser origins to Redirect URLs:

- `http://localhost:3000/**`
- `https://YOUR-CURRENT-NGROK-HOST/**`

If the Confirm signup or Reset password email templates were customized, make
sure their link uses `{{ .RedirectTo }}` rather than hard-coding `{{ .SiteURL }}`.
The application supplies the validated localhost or ngrok return URL for every
request.

Signup confirmation and password recovery go to the personal email. The student email is mandatory and represents the student in the application, while personal email, student email, and index number can all resolve to the same private Auth account at sign-in.

### Registered-student signup demonstration

Public student signup is restricted to 19 fresh fictional institutional records
in `public.student_signup_allowlist`. Step 1 checks the student email and its
matching student ID before opening the ID/camera step; the Auth database trigger
repeats and atomically claims the same record so a direct API call cannot bypass
the rule. Unknown, mismatched, inactive, and already-claimed records are rejected.
The table has RLS enabled and no browser-role policy or grant; only the server can
perform the lookup. Email confirmation still goes to the personal inbox entered
on the form.

The complete test list is documented beside the SQL insert in
[`supabase/knust_library_schema.sql`](supabase/knust_library_schema.sql). It follows
this exact sequence:

- `21135353@st.knust.edu.gh` with index number `21135353`
- `20144323@st.knust.edu.gh` with index number `20144323`
- The remaining 17 numeric email/index pairs are listed directly in the SQL.

Use a personal inbox you can access when testing because Supabase sends the
confirmation link there, not to the fictional institutional address. Each pair
can create one account. If an incomplete Auth account is deleted, its claim is
released automatically so that pair can be tested again safely.

## Presentation accounts

The SQL registry contains exactly 19 obviously fictional students with academic, residence, phone, and guardian information. Their deterministic test emails and passwords are listed in comments immediately above the registry insert in [`supabase/knust_library_schema.sql`](supabase/knust_library_schema.sql).

After applying the SQL, provision or refresh their Supabase Auth users with:

```bash
ALLOW_PRESENTATION_SEED=true PRESENTATION_SUPABASE_PROJECT_REF=YOUR_PROJECT_REF npm run seed:presentation
```

The project ref is the public first segment of your Supabase URL. For example, the ref for `https://abcdefghijklmnopqrst.supabase.co` is `abcdefghijklmnopqrst`. The guard accepts that bare ref, the `*.supabase.co` hostname, or the complete project URL, but it still requires an exact match with the connected project. If these values already exist in `.env.local`, run only `npm run seed:presentation`.

The seeder is idempotent: it creates missing fictional users, refreshes existing ones, connects all 19 registry rows to Auth, and fills verified presentation-only private profiles. It uses the service-role key and **does perform writes**. It also prints the 19 fictional credentials for the presentation, so run it only in a trusted terminal and never use these predictable passwords in production.

## Borrowing workflows

### Self pickup

1. The student adds available physical titles to the basket.
2. The student chooses an exact integer period from 1 through 7 days and selects **Self pickup**.
3. Submission creates a pending request and snapshots the selected period; it does not create a loan or start a due date.
4. An active librarian or administrator approves the request. Available physical copies are locked and allocated atomically.
5. The loan and due clock start at approval using the exact period the student selected. Staff cannot replace it.
6. Staff later return the exact copy and its inventory status is restored or marked damaged.

### On-campus delivery

1. Delivery is available only when the signup/profile residence is `on-campus`.
2. The student selects the saved hall/hostel card, enters floor and room, and chooses the exact 1–7 day period.
3. The student selects card or mobile money and completes the GHS 5 **simulation**. No money is charged.
4. Submission records only the simulated method, success status, server-generated reference, and paid time. Card number, CVV, cardholder, expiry, MoMo number, and provider form data are not sent to Supabase.
5. Staff approval allocates the copies but does not create a loan or due date.
6. A separate staff dispatch action records the dispatching librarian/admin and time.
7. Only the owning student can confirm receipt after dispatch. That student confirmation creates the loan and starts the exact selected-period due clock.
8. If a delivery fails before student receipt, staff must use **Recall delivery** with a reason. A delivery that never left the desk releases its held copies atomically. A dispatched delivery instead moves the exact copies into unavailable controlled-return custody.
9. For a dispatched recall, neither the dispatcher nor the recaller may certify the physical return. A different active librarian/administrator must check every allocated copy back at the desk before it becomes available again. Both actors and timestamps remain visible to students and administrators.

Approval, dispatch, and receipt are separate audited events. Administrator request cards show the responsible staff names/emails, while the performance view ranks librarians using completed, student-confirmed work. This two-sided record is designed to make unilateral false delivery completion visible; it is not a replacement for institutional disciplinary, payment, or physical handoff procedures.

## Librarian lifecycle

- Administrators can generate a librarian account from a full name and personal email.
- The server creates a unique `LIB/STAFF/YY/######` staff ID and a cryptographically random temporary password.
- The temporary credential is returned once to the administrator and is not written into audit metadata.
- A one-use, short-lived service-only provisioning intent authorizes the Auth trigger; browser-editable metadata cannot promote a user.
- Administrators can promote an existing account, suspend/reactivate a librarian, or remove librarian privileges.
- Librarians sign in with their personal email or generated staff ID and can request a password-recovery link in Settings. Recovery is sent to the personal email with a generic, non-enumerating response.

## Administrator lifecycle

- Only an active, unrevoked super administrator can generate another administrator account.
- The server issues a unique `ADMIN/STAFF/YY/######` ID and cryptographically random temporary password, shown once for secure sharing.
- Normal administrators retain the full operational admin workspace, including librarian management and private student verification, but cannot change the global sign-up lock or manage administrator membership.
- Suspension is reversible. Removing administrator access preserves the Auth account and audit history while revoking admin authorization.
- Catalogue publication, archive, and restoration are audited RPC transitions. Direct clients cannot change lifecycle columns or permanently delete books.

## Returns and overdue fines

- A student requests return from the exact loan card; this does not stop fine accrual or change copy custody.
- A librarian/administrator accepts the physical return, records condition, closes the exact loan item, updates its tracked copy, snapshots the final fine, and creates an in-app notification and audit event atomically.
- The fine rate is `GH₵ 3.50` for each completed 24-hour period after the due time.
- Students settle the authoritative outstanding balance for one specific loan using simulated Card or MoMo. The browser never supplies an amount; Postgres computes it and creates an immutable, retry-safe receipt.
- At two completed overdue periods, the scheduled worker sends one deduplicated 48-hour critical-fine notification. Staff Critical fines tabs retain both outstanding accounts and paid receipt history, while alert badges count only unpaid balances.

## Identity and privacy boundaries

- The student record/email lookup and face-presence step are currently **simulations** because no institutional verification or biometric-matching provider is integrated.
- After explicit consent, the camera step stores one compressed face-presence JPG for administrator review. It does not create an embedding, biometric template, automated match result, or facial-recognition score.
- A real uploaded student-ID front image is MIME/signature/size checked by the server and stored in the private `student-ids` bucket. If storage/profile finalisation fails, the incomplete Auth user and uploaded object are cleaned up.
- Students receive a narrow profile view with upload booleans, not private storage paths. Administrators can request 60-second signed evidence links. Librarians receive only the operational student/contact/residence snapshot needed for circulation and cannot access guardian, ID-card, face-snapshot, or consent evidence.
- Borrowing requires an overall verified identity state. If a student edits academic, residence, guardian, or tracking intake, the record returns to pending and borrowing remains blocked until administrator review. Existing pre-migration students can be recovered through the same administrator verification action; that recovery is explicitly labelled as a legacy simulation.
- The public browser receives only published catalogue/category RPC fields. It cannot directly query profiles, inventory, requests, loans, chapters, or private storage.
- Privileged Auth Admin API work and sign-in alias resolution stay on the server and use no-store responses.
- Application roles are authorised from `public.profiles`; generated librarian/admin accounts additionally require a role-bound, one-use provisioning intent.

Before production use, replace the simulated student/face check and payment flow with approved providers, complete a privacy/legal review, define retention/deletion rules for identity documents, rotate all presentation credentials, and test disaster recovery.

## Main routes

- `/` — public live catalogue; protected actions open the sign-up/sign-in prompt
- `/sign-up` — student details followed by ID and camera-consent simulation
- `/sign-in` — student, librarian, and administrator access
- `/forgot-password` — personal-email recovery request
- `/reset-password` — password recovery completion
- `/library` — authenticated student dashboard and full catalogue
- `/basket` — exact 1–7 day period, fulfilment, address, and simulated payment
- `/loans` — pending requests, staff/dispatch audit timeline, receipt confirmation, return requests, fines, and simulated fine payment
- `/saved` — favourites
- `/profile` — student profile and private intake summary
- `/book/[slug]` — book details
- `/read/[slug]` — published digital chapters
- `/librarian` — operational approvals, dispatch, returns, Critical fines, inventory, and librarian settings
- `/admin` — consolidated administration, administrator/librarian management, Critical fines, analytics, and audit controls
- `/api/catalog` — no-store public catalogue/category payload
- `/api/admin/librarians` — authenticated administrator-only librarian provisioning
- `/api/admin/administrators` — active-super-administrator-only administrator provisioning

## Verification commands

Run the local contract suite whenever SQL or workflow code changes:

```bash
npm test
```

These Node built-in tests are non-mutating and assert the public catalogue/category boundary, exact 1–7 day period, pickup/delivery custody, private evidence policies, trusted staff provisioning, super-admin boundaries, reversible book lifecycle, return/fine/payment integrity, GH₵ critical-fine surfaces, trusted email redirects, and exactly 19 fictional registry credentials.

After applying the SQL and seeding presentation users, check the connected project:

```bash
npm run verify:supabase
```

The live verifier performs reads only. It checks the anonymous RPCs, denied anonymous private-profile/storage access, bucket visibility, settings, the exact librarian/administrator provisioning table and RPC signatures, request audit shape, staff/admin views, registry count, 19 Auth presentation users, and their profile/private-intake links. It never prints environment keys, passwords, user emails, or private student data. A failed check exits non-zero with the setup step to revisit.

Complete the application checks with:

```bash
npm run lint
npm run build
```

## Required scheduled due and critical-fine notifications

The schema includes an idempotent due/overdue/48-hour-critical notification worker. In a trusted Supabase Cron/Postgres context, schedule it at least hourly:

```sql
select public.run_due_notification_worker();
```

Do not expose that worker directly to anonymous or browser callers.
