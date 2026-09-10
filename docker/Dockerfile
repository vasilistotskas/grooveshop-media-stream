ARG NODE_VERSION=24.19.0

FROM node:${NODE_VERSION}-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

WORKDIR /usr/src/app

# Manifests first so the dependency layers survive source edits.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./

FROM base AS prod-deps

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile --prefer-offline

FROM base AS build

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --prefer-offline

COPY . .

RUN pnpm run build

FROM node:${NODE_VERSION}-slim AS production

WORKDIR /usr/src/app

# libvips allocates through GLib, and glibc's per-thread malloc arenas
# fragment badly in a long-running multi-threaded process (sharp and imgproxy
# both document this). Preload jemalloc (the allocator sharp recommends) and
# cap glibc arenas as a fallback for anything that runs without the preload.
# The multiarch path is resolved at build time so amd64 and arm64 images work.
RUN apt-get update \
  && apt-get install -y --no-install-recommends libjemalloc2 \
  && rm -rf /var/lib/apt/lists/* \
  && ln -s "/usr/lib/$(uname -m)-linux-gnu/libjemalloc.so.2" /usr/local/lib/libjemalloc.so.2

ENV LD_PRELOAD=/usr/local/lib/libjemalloc.so.2
ENV MALLOC_ARENA_MAX=2

ENV NODE_ENV=production
# The JS heap stays small (~120 MB under load); image bytes live outside it
# as Buffers and libvips memory. A 1024 MB ceiling plus that native footprint
# does not fit the 1280Mi pod limit, so cap the heap well below it.
ENV NODE_OPTIONS="--max-old-space-size=512 --max-semi-space-size=32"

COPY --from=build --chown=node:node /usr/src/app/build ./build
COPY --from=build --chown=node:node /usr/src/app/public ./public
COPY --from=build --chown=node:node /usr/src/app/scripts/clear-cache.cjs ./scripts/clear-cache.cjs
COPY --from=prod-deps --chown=node:node /usr/src/app/node_modules ./node_modules
COPY --from=build --chown=node:node /usr/src/app/package.json ./

RUN mkdir -p /usr/src/app/storage && chown -R node:node /usr/src/app/storage

USER node

EXPOSE 3003

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3003) + '/health/live').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

CMD ["node", "build/dist/main.js"]
