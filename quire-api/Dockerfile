# The API (and the co-editing server on /collab). Build from the repository root:
#   docker build -f quire-api/Dockerfile .
FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/quire-shared/package.json packages/quire-shared/
COPY packages/quire-editor/package.json packages/quire-editor/
COPY quire-api/package.json quire-api/
RUN npm ci --workspace quire-api --include-workspace-root=false && npm cache clean --force
COPY packages/quire-shared packages/quire-shared
COPY packages/quire-editor packages/quire-editor
COPY quire-api quire-api
WORKDIR /app/quire-api
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://localhost:3000/api/health || exit 1
CMD ["npx", "tsx", "src/server.ts"]
