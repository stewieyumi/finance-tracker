# Finance Tracker

## Local setup and build

Use Node 26 (the version family used in CI), then run `npm ci`.
Create `.env.local` with your **public** Google OAuth web client ID:

```dotenv
VITE_GOOGLE_CLIENT_ID=YOUR_PUBLIC_CLIENT_ID.apps.googleusercontent.com
```

Run `npm run dev` for local development. Configure the local app origin in the
Google OAuth client. Run `npm run verify` for typechecks, lint, API startup,
tests and a production build. Run `npm run test:sync-redis` separately for the
isolated real-Redis checks described below.

`npm run build` requires a nonblank `VITE_GOOGLE_CLIENT_ID`, including custom
build modes. Vite embeds this public value in the browser bundle at build time.
Set it in each deployment's build environment before building; changing a runtime
variable afterward does not rewrite an already-built static bundle.

CI supplies `000000000000-ci-build.apps.googleusercontent.com` to its verification
step so it can compile without accessing an account. This is a public synthetic
fixture, not a working sign-in client. To run that same credential-free check:

```sh
VITE_GOOGLE_CLIENT_ID=000000000000-ci-build.apps.googleusercontent.com npm run verify
```

Use your real public client ID for deployments and real sign-in testing. A build
with the synthetic fixture checks compilation only. The guard checks presence;
Google still validates the client and allowed origins during sign-in.

## Dependency audit status

Run `npm audit` to see the complete build/test dependency report, and
`npm audit --omit=dev` for production dependencies. CI reports the complete
result and requires the production audit to pass.

The current development graph still includes Picomatch <=4.0.7, for which
[GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf)
has no published patched version. Its regular-expression denial of service
requires attacker-controlled glob patterns. Current Tailwind/Vite patterns are
project configuration, not user transaction input. This limits the observed
exposure; it does not remove the affected dependency or certify every dev-server
usage. Keep the advisory visible and refresh the lockfile when an upstream fix
is available. Production dependencies currently have no reported advisories.

## Server environment

Configure server-only values in the deployment environment. Redis-backed sync,
sessions and Quick Expense use `KV_REST_API_URL` and `KV_REST_API_TOKEN`. Receipt
scanning additionally uses `GEMINI_API_KEY`. Optional direct iCloud connections
use `CALENDAR_ENCRYPTION_KEY` as described below. Google token verification also
uses the same public `VITE_GOOGLE_CLIENT_ID` on the server.

Keep server secrets out of `VITE_` variables and source control. Required provider
configuration depends on the feature; the static build guard validates only the
public Google client ID, not live Redis, scanner or calendar access.

## Per-user Apple Calendar connections

Users connect iCloud from **App Settings → Calendar → Apple Calendar** or the
Apple Calendar button in Gigs & Tasks. The guided setup uses their Apple Account
email and an Apple app-specific password. Google sign-in identifies their Finance
Tracker account; it does not authorize access to iCloud. Google and Notion calendar
integration code remains available for future work.

The server requires the existing Redis configuration (`KV_REST_API_URL` and
`KV_REST_API_TOKEN`) and a dedicated `CALENDAR_ENCRYPTION_KEY`. Generate this key
as 32 random bytes encoded in base64, for example with `openssl rand -base64 32`,
and store it as a server-only deployment secret. Keep the same key across
redeployments that use the same Redis store. Changing it requires users to
reconnect. Never put it in a `VITE_` variable or commit its value.

Calendar credentials are encrypted with AES-256-GCM, bound to the verified app
user's Google subject, and stored separately from financial snapshots and backups.
The old shared `ICLOUD_APPLE_ID`, `ICLOUD_APP_PASSWORD`, and
`ALLOWED_GOOGLE_EMAIL` configuration is no longer used by this endpoint. Existing
users of that prototype must connect through the guided flow.

