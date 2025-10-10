# Repository Guidelines

## Project Structure & Module Organization
- `electron-app/` is the Electron desktop client: runtime code in `src/main`, preload bridges in `src/preload`, React UI in `src/renderer`, shared DTOs in `src/shared`, binaries in `resources/`, and compiled artifacts in `dist/`.
- `chrome_extension/` houses the browser companion; keep feature code in `src`, colocate Jest specs in `src/__tests__`, and expect bundler output in `dist/`.
- `web-version/` mirrors the renderer for the hosted build; align shared contracts with `electron-app/src/shared` when syncing.
- Root `package.json` maintains shared tooling scripts; respect Volta configuration when adding dependencies.

## Build, Test, and Development Commands
- `cd electron-app && npm install` installs using Node 22.18.0; run `npm run dev` for hot reload of main, renderer, and `resources/yt-*`.
- `cd electron-app && npm run build` produces production bundles; append `npm run dist:win` or `npm run dist:mac` to package installers.
- `cd chrome_extension && npm run watch` rebuilds on change; `npm run build` emits the release bundle to `dist/`.
- `cd chrome_extension && npm test` executes Jest suites; add `--watch` during feature work.
- `node server/dist/server.js` starts the Express API when the server subtree is present; load configuration with `.env`.

## Coding Style & Naming Conventions
Use TypeScript. Electron files follow 4-space indentation; the extension uses 2 spaces. Components are PascalCase, hooks camelCase with a `use` prefix, and IPC/WebSocket channels stay colon-prefixed (`ipc:downloads`). Run `npx eslint .` inside `electron-app` and `npm run style` in `chrome_extension` before committing.

## Testing Guidelines
Place tests beside features as `__tests__/feature.test.ts`. Prefer deterministic mocks for filesystem, IPC, and network interactions. Before opening a PR run `cd electron-app && npm run test:coverage` and `cd chrome_extension && npm test`; document manual verification when touching compiled server output.

## Commit & Pull Request Guidelines
Keep commit subjects short and imperative (e.g. `Fix IPC manager settings`) and reference issues with `#id`. PR descriptions should outline affected surfaces, list build or test evidence, attach screenshots for UI updates, and note rollback considerations. Request an Electron maintainer review when changing packaging scripts or `resources/`.

## Security & Configuration Tips
Never commit secrets; store them in `.env` and load via `dotenv`. After modifying `resources/yt-*` binaries or WebSocket ports, run `cd electron-app && npm run verify:deps` and update the extension configuration. Align CORS origins between the extension, web client, and server before merging.
