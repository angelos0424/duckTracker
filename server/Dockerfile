FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    docker.io \
  && rm -rf /var/lib/apt/lists/*

COPY src ./src
COPY package.json ./

ENV NODE_ENV=production

EXPOSE 8080

CMD ["node", "src/index.js"]
