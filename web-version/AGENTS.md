# Repository Guidelines

## Project Structure & Module Organization
The workspace is split into three surfaces. `electron-app/` hosts the desktop client: Electron main logic in `src/main`, preload bridges in `src/preload`, React UI in `src/renderer`, and shared DTOs in `src/shared`. Browser tooling lives under `chrome_extension/src`, with Jest specs in `src/__tests__`. The backend sits in `server/`; TypeScript sources reside in `src`, history UI assets in `src/history-page`, build scripts in `src/build`, and compiled output in `dist`. Keep runtime artifacts in `downloads/` out of git and treat `newDesign/` as experimental unless explicitly targeting it.

## Build, Test, and Development Commands
Use `cd electron-app && npm install` to respect the Volta-pinned Node version, then `npm run dev` for live reload or `npm run build` for production bundles (`npm run dist:win` / `dist:mac` to package installers). In `chrome_extension/`, run `npm run watch` while iterating and `npm run build` to emit `dist/`. For the API server, `npm install`, `npm run dev` (ts-node with reload), `npm run build` (tsc plus asset copy), and `npm start` to launch `dist/index.js`.

## Coding Style & Naming Conventions
All code is TypeScript. Electron files use 4-space indentation, the extension uses 2 spaces, and the server sticks to 4. Components remain PascalCase, hooks use `use`-prefixed camelCase, IPC/WebSocket channels follow the `ipc:feature` / `ws:event` pattern, and filenames favour lowercase-hyphen. Run `cd electron-app && npx eslint .` and `cd chrome_extension && npm run style`; the server relies on `npm run build` as the type-and-style gate.

## Testing Guidelines
Before a PR, execute `cd electron-app && npm run test:coverage`, `cd chrome_extension && npm test`, and `cd server && npm run build`. Colocate new specs beside features (e.g., `__tests__/feature.test.ts`). For server-side additions, provide manual verification notes covering `/history` playback and REST endpoints, and stub filesystem or child-process calls when you add automated tests.

## Commit & Pull Request Guidelines
Write present-tense, imperative subjects (`download-manager: update cache`). Reference issues with `#id` where relevant, and mention new env vars or migrations in the body. PRs should list affected surfaces, include screenshots or logs for UI changes, enumerate commands run, and call out skipped tests with rationale. Request an Electron maintainer when touching packaging scripts or `resources/` binaries.

## Security & Configuration Tips
Never commit secrets; load them through `.env` and `src/config.ts`. After tweaking `resources/yt-*` or WebSocket ports, run `cd electron-app && npm run verify:deps` and align the extension configuration. Keep download paths inside the sandbox—update `isPathInside` if path rules change, and ensure CORS origins match between the extension and server.

## CAUTIONS
- use typescript, react.
- don't use any type