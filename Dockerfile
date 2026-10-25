# syntax=docker/dockerfile:1

# ---- build: 정적 SPA 생성 ----
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
# postinstall(nuxt prepare)은 소스가 필요하므로 설치 단계에서는 건너뜀
RUN npm ci --ignore-scripts

COPY . .
RUN npx nuxt prepare && npm run generate

# ---- runtime: nginx로 정적 파일 서빙 ----
FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/.output/public /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
