# Jatimetri — Architecture

Jatimetri is a single-page web app for a self-reflection assessment. It has two
deployables:

| Part | Tech | Hosted on | Source |
|---|---|---|---|
| Frontend SPA | React 19, Vite 8, TypeScript, Tailwind 3, shadcn-style UI (Radix) | Cloudflare Pages (`jatimetri`) | `src/`, `public/`, `index.html` |
| API + login receiver | Hono on Cloudflare Workers, D1 (SQLite), R2 | Worker `jatimetri-api`, routed on the same host: `/api/*`, `/masuk-bcb*` | `worker/`, `wrangler.toml` |

Authentication is the **BCB Academy unified login** ("login terpadu", repo
`belajarcarabelajar/bcb`): users log in only at `belajarcarabelajar.com`, which hands
a short-lived signed token to Jatimetri; the Worker then mints its own first-party
session cookie. The SPA never sees a token or key. (Clerk was used until 2026-11-06.)

```
 Browser                      jatimetri.belajarcarabelajar.com                 belajarcarabelajar.com (apex)
 ┌───────────────┐  /masuk-bcb/mulai   ┌───────────────────────────┐  303 /masuk/jatimetri?next&s   ┌──────────────┐
 │ SPA (Pages)   │ ──────────────────▶ │ Worker: state cookie      │ ─────────────────────────────▶ │ login (OTP / │
 │ useSession()  │                     │                           │ ◀───────────────────────────── │ Google), v1  │
 │  GET /api/me  │  cookie             │ /masuk-bcb?t&next&s:      │  303 /masuk-bcb?t=<token>&s    │ token issuer │
 │  /api/*       │ ──────────────────▶ │  state, HMAC, aud, age,   │                                └──────────────┘
 └───────────────┘                     │  burn nonce → session     │──▶ D1: users, assessments, sessions, sso_nonce
                                       │ /api/* (session cookie)   │──▶ R2: <email>/<assessmentId>.pdf
                                       └───────────────────────────┘
```

## Frontend

### Routes (`src/App.tsx`)

| Path | Component | Auth | Notes |
|---|---|---|---|
| `/` | `Home` (in `App.tsx`) | no | Landing page |
| `/assessment` | `features/assessment/Assessment` | no | Full-screen, outside `MainLayout` |
| `/dashboard` | `features/dashboard/Dashboard` | no (saving needs sign-in) | Result of the current or a historical attempt |
| `/profile` | `features/profile/Profile` | **yes** (`RequireSession`) | History, delete Jatimetri data |
| `*` | `components/NotFound` | no | |

`src/main.tsx` wires `ThemeProvider` (next-themes, system theme), `I18nextProvider`
and `SessionProvider` (`src/lib/auth`: `useSession()` reads `GET /api/me`; `signIn()` is a
full-page navigation to `/masuk-bcb/mulai?next=…`; `signOut()` posts `/api/logout`).
API calls go through `src/lib/api.ts` (same origin by default, `credentials: "include"`).
No environment variables are required.

### Assessment flow

- **Question bank:** `src/data/questions/v1-bank.ts` — one linear list of slides
  (`Q-ID-*` identity questions, transitions, `tap-card`, `scale-1-5`, `ranking`,
  `yes-no`, `dropdown`, `text`). Prompts can vary by stage (`prompts.child/teen/adult`)
  and `Q-ID-03` options depend on the stage chosen in `Q-ID-02`.
- **Rendering:** `AssessmentFlow.tsx` shows one slide at a time. Desktop uses
  prev/next buttons; mobile is a vertical carousel (swipe or the "Kembali" button),
  with non-current slides `inert`. `QuestionCard.tsx` renders each input type.
- **State:** `src/store/useAssessmentStore.ts` (zustand + `persist`, key
  `jatimetri-v1-storage` in localStorage) keeps `stage`, `userName`, `answers`
  and `currentSlideIndex`, so a user can resume after a reload.

### Scoring (`src/data/scoring/scoring-matrix.ts`)

`evaluateAnswers(answers, stage)` is a pure function:

1. Skips identity answers (`Q-ID-*`).
2. `scale-1-5` answers ≥ 4 on specific question IDs add 1 point to a tendency.
3. Every string / array answer that exactly matches a keyword in `keywordMap`
   adds 1 point to that tendency.
4. The highest score is the dominant pattern (`"Balanced Individual"` if all are 0);
   up to three tendencies with ≥ 2 points are reported with quality
   Low (< 3) / Medium (3–4) / High (≥ 5).
5. Radar data uses a fixed axis order, `min(100, score × 15 + 20)`.

Six tendencies: Exploration-Oriented, Structured Executor, Human-Centered
Contributor, Creative Maker, Analytical Problem Solver, Adaptive Growth Seeker.
The stage is currently not used in scoring.

### Reports

- `features/dashboard/Dashboard.tsx` renders the result (radar chart via
  Recharts, `SpectrumSlider` per tendency) and a hidden `ReportPDF` layout.
