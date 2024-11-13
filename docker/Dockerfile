FROM node:23.2.0-alpine as base

# Set up the work directory
WORKDIR /usr/src/app

# Copy files
COPY public/ ./public/
COPY nest-cli.json ./
COPY tsconfig*.json ./
COPY package*.json ./
COPY src/ ./src/

FROM base AS build

# Install npm && Build the app
RUN npm ci && \
    npm run build

# debug: ENTRYPOINT ["tail", "-f", "/dev/null"]

FROM base

# Set up the work directory
WORKDIR /usr/src/app

# Copy necessary files from the build stage
COPY --from=build /usr/src/app/build ./build
COPY --from=build /usr/src/app/public ./public
COPY --from=build /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/package*.json ./
COPY --from=build /usr/src/app/nest-cli.json ./

# Volumes
VOLUME ["/usr/src/app/storage"]

# Run the app
CMD ["node", "build/dist/main", "swc"]
