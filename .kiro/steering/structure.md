# Project Structure

## Root Directory Layout
```
├── src/                    # Source code
├── test/                   # End-to-end tests
├── build/                  # Compiled output
├── coverage/               # Test coverage reports
├── docker/                 # Docker configuration
├── public/                 # Static assets
├── storage/                # Runtime file storage
└── .kiro/                  # Kiro IDE configuration
```

## Source Code Organization (`src/MediaStream/`)

The main application follows a clean architecture pattern with clear separation of concerns:

### Core Directories
- **`API/`**: REST controllers and HTTP-related components
- **`Module/`**: NestJS modules (dependency injection configuration)
- **`Operation/`**: Business logic operations
- **`Service/`**: External service integrations
- **`Job/`**: Background job processing
- **`Rule/`**: Validation and business rules
- **`Tasks/`**: Scheduled tasks and cron jobs
- **`DTO/`**: Data Transfer Objects
- **`Error/`**: Custom error handling and filters
- **`Constant/`**: Application constants

## File Naming Conventions

### TypeScript Files
- Controllers: `*Controller.ts` (e.g., `MediaStreamImageRESTController.ts`)
- Modules: `*Module.ts` (e.g., `MediaStreamModule.ts`)
- Operations: `*Operation.ts` (e.g., `CacheImageResourceOperation.ts`)
- Jobs: `*Job.ts` (e.g., `WebpImageManipulationJob.ts`)
- Rules: `*Rule.ts` (e.g., `ValidateCacheImageRequestRule.ts`)
- Services: `*Service.ts`
- DTOs: `*.dto.ts`

### Test Files
- Unit tests: `*.spec.ts` (in `src/test/`)
- E2E tests: `*.e2e-spec.ts` (in `test/`)

## Configuration Files
- **`package.json`**: Dependencies and scripts
- **`tsconfig.json`**: TypeScript configuration
- **`nest-cli.json`**: NestJS CLI configuration
- **`jest.config.ts`**: Jest testing configuration
- **`eslint.config.mjs`**: ESLint configuration
- **`.env`**: Environment variables (local)
- **`.env.example`**: Environment template

## Import Path Conventions

Use path aliases for cleaner imports:
```typescript
// Use this
import SomeClass from '@microservice/API/Controller/SomeClass'

// Instead of this
import SomeClass from '../../../MediaStream/API/Controller/SomeClass'
```

## Module Registration Pattern

All components are registered in `MediaStreamModule.ts`:
- Controllers array for HTTP endpoints
- Operations array for business logic
- Jobs array for background processing
- Rules array for validation logic

## Storage Structure
- **`storage/`**: Runtime file storage for cached images
- **`public/`**: Static assets served directly
- **`build/dist/`**: Compiled JavaScript output

## Docker Structure
- **`docker/Dockerfile`**: Production container
- **`docker/dev.Dockerfile`**: Development container
- **`docker/compose.yaml`**: Multi-service orchestration
- **`docker/docker_entrypoint.sh`**: Container startup script