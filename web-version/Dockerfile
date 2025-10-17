FROM node:20-bookworm-slim

WORKDIR /app


RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    build-essential \
    docker.io \
    ffmpeg \
    python3 \
    python3-venv \
    python3-pip \
    locales \
  && rm -rf /var/lib/apt/lists/*

# 로케일 생성 (ko_KR.UTF-8)
RUN sed -i '/ko_KR.UTF-8/s/^# //g' /etc/locale.gen \
  && locale-gen ko_KR.UTF-8

# 로케일 환경변수 설정
ENV LANG=ko_KR.UTF-8
ENV LANGUAGE=ko_KR:ko:en
ENV LC_ALL=ko_KR.UTF-8

RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

RUN pip install --no-cache-dir -U yt-dlp bgutil-ytdlp-pot-provider

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY backend ./backend
COPY frontend ./frontend
COPY shared ./shared
COPY frontend/tsconfig.json ./frontend/tsconfig.json

RUN npm run build \
  && npm prune --omit=dev

ENV NODE_ENV=production

ARG PORT=8080
ENV PORT=${PORT}
EXPOSE ${PORT}

CMD ["node", "dist/backend/index.js"]
