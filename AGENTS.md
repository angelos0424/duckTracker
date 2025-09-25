# Repository Guidelines

## Project Structure & Module Organization
`electron-app/` hosts the desktop client: main process in `src/main`, preload bridges in `src/preload`, React UI under `src/renderer`, shared contracts in `src/shared`, binaries in `resources/`, and builds in `dist/`. `chrome_extension/` keeps browser code in `src` with Jest specs in `src/__tests__`. `server/` currently tracks transpiled output in `dist`; if you regenerate it, include the matching TypeScript source or document the generator in your PR.

## Build, Test, and Development Commands
- `cd electron-app && npm install` respects the Volta-pinned Node 22.18.0; `npm run dev` watches main and renderer while syncing `resources/yt-*`.
- `cd electron-app && npm run build` creates clean production bundles; append `npm run dist:win` or `dist:mac` when packaging installers.
- `cd chrome_extension && npm run watch` recompiles on change; `npm run build` emits the release bundle in `dist/`.
- `node server/dist/server.js` starts the Express API; feed configuration through `.env` (e.g. `PORT=3000`).

## Coding Style & Naming Conventions
Use TypeScript throughout. Electron files follow 4-space indentation; the extension sticks to 2 spaces. Components stay PascalCase, hooks camelCase with a `use` prefix, and IPC/WebSocket channels use colon prefixes (`ipc:downloads`, `ws:progress`). Keep shared DTOs in `electron-app/src/shared` and sync the extension whenever payloads change. Run `npx eslint .` inside `electron-app` and `npm run style` in `chrome_extension` before committing.

## Testing Guidelines
Run `cd electron-app && npm run test:coverage` and `cd chrome_extension && npm test` before opening a PR. Store specs beside features (`__tests__/feature.test.ts`) and prefer deterministic mocks for filesystem or IPC work. When touching the server, provide manual test notes because only compiled output lives here. Call out skipped tests with explanations in the PR description.

## Commit & Pull Request Guidelines
Write short, imperative commit subjects (e.g. `Fix IPC manager settings`) and reference issues with `#id` when relevant. PRs should list affected surfaces, test evidence (`npm run test`, screenshots), and rollback considerations. Request an Electron maintainer when updating packaging scripts or `resources/`.

## Security & Configuration Tips
Keep secrets in `.env` files loaded via `dotenv`. After changing `resources/yt-*` binaries or WebSocket ports, run `cd electron-app && npm run verify:deps` and update the extension configuration. Align CORS origins between the extension and server before merging.
