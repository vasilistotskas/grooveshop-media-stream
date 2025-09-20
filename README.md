[![Coverage Status](https://coveralls.io/repos/github/vasilistotskas/grooveshop-media-stream/badge.svg?branch=main)](https://coveralls.io/github/vasilistotskas/grooveshop-media-stream?branch=main)

# Grooveshop Media Stream

A NestJS microservice for media streaming and image processing.

## Overview

This service provides image processing capabilities for the Grooveshop platform, including:
- Image resizing and format conversion
- Caching of processed images
- Serving static and uploaded images
- WebP image optimization

## Setup and Installation

### Prerequisites
- Node.js (latest LTS version recommended)
- pnpm package manager (v10.8.1 or later)

### Environment Setup
1. Clone the repository:
   ```bash
   git clone https://github.com/vasilistotskas/grooveshop-media-stream.git
   cd grooveshop-media-stream
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Configure environment variables:
   - Copy `.env.example` to `.env`
   - Adjust the variables as needed

### Environment Variables
- `COMPOSE_PROJECT_NAME`: Docker Compose project name
- `LAUNCH_AS`: Launch mode (HYBRID)
- `NEST_PUBLIC_DJANGO_URL`: URL for the Django backend
- `NEST_PUBLIC_NUXT_URL`: URL for the Nuxt frontend
- `PORT`: Port for the NestJS application to listen on (default: 3003)
- `COVERALLS_REPO_TOKEN`: Token for Coveralls code coverage reporting (CI only)

## Running the Application

```bash
# Development
pnpm run dev

# Production
pnpm run build
pnpm run prod
```

### CORS Configuration

The application is configured with CORS (Cross-Origin Resource Sharing) enabled by default with the following settings:

- Origin: `*` (all origins allowed)
- Methods: `GET` (only GET requests allowed)
- Max Age: `86400` (24 hours)

These settings are appropriate for an image processing service that only needs to serve images via GET requests. If you need to modify these settings, you can update them in the `main.ts` file.

## Testing

```bash
# Run tests with coverage
pnpm run test

# Run tests in watch mode
pnpm run test:watch

# Run end-to-end tests
pnpm run test:e2e
```

### Writing Tests

The project uses Jest for testing. Unit tests are located in `src/test` and end-to-end tests are in the `test` directory.

#### Unit Tests

Unit tests should be placed in the `src/test` directory and follow the naming convention `*.spec.ts`. For example:

```typescript
// src/test/SimpleUtility.spec.ts
import { describe, it, expect } from '@jest/globals'

describe('SimpleUtility', () => {
  it('should add two numbers correctly', () => {
    expect(1 + 2).toBe(3)
  })
})
```

#### End-to-End Tests

End-to-end tests should be placed in the `test` directory and follow the naming convention `*.e2e-spec.ts`. These tests typically test the API endpoints and the integration between different components.

```typescript
// test/app.e2e-spec.ts
import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication } from '@nestjs/common'
import * as request from 'supertest'
import MediaStreamModule from '@microservice/media-stream.module'

describe('MediaStreamController (e2e)', () => {
  let app: INestApplication

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [MediaStreamModule],
    }).compile()

    app = moduleFixture.createNestApplication()
    await app.init()
  })

  it('/api/v1/image/static/images/test.jpg (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/image/static/images/test.jpg')
      .expect(200)
  })
})
```

## Project Structure

- `src/MediaStream/API`: API controllers and related components
- `src/MediaStream/Constant`: Constant values
- `src/MediaStream/DTO`: Data Transfer Objects
- `src/MediaStream/Error`: Error handling and logging
- `src/MediaStream/Job`: Background jobs
- `src/MediaStream/Module`: NestJS modules
- `src/MediaStream/Operation`: Business operations
- `src/MediaStream/Rule`: Business rules
- `src/MediaStream/Service`: Services
- `src/MediaStream/Tasks`: Scheduled tasks

## Security Best Practices

The project implements several security best practices:

### 1. Input Validation

- All request parameters are validated before processing
- Custom validation rules ensure data integrity and prevent injection attacks
- Error messages are generic to avoid information disclosure

### 2. Error Handling

- Custom error handling system prevents leaking sensitive information
- Structured error responses with appropriate HTTP status codes
- Detailed internal logging with context for debugging without exposing details to clients

### 3. Automated Security Scanning

- CodeQL analysis for detecting security vulnerabilities in code
- Trivy scanning for container vulnerabilities
- Regular dependency updates to patch security issues

### 4. Access Control

- CORS configuration limits cross-origin requests to GET methods only
- No sensitive operations exposed via the API
- Resource validation before processing to prevent unauthorized access
