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

### 113. Home: Nutrition back in a box (product change)
- **Change**: at the user's request the Home nutrition section from #111 is back inside a card, now a solid one (white with a hairline border and soft shadow; `CLIENT_DARK_SURFACE` in dark mode), not the old frosted glass. Same content and actions as #111; lighter dividers inside. The calories figure (28px to 22px) and Home's greeting (22px to 19px) are smaller. Still no backdrop-filter and the title is still always "Nutrition", so the #111 half-drawn-title fix holds.
- **Regression tests**: `src/client/nutritionSummaryOpen.test.jsx` (unchanged) still passes: same title on every day, no backdrop-filter, actions work. Screenshotted from the real Home component in light, dark and a past day.
- **Date added**: 2026-10-28

### 114. Going over calories showed "0 left" in green
- **Problem**: reported from a real phone: at 2,379 of 2,250 kcal, Home said "0 left" and the Nutrition tab "Calories remaining 0", both with a green bar. The remaining figure was clamped at zero (`Math.max(0, …)`), and the calorie bar only turned red past 10% over (`targetBarColor`), so 5.7% over read as on target.
- **Fix**: new `calorieStatus(value, target)` (`src/client/ClientApp.jsx`): once calories go over the target at all, Home shows "129 over" in red and the Nutrition tab's card reads "CALORIES OVER 129" in red, both with a red bar; exactly on target stays green, under stays blue. Home's macro bars now use the same `targetBarColor` rule as the Nutrition tab (red past 10% over, protein exempt), so the two screens agree. Macro rules are otherwise unchanged.
- **Regression tests**: `src/client/caloriesOver.test.jsx`: `calorieStatus` for under, exactly on, 1 over and 129 over (and no target); Home shows "129 over" in red with no "left". Both fail with the over state removed (checked, then restored). Screenshotted from the real Home card and Nutrition tab at 2,379 / 2,250.
- **Date added**: 2026-10-28

### 115. Coach Overview redesign (product change)
- **Change**: the coach Overview (`src/coach/CoachDashboard.jsx`) gets the approved photo-header look: the black-and-white gym photo (`public/brand/gym-dark.jpg`) behind the greeting, a large active-client count, then three frosted-glass tiles (Challenges, Check-ins to review, Messages to reply). Sections are open lists under a thin rule in the order Needs attention, Client-side errors (only when there are any), Recent activity, Coach's notes, Segments. The greeting box's own bell and initials (decorative, not tappable; the real ones are in the top bar) are gone. The coach mobile top bar (`CoachShell.jsx`) keeps its logo untouched; its bell is now a round frosted button with a blue unread dot and the profile photo has a fine ring, same actions (bell opens Notifications, photo opens Settings).
- **Same functionality**: active-client count → Clients; Challenges tile → Challenges; Check-ins → the single check-in sheet when exactly one is pending, else Clients; Messages → Messages (all as the old tiles did). Coach's notes keep the same save logic (Save only after an edit). Needs attention swipe/dismiss, Apex Insight sheet, Recent activity taps and Segments "View All" are unchanged. New only: "+N this week" shows next to active clients when there are new clients (the old tile's trend figure).
- **Regression tests**: `src/coach/coachOverviewLayout.test.jsx`: each number navigates to the same tab as before; notes Save is disabled until an edit and then saves. The navigation case fails when a link is pointed elsewhere (checked, then restored). Rendered the real component with sample data at 430px: no console errors, and clicking each number produced clients, challenges, messages, clients.
- **Date added**: 2026-10-28

