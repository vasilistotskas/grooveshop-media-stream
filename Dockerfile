FROM node:21.0.0-alpine as builder

WORKDIR /usr/src/app

#COPY .env ./
COPY nest-cli.json ./
COPY tsconfig*.json ./
COPY package*.json ./
COPY pnpm-lock.yaml ./
COPY src/ ./src/

RUN npm install -g pnpm && \
    pnpm install --frozen-lockfile && \
    pnpm run build

# debug: ENTRYPOINT ["tail", "-f", "/dev/null"]

FROM node:21.0.0-alpine as production

WORKDIR /usr/src/app

#COPY --from=builder /usr/src/app/.env ./
COPY --from=builder /usr/src/app/build ./build
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/package*.json ./
COPY --from=builder /usr/src/app/pnpm-lock.yaml ./
COPY --from=builder /usr/src/app/nest-cli.json ./

VOLUME ["/usr/src/app/storage"]

CMD ["node", "build/dist/src/main", "swc"]
