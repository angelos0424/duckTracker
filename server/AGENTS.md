# Repository Guidelines

## Project Structure & Module Organization
`src/index.ts` boots the HTTP API, WebSocket hub, and download scheduler. Persistence lives in `src/database.ts`, orchestration in `src/download-manager.ts`, shared helpers in `src/utils`, and reusable types in `src/types`. History UI assets compile from `src/history-page` and `src/build` into `dist/history-page`; other bundles target `dist/`. Keep runtime artifacts in `downloads/` out of version control, and treat `newDesign/` as experimental UI unless your change targets it.

## Build, Test, and Development Commands
Run `npm install` to set up dependencies. `npm run dev` starts a ts-node development server with live reloads. `npm run build` runs `tsc` and executes the asset copy scripts under `src/build`. Launch production output with `npm start`, which executes `dist/index.js`; rebuild whenever TypeScript changes.

## Coding Style & Naming Conventions
TypeScript runs in strict NodeNext mode, so annotate exported surfaces explicitly. Indent with four spaces, keep modules under roughly 120 characters wide, and prefer lowercase hyphenated filenames. Use `PascalCase` for classes, `camelCase` for functions and constants, and reserve comments for invariants or cross-module flows. Run `npm run build` before committing because it doubles as the style and type gate in lieu of a linter.

## Testing Guidelines
No automated suite exists yet, so rely on `npm run build` plus manual checks of the `/history` UI and REST endpoints. When you add tests, colocate `.spec.ts` files next to the code or establish `src/__tests__/` if coverage expands. Stub `DownloadManager` filesystem and child-process calls to keep tests deterministic, and capture regression payloads as lightweight fixtures under `src/utils`.

## Commit & Pull Request Guidelines
Commits should be concise, present-tense summaries such as `download-manager: surface format state`; bundle related edits and avoid trailing punctuation. Record new environment variables or migrations in the commit body. Pull requests need context, linked issues, and screenshots or logs for UI changes, plus a checklist of commands run (`npm run dev`, `npm run build`).

## Configuration & Operations Tips
Configuration flows through `src/config.ts`, which reads environment variables (`DOWNLOAD_DIR`, `DB_PATH`, `YT_DLP_RUNNER`, etc.) and creates required directories. Document any new flag in the README and compose files, and keep Docker defaults functioning. If you alter path handling, update the `isPathInside` guard in `src/index.ts` so downloads stay within the configured sandbox.
