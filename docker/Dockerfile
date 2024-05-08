FROM node:20.13.0-alpine as base

# Set environment variables for pnpm
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# Enable corepack
RUN corepack enable

# Set up the work directory
WORKDIR /usr/src/app

# Copy files
COPY nest-cli.json ./
COPY tsconfig*.json ./
COPY package*.json ./
COPY pnpm-lock.yaml ./
COPY src/ ./src/

FROM base AS build

# Install pnpm
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# Build the app
RUN pnpm run build

# debug: ENTRYPOINT ["tail", "-f", "/dev/null"]

FROM base

# Set up the work directory
WORKDIR /usr/src/app

# Copy necessary files from the build stage
COPY --from=build /usr/src/app/build ./build
COPY --from=build /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/package*.json ./
COPY --from=build /usr/src/app/pnpm-lock.yaml ./
COPY --from=build /usr/src/app/nest-cli.json ./

# Volumes
VOLUME ["/usr/src/app/storage"]

# Run the app
CMD ["node", "build/dist/main", "swc"]
