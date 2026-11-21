# OŁCyŚ – jeden obraz dla monorepo (API + UI + mock-web), uruchamiany z różnymi poleceniami w docker-compose.
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/engine/package.json packages/engine/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/mock-web/package.json apps/mock-web/
RUN npm ci --no-audit --no-fund
COPY . .
RUN npx vite build apps/web
USER node
EXPOSE 4000
CMD ["npx", "tsx", "apps/api/src/server.ts"]
