# Repository Guidelines

## Project Structure & Module Organization
- `frontend/` – React + TypeScript UI (Tailwind). Key dirs: `src/components/`, `src/pages/`, `src/utils/`.
- `backend/` – Express + TypeScript API. Key dirs: `src/routes/`, `src/services/`, `src/config/`.
- `shared/` – Cross‑package types.
- `tests/` – Playwright E2E tests; config in `playwright.config.ts`.
- `docs/` – Documentation; `.env.example` at repo root (copy to `backend/.env`).

## Build, Test, and Development Commands
- Install all deps: `npm run install:all`
- Run both servers (dev): `npm run dev`
- Build all: `npm run build`
- Frontend only: `cd frontend && npm start` | `npm run build`
- Backend only: `cd backend && npm run dev` | `npm run build` | `npm start`
- E2E tests (Playwright): `npm test` (auto-starts web servers per config)
- Backend unit tests (Jest): `cd backend && npm test`

## Coding Style & Naming Conventions
- TypeScript everywhere; prefer explicit types at module boundaries.
- Indentation: 2 spaces; max line ~100–120 chars.
- React components: PascalCase files (e.g., `StoryCard.tsx`). Hooks: `useX.ts`.
- Backend modules and routes: kebab- or lower-case (e.g., `stories.ts`, `health.ts`).
- Use ESLint from CRA defaults in `frontend`; keep code formatted (Prettier defaults are fine).

## Testing Guidelines
- E2E: Add scenarios in `tests/`; use stable selectors (e.g., `data-testid="choice-button"`).
- Backend: Add Jest tests alongside source or in `backend/__tests__/`.
- Include a basic test plan in PRs; run `npm test` locally before pushing.

## Commit & Pull Request Guidelines
- Use Conventional Commits: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`.
  - Example: `feat(backend): add GET /api/get-stories`
- PRs should include:
  - Clear description and rationale; link issues.
  - Screenshots/GIFs for UI changes.
  - Test plan and any new/updated tests.

## Security & Configuration Tips
- Do not commit secrets. Create a root `.env` with `DEEPSEEK_API_KEY` (and optional `DEEPSEEK_API_URL`).
- MongoDB uses Docker Compose defaults (`mongodb://mongo:27017/storyapp`); override via `MONGODB_URI`/`MONGODB_DB_NAME` only if needed.
- Avoid logging sensitive values; validate inputs on all API routes.
- Rate limiting is configurable via `RATE_LIMIT_*` env vars.

## Agent-Specific Instructions
- Keep changes minimal and scoped; follow this guide.
- Respect existing structure and scripts; avoid broad refactors in a single PR.

## Project Overview
- Children’s interactive bedtime story app with AI-generated, branching narratives.
- Stack: React + TypeScript + Tailwind + Framer Motion (frontend); Node.js + Express + TypeScript (backend); MongoDB (Docker Compose `mongo`); DeepSeek API; Playwright for E2E.

## Core APIs
- `POST /api/generate-story` – Generate story via DeepSeek.
- `POST /api/save-story` – Persist story to MongoDB.
- `GET /api/get-stories` – List stories.
- `GET /api/get-story/:id` – Story detail.
- `GET /api/health` – Health check.
- `GET /api/tts` – TTS placeholder.

## Environment Variables

Backend (root `.env`, used by Docker Compose):

```
# DeepSeek API
DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_API_URL=https://api.deepseek.com

# MongoDB (optional overrides)
# MONGODB_URI=mongodb://mongo:27017/storyapp
# MONGODB_DB_NAME=storyapp
```

Frontend (`frontend/.env`, optional for local dev):

```
REACT_APP_API_URL=http://localhost:5001/api
REACT_APP_VERSION=1.0.0
REACT_APP_DEBUG=true
```

## Database Schema (MongoDB)

Collection: `stories`
- `_id: ObjectId`
- `title: string`
- `content: string` (JSON string or text)
- `created_at: Date`
- `updated_at: Date`

Indexes initialized at startup:
- `created_at` (desc)
- `title` (text)

## Story Generation Flow
1. Client calls `POST /api/generate-story` with user inputs.
2. Backend service calls DeepSeek API to compose structured story JSON with branches.
3. Client can optionally call `POST /api/save-story` to persist result to `stories`.
4. Client fetches via `GET /api/get-stories` and `GET /api/get-story/:id` to render/play.

Notes:
- Validate and sanitize inputs; enforce rate limiting.
- Provide user-friendly Chinese error messages on failure paths.

## Deployment (Step-by-Step)

- Repos:
  - GitHub (primary): `https://github.com/haizhouyuan/storyapp.git`
  - Gitee (prod): `https://gitee.com/yuanhaizhou123/storyapp.git`

- Code flow:
  - Commit with Conventional Commits, push to both remotes.
  - Use `./scripts/push-to-all.sh` or push `origin` and `gitee` manually.

- Server prep (.env at repo root; do not commit):
  - `DEEPSEEK_API_KEY=...`
  - `DEEPSEEK_API_URL=https://api.deepseek.com`

- Build and run (manual commands; prefer this over batch scripts like `deploy.sh`):
  - `docker compose -f docker-compose.yml build --no-cache app`
  - `docker compose -f docker-compose.yml up -d mongo`
  - `docker compose -f docker-compose.yml up -d app`
  - Health: `curl http://localhost:5001/api/health`
  - Logs: `docker compose -f docker-compose.yml logs -f app`
  - Optional proxy: `docker compose -f docker-compose.yml --profile nginx up -d nginx`

- Ports:
  - App container `5000` → host `5001`. Use `http://localhost:5001` for checks and tests.

- E2E (production):
  - `ssh <prod-user>@<prod-host>` then run on the server:
    - `cd /path/to/storyapp`
    - `npx playwright install`
    - `npx playwright test -c playwright.prod.config.ts`
  - Do NOT run against local services to avoid confusing local smoke tests with production tests.

Note: Prefer these step-by-step commands over batch scripts like `deploy.sh`.

## Testing & Troubleshooting
- E2E: Playwright (`npm test`); install browsers via `npx playwright install`.
- Backend unit tests: `cd backend && npm test`.
- Common issues: see `docs/SETUP.md` (env vars, DB connection, DeepSeek failures, frontend build).

## UX & Quality Notes
- Child-friendly UI: large buttons, rounded corners, soft colors.
- Accessibility: keyboard navigation and screen readers.
- Responsive: mobile and desktop.
- Code style: TypeScript, single-responsibility components/functions, semantic commits.
