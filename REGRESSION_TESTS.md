# APEX Regression Test Register

This file is the permanent record of every confirmed production bug found
in APEX and the regression protection now in place for it. **The current
application state (as of the date below) is the production baseline** —
these tests exist to stop any of these specific bugs from coming back, not
to gate new feature work.

## Standing rule: no bug is closed without a validated regression test

For every critical/confirmed bug found in this app, going forward:

1. Fix it.
2. Write a regression test that fails if the bug is ever reintroduced.
3. **Validate the test is real**, not a trivial pass: temporarily put the
   broken code back (revert the fix only, in the working tree —
   never commit this state), run the test, confirm it actually fails
   against the bug, then restore the correct fix and confirm the suite is
   green again.
4. Only after both the fix *and* its validated test pass is the bug
   considered closed. A fix with no test, or a test that was never proven
   to fail, is not done.

Where a true automated chain-test isn't practical (no component-test
harness, no access to real hardware/third-party OAuth), document the
exact manual regression script instead — see the "What still requires
manual testing" section at the bottom — and say so explicitly rather than
silently skipping it.

## Release gate — read this before every production deploy

> **NO PRODUCTION RELEASE IS COMPLETE IF THE REGRESSION SUITE FAILS.**

Before shipping to production:

1. `npm test` — fast unit tests (pure logic + the native-bridge token
   test). Must be 100% green. Skipped counts are fine (that's the
   Firestore rules suite waiting on step 2) — failures are not.
2. `npm run test:rules` — spins up the real Firestore Emulator and runs
   every security-rules regression test against it (requires Java; the
   emulator jar auto-downloads on first run). Must be 100% green.
3. `npm run build` — production build must complete with no errors. This
   also runs `scripts/deploy-firestore-rules.js`, which auto-publishes
   `firestore.rules` to the live project when building in the real
   production environment (`VERCEL_ENV=production` +
   `FIREBASE_SERVICE_ACCOUNT_JSON` set) — confirm the rules you intend to
   ship are actually the ones committed before triggering that build.
4. Manually walk the critical client workflows that have no automated
   coverage (see the "Manual verification" column below, and the
   App-Store-specific items at the very bottom) — at minimum: sign in,
   log a food item, log a workout set, submit a check-in, upload a
   progress photo, log out and back in as a different account on the
   same device/browser.
5. Check the browser console for new errors/warnings on each of the
   screens touched by the release.
6. Only once 1–5 are clean does the release go out.

**Do not weaken, skip, delete, or disable a test just because it fails.**
If a test fails because the app was *intentionally* changed, decide
whether the new behavior is actually correct — if it is, update the
implementation **and** the test together, deliberately, and note it in
this file. A failing test is a signal to investigate, never noise to
silence.

---

## How to run the regression suite

| Command | What it covers | Needs |
|---|---|---|
| `npm test` | Pure-logic bugs (macro rounding, push-token namespacing) | nothing extra |
| `npm run test:rules` | Every Firestore security-rule bug (null-resource crashes, cross-client data isolation, path-vs-field query rules) — runs against a real local Firestore Emulator, not production | Java (for the emulator); auto-downloads the emulator jar on first run |
| `npm run build` | Production build integrity + auto-publish of `firestore.rules` | — |

---

## Bug register

### 1. Nutrition logging permanently failing for brand-new clients / first log of a new day
- **Root cause**: `firestore.rules`'s `nutritionLogs` rule read
  `resource.data.clientId` unconditionally. `setNutritionForDate`
  (`AppContext.jsx`) does a `tx.get()` read-before-write inside a
  transaction; on a client's very first save of a given calendar day, no
  document exists yet, so `resource == null` and `resource.data.clientId`
  threw. Firestore treats any rule-evaluation error as an outright denial,
  so the client saw "Missing or insufficient permissions" instead of a
  normal "not found."
