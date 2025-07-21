# Technology Stack

## Core Framework
- **NestJS**: Node.js framework with TypeScript support
- **Express**: Underlying HTTP server
- **TypeScript**: Primary language (ES2021 target)

## Key Dependencies
- **Sharp**: High-performance image processing library
- **Axios**: HTTP client for external requests
- **RxJS**: Reactive programming support
- **Reflect-metadata**: Decorator metadata support

## Development Tools
- **pnpm**: Package manager (v10.13.1+)
- **ESLint**: Code linting with @antfu/eslint-config
- **Jest**: Testing framework with coverage reporting
- **SWC**: Fast TypeScript/JavaScript compiler
- **Semantic Release**: Automated versioning and publishing

## Build System
- **Nest CLI**: Primary build tool
- **TypeScript Compiler**: Code compilation
- **Rimraf**: Clean build directories

## Common Commands

### Development
```bash
# Start development server with watch mode
pnpm run dev

# Start with TypeScript compilation watching
pnpm run dev:all  # Updates deps, builds, lints, then starts dev

# Debug mode with inspector
pnpm run debug

# REPL mode for interactive development
pnpm run repl
```

### Building
```bash
# Clean and build for production
pnpm run build

# Start production server
pnpm run prod
```

### Testing
```bash
# Run all tests with coverage
pnpm run test

# Watch mode for development
pnpm run test:watch

# End-to-end tests
pnpm run test:e2e

# Coverage only
pnpm run test:cov
```

### Code Quality
```bash
# Fix linting issues
pnpm run lint:fix
```

## Path Aliases
- `@microservice/*` → `src/MediaStream/*`
- `@storage/*` → `var/*`

## Environment Variables
- `PORT`: Application port (default: 3003)
- `NEST_PUBLIC_DJANGO_URL`: Django backend URL
- `NEST_PUBLIC_NUXT_URL`: Nuxt frontend URL
- `LAUNCH_AS`: Launch mode (HYBRID)
- `COMPOSE_PROJECT_NAME`: Docker project name

## Docker Support
- Multi-stage Dockerfile with Alpine Linux
- Docker Compose configuration available
- Production-ready container setup