# ./bgutil-pot-provider/Dockerfile
FROM node:20-slim

# 빌드에 git 필요
RUN apt-get update && apt-get install -y --no-install-recommends git \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
# 소스 가져오기
RUN git clone https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git .

# server 패키지 빌드
WORKDIR /app/server
RUN npm ci && npm run build

ENV NODE_ENV=production
ENV PORT=8080
# 필요 시 토큰 캐시 TTL 조정(초). compose에서 override 가능
ENV TOKEN_TTL=21600

EXPOSE 8080
# upstream에서 npm start로 서버 구동
CMD ["npm", "start", "--silent"]