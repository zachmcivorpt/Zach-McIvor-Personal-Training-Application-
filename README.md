# M Personal Training

A mobile-first, black & white premium fitness platform built with React, Vite, and Tailwind CSS. Two apps in one codebase, gated by role-based auth:

- **Client app** — home dashboard, guided workout sessions with rest timers and PR detection sourced from the coach-assigned program, nutrition/macro tracking, progress charts, and an AI coach chat panel.
- **Coach console** — a separate admin area to manage clients, build multi-week training programs, and maintain the exercise library (including demo video uploads or hosted URLs).

Data is currently backed by a local (`localStorage`) mock store seeded with a demo coach and client, structured so a real backend/API can be swapped in later without touching the UI.

## Getting started

```bash
npm install
npm run dev
```

Demo logins (also fillable via the "Use demo credentials" link on the sign-in screen):

- **Coach** — username `coach`, password `coach123`
- **Client** — username `alex`, password `client123`

## How client accounts work

1. A coach invites a client from **Coach Console → Clients → Invite Client**, entering their name and email.
2. The app generates a username + one-time invite code, shown to the coach to relay however they normally message clients (no email backend is wired up in this prototype).
3. The client visits `/activate`, enters that username + code, and sets their own password — activating the account and signing them in.

## Scripts

- `npm run dev` — start the Vite dev server
- `npm run build` — production build
- `npm run preview` — preview the production build
- `npm run lint` — run Oxlint

## Stack

- React 19 + Vite + React Router
- Tailwind CSS 4
- [lucide-react](https://lucide.dev/) for icons
- [Recharts](https://recharts.org/) for progress charts

## Going to production

This prototype intentionally keeps everything client-side so the full coach ↔ client workflow can be demoed without infrastructure. To ship it for real, swap in:

- A real backend for auth (hashed passwords, sessions/JWT) and data (Postgres/etc.) behind the same `AppContext` action shape in `src/lib/AppContext.jsx`.
- Object storage (S3, Mux, Cloudinary...) for uploaded exercise videos — uploads currently preview via a local blob URL that only lasts the browser session.
- Email/SMS delivery for client invites instead of the coach manually relaying the generated code.
