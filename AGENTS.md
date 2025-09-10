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
- Do not commit secrets. Copy `.env.example` → `backend/.env` and set `DEEPSEEK_API_KEY`, `SUPABASE_*`, `PORT`, `FRONTEND_URL`.
- Avoid logging sensitive values; validate inputs on all API routes.
- Rate limiting is configurable via `RATE_LIMIT_*` env vars.

## Agent-Specific Instructions
- Keep changes minimal and scoped; follow this guide.
- Respect existing structure and scripts; avoid broad refactors in a single PR.
