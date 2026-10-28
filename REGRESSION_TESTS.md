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

### 19. Fuel IQ / Macro Match detail sheet could still double-log a suggestion
- **Root cause**: the inline "ADD TO LOG" chip (bug #9 above) is guarded
  by an `addedSuggestionKeys` set, but the same suggestion's own detail
  sheet (opened by tapping its card) called `addSuggestion(detailSuggestion)`
  with **no key**, so that guard never engaged there. A suggestion card
  stays visible in the chat after use, so a client could reopen its
  detail sheet and tap "ADD TO LOG" again, double-logging (and double-
  counting the calories/macros of) the same suggestion.
- **Fix**: added a `detailSuggestionKey` state threaded alongside
  `detailSuggestion` (set when a card is tapped, passed to `addSuggestion`
  from the detail sheet's own Add button, cleared on close) — reuses the
  exact same `addedSuggestionKeys` guard the inline chip already has.
- **Regression test**: `src/client/fuelIqDoubleLog.test.jsx` — opens the
  detail sheet, adds once, reopens the same card, adds again, and asserts
  `onAddFood` was only called once total. Verified to fail (2 calls) when
  the key isn't threaded through; restored and re-verified green. (An
  initial version of this test tried to simulate a same-tick double
  click via two batched native events — that variant turned out to
  **not** actually be reachable in the real app, since the Add button is
  removed from the DOM the instant the first click's state update
  commits, in both the buggy and fixed code. The "reopen and add again"
  path is the one that's actually exploitable, so that's what's tested.)
- **Manual verification**: N/A — fully automated.
- **Date added**: 2026-10-05

### 20. Custom food macros accepted negative values, corrupting the shared food library and daily totals
- **Root cause**: both manual food-entry paths (`QuickAddFoodSheet.submit`
  and the barcode sheet's "add manually", `src/client/NutritionFeatures.jsx`)
  did `Number(manual.cals) || 0` etc. with no floor, so a client could
  type e.g. "-500" into calories and save it straight to the **shared**
  `customFoods` library (searchable by every client). `addFood`
  (`ClientApp.jsx`) then added that value into a day's running total with
  no clamp either (only `removeFood`, right next to it, already clamped
  its subtraction to zero) — a negative-calorie food could push a day's
  calorie/macro totals below zero.
- **Fix**: both manual-entry paths now clamp every macro field to
  `Math.max(0, …)` before saving; `addFood`'s running-total calculation
  now clamps the same way `removeFood` already does.
- **Regression test**: `src/client/quickAddFoodValidation.test.jsx` —
  asserts negative input is saved as 0 and that ordinary positive values
  pass through unchanged. Verified to fail (saved value was -500, not 0)
  when the clamp is removed from `QuickAddFoodSheet.submit`; restored and
  re-verified green. `addFood`'s own clamp (the day-total defense-in-depth
  half of this fix) is covered by code review/build rather than a
  dedicated test — it lives inside the large `ClientApp` component with
  no isolated render path; see the barcode-sheet manual-verification note
  below for that half plus the barcode "add manually" path, which shares
  the identical fix but couldn't reasonably be rendered in this
  environment (camera/`Html5Qrcode` dependencies).
- **Manual verification**: for the barcode sheet's "add manually" path
  and `addFood`'s running-total clamp — scan (or fail to scan) a barcode,
  choose "Enter manually," type a negative calorie value, save, then log
  it to a day that already has food logged — the day's total must not go
  negative and the saved library entry's calories must read 0, not
  negative.
- **Date added**: 2026-10-05

### 21. New meal plan's startDate stamped in UTC instead of local time
- **Root cause**: `MealPlanBuilder.jsx`'s `publish()` used `new
  Date().toISOString().slice(0, 10)` for a brand-new plan's `startDate` —
  the exact previously-fixed anti-pattern (see `src/lib/dateKey.js`'s
  `localDateKey`), just not applied here. For any timezone ahead of UTC
  (this app's data is Australia-specific, AEST/AEDT = UTC+10/+11),
  publishing between local midnight and ~10-11am stores the **previous**
  calendar day. Since `startDate` is reused forever once set
  (`existing?.startDate ||`), this is a permanent off-by-one-day anchor —
  the client's plan viewer computes "current week"/"current day" from
  it, so it's shifted by a day for the plan's entire lifetime.
- **Fix**: `publish()` now uses `localDateKey()`.
- **Regression test**: `src/coach/MealPlanBuilder.test.jsx` — sets the
  system clock to 8:30am AEDT (9:30pm UTC the previous day) with
  `TZ=Australia/Sydney`, publishes a new plan, and asserts `startDate` is
  the LOCAL day (Oct 5), not the UTC day (Oct 4). Verified to fail
  (got "2026-10-04") when reverted to `toISOString().slice(0,10)`;
  restored and re-verified green.
- **Manual verification**: N/A — fully automated.
- **Date added**: 2026-10-05

### 22. Removed group members retained permanent read access to the group's chat history
- **Root cause**: `sendGroupMessage` stamps `memberIds` onto each
  `groupMessages` doc as a one-time snapshot of the group's roster AT
  SEND TIME (needed so the client-side `array-contains` watch and the
  Firestore rule both work, and so a client can see a fellow member's
  display name without read access to the `users` collection). Removing
  a member from the group only ever updated the `groups` doc itself —
  every already-sent message kept the removed uid in its own `memberIds`
  forever, and the rule (`request.auth.uid in resource.data.memberIds`)
  kept matching it, so removal blocked future messages but never revoked
  access to history.
- **Fix**: `AppContext.jsx`'s `updateGroup` now detects which member ids
  are being removed (`src/lib/groupMembership.js`'s `removedMemberIds`)
  and batch-strips them from every existing `groupMessages` doc for that
  group via `arrayRemove`, so removal revokes history too.
- **Regression test**: `src/lib/groupMembership.test.js` covers the pure
  "who was removed" computation (verified to fail when gutted to always
  return `[]`). `src/lib/firestoreRules.rules.test.js`'s new
  `groupMessages` test proves the actual mechanism against the real
  rules engine: seeds a message with both members able to read it,
  strips one member's uid via `arrayRemove` (simulating what `updateGroup`
  now does), and confirms that member's read is denied afterward while
  the other member's still succeeds.
- **Manual verification**: the full wiring inside `updateGroup` (looping
  over cached `groupMessages`, chunking into batches of 400, calling
  `batch.update(...)`) isn't separately end-to-end tested — no isolated
  render path for it without mounting the whole data-layer provider. To
  verify by hand: as the coach, remove a member from a group with prior
  message history, then check in the Firebase Console that every
  existing `groupMessages` doc for that group no longer lists the
  removed uid in `memberIds`.
- **Date added**: 2026-10-05

### 23. Moving/saving/reverting a scheduled workout was a non-atomic create-then-delete
- **Root cause**: `moveScheduledWorkout`, `saveScheduledWorkout`, and
  `revertWorkoutLogToScheduled` (`AppContext.jsx`) each did a `setDoc`
  followed by a separately-awaited `deleteDoc` — two independent network
  round-trips, not a `writeBatch`/transaction, unlike `deleteClientPhase`/
  `duplicateClientPhase` right next to them which already use
  `writeBatch` for exactly this kind of multi-doc consistency. If the
  connection dropped between the two calls (or the app backgrounded),
  the new doc could be committed with the old one never removed —
  duplicating the workout on both the old and new date with no rollback.
- **Fix**: all three now use a single `writeBatch` (`.set()`/`.delete()`,
  one `.commit()`), so the pair either both apply or neither does.
- **Regression test**: not independently automated — Firestore's batch
  atomicity is a documented SDK guarantee that a unit test can't
  meaningfully re-verify without actually killing a connection mid-write,
  and these functions live inside the same large provider as the rest of
  `AppContext.jsx` with no isolated render path. Covered by code
  review + the existing build/lint pass; this is a mechanical "two
  awaited calls -> one batch" change with the exact same pattern already
  proven correct elsewhere in this file.
- **Manual verification**: drag-reschedule a workout on the client
  calendar, then check the Firebase Console — exactly one
  `scheduledWorkouts` doc should exist for that workout (on the new
  date), never two.
- **Date added**: 2026-10-05

### 24. Challenge leaderboard gave distinct ranks to tied scores
- **Root cause**: `computeLeaderboard` (`src/lib/challengeMetrics.js`)
  sorted participants by score, then assigned sequential ranks
  (`i + 1`) with no tie-check — e.g. two participants who both logged 12
  workouts got ranks 1 and 2 instead of sharing rank 1.
- **Fix**: standard competition ranking — a tied participant shares the
  previous rank; the next distinct (lower) score resumes at its actual
  position (e.g. 12, 12, 8 -> ranks 1, 1, 3).
- **Regression test**: `src/lib/challengeMetrics.test.js` — asserts tied
  scores share a rank and the next rank skips appropriately, and that
  distinct scores still rank sequentially with no ties. Verified to fail
  (tied participants got ranks 1 and 2) when reverted to plain
  `i + 1`; restored and re-verified green.
- **Manual verification**: N/A — fully automated.
- **Date added**: 2026-10-05

### 25. Challenge progress bar mixed a real "now" instant with a UTC-midnight date boundary
- **Root cause**: `ChallengeCard`'s `pctElapsed` (`CoachChallenges.jsx`)
  compared `new Date()` (the coach's actual current moment) against
  `new Date(c.startDate)`/`new Date(c.endDate)` (UTC midnight of those
  date-key strings) — for a coach in a timezone ahead of UTC, that skews
  the displayed percent-elapsed by the coach's own UTC offset. Cosmetic
  only, confirmed no effect on `challengeStatus`/scoring (both already
  used `localDateKey()` consistently).
- **Fix**: compares `new Date(localDateKey())` against the same
  UTC-midnight-of-date-key boundaries instead, so all three sides of the
  calculation are parsed the same way.
- **Manual verification**: N/A — cosmetic, low-severity, not independently
  automated (no isolated render path for `ChallengeCard` without the
  full `CoachChallenges` tree); verify by hand if ever revisited by
  comparing the displayed "% through" against a manual day-count for a
  challenge while in a UTC+ timezone.
- **Date added**: 2026-10-05

### 26. Rest rows rendered as a blank "Unknown exercise" card in the client app
- **Root cause**: a live production bug reported directly by the user,
  with screenshots. A Rest row (`WorkoutEditor.jsx`'s `emptyRest()` —
  `{ isRest: true, restSeconds }`, deliberately no `exerciseId`) was
  never filtered out of the client-facing exercise lists in
  `ClientApp.jsx` — neither the workout preview (`WorkoutPreviewSheet`)
  nor the live logging session (`WorkoutSession`'s `exercisesForSession`).
  Both treated every entry as a real exercise to resolve against
  `exercisesById`. Before bug #11 in this register (deleted exercises
  falling back instead of vanishing), a Rest row's failed lookup
  silently returned `null` — invisible, which happened to look correct
  for a Rest row even though the mechanism was unrelated. Bug #11's fix
  gave every unresolvable row a visible "Unknown exercise" fallback
  instead, which was correct for an actually-deleted exercise but wrong
  for a Rest row, which was never meant to show as an exercise at all —
  it started showing as a blank, unloggable "Unknown exercise" card with
  no sets/reps in both the warm-up and main session.
- **Fix**: Rest rows are now filtered out before either rendering path
  ever sees them — `WorkoutPreviewSheet` filters `session.exercises`
  before grouping, and `WorkoutSession`'s `exercisesForSession` filters
  `daySession.exercises` at its source, so every downstream consumer
  (`SessionIntelligenceCard`, the live `ExerciseBlock` list, the
  "exclude already-used exercises" set for Add Exercise) is correct too.
- **Regression test**: `src/client/restRowNotExercise.test.jsx` — renders
  both `WorkoutPreviewSheet` and `WorkoutSession` with a session
  containing one real exercise and one Rest row, asserting the real
  exercise renders and "Unknown exercise" never appears. Verified to
  fail (both screens showed "Unknown exercise") when either filter is
  reverted; restored and re-verified green.
- **Manual verification**: N/A — fully automated.
- **Date added**: 2026-10-06

### 27. Recent Activity's body-stats row had no way to jump to the client's weight graph
- **Context**: feature request, not a bug — a coach asked to be able to
  tap a "body stats logged" row in Recent Activity and land on that
  client's weight graph in Progress, matching how tapping a workout or
  check-in row already opens its own detail view.
- **Change**: `CoachDashboard.jsx`'s `weighin` activity rows are now
  clickable and call `onOpenClient(clientId, { tab: "progress" })`. That
  action now threads all the way through: `CoachShell.jsx` stores it
  alongside the pending client id (`pendingClientAction`) and passes it
  to `CoachClients.jsx` as a new `openClientAction` prop, which hands it
  to `openClient(id, action)` exactly the same way a badge click on the
  roster already does — `CoachClientDetail` receives `initialTab="progress"`
  and opens straight onto the Progress tab's weight chart.
- **Regression test**: `src/coach/CoachClients.test.jsx` — renders
  `CoachClients` with `openClientId`/`openClientAction={{tab:"progress"}}`
  set (what `CoachShell` now passes through) and asserts the mounted
  client detail view receives `initialTab="progress"`, against a
  stubbed `CoachClientDetail` (too large/data-heavy to render for real in
  a unit test). Verified to fail (`tab=summary` instead of
  `tab=progress`) when the action isn't forwarded through `CoachClients`'
  own effect; restored and re-verified green. The `CoachShell.jsx` half
  of the chain (storing/forwarding `pendingClientAction`) and the
  `CoachDashboard.jsx` half (the weighin row's onClick) are plain prop
  plumbing with no independent branching logic, covered by code review
  and the build rather than a dedicated test.
- **Manual verification**: as the coach, tap a "logged a body stats
  check-in" row in Recent Activity — it should open that client directly
  on the Progress tab, scrolled to (or at least showing) the Body Weight
  chart, not Summary.
- **Date added**: 2026-10-06

### 28. A stale cross-day session showed "RESUME WORKOUT" with leftover sets on a workout the client never started
- **Root cause**: a live, urgent production bug, reported directly by the
  user, on top of bug #26. `ClientApp.jsx` persists the in-progress
  session (`activeLog`, `runningSession`, `sessionOpen`, etc.) to
  localStorage on every change so a backgrounded/killed app resumes where
  it left off — but restored it **unconditionally** on every load, with
  no check against which calendar day it actually belonged to. Once a
  new day began, a client reopening the app inherited yesterday's (or
  older) leftover sets on TODAY's fresh, never-started session —
  `TodayWorkoutCard`'s `started` flag is only `isToday && !!activeLog &&
  !completedOnDate`, with no check that the active log's session date
  actually matches the day being shown, so it showed "RESUME WORKOUT"
  with a stray set count (e.g. "12/21 sets") on a session the client
  never touched. Because `sessionOpen` was restored too, this could also
  drop the client straight into that old day's live logging screen on
  their very next launch, not just show a misleading card.
- **Fix**: `src/lib/sessionStaleness.js`'s `isPersistedSessionStale`
  checks the persisted `runningSession.date` against today's date; if it
  doesn't match, `ClientApp.jsx` discards the whole persisted session
  (and clears the stale localStorage entry) at load time, before any of
  `activeLog`/`runningSession`/`sessionOpen`/etc. are ever seeded from
  it — so today's session always starts genuinely fresh.
- **Regression test**: `src/lib/sessionStaleness.test.js` — covers a
  different-day persisted session (stale), a same-day one (not stale),
  no persisted session, and a persisted draft with no `runningSession`
  at all. Verified to fail (the stale case returned `false`) when gutted
  to always return `false`; restored and re-verified green. The
  integration (that `ClientApp.jsx` actually discards state on this
  signal) isn't separately rendered — `ClientApp` is the ~8,800-line root
  component with no isolated mount path — covered by code review and the
  build.
- **Manual verification**: start a workout, log a few sets, then leave
  without finishing or canceling it (background the tab, or close the
  app). The next calendar day, reopen the app — Today's card must show
  "START WORKOUT" with no stray set count, not "RESUME WORKOUT."
- **Date added**: 2026-10-06

### 29. No way to clear a stuck "RESUME WORKOUT" card once it had any logged sets
- **Root cause**: found while investigating bug #28 continuing to
  reproduce for one specific client even after that fix shipped —
  exiting the live session screen (its X/Cancel button, `onExit` in
  `ClientApp.jsx`) only ever did `setSessionOpen(false)` and
  `clearLiveSession(...)` (the Firestore mirror the coach watches). It
  never cleared `activeLog`/`runningSession` themselves. So ANY visit to
  the live session screen that logs at least one set — including a coach
  previewing/testing a client's session, not just the client's own use —
  left that client's card permanently stuck on "RESUME WORKOUT" with
  that set count, on the SAME day, with literally no UI path to clear
  it short of logging the client out (which wipes localStorage,
  including the stale session snapshot, as a side effect — not an
  intentional fix).
- **Fix**: `TodayWorkoutCard` now shows a "Not started this — discard
  progress" action whenever it's showing "RESUME WORKOUT", behind a
  two-tap confirm (first tap asks for confirmation, only the second
  actually discards) so it can't erase real in-progress sets with one
  accidental tap. Wired to a new `discardActiveSession()` in
  `ClientApp.jsx` that clears `activeLog`, `runningSession`,
  `sessionOpen`, `exerciseSwaps`, `extraExercises`, `editingLogId`, and
  the draft exercise/session notes — the same full reset
  `finishWorkout()` already does on its own cleanup path, just without
  saving a workout log.
- **Regression test**: `src/client/discardWorkout.test.jsx` — asserts
  the first tap does NOT call the discard handler (only flips to the
  confirming label), the second tap does, and that no discard option
  renders at all when nothing has been started. Verified to fail (fired
  on the first tap) when the two-tap guard is removed; restored and
  re-verified green.
- **Manual verification**: N/A — fully automated.
- **Date added**: 2026-10-06

### 30. Finishing the same scheduled workout from two devices at once created two completed logs
- **Context**: raised directly — "have you considered the app being used
  by multiple users at a time?" Checked every concurrent-write path in
  the app; this and #31 were the two real, confirmed gaps (everything
  per-client is already isolated by `clientId`, and nutrition logging
  already uses a real Firestore transaction).
- **Root cause**: `logWorkout` (`AppContext.jsx`) always minted a brand-
  new random doc id, with no check against what already existed. A
  client signed in on two devices at once (phone + tablet, same
  account — not unusual in a gym, starting on a phone and finishing on a
  propped-up tablet) finishing the SAME scheduled workout around the
  same moment created two separate completed-workout log docs instead of
  one, double-counting it in history, PRs and stats.
- **Fix**: `src/lib/workoutLogId.js`'s `workoutLogDocId` gives a
  scheduled-day finish (one with a `scheduledDate`) a deterministic id —
  `clientId + scheduledDate + a hash of dayLabel` — so a second finish of
  the exact same scheduled workout overwrites the one real log via
  `setDoc` instead of creating a duplicate. An unscheduled log (ad-hoc
  cardio, which legitimately repeats multiple times a day) keeps a fresh
  random id, unchanged.
- **Regression test**: `src/lib/workoutLogId.test.js` covers the id
  function and the branch decision in isolation (verified to fail when
  the hash was made non-deterministic). `src/lib/firestoreRules.rules.test.js`'s
  new `workoutLogs` test drives the exact two-device scenario — each
  "device" independently computes its own id via `workoutLogDocId` (not
  a precomputed id reused for both writes, which would have passed even
  with a non-deterministic generator) and writes against the real rules
  engine — confirming exactly one document results, with the second
  write's data winning, AND that the client is actually permitted to make
  that second write (an UPDATE under the real `workoutLogs` rule, since
  the doc already exists). Verified to fail (2 documents instead of 1)
  when the id generator was reverted to non-deterministic; restored and
  re-verified green on both test files.
- **Manual verification**: `logWorkout`'s own branch (choosing
  `workoutLogDocId`'s output over a fresh random id when `scheduledDate`
  is present) isn't independently wired-tested — it lives inside the
  large `AppContext` provider with no isolated call path. Covered by code
  review and the build.
- **Date added**: 2026-10-06

### 31. Two clients scanning the same barcode at once could each create a duplicate shared food-library entry
- **Root cause**: `createFood` (`AppContext.jsx`) always minted a fresh
  random doc id. The barcode scan flow already checks the LOCAL cache
  (`db.customFoods`) for a matching barcode before deciding to look it up
  and save it — but that check only ever reflects what this one device's
  own snapshot already knew when the scan started. Two different clients
  scanning the same uncached product within the same network round-trip
  (neither has the other's write synced down to their own cache yet)
  would each independently decide "not found" and each create their own
  near-duplicate entry in the SHARED `customFoods` library.
- **Why not the same fix as #30**: a deterministic id (barcode-derived)
  was considered and rejected — `customFoods`' own rule only lets a
  COACH update an existing doc (`allow update, delete: if isCoach()`;
  any signed-in client may only `create`). With a deterministic id, the
  SECOND client's write would be classified as an UPDATE (the doc already
  exists) and get flatly rejected with permission-denied — trading a
  harmless duplicate for a hard, confusing error. That access model is
  intentional (clients can add to the library but never edit what's
  already there) and wasn't loosened.
- **Fix**: a new `findCustomFoodByBarcode(barcode)` does a LIVE (not
  cached) Firestore query by the barcode field, called immediately before
  `createFood` in the automated network-lookup-save path
  (`NutritionFeatures.jsx`). If another client's entry for that exact
  barcode has landed server-side by the time this client's lookup
  finishes, it's reused instead of creating a duplicate. This narrows the
  race window to the gap between this read and the create, rather than
  closing it completely — the only way to close it fully conflicts with
  the access model above. Deliberately NOT applied to the manual-
  correction entry path (typing in nutrition after a failed scan,
  `correctedByUser: true`) — that's a deliberate human correction meant
  to be authoritative, and silently discarding it in favor of "whatever
  another client already saved" would be actively worse than the rare
  duplicate it might occasionally produce.
- **Regression test**: `src/lib/firestoreRules.rules.test.js`'s new
  `customFoods barcode lookup` tests confirm a signed-in client can
  actually perform this exact query (`where("barcode", "==", ...)`) and
  correctly finds another client's just-created entry, or correctly finds
  nothing for an unscanned barcode — against the real rules engine, not
  assumed. The `NutritionFeatures.jsx` wiring itself (the
  check-before-create ternary) isn't independently rendered — `BarcodeScanSheet`
  depends on live camera/`Html5Qrcode` APIs with no practical render path
  in this environment — covered by code review and the build.
- **Manual verification**: have two different client accounts scan the
  exact same never-before-seen barcode at effectively the same time (or
  simulate it by having one finish its lookup while the other is still in
  flight) — the shared food library should end up with one entry for that
  barcode, not two.
- **Date added**: 2026-10-06

### 32. Coach's new-message push notification said "New message" with no sender name
- **Root cause**: `api/notify.js` (the live push-notification code path —
  `functions/index.js`'s Cloud Functions equivalent exists but isn't
  deployed; see its own header comment) hardcoded the push title to
  "New message" for every client message, regardless of who sent it. The
  `messages` doc itself only ever carries `clientId`, not a name.
- **Fix**: looks the sending client's name up from their `users` profile
  doc before notifying the coach, and uses it as the title (matching how
  group-chat notifications already show the sender). Falls back to "A
  client" if the profile has no name set. Also updated the matching
  (currently undeployed) logic in `functions/index.js` per its own
  "keep these in sync" header comment.
- **Regression test**: `api/notify.test.js` — asserts the push title is
  the client's real name, and the "A client" fallback when no name is
  set. Verified to fail (title stayed "New message") when reverted;
  restored and re-verified green.
- **Manual verification**: N/A — fully automated.
- **Date added**: 2026-10-06

### 33. Error toasts looked identical to success toasts (client reported "sometimes app doesn't record foods entered")
- **Root cause**: `Toast` (`src/components/ui.jsx`) always rendered the
  same green checkmark regardless of what the message said, and
  `showToast()` in `ClientApp.jsx` had no way to mark a message as an
  error in the first place. Every failed save (nutrition log, barcode
  add, weigh-in, etc.) still popped a toast with the error text, but it
  looked exactly like a routine success toast — in a noisy gym, glanced
  at quickly, a failure was indistinguishable from "saved". The client's
  report of food entries silently not recording was this: the save was
  failing and reporting it, but the report didn't register as an error.
- **Fix**: `showToast(message, isError = false)` now carries a `tone`
  ("success"/"error") into toast state; `Toast` takes a `tone` prop and
  renders a distinct `AlertCircle` icon on an `OVER_RED` background for
  `tone="error"` (vs. the existing black/white checkmark for success),
  and stays on screen longer (4.5s vs 1.8s) so it's not missed. All 18
  existing error-path `showToast(err.message, ...)` call sites in
  `ClientApp.jsx` now pass `true` for `isError`.
- **Regression test**: `src/components/Toast.test.jsx` — renders `Toast`
  with the default tone and asserts a checkmark (not the error icon);
  renders it with `tone="error"` and asserts the error icon (not a
  checkmark). Verified to fail (error case found no distinct icon) when
  the conditional icon rendering was reverted to the old unconditional
  checkmark; restored and re-verified green.
- **Manual verification**: trigger a real save failure (e.g. go offline,
  log a food) and confirm the toast is visually distinct (red, alert
  icon, stays longer) from a normal successful save toast.
- **Date added**: 2026-10-06

### 34. Coach's "Possible plateau" flag used estimated 1RM instead of reps/sets/volume progression
- **Root cause**: `computePlateaus` (`src/lib/trainingStats.js`) flagged an
  exercise as stuck by comparing each session's best estimated 1RM (Epley
  formula off the single best set) against the best e1RM from before a
  3-week window. A single heavy low-rep set can inflate e1RM even while
  the client's actual working sets — the reps and sets they're actually
  doing — haven't progressed at all, so a real plateau could go unflagged
  (or a genuine low-volume PR test could mask one). The card itself had
  also been misplaced in the Summary tab instead of the Training tab,
  fixed separately in commit 248c359.
- **Fix**: switched the metric from best-set e1RM to total session volume
  (sum of weight × reps across every set that session) — this directly
  reflects "no progression in reps or sets," not just a 1-rep-max
  estimate. Comparison logic (3+ sessions in the last 3 weeks, best value
  in that window vs. best before it, 2% noise tolerance) is unchanged.
  Also renamed the surfaced field (`currentBest` → `currentVolume`) and
  updated the card's label from "kg e1RM" to "kg volume."
- **Regression test**: `src/lib/trainingStats.test.js` — a scenario with
  real working-set history (100kg × 8 × 3 sets) followed by three
  single-heavy-rep sessions (130kg × 1) that would have beaten the old
  e1RM (making the old code NOT flag it) now correctly flags as a
  plateau under the volume metric; a genuinely-progressing-reps scenario
  stays unflagged; the existing 3-session-minimum and
  no-history-before-window guards are also covered. Verified to fail
  (the e1RM-beating scenario wasn't flagged) when reverted to the old
  e1RM-based metric; restored and re-verified green.
- **Manual verification**: on a client with 3+ sessions of the same lift
  in the last 3 weeks and flat reps/sets, confirm "Possible plateau"
  shows that exercise with a volume figure that matches hand-calculated
  weight × reps summed across sets.
- **Date added**: 2026-10-06

### 35. Scanning a product that "seemed to not add" led to it being logged twice
- **Root cause (two compounding bugs)**: (1) `FoodQuantitySheet`'s ADD
  button fired `onConfirm` and the caller (`ClientApp.jsx`) closed the
  sheet (`setPendingFood(null)`) immediately, without waiting to see
  whether the underlying save (`addFood` → `setNutritionForDate`, a real
  Firestore transaction) had actually finished or failed. (2) Once ADD
  itself was guarded against a double-tap, the sheet's own X button and
  backdrop tap (both wired straight to `onClose` by the shared
  `BottomSheet` component) still closed it regardless of an in-flight
  save — a client could tap ADD, then almost immediately tap away to back
  out, well before a real network round trip settles, and go rescan while
  the first save kept running in the background and landed anyway once it
  finished. Either path made a save in progress look identical to the tap
  doing nothing, so a client scanned and confirmed the same product
  again — and both saves were genuinely processed, landing it twice.
- **Fix**: `addFood` now returns its save promise instead of discarding
  it (and re-throws after showing its error toast, so a caller that
  awaits it can tell the save failed — the three fire-and-forget callers
  elsewhere in `ClientApp.jsx` that don't need to know now swallow that
  re-throw explicitly). `FoodQuantitySheet`'s ADD button disables itself
  and shows "ADDING…" the instant it's tapped, ignoring a repeat tap; its
  `onConfirm` only closes the sheet after that save actually resolves; and
  while a save is in flight its X button/backdrop tap are swallowed
  (no-op) instead of closing the sheet out from under the save — a
  failure re-enables everything for an immediate retry instead of
  silently vanishing.
- **Regression test**: `src/client/foodQuantityDoubleAdd.test.jsx` — a
  second ADD tap while the first save is pending is ignored (`onConfirm`
  called exactly once, button disabled); a rejected save re-enables the
  button for a retry; the sheet's close (X) button is ignored while
  saving and works normally again once the save settles. Verified each to
  fail (double-fired `onConfirm`; `onClose` fired mid-save) against the
  prior code; restored and re-verified green.
- **Manual verification**: throttle the network (dev tools "Slow 3G"),
  scan/confirm a product, and confirm the ADD button shows "ADDING…",
  can't be tapped again, and the sheet can't be dismissed (X/backdrop)
  until the save completes or fails.
- **Date added**: 2026-10-06

### 36. Coach's Push Notifications toggle always showed "off" and threw "not supported" on the native iOS app
- **Root cause**: `src/lib/nativeBridge.js` (what actually registers push
  on the native App Store build — the device gets a real APNs/FCM token
  natively and hands it to the web app) saves that token to a
  per-account `localStorage` key, `pushToken_<uid>`. The coach-side
  toggle (`PushNotificationsCard` in `src/coach/CoachMore.jsx`) was still
  reading/writing the old, bare, unnamespaced `"pushToken"` key that
  native registration never touches — so even with push already
  registered and working in the background, this screen always
  initialized to "off." The client-side equivalent (`ClientApp.jsx`'s
  `PushNotificationsSheet`) already used the correct namespaced key —
  this migration was just never applied to the coach screen. Fixing
  only that wasn't the whole story, though: tapping the toggle while
  genuinely not yet enabled on native (the coach denied iOS's one-time
  permission prompt, or hasn't been asked yet) fell through to the
  browser-only `enablePush()` path, which always throws "Push
  notifications aren't supported on this device or browser" inside
  WKWebView — true regardless of the real OS permission state, since
  that API doesn't exist there at all, and iOS never lets an app
  re-trigger its own permission prompt after a denial.
- **Fix**: `PushNotificationsCard` now reads/writes `pushToken_<userId>`,
  matching what `nativeBridge.js` actually writes. On native specifically
  (detected via `window.__apexNativePush`, which only ever exists inside
  that build), tapping the toggle while disabled no longer calls
  `enablePush()` at all — it opens the device's iOS Settings page for
  this app instead (`app-settings:`, routed there by
  `ViewController.swift`'s existing out-of-app-link navigation policy, no
  native code change needed), with on-screen copy explaining push is
  controlled by iOS, not the app, on that build.
- **Regression test**: `src/coach/pushNotificationsKeyMismatch.test.jsx`
  — with `pushToken_<userId>` already set (simulating native having
  already registered), the card renders as enabled; the old bare
  `pushToken` key alone does not count as enabled; on native with no
  token, tapping the toggle never calls `enablePush` (confirmed to fail —
  it called `enablePush` — against the prior code, before this specific
  guard existed); off native, tapping still goes through `enablePush` as
  before. All verified to fail against the respective prior code;
  restored and re-verified green.
- **Manual verification**: on the native iOS app, sign in as the coach,
  open More → Push Notifications. If push was already registered it
  should show enabled immediately; if not, tapping the toggle should open
  iOS Settings rather than show any "not supported" error.
- **Date added**: 2026-10-06

### 37. Every push notification sent twice (duplicate Cloud Function + Vercel notify)
- **Root cause**: an earlier migration moved push notifications from
  Firebase Cloud Functions (`functions/index.js`) to Vercel serverless
  functions (`api/notify.js`, `api/client-activated.js`) specifically to
  avoid needing the paid Blaze plan — but this project turned out to
  already be on Blaze, with `.github/workflows/deploy-functions.yml`
  auto-deploying `functions/index.js` to real Cloud Functions on every
  push to `main` that touches `functions/**`. The six old Firestore
  triggers this migration was meant to retire (`onNewMessage`,
  `onNewGroupMessage`, `onMealPlanChanged`, `onClientPhaseChanged`,
  `onNewCheckIn`, `onClientActivated`) were never actually deleted from
  the file, so every unrelated change to it (AI features, WHOOP, etc.)
  kept silently redeploying them alongside the new `/api/notify.js`
  calls already wired into `AppContext.jsx` — sending every message,
  group message, meal plan update, phase update, and check-in as two
  separate push notifications, and running the client-activation
  id-migration logic twice per signup. Confirmed directly (not assumed)
  by checking actual GitHub Actions run history — 13 successful deploys
  of this file — and by the user reproducing a literal duplicate "Hi"
  notification on a real device.
- **Fix**: deleted all six Firestore-trigger exports and the now-orphaned
  `getCoachId()` helper (only those six ever called it) from
  `functions/index.js`, along with the now-unused
  `onDocumentCreated`/`onDocumentWritten` imports. Kept everything with
  no `/api` equivalent: the two `onSchedule` jobs
  (`checkInReminders`, `whoopSync`) and all nine `onCall` functions
  (account deletion, invite recovery, AI insight/nutrition-help, WHOOP
  connect/disconnect) — `notifyUser` and `CLIENT_ID_COLLECTIONS` stay
  since those are still used by `checkInReminders` and `deleteMyAccount`
  respectively. Caught and fixed one real dependency on the removed
  triggers before shipping: `inactivityWod` (another kept `onSchedule`
  job) posts a message document directly via the Admin SDK and relied on
  the now-deleted `onNewMessage` trigger to actually push a notification
  for it — since that was a server-side Firestore write, not a client
  call through `AppContext.jsx`'s `sendMessage()`, `/api/notify.js` was
  never going to fire for it either. Added an explicit `notifyUser` call
  there matching what `onNewMessage` used to send, so that notification
  keeps working.
- **Regression test**: none automated — `functions/` has no test harness
  in this repo (no test script in `functions/package.json`, nothing
  wired into the root Vitest suite). Verified `node --check
  functions/index.js` passes (valid syntax) and grepped the whole file
  for every removed identifier to confirm no other caller was left
  dangling. The real verification is the GitHub Actions deploy itself
  succeeding against the live Firebase project — checked directly via
  the Actions API after pushing, not assumed.
- **Manual verification**: send a 1:1 message, a group message, publish a
  meal plan update, update a training phase, and submit a check-in —
  each should produce exactly one push notification, not two.
- **Follow-up catch**: the first deploy of this fix actually failed —
  `firebase deploy --non-interactive` refuses to delete a function
  that's live but no longer in source, and aborts the ENTIRE deploy
  waiting for an interactive confirmation that can never come in CI, so
  the six duplicate triggers were still live (still double-sending)
  after that push went out. Caught by checking the GitHub Actions run
  directly rather than assuming success; fixed by adding `--force` to
  `.github/workflows/deploy-functions.yml`'s deploy step, then manually
  re-triggered via `workflow_dispatch` — confirmed this run actually
  deleted all six and deployed cleanly, again by reading its logs
  directly, not assuming.
- **Date added**: 2026-10-06

### 38. Client-side push toggle had the same native dead-end as the coach's
- **Root cause**: same bug class as #36, in the client app's own two push
  UI surfaces (`ClientApp.jsx`'s `PushNotificationsSheet` and
  `NotificationsPromptCard`). `PushNotificationsSheet`'s toggle called
  `enablePush()` unconditionally — on native, with push not yet
  registered (OS permission denied or not yet asked), this threw the
  same browser-only "not supported" error. `NotificationsPromptCard` had
  a different symptom of the same root cause: it gated its own
  visibility on `pushSupported()` (a browser Push API check), which
  always resolves `false` inside WKWebView regardless of whether native
  push is actually workable — so this nudge banner silently never
  appeared at all on the native app, even for a client who hadn't
  granted the OS permission yet and would have benefited from the nudge.
- **Fix**: extracted the native-build check (`isNativeApp`, reading
  `window.__apexNativePush`, which only exists inside the native app)
  into a shared export from `src/lib/push.js` — used by both
  `CoachMore.jsx` (replacing its own local copy of the same check) and
  `ClientApp.jsx`. `PushNotificationsSheet`'s toggle now opens iOS
  Settings instead of calling `enablePush()` when disabled on native,
  matching the coach fix exactly. `NotificationsPromptCard` now treats
  native as "supported" on its own terms (bypassing the browser-API
  check that was never meaningful there) and its ENABLE action opens iOS
  Settings the same way, so the nudge banner now actually shows up and
  works for native clients instead of silently never appearing.
- **Regression test**: `src/client/pushNotificationsNativeAware.test.jsx`
  — on native, `PushNotificationsSheet`'s toggle never calls `enablePush`;
  off native it still does, unchanged; `NotificationsPromptCard` shows on
  native even though the browser Push API itself is unsupported there,
  its ENABLE action never calls `enablePush` on native, and it still
  correctly stays hidden off native when the browser genuinely doesn't
  support push. Verified each native-path assertion to fail against the
  prior code; restored and re-verified green. (Also updated
  `src/coach/pushNotificationsKeyMismatch.test.jsx`'s mock of
  `../lib/push` to supply `isNativeApp` now that it's imported rather
  than locally defined — re-verified all 4 of those tests still pass.)
- **Manual verification**: on the native iOS app, sign in as a client who
  hasn't granted the OS notification permission yet — the "turn on
  notifications" nudge on Home should appear and, when tapped, open iOS
  Settings rather than show any "not supported" error; same for the
  Profile → Push Notifications screen's toggle.
- **Date added**: 2026-10-06

### 39. Rest timer "freezes" when leaving the app and coming back
- **Root cause**: the rest timer's display is already wall-clock-based
  (`WorkoutSession`'s `tick()` recomputes remaining time from
  `restEndAtRef.current - Date.now()`, not a plain per-second decrement),
  and its "catch up the instant the client returns" handler listened for
  `visibilitychange`. That's not enough on the native iOS App Store build
  (a bare WKWebView wrapper): `document.visibilityState` doesn't reliably
  update when the WHOLE APP is backgrounded/foregrounded via the home
  button or app switcher — there's no browser tab being hidden, just the
  native window losing and regaining focus — so `visibilitychange` could
  go an entire session without firing there, and the catch-up logic
  silently never ran. The display only ever corrected once the throttled
  `setInterval` eventually ticked again on its own, which is exactly what
  looked like "freezing" (reported as: stuck on return, but still counting
  down again once it caught up) until it self-corrected.
- **Fix**: the catch-up handler now also listens for `window`'s `focus`
  event, which WKWebView does fire reliably for this — the same
  combination already used (and already working) for this file's
  session-duration tracker (`sessionActiveMsRef`'s `sync()`), just never
  applied to the rest timer's own catch-up logic.
- **Regression test**: `src/client/restTimerBackgroundCatchup.test.jsx` —
  starts a 90s rest timer, fast-forwards wall-clock time by 70s with no
  interval ticks (simulating OS-suspended timers), then fires only a
  `window` `focus` event (no `visibilitychange`) and asserts the display
  already shows the correct `0:20`, not the stale `1:30`; a second test
  confirms the existing `visibilitychange`-only path still works
  unchanged. Verified the focus-only test fails (stayed on the stale
  `1:30`) against the prior visibilitychange-only code; restored and
  re-verified both green.
- **Manual verification**: on the native iOS app, start a rest timer,
  background the app (home button) for under a minute, then reopen it —
  the countdown should immediately show the correct remaining time, not a
  stale pre-background number that only corrects a second or more later.
- **Date added**: 2026-10-07

### 40. Food logged once landed in the diary twice ("Pea Protein Shake" doubled up)
- **Root cause**: `FoodQuantitySheet`'s own ADD button was already
  guarded against a fast double-tap (bug #35), but several other
  direct-add paths in `NutritionScreen` (`ClientApp.jsx`) were not: a
  recent food's row, a saved meal's own Plus button, and a saved meal
  matched by search all called `onAddFood` straight through with nothing
  stopping a second, near-simultaneous tap (a touchstart/click
  double-fire, or just an impatient second tap before any visual feedback
  appeared) from firing it twice — each call is a genuine, independent
  Firestore write, so two taps meant two real entries.
- **Fix**: all of these now route through a single ref-based guard
  (`NutritionScreen`'s `guardedAdd`/`addBusyRef`) that drops a second call
  while the first is still in flight. A ref rather than state, because two
  taps in the same tick can both run before a state update's re-render
  ever lands and disables anything.
- **Regression test**: `src/client/nutritionDuplicateAdd.test.jsx` — logs
  a recent food, then a saved meal, each via two rapid taps while the
  (mocked, deferred) save is still pending, and asserts `onAddFood` was
  only called once per case. Verified both fail (called twice) with the
  guard removed; restored and re-verified both green.
- **Manual verification**: on a slow connection, open "Add to [meal]",
  tap a recent food or a saved meal's Plus button twice quickly — only one
  entry should appear in the log, both before and after the save settles.
- **Date added**: 2026-10-10

### 41. A barcode scan with mismatched nutrition still showed a green "Verified" checkmark
- **Root cause**: `computeConfidence` (`barcodeLookup.js`) only deducted
  15 of its 100 points for a failed Atwater plausibility check (label
  calories not reconciling with protein/carbs/fat) — a product with a
  complete macro panel, a real brand/name, and a parsed serving size could
  still clear 75+ points (LIKELY) or more purely on those other factors,
  even when its own calories and macros disagreed by 4x. The confirm
  screen's badge logic (`NutritionFeatures.jsx`) shows a green "✓
  Verified" checkmark for both VERIFIED and LIKELY, so a scan already
  flagged with the red "doesn't add up" banner could simultaneously show
  a reassuring verified badge — directly contradicting it, and exactly
  what a real scan of "Protein Smoothie Choc Honeycomb" (253 cal label vs
  ~58 cal from its own macros) did.
- **Fix**: `computeConfidence` now caps the result at REVIEW whenever the
  nutrition plausibility check fails, regardless of how well every other
  factor scores — a product can never read as VERIFIED or LIKELY while
  its own numbers don't reconcile.
- **Regression test**: `src/lib/barcodeLookup.test.js` — a product with a
  complete macro panel, real brand/name, parsed serving size, and
  AU-market tag, but calories that don't reconcile with its macros at all,
  scores ≥75 on the other factors alone yet must report REVIEW, not
  LIKELY/VERIFIED. Verified it fails (reported LIKELY) without the cap;
  restored and re-verified green.
- **Manual verification**: scan a product whose label calories obviously
  don't match its macros — the confirm screen should show only the red
  "double-check this" banner, never a green "Verified"/"Likely" badge
  alongside it.
- **Date added**: 2026-10-10

### 42. On-screen keyboard stayed up after searching and logging a food
- **Root cause**: the Nutrition "Add to [meal]" search input
  (`NutritionScreen` in `ClientApp.jsx`) was never explicitly blurred.
  iOS only dismisses its on-screen keyboard when the focused element is
  blurred (or something else takes focus) — not just because a sibling
  button gets tapped or the list it's typing into scrolls — so after
  searching for and logging a food, the keyboard stayed up and covered
  the screen instead of dismissing the way a native app would.
- **Fix**: added a `searchInputRef` + `dismissKeyboard()` helper, called
  on every path that logically finishes the search: picking a food from
  search results, picking a saved meal from search results or the recent
  list, and closing the "Add to [meal]" sheet (X button or backdrop).
  Also added `type="search"`/`enterKeyHint="search"` so iOS offers a
  dedicated dismiss affordance on the keyboard itself.
- **Regression test**: `src/client/nutritionSearchKeyboardDismiss.test.jsx`
  — focuses the search input, then closes the sheet (asserts it's no
  longer the active element) and separately searches for and taps a
  matching saved meal (same assertion). Verified both fail with
  `dismissKeyboard` stubbed to a no-op; restored and re-verified green.
- **Manual verification**: on an iPhone, open "Add to [meal]", type in
  the search bar, then tap a result — the keyboard should dismiss
  immediately, not stay covering the screen.
- **Date added**: 2026-10-10

### 43. Food units weren't type-aware — every food offered the same generic unit list
- **Root cause**: `unitsFor()` (`foodDatabase.js`) always put grams first
  and only ever added whatever a food happened to have hand-curated into
  its own `units`/`customUnit` fields — most of the ~1,400 static library
  entries had neither, so a milk, a jar of honey, and a tray of mince all
  offered the exact same bare "grams" picker, unlike MyFitnessPal (and
  every other food tracker) which infers ml/cup for a liquid,
  tbsp/tsp/cup/pat/stick for a spread, tbsp/tsp for a condiment, and
  g/oz/lb/kg for a generic weighed solid, purely from knowing what kind of
  product it is.
- **Fix**: added `isLiquidFood()` and an `autoUnitIds()` classifier (name
  regexes, checked in priority order so a strong beverage phrase like "Hot
  Chocolate" or "Chai Latte" is recognised as a drink before the bare word
  "chocolate" can route it the other way, and an actual chocolate bar/
  candy — "Milk Chocolate", "Milk Creme" — is never misclassified as
  liquid just because "milk" appears in its name). `unitsFor()` now
  applies this automatically to every food — static library entry, quick
  add, or barcode scan — with a food's own `units` field ADDING further
  options on top rather than replacing the automatic set, so the handful
  of foods already hand-curated keep working unchanged. Liquids now show
  ml as the base unit instead of grams (no more "150g of milk"). Also
  added a "container" unit at a food's real known package size when one's
  set, and a known-package-size + liquid/solid signal is now read straight
  off Open Food Facts' own `quantity` field (`barcodeLookup.js`'s
  `parseQuantity()`) for every future barcode scan — real structured pack
  data, not a name guess.
- **Regression test**: `src/lib/foodDatabase.test.js` (new file) —
  classification correctness for milks/waters, strong beverage phrases,
  chocolate/candy false-positive avoidance, the "honeydew" substring trap,
  an explicit `liquid` override, spread/condiment/generic-solid unit sets,
  customUnit + auto-units coexisting, container-unit formatting, the
  never-both-g-and-ml invariant, correct macro math for the newly-added
  lb/kg/pat/stick units, and a sanity sweep asserting every single entry
  in the real `FOOD_DATABASE` resolves a valid g/ml-first unit list
  without throwing. `src/lib/barcodeLookup.test.js` gained 3 more cases
  covering `quantity`-field parsing for both ml and g packages, and the
  no-quantity-field fallback. Verified 17 of the new `foodDatabase.test.js`
  cases fail against the prior code (reverted); restored and re-verified
  all 17 passing, plus the barcode cases.
- **Manual verification**: scan or search a milk — the quantity sheet
  should default to ml with cup/tbsp options, no grams option; a honey or
  sauce should offer tbsp/tsp; butter should offer tbsp/tsp/cup/pat/stick;
  mince, chicken, potatoes etc. should offer g/oz/lb/kg.
- **Date added**: 2026-10-10

### 44. Background page still scrollable underneath an open bottom sheet (iOS) — and the first fix froze the page on keyboard dismiss
- **Root cause**: `lockBodyScroll()`/`unlockBodyScroll()` (`src/components/
  ui.jsx`, shared by every `BottomSheet` and `FullScreenOverlay` in the
  app) only ever set `document.body.style.overflow = "hidden"`. That's
  enough on desktop and Android Chrome, but iOS Safari/WKWebView's
  touch-driven scrolling ignores the body's own `overflow` rule as long as
  some ancestor further down the tree is independently scrollable — true
  of nearly every screen here — so on the one platform this app actually
  ships on (see `CLAUDE.md`: a published App Store app), the page behind
  an "open" sheet stayed fully scrollable. Screen-recorded report: opening
  "Add to Lunch" over the Nutrition screen, the page visibly scrolled
  underneath it.
- **First fix attempt (reverted)**: additionally pinned the body with
  `position: fixed` at its current scroll offset — the usual recipe for
  this on iOS. Shipped, then a second real report came in: dismissing the
  keyboard while a sheet with a search box was open froze the whole page
  solid. The keyboard opening/closing resizes the visual viewport, which
  forces a recompute of the fixed-position body against it — a
  recalculation this app's actual native shell (a bare WKWebView wrapper,
  not real mobile Safari) got stuck on. A document-level `touchmove`
  blocker was tried next and rejected before shipping: it would have
  risked breaking scrolling in every OTHER full-screen overlay in the app
  (workout session, messages, video player, etc.), since none of those
  mark themselves as an allowed scroll area the way only `BottomSheet`
  would have.
- **Actual fix**: backed the body-pin out entirely (back to plain
  `overflow: hidden`, still reference-counted for nested sheets) and
  stopped the background from moving with pure CSS, scoped to
  `BottomSheet` alone: `touch-none` (`touch-action: none`) on its backdrop
  (nothing there needs to scroll in the first place) and
  `overscroll-contain` (`overscroll-behavior: contain`) on its own
  scrollable content (stops a scroll that hits the top/bottom of the
  sheet's list from "chaining" into the page behind it — the other classic
  iOS cause of a sheet's background visibly moving). Neither touches body
  layout, so neither can conflict with the keyboard's viewport resize.
- **Regression test**: `src/components/bodyScrollLockIOS.test.jsx` — a
  mounted `FullScreenOverlay` sets `overflow: hidden` and explicitly must
  NOT set `position: fixed` (locks in the keyboard-freeze fix, so it can't
  silently regress back); a second test asserts two nested overlays only
  release the lock once the last one closes; a third/fourth assert
  `BottomSheet`'s backdrop carries `touch-none` and its scrollable content
  carries `overscroll-contain`. Verified the `position: fixed` case fails
  against the (briefly shipped) pinned-body code, confirming the test
  would have caught that regression before it shipped; restored and
  re-verified all 4 passing against the final fix.
- **Manual verification**: on an iPhone, scroll partway down the Nutrition
  screen, open "Add to Lunch," try to drag the darkened area behind the
  sheet (should not move), scroll the sheet's own result list past its
  top/bottom (should not move the background either), then dismiss the
  keyboard — the page must stay fully responsive, not freeze.
- **Date added**: 2026-10-10

### 45. Nutrition search sheet vanished mid-search, keyboard left open over a scrollable background
- **Root cause**: the "Add to [meal]" search-results filter
  (`NutritionScreen` in `ClientApp.jsx`) called `.name.toLowerCase()`
  directly on every saved meal and food, with no null-guard — unlike
  `matchesSearch()` (the shared helper every other search in this app
  already uses, which already handles a missing `text`). A single
  malformed entry (a saved meal or custom food with a missing/null
  `name` — plausible fallout from the same class of corrupted-data bug as
  #40's duplicate-entry report) threw a `TypeError` on every keystroke
  once the typed query reached it, crashing the sheet's render — which, in
  React, unmounts the whole subtree, including the search input the
  keyboard was still attached to and the body-scroll-lock effect's cleanup
  (compounding bug #44 above: the background was then both visible AND,
  before that fix, scrollable). Screen-recorded report: typing in the
  search bar, the entire "Add to Lunch" sheet disappeared instantly,
  keyboard still up, background page visible and draggable.
- **Fix**: both filters now go through `matchesSearch()` instead of a raw,
  unguarded `.toLowerCase()` chain — consistent with every other search in
  this file, and null-safe against a malformed entry.
- **Regression test**: `src/client/nutritionSearchCrashGuard.test.jsx` —
  a saved meal with `name: null` in the list, typing in the search box
  must not throw and the sheet (its search box) must still be on screen
  afterwards; a second test confirms well-formed entries still match
  correctly. Verified the first case throws
  `TypeError: Cannot read properties of null (reading 'toLowerCase')`
  against the prior unguarded code — the exact crash mechanism; restored
  and re-verified both passing.
- **Manual verification**: with a malformed saved-meal/food entry present,
  open "Add to [meal]" and search — the sheet must stay open and simply
  show "No matches," never vanish.
- **Date added**: 2026-10-10

### 46. Swiped a food entry to delete it — row froze off-screen, never actually deleted (part of the original duplicate-meal report)
- **Root cause**: two compounding bugs on the same path. (1) `removeFood`
  (`ClientApp.jsx`) never `return`ed its own save promise — fire-and-forget
  — so a caller had no way to know whether the delete actually succeeded.
  (2) `SwipeableRow` moves a row off-screen optimistically the instant a
  swipe crosses the delete threshold, well before the write it triggers
  has confirmed — the whole point is for it to feel instant — but nothing
  ever resynced that animation with the real outcome. A failed delete
  (offline, a rejected transaction, contention from the duplicate-add bug
  this was originally reported alongside) left the row permanently swiped
  away: blank, still taking up space, impossible to tell apart from the
  app being frozen, while the entry itself was still sitting right there
  in the data underneath it.
- **Fix**: `removeFood` now returns its save promise (and re-throws on
  failure, same pattern as `addFood`). `SwipeableRow` awaits `onDelete()`
  and, on rejection, snaps the row back into view instead of leaving it
  stuck, and blocks a second swipe from firing while a delete is already
  in flight. Mirrored the same missing `return` fix in
  `CoachClientDetail.jsx`'s `removeFoodItem` (same bug, no `SwipeableRow`
  there since that flow uses a confirm dialog instead of swipe, so no
  animation to desync — just the same defensive-correctness gap).
- **Regression test**: `src/client/swipeDeleteFreeze.test.jsx` — swiping
  a row with a rejecting `onDelete` must snap it back to
  `translateX(0px)` instead of leaving it at `translateX(-300px)`; a
  second test confirms a second swipe while the first delete is still
  pending doesn't fire `onDelete` again. Verified both fail against the
  prior fire-and-forget `SwipeableRow` (the first with the exact stuck
  `-300px` transform); restored and re-verified both passing.
- **Manual verification**: with two of the same food logged (or on a
  flaky connection), swipe one to delete — on success it's removed
  cleanly; simulating a failure should bring the row back into view
  rather than leaving a frozen blank row.
- **Date added**: 2026-10-10

### 47. WorkoutSession's Cancel button had no guard against a save still in flight
- **Root cause**: diagnosed earlier this session but not yet fixed — the
  header's "Cancel" button (`onClick={onExit}`) had no `disabled`/guard
  against being tapped while "Complete Workout" was still saving
  (`finishing`). A client on a slow connection could tap Complete, see
  "Saving…" for a beat, tap Cancel believing nothing was happening, and
  exit — while the original save kept running in the background and
  landed anyway once it finished, with the client having no reason to
  think it had, risking exactly the duplicate-entry confusion already
  fixed elsewhere this session (FoodQuantitySheet, bug #35; the saved-meal
  Plus button, bug #40).
- **Fix**: `disabled={finishing}` added to the Cancel button, same
  guarding pattern as the "Complete Workout" button right next to it.
- **Regression test**: `src/client/workoutCancelGuard.test.jsx` — Cancel
  must be disabled and not call `onExit` while `finishing` is true; a
  second test confirms it still works normally when nothing is saving.
  Verified the first case fails (button enabled, `onExit` called) against
  the unguarded button; restored and re-verified both passing.
- **Manual verification**: on a slow connection, tap Complete Workout,
  then immediately tap Cancel while it still shows "Saving…" — it should
  do nothing until the save settles.
- **Date added**: 2026-10-10

### 48. A scanned sports drink offered — and even defaulted to — tablespoons as a unit
- **Root cause**: two compounding bugs, both in the unit system added
  earlier this session (bug #43). (1) `FoodQuantitySheet`'s default-unit
  effect was still hardcoded to `setUnitId("g")` regardless of food type
  — never updated when liquids started using "ml" as their base unit
  instead of "g". For a liquid, "g" doesn't exist in its own unit list at
  all, so the sheet opened on a unit that matched nothing: the resolved
  unit silently fell back to a hardcoded `UNIT_DEFS.g` elsewhere in the
  component (and in `scaleFoodByUnit` itself), mislabeling the quantity
  shown (a 600ml drink's preset read "600g") and — a real data-integrity
  issue, not just a display one — storing the logged entry's own
  `unitId` as `"g"` for a serving that was actually measured in ml. (2)
  the auto-unit classifier handed every liquid tbsp/tsp unconditionally
  — correct for a pourable cooking liquid (oil, cream) or plain
  milk/juice/water (genuinely used by the tablespoon in recipes/coffee),
  wrong for an actual drink. A real scan of "Berry Ice" (a Powerade sports
  drink, 27 cal/100ml) showed "tbsps" as a selectable unit and even
  defaulted to it — 1 tbsp (15ml) selected instead of the real 600ml
  package size — nobody measures a sports drink in tablespoons.
- **Fix**: `FoodQuantitySheet` now defaults to `unitsFor(food)[0].id` —
  this food's own real base unit — never a hardcoded value; its own
  fallback (and `scaleFoodByUnit`'s) now falls back to `units[0]` instead
  of a hardcoded `UNIT_DEFS.g` too, so an invalid/stale unitId can no
  longer mislabel a liquid as grams. The auto-unit classifier now only
  gives tbsp/tsp to a liquid that's a pourable cooking ingredient
  (oil/cream/condiment) or plain milk/juice/water — an actual drink
  (recognised by name, or explicitly flagged `liquid: true` from a
  barcode scan's real package data with no matching name pattern at
  all, exactly "Berry Ice"'s case) only ever offers ml/cup/container.
  Also added a `servingSizeUnverified` flag (set when Open Food Facts has
  no real serving size for a scanned product) surfaced as a plain note on
  the confirm screen, per the "never guess a unit/serving size silently"
  requirement — the 100-unit placeholder used to keep the sheet usable
  was never distinguishable from a real figure read off the product.
- **Regression test**: `src/client/foodQuantityUnitDefault.test.jsx`
  (new) — a scanned drink defaults to ml (not tbsp/grams) at its real
  600ml package size, correctly labeled; never offers tbsp at all; still
  offers tbsp for a pourable cooking liquid (oil); recalculates correctly
  across a unit switch; shows the new "serving size not on the label"
  note only when flagged. `src/lib/foodDatabase.test.js` gained cases for
  the drink-vs-milk-vs-pourable-liquid distinction (including the exact
  "Berry Ice" scenario: explicitly flagged liquid, no name-pattern match)
  and for `scaleFoodByUnit`'s corrected fallback (asserting it resolves
  to `"ml"`/`"600ml"`, never `"g"`/`"600g"`, for an invalid unitId on a
  liquid food). Verified the default-unit case fails against the prior
  hardcoded `"g"`; the drink/tbsp cases fail against the prior
  liquid-always-gets-tbsp classifier; the fallback case fails against the
  prior hardcoded `UNIT_DEFS.g` fallback — all three with the exact
  pre-fix symptom reproduced (tbsp selected / mislabeled "g"). Restored
  and re-verified all passing; full suite (31 files, 147 tests) and
  production build both clean.
- **Manual verification**: scan a drink (water, soft drink, sports drink,
  juice) — the quantity sheet should default to ml at the real package
  size, with cup and (if the pack size is known) a container option, and
  never a tbsp option; scan or search a cooking oil/cream/milk — tbsp
  should still be offered; switch units on a logged item and confirm the
  macros scale correctly each time.
- **Date added**: 2026-10-10

### 49. "Macro Match" combo breakdown was permanently dead code — the backend never produced or passed it through
- **Root cause**: the client UI (`NutritionScreen`'s AI Nutrition Help,
  `ClientApp.jsx`) has had code ready for a while to render a suggestion's
  "contents" — a multi-item combo broken into its individual pieces (e.g.
  "Big Mac Meal" → Big Mac + fries + Coke listed separately, each with
  its own macros) — but the `nutritionAiHelp` Cloud Function behind it
  (`functions/index.js`) never actually asked the model for a `contents`
  field in its system prompt, and even if the model had produced one
  anyway, the response-mapping code reconstructed each suggestion with
  only `{name, calories, protein, carbs, fat}` — silently dropping it.
  That whole section of the confirm screen could never render.
- **Fix**: the system prompt now explicitly asks for an optional
  `contents` array on combo-type suggestions, with the model told to sum
  its own items to match the parent total. That's never trusted blind
  server-side though — a new `validatedContents()` (pulled into its own
  dependency-free `functions/nutritionContents.js` so it's unit-testable)
  re-sums the model's own breakdown and only lets it through when it
  genuinely reconciles with the parent suggestion's totals (a few
  calories/grams of per-item rounding slack tolerated, a real mismatch
  not) — per this app's explicit "Macro Match combos — their contents
  must still sum exactly to the parent total" requirement. A breakdown
  that fails this check is dropped entirely; the parent suggestion itself
  is never rejected over it.
- **Regression test**: `functions/nutritionContents.test.js` (new,
  11 cases) — a reconciling breakdown is kept; one missing an item (bad
  model arithmetic) is dropped; per-item rounding slack is tolerated, not
  flagged as a mismatch; an empty/missing/non-array `contents` returns no
  breakdown; an item with no name is filtered out (and correctly drops
  the whole breakdown once that changes what the remaining items sum to);
  `buildSuggestions` end-to-end cases cover a validated breakdown
  surviving, a bad one being omitted (not left as an empty/broken array)
  while the parent total stays intact, a plain single-item suggestion
  with no breakdown at all, the existing 3-suggestion cap, and missing/
  no-name filtering. Verified the three reconciliation-specific cases
  fail against an unvalidated pass-through stub (the equivalent of
  blindly trusting the model); restored and re-verified all 11 passing.
  Syntax-checked `functions/index.js` and `functions/nutritionContents.js`
  with `node --check` (no local Firebase install to actually run them
  against), and confirmed the wiring end-to-end with a direct Node
  `require()` smoke test. Full suite (33 files, 160 tests) and production
  build both clean.
- **Manual verification**: can't be fully exercised without a live
  Anthropic API call through the deployed Cloud Function — ask "Macro
  Match at [a restaurant with combo meals]" and open a suggestion's
  detail view; a combo should show a "WHAT'S IN IT" breakdown that visibly
  sums to the totals shown above it.
- **Date added**: 2026-10-10

### 50. Full database audit — several real entries were still misclassified liquid/solid
- **Context**: after shipping the automatic liquid/solid unit classifier
  (bug #43) on a spot-check basis, ran an actual full audit of every one
  of the ~1,330 entries in the static `FOOD_DATABASE` (not spot checks —
  every single entry's `isLiquidFood()` result dumped and reviewed, cross-
  checked against each entry's own real `defaultQty`/`per` to confirm
  whether it's genuinely weighed in grams or measured in ml) and found six
  real misclassifications plus a whole missed category.
- **Root cause / fix** (each confirmed against the entry's real
  `defaultQty`, not just its name):
  - `Tuna (canned, spring water)` (defaultQty 100g), `Water Chestnuts`
    (80g, a vegetable), `Oatmeal (cooked with water)` (250g, porridge
    eaten by the bowl) — all misclassified liquid because the plain
    "water" match didn't distinguish a food's own packaging/preparation
    description from an actual drink. Added `tuna`, `chestnuts?`,
    `oatmeal`/`porridge` to the solid-override list.
  - `Baking Soda` — misclassified liquid because "soda" alone matched (meant
    to catch soft drinks). Dropped the standalone "soda" alternative,
    kept it only inside "soft drink."
  - `Massel Chicken Style Stock Powder` (5g), `Musashi P30 High Protein
    Powder ... Milkshake` ×2 (45g), `Bulk Nutrients BCAA Energy Drink
    Mix` (10g) — all real powder scoops/sachets, misclassified liquid
    because "stock"/"milkshake"/"energy drink" matched regardless of
    "Powder"/"Mix" also being in the name. Added a blanket `/\bpowder\b/`
    check (before every other check — a dry powder is never a ready
    liquid, whatever else its name says) and a `(?!\s+mix)` negative
    lookahead on both "energy drink" and the new generic "drink" word
    below, for the one case ("...Mix") that doesn't literally say
    "powder."
  - **The missed category**: brand-name soft drinks and sports drinks
    (Coca-Cola, Fanta, Sprite, Gatorade, Powerade, a "Dirty Cola") and
    alcoholic drinks (Beer, Wine) contain none of "milk/juice/water" or
    any of the existing phrase list at all — every one of them was still
    defaulting to grams with no ml/cup/container options, the exact
    opposite-direction version of the same bug class. Added a
    `BEVERAGE_BRAND_RE` (cola, fanta, sprite, gatorade, powerade,
    lemonade, electrolyte, "sports drink," "fruit drink," a generic
    "drink," beer, wine, cider, champagne, prosecco, and spirits),
    checked after the solid-override list (same position as the existing
    plain milk/juice/water check) so it can't override a genuinely solid
    food that happens to share one of these words.
  - Caught and fixed one self-inflicted regression before it shipped: an
    editing mistake while adding the beverage-brand list accidentally
    deleted the `SPREAD_RE`/`CONDIMENT_RE` declarations entirely
    (`ReferenceError` on every run touching a condiment/spread), and the
    new generic "drink" word reclassified "BCAA Energy Drink Mix" back
    to liquid since its own `(?!\s+mix)` guard wasn't there yet — both
    caught by the regression tests below failing immediately, not by
    separately re-reading the diff.
- **Regression test**: `src/lib/foodDatabase.test.js` — a new
  "full-database audit fixes" suite (7 cases) covering every misfire
  above by name, including a guard against the alcohol/drink words
  false-matching inside an unrelated word ("rum" inside "Drumstick," "gin"
  inside a transliterated dish name — neither has a word boundary, so
  neither should match). A new "classifies real, specific database
  entries correctly by id" case pins the fix against the ACTUAL live
  `FOOD_DATABASE` entries by id (not a re-typed name fixture), so a
  future edit to either the classifier or these specific entries'
  real names is caught directly. Verified all 6 of the misclassification
  cases fail against the prior regex set (confirmed each one reproduces
  the exact original misfire); restored and re-verified all 27 cases in
  the file passing. Full suite (33 files, 167 tests) and production
  build both clean.
- **Manual verification**: search/log "Coca-Cola," "Beer," "Water
  Chestnuts," and "Baking Soda" — the drinks should default to ml with
  cup/container options and no grams option; the two solid foods should
  stay g/oz/lb/kg as normal, not switch to ml.
- **Date added**: 2026-10-10

### 51. Keyboard still genuinely covered the nutrition search, after the visualViewport fix (bug "keyboard genuinely covers search results") — real root cause was native, not web
- **Root cause**: the earlier web-side fix (tracking `window.visualViewport`
  in `BottomSheet`) assumed WKWebView resizes its viewport for the
  keyboard the way Safari does. Screen-recorded proof it still didn't
  work in production led to the real cause: WKWebView never resizes its
  own frame for the on-screen keyboard at all — it just lets the keyboard
  overlay on top of whatever was already rendered. `window.visualViewport`
  / `window.innerHeight` never change, so no amount of web-side JS
  (listening for a resize that never fires) could ever detect the
  keyboard. The visualViewport fix was correct logic with nothing to
  react to.
- **Fix**: `ios/ApexCoach/ViewController.swift` now observes
  `keyboardWillChangeFrameNotification` and shrinks the `WKWebView`'s own
  bottom anchor constraint by the keyboard's real height (converted into
  the view's own coordinate space, so this is correct under iPad
  split-screen multitasking and a floating/undocked keyboard too, not
  just a full-screen iPhone) — this makes the PAGE'S viewport genuinely
  resize, which is what the web-side visualViewport fix needed all along.
  **This requires a new native build shipped through TestFlight/App Store
  review to reach users — it cannot be deployed the way the web app's own
  fixes are** (no `npm run build` / Vercel deploy covers native Swift
  code). As an immediate, web-deployable mitigation that doesn't need to
  wait on that release: the "Scan barcode / Photo / Quick add" row in
  "Add to [meal]" now hides once a search query is typed, freeing real
  vertical space for results right away.
- **Regression test**: `src/client/nutritionSearchButtonsCollapse.test.jsx`
  (new) — the three buttons show before any search text, hide once text
  is entered, and reappear once it's cleared. The native Swift change has
  no automated test (no Swift toolchain in this environment to compile/
  run one against); verified by careful manual re-read of the file and
  the standard `keyboardWillChangeFrameNotification` API contract.
- **Manual verification — REQUIRES A NEW NATIVE BUILD, not just the next
  web deploy**: build and submit a new version through Xcode/TestFlight;
  only once that's installed, open "Add to [meal]," tap the search box,
  and confirm the results list is no longer covered by the keyboard. The
  web-only mitigation (buttons collapsing) can be checked immediately on
  the current build without waiting for that.
- **Date added**: 2026-10-10

---

### 52. Keyboard-safe scroll spacer added for nutrition search, as a further web-deployable mitigation for bug #51
- **Root cause**: bug #51's native fix (shrinking the WKWebView's own
  frame for the keyboard) requires a new App Store build to reach users.
  Button-row collapsing alone wasn't enough real extra room — users could
  still find a search result sitting right where the keyboard covers it.
- **Fix**: `ClientApp.jsx`'s "Add to [meal]" sheet now reserves a large
  (45vh) spacer below the results list whenever the search box has focus.
  This deliberately doesn't try to detect the keyboard's real height —
  WKWebView never reports it to the page at all — so a big, unconditional
  spacer guarantees a result can always be scrolled clear of wherever the
  keyboard actually sits, using the same plain scroll gesture already used
  for the list itself. Works immediately on the current web build, no
  native release required.
- **Regression test**: `src/client/nutritionKeyboardScrollSpacer.test.jsx`
  (new) — no spacer before the search box is focused, spacer appears on
  focus, spacer is removed on blur.
- **Manual verification**: open "Add to [meal]," tap the search box, and
  confirm there's extra scroll room below the results even while the
  on-screen keyboard is up.
- **Date added**: 2026-10-10

### 53. A scanned BBQ sauce defaulted to grams with no ml option — sauces/condiments weren't classified as liquid
- **Root cause**: `isLiquidFood()`/`autoUnitIds()` in `foodDatabase.js`
  never treated a sauce/condiment name (honey, sauce, syrup, jam,
  dressing, mayo, vinegar, gravy) as liquid at all — it stayed base-unit
  "g" with tbsp/tsp merely added as extra options, and a grams option
  always remained. A Coles barcode-scanned BBQ sauce showed g (selected)/
  tbsps/tsps with no ml option at all, defaulting to "20g".
- **Fix**: `isLiquidFood()` now classifies a non-dish-sized condiment name
  match as liquid (ml base unit, no grams option) — and this check runs
  *before*, and overrides, any explicit `food.liquid === false` a barcode
  scan's own package data might set, since the user's requirement is that
  ALL sauces/condiments are ml-based regardless of what OFF's weight
  labeling says. `autoUnitIds()`'s liquid branch gives condiments
  `["tbsp", "tsp"]` only (no cup) while oils/cream keep `["cup", "tbsp",
  "tsp"]`. A dish-sized item that merely contains a condiment word as an
  ingredient (e.g. "Honey Bar," reusing the existing dish-size/dish-word
  heuristic) is unaffected and keeps its normal weight units. Thick nut
  spreads (peanut butter, nutella) were split out of the condiment regex
  into their own `NUT_SPREAD_RE` and stay solid/grams like butter, since
  they're scooped, not poured.
- **Regression test**: `src/lib/foodDatabase.test.js` — new tests confirm
  a sauce/condiment (including one explicitly flagged `liquid: false`,
  modelling the exact barcode-scan case) comes out ml-based with no grams
  option, that peanut butter/nutella stay solid, and that existing
  dish-sized/spread/liquid classifications are unaffected. Full existing
  suite (28 prior tests in this file) still passes unchanged.
- **Manual verification**: scan or search a sauce (BBQ sauce, honey,
  mayo, dressing) in nutrition logging — confirm it shows ml as the
  default/selected unit alongside tbsp/tsp, with no grams option.
- **Date added**: 2026-10-10

### 54. Keyboard-safe scroll spacer generalized into the shared BottomSheet, instead of being re-implemented per Nutrition sheet
- **Root cause**: bug #52's keyboard-safe scroll spacer (a large spacer
  reserved below a sheet's content while a text input inside it has
  focus — see bug #51/#52 for why visualViewport-based detection doesn't
  work in this app's native WKWebView shell) was wired up as bespoke
  state (`searchFocused`) and a bespoke `<div>` directly inside
  `NutritionScreen`'s "Add to [meal]" sheet in `ClientApp.jsx`. Every
  *other* sheet with a text input — `QuickAddFoodSheet`,
  `CreateMealSheet`, `PhotoEstimateSheet`, `FoodQuantitySheet` (all in
  `NutritionFeatures.jsx`) — had no equivalent protection at all, despite
  each one having a text field followed by a Save/Add/Log button that the
  keyboard could just as easily cover. This duplication (one sheet fixed,
  siblings left exposed) is exactly the pattern behind the repeated
  keyboard/bottom-sheet regressions (#42, #44, #45, #51, #52): each fix
  solved one screen instead of the shared component underneath all of
  them.
- **Fix**: moved the mechanism into the shared `BottomSheet` component
  itself (`src/components/ui.jsx`) as a new opt-in `keyboardSafeScroll`
  prop. When passed, `BottomSheet` tracks focus/blur on its own panel
  (capture-phase listeners, so any input anywhere inside it is covered
  without each one needing its own handlers) and renders the same 45vh
  spacer whenever a text-entry element (`<input>` of a text-like type, or
  `<textarea>`) inside it has focus — clearing it on blur, unless focus
  moved straight to another text input in the same sheet (no flicker when
  tabbing between fields). Off by default, so every sheet that doesn't
  pass it — the large majority of `BottomSheet` usages across the whole
  app (workout sheets, messages, weigh-ins, account deletion, etc.) — is
  completely unaffected; this only changes behavior where it's explicitly
  opted into.
- **Migrated onto it** (one sheet at a time, each re-verified after):
  `NutritionScreen`'s "Add to [meal]" sheet (replacing its old bespoke
  `searchFocused` state/spacer with the new prop — same visible behavior,
  now generic), `QuickAddFoodSheet`, `CreateMealSheet`,
  `PhotoEstimateSheet`, and `FoodQuantitySheet`. Each of these sheets'
  own content, styling, and existing functionality is untouched — only
  the `<BottomSheet ...>` opening tag gained the new prop.
- **Regression test**: `src/components/bottomSheetKeyboardCover.test.jsx`
  — new component-level coverage (alongside the existing visualViewport
  shrink test in the same file): no spacer when `keyboardSafeScroll` is
  omitted even with a focused input; no spacer before any input is
  focused; spacer appears on focus and is removed on blur; a non-text
  focus target (e.g. a button) never triggers it; focus moving between
  two text inputs in the same sheet keeps the spacer up without
  flickering. `src/client/nutritionKeyboardScrollSpacer.test.jsx` (bug
  #52's original test, unmodified) still passes unchanged against the
  migrated implementation. Verified with the standard revert/fail/restore
  cycle: removing the spacer line from `BottomSheet` was confirmed to
  fail 3 of the new component tests plus the existing Nutrition test,
  then restoring brought all of them back to green.
- **Manual verification — native WKWebView unverified, same limitation as
  #51/#52**: no device/TestFlight build access from this environment.
  Once on a real device/build: open Quick Add, Create Meal, Log a Meal
  Photo, and the quantity sheet after a search/scan, focus each sheet's
  text field, and confirm the Save/Add/Log button can still be scrolled
  into view above the keyboard, the same way "Add to [meal]" already
  could after #52.
- **Date added**: 2026-10-10

### 55. Nutrition Overhaul audit — food/product images removed; three double-tap duplicate-record gaps found and fixed; units, barcode accuracy and keyboard/scroll-lock audited and confirmed already compliant
Full audit per the Nutrition Overhaul master prompt, on `claude/nutrition-overhaul`. Covers several of the prompt's sections; results below are grouped by what actually changed vs. what was inspected and found already correct (not re-implemented, per the standing rule against rebuilding working functionality).

- **Food/product images removed** (requirement: clean, information-first
  Nutrition layout). Two render sites found: a search result row's
  `f.imageUrl` thumbnail in `ClientApp.jsx`'s `NutritionScreen`, and a
  scanned product's catalog photo in `FoodQuantitySheet`
  (`NutritionFeatures.jsx`) — both removed; the latter now always shows
  the existing plain scan-icon placeholder instead of conditionally
  showing a photo. A client's own meal photo (`photoUrl` — the "Log a
  Meal Photo" feature, shown on saved meals/logged entries) was
  deliberately left untouched: that's a user-driven feature, not
  decorative product/catalog imagery, and removing it would delete
  working functionality the prompt doesn't ask for.
  **Regression test**: `src/client/nutritionNoFoodImages.test.jsx` (new)
  — confirms no `<img>` renders for a scanned product in
  `FoodQuantitySheet` even when `imageUrl` is present. Verified via
  revert/fail/restore: reverting the fix made both new tests fail
  (asserting the exact `<img>` the fix removes), restoring brought them
  back to green.
- **Units/measurement classification — audited, found already compliant,
  no code change needed.** `unitsFor()`'s base unit is always `g` or
  `ml` (never a hardcoded default of kg/lb/lbs/a generic container) for
  every entry in the static database and for barcode-scanned shapes;
  kg/lb/oz only ever appear as optional extra conversions further down a
  solid's unit list, never as the default/selected unit. Many entries
  already carry a specific piece-based `customUnit` (egg, bread slice,
  wrap, bagel, rice cake, carrot, tomato, avocado, garlic clove, etc.)
  rather than falling back to generic weight units. Locked in with a new
  **regression test** (`src/lib/foodDatabase.test.js`): every entry in
  `FOOD_DATABASE`, plus a barcode-scanned solid/liquid shape, never
  defaults to kg/lb/lbs.
- **Barcode scanning accuracy — audited, found already compliant, no
  code change needed.** `lookupBarcode()` fetches Open Food Facts'
  `/api/v2/product/<code>.json` by the *exact* scanned barcode (not a
  name/fuzzy search), which is what distinguishes flavours/variants/
  package sizes in the first place — different variants carry different
  real-world barcodes. `computeConfidence()`/`validateNutrition()`
  already produce a `verificationLevel` (VERIFIED/LIKELY/REVIEW/
  UNVERIFIED) and a `nutritionSuspect` flag surfaced in the UI (bug #41),
  with a `notFound` path when a product can't be confidently resolved
  rather than silently substituting one. 37 existing tests in
  `barcodeLookup.test.js` continue to pass unchanged.
- **Duplicate logging / duplicate records — 3 real gaps found and
  fixed.** `FoodQuantitySheet`'s ADD (bug class already fixed) and
  `ClientApp.jsx`'s `guardedAdd`/`addBusyRef` (covers saved meals/recent
  foods/photo "ADD TO TODAY") were already double-tap safe. Three sibling
  write paths were not: `QuickAddFoodSheet`'s "Log it" (creates a shared
  `customFoods` doc), `CreateMealSheet`'s "Save" (creates a saved-meal
  doc), and `PhotoEstimateSheet`'s "ALSO SAVE AS A MEAL" (same) each
  fired a synchronous, fire-and-forget Firestore write with no guard —
  a genuine double-tap before the sheet closed could create two
  duplicate library/saved-meal docs for the same food/meal. Fixed with
  the same plain-ref pattern `addBusyRef` already established
  (`submittingRef`, `savingRef`, `savingMealRef` — reset on each sheet
  open). **Regression test**:
  `src/client/nutritionDuplicateSubmitGuards.test.jsx` (new, 3 tests) —
  two rapid taps on each of the three buttons calls its handler exactly
  once. Verified via revert/fail/restore: reverting the three guards made
  all 3 tests fail (2 calls instead of 1), restoring brought them back
  to green.
- **Keyboard/background-scroll-lock — audited, confirmed unaffected.**
  `src/components/bodyScrollLockIOS.test.jsx` (pre-existing, app-wide)
  and the Phase 2 `keyboardSafeScroll`/visualViewport coverage both still
  pass unchanged; no duplicate keyboard-handling implementation was
  introduced.
- **Full suite**: 190 passed, 38 files passed, 1 file skipped
  (emulator-only, pre-existing), 59 tests skipped (pre-existing) — up
  from 184/184 before this audit, nothing newly broken. `npm run lint`:
  exit 0, no new warnings. `npm run build`: clean.
- **Not done in this pass, and why**: a live-data migration for existing
  Firestore documents (custom foods/saved meals/logged entries that may
  already hold an invalid unit or a true duplicate record) was not
  attempted — this environment has no access to the production Firestore
  database, and the master prompt itself says to stop and investigate
  rather than guess when a change risks corrupting data. The validation
  rules above apply going forward (new custom foods, new barcode scans,
  new saved meals); auditing and safely correcting *existing* stored
  data needs to happen with real database access, as a separate,
  explicitly-scoped pass.
- **Manual verification — unverified, no device/TestFlight access from
  this environment**: the no-images layout, double-tap guards, and
  barcode confidence UI should all be exercised on a real device/build —
  confirm Quick Add/Create Meal/Photo Meal no longer show a scanned
  product's photo, that rapid real double-taps on each affected button
  produce exactly one food/meal, and that an unverifiable barcode scan
  clearly prompts for manual entry rather than guessing.
- **Date added**: 2026-10-10

### 56. Nutrition Overhaul Section 7 audit — end-to-end workflow consistency traced; no new bugs found, closed a real end-to-end test-coverage gap
Traced the complete client journey described in the Nutrition Overhaul's
Section 7 through the actual code (not just re-confirming unit-level
fixes already in place): search → select a result → quantity sheet →
change serving/unit → confirm → log, across every entry path (search
results, saved meals matched by search, recent foods, quick add,
barcode, photo estimates, the meal-plan's "log this meal"), plus
edit/remove → daily totals, across date changes via the date-nav.

- **Finding: no new bugs.** Every path traced funnels through the same
  two choke points — `FoodQuantitySheet` (scaling) and
  `onAddFood(meal, food, dateKey)`/`onRemoveFood(meal, id, dateKey)`
  (the Firestore transaction) — using `viewDateKey` (the date actually
  being browsed, not always today) and `activeMeal` consistently. Saved
  meals log at a fixed serving by design (no quantity step) — the same
  on every path that reaches them (search match, My Meals list, meal
  plan), not an inconsistency. `removeFood`'s own transaction is already
  naturally idempotent against a duplicate remove call (a missing entry
  is a no-op, not an error). The three double-tap gaps found and fixed
  in bug #55 were the only genuine defects this journey had; nothing
  further surfaced here.
- **What was added instead: real end-to-end test coverage.** The
  existing suite verified each piece in isolation (scaling math, double-
  tap guards, unit classification) but had no test exercising the full
  NutritionScreen journey end-to-end with assertions on exactly what
  reaches `onAddFood`/`onRemoveFood`. New
  **`src/client/nutritionWorkflowConsistency.test.jsx`** (3 tests):
  searching "Chicken Breast," changing the quantity sheet to 300g, and
  confirming logs the correctly scaled macros (495 cal, not the
  unscaled 165) to the right meal and today's date; stepping back a day
  via the date-nav before logging sends that day's key, not today's;
  swiping to remove an entry on a non-today date calls `onRemoveFood`
  with that same date's key. Verified these are real checks, not
  trivially-passing scaffolding: temporarily routing the confirm handler
  through the wrong date variable made both date-sensitive tests fail
  (one assertion failure, one thrown reference error), then restoring
  brought all 3 back to green.
- **No application code changed in this pass** — only the new test
  file. `git status` after this pass shows exactly one new file.
- **Full suite**: 193 passed, 39 files passed, 1 file skipped
  (emulator-only, pre-existing), 59 tests skipped (pre-existing) — up
  from 190/190 before this pass. `npm run lint`: exit 0. `npm run
  build`: clean.
- **Manual verification — unverified, no device access from this
  environment**: the underlying logic is now covered end-to-end in
  jsdom, but real touch/swipe gestures, real Firestore round-trips, and
  real date-boundary behavior (midnight rollover, timezone edge cases)
  on an actual device remain unverified.
- **Date added**: 2026-10-10

### 57. Meat/fish individual portions offered kg as a unit; generic café coffees (espresso, latte, cappuccino, etc.) were missing from the food library
Two targeted fixes to `src/lib/foodDatabase.js`, each with new regression tests.

- **Meat/fish units, generalized to every individual solid food after user clarification — fixed once at the shared classifier, not per-record.** First pass added a meat/fish-specific `MEAT_RE` branch. The user clarified the actual ask: meat already defaulted to grams correctly — the bug is that `kg` was still *offered as an alternative* at all, and the same question applies to every other individual food (not just meat). Re-checked: `autoUnitIds()`'s generic-solid fallback offered `oz/lb/kg` for every weighed solid with no more specific unit set — a potato, a slice of cheese, a plate of butter chicken, exactly the same as meat. **`MEAT_RE` was removed** (it became fully redundant) and the fix generalized: every individual-solid branch (the generic fallback, and the two dish-sized spread/condiment branches) now returns `oz/lb` only — `kg` is never offered as a selectable unit for *any* individual food serving, full stop. `oz`/`lb` stay (genuinely used for a single portion — "an 8oz steak," "a pound of mince"). Fixed at the shared classifier `unitsFor()` feeds into, so it applies automatically to the static database, barcode-scanned foods, custom foods, and saved meals alike.
  - **Confirmed unrelated features are untouched**, per the user's explicit instruction: body-weight/lean-mass tracking (`CoachClientDetail.jsx`, `ProgressWidgets.jsx`), strength-challenge metrics ("kg lifted," `challengeMetrics.js`), the shopping list's own bulk/aggregated-across-a-week `kg` display (`shoppingList.js`), and a barcode product's own package-size parsing (`barcodeLookup.js`, interprets a label's "1kg" into grams — about reading the package, not offering a logging unit) — none of these go through `unitsFor()`/`autoUnitIds()`, and none were modified.
  - **No live data touched, none needed.** A logged food entry is a frozen snapshot (its own `cals`/`protein`/`carbs`/`fat`/`unitId` computed and stored at the moment it was logged) — it is never re-evaluated against `unitsFor()` again later, so this fix cannot retroactively change any already-logged entry's displayed macros, correct or not. The only thing this changes is which units are *offered* the next time someone opens a food's quantity sheet. A custom food or saved meal that explicitly set `units: ["kg"]` itself (not auto-detected) is unaffected, since that's deliberate curation, not the bug being fixed.
  - **Regression test** (`src/lib/foodDatabase.test.js`): a database-wide check that no entry in the full 1,338-item `FOOD_DATABASE` — any category, not just meat — ever offers `kg`, plus the same for a barcode-scanned/custom-food shape; confirms `scaleFoodByUnit` falls back safely to the gram base unit (not silently doing kg-scale math) when `"kg"` is requested for any solid food. Updated every pre-existing test that had asserted the old kg-present behavior (mince, potatoes, Weet-Bix, and the dish-sized Butter Chicken/Butter Beans/Caesar Salad/chips/Honey Bar cases) to the corrected, requested behavior — not weakened, they still assert real, specific macro math and unit presence, just against the corrected unit set. Verified via revert/fail/restore: reverting the fallback alone made 5 tests fail with the exact old (wrong) behavior; restoring brought all of them back to green.
- **7 new generic café coffee entries added** (`b21`–`b27`): Espresso / Short Black, Long Black / Americano, Latte, Cappuccino, Macchiato, Mocha, Iced Coffee. Distinct from the existing brand-specific McCafé/Jack's Cafe entries and from the existing generic `b03` "Coffee (black)"/`b04` "Coffee with Milk (flat white)" — no duplicate created for flat white, since `"flat white"` already matches `b04`'s name via the existing word-token search (`matchesSearch`), confirmed with a test. `liquid: true` is set explicitly on each (rather than relying only on `STRONG_LIQUID_RE`, which doesn't cover "espresso"/"long black"/"americano"/"iced coffee" at all) so they're correctly ml-based regardless of future regex edits — following the Nutrition Overhaul's own stated preference for explicit metadata over extending name-based regexes. Black coffee, milk-based coffee, and mocha/sweetened coffee are kept as separate entries with genuinely different calories/sugar, not copies of each other. Added a new `SHOT_COFFEE_RE` branch so a shot-sized black coffee (espresso, long black/Americano, macchiato — 30-60ml) doesn't offer "cup" as a unit, while the larger milk-based/sweetened coffees (latte, cappuccino, mocha, iced coffee) correctly do.
  - **Nutrition values are typical/representative**, matching the existing convention already used by `b03`/`b04`/`b14`-`b16` (unsourced but realistic composite figures, not a specific product's verified label) — not invented precise decimals.
  - **Milk-type variants and sugar/syrup add-ons were not built as a new feature.** The existing system's only mechanism for either is a separate loggable entry — it has no "swap milk type" or "add syrup" modifier. Skim-milk variants already exist for the branded McCafé entries; sugar/syrup can already be logged alongside any coffee via the existing "White Sugar," "Maple Syrup," and "Honey" entries. Building a new combinatorial variant system was judged out of scope for "add entries to the library" and risked unrelated scope creep.
  - **Regression test** (`src/lib/foodDatabase.test.js`): each of the 7 exists exactly once; each is findable by its own name and every listed synonym (plus confirms "flat white" already finds `b04`); each classifies as liquid/ml-based; shot-sized coffees never offer "cup" (or tbsp); the larger coffees do; black/milk-based/mocha have genuinely different (ascending) calories with mocha the only one carrying real sugar; serving-size scaling is mathematically correct (half a 280ml latte = half the calories; a 60ml double espresso shot = 2× a 30ml single); every entry logs successfully through the same `scaleFoodByUnit` path the rest of Nutrition logging uses, with non-zero calories. Also added a database-wide "no two entries share the same name" test. Verified via revert/fail/restore: removing the 7 entries made all 8 new coffee tests fail (one with a thrown error), restoring brought them back to green.
- **Full suite**: 204 passed, 39 files passed, 1 file skipped (emulator-only, pre-existing), 59 tests skipped (pre-existing) — up from 193/193. `npm run lint`: exit 0. `npm run build`: clean. Confirmed no duplicate ids or names anywhere in the 1,338-entry static database (new check run programmatically, not just the two new tests).
- **Manual verification — unverified, no device/live-Firestore access from this environment**: that a real barcode-scanned meat product (not just the static database) correctly loses the kg option; that the new coffee entries render, search, and log correctly in the actual app UI on a device; that no existing user's already-logged meat entries were affected (expected, per the "frozen snapshot" reasoning above, but not observable without real account data).
- **Date added**: 2026-10-10

### 58. Nutrition search results now show kcal only (no macro breakdown) — compact mobile layout
`NutritionScreen`'s "Add to [meal]" search results list showed each matched food/saved meal's full `P{protein} · C{carbs} · F{fat}` breakdown under its name, plus calories again as a separate right-aligned pill. Changed to match MyFitnessPal's compact mobile list: the name with only `"{cals} kcal"` directly underneath (for a saved meal, `"My Meals · {cals} kcal"`), the macro line and the separate kcal pill both removed.

- **Scoped to search results only, exactly as requested.** The recent-foods list (shown before any search text is typed — not a search *result*), the My Meals tab, the quantity sheet (`FoodQuantitySheet`), and the meal-detail sheet all keep their full macro breakdown untouched — only the two result rows inside the active-search branch (`matchedMeals`/`matchedFoods`) changed.
- **Search, keyboard, and logging behavior unchanged.** Typing still filters the same way; tapping a result still opens the same quantity sheet for that exact food with its full macros and quantity controls; tapping a matched saved meal still logs it the same way. No change to `matchesSearch`, `guardedAdd`, `FoodQuantitySheet`, or any Firestore write path — this is a display-only change to one list.
- **Regression test**: `src/client/nutritionSearchKcalOnly.test.jsx` (new, 4 tests) — a searched food shows only its kcal line, no P/C/F text; a matched saved meal shows `"My Meals · {cals} kcal"`, no P/C/F text; the recent-foods list (not a search result) still shows its full macro breakdown unchanged; search filtering and opening the quantity sheet on tap still work. Verified via revert/fail/restore: reverting the matchedFoods row back to showing macros made 2 of the 4 tests fail, restoring brought all 4 back to green.
- **Manual verification — unverified, no device access from this environment**: the actual rendered spacing/compactness on a real phone screen, and that this reads as intentionally "MyFitnessPal-compact" rather than merely sparse, are visual judgments that need a real device or at minimum a browser screenshot to confirm.
- **Date added**: 2026-10-10

---

### 59. Fuel IQ meal suggestions ignored the client's current time/meal period on every quick-prompt tap
`getLocalNutritionSuggestion` (`src/lib/restaurantNutrition.js`) is Fuel IQ's fully local, deterministic suggestion engine — no LLM call. Meal-period filtering only ever activated when the client's literal message *text* contained a keyword like "breakfast"/"lunch"/"dinner" (`wantsMealType`). None of the `QUICK_PROMPTS` buttons in `AiNutritionHelpCard` ("McDonald's", "Not sure what to eat", "KFC", etc.) contain those words except "High protein dinner", so tapping any restaurant or "Not sure what to eat" at any hour applied zero time-of-day filtering — e.g. McDonald's at 9am could suggest a Big Mac, and restaurant menus (`RESTAURANT_MENUS`) had no meal-period filtering applied at all, in either the brand-specific path or the Macro Match brand path.

- **Root cause**: (1) the brand-specific and Macro Match brand paths never filtered `RESTAURANT_MENUS` by meal period at all; (2) the general FITNESS_MEALS_AU path's `mealType` only came from `wantsMealType(message)`, which is `null` unless the message text itself names a meal period.
- **Fix**: added `currentMealPeriod()` (mirrors `ClientApp.jsx`'s existing `guessMealForNow()` hour thresholds — client-local time needs no extra handling since `new Date().getHours()` already reflects the device's own time zone) and a name-based `BREAKFAST_ITEM_RE`/`isBreakfastItem()`/`filterMenuByMealPeriod()` classifier for restaurant items (no meal-period metadata exists on `RESTAURANT_MENUS` entries, only allergy tags, so classification is by item name — same convention used elsewhere in this codebase). All three suggestion paths now resolve the effective meal period as `wantsMealType(message) || currentMealPeriod()`, so an explicit keyword in the message still wins, and the current time is only the fallback. `filterMenuByMealPeriod` falls back to the full menu whenever filtering would leave nothing (several chains — KFC, Taco Bell, Grill'd, Nando's, Domino's, fish and chips, 7-Eleven, APCO — have no breakfast items at all), matching the same graceful-fallback pattern already used for allergy filtering in this file. The existing calorie/protein ranking (`scoreItem`/`pickTop`, `macroMatchDistance`/`macroMatchSuggestions`) is untouched — only the pool it ranks over changed.
- **Regression test**: `src/lib/restaurantNutrition.test.js` (new, 7 tests, using `vi.useFakeTimers()`/`vi.setSystemTime()`) — McDonald's at a simulated 9am returns only breakfast-named items; McDonald's at 1pm and at 7pm both exclude breakfast-named items; KFC (no breakfast menu) still returns suggestions at 9am via the fallback; "Not sure what to eat" at 1pm returns results; an explicit "dinner" keyword in the message overrides the current-time default even at 9am; Macro Match at McDonald's at 9am only builds combos from breakfast items. Verified via revert/fail/restore: reverting `restaurantNutrition.js` to its pre-fix state made 5 of the 7 tests fail (the two that still passed were time-independent assertions), restoring the fix brought all 7 back to green.
- **Manual verification — unverified, no device access from this environment**: the actual on-device wall-clock behavior at each real meal time, and that the Fuel IQ UI (`AiNutritionHelpCard`) reads correctly with the new suggestions, are visual/runtime checks that need a real device or browser session to confirm; this was traced by hand through the full call chain (`AiNutritionHelpCard` → `nutritionAiHelp` in `AppContext.jsx` → `getLocalNutritionSuggestion`) instead.
- **Date added**: 2026-10-10

---

### 60. Barcode scan data reliability — missing macro fields silently defaulted to zero, no way to correct a flagged scan, corrections had nowhere reliable to persist
A full audit of the Open Food Facts barcode pipeline (`src/lib/barcodeLookup.js`, `BarcodeScanSheet`/`FoodQuantitySheet` in `src/client/NutritionFeatures.jsx`) found three real reliability gaps beyond the existing Atwater plausibility check (bug — see the "Protein Smoothie" `nutritionSuspect` banner, already working correctly): (1) a macro field Open Food Facts simply didn't report (e.g. carbs/fat never submitted for a product) was defaulted to `0` *before* validation ever saw it, so it read as a confirmed, verified zero instead of "unknown" — `computeConfidence`'s "Nutrition completeness" factor had the same bug, always counting 4/4 fields present since the null-check ran against the already-defaulted number. (2) When a found product's data failed validation (`nutritionSuspect`) or was missing fields, the confirm screen only said "close this and search or enter it manually instead" — there was no actual way to correct the flagged numbers and have that correction remembered for the same barcode; the only barcode-keyed manual-entry form (`addManual` in `BarcodeScanSheet`) is reachable solely from the "not found" status, which a *found-but-suspect* scan never reaches. (3) `findCustomFoodByBarcode` and the local cache check in `resolveCode` both picked whichever customFoods doc for a barcode happened to come back first (`.find()`/`docs[0]`) — since clients can only CREATE customFoods docs, never UPDATE them (`firestore.rules`), a correction would always land as a second doc sharing the same barcode, and which of the two a future scan used was undefined.
- **Root cause**: (1) `mapProductToFood` read `n["energy-kcal_100g"] || 0` etc. unconditionally, discarding the "was this field actually present" signal before `validateNutrition`/`computeConfidence` ever ran. (2) `FoodQuantitySheet` (the one place a flagged scan's data is actually shown) had no path back into barcode-keyed persistence at all — it's a presentational component with no Firestore access, by design, and the barcode-aware correction form only existed inside `BarcodeScanSheet`, which has already closed by the time this sheet opens. (3) `pickBestFoodForBarcode` (now added) didn't exist — nothing resolved "more than one doc, same barcode" deterministically.
- **Fix**: `mapProductToFood` now tracks `missingNutritionFields` from the RAW (un-defaulted) Open Food Facts values and validates against those raw values (`null` for a genuinely missing field, never a silent `0`) — `validateNutrition` already handled `null` correctly per-field, it just never received one. Also added a combined-mass check (`protein+carbs+fat` can't physically exceed ~100g per 100g/100ml) that catches an impossible panel even when its own (also-impossible) calorie figure happens to "reconcile" with it, and widened serving-size parsing (`parseServingGrams`) to read ml-labelled servings (previously g-only) and oz-labelled servings (converted internally to g — oz/lb/kg are still never exposed as a scanned item's serving *unit*, only grams/ml are). Every scanned result now carries a `source` snapshot (the exact macros Open Food Facts returned, set once and never modified) kept separate from the top-level fields a later correction changes. `FoodQuantitySheet` gained an optional `onSaveCorrection` prop: when a scan is flagged (`nutritionSuspect` or `missingNutritionFields`), it shows the flag plus an inline "Enter the correct numbers from the label" form (cals/protein/carbs/fat); submitting calls `onSaveCorrection`, which each of the three call sites (`ClientApp.jsx`'s `NutritionScreen`, `PhotoEstimateSheet`, `CreateMealSheet`) wires to `createFood(buildCorrectedFood(food, corrected))` — a plain CREATE (the only permission a client actually has on customFoods), never an update. `buildCorrectedFood` marks the result `verificationLevel: VERIFIED`, `correctedByUser: true` (same treatment the existing from-scratch manual-entry flow already gets), and carries `source` forward untouched. Added `pickBestFoodForBarcode` (prefers a `correctedByUser` doc over an uncorrected one; among same-status docs, the most recently `verifiedAt`) and wired it into both `findCustomFoodByBarcode` (AppContext.jsx, live Firestore query) and `resolveCode`'s local cache check (NutritionFeatures.jsx), replacing the previous arbitrary-order `docs[0]`/`.find()`.
- **Regression test**: `src/lib/barcodeLookup.test.js` (+14 tests) — `validateNutrition` flags a physically-impossible macro panel even when its calories self-reconcile, and names every missing field (not just the first); `pickBestFoodForBarcode` prefers a correction over the original regardless of list order, and falls back to most-recently-verified when neither is corrected; `buildCorrectedFood` applies typed values, marks VERIFIED/correctedByUser, clears the resolved flags, preserves `source` untouched, never carries the old Firestore id forward, and clamps garbage/negative input to zero; `lookupBarcode` flags exactly which fields are missing (not a false "4/4 present"), doesn't flag anything when all four are genuinely present, parses an ml-labelled serving size, and preserves the original macros under `source`. `src/client/foodQuantityScanCorrection.test.jsx` (new, 5 tests) — the correction button only appears when `onSaveCorrection` is provided and the scan is actually flagged; a missing-fields scan shows its own distinct banner, not the suspect-data one; submitting the form calls `onSaveCorrection` with the typed values and the sheet reflects a corrected `food` prop with the warning gone; cancelling restores the original banner without calling the handler. Verified via revert/fail/restore: reverting `barcodeLookup.js`/`AppContext.jsx` failed 13 of the 14 new barcodeLookup tests; reverting `NutritionFeatures.jsx` failed 4 of the 5 new component tests; restoring both brought everything back to green.
- **Regression check**: ran the full suite (234 tests, up from 215) and confirmed zero new ESLint warnings (147 before and after). The existing `nutritionSuspect`/`servingSizeUnverified` banners, the REVIEW-cap-when-implausible confidence logic, the stale-refresh/`correctedByUser` no-overwrite behaviour, and every other barcode/food-quantity test already in the suite (computeConfidence, detectBarcodeFormat, unit auto-detection, double-tap guards) still pass unchanged.
- **Manual verification — unverified, no device/network access from this environment**: scanning a real product whose Open Food Facts listing is genuinely incomplete or mismatched, confirming the correction form renders correctly on a real device, and confirming a correction actually wins on a second real scan of the same barcode, all need a live camera and a real Firestore project to verify end to end.
- **Date added**: 2026-10-10

---

### 61. Added the Australian Food Composition Database as a free fallback for generic (non-barcode) food search
APEX's "Add to [meal]" search only ever looked at two sources — the app's own hand-curated `FOOD_DATABASE` (~1,300 foods) and client/coach-saved `customFoods` — with no fallback when a client typed a real, common food that simply wasn't in either. No live nutrition API was wired in for generic (non-barcode) search at all; Open Food Facts (barcode-only) was the only external source in the app.

- **Source and scope**: Food Standards Australia New Zealand's Australian Food Composition Database (AFCD), Release 3 (Dec 2025) — a free, CC BY 2.5 AU–licensed government dataset (`foodstandards.gov.au`), not a live API (none exists; FSANZ publishes downloadable Excel files). The real "Food details" and "Nutrient profiles (per 100g)" files were downloaded and joined offline on each food's Public Food Key, restricted to genuinely generic whole-food groups (cereals/grains, fats & oils, fish & seafood, fruit, eggs, meat/poultry/game, milk products, dairy & meat alternatives, seeds & nuts, vegetables, legumes & pulses — explicitly excluding beverages, composite "dishes"/recipes, sauces, snack foods, confectionery, alcohol and infant formula, which either overlap what `FOOD_DATABASE`/`fitnessMealsAU.js` already cover or aren't "generic" foods), restricted to 'Analysed'/'Borrowed' derivation (the two most directly sourced categories — never 'Imputed'/'Estimated' placeholder data), and name-filtered to exclude anything reading as a prepared dish. Every row was run through the exact same Atwater energy-reconciliation check (`validateNutrition`, `barcodeLookup.js`) a live barcode scan gets; 7 of 182 candidate rows (mostly very-low-calorie leafy greens/herbs where the formula's tolerance is naturally too tight) failed it and were left out entirely rather than shipped as flagged entries. Result: `src/lib/afcdFoods.js`, 175 real, sourced, pre-validated entries — a deliberately small, practical subset, not a wholesale 1,600-food import, and not a duplicate of what `FOOD_DATABASE` already has (checked by exact-name diff against all 1,338 existing `FOOD_DATABASE` names before inclusion).
- **"Check APEX's existing verified food database first"**: AFCD is wired in as a strict fallback, not a parallel/competing source. In `NutritionScreen` (`ClientApp.jsx`), `matchedAfcd` is only computed — and the "FROM THE AUSTRALIAN FOOD COMPOSITION DATABASE" section only rendered — when both `matchedMeals` and `matchedFoods` (customFoods + `FOOD_DATABASE`, searched exactly as before, unchanged) come back empty for the typed query. A client's own saved correction for an AFCD food becomes a `customFoods` doc the same way a barcode correction does (see bug #60's `onSaveCorrection`/`buildCorrectedFood` — reused as-is, unmodified, since neither function is barcode-specific), so it's `matchedFoods` that finds it on a future search, not the AFCD fallback — a correction naturally "wins" and the bundled figure is never shown again for that food.
- **"Catch drinks logged in grams instead of mL"**: building the AFCD subset surfaced this exact failure mode for real — six plant-milk "beverage" products (oat/almond/rice/coconut beverage) and one commercial coconut water don't contain any word the app's existing `isLiquidFood()` name classifier (`foodDatabase.js`) recognises as a drink (no "milk", no strong-liquid phrase — just "beverage", which isn't in its regex list). These seven entries get an explicit `liquid: true` override (the same mechanism a barcode scan's own package-size data already uses to override the name heuristic), set deliberately rather than guessed; every other entry relies on the existing, already-audited classifier, same as every other food in the app.
- **"Never silently substitute a similar product"**: confirmed, not changed — grepped `barcodeLookup.js` and `NutritionFeatures.jsx` for any fuzzy/similarity-matching logic; none exists. A barcode lookup only ever resolves an exact scanned-code variant (`codeVariants`/`fetchFirstMatch`) or fails with `notFound`; it has never approximated a different product, so no code change was needed to satisfy this.
- **"Validate before logging / flag and let the client verify or correct"**: every AFCD search result is re-validated at render time (not just at data-build time) via the same `validateNutrition` barcode scans use, belt-and-braces against a future edit to `afcdFoods.js` slipping bad data past the one-time build filter; any failure attaches `nutritionSuspect`/`nutritionSuspectReason` exactly like a barcode scan. `FoodQuantitySheet`'s existing `nutritionSuspect`/`missingNutritionFields`/correction-form banners (bug #60) are unconditional on source, so an AFCD result gets the identical flag-and-correct treatment with zero new UI code; only the top info-card (icon/brand/"matched from..." copy) needed a one-line condition broadened from `food.fromBarcode` to `(food.fromBarcode || food.fromAFCD)`, with AFCD-specific copy ("From the Australian Food Composition Database") instead of the barcode-specific line.
- **No paid APIs, no new dependencies**: `afcdFoods.js` is a static bundled data file, same architecture as the existing `FOOD_DATABASE`/`fitnessMealsAU.js` — no new network call, no new package (`package.json`/`package-lock.json` untouched, confirmed via diff).
- **Regression test**: `src/lib/afcdFoods.test.js` (new, 7 tests) — the bundle is a practical, bounded size (50–500 entries); every entry reconciles under the Atwater check; no entry is missing a core macro; every `id`/`afcdKey` is unique; every entry carries `source: "AFCD"` and the standard per-100 shape; every "beverage" entry is actually classified liquid by `isLiquidFood()`; an ordinary solid isn't misclassified. `src/client/nutritionAfcdFallback.test.jsx` (new, 4 tests) — AFCD results appear when the local library has zero matches ("ostrich," only in `afcdFoods.js`, never in `FOOD_DATABASE` — this fixture was later updated from "emu" to "ostrich" by bug #62, once #62 added a real "Emu" entry to `FOOD_DATABASE` itself and the original fixture stopped demonstrating a fallback at all); AFCD results do NOT appear when a local match exists ("Chicken Breast," in `FOOD_DATABASE`); tapping an AFCD result opens the quantity sheet labelled as AFCD, not "barcode database"; a query matching neither source shows the existing "No matches" message with no AFCD section. Verified via revert/fail/restore: reverting `ClientApp.jsx`/`NutritionFeatures.jsx` failed 2 of the 4 new component tests (the other 2 were vacuously true against old behaviour — no AFCD section ever existed); restoring brought all 4 back to green.
- **Regression check**: ran the full suite (245 tests, up from 234) and confirmed zero new ESLint warnings (147 before and after, identical count) and zero `package.json`/`package-lock.json` changes. Existing search behaviour (customFoods/FOOD_DATABASE merge, kcal-only result display, saved-meals matching), the barcode pipeline (bug #60), and every other nutrition test in the suite pass unchanged.
- **Manual verification — unverified, no device access from this environment**: the actual rendered "FROM THE AUSTRALIAN FOOD COMPOSITION DATABASE" section on a real phone screen, and that AFCD search results read as clearly distinct from the client's own confirmed foods in practice, are visual judgments that need a real device or browser session to confirm.
- **Date added**: 2026-10-11

---

### 62. Expanded FOOD_DATABASE with 275 of the most commonly logged generic foods and drinks (meats, dairy, eggs, fruit, veg, grains, legumes, oils, sauces, snacks, coffee/tea/soft drinks/juices/sports & energy drinks)
APEX's primary, always-searched-first food library (`FOOD_DATABASE`, ~1,338 foods before this change) was missing a large number of real, commonly-logged Australian foods and drinks — specific meat cuts (silverside, scotch fillet, lamb loin chop), seafood species (bream, flathead, whiting, oysters, abalone), specialty grains (quinoa, amaranth, bulgur), legumes, nuts, oils, and — explicitly called out — several everyday drinks: plain tea, green tea, fruit-flavoured soft drink, tonic water, vegetable juice, and plain water had no entry at all; coffee itself was already well covered (espresso/long black/latte/cappuccino/macchiato/mocha/iced coffee, plus an awkwardly-named flat white) and wasn't duplicated.

- **Source**: same FSANZ Australian Food Composition Database Release 3 used for bug #61's fallback file (`afcdFoods.js`) — free, CC BY 2.5 AU, the real downloaded "Food details" + "Nutrient profiles" files, restricted to `'Analysed'`/`'Borrowed'` derivation only. This round additionally covered the non-alcoholic beverages, milk products, dairy/meat alternatives, savoury sauces & condiments, and snack foods groups (deliberately left out of #61's narrower "generic whole foods" scope, since this task explicitly asked for drinks/sauces/snacks).
- **Duplicate prevention — two passes, not one**: (1) exact-name match against all 1,338 existing `FOOD_DATABASE` names and all 175 `afcdFoods.js` names (847 candidates → 670 survived); this alone wasn't enough — AFCD's formal naming ("Oil, olive", "Milk, cow, fluid, skim") doesn't exact-match the app's simpler consumer names ("Olive Oil", "Milk (skim)"), so a second pass (2) checked shared-keyword overlap between each candidate and every existing name (requiring ≥2 meaningful shared words, or a short candidate being a full subset of an existing name — tuned to avoid flagging genuine prep-state differences like "raw" vs "cooked" as false duplicates) caught a further 307 alternate-name duplicates, including real near-misses this surfaced: "Oil, olive"/"Oil, canola"/"Oil, sesame"/"Oil, avocado" would have duplicated `FOOD_DATABASE`'s existing Olive/Canola/Sesame/Avocado Oil entries; "Almond beverage"/"Soy beverage"/"Oat beverage, fluid" would have duplicated the existing Almond/Soy/Oat Milk entries; "Sauce, tomato"/"Sauce, barbecue"/"Mayonnaise"/"Mustard" etc. would have duplicated the already-extensive existing sauce library. 363 candidates survived both passes.
- **Practical scope trim (363 → 286)**: meat (101 candidates) and vegetables (79) were disproportionately represented by AFCD's raw/cooked state-pairs and niche potato/pumpkin cultivars — cut down to one state per cut (preferring the cooked/prepared form, since that's what's actually eaten and logged) and 2 representative potato/pumpkin varieties instead of 6, with exotic game meats (goat, buffalo, camel, mutton, emu, quail, duck, pigeon) capped at 1–2 entries each rather than every raw/cooked permutation. Drinks (21 candidates in the beverages group) were hand-curated against the task's explicit list rather than bulk-imported — dry/powder ingredients (instant coffee powder, drinking-chocolate base, cordial concentrate) were excluded in favour of prepared-drink entries only, per "keep ingredients and prepared drinks separate"; branded colas/kombucha/plain mineral water were skipped as already-covered near-duplicates of existing Coca-Cola/Diet Soft Drink/Kombucha/Sparkling Water entries.
- **Final validation (286 → 275)**: every remaining candidate was run through the same Atwater energy-reconciliation check (`validateNutrition`, `barcodeLookup.js`) a live barcode scan gets; 11 failed (mostly very-low-calorie herbs/vegetables where the formula's tolerance is naturally too tight for genuine foods) and were excluded entirely rather than imported as flagged entries — consistent with "import only foods with sufficiently reliable nutritional data."
- **Units — never kg/lb/containers**: every entry is `per: 100` in g or ml, exactly like the rest of `FOOD_DATABASE`. `liquid: true`/`false` is set explicitly (never guessed) only on the handful of entries the shared `isLiquidFood()` name classifier (`foodDatabase.js`) wouldn't already get right on its own: two plain teas (no "tea" keyword exists in the classifier's regex list) and a cooked grain whose own AFCD description happens to contain the word "water" ("Bulgur, soaked in water...") but isn't a drink — explicitly forced solid so it isn't wrongly measured in ml. Every other entry (including every new drink) relies on the same already-audited classifier the rest of the app uses.
- **Naming**: AFCD's verbose comma-chain descriptions (`"Beetroot, fresh, purple, peeled, raw"`) were reformatted to match the app's existing `"Name (qualifiers)"` convention (`"Beetroot (fresh, purple, peeled, raw)"`), with branded-product names moved to a trailing `"(Brand)"` the same way existing branded entries already do it (e.g. `"Breakfast Cereal (puffed or popped rice, added vitamins & minerals) (Kellogg's Rice Bubbles)"`).
- **Provenance**: every new entry carries `source: "AFCD"` and `afcdKey` (the AFCD Public Food Key), same convention as `afcdFoods.js` — "where supported by the existing schema" is satisfied since `FOOD_DATABASE` entries are plain objects with no fixed field set; nothing downstream (search, `scaleFood`, `unitsFor`) reads or is affected by the extra fields.
- **"Never invent missing values"**: a candidate was only included if AFCD reported real, non-null calories/protein/carbs/fat for it — there was no fallback path that estimated or defaulted a missing field (unlike the barcode path's deliberate `missingNutritionFields` flagging for an *external, unverifiable* source, these are curated from a source where incompleteness just means "don't import that row").
- **Zero UI/architecture changes**: new entries are indistinguishable from any other `FOOD_DATABASE` food to the search/logging code — they flow through the exact same `allFoods` merge, `matchesSearch`, `FoodQuantitySheet`, `scaleFood`/`scaleFoodByUnit` every other food already uses. No new component, no new search path, no new correction flow (bug #60's existing `nutritionSuspect`/correction machinery already covers any future flagged case).
- **Regression test**: `src/lib/foodDatabaseAfcdExpansion.test.js` (new, 9 tests) — the expansion is in the requested 250–450 range (275); every entry reconciles under the Atwater check; no entry is missing a core macro; every `id` is unique across the whole `FOOD_DATABASE` (1,613 entries, not just the expansion); no new entry duplicates an existing `FOOD_DATABASE`/`afcdFoods.js` name; every entry carries `source`/`afcdKey` and the standard per-100 shape with no kg/lb units; both plain-tea entries are correctly classified liquid; the "soaked in water" bulgur is correctly classified solid; every requested drink category (tea, soft drink, juice, water) is actually present. `src/client/nutritionAfcdFallback.test.jsx`'s fixture was updated from "emu" to "ostrich" — this expansion added a real "Emu" entry to `FOOD_DATABASE`, which made the original "emu search falls back to AFCD" test fixture stop demonstrating a fallback at all (the whole point of this bug fix, working as intended, incidentally broke the OTHER bug's test fixture — "ostrich" still only exists in the `afcdFoods.js` fallback file, so the test still proves the same thing it always did). Verified via revert/fail/restore: reverting `foodDatabase.js` failed 4 of the 9 new tests (the other 5 were vacuously true against an empty expansion); restoring brought all 9 back to green.
- **Regression check**: ran the full suite (254 tests, up from 245) and confirmed zero new ESLint warnings (147 before and after, identical count), a clean production build, and zero `package.json`/`package-lock.json` changes (no new dependency).
- **Manual verification — unverified, no device access from this environment**: that the ~275 new foods read as natural, well-formed results in the real search UI on a phone, and that a coach reviewing the library doesn't find any of the renamed/reformatted names confusing, are judgments that need a real device or browser session to confirm.
- **Date added**: 2026-10-11

---

### 63. Full audit of the food database + barcode scanning workflow — scanned products never got the brand folded into their name, and two meal-building screens couldn't see scanned/corrected foods at all
A full trace of the shared food library and barcode pipeline (requested as a 4-point verification: existing-library brand naming, the full new-scan-to-shared-library workflow, data reliability, and search/availability) confirmed most of the pipeline already works correctly, and found two real gaps.

- **Already working, confirmed by tracing (not just reading) the code**: (1) `watch("customFoods", "customFoods")` in `AppContext.jsx` is a real, unscoped Firestore `onSnapshot` listener — every signed-in client/coach gets a newly-scanned product live, with no re-scan needed by anyone else. (2) `resolveCode()` in `BarcodeScanSheet` (`NutritionFeatures.jsx`) already does the full external-lookup → validate → save workflow correctly: it checks the local/Firestore cache first via `pickBestFoodForBarcode` (bug #60), falls back to an Open Food Facts lookup via `lookupBarcode`, re-checks `findCustomFoodByBarcode` immediately before `createFood()` to close the save race, and saves every successful lookup to `customFoods` regardless of confidence level — a flagged/`nutritionSuspect` scan is never silently marked verified, it's saved with its flag intact so `FoodQuantitySheet`'s existing correction banner (bug #60) can catch it. (3) The existing static `FOOD_DATABASE` entries are already well brand-labelled — an ~80-keyword brand audit (Arnott's, Kellogg's, Sanitarium, Western Star, Bega, etc.) found zero real gaps; the only bare names ("Vegemite", "Nutella") are correctly left generic since they're trademark-genericised terms, not missing a brand.
- **Gap found — brand dropped from scanned product names**: Open Food Facts reports a product's brand (`product.brands`) separately from its name (`product.product_name`), and OFF's crowd-sourced names frequently omit the brand even when it's populated (e.g. `"Tim Tam Original"` with `brands: "Arnott's"`). `matchesSearch` (`search.js`) and every results list in the app only ever look at `food.name`, never `food.brand` — so a scanned product couldn't be found by searching its brand, and read as generic everywhere it appeared, breaking the same "brand must be in the name" rule every static `FOOD_DATABASE` entry already follows.
- **Gap found — two meal-building screens never searched the shared library**: `CreateMealSheet` (used by clients saving a meal, and by coaches in `CoachMealLibrary.jsx`) and `PhotoEstimateSheet`'s ingredient picker only ever searched static `FOOD_DATABASE`, never `db.customFoods` — unlike `NutritionScreen`'s own search, which already merges both (`allFoods` in `ClientApp.jsx`). A barcode-discovered or coach-corrected product was fully shared and real-time everywhere else, but invisible in these two pickers — a client or coach trying to add that exact scanned product to a meal would find nothing and have to type it in from scratch, silently breaking the "other clients can find and log it through normal food search" guarantee.
- **Fix**: added `withBrandInName(name, brands)` to `barcodeLookup.js` — prepends the first (comma-split) OFF brand to the name unless the name already starts with it, used when computing `mapProductToFood`'s displayed/searched `name`; the raw, unmerged OFF name is preserved separately as `rawName` and stored under `source.name` for provenance, unchanged from bug #60's "never silently modify the original" convention. `CreateMealSheet` and `PhotoEstimateSheet` now destructure `db` from `useApp()` and apply the exact same `customFoods`-over-`FOOD_DATABASE` merge `NutritionScreen` already uses before filtering by search text.
- **Regression test**: `src/lib/barcodeLookup.test.js` (+4 tests, 2 existing assertions updated) — a brand reported separately gets merged into the name while `source.name` keeps the raw OFF name; a name already starting with its brand isn't double-prefixed; only the first of several comma-separated brands is used; a product with no brand at all is left unchanged. `src/client/nutritionCustomFoodsSearch.test.jsx` (new, 2 tests) — a `customFoods` entry is found by `CreateMealSheet`'s and `PhotoEstimateSheet`'s own ingredient search, not just `FOOD_DATABASE`. Verified via revert/fail/restore: reverting `barcodeLookup.js` failed the 2 updated assertions (old no-brand behaviour) as expected; reverting `NutritionFeatures.jsx` failed both new `nutritionCustomFoodsSearch.test.jsx` tests; restoring both brought everything back to green.
- **Regression check**: ran the full suite (260 tests, up from 254) and confirmed zero new ESLint warnings (147 before and after, identical count) and a clean production build. One unrelated test (`pushNotificationsNativeAware.test.jsx`) flaked once in a full-suite run; isolated re-runs against both the unmodified code and this change's code passed cleanly, confirming it's a pre-existing non-deterministic flake, not caused by this change. Existing barcode confidence/correction behaviour (bug #60) and the AFCD fallback (bug #61/#62) are unchanged — only the name string and the two search call sites changed.
- **Manual verification — unverified, no device/network access from this environment**: scanning a real product whose OFF listing splits brand from name this way, and confirming the merged name/search result renders correctly on a real device, need a live camera and a real Firestore project to verify end to end.
- **Date added**: 2026-10-11

---

### 64. Added 171 new branded Australian foods and drinks to FOOD_DATABASE (researched via parallel agents, each result independently validated before import)
A follow-up to bug #62's generic-food expansion: butter/margarine/oils, dairy (milk, cream, cheese, yoghurt, ice cream), sauces/dressings/baking ingredients, soft drinks/juices/flavoured milk/plant milk, nuts & branded snacks, bread/bakery, breakfast cereals, confectionery, biscuits, and deli/canned/frozen/protein/egg products — each a real, currently-sold branded product researched from a manufacturer page, major AU retailer listing, or FatSecret AU, with the brand in the name per this app's existing convention.

- **Source and verification**: 7 parallel research passes covering different food categories, each independently checking candidates against the live `FOOD_DATABASE`/`afcdFoods.js` name list before reporting a result, and explicitly dropping (not estimating) any candidate whose core macro fields (calories/protein/carbs/fat) couldn't be confirmed from a current, reliable AU source — the research turned up far fewer confirmed items than initially targeted specifically because of this "never invent a number" discipline (e.g. two Western Star butter variants and several Lean Cuisine/Weight Watchers meals were dropped outright for an unconfirmed protein or carb field; others were dropped for conflicting figures across sources, archived/outdated listings, or being too close to an existing entry to justify as a separate SKU).
- **Before import, every reported item was independently re-validated against this app's own rules, not just taken on the research's word**: re-checked against the full, current `FOOD_DATABASE` name list (not the research's own point-in-time snapshot) for exact-name duplicates; any row still carrying an unresolved ("?") core macro field was dropped (a "<1g" label value was kept as 0.5 — the label's own stated bound, not an invented estimate); every remaining candidate was run through the same Atwater energy-reconciliation check (`validateNutrition`, `barcodeLookup.js`) a live barcode scan gets, which caught and dropped one more item (a kombucha whose reported calories didn't reconcile with its own reported macros at very low absolute values); a few near-duplicate pack-size variants of the same product, and one item the research itself flagged as a possible duplicate of an existing generic entry, were left out rather than risk a double-up.
- **Units and liquid/solid classification — matched to existing app convention, not just the shared name classifier's default**: plain milk/juice/soft-drink/flavoured-milk entries are liquid (ml) as the shared classifier already gets right by name; condensed milk and milk-chocolate products get an explicit `liquid: false` override (their names contain "milk" but they're eaten by the spoon/piece, not poured — the same override pattern the AFCD expansion used for "Bulgur ... soaked in water"); oils and dairy creams are kept solid/grams, matching the app's own existing "Olive Oil"/"Canola Oil" and AFCD "Cream (thickened...)" entries (oils additionally get the same hand-added `tbsp`/`tsp` units those entries already use, since the shared `SPREAD_RE` unit helper only covers butter/margarine/ghee, not oil); a canned tuna product packed "in oil" is correctly left as a solid fish product, not reclassified as a pourable oil just because its name ends in "Oil". No entry offers kg/lb units, matching every other individual-serving food in the database.
- **Provenance**: every new entry carries `source: "BrandResearch2026"` and `sourceUrl` (the manufacturer/retailer/FatSecret page the figures came from), the same "where did this number come from" convention `afcdKey`/`source: "AFCD"` already established for bugs #61/#62.
- **Zero UI/architecture changes**: new entries are indistinguishable from any other `FOOD_DATABASE` food to the search/logging code — they flow through the exact same `allFoods` merge, `matchesSearch`, `FoodQuantitySheet`, `scaleFood`/`scaleFoodByUnit` every other food already uses.
- **Regression test**: `src/lib/foodDatabaseBrandExpansion2026.test.js` (new, 11 tests) — the batch size is in a sane range (100–250); every entry reconciles under the Atwater check; no entry is missing a core macro field; every `id` is unique across the whole `FOOD_DATABASE` (1,784 entries); no entry duplicates an existing name, and no two entries within this batch duplicate each other's name; every entry carries `source`/`sourceUrl` provenance and the standard per-100 shape with no kg/lb units; no entry is a bare single-word generic name; plain milk/juice/soft-drink entries classify liquid while condensed milk/milk chocolate correctly don't; oil and dairy cream classify solid/grams; a tuna product packed "in oil" isn't misclassified as a pourable oil. Verified via revert/fail/restore: temporarily injecting a duplicate name and an Atwater-failing macro panel directly into `FOOD_DATABASE` made exactly the 2 relevant tests fail (the within-batch duplicate check was itself added only after this first exposed that the cross-prior-source duplicate test alone doesn't catch a repeat within the same batch); removing the injected rows restored all 11 to green.
- **Regression check**: ran the full suite (271 tests, up from 260) and confirmed zero new ESLint warnings (147 before and after, identical count) and a clean production build. One unrelated test (`pushNotificationsNativeAware.test.jsx`) flaked in the full-suite run; an isolated re-run passed 5/5 cleanly, confirming the same pre-existing, non-deterministic flake already noted in bug #63 — not caused by this change. Existing search/logging behaviour, the barcode pipeline (bug #60), the AFCD fallback and expansion (bugs #61/#62), and every other nutrition test in the suite pass unchanged.
- **Manual verification — unverified, no device access from this environment**: that the ~171 new foods read as natural, well-formed results in the real search UI on a phone is a judgment that needs a real device or browser session to confirm.
- **Date added**: 2026-10-11

---

### 65. Removed food/product photos from the coach-side food library and the barcode-scan pipeline
The client side already had food/product catalog images removed in an earlier "Nutrition Overhaul" pass (`src/client/nutritionNoFoodImages.test.jsx`), but two places were missed: the coach's own custom-food library still had a full photo-upload feature, and a barcode scan still fetched and stored an Open Food Facts product image even though nothing rendered it.

- **Fix**: `src/coach/CoachFoodLibrary.jsx` — removed `imageUrl` from `emptyFood()`, the `handlePhoto`/`photoBusy`/`fileRef` upload machinery, the photo button/preview in `FoodSheet`, `imageUrl` from the saved `submit()` payload, and both `<img>`/icon-ternary thumbnails in the custom-foods and built-in-library grids (now always show the plain icon). Removed the now-unused `fileToCompressedDataUrl`/`Camera` imports and `useRef`. `src/lib/barcodeLookup.js`'s `mapProductToFood` no longer pulls `product.image_front_small_url`/`image_small_url`/`image_url` into the returned food object. Everything else — name, brand, barcode, calories/macros, serving size/units, the `source` provenance snapshot — is untouched; `source` never carried an image field to begin with.
- **Scope check**: confirmed `foodDatabase.js`/`afcdFoods.js` carry no image field (nothing to remove there), and that meal/meal-plan cover photos (`CoachMealLibrary.jsx`'s `masterMeals.photoUrl`) and a client's own logged-meal photo (`PhotoEstimateSheet`) are a distinct, intentionally-kept feature — explicitly out of scope, per the same distinction the earlier Nutrition Overhaul test already documents.
- **Regression check**: ran the two directly-affected test files (`barcodeLookup.test.js`, `nutritionNoFoodImages.test.jsx` — 57 tests) plus lint and build; all clean, zero new warnings (147 before and after), no change in behaviour for any other field.
- **Manual verification — unverified, no device access from this environment**: the coach-side library screen's visual layout with the photo button removed needs a real device or browser session to confirm it still reads cleanly.
- **Date added**: 2026-10-11

---

### 66. Nutrition bottom sheets reserved a flat, oversized blank gap below short search results whenever the keyboard was up
`BottomSheet`'s opt-in `keyboardSafeScroll` spacer (added to work around WKWebView never reporting the on-screen keyboard — see bug #42/#44/#45/#51/#52) reserved a flat `45vh` of empty scroll space the instant any text input inside the sheet gained focus, regardless of how little content there actually was. A search with a single short result (e.g. "Add to Lunch" → "Oak Iced Coffee") left a large, visibly empty gap below that one result and above the keyboard — nothing was actually hidden that needed scrolling into view, but the spacer reserved the same fixed block every time. This affects every nutrition sheet using `keyboardSafeScroll`: the client's main "Add to [meal]" search (`ClientApp.jsx`), `FoodQuantitySheet`, `QuickAddSheet`, `PhotoEstimateSheet`, and `CreateMealSheet` (`NutritionFeatures.jsx`).
- **Root cause**: the spacer's height was a static `"45vh"` string, rendered unconditionally once `keyboardSafeScroll` was active, with no awareness of whether the sheet's actual content was tall enough to need it.
- **Fix**: `useKeyboardSafeScroll` (`src/components/ui.jsx`) now measures the sheet's real content height (via a new `bodyContentRef` wrapping `children`, kept separate from the spacer itself to avoid a measurement feedback loop) against how much of the panel is visible above the same 45%-of-panel-height keyboard estimate used before. Short content that already fits above that estimate gets no spacer at all; content that reaches into the estimated keyboard area gets exactly enough spacer to clear it — never more than the old flat reserve, since the result is still capped at the same keyboard-height estimate as a ceiling. Recomputed after every render via `useLayoutEffect` (so it reacts to a search results list changing on every keystroke, with no separate "content changed" signal needed from each call site). A genuinely unmeasurable panel (0 `clientHeight` — not yet laid out) falls back to the original flat reserve rather than risk under-provisioning.
- **Regression test**: `src/components/bottomSheetKeyboardCover.test.jsx` (+2 tests; existing spacer-presence tests updated to query a new `data-testid="keyboard-safe-spacer"` marker instead of matching the old literal `"45vh"` style string, since the height is now a computed value) — real (stubbed) layout showing short content already fitting above the keyboard estimate renders no spacer; real layout showing content reaching into the keyboard estimate renders a spacer sized to just the overlap, strictly less than the full keyboard estimate. All 6 pre-existing spacer tests (enabled/disabled, focus/blur, non-text-entry targets, multi-input focus handoff) continue to pass unchanged — the focus-tracking behavior that decides *whether* a spacer can appear at all is untouched, only how large it is when it does.
- **Regression check**: ran the directly-affected test files (`bottomSheetKeyboardCover.test.jsx`, `nutritionNoFoodImages.test.jsx`, `nutritionCustomFoodsSearch.test.jsx` — 14 tests) plus lint and build; build clean, no behavioural change to any other sheet feature. Lint picked up 2 new `set-state-in-effect` warnings (149 vs. 147 baseline) from the new measurement effect — the same warning class already present repeatedly throughout this exact file (the sheet's own open/close transition effect a few lines below triggers the identical warning), not a new pattern introduced to the codebase.
- **Manual verification — unverified, no device access from this environment**: the real keyboard-height estimate (45% of panel height) and the actual gap/no-gap behaviour on a real iPhone with the on-screen keyboard open need a real device or browser session to confirm.
- **Date added**: 2026-10-11
- **REVERTED (2026-10-11, same day)**: the dynamic-sizing fix above shipped and immediately caused a live crash in the nutrition area — a client hit a React error-boundary screen ("Something went wrong") on load. Root cause: the `useLayoutEffect` driving the measurement had no dependency array and called `setState` unconditionally on every single render while the spacer was active, with no guard against the measured values genuinely differing from render to render (e.g. while `window.visualViewport`/`viewport.height` is actively changing as the real keyboard animates open or closed, which this exact sheet already tracks and re-renders on). That combination is React's textbook recipe for a render loop ("Maximum update depth exceeded"), and this environment has no physical device to exercise the real keyboard-open/close path, so it was never caught before shipping. **Fix**: reverted `useKeyboardSafeScroll`/`BottomSheet` entirely back to the original flat-`45vh`-reserve behaviour (the version proven stable in production before this bug's fix), removing the measurement effect, the `bodyContentRef` wrapper, and the two dynamic-sizing tests that depended on it; kept only the harmless `data-testid="keyboard-safe-spacer"` marker (a test-selector improvement, not a behavioural change) on the restored flat spacer. The original dead-gap complaint (bug #66's premise) is real and still open — any future fix for it must be verified against real keyboard-resize behaviour (a physical device or an equivalent browser session with real layout), not device-less jsdom stubs alone, before it ships again. Verified via the full suite (281/281 passing, no flake), lint back to the 147-warning baseline (the 2 extra from the reverted effect are gone), and a clean build.

---

### 67. Added 280 more verified Australian foods to FOOD_DATABASE (7-Eleven, takeaway, frozen, deli/cheese/yoghurt, cereals/sauces/snacks, confectionery, branded drinks, chain/generic-dish gaps)
A second, broader round covering categories the first branded-expansion round (bug #64) didn't reach: 7-Eleven menu items, Australian takeaway shop foods (dim sims, Chiko Rolls, Dagwood dogs, bakery pies/pasties), frozen savoury foods (pizzas, nuggets, chips, hash browns, crumbed fish, burger patties, dumplings), frozen ready meals and ice cream, deli meats/cheese/yoghurt, cereals/sauces/snacks/packaged meals, branded confectionery/chocolate/lollies, branded drinks (soft drinks, energy, sports, cordial, bottled water), and a final pass on AU fast-food chain gaps (Zambrero, Boost Juice) plus commonly-logged homemade Asian/Mediterranean/Australian dishes and generic foods still missing from the database.

- **Research and verification**: 10 parallel research passes (7 by category, 3 supplementary passes added specifically to close the gap toward the requested 300–450 range after the first 7 came back thin — confectionery, branded drinks, and generic AU/Asian/Mediterranean staples, all categories known to have unusually complete, reliably-documented real nutrition data). 294 candidates were parsed from the combined research output; cross-checked against the full, current `FOOD_DATABASE` (not a stale snapshot) for exact-name duplicates, then run through the same Atwater energy-reconciliation check (`validateNutrition`, `barcodeLookup.js`) a live barcode scan gets. This caught and correctly dropped: 3 exact duplicates of already-present Kellogg's cereals, 1 item with an internally inconsistent label figure, and — notably — **every single Guzman y Gomez item researched** (the sourcing agent's per-100g conversion math was wrong on every one of 10 items, overstating protein+carbs+fat far past 100g per 100g/ml), correctly caught and dropped wholesale rather than trusted. **280 items passed verification and were added.**
- **Official naming**: every item uses the exact manufacturer/retailer-published product name including brand, variant and pack size where available (e.g. "Mother Energy Drink Lava Guava", "Bundaberg Non-Alcoholic Ginger Beer", "Guzman y Gomez" items dropped rather than kept under a guessed name once their numbers failed verification). Generic (non-branded) items — takeaway-shop staples, homemade dishes — use the standard recognised Australian name matching the convention already used throughout the database.
- **Units and liquid/solid classification**: handled the same way as the first round — checked each item against the shared name-based classifier (`isLiquidFood`) and only added an explicit override where the name would otherwise be misread: chocolate/confectionery containing "milk" (Cadbury Dairy Milk Caramello Koala, Lindt Lindor Milk Mini Cornet) correctly stays solid/grams; a ham product named "Primo Champagne Leg Ham" (the word "Champagne" alone triggers the shared beverage-word regex) correctly stays solid; an icy-pole product named "...Lemonade Icy Twist" correctly stays solid (it's a frozen confection on a stick, not a pourable drink, despite "lemonade" in its name); frozen potato chips named "...Beer Batter..." correctly stay solid. Conversely, a long list of soft-drink/cordial/energy-drink brand names the shared classifier doesn't recognise by name alone (Kirks, Solo, Bundaberg, Schweppes, Sunkist, Tru Blu, Mother, Red Bull, Mount Franklin, Pump, 7-Eleven Coffee Melt) were explicitly confirmed liquid. No entry offers kg/lb units.
- **Existing-entry naming (requirement to correct generic/incomplete existing names where possible)**: no further corrections were identified this round — consistent with the earlier manual review of all 233 ambiguous existing entries (see the "Yes but follow rules" / brand-sweep exchange), which already found the existing library's naming fully compliant.
- **Searchability (client food logger, Fuel IQ)**: these entries flow through the exact same `FOOD_DATABASE`/`customFoods` merge every other food in the app already uses (`NutritionScreen`, `CreateMealSheet`, `PhotoEstimateSheet`, `CoachFoodLibrary`, `CoachMealLibrary`) — immediately searchable and usable client- and coach-side with zero additional wiring. **Fuel IQ is a separate feature** (`restaurantNutrition.js`'s suggestion engine, backed by its own curated `fitnessMealsAU.js`/`RESTAURANT_MENUS` dataset) that has never searched `FOOD_DATABASE` or `customFoods` at all — this is a pre-existing architectural boundary, not a gap this change introduced or was asked to rebuild; Fuel IQ's suggestions and the general food search are intentionally two different systems.
- **No images added**: confirmed — none of these entries carry an `imageUrl`/`photoUrl` field, consistent with bug #65's removal of food/product photos from the library.
- **Regression test**: `src/lib/foodDatabaseBrandExpansion2026b.test.js` (new, 10 tests) — batch size in a sane range (200–350); every entry reconciles under the Atwater check; no entry missing a core macro; every `id` unique across the whole `FOOD_DATABASE` (2,064 entries); no entry duplicates an existing name, and no two entries within this batch duplicate each other; every entry carries `source` provenance and the standard per-100 shape with no kg/lb units; branded drinks the shared classifier wouldn't catch by name alone are liquid; a "milk"-named chocolate product and a "lemonade"-named icy pole are correctly not liquid. Verified via revert/fail/restore: injecting a duplicate name and an Atwater-failing macro panel directly into `FOOD_DATABASE` failed exactly the 2 relevant tests; removing the injected rows restored all 10 to green.
- **Regression check**: ran the full suite (283 tests, up from 271 — clean pass, no flake this run) and confirmed zero new ESLint warnings beyond the already-merged keyboard-spacer fix's baseline (149 before and after this change) and a clean production build.
- **Manual verification — unverified, no device access from this environment**: that the ~280 new foods read as natural, well-formed results in the real search UI on a phone is a judgment that needs a real device or browser session to confirm.
- **Date added**: 2026-10-11

---

### 68. Weekly QA audit — `addWater` could silently corrupt a day's water total to `NaN` on an older nutrition doc
`ClientApp.jsx`'s `addWater` did `base.water + liters` with no guard on `base.water` being `undefined` — unlike the sibling `addFood`/`removeFood` functions a few lines above, which explicitly guard every field (`base.calories || 0`, etc.) specifically because an older `nutritionLogs` doc can predate a field. A nutrition doc saved before `water` tracking existed (or missing the field for any other reason) would hit `undefined + liters === NaN`, and since `NaN + x` is always `NaN`, every subsequent water log for that date would silently stay `NaN` forever once written back to Firestore.
- **Fix**: `src/client/ClientApp.jsx`'s `addWater` now reads `(base.water || 0) + liters`, matching the guard convention already used by every other field on this doc.
- **Regression check**: hand-verified (`undefined + 0.5 = NaN` before the fix; `(0 || 0) + 0.5 = 0.5` after) — a full React test would need `ClientApp` rendered against a mocked Firestore doc deliberately missing the `water` field, which wasn't worth the scaffolding for a one-line, pattern-matched defensive fix; ran the full suite (284 tests) to confirm no regression elsewhere.
- **Date added**: 2026-10-11

### 69. Weekly QA audit — logging ascending/repeated sets in one session could flag every set a PR instead of just the session's actual best
`handleBlurKg`'s PR check (`src/client/ClientApp.jsx`) only ever compared a newly-completed set against `getBestEverStats(logsForClient, ...)` — the client's **saved** historical logs — with no awareness of other sets already completed earlier in the same, still-unsaved active session. Hand-verified: logging three working sets at the same weight/reps (a completely ordinary "3×5 @ 85kg") got all three flagged `isPR: true`, not just the first; since `isPR` is saved verbatim when a workout finishes, this permanently inflated the finished-workout PR tally and the 30-day "PRs" count on the Performance Timeline, not just a live-UI artifact.
- **Fix**: `handleBlurKg` now also computes the best score/weight among every other already-completed set of the same exercise in the current session (`activeLog`), and compares the new set against `Math.max(savedBest, sessionBest)` instead of the saved best alone — so only the genuine best-so-far set (saved history and this session combined) earns the PR flag.
- **Regression test**: `src/client/workoutSessionPRDetection.test.jsx` (new, 3 tests) — three identical sets in one session only flag the first; the very first set ever logged for an exercise (no history, no session sets yet) still flags as a PR; a lighter set that comes after a heavier one in the same session doesn't re-flag. Verified via revert/fail/restore: reverting to the old saved-history-only comparison failed 2 of the 3 tests (the identical-sets case and the lighter-after-heavier case — exactly the scenarios the old code got wrong); restoring brought all 3 back to green.
- **Regression check**: ran the full suite (284 tests) — all pass, no flake. Zero new ESLint warnings (147 before and after).
- **Date added**: 2026-10-11

### 70. Weekly QA audit — a coach signing out never deregistered the device's push token, unlike the client app
`CoachShell.jsx`'s `doLogout` only called `logout()` and navigated — it never cleared the device's push registration, unlike `ClientApp.jsx`'s `doLogout`, which explicitly calls `disablePush` and clears `localStorage.pushToken_{uid}` with the stated reason: *"left registered, the NEXT client who signs in on this same device would keep this one's push notifications arriving here too."* The identical risk applies to a coach: signing out left their push token live, so the next person to sign in on that device (another coach, or a client, on a shared/office device) would keep receiving the signed-out coach's push notifications indefinitely.
- **Fix**: `src/coach/CoachShell.jsx`'s `doLogout` now mirrors the client app's exact pattern — looks up `pushToken_{currentUser.id}`, calls `disablePush` (best-effort, logout proceeds even if it fails), clears the localStorage key, then signs out and navigates, same ordering as before.
- **Regression check**: ran the full suite (284 tests) and lint (147 warnings, unchanged) — no existing test exercised `CoachShell`'s logout push-token path (same gap as the one this fix closes), so this was verified by direct code comparison against the already-correct client-side implementation rather than a new automated test; flagged under manual verification below for an end-to-end check with a live FCM token.
- **Manual verification — unverified, no device access from this environment**: confirming a real device genuinely stops receiving push notifications after a coach signs out needs a live FCM token and a physical/simulated device.
- **Date added**: 2026-10-11

### 71. Weekly QA audit — account deletion left message attachments (images/videos/PDFs) orphaned in Storage
`functions/index.js`'s `deleteMyAccount` deletes every Firestore doc referencing a client's data, including `messages`, but never touched the actual files those messages can attach — images/videos/PDFs are uploaded to `messageImages/{clientId}/...`, `messageVideos/{clientId}/...`, `messageDocs/{clientId}/...` in Firebase Storage (`src/lib/storage.js`), keyed by the client's own uid, and nothing ever deleted them. The account-deletion confirmation copy (`DeleteAccountSheet`'s warning, `ClientApp.jsx`) tells the client their data — explicitly including "messages" — is removed; any file they or their coach ever attached to a chat message was left behind indefinitely under a folder still named by the now-deleted account.
- **Fix**: `functions/index.js`'s `deleteMyAccount` now also deletes everything under each of the three attachment prefixes for the deleted client's uid via the Admin Storage SDK (`storageBucket.deleteFiles({ prefix })`), best-effort (a Storage cleanup failure doesn't block the account deletion itself, consistent with the rest of this function's error handling).
- **Regression check**: `node -c` confirms the modified Cloud Function file is syntactically valid; `firebase-admin` is already pinned to v12.6.0 in `functions/package.json`, which supports the `firebase-admin/storage` modular import used here. No existing test suite covers this Cloud Function (it requires Admin SDK/Storage emulation this environment doesn't have set up) — flagged under manual verification below rather than asserted as test-covered.
- **Manual verification — unverified, no Firebase emulator/live project access from this environment**: deploying this function and deleting a test client account with a real message attachment, then confirming the Storage files are actually gone, needs a live Firebase project or the Storage emulator.
- **Date added**: 2026-10-11

### 72. Video message upload limit raised 75MB → 200MB (client-side validation + Storage rules reference)
A client sending a ~90-second phone-camera form-check video was blocked by the 75MB cap (`MAX_VIDEO_BYTES` in `src/lib/storage.js`), which was too tight for that use case. The cap is enforced in two places that both have to agree: `src/lib/storage.js`'s `MAX_VIDEO_BYTES` constant (client-side pre-upload check, and the source of every "please keep it under ___MB" error string, which derives from the constant rather than a hardcoded number) and the matching `request.resource.size` check in the `messageVideos/{clientId}/{fileName}` block of `STORAGE_RULES.txt`'s actual Storage security rules.
- **Fix**: raised both to 200MB — `MAX_VIDEO_BYTES = 200 * 1024 * 1024` in `src/lib/storage.js`, and the `messageVideos` rule's `request.resource.size < 200 * 1024 * 1024` plus its human-readable description in `STORAGE_RULES.txt`. No other limit (image, PDF, login-background video) was touched — those are separate, unrelated caps.
- **Regression check**: `npm run build` succeeds; `npx vitest run src/coach/CoachMessages.test.jsx` (the only existing test exercising message sending) passes unchanged; confirmed via grep that no other "75" reference to this limit remained in either file.
- **⚠️ Manual action required — this is NOT automatically deployed**: unlike `firestore.rules`, Firebase Storage rules are not wired into this repo's CI/build pipeline — `STORAGE_RULES.txt` is a human-maintained reference doc only. The actual live limit stays at 75MB until the contents of `STORAGE_RULES.txt`'s RULES section are manually re-pasted into the Firebase Console's Storage → Rules tab and published (see that file's own STEP 1 instructions). Until that manual step is done, the client-side check will allow files up to 200MB to attempt upload, and the live Storage rules will still reject anything over 75MB with a `storage/unauthorized` error.
- **Date added**: 2026-10-12

### 73. Messages' Firestore rule didn't verify the self-declared `from` field matched the authenticated writer's actual role
Investigating a report of unexpected messages appearing in a coach/client thread, the `messages/{id}` `allow create` rule in `firestore.rules` was found to only verify *whose thread* a write landed in (via `clientId`), never *who the signed-in writer actually was* relative to the `from` field it set on the message. A signed-in client could write into their own thread (already correctly scoped by `ownsClientId(clientId)`) while setting `from: "coach"`, and the app would render it identically to a genuine coach message — and the reverse (a coach spoofing `from: "client"`) was equally unenforced. This is a real, confirmed security gap; it was NOT established as the cause of the specific incident reported (three "Hey" messages followed by an unrelated photo) — no app-level bug was found that would fabricate that specific content, and this is reported as an unproven-but-real hardening fix, not a confirmed root cause.
- **Fix**: `firestore.rules`'s `messages/{id}` `allow create` now also requires the self-declared `from` to match the authenticated role: `(isCoach() && request.resource.data.from == "coach") || (ownsClientId(request.resource.data.clientId) && request.resource.data.from == "client")`. The parallel `workoutComments` rule has the same `from`-field pattern and the same gap, but was deliberately left untouched — out of scope for this targeted fix.
- **Regression check**: added 4 new tests to `src/lib/firestoreRules.rules.test.js` (client spoofing `from:"coach"` fails; client as themselves succeeds; coach spoofing `from:"client"` fails; coach as themselves succeeds) and updated the pre-existing shared `messages`/`workoutComments` write test's payload to include a realistic `from` field. Ran the full rules suite against the real Firestore emulator (`npm run test:rules`): all 63 tests pass, including the 4 new ones.
- **Date added**: 2026-10-12

### 74. Serving-size system audit — metric-only enforcement, coach custom-food gap, duplicated food-merge logic, unvalidated future saves
A full audit of the serving-size/unit-conversion system (triggered by a request to make food logging consistent with Australian/metric-only measurements) found the core system (`UNIT_DEFS`/`isLiquidFood`/`autoUnitIds`/`unitsFor`/`scaleFood`/`scaleFoodByUnit` in `src/lib/foodDatabase.js`) already mature, centralized, and heavily tested — but found four real, confirmed gaps:
1. **Imperial units were still being offered.** Despite the app being Australian/metric-only, `autoUnitIds()` deliberately offered `oz`/`lb` for every weighed solid, spread, and condiment (a prior "Nutrition Overhaul" decision, now superseded by this explicit requirement). `UNIT_DEFS.oz`/`lb` conversion factors are kept (so a food historically logged in oz/lb before this change doesn't error if ever re-touched), but neither is offered as a selectable unit any more, for any food, from any source — confirmed with a new database-wide sanity test.
2. **Coach's "Add Food" form had no serving-size field at all** (`CoachFoodLibrary.jsx`'s `FoodSheet`) — only name/cals/protein/carbs/fat, relying on the coach manually typing the serving size into the food's name as a convention. Every coach-added food silently saved as "per 100g" regardless of what the coach actually measured. Fixed with a real "SERVING SIZE THE MACROS BELOW ARE FOR (grams)" field, saved as `per`/`defaultQty`, mirroring the client-side Quick Add sheet's existing field exactly.
3. **The `customFoods` + `FOOD_DATABASE` "all foods" merge was duplicated identically at 3 separate call sites** (the main food log, `CreateMealSheet`, `PhotoEstimateSheet`) with no shared source of truth — risked silently drifting apart. Centralized into one `getAllFoods(customFoods)` export in `foodDatabase.js`, all 3 sites now call it.
4. **No validation gate existed before a custom/barcode/future-AI food was actually saved** — a malformed or hostile `per`/`defaultQty`/`units`/`customUnit` from any source (a coach typo, a barcode import, a future AI suggestion) would have been written to the shared `customFoods` library as-is. Added `sanitizeFoodUnits(data)` — strips any imperial/kg unit, drops a `customUnit` with no verified positive gram weight (never inventing one), and clamps an invalid `per`/`defaultQty` to the safe 100g/ml metric fallback. Wired into both `createFood()` and `updateFood()` in `AppContext.jsx` — the one choke point every custom food, Quick Add, and barcode-discovered/corrected food already goes through, so this applies automatically to every future food without any caller needing to validate its own input.
- **Database audit performed**: a mechanical, automated structural check (not a hand-typed/invented one) ran `unitsFor()` against every one of the 2064 `FOOD_DATABASE` entries and all 175 `AFCD_FOODS` entries, checking for a non-empty unit list, a positive `per`/`defaultQty`/`customUnit.grams`, and no imperial/kg unit ever offered — **zero issues found in either static database**. This does NOT constitute coverage of the dynamic, unbounded `customFoods` Firestore collection (coach-added/barcode-discovered/client-quick-added entries created before this change) — those were not and could not be individually hand-audited for correctness from this environment; `sanitizeFoodUnits` only guards future writes to that collection, it does not retroactively fix any already-saved entry with a stale imperial unit or implausible `per` value.
- **Fuel IQ / Macro Match**: investigated and found to intentionally have no serving-size/unit concept at all — a suggestion is a flat, already-fixed-size calorie/macro figure (a restaurant menu item or app meal-library entry, i.e. "1 serving" by definition), logged directly without going through `FoodQuantitySheet`/`scaleFoodByUnit`. Left unchanged: inventing a gram/ml weight for an arbitrary restaurant dish would violate the "never invent serving weights" requirement, and the existing behavior (one suggestion = one real serving) is already correct for what it represents.
- **Regression check**: added 23 new tests across `src/lib/foodDatabase.test.js` (`getAllFoods` merge/replace/empty-input behavior, `sanitizeFoodUnits` clamping/stripping/never-throws, a full sanitize→unitsFor→scaleFoodByUnit round-trip simulating a hostile barcode import, plus a database-wide "never offers oz/lb/imperial, anywhere" sanity check) and 3 new tests in `src/coach/coachFoodServingSize.test.jsx` (serving-size field saves correctly, falls back to 100g when blank, pre-fills correctly when editing an existing food). Updated 6 existing `foodDatabase.test.js` tests that previously asserted oz/lb WERE offered to now assert they are not. Full suite: 298 passing (up from the prior 284 baseline), 0 regressions. Lint: 147 warnings (unchanged baseline, 0 new). Build: succeeds, and the `foodDatabase.js`/`FOOD_DATABASE` dynamic-import code-splitting (kept out of the main bundle on purpose) was verified intact after adding the new `sanitizeFoodUnits` import to `AppContext.jsx` — `UNIT_DEFS`/`sanitizeFoodUnits` were split into a new small `src/lib/foodUnits.js` module specifically so that static import wouldn't drag the full 2075-entry database array into the main chunk.
- **Not done / explicitly out of scope, stated rather than silently skipped**: (a) no existing `customFoods` Firestore document was retroactively edited or re-validated — this audit only found 0 issues in the two STATIC data sources, it did not and could not inspect the live, unbounded `customFoods` collection; (b) package-size/serving-size "verification" for specific branded products (yoghurt tub sizes, can drained weights, bar pack sizes, etc.) requires real product/label data this environment has no way to source — no new weights were invented for any existing or future food, per the explicit "never invent" requirement; this remains an open gap for anything not already correctly captured; (c) the dead/unused Cloud Function `nutritionAiHelp` (in `functions/index.js`, validated via `functions/nutritionContents.js`) was left untouched — it has no caller anywhere in `src/`, so it's out of scope for a client-facing serving-size fix; (d) `workoutComments`' Firestore rule (separate from `messages`, see bug #73) still offers no serving/unit concept at all since comments don't attach foods — not applicable here, noted only for completeness.
- **Date added**: 2026-10-12

### 75. Barcode-scanned bread (and other sliced/piece foods) offered only grams, never a "slice" unit
Real client report, direct follow-up to bug #74: a client scanned a loaf of bread and only got a grams option, no "slice" — unlike the hand-curated bread entries already in `FOOD_DATABASE` (which all carry a real `customUnit: "slice"`). Root cause: `mapProductToFood` in `src/lib/barcodeLookup.js` never derived a `customUnit` from anything in the Open Food Facts response — a scanned product only ever got the base g/ml unit, however countable its real-world serving actually is. Open Food Facts frequently states the per-unit weight directly in its own `serving_size` text (e.g. "1 slice (40 g)", "2 biscuits (30g)") — the same class of verified, on-label data `parseServingGrams` already trusts for `defaultQty`.
- **Fix**: added `parseServingUnit(product)` to `barcodeLookup.js` — parses a genuine countable-unit word (slice, piece, biscuit, cracker, cookie, bar, pita, wrap, tortilla, scoop, sachet, bun, roll) plus its parenthetical gram weight straight out of `serving_size` text, dividing by any leading count ("2 biscuits (30g)" → 15g/biscuit) to get the correct single-unit weight. `mapProductToFood` now sets `food.customUnit` from this whenever found. Nothing invented: a `serving_size` with no countable-unit word (just "180 g", "250 ml") or no `serving_size` at all correctly yields no `customUnit`, same as before — the food simply keeps its base g/ml unit only.
- **Regression check**: added 4 new tests to `src/lib/barcodeLookup.test.js` — a "1 slice (40 g)" bread scan gets a real slice customUnit; a "2 biscuits (30g)" scan correctly divides to 15g/biscuit; a plain-weight serving_size ("180 g") and a missing serving_size both correctly yield no customUnit. Full suite: 302 passing (up from 298), 0 regressions. Lint: 147 warnings (unchanged). Build: succeeds.
- **Not done**: this only fixes a barcode that has never been successfully scanned before (or whose `customFoods` entry was deleted) — `customFoods` is a single library shared by every client, and the scanner checks it first (`pickBestFoodForBarcode`) before ever calling Open Food Facts again, so a product already cached from a scan made before this fix keeps its old (no-slice-unit) entry indefinitely for every client, not just the one who originally scanned it. The one path that refreshes a cached entry (a silent background re-check once it's 90+ days old) only actually writes back when triggered from a COACH's own auth context — `customFoods`' Firestore rules make update/delete coach-only by design (an ordinary client's background refresh silently no-ops, same as it always has) — so this only self-heals for a given barcode once a coach happens to rescan it after that 90-day window, not automatically for clients. A barcode never seen before, or re-scanned fresh by a coach, gets the fix immediately.
- **Date added**: 2026-10-12

### 76. Traced the rest of the original serving-size examples through the barcode-scan path (follow-up to bug #75)
Bug #75 was found from a real client report, not from the original serving-size audit (#74) — the audit checked the static database and the validation layer, but never traced a concrete example food (bread) through the actual barcode-scan path end to end. This is a direct, explicit follow-up: went through the rest of the original request's example food list (eggs, wraps/tortillas, cheese, pizza, burgers, soft drinks/cans, canned foods, cereal/rice/pasta, yoghurt, baking ingredients) the same way, tracing each through the real scan path rather than just the static database. Findings:
- **Static database**: already correct for every category checked — eggs (`customUnit: "egg"`), wraps/tortillas (`customUnit`), cereal/oats/rice/pasta (`units: ["cup"]`, cooked vs dry clearly distinguished by name, e.g. "Pasta (cooked)" vs "Vetta Spaghetti (dry)"), pizza/burger patties (`customUnit` where verified), baking ingredients (flour/cocoa/baking powder with tbsp/tsp/cup). No changes needed here — already covered by bug #74's mechanical audit finding 0 issues.
- **Barcode-scan path**: `parseServingUnit`'s countable-unit word list (added in bug #75) only covered bread-adjacent words (slice, biscuit, cracker, etc.) — missing eggs, soft drink cans/bottles, and canned foods, all explicitly named in the original request ("Soft drinks... cans, bottles using actual volumes", "Canned foods: grams, cans, drained weight"). Also, Open Food Facts formats `serving_size` BOTH ways round in real data — unit-word-first ("1 slice (40 g)", matching bug #75's original pattern) and weight-first ("355 ml (1 can)", the far more common convention for drinks) — and only the word-first pattern was handled, so even adding "can" to the word list alone wouldn't have caught a real scanned soft drink.
- **Fix**: extended `COUNTABLE_UNIT_WORDS` with `egg`, `patty`, `can`, `bottle`, `fillet`, `cake` (each only ever applied when Open Food Facts' own label states it — nothing invented, same as bug #75). Added a second regex to `parseServingUnit` for the weight-first convention, tried as a fallback when the word-first pattern doesn't match.
- **Deliberately NOT changed — yoghurt tubs/containers**: the original request asks for "tubs or containers using verified package sizes," but this app already tried a generic "container" unit for exactly this (any food, not just yoghurt) and removed it after real client feedback — it read as "the whole package" even when someone only ate part of it, which was actively misleading (see `unitsFor`'s own comment in `foodDatabase.js` and its regression test "never offers a 'container' unit"). Reintroducing it for yoghurt specifically would directly contradict that documented, tested design decision, so it was left alone and is flagged here explicitly rather than silently skipped. A yoghurt's real tub size is still captured correctly today, just as `defaultQty` (the pre-filled gram amount), not as a separate selectable "1 tub" unit.
- **Regression check**: added 4 new tests to `src/lib/barcodeLookup.test.js` covering a scanned egg carton, a scanned soft drink can (weight-first convention), a scanned bottle (weight-first convention), and a scanned can of tuna. All verified with mocked Open Food Facts responses only — no real network calls were made for this check, consistent with keeping data usage minimal. Full suite: 306 passing (up from 302), 0 regressions. Lint: 147 warnings (unchanged). Build: succeeds.
- **Not done**: same caveat as bug #75 — this only applies to a barcode scanned fresh from now on, not retroactively to any already-cached `customFoods` entry. Also, this still doesn't cover every conceivable category from the original list (e.g. "cans... drained weight" specifically — Open Food Facts doesn't reliably distinguish drained vs undrained weight in `serving_size` text, so no attempt was made to parse that distinction from it; a can's STATED serving weight is used as-is, same as before).
- **Date added**: 2026-10-12

### 77. "Product Not Found" — barcode lookup collapsed every failure mode (timeout, rate limit, server error, genuine absence) into one identical, misleading result
Full audit of the barcode scanning/lookup system, prompted by a report that scanned products (including Woolworths eggs) returned "Product Not Found." **Root cause confirmed**: `fetchProduct` in `src/lib/barcodeLookup.js` treated a non-2xx HTTP response, a thrown network error, and a timeout all identically — it returned `null` for every one of them, exactly the same `null` a genuine "Open Food Facts has no record of this barcode" produces. `lookupBarcode` then always set `err.notFound = true` on that `null`, which routes the scan UI straight to its "Product not found — add it manually" screen. The scan UI (`NutritionFeatures.jsx`) already has a SEPARATE, correctly-built "Couldn't complete that scan — Try again" screen for exactly this situation — it was simply unreachable, because the lookup layer never reported anything other than a confirmed not-found.
- **Was this caused by the recent serving-size/measurement-unit upgrade?** No — checked by diffing every commit that touched `barcodeLookup.js` since that work began (bugs #75/#76). Both are purely additive (`parseServingUnit`/`COUNTABLE_UNIT_WORDS`), only ever run AFTER a product is already confirmed found with usable nutrition data, and never touch `fetchProduct`, `hasNutrition`, or any code path that can produce a "not found" result. This bug pre-dates that work.
- **Real-world reproduction attempted**: searched Open Food Facts live for real Woolworths egg barcodes (e.g. `9300633900984`, `0344643900984`, `9300633637064`, `9300633013264`) and ran them through the app's own actual lookup code (`debugLookupBarcode`), live, against the real API. All four resolved correctly today, with full nutrition and VERIFIED confidence — **the exact failure could not be reproduced with currently-available real barcodes**, meaning the original report most likely hit a transient condition (a momentary timeout, rate limit, or Open Food Facts server error) that this bug then misreported as a confirmed missing product, rather than a barcode that's permanently unresolvable. This is stated honestly rather than claimed as "fixed and verified against the exact original failure," which it isn't — the architectural flaw is fixed and confirmed, the specific original incident is not individually reproducible.
- **Fix**: `fetchProduct` now distinguishes a genuine confirmed absence (HTTP 404, or Open Food Facts' own `status: 0`) from a lookup that never got an answer at all (timeout, network error, HTTP 429/5xx) — returning `{ found, product?, confirmed, transientReason? }` instead of a bare `product|null`. `fetchFirstMatch` (which races a barcode's zero-padding variants in parallel) now only reports a confirmed not-found when EVERY variant was positively confirmed absent — if any variant merely failed to answer, the overall result is "lookup failed," not "not found." `lookupBarcode` throws WITHOUT `err.notFound` for a lookup failure (routing to the existing "Try again" screen) and WITH `err.notFound = true` only for a genuine confirmed absence (routing to "add manually," unchanged from before). Also added a descriptive `User-Agent` header to the Open Food Facts request — its own API documentation asks every production client to identify itself; an anonymous default User-Agent risks silent throttling under real-world mobile traffic, which would look exactly like an intermittent "not found."
- **Everything else in the lookup/persistence architecture was audited and found already correct, not re-implemented**: barcode normalization preserves leading zeros throughout (string-based, never passed through `Number()`/`parseInt`); `codeVariants` already retries a UPC-A↔EAN-13 zero-padding mismatch; `isVariableWeightBarcode`/`stableBarcodeKey` already handle AU/NZ in-store scale barcodes; the local `customFoods` library is already checked (`pickBestFoodForBarcode`) before any external lookup runs; nutrition is already validated (Atwater reconciliation) and never fabricated; a client's correction is already a separate document, never an overwrite of the original (and `customFoods`' Firestore rules already make update/delete coach-only, preventing a second client's bad data from clobbering a verified entry); `pickBestFoodForBarcode` already prevents duplicate-barcode confusion by always preferring a corrected entry over an uncorrected one. None of this needed changing — confirmed by reading, not assumed.
- **Australian supermarket coverage — real findings, not assumed**: live-queried Open Food Facts for Woolworths, Coles, ALDI, IGA, and 7-Eleven products. Woolworths, Coles, and IGA all have substantial real AU-market coverage with usable nutrition data (spot-checked specific real barcodes, not just counts). APEX's own static `FOOD_DATABASE` additionally already carries 200 hand-curated Woolworths entries, 178 ALDI, 50 Coles-named items, and 14 "7-Eleven" mentions — but **zero IGA-prefixed entries in the static database** (IGA products are only reachable via the live Open Food Facts lookup, not the pre-loaded library) — a genuine, confirmed, remaining gap worth knowing about, not papered over. 7-Eleven-specific branded products are comparatively thin on Open Food Facts outside the US/Asia market; convenience-store coverage in practice will mostly come from the underlying branded product (a Coca-Cola, a Red Bull) rather than a 7-Eleven private-label match, which is an inherent limit of a crowd-sourced external database, not a bug in this app's code.
- **Regression check**: updated 2 existing tests in `src/lib/barcodeLookup.test.js` that had encoded the OLD (buggy) behavior as correct — "a network failure/timeout is reported as not-found" — to instead assert the new, correct distinction. Added 4 new tests: a genuine `status: 0` and a genuine 404 both still correctly report `notFound: true`; a 429 (rate-limited) and a mixed scenario (one barcode variant confirmed-404, the other merely timed out) both correctly do NOT report `notFound`. Full suite: 310 passing (up from 306), 0 regressions. Lint: 147 warnings (unchanged). Build: succeeds. Live-API smoke test (not an automated test, a manual verification step): re-ran the 4 real Woolworths barcodes above against the updated code after the fix — all 4 still resolve correctly.
- **Not done / explicitly not claimed**: this does NOT fix the user's exact original incident with certainty, because it could not be reproduced — what's fixed and verified is the confirmed architectural flaw (failure-mode collapsing) that's the most plausible explanation for an intermittent "not found" on a barcode that normally works. No automatic retry was added for a transient failure — the existing "Try again" screen already gives the client/coach a one-tap recovery path, which was judged the smaller, safer change over building a new retry-with-backoff loop. The IGA static-database gap above is also not fixed — adding ~150-200 hand-curated IGA entries (matching the existing Woolworths/ALDI pattern) would need the same kind of dedicated, source-cited research pass those used, not a mechanical code change, so it's recorded here rather than attempted as a drive-by addition.
- **Date added**: 2026-10-12

### 78. Consolidation pass — confirmed previous fixes merged/live, verified no duplicate logic, added end-to-end serving-unit proof
Follow-up request asking to merge the pending barcode fix (bug #77) and verify the combined serving-unit + barcode work as a whole, including why "previous fixes weren't appearing." Findings:
- **Why previous fixes weren't appearing**: every fix from bugs #74-#77 was deliberately committed to its own branch and NOT merged/deployed until explicit authorization was given for each, per this project's own "do not deploy without authorisation" rule and this session's established workflow. Anyone testing the live app before each merge landed would correctly have seen the pre-fix behavior — this was expected, not a bug. All four are now merged to `main`, confirmed by CI (green) and the Vercel production deployment status (green) for the final merge commit.
- **PWA/service-worker staleness, checked as a possible contributor**: `vite.config.js`'s `VitePWA` config already uses `registerType: 'autoUpdate'` with `skipWaiting: true` and `clientsClaim: true` — its own comment confirms this was already fixed in an earlier session specifically because "UI changes can look like they never deployed" without it. No change needed; confirmed already correct.
- **Duplicate-system check**: searched for any second implementation of the core classifiers/functions (`sanitizeFoodUnits`, `getAllFoods`, `unitsFor`, `scaleFood`/`scaleFoodByUnit`, `parseServingUnit`) — each has exactly one definition, no duplicates introduced across this session's work. `CoachFoodLibrary.jsx` has its own separate `FOOD_DATABASE.filter(...)` line, but it's for a genuinely different purpose (splitting "already imported/editable" vs "not yet imported/locked" built-in foods for the coach's library-management screen), not a re-implementation of the `getAllFoods` search merge — confirmed by reading, correctly left alone.
- **Client/coach view consistency, confirmed by reading both render paths**: a logged food's displayed name (which bakes in its unit, e.g. "White Bread (2 slices)") is rendered identically in the client's own meal-detail list (`ClientApp.jsx`, renders `f.name` directly from the stored log entry) and the coach's client-detail nutrition view (`CoachClientDetail.jsx`, same `nutrition.meals[cat]` data, same `f.name` render) — one data model, two views, no divergent logic.
- **New: direct, automated end-to-end proof** that a serving unit flows correctly through the full real pipeline, not just that each piece works in isolation (already covered elsewhere) — added `src/lib/servingUnitEndToEnd.test.js`, using the actual exported `unitsFor`/`scaleFoodByUnit` functions (not mocks) chained exactly the way `FoodQuantitySheet` → `addFood` → the meal-detail render do in the real app: classify a food → resolve a chosen unit+quantity → simulate the exact persistence shape `addFood` uses (spreads the resolved object verbatim) → simulate the exact display the log re-render uses (`f.name` directly). Covers bread (slice), eggs (egg), a drink (ml/cup, confirms no kg/oz/lb ever offered), a generic solid with no verified piece unit (confirms it correctly stays grams-only rather than inventing one), and a preview/save determinism check (scaling the same food/unit/qty twice is byte-identical, so there's no drift between what the quantity sheet previews and what actually gets saved).
- **Regression check**: full suite 315 passing (up from 310, the 5 new end-to-end tests), 0 regressions. Lint: 147 warnings (unchanged). Build: succeeds.
- **Date added**: 2026-10-12

### 79. Service-worker update checks didn't run on becoming visible again — the verified real cause of "fixes aren't appearing" on an already-open device
Follow-up audit (diagnose-only, then this fix once authorized) confirmed production was genuinely up to date byte-for-byte at every prior report — the gap was entirely client-side: `main.jsx` already had a real, deliberate update-check system (checks on the app going `hidden`, on `blur`, and a 5-minute poll while open), with a documented reason for NOT checking on becoming visible — doing that used to reload the page immediately, racing the app's own resume paint and causing a visible flash of stale content. But that meant a device that already had the app open before a new deploy had no trigger to notice the update until it was backgrounded, blurred, or the 5-minute timer landed — someone reopening the app specifically to check whether a fix shipped got none of those.
- **Fix**: extracted the existing update-check logic out of `main.jsx` into `src/lib/swUpdateCheck.js` (`setupServiceWorkerUpdateChecks()`), unchanged in behavior except: (1) a check now also runs when the document becomes visible again, alongside the existing hidden/blur/periodic triggers; (2) an in-flight guard prevents two overlapping checks when triggers land close together; (3) a `.catch()` was added to the update-check promise chain — previously a failed check (offline, a flaky network) was an unhandled promise rejection, now it's safely swallowed; (4) a defensive idempotency guard prevents a second installation from registering duplicate listeners. The reload-safety fix this was built on top of is untouched: an update landing while visible still only shows the "Refresh" banner, never reloads immediately — reload still only fires once the app actually goes hidden. `vite.config.js`'s `skipWaiting`/`clientsClaim`/`autoUpdate` config, the Workbox precache strategy, and offline support were not touched at all.
- **Regression check**: added `src/lib/swUpdateCheck.test.js`, 9 tests covering: the new visible-check behavior; all 3 existing triggers (hidden/blur/5-minute poll) still work unchanged; the overlapping-check guard; a failed check never produces an unhandled rejection and the in-flight guard still resets afterward so the next trigger isn't permanently blocked; a second installation is a no-op; and the pre-existing anti-flash reload gating (banner while visible, reload only once hidden) still holds. Full suite: 324 passing (up from 315), 0 regressions. Lint: 147 warnings (unchanged). Build: succeeds — confirmed the new code is actually present in the built entry bundle (`grep` for the banner text in `dist/assets/index-*.js`).
- **Verification performed vs. NOT performed, stated explicitly**: all of the above is automated-test and build verification. This has NOT been tested on an actual device/real browser — there is no way to exercise a real service-worker lifecycle, a real app backgrounding/foregrounding transition, or a real native iOS WKWebView session from this environment. The jsdom-based tests mock `navigator.serviceWorker` entirely; they prove the module's own logic is correct, not that a real browser's service-worker implementation behaves identically. Not merged/deployed — awaiting authorization, per this task's explicit instruction.
- **Date added**: 2026-10-12

### 80. Train Solo: a fully set-up customer was sent to the questionnaire on about 1 login in 3
- **Root cause**: the same-day fix for a missing Solo profile (#81) flagged the profile "missing" whenever the `soloUsers/{uid}` listener emitted a non-cache "doesn't exist". Right after login, that listener can briefly report "doesn't exist" for a doc that's really there: the login's own `lastLoginAt` update is pending against a doc this device hasn't cached yet. `SoloLoginScreen` then navigated straight to `/solo/onboarding`, which has no completion guard, so a completed customer landed on their last questionnaire question. Reproduced 3/8 fresh-device logins locally and 1/2 against production.
- **Fix**: `SoloAppContext.jsx`: "missing" is only set after a direct `getDocFromServer` read confirms the doc doesn't exist. Pending-write and cache-only snapshots are ignored, and a late read never overrides a snapshot that has since found the doc. The login/register screens now route a missing profile to `/solo/home` (whose guards decide) instead of `/solo/onboarding`.
- **Regression test**: `src/lib/SoloAppContext.profileMissing.test.jsx`. The "pending-write" and "server read finds the profile after all" cases were verified to fail against the shipped version. Live check: 12/12 then 8/8 fresh-device logins landed on Home.
- **Date added**: 2026-10-21

### 81. Train Solo: a login whose profile never saved sat on a blank screen forever
- **Root cause**: if registration created the Auth account but the `soloUsers/{uid}` write failed, `soloSessionLoading` never became false (it waited for a profile that would never arrive).
- **Fix**: a server-confirmed missing profile ends loading and sets `soloProfileMissing`. `RequireSoloAuth` then shows `SoloFinishSetupScreen`, which re-collects the name and the Terms/Privacy acceptance, creates the profile with `completeSoloProfile`, and continues to the questionnaire (Log out is offered too). While an account deletion is in progress (the profile is deleted just before the login), the flag is suppressed, so the setup screen doesn't flash.
- **Regression test**: `src/lib/SoloAppContext.profileMissing.test.jsx` → "keeps loading on a cache-only 'doesn't exist', then flags missing once a server read confirms it". Verified to fail with the old `soloSessionLoading` expression. Live check: a real Auth-only account showed the setup screen, completed it, reached the questionnaire, and stayed there after a reload.
- **Date added**: 2026-10-21

### 82. Train Solo workouts: a 0-second rest showed a "Start timer" button
- **Root cause**: `SoloExerciseBlock` always rendered the rest row, so an exercise with `restSeconds: 0` (Active Recovery's Stationary Cycling) showed "Rest 0s between sets" with a Start timer button that started a zero-length timer.
- **Fix**: the rest row only renders when the rest is above 0 (unset still defaults to 90s).
- **Regression test**: `src/solo/soloRestRow.test.jsx`. The 0s case was verified to fail without the fix.
- **Date added**: 2026-10-21

### 83. Session Intelligence told a first-time timed exercise to "find a solid working weight"
- **Root cause**: `buildPersonalNote` (`src/lib/sessionIntelligence.js`, shared by the coached client app and Train Solo) used one weighted-lift sentence for every first-time exercise, including timed ones (a treadmill walk, a plank).
- **Fix**: a first-time `targetType: "time"` exercise gets "focus on a steady, comfortable effort today". Weighted lifts keep the original wording.
- **Regression test**: `src/lib/sessionIntelligenceTimed.test.js`. The timed case was verified to fail without the fix; the weighted case asserts the original sentence is unchanged.
- **Date added**: 2026-10-21

### 84. Train Solo: a refunded program stayed in My Training
- **Root cause**: `soloStripeWebhook` marks a refunded purchase `refunded: true` (and `firestore.rules` lock its content), but `SoloAppContext`'s `soloPurchases` listener kept every purchase. Every screen (My Training, Calendar, Profile, Catalogue/Program details "owned") reads that list as "programs you own", so a refunded program still showed as owned. Found by the first live-mode purchase + refund.
- **Fix**: the listener leaves out purchases with `refunded === true`. Older purchases without the field still count as owned; buying again resets `refunded` to false, so access returns.
- **Regression test**: `src/lib/SoloAppContext.refundedPurchase.test.jsx`, verified to fail without the fix.
- **Date added**: 2026-10-22


### 85. Tapping a field's title toggled the first chip (or stepped a duration down)
- **Root cause**: `Field` (`src/components/ui.jsx`) renders a `<label>`. A label forwards a tap anywhere on it that isn't a control (its title, hint, the gap between chips) to the first button inside it. Fields holding chip groups or a −/+ stepper therefore toggled their first chip or decreased the value. Affected: Train Solo Edit Program (Categories, Who it's for, Goals, Environments), Train Solo Edit Phase and the coaching Program builder's Duration steppers, and the client Nutrition meal-type chips. Found in the 2026-10-25 weekly audit: tapping only the titles saved "Home Training", "Men" and "Commercial gym" on a program. A stray "Men" tag hides a program from women's suggestions.
- **Fix**: `Field` takes an opt-in `group` prop that renders a plain `<div>` with the same look. Those seven fields use it; every other `Field` (text inputs, selects) still renders a label.
- **Regression test**: `src/components/fieldGroup.test.jsx`, verified to fail without the fix. Also checked in the browser on the Edit Program sheet: tapping titles/hints selects nothing; tapping chips still toggles them.
- **Date added**: 2026-10-25


### 86. Push-notification test failed at random (test timeout, not an app bug)
- **Root cause**: `src/client/pushNotificationsNativeAware.test.jsx` re-imports all of `ClientApp.jsx` fresh for every test (`vi.resetModules()`). On a busy machine that import alone can pass vitest's default 5s limit, so a test failed with "Test timed out in 5000ms" whether or not the code was right. It failed and passed on the same untouched main commit. Push notifications in the app were never affected.
- **Fix**: that file sets a 30s test timeout (`vi.setConfig`). No app code or assertions changed.
- **Regression test**: the file itself — passed 4 runs in a row on its own and in two full `npm test` runs (515 passed), plus `npm run test:rules` (75 passed) and `npm run build`.
- **Date added**: 2026-10-26


### 87. Coach console didn't show a client's Steps, Sleep or Resting Heart Rate
- **Root cause**: the coach's client Progress panel (`ProgressPanel`, `src/coach/CoachClientDetail.jsx`) built its graphs only from body fat, lean mass and measurements. Steps/sleep/resting heart rate the client logged (and, from 1.0.3, synced from Apple Health) were saved but invisible to the coach.
- **Fix**: the panel adds Steps, Sleep and Resting Heart Rate cards, using the same `BodyMetricCard` and the same keys/units as the client's own graphs.
- **Regression test**: `src/coach/coachDailyMetrics.test.jsx` (also checks another client's data doesn't show), verified to fail without the fix.
- **Date added**: 2026-10-26


### 88. Apple Health sync guards (1.0.3)
- **Risk covered**: Apple Health syncing into a client's records must never overwrite a hand-typed value, re-add a weigh-in the client deleted, sync a coach's phone into a client while "viewing as" them, carry one account's connection to another on the same phone, or tick off Train Solo's Monday Body Stats Check-in by itself (steps sync every day).
- **How**: `src/lib/appleHealth.js` reads the person's docs fresh before writing, marks synced fields in each day's `appleHealth` map, remembers imported weigh-in days per account, and is disabled while `viewingAsClient`. `src/solo/soloCalendar.js` ignores days whose only values are synced.
- **Regression test**: `src/lib/appleHealth.test.js` (sync plan, check-in rule, native bridge round-trip and error, per-account/side flag).
- **Date added**: 2026-10-26

### 89. Coached client: one-sheet body-stats check-in, and editing logged cardio
- **What changed**: Progress has a "LOG BODY STATS & PHOTOS" button opening `BodyStatsCheckInSheet` (`src/client/ClientApp.jsx`): one date, then weight, body fat, lean mass, optional measurements and photos. It saves only what's filled in, through the same `onLogWeight` / `onLogBodyMetric` / photo upload each card already used. Home's "Body stats check-in due" button (now "LOG STATS") and the notification bell open the same sheet. On Home, tapping a logged cardio session opens `LogCardioSheet` filled in ("Edit Activity"), and saving updates that log (`updateWorkoutLogEntries` with the new `cardio` + `dayLabel`). A swipe-to-delete never opens the editor. Train Solo is untouched; its shared `LogWeightSheet`/`PhotosSection` are unchanged.
- **Regression test**: `src/client/bodyStatsAndCardioEdit.test.jsx` (only filled fields saved on the chosen date; zero/negative blocked; tap edits with values pre-filled; swipe doesn't). Also exercised in Chromium with touch: tap opens the editor, a partial swipe doesn't, a saved edit updates the row, a photo picked in the check-in is passed on.
- **Date added**: 2026-10-27

### 90. Coached client Progress tab: frosted-glass look (design change)
- **What changed**: in light mode the client Progress tab sits on the off-white `SURFACE` (instead of pure white, where the app's translucent glass Cards read as plain white boxes), the Performance Timeline sits in a glass card (its solid band cleared by `.solo-glass-inner`, the same way Train Solo shows it), and "Log body stats & photos" is a glass bar with smaller 13px text and a blue icon instead of a black button. Only `ProgressScreen` in `src/client/ClientApp.jsx` changed. The shared Card/MetricTile/PerformanceTimelineCard components, Train Solo and the coach console are untouched.
- **Regression test**: `src/client/bodyStatsAndCardioEdit.test.jsx` still covers the check-in sheet; checked in Chromium in light and dark mode: every Progress box is glass, and the button opens the Log Body Stats sheet.
- **Date added**: 2026-10-27

### 91. Finished meal guides stayed in the client app, and the coach was never reminded
- **Root cause**: nothing ever ended a meal guide. The client's Nutrition tab clamped "this week" to the last week (`planCurrentWeek`), so a finished guide stayed on screen forever. The coach dashboard only flagged a guide from 2 days before its end until its last day, then dropped it with no "ended" state, and there was no push for it. Also `MealPlanBuilder.publish` always kept the old `startDate`, so a guide rebuilt after it ended would count as already over.
- **Fix**: `src/lib/mealPlanEnd.js` gives a guide's last day (startDate + weeks × 7 − 1, the same week rule as before). The client app hides a guide the day after its last day. The coach dashboard's Needs Attention shows "Meal guide ended" until the coach acts, and the client's Meal Guide panel says it has ended. Saving a guide whose last week is over restarts it from today, while a running guide keeps its start date. The new scheduled function `mealPlanEndingReminders` (9am Sydney, rule in `functions/mealPlanEnd.js`) pushes the coach 2 days before, on the last day, and the day after. Plans with no start date never end on their own. Train Solo is untouched.
- **Regression test**: `src/lib/mealPlanEnd.test.js`. End dates are checked by hand (1 Oct + 1 week → 7 Oct, 2 weeks → 14 Oct, 28 Oct → 3 Nov, 10 legacy days → 2 weeks), as are shown-on-last-day / hidden-the-day-after, the function's copy giving the same dates, and push only on −2/0/+1 days.
- **Date added**: 2026-10-27

### 92. Coach Overview: no light stripes on the stat tiles, black hero (design change)
- **What changed**: the four Overview stat tiles (`StatCard`, `src/coach/darkUI.jsx`) no longer draw the diagonal light beam (`DarkPanel` takes `beam={false}`), and the Overview hero (`CoachDashboard.jsx`) drops its blue top line, its mountain shapes now neutral black/charcoal (`MountainTexture mono`). Other coach pages' chamfer cards and page headers keep their current look. The client app and Train Solo are untouched (`darkUI.jsx` is coach-only).
- **Regression test**: `npm test`, `npm run build`; rendered in Chromium: tiles show no stripe, the hero has no blue.
- **Date added**: 2026-10-27
- **Follow-up (same day)**: the Overview's Needs Attention and Recent Activity panels drop the top-right corner glow square (`DarkPanel glow={false}`). Every other panel is unchanged.

### 93. Coach Library → Programs and Train Solo → Programs: program-dashboard layout (design change)
- **What changed**: both coach screens share `src/coach/programDashboardUI.jsx`. The program list no longer repeats each program's phases under it, and the selected program has a thin blue rail instead of a solid blue block. The detail shows the name, then large figures (Phases / Weeks / Sessions, plus Workouts / Price on Train Solo), then dropdowns: About (description and categories) and Cover artwork (Train Solo). Each phase is now a dropdown that opens to its workouts (the selected phase opens by default). Train Solo's publish button and its publishing warnings stay in view. Every action is unchanged: new / import / delete-all programs, edit / delete program, add / edit / duplicate / move / delete phase, and new / import / select / copy / edit / delete workouts.
- **Tests updated deliberately**: `CoachProgramsPhases.test.jsx` and `CoachTrainSoloPhases.test.jsx` looked for the old "PHASES (2) · 7 WEEKS" line and "Select …" buttons. They now check the same facts in the new layout: the 2 phases / 7 weeks figures, each phase's weeks and count, and that opening a phase's dropdown shows its workouts and hides the previous phase's. The duplicate / move tests are unchanged.
- **Checked**: rendered both screens in Chromium with sample programs. The client app and Train Solo's customer screens are untouched.
- **Follow-up (same day)**: the program title is smaller and shown in full, and phase names wrap. Inside an open phase, workouts are a hairline-divided list (no box inside a box) under a small "WORKOUTS · n" heading, and the toolbar wraps instead of squeezing. The large figures wrap on a narrow screen instead of cutting off (e.g. the price). The detail has no extra phone gutter. Checked at 390px and 1300px wide in Chromium.
- **Date added**: 2026-10-28

### 94. Coach Overview: Quick Actions and Clients boxes removed (design change)
- **What changed**: the Quick Actions box (add client, build program template, add exercise + video, broadcast today's workout) and the Clients box at the bottom of the coach Overview (`CoachDashboard.jsx`) are removed, along with the imports only they used. Everything they linked to is still in the sidebar (Clients, Library). Broadcasting today's workout had no other button, so it can't be reached for now (its sheet code is still in the file).
- **Regression test**: `npm test` (537 passed), `npm run lint` (oxlint: no errors), `npm run build`.
- **Date added**: 2026-10-28

### 95. Train Solo: exercise swap, set-by-set targets, and free sessions (features)
- **Exercise swap**: each exercise in a Train Solo session has a Swap button (`SoloSwapSheet.jsx`). Alternatives come from `exerciseSwap.js`: same muscle group by default, optional same equipment and search, never the exercise itself or one already in the session. No reason is asked, since there's no coach. A swapped exercise shows "Swapped from …", can be swapped back, and keeps sets already logged on the original.
- **Set targets**: `soloProgression.js` replaces the coached app's simple "Try" hint in Train Solo only, giving a target for every set with a one-line reason: hit reps → +2.5% (at least 2.5 kg, 2.5 kg plates); 1–2 short → same weight; 3+ short → −10%; same top set 3 sessions running → −10% reset; AMRAP and bodyweight → +1 rep. The coached app's `suggestNextSet` is unchanged. Deload weeks aren't included because programs have no deload field.
- **Free sessions**: My Training has "Your Sessions" with Quick session (empty, log as you go), Build a session (`SoloSessionBuilderScreen.jsx`, saved to the new `soloCustomSessions` collection), and saved sessions to start or edit. Runs log to `soloWorkoutLogs` under `${uid}_custom` (`customSessions.js`), so Progress, PRs and history count them, the calendar shows them as done, and they never tick off a program day. A custom session needs at least one set to complete. Account deletion now also deletes custom sessions. Nothing free shows a price (Apple 3.1.1).
- **Regression tests**: `soloProgression.test.js` (every number worked out by hand), `customSessions.test.js` (ids, validation, calendar, swap candidates), `soloSwapAndTargets.test.jsx` (target button fills the set, swap button, swapped label), and `firestoreRules.rules.test.js` → `soloCustomSessions` (owner only; verified that the save tests fail without the rule).
- **Follow-up (same day, found in live testing)**: coach-added exercises have category "Custom" and empty primaryMuscles, so "same muscle group" matched every Custom exercise (a spider curl offered a banded external rotation). `primaryMuscleOf` now folds finer muscle names into groups (Lats/Rhomboids → Back, Hamstrings → Legs…) and otherwise reads the exercise name (leg curl → Legs, curl → Biceps, reverse fly → Shoulders, rack pull → Back). Warm-up and cool-down moves only swap for each other. Checked against the real library's Custom exercises; ones with no clear muscle (jumps, stretches, sprints) fall back to showing everything. Covered in `customSessions.test.js`.
- **Live check**: on the live site in iOS-app mode with the demo account: built a session, started it, swapped an exercise, logged a set and completed it. My Training showed it as done today and under Your Sessions. The test session and log were deleted afterwards.
- **Date added**: 2026-10-28

### 96. Voice notes, form-check videos linked to a set, and a lock-screen rest alert (features, iOS 1.0.3)
- **Voice notes** (coached client chat and coach console): the mic takes the Send button's place while the box is empty. Recording uses `useVoiceRecorder` (`src/lib/voiceNote.js`): AAC/mp4 where supported (iPhone), else mp4/opus or webm, with a 2-minute cap. Uploads go to the new Storage path `messageAudio/{clientId}` (audio only, 20MB, same who-can-write as other attachments) and play in `VoiceNotePlayer`. Push previews say "Sent a voice note". iOS needs `NSMicrophoneUsageDescription` (added) and WKWebView's capture permission, granted for APEX's own pages only (`ViewController.swift`).
- **Form checks**: a camera button on each exercise in a coached workout films or picks a video and sends it to the coach, tagged with the exercise and the last set with reps (`src/lib/formCheck.js`). The coach's thread labels it and offers "Reply with feedback", which links the reply (`message.replyTo`, the new optional `extra` argument on `sendMessage`). The client sees "COACH'S FORM FEEDBACK" above that exercise next time. Hidden while a coach is viewing as a client.
- **Lock-screen rest alert** (coached and Train Solo, iPhone app only): starting rest asks the native app for one local notification at the end (`RestTimerBridge.swift` via `src/lib/restNotification.js`). +15s reschedules it; Skip, the timer ending or leaving the session cancels it. It's hidden while the app is open, where the in-app ding already plays. Elsewhere it does nothing.
- **Regression tests**: `src/lib/coachedSessionExtras.test.jsx` (bridge messages, set tagging, labels, feedback lookup, audio format, recorder bar, player), `src/coach/coachFormCheckReply.test.jsx` (label, no duplicate text, reply carries replyTo), `src/client/coachedFormCheckAndRest.test.jsx` (form-check upload tagged and sent, feedback shown, rest alert scheduled and cancelled), and a voice-note case in `api/notify.test.js`. In Chromium with a simulated mic: recorded, sent, played back, and linked to a form check.
- **Date added**: 2026-10-28

---

### 97. Form-check videos: fast automatic compression, 2-minute clips upload
- **Problem**: compression replayed the whole clip in real time before the upload began (a 2-minute clip waited 2+ minutes), clips under 20MB weren't compressed, and the 200MB limit was checked on the original, so a 2-minute iPhone clip (often 300MB+) was refused before it could be compressed.
- **Fix**: `src/lib/videoCompress.js` tries a fast path first: hardware re-encoding through WebCodecs via `mediabunny` (pinned 1.62.1, loaded only when a video is picked). It produces H.264 mp4 (VP9 webm where H.264 can't be encoded), longest side 960, 2 Mbps, rotation and audio kept, and the file is read in pieces. If the device can't do it, the existing playback compressor runs, then the original file, as before. It compresses from 8MB up. `uploadMessageVideo` (`src/lib/storage.js`) now applies the 200MB limit to the file actually uploaded. Storage rules are unchanged. The same helper is used for coach chat videos.
- **Regression tests**: `src/lib/videoUploadCompression.test.js`: fast path used, with the right size/codec/orientation; the 8MB threshold; fallback when it can't encode; a 400MB clip that compresses uploads; still refused if over 200MB after compression. The first three fail without the fix. In Chromium (software VP9, no hardware), 2:00 landscape and 2:10 portrait 1080p clips went 100MB→25MB and 109MB→27MB, full length, orientation and audio intact, in ~77s; iPhones encode H.264 in hardware.
- **Date added**: 2026-10-28

### 98. Voice notes and form checks could close older iPhone app builds
- **Problem**: the mic button (chat, both sides) and the form-check button showed in iPhone app builds before 1.0.3 (the App Store build and 1.0.2 TestFlight). Those builds have no `NSMicrophoneUsageDescription`, and iOS closes an app that records audio without one.
- **Fix**: `nativeMicAllowed()` in `src/lib/voiceNote.js`: inside the iPhone app (`inIosApp()`), recording is offered only when the `apexRest` handler is present, which shipped in the same 1.0.3 build as the microphone string. `voiceNotesSupported()` uses it, and so does the form-check button (`ClientApp.jsx`). Browsers and 1.0.3+ are unchanged.
- **Regression tests**: `src/lib/coachedSessionExtras.test.jsx` ("voice notes by app build": desktop, pre-1.0.3 app with and without apexTheme, 1.0.3, iPhone Safari) and `src/client/coachedFormCheckAndRest.test.jsx` (form-check button hidden in an older build, shown in 1.0.3). Both fail without the fix.
- **Date added**: 2026-10-28

### 99. Coached workout: "Form check" label under the video icon (design change)
- **Change**: the form-check button on each exercise (`ExerciseBlock`, `src/client/ClientApp.jsx`) now shows a small "FORM / CHECK" caption stacked under the video icon, so clients know what it's for. The button keeps its original 32px width, so the exercise name and "3 sets × 10 Repetitions" sit exactly as before (a first, wider one-line caption squeezed them and was changed the same day). The button's behaviour, aria-label and upload states are unchanged.
- **Regression tests**: the existing `src/client/coachedFormCheckAndRest.test.jsx` cases (button found by its aria-label, upload sends a tagged form check, hidden in pre-1.0.3 iPhone builds) still pass. Screenshotted at 390px in dark and light with a long exercise name, side by side with the original: name and sets/reps lines unchanged, no overlap.
- **Date added**: 2026-10-28

### 100. Coached workout: timed exercises show only the timer (design change)
- **Change**: an exercise programmed for time (`targetType: "time"`) now shows just the Seconds timer button across the row, like Train Solo; the Kg box and its header are gone for those rows only (`ExerciseBlock`, `src/client/ClientApp.jsx`). Reps exercises are unchanged. Saving is unaffected: a set is saved from its seconds, and a blank Kg was already saved as 0.
- **Regression tests**: `src/client/coachedFormCheckAndRest.test.jsx` ("shows only the timer on a timed exercise, and Kg on a reps exercise"), which fails without the change. Screenshotted at 390px in light and dark with a timed and a reps exercise.
- **Date added**: 2026-10-28

### 101. Set timer on timed exercises lost time when the connection dropped in and out
- **Problem**: the countdown on timed sets (coached `ExerciseBlock` in `src/client/ClientApp.jsx`, and Train Solo's `src/solo/SoloExerciseBlock.jsx`) subtracted one second per timer tick. Ticks get delayed or dropped whenever the phone is busy or the app is briefly backgrounded (a flaky connection reconnecting, a notification), so the countdown stalled, jumped and ran long.
- **Fix**: the timer stores when the set ends (`timerEndAtRef`, from `performance.now()`) and every tick, and every return to the app, reads the time left from the clock, the same way the rest timer already did (`restEndAtRef`). Stopping early logs the real elapsed seconds; finishing logs the programmed time. Fully local: nothing about the timer touches the network.
- **Regression tests**: `src/solo/setTimerClock.test.jsx`: 20 seconds pass while only one tick gets through; both apps must show 10s left, and Train Solo then finishes and logs 30s. Fails on both without the fix.
- **Date added**: 2026-10-28

### 102. Opening the app and finishing a workout with no signal
- **Problem**: (1) Finishing a workout offline (coached `finishWorkout` → `logWorkout`/`updateWorkoutLogEntries` in `AppContext.jsx`; Train Solo `logSoloWorkout` in `SoloAppContext.jsx`) awaited Firestore's server acknowledgement, which never comes offline, so Finish / Complete Workout spun forever even though the write was already kept on the phone. (2) The iPhone app loaded the live site with no fallback, so opening it with no signal showed a blank screen.
- **Fix**: (1) `src/lib/offlineWrite.js` `savedOrQueued()`: waits up to 4s (0.8s when the phone reports offline) for the server, then resolves "queued"; Firestore's persistent local cache (`firebase.js`) keeps the write and sends it by itself later, even across an app restart. Real errors that come back in time still show; later ones are logged (`logClientError`). The coached app shows a toast and Train Solo's summary a line: "No signal — saved on your phone…". (2) `ViewController.swift`: if the first load fails for lack of a connection, it reloads from the phone's saved copy (`.returnCacheDataDontLoad`; the site's HTML and hashed assets are cacheable per `vercel.json`); with no saved copy yet, a native "You're offline … Try again" screen. Native: needs the next iOS build.
- **Regression tests**: `src/lib/AppContext.offlineFinish.test.jsx` (coached `logWorkout` and `updateWorkoutLogEntries` come back "queued" when the server never answers) and `src/lib/SoloAppContext.offlineFinish.test.jsx` (`logSoloWorkout` likewise) — both fail on the pre-fix code ("still waiting"); plus `src/lib/offlineWrite.test.js` (queued when the server never answers, saved when it does, real failure still reported, late failure to onLateError, shorter wait when offline). Live check against production Firestore with the Train Solo demo account in Chromium: offline write resolved "queued" in 0.9s and reached the server after reconnecting (test doc deleted). The native fallback can only be checked on a device.
- **Date added**: 2026-10-28

### 103. Food and water couldn't be logged with no signal
- **Problem**: every food, water, edit and delete on the Nutrition tab goes through `setNutritionForDate` (`src/lib/AppContext.jsx`), which used a Firestore transaction. A transaction can't run offline at all (it has to read the server's copy first), so in a gym with no reception every log failed with "Couldn't save" — unlike finishing a workout offline (#102).
- **Fix**: offline (`navigator.onLine === false`), or when the transaction itself fails as unreachable (`code: "unavailable"`), the same updater is applied to the phone's own copy of the day (`getDocsFromCache` on the client's nutritionLogs, which holds pending local writes, so several offline logs in a row build on each other) and written with `setDoc` through `savedOrQueued()`. It resolves "queued" and the toast says "saved on your phone, it'll sync when you're back online". Online, the transaction is unchanged. Any other error is still reported. Known edge: a day that's not on the phone at all (never synced to this device) starts empty offline, and a full-day write replaces the server's copy when it syncs; this needs another device to have logged that same day while this phone never loaded it.
- **Regression tests**: `src/lib/AppContext.offlineNutrition.test.jsx`: offline after the transaction reports unreachable, builds on the cached day (Apple kept, Banana added) and comes back "queued"; skips the transaction when the phone knows it's offline; an uncached day starts empty; online writes once via the transaction ("saved"); a permission error is still thrown. Fails on the pre-fix code (4 of 5).
- **Date added**: 2026-10-28

### 104. Coach adherence scored water-only days and today's unfinished day as misses
- **Problem**: the coach's Nutrition Adherence card, monthly adherence, nutrition graph and calendar (`src/coach/CoachClientDetail.jsx`) counted a day as "logged" whenever its nutritionLogs doc existed, and tapping +250ml of water creates it. A water-only day then scored as logged-but-missed every calorie and protein target (non-adherence instead of not tracked), dragged the graph average toward 0, and showed "0 kcal logged" on the calendar. The 7/14/30-day window also ended today, so every morning's half-logged day counted as a miss. The coach dashboard's "Not tracking nutrition" flag already ignored water-only days, so coach views disagreed.
- **Fix**: `hasFoodLogged()` (`src/lib/nutritionLog.js`, at least one item in a meal) everywhere a day counts as logged (adherence, monthly %, coach and client graphs, calendar). Adherence is scored over completed days ending yesterday (`adherenceWindows`), and the card says so; the monthly % doesn't count today until food is logged.
- **Regression tests**: `src/coach/coachNutritionAdherence.test.jsx` (a water-only day isn't logged; a half-logged today doesn't lower calorie/protein consistency) and `src/lib/nutritionLog.test.js` (`hasFoodLogged`). Fails without the fix.
- **Date added**: 2026-10-28

### 105. Fuel IQ said "Added" before the save had happened
- **Problem**: `AiNutritionHelpCard.addSuggestion` (`src/client/ClientApp.jsx`) toasted "Added to today's food log." the moment it was tapped. `addFood` toasts again when the save lands, so a success showed two toasts and a failure showed "Added" followed by an error.
- **Fix**: the premature toast is gone; the only confirmation is `addFood`'s own ("… added to Lunch", naming the meal it went to, which can now be changed by tapping the entry, #107).
- **Regression tests**: `src/client/fuelIqDoubleLog.test.jsx` ("doesn't announce 'Added' itself"). Fails without the fix.
- **Date added**: 2026-10-28

### 106. Logging the same food to the same meal twice within a minute kept only one
- **Problem**: food-log entry ids were bucketed to the minute (`FoodQuantitySheet`'s `logIdRef` and `addFood`'s fallback id: food + minute) so a reopened sheet reconciled with a slow save. That also meant a deliberate second add of the same food to the same meal within that minute was silently dropped by `addFood`'s duplicate check, while the toast still said "added".
- **Fix**: every sheet opening, and every `addFood` call without a caller id, gets a fresh id (`newEntryId`). A retry of a failed save happens on the same open sheet (it stays open on failure and can't be closed mid-save) and keeps that sheet's id; the add buttons ignore a second tap while saving (and for 1.4s after a + succeeds, while its ✓ shows); offline saves now resolve at once (#103), so nothing invites a reopen-and-retry.
- **Regression tests**: `src/client/foodQuantitySheetRapidTapDoubleLog.test.jsx` ("reopening the sheet for the same food straight away gets a new id"; this deliberately replaces the old "reuses the same id" case, which asserted the bug). The same-sheet retry and double-tap cases there and in `foodQuantityDoubleAdd.test.jsx` still pass. Fails without the fix.
- **Date added**: 2026-10-28

### 107. Taps on buttons inside a swipe-to-delete row didn't register
- **Problem**: `SwipeableRow` (`src/client/ClientApp.jsx`) called `setPointerCapture` on every pointerdown, so the browser delivered the tap's click to the row instead of the button under the finger. Found while adding tap-to-edit on logged foods (it did nothing in a real browser, though jsdom tests passed); it also affected the saved-meal rows' +.
- **Fix**: the row captures the pointer only once a clear sideways drag starts (8px, more horizontal than vertical), and swallows the click that ends a swipe. Swipe-to-delete is unchanged.
- **Regression tests**: `src/client/swipeableRowTap.test.jsx` (a tap doesn't capture and reaches the button; a wobble or vertical scroll isn't a swipe; a swipe captures and its closing click isn't a tap). Fails on the old row (3 of 3); `swipeDeleteFreeze.test.jsx` still passes. Real-touch check in Chromium (iPhone 13 emulation, CDP touch events): tap opens the entry editor, swipe deletes without opening it.
- **Follow-up**: on a real iPhone this version could leave a swiped row stuck half-open — fixed in #109.
- **Date added**: 2026-10-28

### 108. Nutrition: faster logging (product change)
- **Change**: the Add Food bottom sheet is replaced by a full-screen **Add Food page** (`src/client/AddFoodPage.jsx`) that stays open between adds with a running tally ("3 added · 540 kcal", Done). The meal is picked in its header. Tabs: History (the client's **most-logged foods**, grouped by food not amount, re-logged at the last amount with one tap on +; tapping the row opens it at that amount) and My Meals (tap to **edit a saved meal**, + to log, swipe to remove). Tiles: Barcode scan, **Photo meal** (renamed from "Photo": it attaches a photo to a meal you build, it doesn't recognise food), Quick add, **Copy meal** (any meal from the last 14 days, in one save via `addFoods`). Search is **ranked and typo-tolerant** (`src/lib/foodSearch.js`: the client's own foods first, plain foods before brands/supplements, close matches for a typo, with a "showing close matches" note); a result's + logs its default serving. The quantity sheet becomes the **food page** in this flow (`FoodQuantitySheet layout="page"`): serving size, amount, a Meal picker, macro ring. **Tapping a logged entry edits it** (amount, unit, meal; `updateFood` keeps its id) or deletes it. An empty meal offers **"Same as yesterday"**; a meal's sheet has **Save as meal** and, on a past day, **Copy to today's …**. New entries store their source food (`src`) so they can be re-opened later; older entries re-open from the library, their gram weight, or as servings. The dashboard's Scan/Search tiles no longer show a separate "which meal?" popup: they start on the meal for the time of day and the food page's Meal picker changes it. Pages lock the screen behind them, contain their own scrolling, and close with a swipe from the left edge.
- **Tests changed deliberately**: the nutrition search/add tests (`nutritionAfcdFallback`, `nutritionDashboardQuickTiles`, `nutritionDuplicateAdd`, `nutritionKeyboardScrollSpacer`, `nutritionSearchButtonsCollapse`, `nutritionSearchCrashGuard`, `nutritionSearchKcalOnly`, `nutritionSearchKeyboardDismiss`, `nutritionWorkflowConsistency`) now drive the Add Food page (new placeholder "Search foods, brands, meals", "Log" button, + buttons labelled "Log <food>"). Each still checks what it was written for (double-tap guards, kcal-only results, AFCD only as a last resort, keyboard spacer and blur, malformed-name guard, correct meal/date/scaling). The meal-choice popup test is replaced by the Meal-picker test.
- **Regression tests (new)**: `src/client/nutritionFastLogging.test.jsx` (multi-add stays open with a tally; header meal switch; search + logs the default serving with `src`; typo shows close matches; frequent food opens at its last amount; edit amount and move meal in one save; delete from the editor; whole-meal entry edited in servings; same-as-yesterday; copy meal; save a logged meal as a My Meal; edit a saved meal), `src/lib/foodSearch.test.js` (ranking against the real library, typo fallback, history boost) and `src/lib/nutritionLog.test.js` (grouping, amount labels, re-opening old and new entries, servings scaling). Screenshotted at 390px in light and dark (Add Food page, tally, ranked and typo search, food page, copy meal, meal sheet, edit entry); touch-checked in Chromium: double-tap on + logs once, edge swipe closes the page, the page behind doesn't scroll.
- **Date added**: 2026-10-28

### 109. A swiped food could stick half-way open (red showing) on iPhone
- **Problem**: reported on a real iPhone right after #107 shipped: swiping a logged food left it stuck part-way, red delete area showing, neither deleted nor slid back. In `SwipeableRow` (`src/client/ClientApp.jsx`) the swipe only ended on a pointerup/pointercancel delivered to the row itself, the pointer-capture calls (`setPointerCapture`, now taken mid-gesture since #107; `releasePointerCapture` at the end) can throw for an iOS touch pointer and aborted the end handler before it deleted or snapped back, and the delete-or-snap decision read `dragX` from the last render (stale on a quick flick).
- **Fix**: once a swipe starts, window-level listeners (pointerup, pointercancel, touchend, touchcancel) guarantee it ends wherever the finger lifts; capture/release are wrapped (`safeCapture`) so a throw can't interrupt; the position is kept in a ref (`dragXRef`) so the decision uses where the row really is; and a tap on a row somehow left part-way open just closes it.
- **Regression tests**: `src/client/swipeableRowTap.test.jsx`: finger lifts off the row (deletes past the threshold); a short swipe ending as a touchend elsewhere snaps back; capture/release throwing still completes the delete; a move-and-release in one beat uses the real position. All four fail on the #107 version. Real-touch check in Chromium (iPhone 13 emulation): a short swipe snaps back, a fast flick deletes, a tap still opens the editor. Needs a check on a real iPhone (WebKit isn't available here).
- **Date added**: 2026-10-28

### 110. Client Home and Training: Concept A redesign (product change)
- **Change**: visual-only restyle of the coached client app to the approved "Concept A" mock-ups (`src/client/ClientApp.jsx`). Home: smaller greeting, open date strip, today's workout on a black-and-white gym photo card (`TodayWorkoutCard photo`), cardio rows and Daily Execution as open lists with dividers. Training > Today and > Program: a gym photo (`TrainingPhotoHero`) that fades into the page at the top and bottom, with today's workout (`TodayWorkoutCard photo="bare"`) or the current phase written on it; Today's actions as rows (`TrainingActionRow`); workout list with black-and-white thumbnails (coach photo, else `public/brand/workout-1..4.jpg`); new "Up next" list (the next three scheduled workouts after today, tapping opens the preview). No data, navigation or behaviour changes; Train Solo, coach console, TabHeader and the bottom nav are untouched.
- **Regression tests (new)**: `src/client/todayWorkoutCardPhoto.test.jsx`: both photo versions keep Start/View, View-only once completed, Resume with the two-tap discard confirm, and the empty-day message. The discard cases fail when the confirm is removed from the photo card (checked, then restored). Existing `discardWorkout` and `bodyStatsAndCardioEdit` tests still pass. Screenshotted from the real components with sample data at 430px in light and dark (Home incl. workout in progress; Program; Today completed / not started / nothing scheduled), no console errors; "Up next" tap opens the preview.
- **Manual check still needed**: on a real iPhone, the photo header under the white top bar and swiping a cardio row on Home.
- **Date added**: 2026-10-28

### 111. Home: "Nutrition Today" title half-drawn on iPhone
- **Problem**: reported from a real iPhone after #110: on Home the nutrition card's title showed "Nutrition" with "Today" only half drawn. The data was right. The card was a backdrop-filter glass card and its title changed length between days ("Nutrition" on other days, "Nutrition Today" today); iOS WebKit left the lengthened text part-painted over the blurred layer after switching back to today.
- **Fix**: `NutritionSummaryCard` (`src/client/ClientApp.jsx`, Home only) restyled to match the Concept A Home: an open section on the page (no glass, no backdrop-filter), title always "Nutrition" with a separate small "Today" label, calories as a large figure with "left", macros in three columns with thin bars, water row between dividers, solid Log food button. Same data, same actions (Log food, water +250/+500/-250, "Log food & water for today" on other days).
- **Regression tests**: `src/client/nutritionSummaryOpen.test.jsx`: same title on today and another day with no backdrop-filter; calories left plus Log food and water buttons call through with the right amounts; another day offers "Log food & water for today". The first case fails against the old card (glass + changing title), checked then restored. Screenshotted from the real Home component at 430px in light, dark and a past day, no console errors. The WebKit repaint itself can't be reproduced here (no WebKit); confirm on a real iPhone.
- **Date added**: 2026-10-28

### 112. Clients choose their own Light/Dark mode (product change)
- **Change**: the coached client app's theme was one coach-wide switch (Design Settings, `settings/appDesign.clientDarkMode`) applied to every client. Each client can now pick Light or Dark for themselves in Profile > Appearance, like Train Solo's toggle. The choice is saved on the phone per person (`localStorage` key `clientTheme_<userId>`), so it only changes that person's app; until a client picks, the coach's setting is the default (`resolveClientDark`, `readClientThemePick` in `src/client/ClientApp.jsx`). The coach's switch now reads "The default for every client's app…". The coach console has no light version (it is a dark-only design), so nothing changed there; Train Solo is untouched.
- **Regression tests**: `src/client/clientThemeChoice.test.jsx`: the coach default applies until the client picks and the pick then wins; picks are per person and invalid values are ignored; Profile shows Appearance with the current mode and calls the toggle. The first case fails when the pick is ignored (checked, then restored).
- **Note**: the choice is per phone (as Train Solo's is), not synced between a client's devices.
- **Date added**: 2026-10-28

---

## What still requires manual testing

These cannot reasonably be automated in this environment (no physical
device/hardware access, no real camera/file system, no third-party OAuth
sandbox):

- **Barcode scanning** (physical camera + `html5-qrcode`/`barcode-detector`
  reading a real product barcode). `src/lib/barcodeLookup.test.js` covers
  the pure parsing/lookup/confidence logic once a barcode string exists —
  it cannot exercise the camera itself.
- **"Macro Match" AI combo breakdown** (bug #49) — needs a live Anthropic
  API call through the deployed Cloud Function to confirm the model
  actually honors the new `contents` instruction in practice (the
  validation logic that checks whatever it returns is unit-tested in
  `functions/nutritionContents.test.js`, but cannot exercise a real model
  call from this environment).
- **Real camera access** for progress photos / check-in photos (browser
  `getUserMedia` permission prompt, actual device camera).
- **Real file-picker / photo upload** end-to-end (OS-level file picker,
  actual image compression/upload to Firebase Storage over a real
  network).
- **WHOOP integration** (real OAuth round-trip against WHOOP's servers,
  real webhook delivery into Cloud Functions, real recovery/sleep/strain
  data sync).
- **Voice notes, form-check videos and the lock-screen rest alert on a real iPhone** (1.0.3): the one-time microphone prompt, recording and playing back on iPhone, a coach's desktop-recorded note playing on the phone, filming a set from the workout (a 2-minute clip should compress and upload quickly), and "Rest's up" arriving on a locked phone (and not while the app is open).
- **Nutrition logging on a real iPhone**: the Add Food page and food page in the App Store build (WKWebView): swipe from the left edge to go back, rows scroll without the screen behind moving, the keyboard never hides the result being tapped, and in Aeroplane Mode a food logs with "saved on your phone" and appears for the coach after reconnecting.
- **Offline on a real iPhone** (1.0.3): open the app once online, then in Aeroplane Mode force-quit and reopen it — it should open (not a blank screen) and a workout finished offline should show "saved on your phone" and appear for the coach after reconnecting. First-ever open in Aeroplane Mode should show "You're offline … Try again".
- **Apple Health on a real iPhone** (1.0.3): the HealthKit permission sheet, the numbers HealthBridge.swift reads (steps, sleep, resting heart rate, weight) against the Health app, and that they appear on the client's Progress, the coach's client Progress panel and Train Solo Progress. Only a TestFlight build on a device can exercise this.
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
