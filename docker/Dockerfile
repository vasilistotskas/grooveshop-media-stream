ARG NODE_VERSION=23.3.0

FROM node:${NODE_VERSION}-alpine AS build

WORKDIR /usr/src/app

COPY . .

RUN npm ci && \
    npm run build

# debug: ENTRYPOINT ["tail", "-f", "/dev/null"]

FROM node:${NODE_VERSION}-alpine AS production

WORKDIR /usr/src/app

COPY --from=build --chown=node:node /usr/src/app/build ./build
COPY --from=build --chown=node:node /usr/src/app/public ./public
COPY --from=build --chown=node:node /usr/src/app/node_modules ./node_modules
COPY --from=build --chown=node:node /usr/src/app/package*.json ./
COPY --from=build --chown=node:node /usr/src/app/nest-cli.json ./

RUN mkdir -p /usr/src/app/storage && chown -R node:node /usr/src/app/storage

USER node

CMD ["node", "build/dist/main", "swc"]