- **Fix**: `allow read` now short-circuits with `resource == null ||`
  before touching `resource.data` (`firestore.rules`, `nutritionLogs`).
- **Regression test**: `src/lib/firestoreRules.rules.test.js` →
  `nutritionLogs: reading a document that doesn't exist yet doesn't throw
  a permission error` (part of the `nullResourceCollections` loop).
  Verified to fail (15/15 in that loop) when the `resource == null ||`
  guard is removed.
- **Manual verification if automation isn't possible**: N/A — fully
  automated.
- **Date added**: 2026-10-05

### 2. Same null-resource crash, hardened across every other per-client collection
- **Root cause**: identical pattern to #1, present in 17 other
  collections' `allow read` rules (`workoutLogs`, `weighIns`,
  `bodyMetrics`, `mealPlans`, `scheduledWorkouts`, `bodyStatsSchedules`,
  `messages`, `workoutComments`, `progressPhotos`, `savedMeals`,
  `habits`, `clientPhases`, `formSchedules`, `formResponses`,
  `challenges`, `groups`, `groupMessages`) — any of these would have
  thrown the same "permission denied" on a brand-new client's or brand-new
  group's first read.
- **Fix**: same `resource == null ||` guard added to all of them.
- **Regression test**: `src/lib/firestoreRules.rules.test.js` — the
  `nullResourceCollections` loop (14 of the 17) plus the dedicated
  `challenges`/`groups` "reading a document that doesn't exist yet"
  tests. All 15+2 were individually verified to fail when their guard is
  removed (see #1).
- **Manual verification if automation isn't possible**: N/A — fully
  automated.
- **Date added**: 2026-10-05

### 3. `liveSessions` permission errors on every client page load
- **Root cause**: the client watched `liveSessions` with a **field**
  filter — `where("clientId", "==", uid)` — but the security rule is
  **path**-based (`match /liveSessions/{clientId}`, doc id IS the uid).
  Firestore cannot prove a field-filtered query satisfies a path-based
  rule, so the listener was denied and silently retried forever on every
  client session, confirmed via a live console error during this
  session's audit.
- **Fix**: `AppContext.jsx`'s client watch now filters with
  `where(documentId(), "==", uid)`, which does satisfy the path rule.
- **Regression test**: `src/lib/firestoreRules.rules.test.js` →
  `liveSessions` describe block (own-doc read/write succeeds,
  cross-client read/write fails, coach can read but not write). This
  locks in the rule shape the corrected query depends on — if the rule
  ever moves to a field-based model without updating the client query,
  these tests still pass (rules are fine) but would not have caught the
  original client-code mismatch; that half is covered by manual
  verification below.
- **Manual verification**: sign in as a client, open any screen that
  mounts the Training tab, open the browser console — there must be no
  repeating `permission-denied` or `FirebaseError` on `liveSessions`.
- **Date added**: 2026-10-05

### 4. Push-notification token leaking between accounts on a shared device
- **Root cause**: `nativeBridge.js` (and the equivalent UI state in
  `ClientApp.jsx`'s `NotificationsPromptCard`/`PushNotificationsSheet`)
  stored the device's push token and "enabled" flag under bare,
  non-namespaced localStorage keys (`pushToken`, `pushPromptDismissed`) —
  unlike the already-correct `clientLastTab_${userId}` pattern used
  elsewhere. The next client who signed in on the same device/browser
  inherited the previous client's token and kept receiving (and could
  disable) that previous client's push notifications.
- **Fix**: both keys namespaced per-uid everywhere
  (`pushToken_${uid}`, `pushPromptDismissed_${uid}`); logout now also
  revokes the leaving account's token (`disablePush`) and clears its key.
- **Regression test**: `src/lib/nativeBridge.test.js` — all 4 tests,
  covering per-uid namespacing, no leak onto the next signed-in account,
  and the pre-auth pending-token path. Verified to fail (3/4) when
  reverted to a bare `pushToken` key.
- **Manual verification** (for the `ClientApp.jsx` UI half, not covered
  by the automated test since it requires a mounted React tree): sign in
  as client A on a browser, enable push, sign out, sign in as client B on
  the same browser — the notifications toggle must show "off" for client
  B, not inherit client A's "on" state.
- **Date added**: 2026-10-05

### 5. Stale "unread messages" badge after a page reload
- **Root cause**: the unread-message count was plain component state,
  reset to `0` on every mount — after any reload it recomputed against
  the FULL historical message count again, showing old, already-read
  messages as unread.
- **Fix**: persisted on the user doc as `messagesSeenCount`
  (`ClientApp.jsx`), same pattern as the existing `mealPlanSeenAt` field;
  opening Messages updates it.
- **Manual verification** (React-state bug inside `ClientApp.jsx`, no
  automated harness for this file — see "What's still manual" below):
  as a client, read all messages, reload the page — the unread badge must
  stay at 0, not jump back up to the full historical count.
- **Date added**: 2026-10-05

### 6. Progress photo add/delete failing silently
- **Root cause**: `addProgressPhoto`/`deleteProgressPhoto`
  (`AppContext.jsx`) only `console.error`'d on failure — the UI closed
  looking identical to success whether or not anything actually saved.
- **Fix**: both are now `async` with try/catch that re-throws a real
  `Error`, and `ClientApp.jsx`'s callers chain `.then(toast
  success).catch(toast real error.message)`, matching the adjacent
  weigh-in handlers.
- **Manual verification**: with the browser offline (DevTools "Offline"
  throttling) or Firestore temporarily blocked, try adding/deleting a
  progress photo — a visible error toast must appear, not a silent
  no-op.
- **Date added**: 2026-10-05

### 7. Check-in photo question stuck on "Uploading..." forever
- **Root cause**: a corrupt/unreadable file picked for a check-in's photo
  question had no `catch` on the read — the question stayed stuck on
  "Uploading..." with no way out, and if that question was required, it
  permanently blocked submitting the whole check-in (short of closing the
  sheet and losing every other answer).
- **Fix**: `FillCheckInSheet`'s `handlePhoto` wrapped in try/catch/finally
  with a `photoError` state, rendering an inline error so the client can
  pick a different file.
- **Manual verification**: open a check-in with a required photo
  question, attempt to select a corrupted/zero-byte file — an inline
  error must appear and the question must NOT stay stuck on "Uploading…".
- **Date added**: 2026-10-05

### 8. Duplicate check-in submissions
- **Root cause**: the check-in submit button had no re-entrancy guard — two
  click/tap events landing before the sheet unmounted could fire
  `onSubmit` twice, creating two separate `formResponses` docs for the
  same check-in.
- **Fix**: `FillCheckInSheet` added a `submitting` state; the submit
  handler now guards `if (submitting) return;` and the button is
  `disabled={!canSubmit || submitting}`.
- **Manual verification**: open a check-in, double-click/rapid-tap
  Submit — exactly one `formResponses` doc must be created (check via the
  coach's view of that check-in, or directly in the Firebase console).
- **Date added**: 2026-10-05

### 9. Fuel IQ / Macro Match suggestions double-loggable
- **Root cause**: the inline "ADD TO LOG" chip on a Fuel IQ suggestion had
  no protection against a fast double-tap calling `addSuggestion` twice,
  double-logging the same food (and double-counting its calories/macros).
  The equivalent action in the suggestion's own detail sheet was already
  safe (closes immediately on tap) — only this inline chip was exposed.
- **Fix**: `AiNutritionHelpCard` now tracks `addedSuggestionKeys` and
  shows "ADDED ✓" (disabled) once a suggestion has been used.
- **Manual verification**: ask Fuel IQ for a suggestion, double-tap "ADD
  TO LOG" on the same suggestion rapidly — exactly one food entry must
  land in today's log, and the chip must read "ADDED ✓" afterward.
- **Date added**: 2026-10-05

### 10. Firestore rules requiring a manual console paste-and-publish step
- **Root cause**: every rules change required manually pasting into the
  Firebase Console and clicking Publish — easy to forget, with no
  guardrail stopping a deploy from shipping with stale rules.
- **Fix**: `scripts/deploy-firestore-rules.js` runs automatically as part
  of `npm run build`, publishing `firestore.rules` via `firebase-tools`
  whenever building in the real production environment
  (`VERCEL_ENV=production` + `FIREBASE_SERVICE_ACCOUNT_JSON` present);
  it's a no-op everywhere else (confirmed in the build output above:
  `[firestore-rules] Not a production build — skipping rules deploy.`).
- **Regression test**: not independently testable without a real
  production deploy (it shells out to the real `firebase deploy`). The
  guard logic (skip when not production / missing credentials) is
  exercised implicitly by every local `npm run build` in this repo.
- **Manual verification**: after any `firestore.rules` change, confirm
  the next production build's logs show `[firestore-rules] Published
  successfully.`, and spot-check the rules actually live in the Firebase
  Console match the committed file.
- **Date added**: 2026-10-05 (originally added earlier this session)

### 11. Deleted exercises silently vanishing from client training screens
- **Root cause**: when a coach hard-deletes an exercise from the library
  that's still referenced by a scheduled day or a past log, the client's
  `exercisesById[exerciseId]` lookup returns `undefined`. Both the
  completed-workout preview and the live logging session early-returned
  `null` for that row instead of rendering a fallback — the exercise (and
  any already-logged sets under it) disappeared entirely, with the
  displayed "N exercises" count no longer matching what actually
  rendered.
- **Fix**: `ClientApp.jsx`'s preview row now renders with a "Unknown
  exercise" fallback name instead of vanishing (mirroring the existing
  fallback already used in `CoachClientDetail.jsx`'s `DayPreviewSheet`);
  the live session's `ExerciseBlock` now gets a placeholder
  `{ id, name: "Unknown exercise" }` object instead of being skipped, so
  the client can still see and log sets against it.
- **Manual verification**: as the coach, delete an exercise that's used
  in a client's already-scheduled or already-completed workout. As that
  client, open both the scheduled day and the completed workout's
  history — the row must render as "Unknown exercise" (not disappear),
  and if it's a live/in-progress session, sets must still be loggable
  against it.
- **Date added**: 2026-10-05

### 12. Macro gram rounding drifting from the stated calorie target
- **Root cause**: `nutritionTargets.js` rounded protein/carbs/fat grams
  with three independent `Math.round()` calls, so
  `protein*4 + carbs*4 + fat*9` didn't reliably land back on the stated
  calorie target (verified by hand: the 2200kcal/29/44/27% default
  rounded to 160/242/66g = 2202kcal, not 2200).
- **Fix**: `macroGramsSet(calories, pcts)` rounds protein and fat first,
  then derives carbs from whatever calories are left over, so the three
  gram figures back-sum to within ~2kcal — the best achievable with
  whole-gram values.
- **Regression test**: `src/lib/nutritionTargets.test.js` — asserts the
  exact default-split gram values, back-sums within 2kcal across 5
  different calorie/split combinations, a non-negative-carbs edge case,
  and the `{protein,fat}` vs `{proteinPct,fatPct}` key-name alias.
  Verified to fail when reverted to independent rounding of all three.
- **Manual verification**: N/A — fully automated.
- **Date added**: 2026-10-05

### 13. Coach's "View as Client" could act on the coach's OWN account
- **Root cause**: `ProfileScreen` showed "Connected devices" (WHOOP) and
  "Delete account" even while a coach was using "View as Client" to look
  at a client's profile — tapping either acted on the **coach's own**
  account (re-auth, WHOOP OAuth), not the client being viewed.
- **Fix**: both rows are hidden when `viewingAsClient` is true.
- **Manual verification**: as the coach, open "View as Client" for any
  client, go to Profile — "Connected devices" and "Delete account" must
  not be visible.
- **Date added**: 2026-10-05 (found during this session's broader audit)

### 14. Group chat sheet left open with no way to close after the group is deleted
- **Root cause**: `GroupChatSheet` had no reaction to its `group` prop
  becoming `null` (e.g., the coach deletes the group while a member has
  it open) — it just rendered nothing useful with no close affordance.
- **Fix**: added an effect that calls `onClose()` as soon as `open &&
  !group`.
- **Manual verification**: open a group chat as a member, have the coach
  delete that group from another session/account, confirm the chat sheet
  auto-closes rather than hanging open.
- **Date added**: 2026-10-05 (found during this session's broader audit)

### 15. Generic error messages hiding the real failure reason
- **Root cause**: ~26 catch blocks across the app showed a hardcoded
  generic message regardless of the actual Firestore/network error,
  making real bugs (like #1) indistinguishable from transient network
  blips from the client's own report.
- **Fix**: catch blocks now surface `err.message` with a generic fallback
  only when no message exists, app-wide. A coach-visible `errorLogs`
  collection was also added so client-side save failures surface to the
  coach without the client having to report them manually.
- **Regression test**: the `errorLogs`/`notifications` isolation rules
  (client can create their own, never read the list; coach can read/
  manage) are covered in `src/lib/firestoreRules.rules.test.js`.  The
  message-surfacing itself (`err.message || fallback`) is straightforward
  enough that it's covered by code review/diff inspection rather than a
  dedicated test; flagged here so a future "simplify this catch block"
  refactor doesn't silently regress it.
- **Manual verification**: trigger any write failure (e.g. toggle
  DevTools offline) and confirm the resulting toast/error references the
  real failure, not a generic fallback.
- **Date added**: 2026-10-05

### 16. Body stats check-ins (weigh-ins) missing from the coach's Recent Activity feed
- **Root cause**: `CoachDashboard.jsx`'s Recent Activity feed merged
  workouts, cardio, messages, form check-ins, and nutrition goal hits
  across every active client — but never read from `db.weighIns`, so a
  client logging a body stats check-in produced no coach-visible
  activity at all, unlike every other client action.
- **Fix**: the feed-building logic was pulled out of the component into a
  pure, exported `buildRecentActivity(active, db, resolveNutritionTargets)`
  (`src/lib/recentActivity.js`) — both to make it testable and so future
  activity types don't have to be verified by eyeballing the dashboard —
  and a `weighin` entry (client name, weight, timestamp) was added
  alongside the existing types. `CoachDashboard.jsx` now just calls this
  function; no behavior other than the new entry type changed.
- **Regression test**: `src/lib/recentActivity.test.js` — asserts a
  logged weigh-in appears in the feed with the right client/weight, that
  multiple weigh-ins sort correctly alongside other activity types, that
  every pre-existing activity type still appears (no regression from the
  extraction), and that the 12-entry cap still holds. Verified to fail
  (2/4 tests) when the weigh-in block is removed; restored and
  re-verified green.
- **Manual verification**: N/A — fully automated.
- **Date added**: 2026-10-05

### 17. Desktop Messages composer leaking an unsent draft across clients
- **Root cause**: `CoachMessages.jsx`'s `ThreadMessages` keeps its
  draft/upload state (`input`, `uploadPct`, `uploadError`) in local
  `useState`. On the desktop two-pane layout, clicking directly from one
  client's conversation to another's (no intermediate "closed" state)
  only changed the `client` prop — React reused the same component
  instance rather than unmounting it, so an unsent draft typed for client
  A was still sitting in the composer (and could be sent) after switching
  to client B. The mobile layout never hit this because it fully
  unmounts through a `null` state between threads.
- **Fix**: `<ThreadMessages key={openClient.id} client={openClient} />`
  at its one call site that can switch directly between two open clients
  — the explicit `key` forces a remount on client switch.
- **Regression test**: `src/coach/CoachMessages.test.jsx` — drives the
  real exported `CoachMessages` component end-to-end (clicks between two
  clients, types a draft, confirms it doesn't carry over), so it
  exercises the actual render-site fix rather than hand-keying the
  component in the test. Verified to fail (draft carried over to Bob's
  composer) when the `key` is removed from `CoachMessages.jsx`; restored
  and re-verified green.
- **Manual verification**: N/A — fully automated.
- **Date added**: 2026-10-05

### 18. No re-entrancy guard on Create Challenge / Create Group / Add Group Member
- **Root cause**: `ChallengeEditor`'s and `GroupEditor`'s Save buttons,
  and `AddMemberSheet`'s Add button, were only disabled by form validity
  (`!canSave` / `picked.length === 0`) — never by an in-flight "saving"
  flag — while the underlying write (`createChallenge`, `createGroup`,
  `updateGroup`) is async and awaited before the sheet closes. A fast
  double-click fired the handler twice before the first write resolved:
  `createChallenge`/`createGroup` mint a fresh doc id per call, so two
  clicks created two duplicate documents; `AddMemberSheet.addPicked` read
  the same stale `group.memberIds` prop twice, writing the same member id
  in twice. Every other save action in the coach app already had this
  guard (`GroupSettingsSheet.save`, `CoachClientDetail.jsx`,
  `CoachClients.jsx`) — this was an inconsistency on these three actions
  specifically, not an intentional design choice.
- **Fix**: added a `saving` state to all three, guarding both the handler
  (`if (!canSave || saving) return;`) and the button's `disabled` prop,
  matching the existing `GroupSettingsSheet.save` pattern exactly.
- **Regression test**: `src/coach/doubleSubmitGuards.test.jsx` — renders
  each of the three components with a save/add call that never resolves
  on its own, fires the button 2-3 times rapidly, and asserts the
  underlying handler was only called once. Verified to fail (2-3 calls
  instead of 1, across all three) when the guards are removed; restored
  and re-verified green.
- **Manual verification**: N/A — fully automated.
- **Date added**: 2026-10-05

---

## What still requires manual testing

These cannot reasonably be automated in this environment (no physical
device/hardware access, no real camera/file system, no third-party OAuth
sandbox):

- **Barcode scanning** (physical camera + `html5-qrcode`/`barcode-detector`
  reading a real product barcode). `src/lib/barcodeLookup.test.js` covers
  the pure parsing/lookup/confidence logic once a barcode string exists —
  it cannot exercise the camera itself.
- **Real camera access** for progress photos / check-in photos (browser
  `getUserMedia` permission prompt, actual device camera).
- **Real file-picker / photo upload** end-to-end (OS-level file picker,
  actual image compression/upload to Firebase Storage over a real
  network).
- **WHOOP integration** (real OAuth round-trip against WHOOP's servers,
  real webhook delivery into Cloud Functions, real recovery/sleep/strain
  data sync).
- **Apple App Store distribution path** (per `CLAUDE.md`'s product
  status: APEX is a published App Store app — the native WKWebView shell,
  the invite-email → App Store download → activation-link flow, and the
  native push-token bridge's actual iOS-side delivery cannot be exercised
  from this environment).
- Bugs #3 (part), #4 (part), #5, #6, #7, #8, #9, #13, #14 above, wherever
  marked "manual verification" — these live inside React components
  embedded in the single large `ClientApp.jsx` (8,800+ lines) with no
  existing component-test harness (no React Testing Library/jsdom-rendered
  component infrastructure in this project). Extracting them into
  independently-testable units was judged an unnecessary refactor of
  otherwise-working code per this project's standing rule against
  redesigning working functionality to chase test coverage — each has an
  explicit manual regression script above instead.
