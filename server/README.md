# DuckTracker Server

This folder hosts a lightweight HTTP + WebSocket service that coordinates YouTube downloads for the DuckTracker extension. The service is designed to run inside Docker so it can be deployed independently from the Electron desktop app.

## Features

- **REST API** compatible with the Chrome extension (`/download`, `/stop_download`, `/downloads`, `/save_history`).
- **WebSocket bridge** used to push live progress and completion events.
- **Queue management** with an environment-configurable concurrency limit.
- **Configurable output** path, quality, and format through environment variables.
- **Docker-first workflow** with `docker compose` for quick local or server deployments.
- **Containerised downloads** that execute `yt-dlp` and `ffmpeg` inside an ephemeral Docker container, keeping the Node.js image lean.

## Getting Started

1. Copy the sample environment file and tune it to your needs:

   ```bash
   cp .env.example .env
   ```

   Key variables:

   | Variable | Purpose |
   | --- | --- |
   | `PORT` | HTTP/WebSocket port to expose. |
   | `MAX_CONCURRENT_DOWNLOADS` | How many downloads may run in parallel. |
   | `DOWNLOAD_DIR` | Destination folder *inside* the container. |
   | `DOWNLOAD_FORMAT` | `yt-dlp` format selector. Supports `{quality}` substitution. |
   | `DOWNLOAD_QUALITY` | Optional resolution cap (e.g. `1080p`). |
   | `OUTPUT_TEMPLATE` | File naming template passed to `yt-dlp`. |
   | `YT_DLP_RUNNER` | How downloads execute. Use `docker` (default) to run inside a container, or `binary` to call a local executable. |
   | `YT_DLP_IMAGE` | Docker image that bundles `yt-dlp` and `ffmpeg` when `YT_DLP_RUNNER=docker`. |
   | `DOCKER_BIN` | Docker CLI binary to call when running downloads in a container. |
   | `SERVER_CONTAINER_NAME` | Name of the running server container (used for sharing volumes with download containers). |
   | `HOST_DOWNLOAD_DIR` | (Compose only) Host folder that maps to the container's download directory. |

2. Build and start the stack:

   ```bash
   docker compose up --build
   ```

   The default compose file exposes the server on `http://localhost:8080` and writes downloads into `./downloads` relative to this folder.

3. Point the Chrome extension to the running instance. The WebSocket endpoint lives on the same port using `ws://localhost:PORT`.

## API Summary

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/download` | Start (or queue) a new download. Body requires `url` and `urlId`. |
| `POST` | `/stop_download` | Stop an active or queued download by `urlId`. |
| `GET` | `/downloads` | Read the latest state for all known downloads. |
| `POST` | `/save_history` | Acknowledge history sync events from the extension. |

Responses always include CORS headers so the extension can call the endpoints directly from the browser environment.

## Notes

- Downloads execute inside the `YT_DLP_IMAGE` container so the Node.js image stays minimal while still bundling `yt-dlp` and `ffmpeg`.
- `DOWNLOAD_FORMAT` recognises `{quality}` placeholders. For example, setting `DOWNLOAD_FORMAT=bestvideo[height<={quality}]+bestaudio/best[height<={quality}]` with `DOWNLOAD_QUALITY=1080p` restricts downloads to 1080p.
- When `YT_DLP_RUNNER=docker` ensure the compose stack mounts `/var/run/docker.sock` and sets `SERVER_CONTAINER_NAME` to the running service so download containers can reuse the `/downloads` volume via `--volumes-from`.

- When the concurrency limit is reached the server queues incoming downloads and starts them automatically once a slot frees up.

## Development

To run the server without Docker you only need Node.js 20+ and `yt-dlp` available in your `PATH`:

```bash
PORT=8080 DOWNLOAD_DIR=./downloads YT_DLP_RUNNER=binary node src/index.js
```

`node --watch src/index.js` provides a rudimentary dev loop.
