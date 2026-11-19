# End-to-end tests

Playwright drives the web build of the app in two browser contexts (two
people, two IndexedDBs) against a local relay. These tests run outside the
pipeline gates.

One command from the repository root:

```
npm run e2e
```

Playwright starts the relay on port 3100 (in-memory database, so every run
starts clean) and builds `apps/mobile` for the web with the relay address, then
serves `apps/mobile/dist` on port 8100 with a fallback to `index.html`
(`e2e/serve-web.ts`). The first start builds the web app and can take minutes.
Locally, running servers on these ports are reused; in CI (`CI` set) they are
always started.

Chromium must be installed once: `npx playwright install chromium`. The
tests use the new headless mode (`channel: "chromium"`) and grant the clipboard
and notification permissions, so the invitation link is read from the clipboard.

`npx playwright test --list` lists the scenarios without a browser. Traces of
failed tests land in `test-results/`, the HTML report in `playwright-report/`.

Helpers in `e2e/support/app.ts` (`newUser`, `onboard`, `pair`) give each test its
own contexts and pair, so tests do not depend on the relay state.