Connecting validates access without creating events. Setup creates only the four
FT status calendars after the user chooses it. Synchronization still requires
reviewing individual changes. Disconnect removes the saved credentials and keeps
existing events and financial data. Users can additionally revoke the app-specific
password in their Apple Account. See [Apple's setup instructions](https://support.apple.com/en-us/102654).

Before release, test real iCloud authentication, calendar creation, ETag/MOVE
behavior, disconnect/reconnect, and isolation between two Finance Tracker users.
Local fixture tests simulate the provider and do not establish live iCloud support.


## Redis sync integration checks

Run `npm run test:sync-redis` after installing Redis server and CLI from the
[official Redis installation instructions](https://redis.io/docs/latest/operate/oss_and_stack/install/install-redis/).
Use `REDIS_SERVER_BIN` and `REDIS_CLI_BIN` if the binaries are outside PATH.
The command fails if Redis is unavailable; it never connects to a configured
cloud database. CI runs these checks after `npm run verify`.

Each suite launches its own temporary Redis with TCP disabled, a private Unix
socket and persistence disabled, then stops it and removes its temporary files.
The handler's real Lua is executed through a test transport; Google token checks
and browser storage/broadcast are fixtures. No provider credentials, personal
finance records or running Redis service are used.

Coverage includes competing writers, unchanged data after stale rejection,
legacy/malformed envelopes, revision limits, account isolation, pending reload
recovery (including a failed primary storage write), explicit conflict choices,
and a lost response after an accepted save. This validates local Redis semantics;
it does not certify a particular hosted provider's HTTP transport or live sign-in.
Ordinary `npm test` explicitly skips these opt-in suites.


## Browser smoke tests

Install the locked development dependencies, then run:

```sh
npx playwright install chromium
npm run test:browser
```

The suite builds the real app with a public synthetic client ID and launches its
own preview on `http://127.0.0.1:5188`. The port must be free; it never reuses an
existing server. Each case uses a new Chromium context with synthetic session
and finance data. Sync requests are fulfilled in memory, Google SDK loading is
stubbed, and other external/unexpected API requests are blocked and fail tests.
No existing browser profile, cloud database or real provider account is used.

Three workflows run at desktop and 375px phone sizes: first-time setup/wallet/
expense persistence, an internal transfer with a fee, and optional inflow entry
with cancel/focus checks. Browser results use `*.pw.ts` so ordinary Vitest does
not collect them. CI runs the suite in a separate job and retains synthetic-data
failure traces/screenshots for seven days. Local artifacts are ignored by Git.

These are Chromium rendering and application-flow checks with simulated cloud
auth/sync. They do not validate real Google sign-in, Redis/provider behavior,
Safari/iOS compatibility, camera access, or physical-phone performance. The
existing unit/integration and real Redis checks remain separate.


## Guided introduction

Finishing first-time setup starts a skippable spotlight tour of the five main
navigation areas. Existing users can replay it from Dashboard → Getting Started
→ Take a quick tour. It explains controls without recording transactions.
After the tour, an optional Quick Expense / iPhone Back Tap introduction opens
General settings with Quick Expense expanded and focused. It does not install
Shortcuts or create an automatic-saving connection without the user's action.

The preset download requests a separate browser context and includes Home Screen
return guidance so it does not intentionally navigate the tracker away. Its real
iPhone Home Screen → Safari/Shortcuts handoff still needs device acceptance;
Chromium download checks cannot certify that iOS behavior. Additional browser
cases cover the tour in light/dark mode at desktop and phone sizes, a 320px
resize, keyboard dismissal, direct setup entry, and unchanged finance snapshots.


Expenses and full Transaction History keep their top controls outside a
keyboard-focusable transaction list. Lists use the viewport space below those
controls, so scrolling records keeps the summary, entry buttons or filters in
place. Account retains its existing history preview. Very short/zoomed screens
can scroll the surrounding page or dialog when needed to keep controls and a
usable list reachable; the background page stays locked while History is open.
Browser checks cover stationary controls with65 synthetic records, loading
more, search and expanded date filters on a short viewport in both themes and
screen sizes, without changing finance snapshots.


## Install as an app

Dashboard offers a dismissible installation helper; Account → Install app keeps
it available later. “Not now” suppresses the Dashboard invitation for seven days
on that device. Standalone/app mode hides the invitation and changes the Account
entry to Installation help.

When the browser supplies `beforeinstallprompt`, clicking Install app opens its
native prompt. The event is consumed once, no prompt opens automatically, and
accepting a prompt is not reported as completed installation until `appinstalled`.
Otherwise the guide provides Android Chrome, Windows Edge/Chrome, iPhone/iPad
Safari, and Mac Safari instructions. Device detection selects instructions only;
it does not infer native-prompt availability. Browsers cannot reliably report
all apps previously installed outside the current session.

The existing web manifest and icons are reused. Installation adds no service
worker or offline guarantees; cloud sync, scanning, and automatic Shortcut saving
still need internet. This helper does not resolve cellular-network errors in
Apple Shortcuts.

Eight install browser cases cover light/dark fallback guidance, short-screen
reachability, dismissal persistence, Account access, focus restoration, simulated
native-prompt lifecycle, app-mode suppression, and unchanged finance snapshots.
The full Chromium suite has 22 cases. Native events and device identification are
simulated; actual Android/Windows OS installation and Safari behavior require
real-device checks after deployment.

Browser references: [native prompt lifecycle](https://developer.mozilla.org/en-US/docs/Web/API/BeforeInstallPromptEvent/prompt),
[Android Chrome](https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DAndroid&hl=en),
[Windows Edge](https://support.microsoft.com/en-us/edge/install-manage-or-uninstall-apps-in-microsoft-edge).


## Work presets and flexible first setup

First setup offers Employee, Creative / Multimedia, Freelancer, Business /
Self-employed, Personal / Student, or General / choose later. Work presets are
shared with Settings → General and suggest labels and categories only. They do
not create accounts with money, sample transactions, paid work, or received
income. Every feature stays available; a work preset does not choose a pay
schedule or restrict the user to a profession.

Income is a separate choice: regular, irregular, both, or set up later. Regular
and mixed income expose the existing optional gross-pay, deduction, and payday
controls. Irregular income saves zero regular pay and no configured pay dates;
client payments are tracked through Inflows. Choosing later preserves current
regular-pay configuration. No income-pattern or profession schema is added.
Wallet balances, library records, and history are preserved at completion;
partial setup edits are discarded when setup is skipped. Setup changes are
saved only at Finish Setup & Launch.

When regular pay is not configured, Dashboard shows Income at your pace with
an Inflows entry and optional regular-pay setup instead of a zero-salary plan.
A previous payday execution keeps the existing distribution/undo view available.
The calculation, collection, payment, and wallet-mutation implementations are
unchanged.

The replayable guided introduction defaults to five short areas, with an
optional ten-area All features tour. Expand More about this area for practical
notes on transfers, receipt review, inflows/partial receipts, commitments, gig
statuses, goals/planning, history filters, settings/backups, and optional
calendars. The final step offers installation guidance and clearly identifies
Quick Expense / Back Tap as an optional iPhone setup. Tour navigation performs
no financial actions. Skip, Escape, Back, and replay remain available.

Validation includes work/income combinations, later/irregular transitions,
Settings preset consistency, zero-pay Dashboard navigation, preservation of
prior payday undo access, and short-screen full-tour navigation. Four new
Chromium cases cover freelance setup through a name-only inflow and reopening
in both themes at desktop and phone sizes. New-user setup screenshots use an
explicit visual theme fixture before saved appearance is chosen; tour appearance
uses the actual saved theme. Browser auth/cloud are simulated as described above.


## Contextual guides

First visits to 22 registered areas show a short spotlight guide: the five main
tabs, Operations sections, six Settings sections, four Runway views, Yearly,
Upcoming, Payday, Transaction History, and goal setup. A Guide button replays the
current area's introduction. Skip, Escape, Back, and Done operate only the guide;
they do not activate the highlighted financial or account controls.

Completion and the General → First-visit guides preference are scoped to the
signed-in subject on this device. Automatic guides wait while the general tour,
installation help, an editor, or a sync conflict is open. Direct Quick Expense
setup suppresses automatic guidance until that setup is left. Guidance makes the
background inert and restores focus to the area's Guide button when closed.
It does not change financial schema, saved balances, or transactions.

## Delete Finance Tracker account

Settings → Account offers Export JSON backup and a separate deletion dialog.
Deletion requires a bound app session, the current account identity, and typing
DELETE. Cancel and Escape leave records unchanged. While a request is pending,
the confirmation prevents duplicate submission or dismissal. Errors keep the
dialog open and do not claim successful deletion.

The DELETE /api/account handler atomically removes that subject's finance record,
encrypted iCloud connection, and active Quick Expense connection. Other accounts
are preserved. A calendar action holding the existing per-user lock returns a
retryable conflict before deletion. A non-financial account-generation marker
revokes old sessions and blocks stale sync writes and connection saves. On a
subsequent sign-in, generation-aware clients clear that subject's old local
snapshots and pending writes before they can sync; older clients lacking the
new generation acknowledgment must update before reconnecting a deleted profile.
In-memory sync generations also reset, so late acknowledgments cannot revive an
old pending snapshot. No financial schema migration is needed.

This removes Finance Tracker's stored data and connections, not a user's Google
or bank accounts, downloaded backups, or external calendar events. Offline
copies cannot be remotely erased; they may remain until the device reconnects.
A minimal deletion marker is retained to prevent stale-device restoration.
Existing temporary security/session and request-replay records expire within
30 days. A later sign-in starts a fresh profile. Unknown request outcomes are
reported as unconfirmed; the user is directed to reconnect and check.

Validation uses synthetic accounts only: browser confirmation/cancellation,
success and failure; exact-owner cache cleanup; and real disposable Redis tests
for atomic deletion, stale sessions and bearer writers, in-flight sync and
connection races, blocked calendar actions, same-account recreation, and late
write acknowledgments. The browser suite covers all 22 guide areas in light and
dark at desktop and phone sizes. Physical Safari/OS checks and live-account
deletion are not implied by this isolated coverage.


API test filenames use the `_*.test.ts` convention so Vercel excludes them from
function discovery. The native API import check rejects unprefixed test files
before deployment. The seven application API routes remain unchanged by this
packaging rule. See [Vercel's utility-file convention](https://vercel.com/docs/functions/configuring-functions/advanced-configuration).


## Responsive fit coverage

The browser suite checks 14 CSS viewport sizes from 320 × 320 through
1920 × 1080, in light and dark themes. Narrow cases use the existing touch/mobile
project; wider cases use the desktop project. Short landscape and compact
640 × 450 viewports exercise layouts with limited space. These are browser
emulations, not physical Safari, keyboard, notch, or OS-install certification.

Returning-user cases include long record names and large balances. Checks cover
page overflow, unintended horizontal scrollers, full bottom-navigation labels,
footer clearance, and reachable modal headings, fields, and actions. Intentional
horizontal tab/table scrollers remain allowed. The suite opens entry, transfer,
balance, commitment, gig, history, ledger, planning, and Settings screens without
saving financial changes; the finance snapshot must stay unchanged. Separate
first-setup and expanded-tour cases cover portrait, landscape, and desktop flow.

On narrow screens the main header wraps, installation actions sit below their
text, and navigation uses less spacing while preserving its text size and touch
height. Settings keeps its guide beside the close control and caps the mobile
section list so the content area remains scrollable on short screens. Desktop
Settings retains its sidebar arrangement.
