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
  && locale-gen ko_KR.UTF-8 \

# 로케일 환경변수 설정
ENV LANG=ko_KR.UTF-8
ENV LANGUAGE=ko_KR:ko:en
ENV LC_ALL=ko_KR.UTF-8

RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# 4. yt-dlp + ejs + po-token client 플러그인
#    - yt-dlp는 pre/nightly 따라가기
#    - yt-dlp-ejs는 같은 venv에 꼭 설치
RUN python3 -m pip install -U --pre "yt-dlp[default]" \
  && python3 -m pip install -U yt-dlp-ejs \
  && python3 -m pip install -U bgutil-ytdlp-pot-provider
# 참고: https://github.com/yt-dlp/ejs 의 권장 설치는 pip install -U yt-dlp-ejs 임  [oai_citation:2‡GitHub](https://github.com/yt-dlp/ejs?utm_source=chatgpt.com)

# ===== JS 런타임(Deno) 설치 =====
# 기본 install.sh는 /root/.deno 에 까니까, 컨테이너에선 /usr/local 밑으로 강제
RUN curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh -s -- \
  && ln -s /usr/local/bin/deno /usr/bin/deno
# 그리고 PATH 보정
ENV DENO_INSTALL=/usr/local
ENV PATH="$DENO_INSTALL/bin:$PATH"

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
