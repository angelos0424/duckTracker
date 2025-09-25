# Repository Guidelines

## Project Structure & Module Organization
The Electron app is written in TypeScript. The main process lives in `src/main` (window lifecycle, IPC wiring), `src/preload` exposes safe bridges, React UI under `src/renderer` with `components/`, `hooks/`, localized strings in `renderer/locales/`. Shared types and utilities go to `src/shared`. Packaged binaries and scripts land in `resources/`. Build artifacts write to `dist/`; do not edit generated files. Helper CLIs and sanity checks live in `scripts/` (e.g., `before-build.js`, `verify-dependencies.js`).

## Build, Test, and Development Commands
- `npm install` brings in Electron, React, and native module rebuilds (triggered by `postinstall`).
- `npm run dev` compiles main/renderer in watch mode, syncs `resources/yt-*`, and launches Electron for iterative work.
- `npm run build` runs clean TypeScript + webpack builds and syncs the CLI binaries.
- `npm run verify:deps` confirms bundled `yt-dlp` assets before packaging.
- `npm run clean` removes `dist/` and `release/` outputs; add `clean:cache` when devtools misbehave.

## Coding Style & Naming Conventions
Use TypeScript everywhere with 4-space indentation. React components remain PascalCase, hooks camelCase with a `use` prefix, and IPC channels prefixed (e.g., `ipc:downloads`) to avoid collisions. Keep shared contracts in `src/shared` and update both main and renderer before wiring IPC. Run `npx eslint .` (config via dependencies) before committing; fix imports and prefer explicit return types on exported functions.

## Testing Guidelines
Jest with `ts-jest` drives unit tests. Place files under `src/__tests__/…/*.test.ts`; use descriptive file mirrors such as `download-service.test.ts`. Initialize custom matchers in `src/__tests__/setup.ts`. Target coverage for non-renderer TypeScript via `npm run test:coverage`; renderer tests may live under `src/renderer` but are excluded from coverage by default, so document rationale in PRs.

## Commit & Pull Request Guidelines
Follow the existing history: concise, imperative commit subjects (`Fix IPC channel leak`), optionally localize but prefer English for cross-team clarity. Reference issues using `#id` when relevant. Each PR should include: summary of the change, test evidence (`npm run test`, manual QA notes, or screenshots for UI tweaks), impact on packaging (`resources/yt-*`, env vars), and rollback considerations. Request reviews from an Electron maintainer when touching main process or build scripts.

## Security & Packaging Notes
Never commit actual API keys—use `.env` and reference them via preload-safe APIs. Anytime binaries in `resources/` change, rerun `npm run verify:deps` and document the source. For distribution, prefer `npm run pack:<target>` flows so the electron-builder config stays authoritative.
