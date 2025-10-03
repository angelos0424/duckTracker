# Web Version Structure Refactor Plan

## Goal
Split the current web-version project into clearly separated runtime surfaces so backend (API/download manager) and frontend (history page UI) responsibilities live in dedicated top-level folders. This should make the repository easier to navigate, simplify build scripts, and clarify ownership between server and client code.

## Step-by-step Plan

1. **Baseline capture**
   - Record the current behaviour: run `npm run build` and the primary smoke tests you rely on (history page load, download scheduling).
   - Generate a dependency graph (optional) so we can double-check cross-surface imports after the move.

2. **Introduce top-level surface folders**
   - Create `backend/` and `frontend/` (or similar names) inside `web-version/`.
   - Move server-specific sources (`src/index.ts`, `src/http/**`, `src/download-manager.ts`, `src/database.ts`, etc.) into `backend/src/`.
   - Move history page React assets (`src/history-page/**`, `src/build/**`, `src/history-page.css`, etc.) into `frontend/src/` alongside any build tooling required for client bundling.

3. **Adjust build tooling**
   - Update `tsconfig.json` (or split into `tsconfig.backend.json` / `tsconfig.frontend.json`) to reflect the new root directories and output paths.
   - Review `package.json` scripts so backend builds still emit to `dist/backend`, and frontend build artifacts continue to land in `dist/history/assets` (or a revised location that aligns with the new structure).
   - Update build helpers (`frontend` copy scripts, esbuild entry points) with the new relative paths.

4. **Update runtime imports and asset lookup**
   - Rewrite import paths that referenced the old `src/` hierarchy so they point to the new locations.
   - Ensure the history asset loader reads from the relocated frontend build output.
   - Validate that the backend no longer assumes co-located frontend sources.

5. **Documentation and configs**
   - Refresh README and any internal docs to explain the new directories and build commands.
   - Update `.gitignore`, lint configs, and tooling references if they rely on path globs.

6. **Verification & cleanup**
   - Re-run builds/tests (`npm run build`, backend smoke tests, history page UI check).
   - Remove any empty legacy folders and ensure `structure-change-plan.md` tasks are checked off in your tracking doc once completed.

## Notes
- Keep the existing ESM module resolution (`moduleResolution: "nodenext"`) in mind when adjusting relative imports after the move.
- If frontend and backend end up sharing DTOs, consider introducing a `shared/` package that both sides consume via relative imports to avoid circular moves later.

