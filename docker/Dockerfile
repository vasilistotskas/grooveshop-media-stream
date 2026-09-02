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

ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=1024 --max-semi-space-size=64"

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
