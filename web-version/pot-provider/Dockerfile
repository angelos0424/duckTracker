# Preserve the provider and update its Node runtime to the security release.
FROM node:26.12.1-bookworm-slim@sha256:28147155d47dc31abe0a46e0d12b59b2fb3d0a2dcc5dc65fce76a074180b16fe AS node-runtime
FROM brainicism/bgutil-ytdlp-pot-provider@sha256:d7d34108b76e52c7d3b575fe9e797e4bf41c1b2a08f80c5292eff6f851ce8472
USER root
# The upstream ARM64 canvas binary needs this runtime library.
RUN --mount=type=cache,target=/var/lib/apt/lists apt-get update && apt-get install -y --no-install-recommends libexpat1 && apt-get clean
COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node
USER node
RUN test "$(node --version)" = "v26.12.1" && node -e "require('canvas'); console.log('Node ' + process.version + ': canvas loaded')"