- `features/pdf/generatePDF.ts` rasterises that layout with html2canvas and builds
  the PDF with jsPDF (loaded on demand when the user downloads).
- Signed-in users can save the result (`/api/save-attempt`); downloading a fresh
  result also saves it and uploads the PDF to R2. Historical reports opened from
  `/profile` are passed through `sessionStorage` (`view-historical-report`) and are
  never re-saved.

### i18n

`src/lib/i18n.ts` (i18next). Indonesian (`id`) is the default and fallback;
English is opt-in through `components/layout/LanguageSwitcher.tsx`, and the choice
is stored in localStorage (`i18nextLng`). Only UI chrome is translated
(`src/locales/{id,en}/translation.json`); questions, tendency descriptions and the
PDF are Indonesian.

## API (`worker/src/app.ts`, entry `worker/src/index.ts`)

- **Login receiver** (`worker/src/auth/`): `bcb-sso.ts` is a dependency-free copy of the
  bcb token v1 contract (`HMAC-SHA256(secret, "bcb-sso|v1|jatimetri|email|exp|nonce")`,
  120 s lifetime, ±30 s skew), verified against bcb's shared fixture
  `sso-v1.fixture.json`. `session.ts` stores only the SHA-256 of the 32-byte cookie token
  (`__Host-jatimetri_sesi`, HttpOnly, Secure, SameSite=Lax, 30 days).
- **Auth:** every `/api/*` route except `/api/logout` requires a live session; otherwise `401`.
- **CSRF:** SameSite=Lax plus an Origin allowlist for non-GET requests (production domain,
  Vite dev/preview ports, optional `ALLOWED_ORIGINS`); `/api/logout` requires an Origin.
- **Errors:** `app.onError` logs only the error name and returns a generic `500`.

| Method & path | Purpose |
|---|---|
| `GET /masuk-bcb/mulai?next` | Existing session → `next`; else state cookie + 303 to `belajarcarabelajar.com/masuk/jatimetri` |
| `GET /masuk-bcb?t&next&s` | Verify state, token, audience, age; burn nonce; create user + session; 303 to safe `next` (400 on any failure, 503 without secret) |
| `GET /api/me` | `{ email }` |
| `POST /api/logout` | Delete session, clear cookie (204) |
| `POST /api/save-attempt` | Upsert user row, insert an assessment, returns `assessmentId` |
| `GET /api/reports` | The user's assessments, newest first |
| `DELETE /api/assessments/:id` | Delete one owned assessment and its PDF |
| `POST /api/upload-pdf` | Store a PDF for an owned assessment at `R2://<email>/<assessmentId>.pdf` |
| `DELETE /api/account` | Delete all Jatimetri data (PDFs, assessments, user row, sessions) and sign out; the BCB account is untouched |

### Data model (D1, `worker/src/db/schema.ts`, migrations in `worker/drizzle/`)

- `users(id TEXT PK — normalised BCB email, email, created_at)`
- `assessments(id TEXT PK, user_id → users.id, stage, dominance_pattern,
  radar_data JSON, tendencies JSON, created_at)`
- `sessions(id_hash PK, email, created_at, expires_at)`, `sso_nonce(nonce PK, expires_at)`
  (`0001_bcb_sso.sql`, idempotent, applied with `wrangler d1 execute`)

Raw answers are sent by the client but **not** stored. Rows created under Clerk user ids
before 2026-11-06 are left in place but no longer reachable.

## Configuration

| Variable | Where | Purpose |
|---|---|---|
| `VITE_API_URL` | `.env.local` / Pages build env (optional) | API base URL; default same origin |
| `BCB_SSO_RAHASIA` | `.dev.vars` / `wrangler secret put` | Hand-off secret, same value as `SSO_RAHASIA_JATIMETRI` on the BCB apex |
| `ALLOWED_ORIGINS` | Worker vars (optional) | Extra CORS origins |
| `DB`, `REPORTS_BUCKET` | `wrangler.toml` bindings | D1 database, R2 bucket |

Security headers and a report-only CSP for the SPA live in `public/_headers`.

## Tooling

- **Package manager:** Bun (version in `.bun-version`), lockfiles `bun.lock` and
  `worker/bun.lock`.
- **Scripts:** `dev`, `build` (`tsc -b && vite build`), `lint`, `test`,
  `test:coverage`, `worker:dev`, `worker:deploy`, `worker:typecheck`, `worker:test`.
- **Tests:** Vitest + Testing Library (jsdom), colocated `*.test.ts(x)` plus
  `tests/unit/`. Coverage thresholds in `vitest.config.ts`.
- **CI** (`.github/workflows/ci.yml`, on `main`): lint → tests with coverage →
  build → worker type-check → worker tests. No automatic deploy.
- **Deploy:** `scripts/deploy-website.sh` (build + `wrangler pages deploy`) and
  `bun run worker:deploy`.
- **Dependencies:** Dependabot weekly (`.github/dependabot.yml`).
