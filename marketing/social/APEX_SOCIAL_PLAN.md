# APEX Social — Launch Plan (Nov 2026 – Jan 2027)

Owner: APEX. Product focus: **Train Solo**. Launch: **January 2027**.
Source of truth for every product claim: the live app. If a feature isn't in
the app on the day of posting, it doesn't go in a post.

---

## 0. Rules for every post

**Voice.** Short, confident, technical. Sentences, not slogans. Speak to people
who already train. No "grind", "beast mode", "no excuses", hustle quotes or
emoji chains. One emoji max per caption, usually none.

**Look.**
- Black and white. One accent only: APEX blue (`#` MEASURE_BLUE in the app), used
  for a single "now" detail — a ring, a dot, an underline. Never a fill.
- Type: Inter (the app's font). Headlines semibold, ALL CAPS, tight tracking;
  body sentence case. Two type sizes per slide, never three.
- Lots of empty space. Big figures as design elements (real ones only).
- Photography: the APEX black-and-white gym set (`public/brand/gym-dark.jpg`,
  `workout-1..4.jpg`, `home-workout.jpg`, `focus-mountain.jpg`) plus new
  shoots. No stock models, no smiling-at-camera.
- Screens: real screenshots / screen recordings from the iPhone app only, shown
  flat or in a plain black iPhone frame. No mock-up UI, no edited numbers.
- Format: 1080×1350 (4:5). Keep text inside the centre 1080×1440-safe 3:4 crop
  the profile grid shows.

**Product-claim guardrails.**
- Use a real account with real training data for screen captures (owner's or a
  consenting tester's). Never fabricate logs, PRs or testimonials.
- No prices in launch-phase posts. When prices are used (Jan), they must match
  `PLANS` in `src/solo/soloAccess.js` and Apple's store price.
- Apple Watch logging is in 1.0.5 (not yet shipped). Don't show it until it's
  live in the App Store.
- There are no exercise demo videos in Train Solo. "Library" = Your Sessions,
  the session builder's exercise list, and the program Catalogue.

**Free vs paid (state correctly when it comes up).**
- Free: log workouts, 3 saved sessions, calendar, progress basics, Team Week.
- Plus: unlimited sessions, program builder, suggested weights, full stats,
  Apple Health on Progress.
- All Access: everything in Plus + the full program Catalogue.

---

## 1. Screen capture list (do this first — one afternoon)

Record on iPhone (Settings → Control Centre → Screen Recording), light AND dark
mode, account with 6+ weeks of logs.

| # | Capture | Where in Train Solo | Used in |
|---|---------|--------------------|---------|
| C1 | Opening the app → My Training (logo, week strip, today's session card) | My Training | P2, R1 |
| C2 | Logging 3 sets + rest ring counting down | Start session | P3, R2 |
| C3 | Workout summary (peak line, "Next time" targets) | Complete a session | P3, R4 |
| C4 | Progress: main goal card → 3D muscle map (spin, tap a muscle) | Progress | P4, R3 |
| C5 | Strength Personal Bests + Week Streak | Progress | P4, W4 |
| C6 | Session history scroll | Progress (bottom) | P6 |
| C7 | Calendar: hold-and-drag a session to another day | Calendar | P8, R5 |
| C8 | Catalogue → program page | Catalogue | P6, W3 |
| C9 | Session builder: name, add exercises, save | Your Sessions → new | P6, R6 |
| C10 | Questionnaire → one suggested program | Signed-out start | R7 |
| C11 | Team Week card with a partner | My Training | W4 |
| C12 | Program complete share card / Sunday review | Recaps | Jan |

Photography shot list (one session, black and white, natural gym light):
hands on a loaded bar, chalk, phone resting on a bench mid-set, plates close-up,
an empty rack in low light, one wide of an empty gym floor.

---

## 2. The first nine posts (the grid)

Posted oldest → newest, so on the profile **Post 9 sits top-left, Post 1
bottom-right**. Pattern alternates so no two neighbours share a format:

```
 9 TYPE      8 SCREEN    7 PHOTO
 6 SCREEN    5 TYPE      4 SCREEN
 3 PHOTO     2 SCREEN    1 TYPE+MARK
```

Each column reads top-to-bottom as a mix; the centre column is the "brand
spine" (screen / type / screen).

---

### Post 1 — Introducing APEX
**Format:** single image. **Visual:** black field, the white APEX mark centred
(`mark-white.png`), small caps line underneath. Nothing else.
**On-screen text:** `APEX` / `FITNESS TECHNOLOGY. BUILT BY A COACH.`
**Caption:**
> APEX started as the software I built to coach my own clients — programs,
> logging, progress, all in one place.
>
> Now we're opening it up. A training app for people who take training
> seriously and want the tools to match.
>
> More soon.
**CTA:** Follow to see it before launch.

---

### Post 2 — Introducing Train Solo
**Format:** carousel, 4 slides. **Visual:** slide 1 is a real My Training
screenshot (C1) in a black iPhone frame on black; slides 2–4 one screen each
(logging, Progress, Calendar) with one line of type above.
**On-screen text:**
1. `TRAIN SOLO` / `Your training, run properly.`
2. `LOG EVERY SET.`
3. `SEE WHAT'S WORKING.`
4. `PLAN YOUR WEEK.`
**Caption:**
> Train Solo is the self-guided side of APEX.
>
> Log your sessions, follow a structured program, plan your week, and see
> your progress from your own numbers — not guesses.
>
> Launching January 2027 on the App Store.
**CTA:** Save this post. Turn on notifications for launch day.

---

### Post 3 — Train with purpose
**Format:** carousel, 3 slides. **Visual:** slide 1 B&W photo (loaded bar,
hands). Slide 2 the workout summary (C3) showing "Next time". Slide 3 text.
**On-screen text:**
1. `TRAIN WITH PURPOSE.`
2. `Every session ends with your next target.`
3. `+2.5 KG OR +1 REP.` / `Small. Specific. Repeatable.`
**Caption:**
> Most sessions fail before they start: no target, so you lift whatever feels
> okay on the day.
>
> In Train Solo, finishing a workout tells you what to beat next time — a bit
> more weight at the top of your rep range, or one more rep. That's progressive
> overload without a spreadsheet.
**CTA:** What's the one lift you want to move by March? Comment below.

---

### Post 4 — Track your progress
**Format:** Reel-cover-style single video post (8–10 s) or carousel.
**Visual:** C4 — the 3D muscle map spinning, then a tap on a muscle. Muted
black background, no music bed louder than the UI sounds.
**On-screen text:** `TRACK YOUR PROGRESS.` / `Red: trained. Blue: recovered.`
**Caption:**
> Your Progress tab is built from your own logs.
>
> The muscle map shows what you've trained in the last 72 hours — red within
> 48 hours, orange to 72, blue when it's recovered. Personal bests and your
> week streak sit underneath.
>
> No estimates. Just what you've done.
**CTA:** Follow — we're showing every screen before launch.

---

### Post 5 — APEX philosophy
**Format:** single type-only image. **Visual:** off-white (#F5F5F2) background,
near-black type, one thin blue underline under "own".
**On-screen text:**
`TRAINING SHOULDN'T`
`DEPEND ON MOTIVATION.`
`IT SHOULD DEPEND ON A PLAN`
`YOU OWN.`
**Caption:**
> Three things we built APEX around:
>
> 1. Structure over motivation. A plan you can open on a bad day.
> 2. Your data, honestly shown. Every number comes from your own logs.
> 3. Less noise. No feed, no ads, no streak guilt.
**CTA:** Share with the person you train with.

---

### Post 6 — Your training library
**Format:** carousel, 4 slides. **Visual:** C9 session builder, C8 Catalogue,
C6 session history.
**On-screen text:**
1. `YOUR TRAINING LIBRARY.`
2. `Build your own sessions.`
3. `Or follow a structured program.`
4. `Every session you've done, kept.`
**Caption:**
> Your sessions, your programs and your history in one place.
>
> Build a session from the exercise list in under a minute, or pick a
> structured program from the Catalogue. Everything you log stays in your
> history — nothing to export, nothing lost.
**CTA:** Save for launch.

---

### Post 7 — Performance education
**Format:** carousel, 6 slides, type over B&W photo on slide 1, plain black
slides after. **Topic:** Progressive overload, properly.
**On-screen text:**
1. `PROGRESSIVE OVERLOAD` / `is not "add weight every week".`
2. `It's doing slightly more than last time — over time.`
3. `1. More reps at the same weight.`
4. `2. Same reps, a little more weight.`
5. `3. Better sets: cleaner reps, full range, same load.`
6. `Write it down. You can't beat a number you don't know.`
**Caption:**
> The simplest version that works: pick a rep range (say 8–10). When you hit
> the top of it on every set, add the smallest jump the gym has. Then build
> back up.
>
> That's double progression — the method behind Train Solo's "Next time"
> targets.
**CTA:** Save this. Send it to someone stuck on the same weight.

---

### Post 8 — Own your training schedule
**Format:** Reel (10–12 s) posted to feed. **Visual:** C7 — hold a session,
drag it to tomorrow, release. One clean take.
**On-screen text:** `MISSED MONDAY?` → `MOVE IT.` → `YOUR WEEK, YOUR CALL.`
**Caption:**
> Life moves sessions. Your program shouldn't fall apart because of it.
>
> In Train Solo's Calendar, hold a session and drag it to another day. Your
> plan keeps its order and your history stays intact.
**CTA:** Follow for launch.

---

### Post 9 — Coming January 2027
**Format:** single image. **Visual:** full-bleed B&W gym photo (empty rack,
low light), one frosted-glass pane centred with the APEX mark (matches the
app's glass style), type below.
**On-screen text:** `TRAIN SOLO` / `JANUARY 2027` / `APP STORE`
**Caption:**
> Train Solo launches on the App Store in January 2027.
>
> Structured programs. Honest progress. A training plan that fits your week.
>
> Link in bio to be first in.
**CTA:** Link in bio — join the launch list. (Bio link: website sign-up page
or App Store page.)

---

## 3. First four weeks

Week 1 starts **Mon 30 Nov 2026**. Feed: Mon / Wed / Fri, 6:30 pm AEDT.
Reels: Tue / Sat, 7 am AEDT (cross-post to TikTok same day, native text).
Stories: 4–5 days a week.

### Week 1 (30 Nov – 6 Dec) — "Who we are"
| Day | Type | Content |
|-----|------|---------|
| Mon | Feed | **Post 1** — Introducing APEX |
| Tue | Reel/TikTok | **R1 "Opening the app"** — C1, 7 s: lock screen → APEX → My Training. Text: `This is Train Solo.` Hook in frame 1. |
| Wed | Feed | **Post 2** — Introducing Train Solo |
| Thu | Story | Poll: "Do you follow a program right now?" Yes / Making it up |
| Fri | Feed | **Post 3** — Train with purpose |
| Sat | Reel/TikTok | **R2 "One set, logged"** — C2: enter reps + kg, tick, rest ring starts. Text: `Log a set in 3 taps.` |
| Sun | Story | Question box: "What app do you track training in now?" |

### Week 2 (7 – 13 Dec) — "What it does"
| Day | Type | Content |
|-----|------|---------|
| Mon | Feed | **Post 4** — Track your progress |
| Tue | Reel/TikTok | **R3 "Muscle map"** — C4 spin + tap, text: `What did I train this week?` (strongest visual — expect best reach). |
| Wed | Feed | **Post 5** — Philosophy |
| Thu | Story | Behind the build: screenshot of a design mock-up vs the shipped screen. "Mock-up → shipped." |
| Fri | Feed | **Post 6** — Training library |
| Sat | Reel/TikTok | **R4 "Next time"** — finish a workout, summary shows the target. Text: `Your app should tell you what to lift next time.` |
| Sun | Story | Quiz: "Your bench is 80 kg × 8, 8, 7 at a 8–10 range. Next session?" (answer: stay at 80, chase 8, 8, 8) |

### Week 3 (14 – 20 Dec) — "How to train"
| Day | Type | Content |
|-----|------|---------|
| Mon | Feed | **Post 7** — Progressive overload education |
| Tue | Reel/TikTok | **R5 "Move the session"** — C7 drag. Text: `Missed Monday. Not a problem.` |
| Wed | Feed | **Post 8** — Own your schedule |
| Thu | Story | Poll: "Christmas week: train / rest / both". Follow-up story with a 3-session holiday week idea. |
| Fri | Feed | **Post 9** — Coming January 2027 (grid complete) |
| Sat | Reel/TikTok | **R6 "Build a session in 45 s"** — C9 real time, timer on screen. |
| Sun | Story | Countdown sticker to launch day (set once date is confirmed). |

### Week 4 (21 – 27 Dec) — "Consistency over Christmas"
Lighter week; content that's useful when people are off routine.
| Day | Type | Content |
|-----|------|---------|
| Mon | Feed | **P10 "Consistency is weekly, not daily"** — type slide + Week Streak screenshot (C5). Caption: Train Solo counts weeks you hit your target, not days — a missed Tuesday doesn't reset anything. CTA: "What's your weekly target?" |
| Tue | Reel/TikTok | **R7 "Answer 5 questions, get one program"** — C10 questionnaire → one suggestion. Text: `One program. Not twenty.` |
| Wed | Story-only day | Merry Christmas — one B&W photo, APEX mark, no sales. |
| Thu | Feed | **P11 "Train with someone"** — Team Week (C11): up to 4 partners, both hit your weekly target = a Team Week. Partners see training days and sessions, never your weights or body stats. CTA: tag your training partner. |
| Fri | Story | "Rate your 2026 training out of 10" slider. |
| Sat | Reel/TikTok | **R8 education** — "3 signs you've stopped progressing" (same weight 4+ weeks, no logged numbers, sessions skipped mid-week). Talking-head or text over gym B-roll. Ends with a Progress screen. |
| Sun | Feed | **P12 "2027 starts with a plan"** — carousel: pick a program → set your training days → log session one. Leads straight into January launch posts. |

---

## 4. TikTok notes
- Same Reels, re-exported without the Instagram watermark, text re-added
  natively in TikTok (TikTok suppresses watermarked uploads).
- Hook in the first second, on screen and spoken: "This is how I know what to
  lift next week."
- Talking-head versions of the education pieces work better on TikTok than
  slides — record Post 7 as a 30-second piece to camera.

---

## 5. January launch (outline, detailed plan to follow in Week 3)
- **Launch week**: launch film (30 s: gym B&W → app open → log → progress →
  "Train Solo. On the App Store."), a "how to start in 3 minutes" carousel,
  pinned post with the App Store link, daily stories with the link sticker.
- **Weeks 2–4**: one program spotlight a week (real program from the
  Catalogue), first genuine user stories (with written permission), program
  complete share cards members choose to post.
- **Prices** only from Jan, and only matching the store.

---

## 6. Measuring and adjusting (every Monday)
Track per post: reach, saves, shares, profile visits, link taps, follows.
- **Saves + shares** are the signal for education and product posts — aim for
  saves ≥ 3% of reach.
- **Profile visits → link taps** is the signal for launch intent.
- Reels: 3-second hold rate and average watch time; if hold < 60%, change the
  first frame, not the whole concept.
- After Week 2: double down on the best of the three formats (screen demo /
  education / type statement) and cut the weakest to once a week.
- Keep a simple log: date, post, format, reach, saves, shares, follows, notes.

## 7. Bio and highlights
- **Bio:** `APEX · Fitness technology` / `Train Solo — structured training, honest progress.` / `Launching Jan 2027 ↓`
- **Highlights** (black covers, white line icons): Train Solo · How it works ·
  Programs · Education · Launch.
