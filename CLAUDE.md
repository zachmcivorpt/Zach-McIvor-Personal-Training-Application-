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
- **Writes must work offline**: everything goes through
  `setNutritionForDate`, which falls back to the phone's cached copy +
  `savedOrQueued` when there's no signal. Don't add a nutrition write
  that only works online.
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
  `src/solo/appShell.js`); buying happens on the website only.
- Update the iPhone screenshots in App Store Connect for the 1.0.2
  submission (the user asked for this to be remembered). PREPARED
  2026-10-26: 10 framed 1320x2868 images (start screen, 4 coached-client
  screens from the user's phone, 5 Train Solo screens captured in iOS-app
  mode); the user uploads them in App Store Connect. The current ones
  show only the coach console; new ones should cover the refreshed login,
  the coached client app and Train Solo, at the required 6.9" iPhone size
  (1320 x 2868 portrait). Screenshots must not show prices or buy buttons
  for Train Solo (3.1.1).

- **Apple Health (1.0.3)**: native HealthKit bridge + web sync are on
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
- **Order agreed**: 1.0.3 next (built and uploaded to TestFlight
  2026-10-28; HealthKit signing done; the user tests it, then submits), then
  monetisation: a Train Solo Pro subscription as 1.0.4. Both are written up
  in `ROADMAP.txt`; build nothing of the monetisation plan until the user
  approves it and answers its open decisions.

## iOS builds (Codemagic)

- The iOS app is a WKWebView on the live web app, so web-only changes reach
  App Store users the moment Vercel deploys — no build, no review. Only
  native changes (`ios/`) need a new build + TestFlight + App Review.
- `codemagic.yaml` builds iOS only when `ios/` or `codemagic.yaml` change
  (Android: `android/`). Builds are triggered by Codemagic's GitHub webhook;
  until 2026-10-26 that webhook was missing, so no build ever ran on its
  own — builds 1–17 were all started by hand. If a TestFlight build is
  expected and missing, check Codemagic → app → Webhooks → Recent
  deliveries before assuming a failed build.
- Codemagic's ▶ on an old build row rebuilds that old commit; a build of
  the latest code is "Start new build" → branch `main`.

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
