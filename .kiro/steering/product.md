# Product Overview

Grooveshop Media Stream is a NestJS microservice that provides image processing and media streaming capabilities for the Grooveshop e-commerce platform.

## Core Functionality

- **Image Processing**: Resize, format conversion, and WebP optimization
- **Media Caching**: Intelligent caching of processed images to improve performance
- **Static Asset Serving**: Serves both static and user-uploaded images
- **RESTful API**: Simple GET-based API for image manipulation and retrieval

## Key Features

- WebP image optimization for better performance
- Dynamic image resizing with validation
- File-based caching system
- CORS-enabled for cross-origin requests (GET only)
- Background job processing for resource-intensive operations
- Scheduled tasks for maintenance operations

## Architecture

The service follows a clean architecture pattern with clear separation of concerns:
- Controllers handle HTTP requests
- Operations contain business logic
- Jobs handle background processing
- Rules provide validation logic
- Services manage external integrations

## Security Focus

- Input validation on all requests
- Generic error messages to prevent information disclosure
- CORS restricted to GET methods only
- No sensitive operations exposed via API