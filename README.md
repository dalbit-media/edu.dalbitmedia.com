# DalbitEdu

React/Vite frontend with a Node.js booking API and a persistent SQLite calendar.

The shared back-to-top button appears after scrolling more than 300 pixels on
home, research, administrator and payment pages. It supports keyboard use and
respects reduced-motion preferences.

## Source archive

Run `npm run zip` in a Git repository with at least one commit to create
`dalbit-edu.zip` from `HEAD` using `git archive`. Only committed files are exported;
untracked files and uncommitted edits are not included. The output archive is
ignored by Git. This command does not initialize a repository or create commits.

## Consultation services

The consultation overview focuses on learning-science-informed career and academic
aptitude assessment, interest and passion exploration, and debates that introduce
new perspectives and exploratory activities. Future-job exploration compares
changing fields such as AI/data, climate/energy, bio/health and digital creation,
focusing on real tasks, problems and learning rather than promising career rankings.
Assessment results support
self-understanding, not fixed ability rankings or guaranteed career outcomes.
These interests can be selected in the intake form's optional consultation topics.
The process navigation links to a dedicated section below the service descriptions,
covering intake, scheduling/payment, consultation activities and optional follow-up
support rather than the former short strip near the top of the homepage.

- **Free basic consultation (up to 15 minutes):** submit student/contact information. The request is
  recorded in the operator queue; the operator contacts the applicant about an
  available time. The consultation lasts up to 15 minutes, and submission
  does not immediately reserve an appointment.
- **Expert in-depth consultation (paid):** **KRW 150,000 per session, tax included, up to 60 minutes**. The calendar
  reserves a full 60-minute block for one consultant. An appointment is confirmed
  only after the server verifies the Toss payment.
- **Recurring coaching:** learning goals, periodic progress reviews and feedback;
  frequency, duration and fees are agreed separately.
- **Mentorship:** review student interests and mentor availability before arranging
  a connection and exploratory learning activities.
- **Study-group matching:** review grade, learning goals, interests and availability
  before connecting suitable participants.
- Continuing-support enquiries use the existing intake form's optional topics.
  Schedules, matching and separate fees are confirmed by the operator, not
  automatically on submission. These services are not included in the one-off
  expert consultation payment.
- All calendar dates and times use **Asia/Seoul (UTC+9)**, regardless of the
  applicant's device timezone.

