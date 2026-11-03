# APEX Coaching Platform

## Product status

APEX is a **live, published app on the Apple App Store**
(https://apps.apple.com/app/id6810194114) — not just an installable PWA.
Clients download it from the App Store link in their invite email, then
open the activation link from that same email to set their password.
Treat this as the real, current distribution model everywhere it's
relevant: invite emails, onboarding copy, client-facing docs/guides, and
any "how do I get the app" messaging. Don't describe install as
browser-only "add to home screen" — that's no longer the primary path.

## Visual design conventions

Target look: dark, restrained, technical, premium. Applies identically in
both of the app's existing modes — the client app's own light/dark toggle
(`ClientThemeContext`/`useClientDark`; each client picks it in Profile >
Appearance, saved per person on the phone, with the coach's Design
Settings switch as the default until they do) and the coach console's
single theme — by expressing it through the existing tokens in `src/theme.js`
rather than inventing new colors per screen:

- **Light surfaces**: `BG`/`SURFACE` (off-white, not stark white), `TEXT`
  (near-black charcoal), dividers via `BORDER`/`BORDER_STRONG`.
- **Dark surfaces**: `CLIENT_DARK_BG` (near-black), `CLIENT_DARK_SURFACE`/
  `CLIENT_DARK_SURFACE_2` (charcoal, for the rare case something truly
  needs to sit "above" the background), `CLIENT_DARK_TEXT` (off-white),
  dividers via `CLIENT_DARK_BORDER`.
- **One accent, not a rotating cast**: `MEASURE_BLUE`. Don't reach for
  orange/indigo/emerald/purple/rose as general-purpose UI color — those
  were a prior direction and are retired for anything but a narrowly
  justified one-off (and even then, ask first). Red stays reserved for
  destructive/danger states only.
- **No yellow/amber anywhere in the UI.** Not on new components, not as a
  restyle of existing ones unless asked.
- **Stop putting everything inside rounded white (or charcoal) boxes.** A
  `bg-SURFACE border rounded-2xl shadow-sm` card is not the default
  container for every piece of content. Default to a thin divider
  (`border-t`/`divide-y` using `BORDER`/`CLIENT_DARK_BORDER`) between
  sections on the page's own background; reach for an actual card only
  when something genuinely needs to read as a distinct, elevated object.
- Minimal gradients, minimal rounded cards.
- Strong typography carries hierarchy — lean on type weight/size/spacing
  before reaching for a background tint or a border to separate things.
- Lots of negative space; don't fill it with decoration.
- Numbers used as design elements (large, confident figures), not just
  buried in small print.
- Photography used sparingly, not as filler.

### Coached client Home and Training (Concept A, approved 2026-10-28)

- Black-and-white gym photography (`public/brand/gym-dark.jpg`,
  `workout-1..4.jpg`): Home's workout card, and the Training tab's photo
  header (`TrainingPhotoHero`) with today's workout or the current phase
  in white on it. The photo fades into the page colour at the top (the
  app's top bar is white) and the bottom; the page header and
  Today/Program switch sit on the plain page above it.
- Lists are open rows with thin dividers (a darker top rule), not cards.
- Daily Execution is open on the page; Nutrition is a solid card (no
  glass). Avoid a title that changes length over a backdrop-filter
  card: iOS WebKit can leave the new text half-drawn (#111).
- Content placed after `TrainingPhotoHero` must be `relative`, or the
  photo's bottom fade paints over it.

### Coach Overview (approved 2026-10-28)

- Gym photo header with the greeting and a large active-client count, then
  frosted-glass tiles (Challenges, Check-ins, Messages) and open
  sections under thin rules. Every number keeps its old destination (#115).
- The coach console is otherwise still dark-only.

### Train Solo (self-guided app, `src/solo/`) design rules

- **Every box/card is frosted glass**: translucent fill + hairline border +
  backdrop blur, in both Solo light and dark mode. Use `soloGlass(t)` from
  `SoloThemeContext.jsx` for Solo's own boxes; shared Card-based widgets
  rendered inside Solo pick it up via the `.solo-glass-scope` rule in
  `index.css`. Never a solid filled card on a Solo screen.
- **Pop-ups (bottom sheets) are glass too**: SoloThemeProvider supplies
  `soloSheetGlass` through `SheetSurfaceContext`, so every `BottomSheet`
  opened inside Train Solo is frosted; pass `dark={dark}` and use theme
  text colours inside Solo sheets.
- The membership/paywall sheet (`SoloPaywall.jsx`) uses its own clearer
  glass (`paywallSurface`) and thinner plan tiles, title "Train Solo
  Membership" (REGRESSION_TESTS.md #125).
- Cards run near full screen width: 12px (`px-3`) page gutters.
- No drawn/stock artwork: a program shows only its coach-uploaded
  `artworkUrl`, otherwise the plain cover gradient + APEX mark.
- Spelling is "Program", never "Programme".
- Solo work stays Solo-only — don't restyle the coached app, coach console
  or shared components to get a Solo look.

## APEX Nutrition (coached client app)

Goal: logging an ordinary meal faster and more reliably than MyFitnessPal,
with numbers clients and coaches can trust. How it's built now:

- **Every food is logged from the full-screen Add Food page**
  (`src/client/AddFoodPage.jsx`), which stays open between adds (running
  tally, Done). Don't reintroduce a bottom sheet that closes after one
  food, or a separate "which meal?" popup: the meal is chosen in the
  page header / the food page's Meal picker.
- **The food page is `FoodQuantitySheet layout="page"`**
  (`NutritionFeatures.jsx`), also used to edit a logged entry (tap it).
  The photo-meal and create-meal builders keep the sheet layout.
  Full-screen nutrition pages use `NutritionPage` (body locked, scroll
  contained, left-edge swipe back); stacking: Add Food page 100, sheets
  110, food page 118, app toast 120, barcode scanner 135.
- **Entries**: every new entry gets a fresh id (`newEntryId`); never
  bucket ids by time again (it silently dropped deliberate repeats).
  New entries carry `src` (the per-100g source food,
  `sourceSnapshot`) so they can be re-opened at a new amount;
  `entrySourceFood` handles older entries. Edits go through
  `updateFood` (keeps the id), multi-item logging through `addFoods`
  (one save).
- **Writes are local-first and must work offline** (#126): everything goes
  through `setNutritionForDate`, which applies the change to the phone's
  copy of the day and saves with `setDoc` without waiting for the server
  (`localFirst`), one save per day at a time (`nutritionDayQueue`). Never
  go back to a server transaction or an awaited server round trip for a
  client save — that is what made logging feel slow. Don't add a
  nutrition write that only works online.
- **"Logged" means food logged** (`hasFoodLogged` in
  `src/lib/nutritionLog.js`), never "the day's doc exists" (water alone
  creates it). Coach adherence scores completed days (ending yesterday).
- **Search** uses `rankFoods` (`src/lib/foodSearch.js`): client's own
  foods first, plain foods before brands/supplements, typo fallback; the
  AFCD list stays a last resort. `matchesSearch` (search.js) remains the
  plain filter for exercises and the builders.
- **Over the calorie target** shows how much over, in red (`calorieStatus`),
  never "0 left"; macro bars use `targetBarColor` (red past 10% over,
  protein exempt) on both Home and the Nutrition tab (#114).
- **Swipe-to-delete rows (`SwipeableRow`, `ClientApp.jsx`)** hold
  tappable things (a logged food opens its editor, a saved meal's +).
  Rules from two real iPhone bugs (REGRESSION_TESTS.md #107, #109):
  never capture the pointer on pointerdown (it steals the tap's click);
  capture only once a sideways swipe starts, and wrap capture/release in
  try/catch (they can throw for iOS touch pointers); always end a swipe
  from window-level pointerup/pointercancel/touchend/touchcancel, not
  just the row's own events; decide delete-or-snap-back from the row's
  real position (`dragXRef`), never a value closed over by a render.
  jsdom can't show these — check with real touch events (CDP) and, when
  possible, on a real iPhone.
- **Barcode scanner reads QR and Data Matrix too** (#117): fresh meat
  increasingly has only a GS1 2D code. `parseScannedCode`
  (`src/lib/gs1.js`) runs first on every scan or typed code: a GS1
  Digital Link / element string becomes its product number (normalised
  to EAN-13 when it starts with 0) and goes through the normal lookup; a
  weighed pack (GTIN-14 starting 9) is entered once from the label and
  remembered, like scale labels; its net weight (AI 310n/320n) only sets
  the amount the food page opens at for that scan (`withPackWeight`),
  never the library food. A plain website QR shows a hint and keeps
  scanning; never strip a URL down to digits and look that up. Keep
  QR_CODE and DATA_MATRIX in `BARCODE_FORMATS`.
- Train Solo has no nutrition logging; none of this touches `src/solo/`.

## Deferred until the next App Store upload

Do these together when the user is ready to submit a new App Store build
(they asked for this to be remembered):

- **Switch Stripe to live mode** (Train Solo website purchases). DONE
  2026-10-22: live keys in GitHub secrets, functions redeployed, checkout
  confirmed creating cs_live_ sessions; the user did one real purchase +
  refund. Optional: roll the sandbox test key (test-mode only, low risk).
  Original steps: live `sk_live_` key → GitHub secret
  `STRIPE_SECRET_KEY`; live webhook to
  `https://us-central1-zach-mcivor-pt-app.cloudfunctions.net/soloStripeWebhook`
  (`checkout.session.completed`, `charge.refunded`) → `STRIPE_WEBHOOK_SECRET`;
  redeploy functions; one real purchase + refund to verify. Then rotate the
  sandbox test key (it was visible in a screenshot).
- Native iOS changes for the new build: status-bar strip that follows
  dark screens (the installed build may predate the apexTheme handler),
  App-Bound Domains so the service worker gives a full offline warm
  start, and the edge-to-edge login frame. The user chose the full-length
  photo/video for the official update (native side done in 1.0.2:
  remembered launch state, no bounce on those screens; verify on
  TestFlight): the web already asks for it on
  /login, /start and Train Solo's login/register/questionnaire/finish-setup
  screens (`edgeToEdge: true`); confirm it on the TestFlight build. The
  rubber-band bounce on those screens is stopped web-side
  (PinnedLoginBackdrop); if any bounce still shows on device, also stop
  the webview's bounce natively for those screens.
- Train Solo purchasing stays hidden inside the iOS app (Apple 3.1.1 —
  `src/solo/appShell.js`); buying happens on the website only — until
  1.0.4, which adds Apple In-App Purchase for the Plus / All Access
  subscriptions (see "Train Solo subscriptions" below). Even then, never a
  website price, link or mention inside the app.
- Update the iPhone screenshots in App Store Connect for the 1.0.2
  submission (the user asked for this to be remembered). PREPARED
  2026-10-26: 10 framed 1320x2868 images (start screen, 4 coached-client
  screens from the user's phone, 5 Train Solo screens captured in iOS-app
  mode); the user uploads them in App Store Connect. The current ones
  show only the coach console; new ones should cover the refreshed login,
  the coached client app and Train Solo, at the required 6.9" iPhone size
  (1320 x 2868 portrait). Screenshots must not show prices or buy buttons
  for Train Solo (3.1.1).

- **Apple Health (built and released in 1.0.3)**: native HealthKit bridge + web sync are on
  main (web side is hidden until a build with the native handler is
  installed). Needs the HealthKit capability ticked on the App ID
  `com.apexcoaching.platform` and a refreshed App Store provisioning
  profile in Codemagic before the build signs. Before submitting 1.0.3,
  add "Health" in App Store Connect → App Privacy (app functionality,
  linked to the user, not tracking).
- **Also in 1.0.3**: voice notes (microphone permission string), form-check
  videos linked to a set, and the lock-screen "Rest's up" alert
  (RestTimerBridge.swift). Before submitting, also add "Audio Data" (voice
  notes; app functionality, linked to the user, not tracking) in App
  Privacy if it isn't there.
- **Also in 1.0.3 (build after the first TestFlight one)**: opening with no
  signal falls back to the phone's saved copy of the site
  (ViewController.swift `.returnCacheDataDontLoad`), else a native
  "You're offline" screen; finishing a workout offline is kept on the phone
  and sent later (`src/lib/offlineWrite.js`). App-Bound Domains + the
  service worker remains the fuller offline option if the cache fallback
  proves patchy on device.
- **Order agreed** (changed again 2026-10-28, owner): 1.0.3 (build 94) was
  submitted and APPROVED by Apple on 2026-10-28; it is released first (Apple Health, voice notes, form checks, lock-screen
  rest alert, offline) once it passes TestFlight testing. The 1.0.4 branch
  (with its `ios/` changes and the RevenueCat `appl_` key) was MERGED to
  main on 2026-11-02, so main's `ios/` is now 1.0.4. Then 1.0.4 (Train Solo subscriptions + instant open) is the
  public launch; marketing starts with it. Then growing the catalogue to 10
  solid programs.
  All written up in `ROADMAP.txt`. The monetisation plan was APPROVED
  2026-10-28: Free (3 saved sessions) / Plus A$9.99 mo, A$79.99 yr /
  All Access A$24.99 mo, A$179.99 yr, 7-day trial on yearly (was 10; Apple only offers
  fixed lengths, owner chose 1 week on both stores 2026-11-02); a failed
  payment drops to Free with data kept; single-program sales stop on
  launch day; launch with 5 programs. BUILT 2026-10-28 and switched off;
  what's left is the owner's setup list in ROADMAP.txt step 2 (Apple,
  RevenueCat, Stripe, 5 programs), then 1.0.4 (needs the RevenueCat public
  key in ios/ApexCoach/PurchasesBridge.swift — in). Merged to main
  2026-11-02, which starts Codemagic's 1.0.4 build.
- **Instant open, native part — BUILT for 1.0.4 (2026-10-28)**
  (REGRESSION_TESTS.md #121): ViewController.swift opens the saved copy
  (`.returnCacheDataElseLoad`) once the site has loaded before, checks the
  live `/assets/index-<hash>.js` in the background and loads fresh on the
  NEXT launch when a release changed it (never reloads mid-session); a page
  process iOS killed in the background reloads instead of staying blank.
  index.html's stale-copy guard reloads once if a saved copy's code files
  are gone. Verify on TestFlight 1.0.4 (ROADMAP.txt step 2, item 19).

## Launch speed (web)

The user expects the app to open instantly (2026-10-28 TestFlight
feedback). Keep the cold-open path short:

- Nothing heavy on the launch path: the main bundle, `CoachShell`,
  `ClientApp` and what they import statically. Big libraries used by one
  action (the barcode scanner, video compression) load with `import()` when
  that action starts — see `loadScannerLib()` in
  `src/client/NutritionFeatures.jsx`. Check `npx vite build` chunk sizes
  after adding a dependency.
- The iPhone app opens the saved copy of the site, so a web release reaches
  App Store users on their NEXT open, not the current one. Keep index.html's
  stale-copy guard (`apexStaleCopyReload`) — without it an old saved copy
  whose code files are gone opens blank.
- `AppContext.jsx` keeps the signed-in profile on the phone
  (`PROFILE_CACHE_KEY`, uid-checked); `App.jsx` uses its role to start
  loading the right screen's code at startup, and `index.html` uses it to
  paint a coach's page dark. Don't add a new wait between sign-in and the
  first screen.
- Still wait for Firebase Auth before showing signed-in screens (no writes
  while signed out).
- Show "–" or nothing while data loads, never a "0" that jumps to the
  real number.

## Train Solo subscriptions (Free / Plus / All Access)

Built 2026-10-28 (ROADMAP.txt step 2; REGRESSION_TESTS.md #120). Rules for
any Train Solo work from now on:

- Ask `canUse(feature, soloAccess)` (`src/solo/soloAccess.js`) before
  showing a paid feature, and open `useSoloPaywall().openPaywall({ tier,
  reason })` instead of a dead end. Add new paid features to
  `FEATURE_TIER` there, not as one-off checks.
- The tier comes only from `soloEntitlements/{uid}`, written only by the
  server (`functions/soloSubscriptions.js`) from Stripe and RevenueCat. The
  app never writes it and never grants access by itself. A failed payment,
  expiry or refund is Free immediately (owner rule).
- Paid content must stay gated on the server too (firestore.rules
  `hasAllAccess()`), not just hidden in the UI.
- Programs on the calendar come from `soloTrainingPrograms` (bought
  purchases + All Access enrolments + own built programs), looked up in
  `soloProgramsById` / `soloContentById` — not `soloPurchases` alone. One
  active All Access program at a time; switching pauses, resuming keeps
  the week numbers (logs are keyed on them).
- Nothing is gated until `settings/soloMonetisation.live` (coach console >
  Train Solo > Subscriptions) or the account is a test account; before
  that, Train Solo must behave exactly as it did.
- In the iPhone app, if the App Store returns no subscriptions the paywall
  shows why (REGRESSION_TESTS.md #124) and retries on the next open — never
  a silent disabled button, never a pointer to the website.
- Prices: website ones in `PLANS` (soloAccess.js and soloSubscriptions.js —
  keep both in step); in the iPhone app always Apple's own prices from the
  store.

## Cloud Functions runtime

- Functions run on Node.js 22 (`functions/package.json` engines + the
  deploy workflow). Google decommissioned Node 20 on 2026-10-30 and
  deploys were refused until this was raised (REGRESSION_TESTS.md #123).
  Keep both in step when the runtime moves again.

## iOS builds (Codemagic)

- The iOS app is a WKWebView on the live web app, so web-only changes reach
  App Store users without a build or review — from 1.0.4 on, on their next
  open after Vercel deploys (instant open uses the saved copy first). Only
  native changes (`ios/`) need a new build + TestFlight + App Review.
- `codemagic.yaml` builds iOS only when `ios/` or `codemagic.yaml` change
  (Android: `android/`). Builds are triggered by Codemagic's GitHub webhook;
  until 2026-10-26 that webhook was missing, so no build ever ran on its
  own — builds 1–17 were all started by hand. If a TestFlight build is
  expected and missing, check Codemagic → app → Webhooks → Recent
  deliveries before assuming a failed build.
- Codemagic's ▶ on an old build row rebuilds that old commit; a build of
  the latest code is "Start new build" → branch `main`.

## Speed: local-first saves in the coached client app (#126)

- A client action never waits for the server. Wrap client saves in
  `localFirst()` (`src/lib/offlineWrite.js`): it returns once Firestore's
  on-phone cache has the write ("saved", or "queued" offline) and reports
  a later server refusal through `onLocalWriteFailed` (ClientApp shows a
  red toast). Where a function is shared with the coach console, opt in
  from the client call site (`updateWorkoutLogEntries(..., { localFirst:
  true })`, `NutritionTargetsCard saveLocalFirst`) and leave the coach's
  waiting behaviour alone.
- Keep coach-only code out of the client app's static imports: the
  Nutrition Goal editor is `src/coach/NutritionTargetsCard.jsx` (never
  import it from `CoachClientDetail`), `WorkoutEditor` is `React.lazy` in
  ClientApp. Check `npx vite build` chunk sizes after touching imports.
- Empty client lists use the shared `EMPTY_LIST`, not `|| []`, so memos
  and effects don't recompute on every render.
- The logo shows this phone's last confirmed answer immediately
  (`appLogo.js`); only a first-ever open waits for the server.

## Messaging composers (#127)

- Every chat's message box is `MessageComposerInput`
  (`src/components/MessageComposerInput.jsx`): grows to ~6 lines, Return
  is a new line on phones (send button sends), Enter sends only with a
  real keyboard. Don't put a one-line `<input>` with Enter-to-send back.
- The coach ↔ client chat look lives in `src/components/Chat.jsx`
  (`ChatBubble`, `ChatDayDivider`, `chatRows` grouping, `ChatComposer`
  with a single + for attachments): own messages MEASURE_BLUE, theirs
  charcoal / white with a hairline (#128). Use it for any new chat view
  rather than restyling bubbles per screen.
- Message reactions (#130): `reactions: { coach?, client? }` on the
  message, set via `reactToMessage`; firestore.rules lets a client change
  only `reactions.client` in their own thread. Keep any new message field
  a client can write equally narrow.
- The coach console hides its mobile tab bar while a text field has focus
  (`useTextEntryFocused`, `src/lib/textEntryFocus.js`); screens that
  reserve space for the bar (Messages) drop it while typing too.

## Chat videos (#129)

- `uploadMessageVideo` must leave every clip "fast start" (index before the
  video data): compressed clips via `fastStart: "in-memory"`, others via
  `ensureFastStart`. Keep the immutable `cacheControl` on video uploads and
  `preload="metadata"` on chat `<video>` players.

## Data listeners (`src/lib/AppContext.jsx`)

- Subscribe a collection only for the roles firestore.rules lets read
  it. A refused listener isn't harmless: `subscribeWithRetry` retries it
  forever (backing off to every 16s) on every phone with the app open.
  Coach-only collections (e.g. `soloProgramContent`) go in the
  `role === "coach"` branch (#116,
  `AppContext.coachOnlyListeners.test.jsx`).

## Working style

- Every change that ships (a fix or a feature) updates
  `REGRESSION_TESTS.md` (a numbered entry: problem/change, fix, the
  regression tests and proof they fail without the fix, date) and
  `CLAUDE.md` wherever it changes how that part of the app must be built
  — in the same commit, without being asked (the user asked for this to
  be remembered).

- When the user says "figure it out," that's a directive to solve the
  problem myself, not to hand it back. Come back with a finished result —
  not a list of obstacles, not a request for a decision that isn't
  actually required. If part of a task is genuinely blocked, solve
  everything that isn't blocked, then report the outcome, not the blocker.

## QA Engineer / Bug Auditor protocol

When the user says "run a bug check" / "run a bug audit" / similar — or a
scheduled weekly audit fires — act as APEX's dedicated QA Engineer and Bug
Auditor and immediately perform the full audit below. Don't wait to be
told where to look.

**Ground rules**: do not redesign the app, do not change the existing
architecture unless truly necessary to fix a confirmed bug, do not add
features, do not remove existing functionality, preserve the current
structure/navigation/branding/core UX. Prioritize stability over visual
changes. Never assume something works because the code reads correctly —
verify. If a bug is confirmed, fix it rather than just reporting it,
unless the fix requires a major architectural decision — then describe
the options instead of picking one. Before fixing, understand the
surrounding functionality well enough that the fix doesn't break something
else (regression check is part of the process, not an afterthought).

Priority order when trade-offs come up: data integrity > correct
functionality > stability > performance > UX consistency > visual polish.

### Audit process (in order)

1. Inspect the current application structure.
2. Identify all major user flows (coach and client).
3. Inspect relevant source code for each flow.
4. Trace data/state through each flow.
5. Test edge cases.
6. Verify calculations by hand rather than trusting the existing function.
7. Look for regressions a fix could introduce.
8. Fix confirmed bugs where appropriate.
9. Re-check the affected functionality after each fix.
10. Do a final regression pass before reporting.

### What to check

**Functionality** — navigation, buttons, forms, modals, tabs, dropdowns,
search, filters, sorting, add/edit/delete, save/cancel, drag and drop,
client creation/editing, workout creation, exercise selection,
program/session creation, nutrition, calories/macros, client data, coach
data, progress tracking, performance metrics, AI functionality
(Fuel IQ/Macro Match), notifications, settings, auth/session state, any
integrations. Specifically: buttons that do nothing or the wrong thing,
data that doesn't save or disappears on navigation, wrong calculations,
wrong state updates, duplicate records, broken loading/empty states, bad
error handling, components that behave differently depending on how
they're reached.

**Edge cases** — empty fields, huge numbers, zero/negative values, missing
client info, brand-new users with no data, clients with lots of data,
duplicate exercises/clients, empty workouts/nutrition plans, very long
names/text, rapid clicking, refreshing mid-flow, navigating away before
saving, repeatedly opening/closing modals, editing the same record
multiple times, deleting something then trying to access it, browser
back/forward.

**Calculations** — calories, macros (protein/carbs/fat), remaining
calories/macros, bodyweight change, progress percentages, strength/PR
calculations, workout volume, consistency metrics, any AI-generated
nutrition numbers (including Fuel IQ suggestions and Macro Match combos —
their `contents` must still sum exactly to the parent total). Verify by
hand, don't trust the function just because it looks right.

**Data/state** — correctness across page navigation, refresh, edit,
create, delete, switching clients, switching coach/client view, multiple
open components, returning to a previous page. Watch for stale state,
race conditions, wrong state references, and data leaking between
clients (this matters a lot given the multi-tenant direction the
platform is headed — see the migration plan if one exists).

**UI/UX bugs** (not redesign) — cut-off text, overlapping elements,
broken responsive layouts, inaccessible buttons, spacing broken by a bug
(not just a style preference), modals overflowing the screen, mobile
layout failures, dark/light mode inconsistencies, missing loading/error
states, unclear disabled states, components behaving differently across
screens. Only report genuinely functional/usability problems, not
"I'd have designed this differently."

**Code** — runtime errors, undefined variables, missing/incorrect
imports (the Fuel IQ `CLIENT_DARK_BG` incident — used but never imported,
crashed the whole Nutrition tab in production — is exactly the class of
bug this step exists to catch going forward), incorrect conditionals,
state management problems, memory leaks, infinite loops, unhandled
promises/async errors, missing error handling, race conditions, duplicate
logic, dead code that could cause problems. `npm run build` passing does
NOT mean there's no undefined-reference bug — it's a transform, not a
full type/scope check — so also skim the diff for anything used but not
imported/declared, and prefer actually exercising the changed screen
(dev server + browser, or at minimum tracing the render path by hand)
over trusting a clean build.

### Severity

- 🔴 **CRITICAL** — crash, data loss, security issue, a major feature
  completely unusable.
- 🟠 **HIGH** — an important feature is broken or produces wrong results.
- 🟡 **MEDIUM** — works, but behaves incorrectly in certain situations.
- 🟢 **LOW** — minor functional/UI issue, limited impact.

Don't classify something as a bug just because it would've been designed
differently.

### Report format (every audit ends with this)

```
BUGS FOUND
Severity | Location | Problem | Cause | Fix

POSSIBLE ISSUES
(things needing further testing/clarification — never presented as confirmed bugs)

FIXES MADE
(exactly what changed)

REGRESSION CHECK
(which existing features were re-tested after the fix, and how)

FINAL STATUS
✅ NO CONFIRMED BUGS  /  ⚠️ BUGS FOUND AND FIXED  /  🔴 CRITICAL BUGS REMAIN
```

Only list confirmed bugs in the BUGS FOUND table — speculation goes under
POSSIBLE ISSUES instead. Never make unrelated improvements while doing a
bug-fixing pass — a fix should look like a fix, not a refactor. APEX
should get more stable with every audit, not accumulate unrelated churn.
