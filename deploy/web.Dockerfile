# The web app, built and served by Caddy together with the reverse proxy to the API.
# Build from the repository root: docker build -f deploy/web.Dockerfile .
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/quire-shared/package.json packages/quire-shared/
COPY packages/quire-editor/package.json packages/quire-editor/
COPY quire-web/package.json quire-web/
RUN npm ci --workspace quire-web --include-workspace-root=false
COPY packages/quire-shared packages/quire-shared
COPY packages/quire-editor packages/quire-editor
COPY quire-web quire-web
RUN npm run build -w quire-web

FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/quire-web/dist /srv
