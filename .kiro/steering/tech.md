# Technology Stack

## Framework & Runtime
- **NestJS**: TypeScript-first Node.js framework with decorators and dependency injection
- **Node.js**: v24+ (Alpine Linux in containers)
- **TypeScript**: v5.9+ with ES2021 target
- **Express**: Underlying HTTP server

## Package Management
- **pnpm**: Primary package manager (v10.14.0+)
- **Module Aliases**: `@microservice/*` maps to `src/MediaStream/*`

## Core Dependencies
- **Sharp**: High-performance image processing
- **Bull**: Redis-based job queue for background processing
- **IORedis**: Redis client for caching
- **Axios**: HTTP client for external requests
- **Class Validator/Transformer**: Request validation and transformation

## Development Tools
- **ESLint**: Antfu config with tab indentation and single quotes
- **Vite**: Testing framework with vitest
- **SWC**: Fast TypeScript/JavaScript compiler
- **Semantic Release**: Automated versioning and publishing

## Common Commands

### Development
```bash
# Install dependencies
pnpm install

# Development with watch mode
pnpm run dev

# Development with all updates
pnpm run dev:all

# Debug mode
pnpm run debug

# REPL mode
pnpm run repl
```

### Building & Production
```bash
# Clean and build
pnpm run build

# Production start
pnpm run prod

# Docker build
docker build -f docker/Dockerfile .
```

### Testing & Quality
```bash
# Run tests with coverage
pnpm run test

# Watch mode testing
pnpm run test:watch

# E2E tests
pnpm run test:e2e

# Lint and fix
pnpm run lint
```

## Build Configuration
- **Output**: `build/dist/` directory
- **Source Maps**: Enabled for debugging
- **Incremental**: TypeScript incremental compilation
- **Module System**: CommonJS with ES module interop
