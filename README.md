# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

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