The current tax-inclusive price is set by the operator, not a measured average for
selective-school consultation. [Miso's published career-consulting guide](https://miso.kr/blog/%EB%8F%99%EC%9E%91-%EC%B7%A8%EC%97%85-%EC%A7%84%EB%A1%9C-%EC%A0%84%EB%AC%B8-%EC%BB%A8%EC%84%A4%ED%8C%85-%EB%B9%84%EC%9A%A9)
provides a broader career-consulting comparison; those services include employment
advice and are not an exact equivalent of this student service. Review pricing
against the consultant's qualifications and scope before launch. The amount is
defined once in [src/booking.js](src/booking.js); the API snapshots it on each order
and does not accept a price supplied by the browser.

## Local setup

Use **Node.js 22.15 or later** (Node.js 24 LTS is recommended). Node's built-in
SQLite module may print an experimental warning on Node.js 22.

1. Copy `.env.example` to `.env`.
2. Leave `ADMIN_PASSWORD` blank to choose a password in the local administrator
   setup screen, or set it privately to seed the first administrator.
3. Set `SUPPORT_EMAIL` to the actual contact address.
4. Run `npm start` to build the frontend and start the app and API on one server.
5. Open `http://127.0.0.1:5173`. Keep this origin consistent with `PUBLIC_ORIGIN`;
   mixing `localhost` and `127.0.0.1` will intentionally reject write requests.
6. Use the small administrator link in the page footer (`/admin`), complete
   first-administrator setup or log in, and
   publish calendar hours. Administrator access is not shown in the main
   navigation; server-side authentication remains required.

Free requests work without payment keys. Paid checkout stays explicitly disabled
until both payment keys, a registered administrator, and the support address are configured.
No credentials, demo appointments, or sample student records are preloaded.
Old browser-local intake records are not automatically uploaded.

## Toss configuration

Use matching **API individual-integration** client/secret keys from the Toss
developer center, not payment-widget keys:

```text
TOSS_CLIENT_KEY=<matching test client key>
TOSS_SECRET_KEY=<matching test secret key>
```

Follow [Toss's v2 payment-window integration guide](https://docs.tosspayments.com/guides/v2/payment-window/integration).
The frontend loads the official v2 SDK and offers cards and the integrated easy-
payment options. The **secret key never enters the frontend bundle**.

Return URLs are generated from `PUBLIC_ORIGIN`:

- `/payment/success`: validates the order, owner cookie, amount, payment key,
  currency and provider response before confirming.
- `/payment/fail`: releases an unpaid hold when its order is known.
- `/api/payments/webhook`: configure Toss payment-status webhooks here. The
  payload is not trusted as proof of payment; the server retrieves the canonical
  payment from Toss before updating an existing order.

Test with your own Toss test account first. Test mode is prominently identified
and does not charge real money. To launch, complete Toss merchant approval and
replace both keys with the matching live pair. Also review the actual business
identity, consumer terms, privacy notice and refund policy for your business.
The included policy offers a full refund on cancellation before the appointment
starts; later requests are handled by the operator under applicable obligations.

## Administration and reliability

- The first successful protected setup creates the single administrator and
  starts an authenticated session. Ordinary site visitors and intake applicants
  are never promoted. Passwords are 16–256 characters and stored only as salted
  scrypt hashes in SQLite; login hashing is asynchronous.
- Local setup is allowed only with a loopback `PUBLIC_ORIGIN`, loopback request
  host and loopback socket. A public deployment requires a private random
  `ADMIN_SETUP_TOKEN` (32–256 characters) to enable setup. Share that token only
  with the intended operator, enter it in the setup form, then remove it from
  the environment and restart. Never put it in a URL, browser bundle or logs.
  Without the token, public initial setup stays locked. Prefer completing
  setup locally before exposing the server publicly.
- `ADMIN_PASSWORD` is an optional seed only when no administrator exists; it
  never overwrites an existing password on restart. After initialization,
  remove the plaintext seed from the environment. Use **관리자 비밀번호 변경**
  in the admin page to change it; the current session is renewed and all other
  administrator sessions are revoked.
- Recovery: stop the API, privately set a new `ADMIN_PASSWORD` in the ignored
  `.env`, run `npm run admin:reset`, remove that plaintext value, and restart.
  Recovery requires an existing administrator and revokes all sessions without
  deleting bookings, students or calendar records.
- Administrator sessions use HttpOnly cookies, expire after eight hours, and are
  invalidated on API restart. Password login is rate-limited. Keep the API behind
  a trusted reverse proxy; the default rate limiter uses the socket address and
  does not trust client-provided forwarded-IP headers.
- Publish, close or reopen nonoverlapping one-hour slots. A booked or held time
  cannot be closed or changed. There is no automatic availability seeding.
- Paid orders hold a slot for 15 minutes. Expired, unpaid holds are released.
  Confirmation and refund operations use stable Toss idempotency keys.
- Unknown payment outcomes remain locked rather than reselling a possibly paid
  appointment. Use **결제사 상태 확인** in the admin screen to reconcile with
  Toss. Do not manually remove a locked database row to make a slot available.
- Cancel/refund through the booking receipt or admin screen. Slots reopen only
  after a full provider cancellation is verified. Partial/external adjustments
  require operator review and are not treated as a successful full refund.
- Free requests can be marked as contacted/completed and assigned a calendar
  block after agreeing a time with the applicant. Free basic consultation lasts
  up to 15 minutes; the calendar still reserves the hour block to avoid overlap
  with paid bookings.
- Refresh the admin board to see new requests; it also refreshes every minute.
  This implementation does **not** send automatic email, SMS or Kakao messages,
  or create video-call links. Operators use the recorded contact preferences.

## Production and persistence

Run `npm start` to build and serve the pre-rendered frontend (including research,
administrator and payment return routes) and `/api` from one server. The
default local port is 5173; deployments can set `PORT` to the required listening
port.

Set `PUBLIC_ORIGIN` to your exact HTTPS site origin. Terminate TLS at your reverse
proxy and forward requests to the app server. Use one app instance on one
persistent server; this is not an ephemeral/serverless SQLite
deployment. Set `DATABASE_PATH` to an absolute path on a persistent disk, or use
the default `data/dalbit.sqlite`. Restrict filesystem access and take SQLite-
consistent backups including uncheckpointed WAL data. Establish an appropriate
student-data retention/deletion process before accepting real applications.

SQLite schema changes use transactional `user_version` migrations. Existing
records are retained, and a newer unsupported schema is rejected rather than
silently modified. Back up the database before deployment.

Never put the secret key or admin password in `VITE_` variables, browser storage,
source control, logs, or client screenshots. `.env` and the database are ignored.

## Public-page SEO

Set `PUBLIC_ORIGIN` to the exact public HTTPS origin **before building and before
starting the server**, for example `https://your-domain.example` without a trailing
slash. Local development defaults to `http://127.0.0.1:5173`. Rebuild when changing
the deployment origin so static metadata and client-side navigation agree.
Only this public origin is exposed to the browser; credentials remain server-only.

The build pre-renders 14 indexable pages: the homepage, `/research`, and twelve
`/research/<reading-id>` course-reading details. Each has visible HTML without
JavaScript, a distinct title and description, a canonical URL, Korean Open Graph
and Twitter metadata, a 1200-by-630 social preview, and relevant JSON-LD.
Article metadata distinguishes the site's commentary from the original source.
Existing `/#/research/...` and `/#admin` bookmarks still work.

`/admin`, payment-result pages and missing pages use `noindex, nofollow`; the
production server also sends crawler headers and returns an actual 404 for
unknown pages. These directives are not access controls: administrator APIs
continue to require authentication. Payment query parameters do not enter
canonical URLs or structured data.

The build includes `sitemap.xml` and `robots.txt`. The Node server also serves
these using its configured public origin. The sitemap excludes admin, payment
and error pages. Robots excludes the API but allows fetching admin pages so
crawlers can discover their noindex directive.

For static hosting, serve each generated route's own `index.html`, not a global
homepage fallback, and configure `404.html` as a 404 response. Proxy `/api` to the
booking server. After deployment, submit `/sitemap.xml` to search-engine webmaster
tools; indexing and rankings are determined by the search engines, not guaranteed.

## Validation

```text
npm run build
npm test
```

Build first: the SEO integration tests inspect generated HTML and serve it over
HTTP, including original PDF downloads and private-page crawler exclusions.
The API tests use isolated databases and a stubbed provider, never live payments.
They cover authenticated administration, shared intake, nonoverlapping availability,
exclusive booking holds, amount/ownership checks, confirmation replay, refunds,
unknown payment outcomes, webhook verification and persistent data.
Administrator tests additionally cover protected bootstrap, simultaneous setup,
password rotation, session revocation, persistence, recovery and schema migration.

## Maintenance boundaries

- [server/database.js](server/database.js): schema migrations and transactions.
- [server/adminAuth.js](server/adminAuth.js): password hashing, bootstrap and sessions.
- [server/http.js](server/http.js): HTTP validation, JSON responses and public-page serving.
- [server/app.js](server/app.js): booking, calendar and provider workflow orchestration.
- [src/AdminAuthentication.jsx](src/AdminAuthentication.jsx): setup, login and password forms.
- [src/adminPolicy.js](src/adminPolicy.js): shared administrator password limits.

Keep credentials and database work server-side. Reuse the shared intake, booking
and SEO modules rather than duplicating business rules across these boundaries.
