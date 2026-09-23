FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/quire-shared/package.json packages/quire-shared/
COPY quire-api/package.json quire-api/
RUN npm ci --workspace quire-api --include-workspace-root=false
COPY packages/quire-shared packages/quire-shared
COPY quire-api quire-api
WORKDIR /app/quire-api
EXPOSE 3000
CMD ["npx", "tsx", "src/server.ts"]
