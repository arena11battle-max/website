# ---- Build the web app ----
FROM node:22-slim AS web
WORKDIR /web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ---- Build the API server ----
FROM node:22-slim AS server
WORKDIR /server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npm run build && npm prune --omit=dev

# ---- Runtime ----
FROM node:22-slim
ENV NODE_ENV=production PORT=8080 WEB_DIST=/app/web
WORKDIR /app/server
COPY --from=server /server/dist ./dist
COPY --from=server /server/node_modules ./node_modules
COPY --from=server /server/package.json ./
COPY --from=web /web/dist /app/web
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:8080/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
