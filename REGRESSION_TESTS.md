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