### 116. Coached clients' app retried a refused listener forever
- **Problem**: found in the 2026-11-01 weekly audit. `AppContext.jsx` subscribed to `soloProgramContent` (every Train Solo program's full sessions) for every signed-in user, but firestore.rules only lets the coach read that collection. On every coached client's phone the listener was refused, logged "listener soloProgramContent failed, retrying: Missing or insufficient permissions", and `subscribeWithRetry` re-subscribed with backoff up to every 16 seconds for as long as the app was open. Wasted requests and battery and filled the console; no data was wrong (only the coach console reads it). Introduced 2026-10-19 (purchase-gated content).
- **Fix**: the `soloProgramContent` watch moved into the `role === "coach"` branch. Clients get `db.soloProgramContent` as `[]`, which nothing on the client side reads.
- **Regression tests**: `src/lib/AppContext.coachOnlyListeners.test.jsx`: a client never subscribes to `soloProgramContent`; the coach still does. The client case fails on the pre-fix code (checked). Live check: walking every client tab against production logged the error 10 times on the live build and 0 times on the fixed build.
- **Date added**: 2026-11-01

### 117. Food scanner reads QR and Data Matrix codes (meat packs with no barcode)
- **Change** (owner request 2026-11-02): fresh meat increasingly carries only a GS1 2D code, no barcode, and the scanner only read 1D barcodes. `src/lib/gs1.js` decodes GS1 Digital Link QR codes (any domain, `/01/` or `/gtin/`, AIs in the path or query) and GS1 element strings (Data Matrix with FNC1, `]d2`/`]Q3` prefixes, or the printed `(01)…` form): product number (check digit verified), net weight from AI 310n (kg) / 320n (lb), use-by from AI 17/15. `BarcodeScanSheet` (`src/client/NutritionFeatures.jsx`) now also asks for QR_CODE and DATA_MATRIX. A GS1 code resolves exactly like a barcode; a weighed pack (GTIN-14 indicator 9) skips Open Food Facts, is entered once from the label and remembered for everyone, and the food page opens at the pack's weight for that scan only (the library food is unchanged). A plain website QR shows "That QR code is a website link, not the product…" and keeps scanning. A pasted GS1 link in "type the code" works too.
- **Regression tests**: `src/lib/gs1.test.js` (Digital Link, brand domain, Data Matrix with FNC1, printed form, lb, end-of-month use-by, bad check digit, website QR, normalisation); `src/client/barcodeQrScan.test.jsx` (formats requested; remembered meat pack opens at 512 g; first-time weighed pack asks for its label once; packaged product's QR uses its EAN; website QR logs nothing) — all 5 fail on the pre-change scanner (checked). Live check: a generated GS1 QR fed to Chromium as a fake camera was read by the app's real decoder in 0.4 s, recognised as a weighed pack with "pack weight 512g", no console errors.
- **Not yet checked**: real Woolworths/Coles meat-pack codes (a retailer could use its own URL format) — confirm with a few real packs.

### 118. Train Solo free trial: 10 days → 7 days (owner decision 2026-11-02)
- **Change**: Apple's introductory offers only come in fixed lengths (3 days, 1 week, 2 weeks, 1 month…), so the approved 10-day trial can't exist in the App Store. Owner chose 1 week on both stores. `PLANS` in `src/solo/soloAccess.js` and `functions/soloSubscriptions.js`: `trialDays: 7` on both yearly plans (monthly stay 0). The iPhone paywall already shows Apple's own trial length (PurchasesBridge.swift turns "1 week" into 7). ROADMAP.txt step 2 and CLAUDE.md updated. (Numbered 118 to follow main's #116–#117; the branch's earlier 103–106 were renumbered 119–122 when main was merged in.)
- **Regression tests**: `src/solo/soloAccess.test.js` and `functions/soloSubscriptions.test.js` (7-day trial on yearly only, server and app agree), `src/solo/subscriptionGates.test.jsx` (paywall shows "7 days free" and "Start 7-day free trial"; App Store trial from the store). 194 Train Solo tests pass.

### 119. Opening the app sat on a white "M" splash for over a second
- **Problem**: a cold open on 1.0.3 (TestFlight screen recording) went native spinner → white page → grey "M" splash for ~1.2s → dashboard showing "0 active clients", then 7. Everything after the main script ran one step after another: Firebase restoring the session, then reading `users/{uid}` (`sessionLoading` in `AppContext.jsx`), and only then downloading and running the coach console or client app code (`lazy()` in `App.jsx`). That code also always carried the barcode scanner library (`html5-qrcode` + `barcode-detector`, ~410KB of its ~1.3MB), imported at the top of `NutritionFeatures.jsx`. The page and splash were white even for the dark coach console.
- **Fix**: (1) `AppContext.jsx` keeps the signed-in profile on the phone (`PROFILE_CACHE_KEY`) and uses it as soon as Firebase confirms the same uid, so the app opens without waiting on the profile read; the live snapshot replaces it, an offline "not in cache" snapshot doesn't wipe it, and a confirmed sign-out clears it. It is never used for a different uid, and the app still waits for Firebase Auth before showing anything (no writes can happen signed out). (2) `App.jsx` reads that saved role at startup and starts loading `CoachShell`/`ClientApp` immediately, in parallel with sign-in. (3) The scanner libraries load only when the scan sheet opens (`loadScannerLib()`), with a "Couldn't load the scanner" error and retry if that fails. (4) For a coach, `index.html` paints the page near-black before any script and the splash is dark; `NativeStatusBarSync` clears that off coach routes. (5) Dashboard stat tiles show "–" until their data is in, not "0".
- **Regression tests**: `src/lib/AppContext.profileCache.test.jsx` (same account opens before the profile read answers; another account's saved profile is never used; live profile replaces and re-saves; offline cache miss keeps it; sign-out clears it). 4 of 5 fail on the pre-fix `AppContext.jsx`. Checked in Chromium at 4x CPU slowdown against a production build: with a saved coach session the console code is requested ~250ms after start (before sign-in finishes), the console renders with no page errors, and signed-out and expired-session opens still land on /start with the dark paint cleared. Running the coach console code dropped from a median 270ms to 233ms there. The real-phone timing can only be checked on a device.
- **Date added**: 2026-10-28
- **Merge note (main merged in 2026-11-02)**: main's Coach Overview redesign (#115) replaced the stat tiles with GlassTiles and a big active-clients figure; those now also show "–" until `usersReady`/`dbReady`, as this entry requires.

### 120. Train Solo subscriptions: Free / Plus / All Access (feature, owner-approved 2026-10-28)
- **Change**: tiers and gates (`src/solo/soloAccess.js`), All Access enrolments with one active program and pause/resume (`src/solo/enrolments.js`, calendar `untilDate`/`locked` in `soloCalendar.js`), own multi-week programs for Plus (`customPrograms.js`, `SoloProgramBuilderScreen.jsx`), the paywall (`SoloPaywall.jsx`), Stripe subscriptions and RevenueCat (Apple) on the server (`functions/soloSubscriptions.js`, `index.js`), entitlement/enrolment/content rules (`firestore.rules`), the iPhone purchase bridge (`src/lib/purchases.js`, `ios/ApexCoach/PurchasesBridge.swift`), and the coach console launch switch. All gates are off until `settings/soloMonetisation.live`.
- **Owner rules locked in by tests**: a failed payment (Stripe past_due/unpaid/incomplete/canceled/paused, Apple billing issue/expiry/refund) is Free immediately, even mid-period; an expiry date in the past is Free even with no server update; one free trial per customer; the approved prices and 10-day trial on yearly only; Free keeps 3 saved sessions (editing existing ones is always allowed); bought programs stay owned after launch; single programs can't be bought once live.
- **Regression tests**: `src/solo/soloAccess.test.js`, `src/solo/enrolments.test.js` (bought beats enrolled, lapsed = locked, switching pauses at the current week, resume keeps the week, paused program shows only history and can't be started), `src/solo/customPrograms.test.js`, `src/solo/subscriptionGates.test.jsx` (rendered screens: unchanged before launch; after launch no single price, paywall prices/trial/monthly, no second trial, Plus purchase, add-ons need Plus, bought program kept, All Access start/switch/resume, iPhone build without IAP says update with no website prices, 1.0.4 bridge buys via the App Store with Apple's prices and Restore, 3-session limit, subscriber sees Manage), `functions/soloSubscriptions.test.js` (Stripe and RevenueCat to entitlement, both stores, checkout decision incl. upgrade instead of a second subscription and never re-selling an Apple subscriber), and the Firestore emulator suite (`firestoreRules.rules.test.js`: entitlement server-only, All Access reads published content only while paid up, lapsed/expired/0 can't, enrolment alone grants nothing, enrolment id pinned to `{uid}_{programId}`, launch switch coach-only, own programs owner-only). Validated: breaking the tier check, the failed-payment rule and the rule's expiry check each makes these tests fail.
- **Not exercised here**: real Stripe/App Store payments, RevenueCat webhooks and the Swift bridge compiling (no Xcode in this environment) — see manual testing below.
- **Date added**: 2026-10-28

### 121. Instant open in the iPhone app (1.0.4 native) and the stale-copy guard
- **Problem**: after the web-side fixes (#119), every launch still waited on a network round trip: ViewController.swift loaded the site with `.useProtocolCachePolicy`, which revalidates index.html with the server before anything draws (~0.5s spinner, longer on mobile data). And when iOS ended the page's process in the background, the app came back blank.
- **Fix**: `ios/ApexCoach/ViewController.swift`: once the site has loaded once (`apexHasSavedCopy`), launches use `.returnCacheDataElseLoad` (the phone's saved copy). `checkForNewVersion()` then fetches the live index.html in the background and compares its `/assets/index-<hash>.js` with the running page's; if a newer release is live it sets `apexSavedCopyStale`, so the NEXT launch loads fresh (never a reload mid-session). `webViewWebContentProcessDidTerminate` reloads the page. `index.html`: an inline stale-copy guard — if a script or stylesheet under `/assets/` fails to load, or Vite reports `vite:preloadError` for a lazy screen, reload once per session (`apexStaleCopyReload`), never in a loop.
- **Regression tests**: `src/staleCopyGuard.test.js` (missing main script / stylesheet / lazy chunk reloads exactly once; fonts, images and other sites ignored) — fails with the once-per-session check removed. In Chromium against a production build: a stale index.html pointing at a missing `/assets/index-OLD.js` reloaded once and the app rendered; a permanently stale page reloaded exactly once, no loop. The native part has no automated test here (no Xcode) — manual check below.
- **Date added**: 2026-10-28

### 122. Train Solo: a cancelled subscription still read as plain "You have Plus"
- **Problem**: after cancelling (Stripe portal or iPhone Settings) the customer keeps their plan to the end of the period, but Profile and the paywall gave no sign it wouldn't renew or when it ends.
- **Fix**: the server's Stripe section also records `cancelAt` (`functions/soloSubscriptions.js`); `planRenewal()` / `renewalText()` in `src/solo/soloAccess.js` read Stripe's `cancelAtPeriodEnd`/`cancelAt` and Apple's `willRenew`. Profile's Subscription row and the paywall now say "Renews 12 Dec", "Won't renew · ends 12 Dec" (+ "you keep everything until then"), or "Free trial · first payment / ends 12 Dec". No price anywhere in it (3.1.1).
- **Regression tests**: `src/solo/soloAccess.test.js` (renewing, cancelled at period end, cancelled to a date, Apple unsubscribed, trial wording, year only when not this year), `src/solo/subscriptionGates.test.jsx` (rendered Profile row + paywall after a website cancel; Apple renewal line), `functions/soloSubscriptions.test.js` (portal cancel recorded, still paid up).
- **Date added**: 2026-10-28
- **Date added**: 2026-11-02

---

### 123. Server deploys and CI on main were failing (2026-11-02)
- **Problem**: (1) Google decommissioned the Node.js 20 Cloud Functions runtime on 2026-10-30, so "Deploy Cloud Functions" refused to deploy anything (Train Solo subscription functions included). (2) CI's lint step failed on main since #117: oxlint's rules-of-hooks read the gs1.js helper `useByDate()` as a React hook call.
- **Fix**: `functions/package.json` (and its lockfile) `engines.node` 20 → 22, deploy workflow `node-version: 22`. gs1.js helper renamed `expiryDateOf`; no behaviour change.
- **Regression check**: functions tests (39) and full web suite pass; `npm run lint` exits 0; watch the next "Deploy Cloud Functions" run on main go green.

### 124. iPhone paywall: no prices and a silent grey button when the App Store returned nothing
- **Problem**: on TestFlight 1.0.4 the paywall showed the plans with no prices and a greyed Subscribe button, with no reason. If RevenueCat/StoreKit returned an error or no products (e.g. the Paid Apps Agreement not yet active, products not ready), `SoloPaywall` swallowed it, cached the empty list and never asked again that session.
- **Fix**: `SoloPaywall.jsx` keeps the error and shows "Subscriptions aren't available right now. Please try again later. (reason)" under the button (no website mention, 3.1.1), and asks the App Store again on each open until it has products.
- **Test**: `subscriptionGates.test.jsx` — an App Store error shows the reason; reopening retries and then shows Apple's price.
- **Regression check**: existing paywall tests (Apple prices, purchase to the App Store, update-the-app on old builds, website prices) pass; full suite, lint, build.

### 125. Train Solo membership sheet: clearer glass, premium layout (design change, owner request 2026-11-02)
- **Change**: the paywall's title is "Train Solo Membership" (free) / "Your membership" (paid), was "Go further with Train Solo" / "Your plan". The sheet uses its own clearer glass (`paywallSurface` in `SoloPaywall.jsx`: 58–60% fill, 40px blur, saturate 180%) instead of the denser standard Solo sheet glass; plan tiles are thinner glass panes with the plan name in small spaced capitals, the price as a large figure ("–" while the App Store prices load), a check-circle selector, a blue hairline + soft blue ring when selected, and a divider above the features. Solo only; shared BottomSheet untouched (passes `surface`).
- **Follow-up 3 (owner: "make it even clearer")**: backdrop `bg-black/10`; light sheet 30% white with blur 30px, saturate 190%, brightness 1.12; dark 38%; tiles 30% white / 4%. A 14% fill was tried and rejected: text over dark page content (e.g. a photo card) became hard to read.
- **Follow-up 2 (owner: "it looks grey, not transparent")**: the standard 50% black backdrop plus a 60% fill read as flat grey. The membership sheet now passes `backdropClassName="bg-black/15"` (new optional BottomSheet prop, default `bg-black/50` so every other sheet is unchanged) and clearer glass: light 30% white, blur 30px, saturate 190%, brightness 1.1; dark 42%; tiles 26% white / 5% with a white hairline. Rendered light and dark: page colour shows through, text readable.
- **Follow-up (same day, seen on TestFlight)**: with no App Store prices the empty price row left a gap in each tile and the raw RevenueCat error filled the bottom of the sheet. The price row now only shows with a price (or "–" while loading), and the reason sits behind a "Details" tap under one short line (test updated).
- **Regression check**: `subscriptionGates.test.jsx` (titles updated) and all Solo tests pass; light and dark rendered at 390px wide with Playwright: no overflow, text readable over the page, CTA and legal text unchanged.

### 126. Coached client app felt slow: food logs, edits, targets and the logo all waited on the server (2026-11-03)
- **Problem (owner report)**: "logging yesterday's meal slow, editing nutritional stats slow, top left corner logo slow". Causes found:
  1. Every food, water tap, food edit/move/remove and copied meal went through `setNutritionForDate`, a Firestore **server transaction**: nothing showed until a round trip (read + commit) to the server finished.
  2. Finishing/editing a workout, cardio, weigh-ins, progress photos, rescheduling, the client's own workout edits and preferences all `await`ed the server (up to 4s via `savedOrQueued`).
  3. The Nutrition Goal editor ("editing nutritional stats") awaited the server before closing, and lived inside `CoachClientDetail.jsx`, so the client app loaded the whole coach client screen, workout editor, meal-plan builder and their chart code at every start (~270 KB of minified JS).
  4. The top-left logo stayed invisible on every open until a server request answered (`appLogo.js`).
  5. With no messages/logs yet, `|| []` gave memos and an effect a new array every render, so they recomputed on every screen update.
- **Fix**: local-first saves. `localFirst()` (`src/lib/offlineWrite.js`) returns as soon as Firestore's on-phone cache has the write ("saved", or "queued" offline) and reports a later server refusal through `onLocalWriteFailed`, which the client app shows as a red toast (never silent). `setNutritionForDate` applies the change to the phone's copy of the day (`getDocFromCache`) and saves with `setDoc`; saves to the same day run one after another (`nutritionDayQueue`) so quick logs build on each other; a day missing from the phone counts as empty only after the server has answered the nutritionLogs listener (`serverSyncedKeys`, metadata-only snapshots are not re-rendered), otherwise it is read from the server once. Client call sites wrap their saves in `localFirst` (coach console behaviour unchanged where it shares a function: `updateWorkoutLogEntries(..., { localFirst: true })`, `NutritionTargetsCard saveLocalFirst`). `NutritionTargetsCard` + TDEE calculator moved to `src/coach/NutritionTargetsCard.jsx`; `WorkoutEditor` is lazy in the client app (coach view-as only). The logo shows this phone's last server-confirmed answer at once and swaps once if the server says it changed (first-ever open still waits). Shared `EMPTY_LIST` for empty client lists.
- **Trade-off (accepted for speed)**: the transaction also guarded against two DIFFERENT devices saving the same day at the same instant; now the later of two near-simultaneous saves from different devices wins. Saves on one phone never overwrite each other.
- **Tests (fail without the fix)**: `AppContext.offlineNutrition.test.jsx` (7: saved at once online with the server silent, queued offline, two quick saves keep both, a day not on the phone is read from the server once, a new day starts empty, a refusing updater writes nothing, a late server failure is reported) — all 7 fail on the old code; `logoFallback.test.jsx` (remembered logo shows before the server answers; swaps when the server confirms a new one) — both fail on the old code; `nutritionTargetsCardFastSave.test.jsx` (client closes without waiting; coach still waits) — fails on the old code; `AppContext.offlineFinish.test.jsx` updated (finish returns at once online, queued offline, client edit returns at once).
- **Regression check**: full suite (757 passed), lint (0 errors; the "changes every render" warnings are gone), production build; client start chunks before/after: ClientApp 346 KB + shared 774 KB → ClientApp 346 KB + shared 508 KB (foodDatabase unchanged, needed for local search).

### 127. Messaging: tabs over the keyboard, long messages out of sight, Return sent the message (2026-11-03)
- **Problem (owner screenshot, coach Messages on iPhone)**: (1) the coach console's bottom tab bar stayed between the message box and the keyboard; (2) the message box was a one-line `<input>`, so a long message scrolled out of view while typing; (3) Return sent the message (`onKeyDown Enter → send`), so there was no way to start a new paragraph. The same one-line, Return-sends box was used in the client's chat with their coach and both group chats.
- **Fix**: `src/components/MessageComposerInput.jsx` — a textarea that grows with the text up to ~6 lines, then scrolls; on a phone (`pointer: coarse`) Return adds a new line and only the send button sends; with a real keyboard Enter sends and Shift+Enter adds a line. Used in the coach thread (`CoachMessages.jsx`), the client thread and client group chat (`ClientApp.jsx`) and the coach group chat (`CoachGroups.jsx`). The video/PDF/photo buttons step aside while there's text so the message gets the width. `src/lib/textEntryFocus.js` `useTextEntryFocused()`: CoachShell hides its mobile tab bar while a text field has focus, and the Messages screen drops the tab bar's space and the home-bar padding while typing. Group @mention picking now replaces only the word being typed (it used to collapse new lines into spaces). Message bubbles already keep line breaks (`whitespace-pre-line`).
- **Tests**: `src/components/messageComposer.test.jsx` (5): multi-line box; phone Return never sends and isn't prevented; keyboard Enter sends, Shift+Enter doesn't; typing detection on/off; only text fields count. They fail on the old code (the component and hook didn't exist; the old box was an `<input>` that sent on Enter).
- **Regression check**: full suite (761 passed), lint, build.

### 128. Coach and client messaging: premium chat design (design change, owner request 2026-11-03)
- **Change**: shared `src/components/Chat.jsx` for the coach thread (`CoachMessages.jsx` ThreadMessages) and the client's Messages (`ClientApp.jsx` MessagesSheet). Your own messages are MEASURE_BLUE with white text; theirs quiet charcoal (dark) or white with a hairline (client light theme). Messages from the same person within 5 minutes group together (3px apart, joined corners, one time under the group); each day starts with a small spaced-caps divider (Today / Yesterday / date). The composer is one row: a single + that opens Photo / Video (client: Form check) / PDF chips (and shows upload progress), the growing message box (#127), and a round blue send arrow (mic while empty). The client sheet's title is the coach's name. Voice notes on the blue bubble use white labels; attachment chips match the bubble. No behaviour changes: same send/upload/voice-note/form-check reply code paths and placeholders.
- **Regression check**: full suite (761 passed, including `CoachMessages.test.jsx` draft-isolation and `coachFormCheckReply.test.jsx`), lint (no new warnings in the changed files), build; rendered the coach thread (dark) and client thread (light) at 390px with Playwright, including the attach chips and a multi-paragraph draft growing the box.

### 129. Client videos took too long to load for the coach (2026-11-03)
- **Problem (owner report)**: watching clients' message/form-check videos took too long to start. Causes: (1) clips that weren't re-encoded on upload (under 8MB, or the re-encode didn't shrink them / wasn't available) kept the phone's layout with the index ("moov" box) AFTER the video data, so a player had to download the whole file before it could start; (2) video uploads had no cache header, so every re-watch downloaded the clip again; (3) every `<video>` in a thread used the default preload, so opening a thread could start pulling several clips at once.
- **Fix**: `ensureFastStart` (`src/lib/videoCompress.js`): when an MP4/MOV's `mdat` comes before `moov` (`moovAfterData`, reads only the box headers), mediabunny re-packages it as MP4 with the index first — tracks copied, no re-encode (0.3s for a test clip). Used by `uploadMessageVideo` for clips that weren't compressed (compressed ones already use `fastStart: "in-memory"`). Video uploads now carry `cacheControl: public, max-age=31536000, immutable` (each path is unique and never rewritten). Chat players (coach `CoachMessages.jsx`, client `ClientApp.jsx` Messages) use `preload="metadata"` and `#t=0.001` (first frame shows, the clip downloads when played). Videos already uploaded keep their old layout/headers.
- **Tests**: `src/lib/videoFastStart.test.js` (4): detects index-after-data, re-packages with tracks copied and fast start on, leaves fast-start / non-MP4 clips alone, upload carries the cache header — 3 fail on the old code (the 4th, "leave alone", passes either way). `videoUploadCompression.test.js` mock updated. Real-file check: an ffmpeg-made MOV with moov at the end came out moov-first, `video/mp4`, and played its full 4s in Chromium.
- **Regression check**: full suite, lint, build; compression path, size limit and upload progress unchanged.

### 130. Emoji reactions on coach ↔ client messages (feature, owner request 2026-11-03)
- **Change**: press and hold a message (right-click on a computer) to pick ❤️ 👍 😂 😮 💪 🔥; picking your current one again removes it. One reaction per side per message, stored on the message as `reactions: { coach?, client? }` and shown as a small pill on the bubble's bottom corner. `ChatBubble` (`src/components/Chat.jsx`) gains `reactions` / `myReaction` / `onReact` (no picker without `onReact`; a bubble you can react to turns off text selection so the hold isn't taken by iOS's copy menu). `reactToMessage(messageId, role, emoji|null)` in `AppContext.jsx` (local-first `updateDoc`, `deleteField` to remove). Wired into the coach thread (`CoachMessages.jsx`) and the client's Messages (`ClientApp.jsx`). `firestore.rules` messages: a client may now update ONLY `reactions.client` on messages in their own thread (text, sender and the coach's reaction stay coach-only); deployed with the rules on the next production build (`scripts/deploy-firestore-rules.js`).
- **Tests**: `src/components/chatReactions.test.jsx` (5): hold opens the picker and picking reacts; a quick tap or a scroll doesn't; right-click opens it and re-picking your reaction removes it; both sides' reactions show; no picker without `onReact`. They fail without the feature (no picker/props existed).
- **Regression check**: full suite (770 passed), lint, build; chat send/attachments/voice notes/form-check replies unchanged.

### 131. Holding a message popped up iPhone's Copy / Look Up / Translate (2026-11-03)
- **Problem (owner screenshot)**: press-and-hold for a reaction (#130) also started iPhone's text selection and showed Copy / Look Up / Translate. Only the bubble itself had selection turned off, so iOS selected nearby text (the time, other messages, the area by the message box) instead.
- **Fix**: `NO_TEXT_SELECT` (`src/components/Chat.jsx`: user-select none + `-webkit-touch-callout: none`) on the whole message list in the coach thread (`CoachMessages.jsx`) and the client's Messages (`ClientApp.jsx`); the bubble also blocks `selectstart`, and any selection that still slipped through is cleared (`getSelection().removeAllRanges()`) the moment the reaction bar opens. The message box itself is outside the list, so typing, selecting and pasting there still work.
- **Tests**: `chatReactions.test.jsx` — holding clears the selection and opens the bar; the list style opts out of selection. Fails on the #130 code (no `NO_TEXT_SELECT`, selection never cleared).
- **Regression check**: full suite (771 passed), lint, build; reactions, attachments, voice notes, form-check reply unchanged. Needs confirming on a real iPhone (jsdom can't show the iOS callout).

### 132. Black screen after buying a subscription in the iPhone app (TestFlight 1.0.4, 2026-11-03)
- **Problem (owner screenshots)**: Apple's In-App Purchase sheet showed over an already-black page, and after tapping Subscribe the app stayed on a black screen. The web purchase code was fine (`SoloPaywall` `buy()` waits for the native reply, refreshes the entitlement, closes the sheet); the page itself had gone while the system sheet was up and iOS didn't call `webViewWebContentProcessDidTerminate`, so nothing reloaded it.
- **Fix (native, needs the next build)**: `ViewController.swift` observes `UIApplication.didBecomeActiveNotification` (fires when Apple's sheet, Face ID or another app hands back) and runs `checkPageAlive`: asks the page for `#root`'s child count; an error, no answer within 2s, or 0 means the page is gone, so it reloads (`loadSite`, saved copy opens instantly). Skipped while a load is in progress. The purchase is recorded by Apple/RevenueCat either way; after reload the entitlement is read again.
- **Tests**: native only — no Swift toolchain in CI; reviewed by hand. Verify on the next TestFlight build: buy a plan; after the sheet the app must show Train Solo (not black), and Profile shows the new plan.
- **Regression check**: web suite unaffected (no web change); existing process-termination reload kept.

### 133. A TestFlight purchase didn't unlock Plus (2026-11-03)
- **Problem (owner)**: after buying Plus monthly (sandbox) the page went black (#132); after reopening, the account was still Free (paywall offered plans, 3-session limit). The web only asks the server to re-read the App Store (`syncSoloEntitlement`) right after the native "purchase done" reply — which never arrived because the page was gone — or on Restore purchases; otherwise it depends on RevenueCat's webhook.
- **Fix**: `SoloAppContext.jsx` — in the iPhone app, after identifying the purchaser on sign-in, call `syncSoloEntitlement` once per open, so a purchase whose reply was lost unlocks on the next open. Server code unchanged.
- **Tests**: `src/lib/SoloAppContext.syncOnOpen.test.jsx` — the sync is called once after sign-in in the iPhone app; fails without the fix.
- **Still to check (owner)**: if Restore purchases also says "No subscription found", the purchase isn't reaching our server — check RevenueCat → Customers (Sandbox data on) for the purchase and its App User ID, and that the webhook sends Sandbox events.

### 134. iPhone purchase: black screen, a second purchase, and still Free (TestFlight 1.0.4, 2026-11-03)
- **Problem (owner screenshots)**: the page was already black behind Apple's In-App Purchase sheet, stayed black after "You're all set", and a tap on the black screen opened Apple's sheet again (bought twice). So the page wasn't gone, just not drawn: its code still ran and took taps. #132's native check counts `#root`'s children, which are still there, so it can't catch this. The account also stayed Free after the purchases.
- **Fix (web + server, no new build needed)**:
  - `SoloPaywall.jsx` `buy()` (iPhone app): once Apple's sheet answers (bought, cancelled or error) the outcome goes in sessionStorage (`apexSoloPurchaseOutcome`) and the page reloads (`paywallPage.reload`), so it is drawn again and there is no invisible Subscribe button to tap. After the reload `SoloPaywallProvider` asks the server once (`refreshSoloEntitlement`) and opens the membership sheet with "You're in — welcome to …", or, if the server still says Free, says Apple confirmed it but it hasn't reached the account yet (never a false "You're in"). An App Store error is shown after the reload; a cancel shows nothing. Shown once (older than 10 min is dropped).
  - `functions/soloSubscriptions.js` `appleSourceFromSubscriber`: besides RevenueCat's `plus` / `all_access` entitlements, an active subscription to one of our own product ids (`apex_solo_<plan>`) now unlocks its tier, so a purchase can't stay Free because the entitlements are named or attached differently in RevenueCat. Expired, refunded or unknown products still give nothing.
- **Tests**: `src/solo/subscriptionGates.test.jsx` "after Apple's purchase sheet (#134)" (reload + confirmed plan, shown once; server still Free → honest message; error shown / cancel silent) and the updated 1.0.4+ purchase test; `functions/soloSubscriptions.test.js` (product-id unlock, All Access over Plus, expired/refunded/foreign products). All 6 fail without the fix (4 web, 2 server).
- **Regression check**: full suite 777 passed; `vite build` clean. Website (Stripe) purchase path and Restore purchases unchanged.
- **Also**: the Subscribe button stays disabled from the tap until the reload, so it can't start a second purchase (test asserts it; fails without the `reloading` guard).
- **Owner confirmed (2026-11-03)**: after swiping the app away and reopening, Profile showed "Train Solo Plus · Renews 4 Nov · App Store", so the server side (#133 sync on open) works. The broken part was the black screens; see #135 for the native half.
- **Still to check (owner)**: on the iPhone, buy once; after Apple's "You're all set" the app should reload into Train Solo and say which plan you have.

### 135. Black screen behind and after Apple's purchase sheet — native cover (needs the next 1.0.4 build, 2026-11-03)
- **Problem (owner screenshots, TestFlight 1.0.4)**: the page was black behind Apple's In-App Purchase sheet and stayed black after "You're all set"; taps still reached the invisible page. #134's web reload redraws it after the sheet, but not during it.
- **Fix (native)**: `PurchasesBridge.swift` asks `ViewController.coverPageForPurchase` to cover the page before it calls `Purchases.shared.purchase`. That method lays a still picture of the page (`takeSnapshot`) over the webview and only then shows Apple's sheet; the picture takes all taps. `purchaseSheetDidFinish` runs when the sheet answers. If the page hasn't started reloading itself within 2s (an older saved copy without #134), it reloads it from native (`loadSite`). The cover fades out 0.6s after that load finishes (`didFinish`) and never stays up more than 12s. `checkPageAlive` (#132) is skipped while the sheet or cover is up.
- **Tests**: native only, no Swift toolchain here; reviewed by hand. Web half covered by #134's tests.
- **Verify on the next TestFlight 1.0.4 build**: buy (or cancel) a plan. Behind Apple's sheet you should see "Opening the App Store", not black. After "You're all set" you should see "Confirming your membership", then "Welcome to …" (#136). Tapping during that time does nothing.

### 136. The purchase flow must look premium end to end, never a black screen (owner, 2026-11-03)
- **Problem (owner)**: buying in the iPhone app went: membership sheet → black page behind Apple's sheet → black after "You're all set" → the paywall popping back up with a line of text. It needs to read as one premium moment.
- **Change**: new `src/solo/SoloPurchaseScreens.jsx`, two solid full-screen states (Solo page colour, APEX mark, strong type, thin MEASURE_BLUE progress line, no glass, so there's nothing heavy for WebKit to draw while Apple's sheet is up):
  - `SoloPurchaseStage`: "Opening the App Store" replaces the glass membership sheet the moment Subscribe is tapped. `buy()` waits two frames so it is painted before Apple's sheet opens, which makes it the picture the native cover (#135) shows behind Apple's sheet. After the reload, "Confirming your membership" is the first thing on screen while the server is asked.
  - `SoloWelcomeScreen`: once the server confirms, "Membership active / Welcome to Plus." (or All Access), the renewal line ("Renews 4 Nov · App Store"), the plan's features under thin dividers, and START TRAINING. This replaces the "You're in" line in the paywall.
  - The server is asked twice, 2.5s apart, before saying the purchase hasn't reached the account (RevenueCat can lag). The confirming screen never stays more than 20s. Errors still reopen the membership sheet with Apple's message; a cancel shows nothing.
- **Tests**: `src/solo/subscriptionGates.test.jsx` "after Apple's purchase sheet (#134)": "Opening the App Store" replaces the sheet on tap; the reload opens on "Confirming your membership" (never the paywall); the welcome screen shows the confirmed plan, and START TRAINING closes it; a server that catches up on the second ask still welcomes them; still Free after two asks → honest message, no welcome. Screens checked rendered at iPhone size in Chromium (dark and light).
- **Flow on the next TestFlight 1.0.4 build (with #135)**: Subscribe → "Opening the App Store" → Apple's sheet over that same screen → "You're all set" → "Confirming your membership" → "Welcome to Plus." No black at any point. On the build installed now (no #135), the black behind Apple's sheet can still show, but the app recovers into Confirming → Welcome by itself.

### 137. Train Solo unlock sweep: paying members treated as Free on every open (2026-11-03)
- **Sweep**: every paid gate checked, Free → Plus → All Access: suggested weights, program builder, full stats, Apple Health on Progress, recovery add-ons, unlimited saved sessions (Plus); catalogue programs (All Access), plus the server side. `canUse`/`FEATURE_TIER` are consistent at every call site; All Access includes every Plus feature (client `tierAtLeast`, server `plusUntil`); catalogue content stays behind firestore.rules `hasAllAccess()`; the entitlement doc is server-written only.
- **Bug (confirmed)**: `soloEntitlement` started as null (Free) on every open until its Firestore listener answered, while the launch switch (public doc) usually answered first. In that gap a Plus or All Access member was gated as Free: Program Builder opened the paywall by itself, and All Access programs, custom programs and the catalogue flashed locked.
- **Fix**: `SoloAppContext.jsx` keeps this phone's last confirmed entitlement for the signed-in account (`apexSoloEntitlement`, uid-checked, same pattern as the coached app's profile cache) and starts from it. The server's copy replaces it as soon as it arrives. An empty answer from Firestore's own cache isn't taken as an answer. Expiry is still checked against the clock, and paid content stays behind the rules either way. New `soloEntitlementReady`: Program Builder's automatic paywall waits for it. Also, a Plus member opening the membership sheet always gets All Access preselected (Plus is hidden for them), so the buy button is never missing.
- **Tests**: `src/lib/SoloAppContext.entitlementCache.test.jsx` (saved plan applies before the server answers; nothing saved → not ready, then the server's plan is used and remembered; the server's answer replaces a saved one, so a lapsed plan is Free at once; another account's saved plan is ignored; an expired saved plan is Free). All 4 fail without the fix. `src/solo/subscriptionGates.test.jsx` "unlock sweep": full stats per tier; program builder paywall on Free only and never before the plan loads (fails without the fix); recovery add-ons open for Plus and All Access; catalogue programs need All Access, not Plus; Plus → All Access upgrade has its buy button.
- **Regression check**: full suite passes; `vite build` clean.

### 138. Train Solo "Build a session" → Add Exercise looked messy with the keyboard (owner screenshot, 2026-11-03)
- **Problem**: Add Exercise opened with the keyboard already up (its search had `autoFocus`), so the keyboard and its toolbar covered half the exercise list straight away. The session page behind ("V-Bar Pushdown" and its controls) also showed through the strip between the sheet and the keyboard. The sheet ends where the visible area ends, but the iPhone keyboard (iOS 26's floating one) has see-through margins, and the iPhone app's webview reaches a little under the keyboard (`ViewController.keyboardWillChangeFrame` leaves the bottom safe-area strip), so the bare page showed there.
- **Fix**: `AddExerciseSheet` (`ClientApp.jsx`, shared by Train Solo's session builder and workout and the coached workout): no autofocus, so the list opens first and the keyboard comes up only when Search is tapped. `BottomSheet` (`ui.jsx`, every sheet in the app): the sheet's own surface continues 100vh below the panel (`sheet-under-keyboard`, same fill/glass as the panel, off-screen when no keyboard is up), and the backdrop runs below the visible area too. Whatever the keyboard leaves see-through shows the sheet, never the page.
- **Tests**: `src/components/bottomSheetUnderKeyboard.test.jsx`: the surface continues below in light, dark and Solo glass; the backdrop extends; Add Exercise opens unfocused with the list shown. All 3 fail without the fix. Checked in Chromium at iPhone size with the visible area cut to 55% (a simulated keyboard): the sheet's glass carries on to the bottom, and no page rows show.
- **Regression check**: existing BottomSheet suites (`bottomSheetKeyboardCover`, `bottomSheetSurface`, `bodyScrollLockIOS`) and the full suite pass.

### 139. iPhone app offered a Plus member a "7-day free trial" of All Access (owner screenshot, 2026-11-03)
- **Problem**: a Plus member (App Store) opening the membership sheet saw All Access yearly with "7 days free" and START 7-DAY FREE TRIAL. Apple only gives the introductory trial to someone who has never subscribed in the group, so an upgrading member gets no trial; the copy promised one anyway. The website already hid the trial for subscribers, but the iPhone app used the store's eligibility answer alone (`trialDaysOf`).
- **Fix**: `SoloPaywall.jsx` `trialDaysOf` (iPhone app): no trial when the member has a paid plan now, has ever had an App Store or website subscription (`soloEntitlement.sources`), or `trialUsed`; otherwise the store's answer as before. The button then reads SUBSCRIBE TO ALL ACCESS, and the terms line shows the plain price.
- **Tests**: `src/solo/subscriptionGates.test.jsx` "a Plus member upgrading to All Access isn't offered a free trial, even if the store says eligible (#139)". Fails without the fix.
- **Also seen, owner to fix in App Store Connect (not code)**: the same screenshot showed All Access yearly at **$99.00**. Inside the iPhone app prices always come from Apple, so `apex_solo_all_access_yearly` is set to $99.00 in App Store Connect; the approved price is A$179.99 (ROADMAP.txt step 2). Fix it there (Subscriptions → Train Solo → All Access yearly → Subscription Prices → Australia A$179.99, other countries auto-equalised).

### 140. Train Solo: one program at a time, simple switching, a run-through, "Session history" (owner request, 2026-11-03)
- **Change (feature)**: a customer could have several programs on the calendar at once: bought programs, an All Access one and programs they built all ran side by side. Now exactly one is the **current program**, the only one on the calendar and under "Your program" in My Training. Every other one is under **Archived** with everything logged kept: "Archived at Week N · tap to resume" (picks up at that week; the start date moves so today falls in it, and logs are keyed on week numbers, so none is overwritten) or "Not started · tap to start" (asks for a start date).
  - `src/solo/currentProgram.js` (pure): `resolveCurrentProgramId`, `applyCurrentProgram` (archived rows show history up to the day they were archived, nothing after; never-started ones nothing), `planSwitch` (archive the current one at its week, resume or start the target, keep All Access enrolment status in step), `planArchiveForLater`, `legacyMigration`.
  - Stored on the customer's own profile `soloUsers/{uid}`: `currentProgramId` and `archivedPrograms` (no rules change; purchases and own programs only get their `startDate` changed, which the rules already allow).
  - `SoloAppContext`: `soloTrainingPrograms` now has one `current` row (`soloCurrentProgram`); `switchSoloProgram` writes the whole switch in one batch; `keepSoloProgramForLater`; `markSoloProgramsGuideSeen`. Older accounts with several programs running are moved once, after every program list has answered: the active All Access program (else the latest started) stays current and the rest are archived as of today.
  - Every way in uses one sheet, `SwitchProgramSheet` (`SoloProgramSwitch.jsx`): the catalogue's Start / Resume (`SoloProgramDetailsScreen`), My Training's archived programs, a bought program arriving from checkout, and Build a program. A new built program starts straight away when nothing else is running; otherwise they choose SWITCH PROGRAM or "Keep it for later". The sheet always says what moves to Archived and at which week.
  - Run-through: `ProgramsGuideSheet` ("How your programs work", 3 numbered points) shows once (profile `programsGuideSeenAt`), never on top of the switch sheet, and any time from "How it works" beside Your program.
  - My Training's log list now reads "Session history".
- **Tests**: `src/solo/currentProgram.test.js` (9: which is current; only the current reaches the calendar; switch archives at the week; resume carries on from the archived week; All Access enrolments kept in step; replaced-before-start is "not started"; keep for later; older accounts migrated once). `src/solo/oneProgramAtATime.test.jsx` (7: Your program + Archived; resume sheet says what's archived and switches; nothing current + start date; run-through once and under How it works; Session history; builder asks switch/keep for later; builder with nothing running just starts). All 7 fail on the old screens. `src/lib/SoloAppContext.oneProgram.test.jsx` (2: older account migrated to one current with a single write; the profile's choice is the only current one). `subscriptionGates.test.jsx` All Access start/resume tests updated to the new sheet. Screens checked rendered at iPhone size.
- **Regression check**: full suite passes; `vite build` clean. Week numbers, workout logs, All Access lock on lapse, recovery add-ons on the current program's rest days unchanged.

### 141. Train Solo client experience: program complete, Monday recap, day-one session, missed sessions, smarter swaps, warm-up & plates (owner request, 2026-11-03)
Train Solo only; nothing in the coach console or the coached client app changed.
- **Program complete** (`SoloRecapScreens.jsx` `SoloProgramCompleteScreen`, `/solo/program-complete`): finishing the last planned session of a program (`trainingRecap.programFinished`: every week × day logged, counting this one) changes the workout summary's DONE into SEE YOUR PROGRAM. That opens a full-screen moment: sessions, training time, total lifted, PRs, and "Stronger": each lift's best estimated max (Epley) in its first week vs its last, biggest gains first. Then "Up next" (a recommended program, not this one) with START YOUR NEXT PROGRAM.
- **Monday recap** (`SoloWeekRecapScreen`, `/solo/week`): last week (Mon–Sun) as planned sessions done ("3 of 4"), or sessions done when nothing was planned; minutes, total lifted with the change vs the week before, PRs; this week's planned sessions; LOG THIS WEEK'S CHECK-IN goes to Progress. Reached from "Your week in review" at the top of My Training on Mondays and Tuesdays, and from the Monday push (`soloWeeklyCheckInReminder` now says "Your week in review" and links `/solo/week` on the web). The iPhone app opens wherever it was when a push is tapped, so there the My Training row is the way in.
- **Day one** (`SoloFirstSessionScreen`, `/solo/first-session`; `firstSession.js`): finishing the questionnaire for the first time (not a review) goes here instead of home. "Let's get your first session done today": a 5-exercise full-body session (legs, push, pull, hinge, core), one exercise per movement from the library, only equipment they said they have, simpler kit first, plank as a timed hold. START YOUR FIRST SESSION logs it like a quick session (every plan). Their recommended program sits below; "I'll start later" goes home.
- **Missed sessions** (`soloCalendar.js` `sessionPlan`, `missedSessions`, `sessionPlanKey`): My Training (today) lists the current program's sessions from the last 7 days that weren't done, skipped or moved, under "Missed this week", with **Move to today** or **Skip**. Saved on the profile (`sessionPlan.{purchaseId}.{week}_{dayId}`: `{ moveTo }` / `{ skipped }`); the calendar draws a moved session on its new day (" · moved") and a skipped one as "Skipped" (not startable). Logs are keyed on week/day, so moving never touches them.
- **Smarter swaps** (`exerciseSwap.js` `swapScore`): candidates are ordered by closeness: the same movement word in the name (row → row) first, then the same equipment, then shared muscles; ties A–Z. The swap sheet has "Keep this swap for the rest of the program" (on by default for program sessions): every later session of that program opens with it (`programSwaps.{purchaseId}.{originalId}` on the profile, `setSoloProgramSwap`). "Back to {exercise} (as planned)" undoes it, including a kept one.
- **Warm-up & plates** (`liftHelpers.js`): barbell main lifts show "Plates for N kg" (per side on a 20 kg bar, heaviest plates first, says when it can't be made exactly). The first barbell lift of the session shows "Warm-up & plates": bar × 10, ~40% × 5, ~60% × 3, ~80% × 2, to the nearest 2.5 kg, no repeats, nothing under 40 kg working weight. The working weight is the suggested weight, else today's heaviest entry, else last time's.
- **Tests**: `src/solo/liftHelpers.test.js` (7, hand-checked plate and warm-up arithmetic), `src/solo/trainingRecap.test.js` (8: e1rm, program finished, program stats and strength %, Monday recap counts and volume change, first-session picks by equipment, swap ordering, missed / moved / skipped sessions and what's startable, archived programs never offered), `src/solo/clientExperience.test.jsx` (5 screen tests: program complete, recap, day one, swap sheet keep / back-to-plan, plates panel), `oneProgramAtATime.test.jsx` (+1: Move to today / Skip in My Training). All fail without the change. `SoloOnboarding.test.jsx` updated: a new member lands on the first session. Screens checked at iPhone size; a wrapping figure on the recap was fixed.
- **Regression check**: full suite passes; `vite build` clean; `functions/index.js` syntax checked (only the Monday push text and link changed).

### 142. Train Solo: the run-through only once, clear-glass sheets, scheduling done for them (owner request, 2026-11-03)
- **Run-through once, ever** (fix): "How your programs work" was marked seen only when closed, so leaving the screen or a slow profile save could show it again. It's now marked seen the moment it first shows: on the profile (`programsGuideSeenAt`) and on this phone (`apexSoloProgramsGuide:{uid}`, so it can't come back before the save arrives). It's still always reachable from "How it works".
- **Glass** (design): the run-through, the switch-program sheet and the new Plan sheet use the membership sheet's clearer glass and light backdrop, now shared as `soloClearSheetGlass` / `CLEAR_SHEET_BACKDROP` in `SoloThemeContext.jsx` (the paywall uses the same function, unchanged look).
- **Scheduling a built program** (`SoloProgramBuilderScreen`, `customPrograms.js` `nextWeekday` / `fillWeekdays` / `defaultProgramName`): every session gets a weekday automatically: their consultation training days first (Mon → Sun), else spread out with rest between (Mon, Thu, Sat…). "Your week" shows the sessions as Mon / Wed / Fri, and tapping the day opens a 7-day picker (days already used are disabled). No up/down ordering, no date to pick: the program starts today ("Today · first session tomorrow", with "Change" for anyone who wants another date), and the name fills itself in ("My 3-day program") if left blank. Saved as `weekdays` alongside `days` (Mon → Sun order); `sessionDateKeys` places each session on its weekday within the program week when a program carries valid weekdays, and every caller (calendar, My Training's week and progress sheet) passes them. Older programs get their weekdays filled the same way when next edited.
- **Planning one of their own sessions** (`PlanSessionSheet`, `soloCalendar.js` "planned" items): each saved session has a Plan button. The sheet shows the next 7 days as one row, with the best day already picked (their next training day with nothing on it, else the next free day, else today), then ADD TO CALENDAR. Saved on the profile (`plannedSessions.{sessionId}_{date}`: `{ sessionId, date }`, `planSoloSession`). It shows on the calendar and My Training on that day, can be started from that day on (`customSessionState`), and is done once one of their sessions with that id is logged that day; the session row shows when it's next planned. A deleted session's plan shows nothing. The Monday recap counts planned own sessions in "this week".
- **Tests**: `src/solo/scheduling.test.js` (7: training days first; spread when none; keeps set weekdays, Mon → Sun sort, default name; dates from weekdays; invalid weekdays ignored; planned sessions startable only on their day and done when logged; deleted session's plan hidden). `oneProgramAtATime.test.jsx` (+3: builder week Mon/Wed/Fri, move to Sat, saves weekdays [1,3,6] and the auto-name; Plan sheet with one pre-picked day calls `planSoloSession`; run-through marked seen on show (profile + phone), clear glass, not shown again before the profile save arrives). All fail without the change. Screens checked at iPhone size.
- **Regression check**: full suite 840 passed; `vite build` clean. Catalogue programs keep the consultation-day placement; nothing outside Train Solo touched.

### 143. Train Solo's new pages and pop-ups: smaller type, more premium (owner request, 2026-11-03)
- **Change (design)**: the pages and pop-ups from #136 and #140–#142 used large, heavy type and big ALL-CAPS black buttons. They now share one quieter scale and slim buttons from `src/solo/SoloUI.jsx`:
  - `SOLO_TYPE`: eyebrow 10px medium with wide tracking; titles 24px medium (sheet titles 20px); figures 30px light, the recap's headline 44px light; body 13px; rows 13px medium / 11px meta.
  - `SoloButton` (48px, rounded, the theme's ink, sentence case) and `SoloTextButton` for the quiet second action.
  - Applied to: day-one first session, Program complete, Your week, Opening the App Store / Confirming / Welcome to Plus, and the switch-program, run-through ("01 / 02 / 03" in light numerals) and Plan sheets (day chips are light pills, not boxes). The builder's weekday labels are small caps; "Your week in review" is 13/11px.
- **Tests**: button names updated to sentence case in `oneProgramAtATime`, `subscriptionGates` and `clientExperience` tests; "Start program" is now both the sheet title and the button, so those tests find the button by role. Full suite passes; `vite build` clean; every screen checked rendered at iPhone size, light and dark.
- **Not changed**: the rest of Train Solo, the coached app and the shared `PrimaryButton` (used outside Train Solo).

### 144. Train Solo type: back to the app's own font weights, just smaller (owner, 2026-11-03)
- **Problem (owner)**: #143's lighter, medium-weight type and sentence-case buttons weren't wanted: "revert back to the old font, just smaller size".
- **Fix**: `SoloUI.jsx` keeps #143's smaller sizes with the original weights. Titles, figures, rows and labels are semibold (figures 28px, the recap headline 44px); `SoloButton` is bold ALL CAPS again (13px, `rounded-2xl` like `PrimaryButton`) and `SoloTextButton` is semibold. The leftover light and medium spots go back to semibold or bold: the run-through numerals (plain 1 / 2 / 3), the Plan sheet's day boxes (bordered, semibold), the purchase screens' titles, "Your first session", the builder's weekday labels, the recap's small figures and gains.
- **Tests**: button names are matched on their text (the caps come from CSS), so the existing tests still apply; Train Solo suite passes; `vite build` clean.

### 145. Program complete: top 5 lifts, bodyweight, progress photos and a Share card (owner request, 2026-11-03)
- **Change (feature)**: Program complete (`SoloRecapScreens.jsx`) keeps the layout the owner liked and adds:
  - their **five** biggest lift improvements (was 3)
  - **bodyweight change** over the program (`shareCard.bodyweightChange`: the first weigh-in from the program's start date vs the latest; left off with fewer than two)
  - **Progress**: their week 1 and final-week progress photos side by side (`progressPhotoPair`: the first photo from the start date and the latest, labelled with the program week each was taken in, capped at the last week; needs two photos on different days). Each photo has a small glass "Week N" label.
  - an outlined **Share your results** button above "Start your next program". It opens a clear-glass sheet with the card and a SHARE button (`navigator.share` with the image; otherwise "Press and hold the image to save or share it"; cancelling is silent).
- **The card** (`shareCard.js` `drawShareCard`, 1080 × 1350, fits a post or a story): the APEX gym photo (`/brand/gym-dark.jpg`, greyscale, darkened) with the APEX mark and "TRAIN SOLO", and one pane of frosted glass. The glass is a tiny copy of the photo scaled back up, so it blurs on every browser, with a hairline edge. The pane holds "PROGRAM COMPLETE", the program name, the Week 1 / Week N photos, sessions / total lifted / bodyweight change (PRs without weigh-ins), and "STRONGER" with the top 5 lifts and their % in blue. Progress photos are already stored on the account (data URLs), so nothing new is uploaded and the canvas isn't blocked. An earlier version of this entry used the member's own photo as the background; the owner chose the APEX photo-and-glass look instead.
- **Tests**: `src/solo/shareCard.test.js` (7, hand-checked: bodyweight from the start date; needs two weigh-ins; card figures and top 5 order; PRs fallback and non-gains left off; progress pair with week labels and the before-start photo ignored; needs two days, capped at the last week; labels on the card). `clientExperience.test.jsx`: the Program complete test checks the bodyweight row, the two progress photos labelled Week 1 / Week 2, and that Share opens the card sheet. Fails without the change. The card was drawn in Chromium and sent to the owner.
- **Still to check on a phone**: the iPhone app's share sheet with the image (WKWebView `navigator.share` with files); if it isn't offered, the press-and-hold fallback shows.

### 146. Dark mode: black text on the new Train Solo sheets (owner screenshots, 2026-11-03)
- **Problem**: in dark mode, "How your programs work" showed its three headings (One program at a time…) and the Resume / Start program sheet showed the program's name in black on charcoal. Bottom sheets open outside the page (`FullScreenOverlay`), so text without its own colour fell back to the document's black, not the Solo theme's white.
- **Fix**: `SoloProgramSwitch.jsx`: the content of the switch-program, run-through and Plan sheets sits in a wrapper with `color: t.text`, so every line without its own colour follows the theme (the Program complete Share sheet does the same).
- **Tests**: `src/solo/sheetsDarkMode.test.jsx` renders all three sheets in dark mode and checks each heading and title resolves to the theme's white; it fails without the fix.

### 147. Share card: estimated max and PRs, evenly spread figures, choose your own progress photos (owner request, 2026-11-03)
- **Change**:
  - **Card** (`shareCard.js`): each of the top 5 lifts shows its estimated max, first week → last week (whole kg, under an "EST. MAX" heading), before its % gain. **PRs set** is always on the card, so the figures are Sessions, Total lifted, Bodyweight (when they have two weigh-ins) and PRs set. They're spread across the full width, evenly spaced: the first starts at the left edge, the last ends at the right, and the gaps between are equal (each block's width is the wider of its number and label).
  - **Photos** (`SoloRecapScreens.jsx`): the week 1 / final-week photos are still picked automatically (`progressPhotoPair`; it now falls back to their first and latest photos overall when the program has fewer than two). Tapping either opens a clear-glass picker of every progress photo they've uploaded, newest first, each labelled "Week N" (`photoLabel`) or with its date if taken before the program. The current choice is outlined in blue, and the pick replaces that photo on the screen and on the card.
- **Tests**: `shareCard.test.js` (+3 and updated: est. max detail; PRs set always present; photo labels by week or date; fallback pair; the even-spacing positions checked by hand against a measured canvas). `clientExperience.test.jsx`: change the first photo through the picker (3 photos offered, choose the 15 Aug one, the screen shows it). Card and picker rendered in Chromium and the card sent to the owner. Full suite 851 passed.

### 148. Train Solo muscle map on Progress: anatomical body, trained red, ready blue (owner request, 2026-11-03)
- **Change**: a "Muscle Map" glass card on Progress (after Strength Personal Bests / Estimated Max, before the heat map). Front / Back switch, two large figures ("Days since last session", "Muscle groups ready" in blue), the body, then "Trained Chest 4 · Shoulders 2 …" (red label, sets) and "Ready Forearms · Abs …" (blue label).
  - History: first a blue holographic wireframe in a My Training row + sheet (rejected), then a solid grey anatomical figure on a black panel (rejected: wanted it in Progress, glassier, ready in blue, every muscle head shown). The My Training row and sheet are gone.
  - The body (`MuscleBody.jsx`) is drawn head by head and mirrored: chest upper/sternal, front + side delts (side + rear from the back), biceps short/long, triceps long/lateral, two forearm groups, 4 ab rows, obliques, quads ×4 (vastus lateralis, rectus femoris, vastus intermedius (mostly under rectus femoris, shown as a sliver), vastus medialis), upper/mid-lower traps + infraspinatus/teres, lats, erector spinae, glute medius/maximus, hamstrings ×3 (biceps femoris, semitendinosus, semimembranosus), gastrocnemius ×2 + soleus. Untracked muscles (adductors, tibialis, serratus, neck) are neutral. Everything is translucent on the glass card: silhouette ~7%, ready `READY_BLUE` at 32%, trained `TRAINED_RED` at 50–100% by sets (`muscleStyle`). The silhouette's two halves sit in one translucent group so no seam shows down the centre.
  - Data (`muscleMap.js`): the last 72 hours of their own logs; completed sets only; a primary muscle counts each set, a secondary one half; warm-ups, cool-downs and cardio don't count. Muscles come from the shared movement rules (#149). Days since last session is whole calendar days from their latest log (`daysSinceLastSession`), "–" with none.
- **Tests**: `src/solo/muscleMap.test.js` (28 movements checked by hand, the 72-hour window, half sets, intensity steps, summary). `src/solo/SoloMuscleMap.test.jsx` (trained line "Chest 4 · Shoulders 2 · Triceps 2" with a red label; Ready line and the ready figure (11) in blue; days since; Back switch shows lats/glutes/hamstrings/lower back/triceps; nothing logged → "nothing in the last 3 days", 14 ready, "–"; calendar days (Oct 31 22:00 → Nov 3 09:00 = 3); trained red, full at level 1, lighter below, ready blue; head counts: 4 quads, 2 biceps, 2 delts, 2 chest, 4 ab rows, 3 hamstrings, 2 triceps, 3 calf parts, 2 glutes). 5 fail on the previous version (no card, grey ready, 2 quads). Rendered in Chromium on Progress, light and dark, front and back.

### 149. Every exercise's Primary / Secondary Muscles follow its movement, coach console and Train Solo (owner request, 2026-11-03)
- **Problem**: the shared exercise library (`exercises`, used by the coach console and Train Solo) had free-text muscles. Many were blank (coach-added / video-imported exercises), many vague ("Full Body", "Spine", "Hips", "Neck"), and spellings differed between exercises, so Training Load, swaps and the new muscle map couldn't be trusted.
- **Fix**:
  - `src/lib/exerciseMuscles.js` is one movement → muscle table (~80 patterns, most specific first): lifts (bench press → Chest / Triceps, Shoulders; Romanian deadlift → Hamstrings, Glutes / Lower Back; row → Lats, Upper Back / Biceps, Shoulders…), full-body and strongman, cardio, and warm-ups and stretches (the muscle stretched). Presses and extensions the name doesn't place use the category ("Seated Dumbbell Press" under Shoulders is a shoulder press). Names it can't place keep their listed muscles, tidied to the labels.
  - Muscles are stored as 14 labels only: Chest, Shoulders, Biceps, Triceps, Forearms, Abs, Obliques, Quads, Hamstrings, Glutes, Calves, Lats, Upper Back, Lower Back. The coach's Training Load synonyms already roll these up correctly.
  - `AppContext`: when the coach console opens, every exercise whose stored muscles differ is corrected in batches. Only those are written, so it's a no-op once done, and one with `musclesSource: "manual"` is left alone. New seeded exercises get their movement's muscles, and `createExercise` fills them when none are given.
  - Coach Exercises editor (`CoachExercises.jsx`): leaving the name field fills blank muscles from the movement, the hint shows "from the movement: …", blanks are filled on save, and muscles the coach changed are saved as `musclesSource: "manual"` (`"movement"` otherwise).
  - Train Solo: the muscle map (`muscleMap.js`) uses the same rules; swap matching knows Upper / Lower Back.
- **Tests**: `src/lib/exerciseMuscles.test.js` (all 610 library exercises get a primary muscle; only the 14 labels; never both primary and secondary; 14 hand-checked movements incl. past misfires: Cyclist Squat, Bicycle Crunch, Low Row Machine, Walking Lunge; unknown names keep tidied listed muscles; the correction lists only differing exercises). `src/lib/AppContext.exerciseMuscles.test.jsx` (coach open writes only the wrong one, not the manual one; a client never writes). `src/coach/CoachExercises.muscles.test.jsx` (name fills muscles, saved as movement; coach change kept as manual). `src/solo/muscleMap.test.js` (28 movements). Full suite 905 passed. Every library name was also run through the rules by script to find misfires (cardio "walking" catching lunges, cycling catching "Cyclist Squat", rowing-machine catching "Row Machine"), and all were fixed.

### 150. Estimated max chart per lift on Train Solo Progress (owner request, 2026-11-03)
- **Change**: an "Estimated Max" card right under Strength Personal Bests (Plus, like the rest of full stats). Chips for each lift logged with weight in two or more sessions (heaviest est. max first, up to 10, so it opens on a big lift: first built most-logged first, which opened on Standing Calf Raise when making the App Store screenshots); the chosen lift's latest est. max as a large figure, "+12 kg since Oct 1" in blue, and a blue area chart of one point per session. Before any lift has two sessions it says how to start.
  - Data (`src/solo/estMax.js`, `estMaxSeries`): from their own logs only. Each session's point is the best set's Epley estimate (`e1rm`, weight × (1 + reps ÷ 30), 1 rep = the weight), the same formula the recap and share card use. Bodyweight-only sets, zero-rep sets, warm-ups/cool-downs/cardio don't count.
- **Tests**: `src/solo/estMax.test.jsx` (by hand: 100×5 = 116.7 vs 110×3 = 121 → 121; 120×1 vs 105×6 = 126 → 126, change +5; a lift with one session has no chart; push-ups with no weight, warm-ups and 0-rep sets ignored; heaviest lift first (Squat before the more-logged Bench, fails on most-logged ordering); chart shows 112 kg / +12 kg and switches to Bench 75 kg / +5 kg; the empty hint). Fail without the change (module missing). Rendered in Chromium.

### 151. "Total lifted 176 t" was unclear: show the full kg figure (owner question, 2026-11-03)
- **Problem**: Program complete, the Monday recap and the share card shortened total lifted (every set's weight × reps added up) to tonnes over 10,000 kg ("176 t", "22.4 t"). The owner couldn't tell what "t" meant.
- **Fix**: the full figure in kg with the unit in the label: "176,240" / "Kg lifted" (recap: "Kg lifted · +4%"; share card the same). Never tonnes.
- **Tests**: `shareCard.test.js` (85,230 → "85,230" / "Kg lifted"; 2,450 → "2,450"; even spacing recalculated with the new label width), `clientExperience.test.jsx` ("1,050" + "Kg lifted" on Program complete). 4 fail on the old formatting.

### 152. Train Solo Session history moves to the bottom of Progress (owner request, 2026-11-04)
- **Change**: the list of past sessions left the bottom of My Training and is now the last section of the Progress tab ("Session History", `src/solo/SoloSessionHistory.jsx`, after Achievements). Same glass rows (day, date · minutes, sets), newest first; 10 shown, then "Show all N sessions"; tapping one opens the same Completed session sheet. Logged sessions are still opened from My Training's calendar and the program's schedule.
- **Tests**: `src/solo/sessionHistory.test.jsx` (on the real Progress screen: it comes after Achievements and is the last section; rows list the sessions with "2 sets"; tapping opens the logged exercises; 10 then all 12 with Show all; nothing logged → no section). `oneProgramAtATime.test.jsx`: My Training no longer shows Session history. 4 fail on the old screens.

### 153. White screen after subscribing in the iPhone app; a program's schedule kept popping back up (owner, TestFlight 1.0.4, 2026-11-04)
- **Problem 1**: after buying All Access, the app showed a plain white screen. Leaving the app and reopening it brought it back with All Access active, so the page had reloaded after Apple's sheet (#134) but WebKit never drew it, and the native cover (#135) came off a fixed 0.6s after the load, showing white. `checkPageAlive` (#132) can't see this: the page's DOM is there.
- **Fix 1** (native, `ViewController.swift`, needs a new build): after the post-sheet load the cover stays up while `revealAfterPurchase` re-attaches the web view to the screen (what leaving and reopening the app does) and asks the page for a drawn frame (two `requestAnimationFrame`s via `callAsyncJavaScript`, 1.5s limit). Drawn → the cover comes off. Not drawn → the page is loaded fresh once under the cover, then the cover comes off whatever happens (plus the existing 12s guard). Constraints moved into `pinWebView()`, which keeps edge-to-edge and the keyboard inset across the re-attach.
- **Problem 2**: after starting a program from the catalogue, its schedule sheet reopened every time it was closed. My Training opened the sheet from the navigation's `openPurchaseId` in an effect that re-ran on every change to the program list (the new enrolment saved, then confirmed by the server, other updates) and never marked the request done; returning to the tab reopened it too.
- **Fix 2** (`SoloMyTrainingScreen.jsx`): the request is handled once per navigation (`location.key`), waits until the program is on the list, then is removed from the history entry (`replace`, the tab kept).
- **Tests**: `oneProgramAtATime.test.jsx` (#153: opens once, the request is cleared from the location state, closing then three program-list updates and leaving/returning to the tab don't reopen it; fails on the old code: it reopens). `src/nativePurchaseReveal.test.js` (the Swift: didFinish reveals through the check, not by removing the cover; re-attach + `pinWebView` + cover brought to front + drawn-frame check; no frame → `loadSite()` once, then the cover comes off; edge-to-edge and keyboard inset kept). 3 fail on the old Swift. Swift can't be compiled here: verify on the next TestFlight build (buy or upgrade in the sandbox; the welcome screen must appear without leaving the app).

### 154. White screen when coming back to the iPhone app; purchase screens skipped; a plan ending up to a minute late (owner, TestFlight 1.0.4, 2026-11-04)
- **Problem**: after buying All Access the "Confirming / Welcome" screens never appeared and the app was white; going back into the app later was white too (only force-closing it fixed it). iOS can leave the page undrawn whenever the app returns, not only after Apple's sheet, and the return-to-app check (#132) only looked for content, which was there. The page's own reload after the sheet came up white as well, so reloading isn't enough. Also: a paid plan that ended while the app was open stayed usable until the next minute tick; and the stale-copy recovery screen could stay white if its reload never landed.
- **Fix**:
  - Native (`ViewController.swift`, new build): `pageDrawsFrame` asks the page for a drawn frame (two `requestAnimationFrame`s + content, 1.5s). Every return to the app (`checkPageAlive`): no frame → re-attach the web view → still none → `rebuildWebView` (a brand-new web view on the same configuration: same sign-in and storage; what force-closing did). After Apple's sheet (`revealAfterPurchase`): the same, under the cover; the cover comes off only on a drawn frame (or after one rebuild / 12s).
  - Web (`SoloPaywall.jsx`): the purchase result is kept in localStorage (a new web view has empty sessionStorage) until the flow finishes: welcome dismissed, the error or "hasn't reached your account yet" shown, or cancelled; 10 minutes at most. A page replaced mid-flow shows Confirming → Welcome again.
  - `SoloAppContext.jsx`: the plan is re-checked at the exact moment its period ends (a timer to the next `expiresAt`), so a cancelled or failed plan is Free the second it ends. Cancelling stays one tap (Profile → Subscription → Apple's own manage screen / the Stripe portal); like every App Store subscription, a cancelled plan runs to the end of what was paid, then locks at once. A refund, failed payment or expiry from the server locks immediately (unchanged, now tested).
  - `ErrorBoundary.jsx`: the stale-copy holding screen falls back to "Something went wrong · Reload" after 6s instead of staying white.
- **Tests**: `src/nativePurchaseReveal.test.js` (the Swift: frame check, return-to-app re-attach then rebuild, rebuild keeps the configuration/settings/layout, purchase reveal; 5 fail on the old Swift). `subscriptionGates.test.jsx` (a page replaced with an empty sessionStorage still shows Confirming then Welcome until "Start training", then never again). `SoloAppContext.entitlementCache.test.jsx` (Free within a second of the period end with no server word, fails on the old minute tick; refunded / billing issue / expired lock at once; cancelled-but-paid keeps access). `oneProgramAtATime.test.jsx` (All Access ends while running its program: locked, not current, no Start, "Included with All Access", tap opens the membership sheet). `ErrorBoundary.test.jsx` (white holding screen → recovery screen after 6s; fails on the old code). Sweep: every Train Solo screen (tabs, program pages incl. an add-on, workout, summary, both builders, calendar, recovery, Program complete, Monday recap, first session) rendered for Free, Plus and All Access in light and dark: 96 renders, no errors. Swift can't be compiled here: verify on the next TestFlight build.

### 155. Train Solo light mode is pure white (owner request, 2026-11-04)
- **Change**: the light theme's page colour was off-white (#F5F4F1), so it didn't flow into the white status-bar strip at the top. `SOLO_THEMES.light.bg` is now #FFFFFF (the page, the phone's theme colour and the native strip follow it); pop-ups' light glass is white (rgba(255,255,255,0.92)); chips get a faint grey (they were white and would vanish on white); the cover gradient for programs without artwork is neutral grey; the workout screen's empty state is white. Glass cards keep their hairline border, so they read as outlines on white. Dark mode unchanged.
- **Tests**: `src/solo/soloWhite.test.jsx` (light bg #FFFFFF; pop-up glass white; chips not white; the theme-color meta set to #FFFFFF; dark unchanged). Fails on the old theme. My Training, Catalogue and a program pop-up rendered in Chromium in light mode.

### 156. Cancelling a Train Solo subscription ends access straight away (owner rule, 2026-11-04)
- **Change** (owner decision, replacing "keep access until the end of the paid period"): a cancelled Plus or All Access subscription is Free the moment the cancellation reaches us, from either store, trial or paid. Everything paid locks at once (suggested weights, builder, full stats, add-ons, unlimited sessions, All Access programs; the server's `allAccessUntil` goes to 0, so firestore.rules refuses paid program content). Logs and history are kept. No refund for the rest of the period (Apple refunds only through Apple).
- **Fix**:
  - Server (`functions/soloSubscriptions.js`, deployed by the functions workflow): Stripe: a subscription with cancel at period end / a cancel date is status "cancelled" (not paid up), and `syncStripeCustomer` ends it in Stripe at once (`subscriptions.cancel`) so nothing lingers. Apple: RevenueCat's `unsubscribe_detected_at` inside the period is "cancelled" (not paid up); turning auto-renew back on clears it and access returns.
  - App (`soloAccess.js` `sourceActive`): a source with `willRenew: false`, `cancelAtPeriodEnd` or `cancelAt` is not paid up, so it locks even before the server's new rule is deployed. `SoloAppContext`: coming back to the app (from Apple's cancel screen, iPhone Settings, the Stripe portal) re-reads the subscription (at most every 20s); the paywall's Manage re-reads straight after Apple's screen closes.
  - Wording: the membership sheet says "Cancelling ends it straight away."; the fine print before buying says cancelling ends the membership straight away with no refund for the rest of the period; Terms section 17 updated, effective date 4 November 2026.
- **Tests**: `functions/soloSubscriptions.test.js` (Stripe cancel at period end / cancel date / cancelled trial → Free, all derived until-dates 0; cancelled then re-subscribed uses the new one; Apple unsubscribed inside the period → "cancelled" → Free, cancelled trial too; turned back on → access). `soloAccess.test.js` (cancelled from either store → Free, no renewal line; a renewing trial still shows its first payment date). `SoloAppContext.entitlementCache.test.jsx` (an Apple "won't renew" doc locks at once; becoming visible re-reads the subscription, throttled). `subscriptionGates.test.jsx` (after a cancel Profile no longer shows the plan; the cancel note and pre-purchase wording). 7 fail on the old code.
- **Risk noted to the owner**: App Store subscriptions are paid to the end of the period by Apple; members who cancel early may ask Apple for refunds.

### 157. Train Solo journey sweep: lost workouts, no password reset, saves stuck offline, double checkout (audit, 2026-11-04)
- **Problems** (found tracing Register → Onboarding → Catalogue → Purchase/Subscribe → Schedule → Workout → Progress → Profile):
  - A workout in progress lived only in React state: iOS dropping the page in the background, a rebuilt web view, or one tap on Cancel lost every set (the coached app already kept its session on the phone).
  - Train Solo login had no "Forgot password?" — no way back into an account.
  - With no signal, a customer's own saves (built session/program, start dates, progress photo, add-on, the questionnaire's Finish) awaited a server answer that never came: buttons sat on "Saving…" for good. Log out waited the same way on the push-token / RevenueCat clean-up.
  - Pay (single program) and Subscribe (website) went back to tappable while the page was leaving for Stripe: a second tap opened a second checkout — paying both is two charges / two subscriptions.
  - Back from a website subscription checkout (`?subscribed=`) nothing was shown; the member looked Free until Stripe's webhook landed. Stripe's billing portal returns to `?soloTab=profile`, which nothing read (landed on My Training).
  - Opened before the catalogue arrived (first open, a link), the program page flashed "This program isn't available." and the Catalogue "No programs are published yet".
  - Unhandled errors: adding/removing a recovery add-on and moving a missed session failed silently.
- **Fix** (Train Solo only; no coached-app or shared component changed):
  - `src/solo/workoutDraft.js` (new) + `SoloWorkoutSessionScreen.jsx`: one draft per account in localStorage (`apexSoloWorkoutDraft:<uid>`; survives a rebuilt web view), written as sets are typed, keyed to the same purchase/day/week as the finished log id, dropped after 12 h, cleared on Complete or Discard, kept on a failed save. Opening `/solo/workout` with no session (rebuilt page) resumes it; starting the same session restores it; starting a different one leaves it until something is typed. Cancel with sets entered asks: Resume later / Discard workout / Keep logging (an in-page sheet — WKWebView has no `confirm()` panel). My Training shows "Workout in progress · Resume" unless that session has since been logged.
  - `SoloAppContext.jsx`: `sendSoloPasswordReset` (Continue link back to `/solo/login`; never says whether an account exists) and a "Forgot password?" form on `SoloLoginScreen.jsx`. Customer saves go through `keep()` = `savedOrQueued` (settles when the server has it, or after a few seconds once kept on the phone; a quick refusal still rejects). Log out gives the network clean-up at most 3 s each. New `soloProgramsLoaded`.
  - `SoloProgramDetailsScreen.jsx` / `SoloPaywall.jsx`: stay busy while leaving for Stripe; `pageshow` (back from Stripe via the page cache) makes them usable again. Add-on errors shown.
  - `SoloPaywall.jsx`: `?subscribed=` → "Confirming your membership" until the server's tier arrives, then the welcome; after 15 s, "Payment received — your membership is on its way… No need to pay again." The tier still only comes from the server. `SoloShell.jsx` reads `?soloTab=`.
  - `SoloCatalogueScreen.jsx` / `SoloProgramDetailsScreen.jsx`: nothing (page background) until the catalogue has answered.
- **Tests**: `src/solo/workoutDraft.test.jsx` (12: helpers; saved as typed; restored on a rebuilt page; another session's draft untouched; Cancel asks, Resume later keeps, Discard clears, nothing entered just leaves; Complete clears; failed save keeps) — 5 fail on the old screen. `src/lib/SoloAppContext.offlineSaves.test.jsx` (18: 13 saves settle with no signal, a quick refusal still rejects, log out with a hung clean-up, password reset ×3) — 17 fail on the old context. `src/solo/journeyFixes157.test.jsx` (11: forgot password ×2, Pay and Subscribe one checkout per tap, page-cache return, no loading flash on program page and Catalogue, `?subscribed=` confirming → welcome and the slow-webhook note, `?soloTab=profile`) — 9 fail on the old screens.
- **Not verifiable here**: real Stripe/Apple purchases, the reset email's delivery, and the draft surviving iOS killing the page on a real iPhone (localStorage is what the native rebuild keeps, #154).

### 158. Train Solo subscriptions & program management audit: double billing, a Plus bypass, lost Stripe events (audit, 2026-11-04)
- **Problems**:
  - A website (Stripe) Plus member opening the membership sheet in the iPhone app was offered All Access through Apple — buying it started a SECOND subscription while the website one kept charging.
  - Two open Stripe checkouts for one account (two tabs, an old checkout reopened) could both be paid: two subscriptions, or the same program bought twice.
  - `soloStripeWebhook` answered 200 even when processing failed, so Stripe never retried: a payment, renewal, failed payment or cancel could fail to reach the member's entitlement.
  - A plan that renewed but whose renewal event never arrived locked at its old period end until the member left and came back to the app.
  - Once live, a Free member could create their own multi-week program (Plus) with a direct Firestore write — only the app's paywall stopped it.
  - Program sheet: a start date still ahead was labelled "STARTED"; a start date that failed to save said nothing (unhandled rejection).
- **Fix**:
  - `SoloPaywall.jsx`: in the iPhone app a website subscriber sees "Your plan can't be changed in the app" instead of a Subscribe button (no link or mention of the website, 3.1.1); `buy()` refuses too.
  - `functions/soloSubscriptions.js` `priorCheckout` / `rememberCheckout` + `functions/index.js`: the last checkout per account and purpose ("subscription", "program_<id>") is kept in `soloCheckoutSessions/{uid}` (server-only — no rule matches it). A new checkout first expires the previous one if still open; if it was already paid (webhook pending) it answers already-owned / already-subscribed instead of charging again. Deleted with the account.
  - `soloStripeWebhook` returns 500 on a processing failure so Stripe retries (every handler re-reads or merges, so a retry can't double anything).
  - `SoloAppContext.jsx`: at the exact end of a paid period the app also asks the server to re-read the store (`syncSoloEntitlement`, same 20 s throttle).
  - `firestore.rules`: `hasPlus()` (server-written `plusUntil`) and `soloGatesLive()` (the same launch switch / test list as `gatesLive`); creating a `soloCustomPrograms` doc needs Plus once live. Editing and deleting existing ones stays open (a lapsed member keeps theirs). Before launch nothing changes.
  - `SoloMyTrainingScreen.jsx`: "STARTS" for a future start date; a failed start-date save shows an error.
- **Verified, no change needed** (`src/solo/membershipLifecycle.test.js`, real app + server logic end to end): Free → All Access trial → start a program → logs → switch (archived at its week) → failed payment (everything locked, off the calendar, logs and current program kept, nothing written) → renewal (back where it was) → resume (start moved so today is the archived week; no log overwritten). Downgrade to Plus keeps Plus features and locks catalogue programs; cancel ends it at once. A program bought on its own stays the member's on any plan. Server and app agree on the tier for every Stripe and Apple state. Website checkout sends Apple members to Apple and changes a Stripe plan in place; no second trial. Emulator rules: content needs a purchase or live All Access; entitlements, purchases (create, un-refund, programId) and the checkout record can't be written by a member.
- **Tests**: `subscriptionGates.test.jsx` (website subscriber in the iPhone app — no Apple purchase), `SoloAppContext.entitlementCache.test.jsx` (re-read at period end; unlocks on the renewal), `functions/soloSubscriptions.test.js` (6 `priorCheckout`/`rememberCheckout` cases), `firestoreRules.rules.test.js` (8 bypass cases, run on the emulator), `oneProgramAtATime.test.jsx` (STARTS / save error), `membershipLifecycle.test.js` (5). 13 fail on the old code (the rest confirm existing protections).
- **Not verifiable here**: real Stripe (test mode) and Apple sandbox purchases, Restore purchases on a second device, Apple's handling of Plus → All Access inside one subscription group, the Stripe billing portal's plan-switch settings (website downgrade from All Access goes through the portal), and the webhook retry against live Stripe.

### 159. Closing #158's open items: website downgrade, server-side Free session limit, Stripe calls checked against Stripe's API (2026-11-04)
- **Problems**: an All Access website subscriber couldn't change plan in the app — the membership sheet hid every plan, so a downgrade (or monthly ↔ yearly) depended on the Stripe portal's settings. Free's 3 saved sessions were enforced only in the app (a direct Firestore write could add more; rules can't count documents).
- **Fix**:
  - `SoloPaywall.jsx`: on the website, a Stripe subscriber's sheet opens on their own plan ("Your current plan") and lists every plan; picking another shows "SWITCH TO PLUS YEARLY" etc. and goes through the server's existing in-place change (`checkoutDecision` "change", pro rata, no trial), with "Your plan changes now; the difference is charged or credited pro rata." The iPhone app is unchanged (#158's rule still applies there).
  - `functions/soloSessionLimit.js` + `soloFreeSessionLimit` (`onDocumentCreated("soloCustomSessions/{id}")`, `functions/index.js`): once live, a member without paid-up Plus keeps their 3 OLDEST sessions; a new one past that is removed. Oldest-three (not "the 4th to arrive") so several sessions synced at once after being offline never remove a legitimate one. A lapsed member keeps every session they made. Before launch nothing is removed; test accounts are limited like the app.
- **Tests**: `subscriptionGates.test.jsx` (4: opens on the current plan; downgrade to Plus in place; monthly ↔ yearly; iPhone app unchanged) — 3 fail on the old sheet. `functions/soloSessionLimit.test.js` (8 incl. the offline burst and a lapsed member). Handler run against the real Firestore emulator (free / Plus / burst / lapsed: exactly `freeUser_s4`, `burstUser_s4`, `lapsedUser_s6` removed). Every server Stripe call (prices + products, subscription and program checkout params, `priorCheckout`'s retrieve/expire, plan change with `always_invoice`, `syncStripeCustomer`, billing portal, cancel, webhook signature incl. a forged one rejected) run against `stripe-mock` v0.194.0 — Stripe's official mock, which validates every request against Stripe's API spec — all pass.
- **Not verifiable here**: the Functions emulator can't register Firestore triggers behind this sandbox's proxy, so the `onDocumentCreated` wiring itself runs first on deploy. It is the project's FIRST Firestore-triggered function: the first deploy needs the Eventarc API (the Firebase CLI enables it if the deploy account may; a first 2nd-gen trigger deploy sometimes fails once with an Eventarc service-agent permission error and succeeds when re-run a few minutes later). No Stripe/RevenueCat keys exist in this environment, so no real test-mode purchase was made.

### 160. Train Solo store check — the live Stripe and RevenueCat setup, checked from CI (2026-11-04)
- **Change**: `scripts/solo-store-check.cjs` + `.github/workflows/solo-store-check.yml` (Actions → "Train Solo store check", run by hand). Read-only: the live Stripe webhook for `soloStripeWebhook` is enabled with the 7 events the code acts on; the four plan prices (if created yet) match `PLANS`; the default customer portal allows cancelling and card updates; APEXTEST's state; RevenueCat's current offering (read with the app's public key — RevenueCat refuses secret keys there) holds all four `apex_solo_*` products. Exits 1 on any gap; report in the run summary.
- **Verified**: dry run against stripe-mock (runs end to end); RevenueCat live offering "default" = all four products (checked from this session with the public key). App Store Connect group "Train Solo" with All Access ranked above Plus and the Stripe webhook/portal settings were done by the owner (ROADMAP.txt, 2026-11-02); the workflow re-checks the Stripe side.

### 161. White screen after buying Plus in the iPhone app (owner, TestFlight 1.0.4, 2026-11-04)
- **Problem**: bought Plus → Apple's "You're all set" → OK → a white blank page; the app had to be closed and reopened. #153/#154's approach (reload the page in place, re-attach the web view, uncover once the page says it has drawn) still failed: after Apple's sheet WebKit can stop painting the page while its scripts keep running and answering, so the "I've drawn" check said yes and the cover came off onto an unpainted (white) web view. Two more gaps: a brand-new web view loaded the site's front page "/", which sends someone signed in only to Train Solo to the Coaching / Train Solo chooser (the purchase confirmation never ran there, and every cold launch landed there too); and "drawn" counted the near-blank loading placeholder.
- **Fix**:
  - Native (`ios/ApexCoach/ViewController.swift`, `PurchasesBridge.swift` — needs a new 1.0.4 build): when Apple's sheet closes, a solid native "Confirming your membership / One moment." screen (app colours, spinner) replaces the picture of the page at once; 1 s later (the page has saved the result in localStorage) a brand-new web view always opens the page the member was on (`currentSitePage`, also used when iOS kills the page process); the old page's own reload can't uncover anything meanwhile (`awaitingFreshPage`); the screen comes off only when the new page shows a real screen — the web's Confirming / welcome screen, or any screen that isn't a loading placeholder (`pageDrawsFrame(appReady: true)`, retried every 0.5 s); 15 s hard limit.
  - Web: loading placeholders carry `data-apex-loading` (App.jsx `SessionLoadingScreen`, SoloRoutes' loading screen). `SoloAppContext` keeps `apexSoloSignedIn` on the phone while a Train Solo account is signed in; `RootRedirect` sends "/" to `/solo/home` for such a member (a coaching session still wins), so a new web view or a cold launch opens Train Solo, not the chooser.
- **Tests**: `src/afterPurchaseWhiteScreen.test.jsx` (10: "/" → Train Solo when signed in to it, the chooser otherwise, coaching wins; the readiness check's JavaScript taken from ViewController.swift itself — placeholder and empty page not ready, Confirming/welcome/real screens ready; both placeholders marked; the native flow's shape), `SoloAppContext.offlineSaves.test.jsx` (mark kept), `nativePurchaseReveal.test.js` updated to the new design. 9 fail on the old code. The Swift can't be compiled here (UIKit needs macOS): the diff was reviewed line by line; Codemagic's build is the compile check.
- **Also (same report, 1:53 screenshot): a white screen on coming back to the app.** `checkPageAlive` (every return) trusted the page's own "drawn" answer, which an unpainted page still gives. Now when the page says it's drawn and shows a real screen, the app also takes a small picture of the web view (`pageLooksBlank`, `isOneColour`): one flat colour (no APEX screen is — they all have text) → re-attach → still flat → a brand-new web view on the same page. The purchase reveal uses the same picture check before uncovering (up to two fresh web views).
- **Verify on TestFlight (new build)**: buy → Apple's sheet → OK → "Confirming your membership" (never white) → "Welcome to Plus." → the app. Also cancel on Apple's sheet → back to the membership sheet. Cold launch while signed in to Train Solo → Train Solo, not the chooser. Leave the app for a while (lock the phone, open other apps), come back → the screen you left, never white.

### 162. A client got the welcome message again; new clients never got it automatically; "Welcome to All Access" after buying Plus (owner, 2026-11-04)
- **Welcome message**: Rusiru (chatting since the day before) received the coach's welcome at 1:03 pm. Cause: the only code that could send it to an existing client is the coach's "Send welcome message now" link on the client's Summary, which sent on a single tap with no confirmation (a stray tap while scrolling). Activation can't: it always makes a new uid with an empty thread. Found while tracing: the automatic welcome on activation was written from the new client's own session as `from: "coach"`, which firestore.rules refuses — so no new client ever received it automatically.
  - Fix: the link opens a confirm sheet ("Send the welcome message?") that says if and when the client already got it (`kind: "welcome"`, or the same text from before the tag); Send / Send again / Cancel. The automatic welcome is now sent by the server in `api/client-activated.js` (`sendWelcomeOnce`): only for a client account, only with auto-send on, under the fixed id `welcome_<uid>` with `create()` — never twice. The refused client-side write is removed.
- **Welcome to All Access after buying Plus**: the welcome shows the plan the server reads from RevenueCat. If that's higher than the plan just bought (e.g. an All Access plan still running — Apple moves a member down at the next renewal), it said "Welcome to All Access" with nothing else; if lower (an upgrade RevenueCat hasn't seen yet), it would welcome them to the old plan.
  - Fix (`SoloPaywall.jsx`, `SoloPurchaseScreens.jsx`): a lower plan than the one bought is re-asked (up to 4 asks) before anything is shown; a higher one shows the welcome for the active plan with "You chose Plus. Your All Access plan stays until <date>, then it switches to Plus." (`pendingChangeNote`). `scripts/solo-store-check.cjs` can now print one account's RevenueCat record and what the server makes of it (Actions → Train Solo store check → uid) to confirm which case happened.
- **What actually happened (RevenueCat record for the test account, read with the store check's new uid lookup)**: Plus monthly from 3 Nov 8:20 pm; upgraded to All Access yearly 4 Nov 12:23 pm (Plus ended that second); the 1:50 pm "Plus" purchase was Apple's scheduled downgrade at All Access's renewal (no new Plus subscription); All Access cancelled 2:03 pm (→ Free, #156). So the server was right — and the membership sheet at 1:50 pm was wrong: it showed the member as Free (this phone's copy was behind) and let them buy again. Fix: every time the sheet opens it re-reads the plan from the stores (`refreshSoloEntitlement`) and the buy button waits ("CHECKING YOUR MEMBERSHIP…", 6 s cap); the sheet then shows their real plan (Your membership / no buy button). Test: `subscriptionGates.test.jsx` "opening the sheet re-reads the plan first" (fails on the old sheet).
- **Tests**: `api/client-activated.test.js` (3: sent once with name and attachment; never twice; clients with auto-send only), `src/coach/welcomeMessageSend.test.jsx` (4: one tap doesn't send; Send sends once tagged; Cancel sends nothing; "already got it on …"), `firestoreRules.rules.test.js` (a client's own session can't write the coach's welcome — the root cause), `subscriptionGates.test.jsx` (an upgrade waits for the server; bought Plus while All Access runs → note with the date; Free after 4 asks). 10 fail on the old code.

### 163. Still a white screen after buying, on the #161 build (owner, TestFlight, 2026-11-04)
- **Problem**: on the build with #161 the owner saw the native "Confirming your membership" (words + spinner, no logo), then a white screen.
- **Cause**: the cover came off because both checks said the new page was showing — but the picture check used WebKit's `takeSnapshot`, which re-renders the page itself and can look fine while the screen shows white. Also the fresh web view was made 1 s after Apple's reply, possibly while the sheet was still closing and the app not yet active; and the 15 s limit (and the "not ready after ~10 s" path) removed the cover regardless of what was underneath.
- **Fix** (`ViewController.swift`, next build):
  - `pageLooksBlank` uses a picture of what's actually on screen (`screenPicture`, `drawHierarchy`) once `calibrateScreenPicture` has confirmed, on a normal screen after the first load, that such pictures show the page on this phone; until then (or if they don't) WebKit's picture as before.
  - The fresh web view is made only once the app is active again (`whenAppActive`, 5 s cap) + 0.3 s.
  - Never uncovered onto white: a blank or not-ready page → another fresh web view (twice at most), then the purchase screen offers **Continue** (opens a fresh page) instead of disappearing; the 15 s limit does the same. After uncovering, the screen is checked again 1.2 s later (`verifyShownAfterPurchase`); white → the purchase screen back and a fresh page. The retry count resets only on a new purchase or Continue, so disagreeing checks can't loop.
- **Look** (owner: "I liked the blue line with the APEX logo"): the native purchase screen now matches the page's own `SoloPurchaseStage` — APEX mark (`ApexMarkBlack`/`ApexMarkWhite` in Assets.xcassets, from public/brand), 20 pt semibold title, 13 pt muted line, the 96×2 track with a pulsing MEASURE_BLUE half, in Train Solo's colours (#FFFFFF / #0A0A0B) — so it hands over to the page without a visible change.
- **Tests**: `src/afterPurchaseWhiteScreen.test.jsx` "second fix" (3, fail on the #161 code), updated #161 checks. Swift parsed and type-checked with Swift 6.0.3 against framework stand-ins.
- **Verify on TestFlight (next build)**: buy → "Confirming your membership" → the app's own Confirming (logo) → "Welcome to …" → the app. If the screen ever offers Continue, tap it: the app opens. Report if Continue appears (it means the screen check found white and recovered).

### 164. "Opening the App Store" not full screen; bought Plus, got All Access (owner, TestFlight, 2026-11-04)
- **Problem**: buying Plus in the iPhone app, the membership sheet stayed visible over a faint "Opening the App Store" while Apple's sheet was up. After the purchase the account had All Access features and was welcomed to All Access.
- **Cause**: (1) the stage faded in over 300 ms, but Apple's sheet (and the native still-picture cover, #135) opens two frames after the tap, so the picture caught it half-faded. (2) The account had a cancelled All Access yearly still inside its paid period (shown as Free, #156). In the same subscription group Apple treats buying Plus then as "turn All Access back on, move to Plus at its end date", so RevenueCat and the server correctly report All Access. The app should never have offered Plus in that state.
- **Fix** (web only, so it reaches the installed builds on their next open): `SoloPurchaseStage instant` paints at full strength on its first frame with no fade (only "Opening the App Store" uses it), and Apple's sheet is asked for 150 ms after it's drawn, not two frames. In the iPhone app, while a cancelled Apple plan higher than the one selected is still running (`appleLapsingHigher`), the membership sheet says "Your cancelled All Access plan runs until …. The App Store can only start Plus after that — choose All Access to keep it now." and has no Subscribe button for Plus; `buy()` refuses too. All Access can still be bought.
- **Tests**: `src/solo/subscriptionGates.test.jsx` "iPhone purchase: stage and a cancelled higher plan (#164)" (4, all fail without the fix).
- **Note**: the iPhone app opens its saved copy of the site and picks up a web release on the NEXT open (#121) — the owner's first test after the merge still ran the old fade. Close the app fully and reopen it twice before re-testing a web fix.

### 165. Black screen on opening, slow launch, reload when coming back mid-workout, flashes around purchases (owner, 2026-11-04)
Measured on a phone-speed connection and CPU (Playwright, iPhone 13, 4× CPU, 150 ms / 4 Mbps), a signed-in Train Solo member, same conditions before and after.
- **Causes found**:
  1. Train Solo's loading screen (`SoloRoutes` `SoloSessionLoadingScreen`) was a plain **black** `#0A0A0B` div in light and dark mode: every launch went white splash → empty frame → white → **black (0.4–1.25 s)** → app.
  2. "/" waited for **Coaching's** sign-in check before sending a Train Solo member to Train Solo, and Train Solo's code only started downloading after that redirect; `<Navigate>` drew an empty frame.
  3. `soloAuth = getAuth()` comes with the popup/redirect helper: Firebase loaded Google's sign-in iframe and **waited for it before restoring the session** on every launch (until a timeout with no signal). Train Solo has no popup/redirect sign-in.
  4. Train Solo statically imported six things from `ClientApp.jsx`, pulling the coached app's code and food database (**~675 KB**) into every launch.
  5. After sign-in, the profile took **~0.8 s** to come out of Firestore's on-phone database.
  6. The Inter stylesheet was **render-blocking**: with Google slow (3 s) nothing drew for 3.45 s — in the iPhone app that's the native background (black after a dark screen).
  7. The page under Train Solo was always **white**, so dark mode flashed white on every bounce and any undrawn frame.
  8. The workout screen draws outside `#root` (portal); the iPhone app's alive check (`pageDrawsFrame`) counts `#root`'s children → 0 → re-attach → **`rebuildWebView` (full reload) on every return to the app mid-workout**.
  9. After a purchase, "Confirming your membership" and "Welcome to …" faded in from transparent, showing the page underneath between screens.
- **Fixes** (web only — reaches installed builds on their next open; nothing native):
  - `src/solo/SoloLaunchScreen.jsx`: one loading screen in the member's colour (white / #0A0A0B) with the APEX mark, `data-apex-loading`; used for the /solo Suspense fallback, the "/" redirect and `SoloRoutes`' loading screen.
  - `App.jsx`: a phone signed in to Train Solo only (no Coaching profile on it) goes to /solo/home at once and starts downloading Train Solo's code at startup; the redirect draws the launch screen under `<Navigate>`. Anyone with a Coaching profile on the phone keeps the old order.
  - `firebase.js`: `soloAuth = initializeAuth(soloApp, { persistence: [indexedDB, local, session] })` — getAuth's own storage and order, without the popup/redirect helper. Coaching's `auth` unchanged.
  - `src/solo/soloScreens.js`: program page, workout, summary, session builder and Progress load separately (`lazyScreen`), fetched 0.3 s after Home is up (`preloadSoloScreens`); a fetched screen is handed to React synchronously (no loading frame).
  - `SoloAppContext`: the profile is kept on the phone (`apexSoloProfile`, uid-checked, cleared on sign-out/deletion/server "gone") and shown the moment sign-in is confirmed; Firestore's listener replaces it. Never decides access. `soloListsReady` → My Training's day plan shows an empty placeholder, not "Browse the catalogue"/"Rest day", until the programs have loaded.
  - `index.html`: Inter loads with `rel=preload` → stylesheet (non-blocking), `<noscript>` fallback.
  - `SoloThemeContext`: `document.body` background = the Solo theme while Train Solo is open; reset on leaving.
  - `SoloRoutes`: a hidden `<span data-apex-page="solo">` keeps `#root` non-empty on every Train Solo screen.
  - "Confirming your membership" and the welcome screen draw `instant` (no fade).
- **Measured** (same conditions, 3 runs each): Home on screen **2.05 / 2.20 / 2.21 s → 1.47 / 1.53 / 1.69 s**; black screen every launch → none; empty frame → none; no signal: **3.4 s (0.9 s black) → 1.95 s**; Google fonts 3 s slow: first paint **3.45 s → 0.26 s**, Home 4.5 s → 2.09 s; client-app code at launch 675 KB → 0 (fetched after Home). Navigation on the new build: tabs, program page and back 98–257 ms with no blank or loading frame; background → foreground no change; a set saved on the phone in 46–127 ms; a workout completed offline in 0.96 s ("saved on your phone") and was on the server after reconnecting (checked from a fresh profile). Coaching: "/" → chooser, /login with Inter, /app and /coach guarded — unchanged.
- **Tests**: `src/solo/launch165.test.jsx` (11: launch screen colours, SoloRoutes loading screen, "/" straight to Train Solo + Coaching-phone order kept, soloAuth without the helper and Coaching's getAuth unchanged, no ClientApp/foodDatabase in Train Solo's static import graph, preloaded screen shows with no fallback, page colour + reset, non-blocking font link, `#root` non-empty under the workout portal + native check reads `#root`), `src/lib/SoloAppContext.profileCache.test.jsx` (5), `oneProgramAtATime.test.jsx` loading placeholder, `subscriptionGates.test.jsx` Confirming/welcome opacity 1 with no transition. Run against the original code: launch165 can't load (SoloLaunchScreen missing) and the `#root` test fails with only the marker removed; 4 of 5 profile-cache tests, the placeholder test and the purchase-screen test fail. Full suite 1058 passed.
- **Not verifiable here**: real iPhone (WKWebView) launch time and the return-to-app check — needs the TestFlight build: open the app cold (light and dark mode), leave mid-workout for 30 s and come back (the workout screen must still be there, no reload), buy a plan (Opening the App Store → Apple → Confirming → Welcome with no flash).

### 166. White screen after cancelling a subscription; white after "You're all set" until leaving and reopening the app (owner, TestFlight, 2026-11-04)
- **Problem**: (1) After cancelling in Apple's Manage Subscriptions sheet, the app was a completely white screen. (2) After a purchase ("You're all set"), white; "Welcome to All Access" appeared only after leaving the app and coming back.
- **Cause**: Apple's sheets freeze WebKit's drawing of the page. The page (and the welcome) is all there, JS running, but its layer tree isn't drawn. Only "the app came back to the front" unfreezes it (WebKit `ApplicationStateTracker`: the window scene's background/foreground notifications → `_applicationWillEnterForeground`), which is exactly what leaving and reopening the app does. A reload or a brand-new web view (#161) doesn't send that. (1) also had no protection at all: `manage` showed Apple's sheet straight over the page, with no cover and no recovery.
- **Fix** (native, `ios/`, needs the next build):
  - `wakeWebKit()` posts `UIScene.didEnterBackgroundNotification` then `willEnterForegroundNotification` for the web view's window scene. It runs before the first "is it drawn?" check after Apple's sheets (`revealAfterPurchase`), before giving up on a blank page (wake, look again 0.5 s later, only then a new web view), in `verifyShownAfterPurchase`, and in the return-to-app check before re-attaching.
  - Manage Subscriptions: covered by a picture of the page before Apple's sheet (`coverPageForSheet`). When it closes, `manageSheetDidFinish`: "One moment", a brand-new web view on **Train Solo Home** (`freshPageURL`; the plan is re-read on open, #133), shown only once really drawn.
  - Web: the welcome's "Start training" goes to Train Solo Home (`/solo/home`) from whichever page it was bought on.
- **Tests**: `src/nativeAppleSheets166.test.js` (4: manage covered and handed over; fresh page on Home, cleared after; wakeWebKit posts the scene notifications; wake before each drawn/blank decision and before re-attach), `subscriptionGates.test.jsx` "Start training" lands on Home (fails on the old code). `afterPurchaseWhiteScreen` / `nativePurchaseReveal` updated for `freshPageURL ?? currentSitePage` and `uncoverAfterPurchase`. Swift: ViewController type-checked with Swift 6.0.3 against framework stand-ins; PurchasesBridge parsed, and its manage closure's shape type-checked (`let show: () -> Void`).
- **Verify on TestFlight (next build)**: buy a plan → Opening the App Store → Apple → "You're all set" → Confirming → Welcome (no white, no leaving the app) → Start training → Home. Profile → membership → Manage → cancel in Apple's sheet → close it → "One moment" → Train Solo Home, shown as Free.

### 167. Coach console: every client's page crashed ("Something went wrong") (owner, 2026-11-04)
- **Problem**: opening any client's profile in the coach console showed "Something went wrong" (stack: `QuickSendActions` in CoachShell).
- **Cause**: a regression from #162. `QuickSendActions` (the "Send welcome message now" link) looked up earlier welcomes with `(db.messages || []).filter(...)`, but `db.messages` is grouped by client (`{ [clientId]: [...] }`, AppContext `bucket()`), not a list, so `.filter` threw on every client page. The #162 test fed a flat list, so it passed. The coach console should not have been touched by Train Solo work; this came from the welcome-message fix, which was coach-side by necessity, and it went out with a test that didn't use the real data.
- **Fix**: `db.messages?.[client.id] || []`, the client's own thread, as every other coach screen reads it (`CoachMessages`, `CoachClients`, `CoachDashboard`).
- **Tests**: `src/coach/welcomeMessageSend.test.jsx` now builds `db.messages` exactly as AppContext does (grouped by client), plus 2 new tests: the page opens with grouped messages (another client's welcome doesn't count), and with no messages loaded. On the #162 code, 5 of the 6 tests fail with the crash.

### 168. Delete an archived program by swiping (owner request, 2026-11-04)
- **Change**: on My Training → Archived, swipe a program left to show **Delete**. It asks first ("Delete program?", what goes and that "Your logged sessions, PRs and everything on Progress stay"), with **Delete program** / **Keep it**. The current program can't be swiped.
- **What's removed** (`planRemoveProgram`, `src/solo/currentProgram.js`; `removeSoloProgram` in SoloAppContext, offline-safe through `keep()`, batches of 400):
  - own built program: its `soloCustomPrograms` doc;
  - All Access program: its enrolment (it stays in the catalogue to start again);
  - bought program: never deleted (paid for, and firestore.rules refuse it). Its start date is cleared and `hiddenPrograms[programId]` hides it from Archived; starting it again (`switchSoloProgram`) un-hides it;
  - all three: its archived record, `sessionPlan` and `programSwaps`.
- **What stays**: every logged session (Progress, PRs, history, muscle map). The sessions are detached from the program (`purchaseId` → `<id>_removed_<time>`, `removedFromProgram`), because All Access enrolment ids are fixed per program and a re-started program would otherwise show the old sessions as done.
- **Swipe**: `src/solo/SoloSwipeRow.jsx`, Train Solo's own (never `ClientApp`'s `SwipeableRow`), following the #107/#109 rules: no capture on pointerdown, capture once a sideways swipe starts (in try/catch), finish from window-level up/cancel, decide from `dragXRef`; a tap on an open row closes it.
- **Tests**: `currentProgram.test.js` planRemoveProgram (4: All Access, built, bought, current refused); `oneProgramAtATime.test.jsx` (3: swipe → Delete → confirm deletes only that program, Keep it deletes nothing, a hidden bought program isn't listed). These fail without the change (no swipe row, no function). Real touch (CDP `Input.dispatchTouchEvent`, iPhone 13 emulation), 6 checks: a tap opens the program; a vertical scroll only scrolls; a short swipe snaps back; a full swipe reveals Delete; tapping Delete asks and closes the row; tapping an open row closes it without opening the program.

### 169. "The date is wrong" on My Training; Train Solo sweep (owner, 2026-11-04)
- **Problem**: My Training showed a session dot on **Monday 2nd** while the current program had just started (Wed 4th), so the week looked wrong.
- **Cause**: an archived program's calendar showed every session dated before it was archived, **including ones never done**, as still to do. Switching programs today left the archived program's undone Monday session on the week strip.
- **Fix** (`soloCalendar.js` `buildSoloCalendar`): an archived program (one with `untilDate`) shows only its sessions that were done. That's its history; nothing "to do".
- **Sweep, Train Solo only**:
  - Dates: no UTC-date traps (`toISOString` dates, date-only strings parsed as UTC) anywhere in Train Solo. Weigh-ins and photos store timestamps or local noon.
  - Removed dead code: `TIERS` (soloAccess.js), the unused `soloEnrolments` in My Training, the unused `trendDirection` import in Progress, and the unused `dark` parameter in the welcome screen. No unused Train Solo files.
  - Buttons: the builders, workout, program page, start-date sheet, program overview and consultation used the shared sentence-case `PrimaryButton`, against #143/#144. They now use `SoloButton` (bold all-caps). The login, register and finish-setup photo screens keep their own style.
  - Click-through of every Train Solo screen on a fresh account (register, questionnaire, first session, My Training, Catalogue, a program and its exercise sheet, Progress, Profile, theme switch, Calendar, both builders, Recovery, Consultation, week recap, Program complete, a quick workout and cancel, reload): no page errors, no console errors (twice, before and after the button change).
- **Tests**: `enrolments.test.js` (2, rewritten for the rule: an archived program shows only the sessions done before it was archived, never one to do). Both fail on the old calendar code. Full suite 1071 passed.

### 170. Train Solo workout: Start timer colour; Reps before Kg (owner, 2026-11-04)
- **Problem**: (1) the workout screen's **Start timer** was slate grey-blue, not the coached client app's blue. (2) Kg came before Reps.
- **Cause**: (1) `SoloExerciseBlock` coloured it (and the running set timer) with the coach-chosen Train Solo branding accent (`soloBranding.accent`, set to slate). The client app uses `MEASURE_BLUE`.
- **Fix** (Train Solo only, `SoloExerciseBlock.jsx`): both timer buttons use `MEASURE_BLUE`. The set columns are **Reps, then Kg** (header and inputs), the same order as the "Previous" and "Target" lines.
- **Tests**: `soloRestRow.test.jsx` (2, under a slate branding accent: Start timer is rgb(47, 143, 255); header REPS → KG and inputs numeric → decimal). Both fail on the old code. Full suite passes.

### 171. Calendar tab with drag to move workouts, like the client calendar (owner request, 2026-11-04)
- **Change**: Train Solo's tabs are **My Training, Progress, Calendar, Catalogue, Profile** (My Training's icon is now a dumbbell). `/solo/calendar` links redirect to the tab.
- **Moving a workout works exactly like the coached client app's calendar** (`ClientCalendarScreen`): every day is listed; a session still to do has a grip handle; hold it (220 ms), drag onto a day in the list (the day gets a blue ring; the list auto-scrolls near its edges), let go. A hint under the title says "Hold a workout and drag it to another day to move it."
- **What can move / the write** (`canMoveItem`, `planMove` in `soloCalendar.js`): program sessions of a running program not done or skipped, and their own planned sessions, today or later; written to `sessionPlan.moveTo` (#141) or `plannedSessions` (#142). Logs never touched.
- **Tests**: `src/solo/calendarMove171.test.jsx` (9: what can move, the writes, never into the past, the hint, grip-drag onto a listed day moves it, moving first is a scroll, every day listed, tab order). The #165 `#root` test moved to `rootMarker165.test.jsx` (it shared a module registry and failed about 1 run in 4).

### 172. Train Solo sweep: full journey on a fresh account; memo fix (2026-11-04)
- **Verified end to end** (built app, iPhone 13, fresh account on the live Firebase, deleted afterwards):
  - register and questionnaire;
  - build two sessions, then a program from them (scheduled automatically);
  - My Training shows it;
  - Calendar tab, real-touch drag of "Pull · Week 2" from the 16th onto the 15th: the target day shows the blue ring and the session moves;
  - log a set and complete the workout; Progress session history shows it;
  - a second program puts the first in Archived; swipe-delete it; Progress still shows the session;
  - theme switch; reload signed in back on Home in 0.94 s; sign out and back in; reload with no signal opens the app;
  - no page errors and no console errors.
- **Fixed**: `SoloCatalogueScreen`, `SoloFirstSessionScreen` and `SoloOnboarding` fell back to a new `{}` when there were no questionnaire answers, so their memos (the catalogue's recommendations among them) recomputed on every render. They now use one frozen `NO_ANSWERS`, and nothing writes into it.
- **Test**: `src/solo/stableAnswers172.test.js` (3; all fail on the old code).
- **Not bugs**: the one-time "How your programs work" guide (by design, #142); the Monday recap row (only for members with logs).
- **Not testable here**: real App Store purchase, restore, upgrade and cancel (needs the iPhone and a sandbox Apple ID). Those flows are covered by `subscriptionGates`, `membershipLifecycle`, `afterPurchaseWhiteScreen`, `nativePurchaseReveal` and `nativeAppleSheets166`, all passing.
- **Scope**: Train Solo files only; no coach or client file changed.

### 173. Black screen after an iPhone purchase, until leaving and reopening the app (owner, TestFlight 190, 2026-11-04)
- **Problem**: after buying in the iPhone app (dark mode), the screen stayed black; leaving the app and coming back showed "Confirming your membership".
- **Cause**: #166's `wakeWebKit()` posted a fake `UIScene.didEnterBackgroundNotification` for the app's window scene. UIKit hears it too, not just WebKit, so the whole app stopped drawing — including the native "Confirming your membership" cover — until a real return to the app.
- **Fix** (`ios/ApexCoach/ViewController.swift`): `wakeWebKit()` now posts only `willEnterForegroundNotification` (WebKit's unfreeze signal), nudges the web view's height by 1 pt and back (a new size makes WebKit lay out and commit a fresh picture), and asks the page to repaint. `uncoverAfterPurchase` wakes the page as the cover comes off and again 0.5 s and 1.5 s later; the blank-page checks, retries and Continue fallback from #161–#166 stay.
- **Tests**: `src/nativeAppleSheets166.test.js` (6): no `didEnterBackground`/`willResignActive` anywhere in ViewController, the foreground-only post, the resize and repaint, and the wake at uncover. 3 fail on the old code. Swift type-checked against UIKit stubs.
- **Scope**: native iOS only; no web, coach or client file changed.

### 174. Train Solo: missing logo top left; tab headings not matching (owner, TestFlight, 2026-11-04)
- **Problem**: on the iPhone the APEX mark was missing top left on My Training and the Catalogue, leaving a blank gap (it showed in a browser). The tab headings were at different heights and sizes. "Welcome, <name>" was on the Catalogue.
- **Fix**:
  - The Solo logo is now a small image built into the code (`src/solo/soloMark.js`, 60 px tall, about 3 KB each) instead of `/brand/mark-*.png`, which could come up empty in the iPhone app.
  - New `SoloPageHeader` (SoloUI.jsx) on all five tabs: the logo, then the title at one size and position.
  - "Welcome, <first name>" moved to My Training; the Catalogue heading is just "Catalogue".
- **Verified**: built app, iPhone 13 size, fresh test account (deleted afterwards). Every tab's h1 is at top 59 px and 20 px, and the logo is loaded on all five.
- **Test**: `src/solo/pageHeader174.test.js` (3; all fail on the old code).
- **Scope**: Train Solo files only.

### 175. White screen after cancelling a subscription in the iPhone app (owner, TestFlight, 2026-11-04)
- **Problem**: after cancelling through Manage Subscriptions, the app showed a white screen.
- **Cause**: Apple's Manage Subscriptions can answer while its sheet (the cancel confirmation) is still up. The app made the fresh page and took its cover off under that sheet. WebKit froze the page there, so it showed white once the sheet closed. The wait only checked that the app was "active", which it is under that sheet, and it gave up after 5 s.
- **Fix** (`ios/ApexCoach/ViewController.swift`, native only):
  - `whenAppActive` also waits until `presentedViewController == nil` (Apple's sheet really gone), for up to 10 minutes.
  - `uncoverAfterPurchase` never takes the cover off while a sheet is up; it waits, then checks the page again.
  - The 15 s Continue fallback starts only once the fresh page is being made.
  - The purchase flow uses the same path.
- **Tests**: `src/nativeAppleSheets166.test.js`, 3 new; 2 fail on the old code. The third (the 15 s fallback after the rebuild) matches the old text too. Swift type-checked against UIKit stubs.
- **Scope**: native iOS only; no web, coach or client file changed.

### 176. Train Solo: gaps between logo and headings too big (owner, 2026-11-04)
- **Change**: in `SoloPageHeader`, logo → title went from 20px to 10px and title → first section from 12px to 8px. My Training lost its extra 8px above the week strip, and the space from the week strip to "Today, …" went from 24px to 16px. Profile's extra 12px under the header is gone. All five tabs still put the title at the same place (now 49px from the top on an iPhone 13 screen, checked in the built app).
- **Test**: `src/solo/pageHeader174.test.js`, 1 new test (fails on the old spacing).
- **Scope**: Train Solo files only.

### 177. "One moment" stuck after cancelling a subscription in the iPhone app (owner, TestFlight, 2026-11-05)
- **Problem**: after cancelling in Manage Subscriptions, the native "One moment" screen (blue line) stayed up for good.
- **Cause** (from #175):
  - The fresh page waited for `presentedViewController == nil` for up to 10 minutes, and the 15 s Continue fallback was armed only after that wait.
  - After a cancel, iOS can leave Apple's dismissed controller presented with no window, so the wait never ended and neither did the screen.
- **Fix** (`ios/ApexCoach/ViewController.swift`, native only):
  - A presented controller counts as "Apple's sheet still up" only while it is on screen: it has a window and is not being dismissed.
  - The 15 s Continue fallback is armed again the moment the sheet closes.
  - `uncoverAfterPurchase` no longer waits on `presentedViewController`.
- **Tests**: `src/nativeAppleSheets166.test.js` (#175 tests replaced, 3; all fail on the #175 code). Swift type-checked against UIKit stubs.
- **Scope**: native iOS only.

### 178. "How your programs work": finish one program; move sessions in Calendar (owner request, 2026-11-05)
- **Change** (`src/solo/SoloProgramSwitch.jsx`, `GUIDE`): point 1 now adds "For the best results, complete one program fully before starting the next." A new point 2, "Move a session to another day", says: "In Calendar, hold a session and drag it to the day that suits you." This is the real gesture (#171); it's a hold-and-drag, not a swipe.
- **Test**: `src/solo/programsGuide178.test.jsx` (2; both fail on the old text).
- **Scope**: Train Solo only.

### 179. Consultation suggestions: women get only women's programs, men only men's (owner, 2026-11-05)
- **Problem**: suggestions already filtered by "Who it's for", but an untagged program went to everyone. Push Pull Legs (untagged) was suggested to women and men alike.
- **Fix** (`src/solo/recommendations.js` `suitsAudience`): a customer who answered Male or Female is only suggested programs tagged for them. Tag both for a program that suits everyone; an untagged program isn't suggested to either. "Other / prefer not to say" (or no answer) still sees everything. Every suggestion goes through this: consultation, first session, Program complete. The coach console's "Who it's for" hint now says so (text only, `CoachTrainSolo.jsx`).
- **Live programs** (read 2026-11-05):
  - Women: The Hourglass Method, The Glute Project, Home Bodyweight Foundation.
  - Both: Gym Foundation, Strength & Powerbuilding.
  - Untagged: Push Pull Legs, Maximal Strength (draft). These are now not suggested to men or women until tagged.
- **Test**: `src/solo/recommendationsAudience.test.js` (updated; 2 fail on the old code).
- **Scope**: Train Solo suggestions; one hint line in the coach's Train Solo program editor.

### 180. Train Solo: Getting Started guide for Free members (owner request, 2026-11-05)
- **Change**:
  - `SoloGettingStarted.jsx` is a solid full page (#141 style): 5 steps, each with a large figure, a title, a short line and three how-to points. The steps are Create a session, Plan your week, Log your workout, Exercise library, and Track your progress.
  - Interactive: swipe or Next/Back, a tap on the progress bars to jump to a step, Skip at any time, and a "Try it" link that opens the real screen.
  - Rules live in `src/solo/gettingStarted.js`.
- **Once ever**:
  - It shows by itself on My Training only for a Free member who has never seen it and has no logged sessions. It waits until their plan and lists have loaded (`soloEntitlementReady`, `soloListsReady`), so it never flashes for a paying member or one with history.
  - The moment it shows, it is marked seen on the account (`soloUsers/{uid}.gettingStarted.seenAt`) and on the phone (`apexSoloGettingStarted:<uid>`). This follows the one-time-sheet rule in #142.
  - Every step is saved (`gettingStarted.step`). Skip and finish both save `finishedAt` and an `outcome` (`skipped` / `completed`).
  - All writes go through `saveSoloGettingStarted` (SoloAppContext, local-first `keep`, #157). The programs run-through (#142) waits until Getting Started is closed.
- **Profile**: a permanent "Getting Started" row reopens it at any time. It opens at the saved step if it was left part-way, otherwise from the start.
- **Verified** (built app, iPhone 13 size, live Firebase, fresh @example.com accounts, deleted afterwards):
  1. It showed by itself on first entry. Next, Next, Skip saved `{seenAt, step: 2, finishedAt, outcome: "skipped"}`.
  2. A refresh didn't show it again.
  3. A new browser with empty storage (a new phone) logged in, and it didn't show.
  4. Profile → Getting Started reopened it from the start, and Start training closed it.
  5. Dark and light mode both look right.
  - **Not deleted:** the first (aborted) run's account was not deleted (its email file was overwritten by the next run).
- **Tests**: `src/solo/gettingStarted180.test.jsx` (11). Without the change they fail: the module is missing, and the wiring checks don't match the old My Training / Profile.
- **Scope**: Train Solo only. SoloAppContext gains one Train Solo method; no coach, client or shared file changed.

### 181. Train Solo subscription lifecycle audit: white flash and stale plan after Stripe returns, slow activation, abandoned checkout (owner, 2026-11-05)
- **Problems** (website purchase / cancel / repurchase traced end to end; the iPhone app's Apple-sheet path was covered by #161–#177):
  1. **A white flash after cancelling** (and after every other return from Stripe). Each return from Stripe (checkout paid, checkout abandoned, billing portal) is a full page load, and so is the iPhone app's fresh page after Apple's sheets. Until the app's code and stylesheet arrived the page was the browser's plain white, then the dark launch screen: a white frame for every dark-mode member (seen in a throttled browser: 1 white frame on the old build, 0 on the new).
  2. **The cancelled plan still showing after the billing portal.** The website never re-read the plan on a fresh load (only the iPhone app does, #133; visibilitychange doesn't fire on a new page). The phone's saved copy (#137) showed the cancelled plan until Stripe's webhook landed, and the `?soloTab=profile` stayed in the address.
  3. **Slow activation after paying.** Back from checkout (`?subscribed=`), the page only waited (up to 15 s) for the webhook. Asking the server to sync didn't help a first-time subscriber: their entitlement has no `stripeCustomerId` until that same webhook.
  4. **Abandoned checkout said nothing**: `/solo/home?subscribe=cancelled` landed on Home with the query left in the address.
  5. **Manage (Stripe portal) gave no sign of life** for the round trip, and each extra tap opened another portal session.
- **Fix**:
  - `index.html`: on Train Solo pages (or "/" on a phone signed in only to Train Solo) a first-frame style paints the member's page colour (`soloThemeDark`, dark when never set) before any script. `SoloThemeProvider` removes it as it takes over the page colour, so leaving Train Solo is unchanged.
  - Server (`functions/soloSubscriptions.js` `customerFromCheckout`, `functions/index.js`): the checkout's `success_url` carries `session_id={CHECKOUT_SESSION_ID}`. `syncSoloEntitlement({ checkoutSessionId })` unlocks from that checkout, but only for this account's completed subscription checkout (client_reference_id / metadata), before the webhook. The billing portal returns to `?soloTab=profile&billing=returned`.
  - App (`SoloPaywall.jsx` `SoloPaywallProvider`): every Stripe return is handled once and its query removed (replace). For a paid checkout: "Confirming your membership", the server is asked at once with the checkout id (then 3 more times, 2.5 s apart), and the welcome appears on its reply or the live listener, whichever comes first. The 15 s "on its way" note is kept. An abandoned checkout reopens the membership sheet with "Checkout cancelled — you haven't been charged.", after `soloEntitlementReady`. A portal return (new marker, or an older server's bare `?soloTab=profile`) re-reads the plan at once. Profile shows "Train Solo membership · Checking your membership…" until the reply, capped at 8 s with no signal, and never the plan that may have just been cancelled. The Profile tab is kept through the history state.
  - Manage → Stripe portal: busy ("Opening…", disabled) from the tap until the page has gone; usable again on error or Back (`pageshow`).
  - `refreshSoloEntitlement(opts)` passes `checkoutSessionId` through. An older server ignores it, so app and server can deploy in either order.
- **Tests**: `src/solo/stripeReturn181.test.jsx` (13): paid-checkout return unlocks from the checkout id and welcomes without the webhook; query removed; listener path still welcomes; abandoned checkout reopens the sheet, but only once the plan is known; portal return re-reads once, Profile says Checking until the reply then settles, old `?soloTab=profile` treated the same, never stuck on Checking; a plain Home open calls nothing; Manage busy, one portal session; index.html paints dark / white by the member's choice, nothing on Coaching pages, and SoloThemeProvider removes it. `functions/soloSubscriptions.test.js` (3): `customerFromCheckout` gives this account's completed subscription checkout's customer, and nothing for another account's, an open, a single-program, an unknown or a malformed one. 14 of the 16 fail on the old code; the other 2 ("plain open asks nothing", "theme removes the paint") guard against over-fetching and leaking the colour. Full suite: 1123 passed. Real browser (built app, Chromium, 400 ms / 200 KB/s): first frame on a Train Solo page dark before any script; a Coaching page unchanged.
- **Scope**: Train Solo only (index.html's script does nothing off Train Solo pages). Functions deploy on merge to main (`deploy-functions.yml`); until they do, the app behaves as before for the checkout return (webhook + listener).
- **Verify after deploy** (website, Stripe live): buy Plus → back → Confirming → Welcome in about a second. Profile → Manage → cancel in Stripe → back → "Checking your membership…" → Free, no white frame. Buy again → welcome. Start a checkout and press Stripe's back link → the sheet says you weren't charged.

### 182. Train Solo performance pass: startup code, measured (owner request, 2026-11-05)
- **Measured** (built app, Chromium, phone-like profile: 4× CPU slowdown, 1.6 Mbps, 150 ms latency, cache off, 5 runs, median; Firebase blocked so only the app's own code is timed): navigation → first Train Solo screen (`/solo/register`) **3,396 ms, 444 KB** downloaded.
  - Where it goes: the shared main bundle is 352 KB gzipped (Firebase Firestore/Auth/Storage/Messaging, React, the router, plus shared app code such as `seed.js`, `barcodeLookup.js` and `legalContent.js`). Train Solo's own startup chunk was 44 KB gzipped and carried every rarely-first screen.
  - Checked and fine: the `SoloAppProvider` value is memoised (the minute clock doesn't re-render its users), and tabs, Progress and the workout screens already load separately (#165).
- **Change** (`src/solo/soloScreens.js`, `SoloRoutes.jsx`): screens that are never the first one on a normal open are no longer part of Train Solo's startup code. That's the questionnaire, consultation, program builder, Program complete / week recap, first session and active recovery. They load through `lazyScreen` and are preloaded with the rest once Home is up (`preloadSoloScreens`). The questionnaire is also fetched as soon as Train Solo opens signed out or not yet through it (`PreloadOnboarding`), so it's there when registration finishes. While a screen's code is still coming, the Suspense fallback is the launch screen, never blank.
- **Result**: startup chunk 44.3 → 35.0 KB gzipped; first screen **3,231 ms, 429 KB** (−165 ms, −15 KB).
- **Tried and reverted**: a build step that preloaded Train Solo's chunks from index.html in parallel with the main bundle. It measured *slower* (3,476 ms): on a bandwidth-limited connection the chunks compete with the main bundle, and the waterfall only costs one round trip.
- **Not changed (shared code, off-limits to Train Solo work, needs the owner's call)**: the remaining startup cost is the shared main bundle that Coaching uses too. The biggest candidates are `re2js` (~246 KB raw, pulled in with Firestore), `src/lib/seed.js` (116 KB raw), `legalContent.js`, `barcodeLookup.js`, Firebase Storage and Messaging. Moving them out of the main bundle changes the coach console's and coached app's launch too.
- **Tests**: `src/solo/startupSplit182.test.jsx` (2): SoloRoutes imports none of the split screens directly; each resolves to the real component and `preloadSoloScreens` fetches them all. `src/solo/startupPreload182.test.jsx` (1, its own file: it loads SoloRoutes with stand-ins, and in a shared module registry it failed on CI): the questionnaire is fetched when Train Solo opens signed out. All 3 fail on the old code. `rootMarker165.test.jsx` stand-ins updated for the new exports. Full suite: 1126 passed.
- **Scope**: Train Solo only.

### 183. White screen after a successful purchase in the iPhone app, again (owner, release blocker, 2026-11-05)
- **Problem**: a successful Plus / All Access purchase in the iPhone app repeatedly ended on a white screen, despite #153–#177.
- **What's known from the device** (#134, #153, #161, #163, #173): under Apple's sheet WebKit stops painting the page while its code keeps running and answering. When that happens the web view shows only its own background colour: white in light mode, near-black in dark mode, which is why some reports said "black". It's outside our code. Our part is the native cover (#135/#161) and deciding when it's safe to take it off.
- **Root cause in our code** (traced through `PurchasesBridge.purchase` → `purchaseSheetDidFinish` → `whenAppActive` → `rebuildWebView` → `didFinish` → `revealAfterPurchase` → `uncoverAfterPurchase` → `verifyShownAfterPurchase`, and the web's `SoloPaywallProvider`):
  1. **The cover came off on a check proven to lie.** "Is it really showing?" (`pageLooksBlank`) uses a picture of the screen only once `calibrateScreenPicture` has confirmed it works on this launch. That confirmation runs once, 2 s after a page finishes loading, and is dropped if the page is still on a loading screen, the app isn't active or a cover is up. SPA navigation never retries it. Without it, every check after Apple's sheet used WebKit's own picture. WebKit re-draws the page itself for that picture, so it looks fine while the screen is white (#163). The page's own "drawn" answer can't see it either (#161). Both checks said "showing", the cover came off, and the screen was white.
  2. **The fresh page relied on the frozen page to learn about the purchase.** Apple's answer reached the page only through the OLD page's code (`receive` → `rememberPurchaseOutcome` → localStorage), which WebKit had frozen. That code can run late or not at all, and its storage write may not be flushed before the old web view is replaced about 1.3 s later. The fresh page then opened with no "Confirming / Welcome" and the plan still Free until the sync on open.
  3. **The page was checked once after the cover came off** (1.2 s). The web's flow goes on from Confirming to the welcome after that, and a page that stopped painting later was never caught.
- **Fix** (native, `ios/ApexCoach/ViewController.swift`, `PurchasesBridge.swift`; needs a new 1.0.4 build):
  - `calibrateBeforeSheet()`: just before Apple's sheet, while the member is looking at the drawn "Opening the App Store" screen, a picture of the screen that shows something confirms the screen check (`screenPictureWorks = true`). A flat picture never turns the check off.
  - Apple's answer goes to the fresh page directly. `PurchasesBridge` hands `sheetFinished` the outcome: `ok` / `cancelled` / `error`, plus the plan's `tier`. `rebuildWebView` injects it as a `WKUserScript` at document start, main frame only (`outcomeScript`), writing `apexSoloPurchaseOutcome` before the page's code runs. It's written once per purchase (a nonce), so a later load after the page has finished with it doesn't bring it back. Apple's answer replaces anything the old page left. The script is removed when the cover comes off, and a new sheet starts clean. Manage Subscriptions passes no answer.
  - After the cover comes off, the page is checked at 1.2 s, 3 s and 6 s (`verifyShownAfterPurchase(generation:)`), each check only for its own uncover. On white the purchase screen goes back up and the page is recovered, twice at most (`verifyRecoveries`), then **Continue**.
  - A payment waiting for approval (Ask to Buy, a bank's check: RevenueCat `paymentPendingError`) says "Your purchase is waiting for approval…" instead of RevenueCat's wording.
  - **Instrumentation** (`PurchaseTrace`): every step from the sheet request is recorded on the phone with its time, up to the cover coming off and each later check. That covers the sheet's answer and app state, the screen check in use, app active, the fresh web view and whether the answer was handed over, each load, each reveal try, every blank-check answer and which method gave it, and Continue. Readable in Train Solo → Profile → **Purchase log** (test accounts, iPhone app; `getPurchaseTrace` → the bridge's `trace` action). It never leaves the phone by itself.
- **Web** (`src/lib/purchases.js` `getPurchaseTrace`, `SoloAppContext` `soloTestAccount`, `SoloProfileScreen.jsx`, new `SoloPurchaseLog.jsx`): only the Purchase log viewer. Coach and client code untouched.
- **Tests**:
  - `src/solo/purchaseWhiteScreen183.test.jsx` (15): the Swift's calibration before the sheet and its rules; the outcome hand-over (signature, tier, injected before the page's code, removed after, reset per sheet, none for Manage); the pending message; three checks per uncover and the loop cap; trace calls at every step.
  - The injected script, **executed**, taken from the Swift source: it writes Apple's answer, replaces a stale cancel, and is once per purchase.
  - The fresh page **end to end** with the real `SoloPaywallProvider` when the old page never saved the result: Confirming → Welcome → Start training → `/solo/home` with the outcome cleared; a slow sandbox confirmation (asked 4 times, then the honest "hasn't reached your account yet", page underneath, never blank); waiting for approval → the sheet says so; cancel → page as it was.
  - 14 of the 15 fail on the old code.
  - `src/solo/purchaseLog183.test.jsx` (3): Profile shows the log to a test account in the iPhone app with the app's lines; an older build gets a plain message; hidden for others and on the website. 2 of the 3 fail on the old code; the third (hidden for others) also holds there.
  - `afterPurchaseWhiteScreen.test.jsx` / `nativeAppleSheets166.test.js` updated for the new signatures (same assertions).
  - Full suite 1144 passed; `vite build` clean.
  - Swift: `ViewController.swift` + `PurchasesBridge.swift` type-checked with Swift 6.0.3 (Swift 5 mode) against stand-in UIKit / WebKit / StoreKit / RevenueCat modules declaring only the APIs used: 0 errors, 0 warnings. A deliberate typo is caught, so the check is real. Codemagic's build is the full compile.
- **Second pass, same day (before merging)**:
  - **"One moment" could stay up for good.** The 15 s Continue limit was armed only when Apple's sheet closed, not after tapping Continue or after a check put the purchase screen back. If the fresh page then never finished loading, nothing limited the wait. Now `armContinueFallback()` is armed on all three, and only the latest one acts.
  - **Force-quit during Confirming.** Apple's answer was kept only in memory and lost with the app. Now it's also kept on the phone for 10 minutes (`apexPendingPurchaseOutcome`) and handed to the first page on reopening, so the member still gets Confirming → Welcome. It's cleared once a page has it (cover off, the reopened page loaded, or a new sheet).
  - **Server (`appleSourceFromSubscriber`): an All Access purchase could read as Plus.** RevenueCat's `plus` entitlement covers all four products; when it reported an All Access product only there (the `all_access` entitlement missing or late), Plus was taken before the All Access product was looked at. Now an entitlement is never below its product's own tier, and the highest tier is checked first.
  - Tests: `purchaseWhiteScreen183.test.jsx` +3 (the limit armed on all three waits; force-quit kept and handed over; cleared once used); 4 fail on the earlier #183 Swift. `functions/soloSubscriptions.test.js` +3 (All Access under "plus" only → All Access, which fails on the old code; Plus upgraded to All Access → All Access; All Access downgraded at renewal → Plus). Two older native tests read the 15 s limit from the new helper (same assertions). Full suite 1150 passed; Swift type-check 0 errors / 0 warnings.
- **Not verified on a device** (no iPhone or macOS here). After the new build, on TestFlight with a sandbox account:
  1. Buy Plus in light mode: Opening the App Store → Apple → "You're all set" → Confirming → Welcome → Start training → Home unlocked, with no white frame.
  2. The same in dark mode.
  3. Upgrade to All Access.
  4. Cancel on Apple's sheet.
  5. Force-quit during Confirming.
  6. If anything is white or shows Continue: Profile → Purchase log → Copy, and send it.
- **Scope**: Train Solo and the iPhone app's purchase path only.

### 184. Train Solo sign-up: the consent boxes never showed a tick (owner, iPad/iPhone, 2026-11-05)
- **Problem**: on Train Solo's Register screen the "I agree to the Terms of Service" and "I've read and consent to the Privacy Policy" boxes stayed looking empty when tapped (owner's screenshot), so Create account looked stuck. The same boxes are on Finish setup and the questionnaire's health-consent step.
- **Cause**: native checkboxes styled `accent-white` on the dark photo. iOS draws the box white, and the accent made the tick white too, so a ticked box looked the same as an empty one.
- **Fix** (Train Solo only): `SoloCheckbox` (`src/solo/SoloUI.jsx`) keeps the real checkbox, invisible over the box, for taps and accessibility. The box beside it is drawn by the app: an outline when empty, white with a dark tick when ticked. It's used in all five places: Register ×2, Finish setup ×2, health consent ×1.
- **Tests**: `SoloRegisterScreen.test.jsx` +2. Each box draws its tick, tapping the words ticks it too, and no white-tinted native box is left; the first test fails on the old code. Finish setup and the questionnaire use `SoloCheckbox`. Existing consent tests unchanged and passing.
- **Real browser** (Chromium, iPhone 13 emulation, touch taps on the built app):
  - Before tapping: both boxes empty outlines.
  - After tapping each: white with a tick.
  - Tapping the words toggles the box.
  - Screenshot checked.
- **Scope**: Train Solo screens only (Register, Finish setup, questionnaire).

### 185. Website: "You're already on this plan" after cancelling and subscribing again (owner, 2026-11-05)
- **Problem**: on the website, after cancelling Plus through Manage (Stripe's billing page), subscribing again said "You're already on this plan." Nobody could buy again on the website after cancelling there.
- **Cause**: `priorCheckout` (#158) stops a second charge when the account's last subscription checkout was already paid but Stripe's webhook hasn't reached us yet. It looked only at whether that checkout was paid ("complete"), not at what happened to its subscription since. After a cancel, the old checkout is still "complete", so `createSoloSubscriptionCheckout` answered `{ already: "stripe" }` for good. `checkoutDecision` itself correctly saw the member as Free.
- **Fix** (`functions/soloSubscriptions.js`, deployed by the functions workflow): a paid subscription checkout blocks a new one only while its subscription is paid up (active / trialing) and not cancelled (no cancel at period end, no cancel date). Cancelled, failed payment (past_due / unpaid, which are Free for us; a new card is how they come back; `syncStripeCustomer` already cancels the stale one once the new one is paid) or never completed → buying again works. If Stripe can't be asked, it still refuses (no second charge). Single-program checkouts are unchanged.
- **Tests**: `functions/soloSubscriptions.test.js` "subscribing again after a cancel (#185)" (5): cancelled, cancel at period end / cancel date, past_due / unpaid → allowed; still paid up (webhook pending) → refused; Stripe unreachable → refused. 3 fail on the old code; the 2 refusal cases pass on both. The existing #158 priorCheckout tests are unchanged.
- **Scope**: Train Solo website subscriptions (server) only.

### 187. Train Solo: cancelling keeps the plan until the period ends; one suggested program (owner, 2026-11-07)
- **Change 1** (owner decision, replaces #156): cancelling Plus or All Access no longer ends it at once. The plan stays until the end of the period already paid for ("Won't renew · ends …" in Profile and the membership sheet), then becomes Free. Refunds, failed payments and expiry still lock at once.
  - Server (`functions/soloSubscriptions.js`, functions workflow):
    - **Stripe:** a subscription set to cancel at period end, or with a cancel date, keeps its real status (active / trialing). Its `expiresAt` is the period end, or the cancel date if earlier.
    - **Stripe:** `syncStripeCustomer` no longer ends a cancelled subscription in Stripe straight away; Stripe ends it at the period end and its webhook makes the account Free.
    - **Apple:** `unsubscribe_detected_at` inside the period stays paid up until expiry, with `willRenew: false`.
  - App (`soloAccess.js` `sourceActive`): a won't-renew / cancel-at-period-end source is paid up until `expiresAt`; a `cancelAt` in the past ends it.
  - Wording: the membership sheet says "If you cancel, it stays until the end of the period you've paid for."; the fine print before buying says the same; Terms section 17 updated, effective 7 November 2026. Deleting an account still cancels a website subscription at once (unchanged).
  - Firestore rules unchanged: `allAccessUntil` / `plusUntil` now run to the period end, so paid content stays readable until then.
- **Change 2** (owner): the Catalogue and the consultation screen suggest ONE program (the best match), not two. `recommendForAnswers` defaults to `limit: 1`; the "Closest to your answers" line reads "this is the nearest".
- **Tests**: 7 rewritten to the new rule, all failing on the old code:
  - **Server:** a Stripe cancel at period end / cancel date / cancelled trial runs to its end, then Free; Apple won't-renew runs to expiry, then Free.
  - **Server:** a cancelled subscription is not ended in Stripe early.
  - **App:** both stores, trial or paid; refund / billing issue / expiry still lock; Profile shows "Won't renew · ends …"; new wording, no "straight away".
  - **Membership lifecycle:** server and app agree on every store state.

  Recommendations: 2 new (one by default; both screens ask for one); both fail on the old code; the tie-break test now asks for 2 explicitly. Full suite 1160 passed.
- **Scope**: Train Solo only. Existing members whose Stripe subscription was already ended under #156 aren't affected; Apple members are re-read on their next open.

### 186. Train Solo: single program purchases alongside Free / Plus / All Access (owner request, 2026-11-07)
- **Change** (owner decision, replacing "single-program sales stop on launch day"): Free and Plus members can buy any catalogue program on its own, before and after subscriptions go live; All Access members get every program included. A bought program is the member's for good, whatever their plan.
- **What was already there and kept**:
  - The original single-program sales: `createSoloCheckoutSession` (a one-off Stripe payment for the program's `priceCents`, no Stripe product setup needed).
  - `soloPurchases/{uid}_{programId}`, written only by the server (firestore.rules create `if false`).
  - Content readable with a non-refunded purchase or paid-up All Access (rules).
  - `trainingPrograms`: a purchase wins over an All Access enrolment and is never locked.
  - Refunds: `charge.refunded` marks it refunded.
- **Server** (`functions/index.js`, `functions/soloSubscriptions.js`):
  - The checkout no longer refuses after Go live; it refuses only All Access members (`hasAllAccessNow` → `{ includedWithAllAccess }`).
  - `success_url` returns to the program's own page with `session_id`.
  - `recordProgramPurchase(db, session)` writes ownership only for a PAID payment-mode checkout, inside a transaction. **Bug fixed**: the old webhook merge-wrote `startDate: null` and a new `purchasedAt` on every delivery, so a repeated or late Stripe retry reset an already-started program's schedule. Now an existing purchase is left alone, and a refunded one is restored by a new payment.
  - The webhook and `checkout.session.async_payment_succeeded` both use it.
  - New `confirmSoloProgramPurchase({ checkoutSessionId })`: fetches the session from Stripe, requires it to be the caller's and paid, then records it, so the program unlocks at once instead of waiting for the webhook.
- **App**:
  - `SoloProgramDetailsScreen`: the price and Start Program → Pay for anyone without All Access, plus "Or get every program with All Access" in the Pay sheet after launch.
  - All Access: "Included", no price or Pay, start or resume as before. Bought: "Owned" → Go to My Training.
  - Back from Stripe: "Confirming your purchase" (solid, instant), then "It's yours." once the purchase reaches the account. Never unlocked by the page alone; 15 s cap → "Payment received… No need to pay again."; `?checkout=cancelled` → "Checkout cancelled. You haven't been charged."; the query is stripped.
  - Catalogue cards: the price, "Included" (All Access) or "Owned"; the website banner reads "Buy a program or subscribe here".
  - iPhone app: unchanged, no price and no Pay (3.1.1). After launch "Unlock with All Access" (Apple IAP); a program bought on the website shows at once.
- **Not done (blocked on setup)**: buying a single program inside the iPhone app. Apple requires In-App Purchase for it: a non-consumable product per program in App Store Connect + RevenueCat, then a new build.
- **Tests**:
  - `src/solo/programPurchase186.test.jsx` (15): Free and Plus buy (one checkout per tap); unchanged before launch; the server's included answer; All Access included with no Pay; after All Access ends, prices return and a bought one stays Owned; the paid return confirms with the server and unlocks only on the purchase; the page's word alone never unlocks; slow confirmation; abandoned checkout; a plain visit calls nothing; iPhone no price; Catalogue cards. 12 fail on the old code.
  - `functions/soloSubscriptions.test.js` (+8): `recordProgramPurchase` paid → new; a repeated / late webhook never resets the start date and makes no second purchase; refunded → restored; unpaid / subscription / unlabelled → nothing; `hasAllAccessNow`; wiring (sold after launch except to All Access; the return check fetches from Stripe and requires the caller's own paid checkout; the webhook uses the safe writer). 8 fail on the old code.
  - `subscriptionGates.test.jsx` / `journeyFixes157.test.jsx`: tests that reached the membership sheet via "Unlock with All Access" on the website now use Start Program → "Or get every program with All Access". Two rewritten to the new rule.
  - Full suite 1183 passed; build and lint clean.
- **Scope**: Train Solo only. No change to existing purchases, subscriptions, rules or accounts.

### 188. Apple Health: blood pressure, heart rate and more on Progress — Train Solo and the coached app (owner request, 2026-11-07)
- **Change**: Apple Health now also brings in, per day, heart rate (daily average), heart rate variability (SDNN), blood pressure (systolic and diastolic), blood oxygen, respiratory rate and VO2 max. They show on Progress for Train Solo members, coached clients, and the coach's view of a client, alongside steps, sleep and resting heart rate (unchanged).
- **How**:
  - **iPhone** (`ios/ApexCoach/HealthBridge.swift`, needs a new build):
    - Each new measure is read as a daily average (`averagedReads`); blood oxygen is turned into a percentage.
    - Someone who connected Apple Health before is asked once by iOS for just the new measures, the next time the app syncs (`getRequestStatusForAuthorization` → `requestAuthorization`).
    - Results are gathered under a lock (HealthKit answers on its own queues).
    - The permission text (`ios/project.yml` `NSHealthShareUsageDescription`) names the new measures.
  - **Sync** (`src/lib/appleHealth.js`):
    - The new fields go into the same per-day body-metrics doc (`bodyMetrics` / `soloBodyMetrics`), marked in its `appleHealth` map, by the same rule: a value typed in by hand is never overwritten.
    - Plausible-range checks: a glitch or unit mix-up is never saved (e.g. blood oxygen 50–100%, systolic 40–260 mmHg).
    - One decimal for respiratory rate and VO2 max; whole numbers otherwise.
  - **Progress** (`src/components/ProgressWidgets.jsx` `HEALTH_METRICS_CONFIG` / `withHealthData`, one list for all three screens):
    - A card per measure, shown only once there's at least one day of data, so no empty cards for anyone without Apple Health or a device that measures it.
    - The same card, chart, history and manual log as Steps etc.
    - Used by `ClientApp.jsx` `ProgressScreen`, `SoloProgressScreen.jsx` and `CoachClientDetail.jsx` `ProgressPanel`.
  - **Not changed**: Firestore rules (no field restriction on these docs); Train Solo's Apple Health stays a Plus feature; nothing is written to Apple Health.
- **Tests**:
  - `src/lib/appleHealthVitals188.test.js` (7): each measure saved and rounded; a hand-typed value kept and Apple's own value updated; impossible readings never saved; the existing sync unchanged; the Swift reads every measure as a daily average with blood oxygen as a %; the one-time permission ask for existing users; the permission text.
  - `src/solo/appleHealthVitalsProgress188.test.jsx` (2) and `src/client/appleHealthVitalsProgress188.test.jsx` (2), rendering the real Progress screens: every card with its latest value; no empty cards without data.
  - `coachDailyMetrics.test.jsx` +1, rendering the real coach panel with `db` grouped by client: the client's blood pressure and blood oxygen; nothing for measures without data or from another client.
  - 8 fail on the old code; the other 5 guard what must not change. Full suite 1195 passed; lint and build clean.
- **Swift**: `HealthBridge.swift` type-checked with Swift 6.0.3 against a HealthKit stand-in (0 errors / 0 warnings).
- **Browser**: the coach's client Progress panel (real `ProgressPanel`) opened in Chromium with sample data: all 10 daily cards drawn with their charts, no page errors.
- **Verify on TestFlight (new build)**: open the app, accept the one-time Apple Health prompt for the new measures, then Progress shows blood pressure / heart rate / etc. for days Apple Health has them. Blood pressure needs a source that records it (a cuff app or a manual entry in Health).
### 189. Apple Watch: log a coached workout from the Watch (owner request, 2026-11-07)

**Change**: clients can log the workout that's running on their iPhone from an
Apple Watch. A native watchOS app (`ios/ApexWatch/`, SwiftUI, watchOS 9+)
shows the workout's exercises and sets (with last time's numbers), sets reps
and kg with the Digital Crown, logs the set (haptic), starts the rest
countdown (Skip, haptic at the end) and can add a set. The workout stays on
the phone's web page: `src/lib/watchBridge.js` sends it to the iPhone app on
every change, and the Watch's actions come back as `apexWatch` events that
`WorkoutSession` applies exactly as a tap (same PR check, live session for
the coach, rest notification). `ios/ApexCoach/WatchBridge.swift` carries both
ways over WatchConnectivity (application context + messages / queued
transfers), keeps every Watch action until the page acks it (phone locked,
page asleep) and re-sends on the next workout post or app return; the page
drops repeats by id (`alreadyApplied`, kept on the phone). No session →
`clear`: the Watch says "Start your workout in the APEX app on your iPhone".
The Watch app is only built when Codemagic's `APEX_WATCH` is "true"
(`ios/project-watch.yml`), so 1.0.4 keeps building until its App ID and
profile exist (ROADMAP.txt step 2, item W).

**Tests**: `src/client/watchLogging189.test.jsx` renders the real
`WorkoutSession`: the workout is posted to the Watch; a Watch set logs with
the PR flag, the coach's live update and an ack, and shows in the phone's own
inputs; a repeated action applies once; rest starts/skips from the Watch with
a wall-clock end; a set without reps or for another exercise is ignored;
nothing breaks without the bridge; helper cases for `applyWatchSet`,
`buildWatchWorkout`, `alreadyApplied`. Without the change (ClientApp.jsx
stashed) the 4 WorkoutSession tests fail. The Swift side is compiled for the
first time by Codemagic (no Swift toolchain here) — see manual testing.

### 190. Coach console on iPhone, iPad and Mac (owner request, 2026-11-07)

**Problem** (checked in a browser at iPhone 13, iPad 820×1180, iPad landscape
1180×820 and a 1440×900 laptop): on iPad portrait the 256px sidebar left the
Clients table cut off mid-column (sideways scroll) and Messages cramped; the
table also overflowed iPad landscape; the shell, client page sidebar and
Messages used `100vh`, which on iPad/iPhone Safari runs under the browser's
bars (profile row / message box hidden); the mobile bars ignored the notch
and home-bar safe areas (installed web app); switching tabs kept the previous
tab's scroll position (Clients opened halfway down); tabs popped in.

**Fix**: `CoachShell` — an icon rail with labels on iPad widths (md–xl,
768–1279px), the full sidebar from xl (laptops); `coach-full-height`
(`100dvh`, `100vh` fallback) for the shell and Messages, `h-full` for the
client page's sidebar, `dvh` in the Programs / Train Solo editors; safe-area
padding on the bars and content (Messages' full-height offsets match);
every tab opens at its top; content centred at max 1440px on big screens;
a 160ms opacity-only fade per tab (no transform / fill-mode, so overlays
inside a tab stay full-screen); press feedback on nav. Clients shows its
cards below lg (iPad portrait) and the table from lg (min width 1000px, fits
iPad landscape with the rail).

**Tests**: `src/coach/coachShellDevices190.test.jsx` renders the real
`CoachShell` with real-shaped `db` (#167): tab change resets the scroll to the
top; rail/full sidebar classes and labelled rail buttons; dvh + safe-area
padding, no `h-screen`; the fade's keyframes have no transform and no
fill-mode. All 4 fail with CoachShell.jsx / index.css stashed. Browser check:
no page-level sideways overflow on any tab at all four sizes, and the
client page opened at each (screenshots in the session).

### 191. Train Solo: single programs bought in the iPhone app with Apple In-App Purchase (owner, 2026-11-07)
- **Change**: in the TestFlight app, single program prices were never shown (3.1.1: no website prices or buy buttons in the app). Single programs can now be bought in the app with Apple In-App Purchase, at Apple's own price, for any program that has an App Store product. Free and Plus members only; All Access members see programs included, as before.
- **How**:
  - **iPhone** (`PurchasesBridge.swift`, needs the new build):
    - `programPrices` asks Apple for `apex_solo_program_<programId>` products (`Purchases.getProducts`).
    - `buyProgram` buys one (`Purchases.purchase(product:)`) with the same cover and fresh-page hand-back as a membership (#135, #161, #183).
    - Outcome `{ kind: "program", programId }`; the native screen reads "Confirming your purchase".
  - **App**:
    - The program page shows Apple's price and "Buy · price" → sheet (plus "Or get every program with All Access" after launch) → "Opening the App Store" → Apple → reload → `SoloPaywallProvider` "Confirming your purchase".
    - The server is asked to re-read Apple (`refreshSoloEntitlement` → `syncApple`) until the purchase reaches `soloPurchases`, then the program's page says "It's yours."
    - Not there after the checks: "Purchase received… tap Restore purchases… No need to buy again." Apple error: the reason. Cancelled: nothing.
    - Catalogue cards in the app show Apple's price. No product → no price, exactly as before.
  - **Server** (`soloSubscriptions.js` `applePurchasesFromSubscriber` / `recordApplePrograms`, inside `syncApple`, which runs on every app open, Restore purchases and RevenueCat's webhook): RevenueCat's `non_subscriptions` for our product ids from the App Store become ordinary `soloPurchases` docs (`source: "apple"`). Content access works through the existing rules.
    - Safe to repeat: an existing purchase is never touched.
    - Only ever adds: a purchase missing from RevenueCat's answer is never revoked, so an alias or a partial answer can't take away a paid program. Apple refunds are marked by hand.
- **Owner setup (blocker for prices to appear)**, in App Store Connect → the app → In-App Purchases → "+" → **Non-Consumable**, one per program. Product ID exactly as below, price tier nearest the website price, a display name, a review screenshot. Then submit them with the next app version. RevenueCat needs nothing extra: products are fetched straight from the App Store, and purchases reach the server through the existing RevenueCat integration.
  - `apex_solo_program_68rrOjeTgbrZAy4hzLog` — The Hourglass Method (website A$69.99)
  - `apex_solo_program_h0iPfNWoriL3yBXJbuIK` — The Glute Project (A$49.99)
  - `apex_solo_program_paqentLL44NE2jvMyIDk` — Strength Foundation (A$74.99)
  - `apex_solo_program_sp_31afd7232d844186a181` — Home Bodyweight Foundation (A$57.78)
  - `apex_solo_program_sp_3b67f3764e204983bebf` — Strength & Powerbuilding (A$74.99)
  - `apex_solo_program_sp_e2cb3e32a0294b66b65e` — Push Pull Legs Upper Posterior (A$64.99)
  - Each future program needs its own product (`apex_solo_program_<its id>`).
- **Tests**:
  - `src/solo/inAppProgramPurchase191.test.jsx` (9):
    - Apple's price shown and the purchase goes through Apple's sheet with the outcome kept and the page reloaded.
    - No product → "Not available to buy in the app" as before; All Access never offered.
    - After the reload: Confirming → "It's yours." on the program's page once the server's record arrives; not there yet → "Purchase received" with Restore; Apple error → the reason; cancelled → nothing left.
    - The Catalogue shows Apple's price, never the website's; the Swift prices and buys with the same cover and hand-back.
  - `functions/soloSubscriptions.test.js` (+5): reads only our App Store program products; records once and keeps the start date on later syncs; leaves a website purchase alone and skips unknown programs; never revokes; `syncApple` runs it.
  - 11 fail on the old code. `afterPurchaseWhiteScreen.test.jsx` updated for the purchase / membership title (same assertion). Full suite 1209 passed twice; lint and build clean.
- **Swift**: type-checked against stand-ins, 0 errors / 0 warnings.
- **Verify on TestFlight** (after the products exist, sandbox): a program shows Apple's price, then Buy → Apple's sheet → "Confirming your purchase" → "It's yours." → Go to My Training. Restore purchases on another device brings it back.

### 192. iPhone app: white screen after "Confirming your purchase" (owner, 2026-11-08)

- **Problem**: on TestFlight (build 238) a purchase went to a white screen right after "Confirming your purchase"; the owner reports it has recurred across builds. Replaying the page side on the live site (a fresh page on the bought program with Apple's answer already on the phone, light and dark) showed Confirming → "It's yours." within a second, no errors — so the white came after the iPhone app's cover was off. The app takes its cover off as soon as the page draws "Confirming", then looked at the screen only at 1.2 / 3 / 6 s (#183). The page only moves on to "It's yours" / the welcome / "Purchase received" when the server confirms (up to ~10 s), and then to My Training; a page that stopped being drawn at any of those later moments was never looked at, so it stayed white.
- **Fix** (`ios/ApexCoach/ViewController.swift`): after the cover comes off the screen is looked at until 20 s (1.2, 3, 6, 10, 15, 20 s), and every screen change Train Solo reports in the minute after a purchase (apexTheme, posted on each route change) is looked at too (`lastUncoverAt`, `checkShownAfterPurchase`). White → the purchase screen back up, WebKit woken, the page shown again or a fresh one; twice at most, then Continue (`recoverIfBlankAfterPurchase`, unchanged rules from #183, each step in the Purchase log). Loading placeholders (`data-apex-loading`) are allowed to be plain and are skipped; the program page's "catalogue still loading" frame and the crash catcher's reload frame are now marked as loading.
- **Tests**: `src/solo/purchaseWhiteScreen192.test.jsx` (4): looked at until 20 s; screen changes in the minute after a purchase looked at; white → cover back, twice then Continue; loading placeholders skipped and the two plain frames marked. All 4 fail on the old code. `purchaseWhiteScreen183.test.jsx` and `nativeAppleSheets166.test.js` read the recovery from its new function (same assertions). Swift type-checked against stand-ins, 0 errors / 0 warnings.
- **Needs a new iOS build** (native change): select the new 1.0.4 build in App Store Connect in place of 238. **Verify on TestFlight**: buy a program and a membership; the screen never stays white (if a white frame appears, "One moment" comes up and the page returns within a few seconds).

### 193. Purchase log sent to the member's own profile (owner, 2026-11-08)

- **Problem**: the white screen after "Confirming your purchase" came back on build 239 (#192). Every fix since #153 was made without the phone's step-by-step log (Profile → Purchase log), which only the member could read.
- **Change**: in the iPhone app, Train Solo copies that log to the member's own profile (`soloUsers/{uid}.purchaseTrace`: lines + uploadedAt) on open, 30 s and 90 s later (a page that isn't drawn still runs) and when the app comes back to the front; only when it changed; failures ignored (`src/solo/purchaseTraceUpload.js`, called from `SoloPaywallProvider`). Only the member can read/write their profile (existing rule). Web only: reaches build 239 on its next open.
- **Tests**: `src/solo/purchaseTraceUpload193.test.js` (4): written to the profile; once per change; nothing with no log / user / app and never throws; wired into the provider. Full suite 1229 passed; build clean.

### 194. Train Solo: 3D muscle map you can turn and tap (owner request, 2026-11-08)

**Change**: the muscle map card on Progress (#148) now shows a real 3D anatomical
body (BodyParts3D © DBCLS, CC BY 4.0, via open-anatomy-3d; credit on the card)
drawn as a blue hologram (`src/solo/MuscleHologram.jsx`): swipe sideways to turn
it (vertical swipes still scroll the page), Front / Back turn it, tap a muscle to
see it (name, sets in the last 72 h, when, or Ready). Trained muscles glow
`TRAINED_RED` deeper with sets, ready ones `READY_BLUE`, as before. The model
(`public/models/muscle-map.glb`, 6.8 MB) carries a per-vertex body-scan region
(`_REGION`) made by splitting every anatomy mesh into its separate muscles and
mapping each (glutes stop at the hip crease, deltoids and lats separate, the
thigh's outer strip is quads); a tap counts only the surface tapped, never a
muscle seen through a gap more than 5 cm under the skin. three.js and the model
load only when the card mounts (own chunk, never on the launch path); the loop
draws only while the card is on screen. No WebGL / load failure → the 2D
MuscleBody, unchanged.

**Tests**: `src/solo/muscleHologram194.test.jsx` — every region maps to a tracked
muscle or none and every tracked muscle is tappable; the shipped model is glTF
with `_REGION` on every primitive and under 8 MB; without WebGL the card keeps
the 2D body. All fail without the change (no MuscleHologram / model). The six
#148 card tests still pass. Browser check (WebGL, built bundle): front and back
render, trained chest/shoulders/triceps red, tapping the chest shows "Chest ·
Trained · 4 sets · 20 h ago", Back turns the body.

### 195. Train Solo: 3D muscle map laid out exactly as the approved mock-up (owner, 2026-11-08)

**Change**: with WebGL the Progress muscle map is its own dark panel matching
the approved mock-up: "Muscle map" + hint, the two large figures, a Recovering
(white) / Ready (blue) legend, FRONT / BACK / SPIN pills over a large body with
floor rings and particles, and a glass card for the tapped muscle (name,
"Recovering · N h" or "Ready", sets in 7 days, last trained day, best est. max
kg, its exercises — `muscleDetail`, own logs only). In the 3D view recovering
muscles glow white (brighter with sets) instead of red; the 2D fallback is
unchanged. Opens on the most-trained muscle (else chest).

**Tests**: `muscleHologram194.test.jsx` adds `muscleDetail` (7-day sets with
helpers half, 0-rep sets ignored, last trained, best est. max from any age,
exercises, nothing → empty); fails without the change (no `muscleDetail`).
#148 / #194 tests still pass. Browser check (WebGL, built bundle): the panel
matches the mock-up, Chest card "Recovering · 18 h · 12 · Sat · 111".

### 196. Train Solo: interface upgrade in the approved mock-up style (owner, 2026-11-08)

**Change** (Train Solo only; layout and every button unchanged, styling only):
- Tab headers: APEX mark centred and lit (dark), titles in capitals.
- Tab bar: a floating glass bar, uppercase labels, the open tab bright with a
  glowing blue dot (`NAV_SPACE` 96 px + home bar).
- My Training: the day's session is a black-and-white gym-photo card with the
  name in capitals and a lit ring to start it (Done / Skipped / Locked as
  before); week strip rings the chosen day.
- Workout session: photo header (logo centred, exercise count, Cancel, the
  session in capitals); the rest timer is a lit blue ring at the bottom
  (Skip · time · +15s, same timer and callbacks — `SoloRestRing`, Solo only;
  the coached app's RestBar is untouched).
- Catalogue: the suggested program is a full-width card (12 px gutters) with
  a blue glow and YOUR MATCH, name in capitals, price as before.
- Calendar: each day's date as a large figure, today ringed in blue.
- Profile: ringed initials, name in capitals, Sessions logged / Kg lifted (own
  logs), and a Black / White switch (the existing theme toggle).
Black and white both covered (the existing Solo theme).

**Tests**: full suite passes (1233); header spacing (#176) and every Solo
screen test unchanged. Browser check of the session card and rest ring in
both themes (built bundle). Needs a look on a real iPhone (manual list).

### 197. Train Solo: tab bar floated above the bottom with the page showing under it (owner, 2026-11-08)

**Problem**: #196's floating tab bar sat 14 px above the bottom edge, so the
page scrolled visibly underneath it (owner's iPhone screenshot).
**Fix**: docked to the bottom edge, full width, the home-bar inset inside the
bar; same glass, uppercase labels and blue dot. Pages reserve exactly its
height (Shell and Calendar `NAV_SPACE` 64 px + inset).
**Tests**: `src/solo/tabBarDocked197.test.js` (fails on #196's floating bar).

### 198. Train Solo: 3D muscle map in light mode (owner, 2026-11-08)

**Problem**: the 3D map stayed a dark panel in Train Solo's light mode.
**Fix**: a light twin of the panel (pale blue-grey with a faint blue grid, ink
text, white glass pills and card) and of the body (`MuscleHologram light`):
drawn with normal blending (added light vanishes on white), ready muscles blue,
recovering ones ink (deeper with sets), the tapped one solid; the body rebuilds
when the theme changes. Dark mode unchanged.
**Tests**: `src/solo/muscleMapLight198.test.js` (fails without the change).
Browser check (WebGL, light theme): chest recovering in ink, everything else
blue, card and pills readable.

### 199. Train Solo: muscle map card too tall and narrower than the other boxes (owner, 2026-11-08)

**Fix**: the tapped-muscle card spans the panel (8 px in, as wide as the
page's other boxes), tighter padding, 18 px figures, one-line labels ("Est.
max kg" no longer wraps), exercises and the credit on one line each; the
panel's bottom padding drops to 8 px. About 40% shorter. Same data.
**Tests**: `src/solo/muscleCardCompact199.test.js` (fails on the old card).
Browser check (WebGL, dark): card flush with the page's other boxes.

### 200. Train Solo: page titles too big, gaps too wide (owner, 2026-11-08)

**Fix**: tab titles 22 → 19 px (just above the 18 px section headings), logo
21 → 18 px, header spacing tightened (top 20 → 12 px, logo → title 10 → 6 px,
title → first section 8 → 6 px; Catalogue's first section 8 → 4 px); the
muscle map's title is a section heading (18 px). Light mode: the logo blends
into the white page (no grey square).
**Tests**: `pageHeader174.test.js` updated to the new sizes and spacing
(fails on the old header).

### 201. Train Solo: suggested program's name too large on its card (owner, 2026-11-08)

**Fix**: the YOUR MATCH card's name is 17 px (was 24) and never more than two
lines (`line-clamp-2`; the full name is on the program page).
**Tests**: `src/solo/catalogueMatchName201.test.js` (fails on the old size).

### 202. Train Solo: muscle map recovery colours, map first on Progress, no Estimated Max (owner, 2026-11-08)

**Change**: the 3D muscle map colours by recovery — trained in the last 48 h
red, 48–72 h orange ("almost recovered"), recovered the normal blue (no more
white / black); legend and the muscle card say the same ("Trained · N h
ago" / "Almost recovered" / "Ready"), both themes. Progress now opens with
the muscle map, then Strength Personal Bests, then everything else. The
Estimated Max chart (#150) is removed (component, helper and its test).
**Tests**: `recoveryStage` in `muscleHologram194.test.jsx` (48 h / 72 h edges);
`src/solo/progressOrder202.test.js` (order + no chart). Both fail without the change.

### 203. Train Solo: no page headings; the day replaces the month above the week (owner, 2026-11-08)

**Change**: the tab titles (WELCOME, PROGRESS, CALENDAR, CATALOGUE, PROFILE)
are no longer shown — only the logo (titles stay for screen readers). On My
Training the selected day ("Today, 8th November") replaces "November 2026"
above the week strip, in that same font, and the big day heading under the
strip is gone.
**Tests**: `pageHeader174.test.js` updated (sr-only title; `dayHeading` in the
week strip; no day h2) — fails on the old layout.

### 204. Train Solo: muscle map card — exercises and credit lines removed (owner, 2026-11-08)

**Change**: the tapped-muscle card shows only the name, status and the three
figures (shorter box). The model's CC BY 4.0 credit (required wherever the
model is shown) moves to the foot of Profile.
**Tests**: `src/solo/muscleCard204.test.js` (no exercise/credit lines in the
card; credit present on Profile) — fails on the old card.

### 205. Train Solo: genitals showed on the muscle map's body (owner, 2026-11-08)

**Fix**: the 1,836 ghost-skin triangles in the groin box in front of the body
are removed from `public/models/muscle-map.glb` (muscles untouched). The
model-prep scripts are now in `scripts/muscle-map/` (`body-scan.mjs` bakes
`_REGION`, `cut-groin.mjs` removes this) — re-run both if the model changes.
**Tests**: #194's model test still passes (glTF, `_REGION` on every
primitive, under 8 MB). Browser check (WebGL, light theme): groin smooth.

### 206. Train Solo: muscle map — every muscle its real shape (owner, 2026-11-08)

**Problem**: the selected muscle looked ragged ("fuzzy") and the abs, obliques,
upper back and lats weren't their real muscles: the old model (open-anatomy-3d)
merged many muscles into one mesh, so groups were cut by position.
**Fix**: the model is rebuilt from Z-Anatomy (CC BY-SA 4.0, from BodyParts3D;
via @authorod/svitylo-3d-anatomy-data, standard quality), where every muscle
is a separate named structure (`_ID`): each vertex takes its own muscle's group
(rectus abdominis = Abs; external/internal oblique + serratus anterior =
Obliques, their front aponeurosis trimmed so the abs show; trapezius +
rhomboids + levator scapulae + rotator cuff + teres = Upper back; latissimus
dorsi = Lats; rectus femoris + vastus ×3 = Quads; …). Bursae, fasciae,
tendons, ligaments, perineal/genital structures dropped; the skin is Z-Anatomy's
body-region surfaces without genitals or hair. Meshopt-compressed (5.5 MB);
the app loads three's meshopt decoder. The fibre stripes are gone (clean
surfaces). Credit on Profile updated. Build: `scripts/muscle-map/build-model.mjs`.
**Tests**: #194 model test updated (meshopt, `_REGION` on every muscle mesh).
Browser check (WebGL): tapping the abs, obliques, upper back, lats and glutes
each lights exactly that muscle's outline (screenshots in the session).

### 207. Login area: first page + lit logo look, Back on Coaching's log-in (owner, 2026-11-08)

- **Change**: the owner asked for the login area to look like the Nike CG ADAPT reference. A new first page now comes before the Coaching / Train Solo chooser. It has a see-through glowing APEX mark, "Train solo. Train smarter." with a larger faded echo, page dots and a ring arrow. The arrow opens the chooser at `/start?step=choose`.
- **Chooser and log-in screens**: the chooser and both log-in screens use the lit mark (`LitLogo`, with a reflection on the chooser) and echo headings, from `src/components/LoginHero.jsx`.
- **Back button**: Coaching's `/login` gets a Back link to the chooser; it had none. The Back links on Train Solo's log-in and register screens now go to the chooser rather than the first page.
- **Unchanged**: every button, field and step works as before. The coach's login background (Design Settings) still shows when one is set.
- **Tests**: `src/solo/loginLook207.test.jsx` checks three things. The first page shows, and its arrow opens the chooser. Coaching's log-in has Back to the chooser and keeps its form. Train Solo's Back goes to the chooser. All 3 fail without the change.
- **Updated tests**: `appRouting.test.jsx` and `afterPurchaseWhiteScreen.test.jsx` now expect the first page at `/`.
- **Browser check**: the real screens were checked in Chromium. The arrow opens the chooser and Back on `/login` returns to it.

### 208. Login area: start chooser logo crisp and glowing, glass buttons (owner, 2026-11-08)

- **Problem**: on the chooser (`/start?step=choose`) the mirrored copy of the APEX mark under it was clipped (looked "blocked off" at the bottom); a faint rectangle showed around the mark (the bundled logo PNG had near-invisible pixels across its whole box); the mark was soft (a 384 px file drawn 200 pt wide at 3x) and faded; the Coaching button was solid white.
- **Change**: `LitLogo crisp` (no fade, white glow from two blurred copies), no reflection; `public/brand/app-logo-dark-mountain.png` redrawn at 1152 px with sharp edges and the faint pixels removed (also sharper on the log-in screens); `mark-white.png` faint pixels removed; both buttons frosted glass (`GLASS` / `GLASS_STRONG`, Coaching brighter).
- **Tests**: `src/solo/startChooser208.test.js` (3): crisp glowing mark, no reflection; both buttons glass, no solid white button; logo file ≥ 1152 px. All 3 fail on the old code. `loginLook207.test.jsx` unchanged and passing.

### 209. Login area: no halo, no faint square, no grey strip; crisp glowing mark everywhere (owner, 2026-11-08)

- **Problem**: after #208 the owner still saw a round glow behind the mark, a faint square around it, and a grey line at the foot of every log-in screen. The square: iOS drew the box of the CSS-blurred copies of the mark (and phones kept the old logo file); the circle: LitLogo's radial halo; the grey line: the uploaded login background (a black 900x900 image) has a light line along its bottom edge, stretched across the screen.
- **Fix**: the halo is gone; the glow is one baked image (`/brand/app-logo-mountain-glow.png`, same canvas as the mark) for LitLogo and the first page's GlowLogo, with no CSS blur; the mark file is renamed `app-logo-dark-mountain-v2.png` so phones fetch the clean one; Coaching and Train Solo log-in screens use `LitLogo crisp`; the login background is 103% tall, pinned to the top and clipped (`MEDIA_BOX`).
- **Tests**: `src/solo/loginClean209.test.js` (4), all failing on the old code; `appLogo.test.js` and `startChooser208.test.js` read the new file name.

### 210. Login area: APEX mark drawn as a sharp vector with a tight glow (owner, 2026-11-08)

- **Problem**: after #209 the mark looked soft: a 384 px picture stretched 3x on the phone, under a wide baked glow.
- **Change**: the mark is traced into a vector (`ApexMarkSvg`, two shapes, same 384 x 384 framing) with a tight SVG glow (blur 3.8 under the sharp shape) — mock-up B, chosen by the owner. Used on the first page (`GlowLogo`), the chooser and both log-in screens (`LitLogo crisp`); each mark has its own filter id.
- **Tests**: `src/solo/apexMark210.test.jsx` (3): two white shapes with the tight glow; chooser, log-in and first page draw the vector, no image; unique filter ids. They fail on the old code (no `ApexMarkSvg`). `startChooser208` / `loginClean209` read the vector instead of the glow image. Full suite 1252 passed; build clean.

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
- **Cold open speed on a real iPhone**: force-quit and reopen as a coach and as a client; it should go from the launch screen to the app with no white flash (coach) and no "0" stats jumping to real numbers. The first open after this deploy still takes the old path once (nothing saved on the phone yet).
- **Instant open on a real iPhone** (#121, 1.0.4): second open shows the app with no spinner; Aeroplane Mode open still works; after a web release the first open shows the old version and the next the new one; after a long time in the background (or many other apps opened) the app comes back, not blank.
- **Train Solo subscriptions — owner's checklist before launch** (#158/#159; needs the Stripe test key / a Sandbox Apple ID, not available to Claude):
  1. Website, Stripe test mode, test account: subscribe All Access yearly (trial) → check `soloEntitlements/{uid}` tier all_access, `allAccessUntil` = trial end; start a program; open a second checkout in another tab before paying the first → only the newest can be paid (#158); in the sheet switch to Plus → one subscription, prorated invoice, All Access programs lock, Plus features stay; cancel in the portal → Free at once; renew with card 4000 0000 0000 0341 (fails) → Free.
  2. Stripe → Settings → Billing → Customer portal: cancellation on; plan switching optional now that the sheet changes plans itself (#159).
  3. App Store Connect: all four `apex_solo_*` products in ONE subscription group, All Access ranked above Plus (level 1), so Plus → All Access in the app is an Apple upgrade, not a second subscription. RevenueCat: entitlements `plus` and `all_access`, All Access products attached to both.
  4. TestFlight 1.0.4, Sandbox Apple ID: buy Plus, upgrade to All Access (one subscription in Settings → Subscriptions), Restore purchases on a second device signed into the same Train Solo account, cancel in Settings → Free on return to the app; a website subscriber sees "Your plan can't be changed in the app".
  5. After the first functions deploy containing #159: Firebase console → Functions shows `soloFreeSessionLimit`; with the switch live, a Free test account writing a 4th session directly sees it removed.
- **Train Solo subscriptions end to end** (#120): on the website with a test account (Stripe live, 100%-off promotion code): subscribe yearly with the trial, upgrade Plus to All Access (one subscription, pro rata), start/switch/resume programs and check the calendar, cancel in the customer portal, and a card that fails on renewal drops to Free. On TestFlight 1.0.4 with a Sandbox Apple ID: Apple prices on the paywall, buy, trial, upgrade, Restore purchases on a second device, cancel, billing failure to Free; the Codemagic build itself is the first compile of PurchasesBridge.swift.
- **Apple Watch logging on a real Watch** (#189, after `APEX_WATCH` is on): the Codemagic build compiles the Watch app; on TestFlight the APEX Watch app installs with the iPhone app; start a workout on the phone → it shows on the Watch; log sets with the Crown (shown on the phone, PR trophy, the coach's live view); rest countdown + Skip; Add set; with the phone locked in a pocket, log two sets → they appear on the phone after unlocking (once each); finish on the phone → the Watch says no workout running.
- **Train Solo restyle on a real iPhone** (#196): the floating tab bar clears the home bar, every tab and button still works (start a session, rest Skip / +15s, Black / White in Profile), in both themes.
- **3D muscle map on a real iPhone** (#194): Progress loads the body within a few seconds on 4G, sideways swipe turns it while up/down scrolls the page, taps pick the right muscle, and the phone doesn't warm up with the card on screen.
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
