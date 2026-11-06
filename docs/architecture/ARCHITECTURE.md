# Jatimetri — Architecture

Jatimetri is a single-page web app for a self-reflection assessment. It has two
deployables:

| Part | Tech | Hosted on | Source |
|---|---|---|---|
| Frontend SPA | React 19, Vite 8, TypeScript, Tailwind 3, shadcn-style UI (Radix) | Cloudflare Pages (`jatimetri`) | `src/`, `public/`, `index.html` |
| API | Hono on Cloudflare Workers, D1 (SQLite), R2 | Cloudflare Workers (`jatimetri-api`) | `worker/`, `wrangler.toml` |

Authentication is handled by [Clerk](https://clerk.com) on both sides: the SPA
uses `@clerk/clerk-react`, the Worker verifies the session token with
`@clerk/backend`.

```
 Browser (SPA)                                   Cloudflare Worker (Hono)
 ┌──────────────────────────────┐   Bearer JWT   ┌──────────────────────────┐
 │ /assessment  ─ zustand store │ ─────────────▶ │ auth middleware (Clerk)  │
 │   (localStorage persisted)   │                │ POST   /api/save-attempt │──▶ D1: users, assessments
 │ /dashboard   ─ scoring, PDF  │                │ GET    /api/reports      │
 │ /profile     ─ history       │                │ DELETE /api/assessments/:id
 └──────────────────────────────┘                │ POST   /api/upload-pdf   │──▶ R2: <userId>/<assessmentId>.pdf
          │  Clerk JS (sign-in)                  │ DELETE /api/account      │──▶ Clerk Backend API
          ▼                                      └──────────────────────────┘
       Clerk
```

## Frontend

### Routes (`src/App.tsx`)

| Path | Component | Auth | Notes |
|---|---|---|---|
| `/` | `Home` (in `App.tsx`) | no | Landing page |
| `/assessment` | `features/assessment/Assessment` | no | Full-screen, outside `MainLayout` |
| `/dashboard` | `features/dashboard/Dashboard` | no (saving needs sign-in) | Result of the current or a historical attempt |
| `/profile` | `features/profile/Profile` | **yes** (`RedirectToSignIn`) | History, account deletion |
| `*` | `components/NotFound` | no | |

`src/main.tsx` wires `ThemeProvider` (next-themes, system theme), `I18nextProvider`
and `ClerkProvider`. If `VITE_CLERK_PUBLISHABLE_KEY` is missing the whole app
renders a configuration error instead.

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

## API (`worker/src/index.ts`)

- **CORS:** allowlist (production domain, Vite dev/preview ports) plus optional
  comma-separated `ALLOWED_ORIGINS`.
- **Auth:** every `/api/*` route requires `Authorization: Bearer <Clerk session token>`;
  failures return a generic `401`, details are only logged.
- **Errors:** `app.onError` logs and returns a generic `500`.

| Method & path | Purpose |
|---|---|
| `POST /api/save-attempt` | Upsert user row, insert an assessment, returns `assessmentId` |
| `GET /api/reports` | The user's assessments, newest first |
| `DELETE /api/assessments/:id` | Delete one owned assessment and its PDF |
| `POST /api/upload-pdf` | Store a PDF at `R2://<userId>/<assessmentId>.pdf` |
| `DELETE /api/account` | Delete all of the user's PDFs, assessments, user row, then the Clerk user (502 if only the Clerk step fails) |
| `PATCH /api/profile` | Placeholder, no-op |

### Data model (D1, `worker/src/db/schema.ts`, migrations in `worker/drizzle/`)

- `users(id TEXT PK — Clerk user id, email, created_at)`
- `assessments(id TEXT PK, user_id → users.id, stage, dominance_pattern,
  radar_data JSON, tendencies JSON, created_at)`

Raw answers are sent by the client but **not** stored.

## Configuration

| Variable | Where | Purpose |
|---|---|---|
| `VITE_CLERK_PUBLISHABLE_KEY` | `.env.local` / Pages build env | Clerk frontend key (required) |
| `VITE_API_URL` | `.env.local` / Pages build env | Worker base URL (defaults to `http://localhost:8787`) |
| `CLERK_PUBLISHABLE_KEY` | `wrangler.toml` `[vars]` | Clerk key for the Worker |
| `CLERK_SECRET_KEY` | `.dev.vars` / `wrangler secret put` | Clerk secret for the Worker |
| `ALLOWED_ORIGINS` | Worker vars (optional) | Extra CORS origins |
| `DB`, `REPORTS_BUCKET` | `wrangler.toml` bindings | D1 database, R2 bucket |

Security headers and a report-only CSP for the SPA live in `public/_headers`.

## Tooling

- **Package manager:** Bun (version in `.bun-version`), lockfiles `bun.lock` and
  `worker/bun.lock`.
- **Scripts:** `dev`, `build` (`tsc -b && vite build`), `lint`, `test`,
  `test:coverage`, `worker:dev`, `worker:deploy`, `worker:typecheck`.
- **Tests:** Vitest + Testing Library (jsdom), colocated `*.test.ts(x)` plus
  `tests/unit/`. Coverage thresholds in `vitest.config.ts`.
- **CI** (`.github/workflows/ci.yml`, on `main`): lint → tests with coverage →
  build → worker type-check. No automatic deploy.
- **Deploy:** `scripts/deploy-website.sh` (build + `wrangler pages deploy`) and
  `bun run worker:deploy`.
- **Dependencies:** Dependabot weekly (`.github/dependabot.yml`).
