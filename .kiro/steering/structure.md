# Project Structure

## Root Directory Layout
```
├── src/                    # Source code
├── build/dist/            # Compiled output
├── public/                # Static assets served directly
├── storage/               # File cache and processed images
├── docker/                # Docker configuration
├── coverage/              # Test coverage reports
├── test/                  # E2E tests
└── .kiro/                 # Kiro IDE configuration
```

## Source Code Organization (`src/MediaStream/`)

The codebase follows a domain-driven design with clear separation of concerns:

### Core Layers
- **`API/`**: Controllers and HTTP request handlers
- **`Service/`**: Business logic and core services
- **`Operation/`**: Complex business operations and workflows
- **`DTO/`**: Data Transfer Objects for request/response validation
- **`Module/`**: NestJS modules for dependency injection

### Infrastructure
- **`Config/`**: Configuration management and environment variables
- **`Cache/`**: Multi-layer caching (memory, Redis, file)
- **`Storage/`**: File system operations and storage management
- **`Queue/`**: Background job processing with Bull
- **`HTTP/`**: External HTTP client configuration

### Cross-cutting Concerns
- **`Error/`**: Custom error handling and logging
- **`Validation/`**: Custom validation rules and pipes
- **`Monitoring/`**: Health checks and application monitoring
- **`Metrics/`**: Performance metrics and observability
- **`RateLimit/`**: Request throttling and rate limiting
- **`Correlation/`**: Request correlation and tracing

### Supporting Components
- **`Constant/`**: Application constants and enums
- **`Rule/`**: Business rules and validation logic
- **`Tasks/`**: Scheduled tasks and cron jobs
- **`Health/`**: Health check endpoints

## File Naming Conventions
- **Controllers**: `*.controller.ts`
- **Services**: `*.service.ts`
- **Modules**: `*Module.ts` (PascalCase)
- **DTOs**: `*.dto.ts`
- **Tests**: `*.spec.ts` (unit), `*.e2e-spec.ts` (E2E)
- **Interfaces**: `I*.ts` prefix

## Import Path Aliases
- `@microservice/*` → `src/MediaStream/*`
- `@storage/*` → `var/*` (runtime storage paths)

## Testing Structure
- **Unit tests**: `src/test/` directory
- **E2E tests**: `test/` directory
- **Coverage**: Generated in `coverage/` directory
- **Test utilities**: Shared in `src/test/` with spec files