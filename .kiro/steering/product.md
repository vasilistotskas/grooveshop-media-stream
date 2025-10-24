# Product Overview

Grooveshop Media Stream is a NestJS microservice that provides image processing and media streaming capabilities for the Grooveshop e-commerce platform.

## Core Functionality

- **Image Processing**: Resizing, format conversion, and WebP optimization
- **Caching**: Multi-layer caching with memory, Redis, and file-based storage
- **Media Serving**: Static and uploaded image delivery with CORS support
- **Background Processing**: Queue-based image processing with Bull/Redis
- **Monitoring**: Health checks, metrics, and performance monitoring

## Architecture

The service follows a microservice architecture pattern, designed to be:
- **Stateless**: Can be horizontally scaled
- **Cache-first**: Optimized for performance with multiple caching layers
- **Fault-tolerant**: Includes retry mechanisms and graceful error handling
- **Observable**: Built-in monitoring and health checks

## Integration

Part of the larger Grooveshop ecosystem, integrating with:
- Django backend (`BACKEND_URL`)
- Redis for caching and job queues
- External image sources via HTTP
