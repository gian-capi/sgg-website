# syntax=docker/dockerfile:1

# ---- deps: install with build tools, in case better-sqlite3/sharp need to
#      compile from source for this platform (no prebuilt binary available) ----
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---- runtime: slim image, no build tools ----
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN groupadd --system --gid 1001 sgg \
    && useradd --system --uid 1001 --gid sgg sgg

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY server.js ./
COPY src ./src
COPY public ./public
COPY deploy ./deploy

# Local fallback paths (data/, backups/, uploads/) for when no persistent
# disk is mounted via DB_PATH / BACKUP_ROOT / SITE_ROOT. Writable by the
# non-root user that actually runs the process.
RUN mkdir -p data backups uploads && chown -R sgg:sgg /app

USER sgg

EXPOSE 4000

CMD ["node", "server.js"]
