# APEX Coaching Platform

## Visual design conventions

Target look: dark, restrained, technical, premium. Applies identically in
both of the app's existing modes — the client app's own light/dark toggle
(`ClientThemeContext`/`useClientDark`) and the coach console's single light
theme — by expressing it through the existing tokens in `src/theme.js`
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

## Working style

- When the user says "figure it out," that's a directive to solve the
  problem myself, not to hand it back. Come back with a finished result —
  not a list of obstacles, not a request for a decision that isn't
  actually required. If part of a task is genuinely blocked, solve
  everything that isn't blocked, then report the outcome, not the blocker.
