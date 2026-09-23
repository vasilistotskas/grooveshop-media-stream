import type { INestApplication } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import MediaStreamModule from '#microservice/media-stream.module'

const TEXT_PLAIN_RE = /text\/plain/

// /metrics is protected by ``MetricsTokenGuard``. E2E tests load a known
// token via ``METRICS_BEARER_TOKEN`` and send it as a bearer token.
const TEST_METRICS_TOKEN = 'test-metrics-token-for-e2e-spec'

describe('MediaStreamModule (e2e)', () => {
	let app: INestApplication
	let moduleFixture: TestingModule

	beforeAll(async () => {
		// Set the token BEFORE module compilation so ConfigService
		// picks it up at startup.
		vi.stubEnv('METRICS_BEARER_TOKEN', TEST_METRICS_TOKEN)

		moduleFixture = await Test.createTestingModule({
			imports: [MediaStreamModule],
		}).compile()

		app = moduleFixture.createNestApplication()
		await app.init()
	})

	afterAll(async () => {
		// Close the application first
		try {
			if (app) {
				await app.close()
			}
		}
		catch (error) {
			// Ignore "Connection is closed" errors - they're expected in cleanup
			if (!(error instanceof Error) || !error.message.includes('Connection is closed')) {
				console.error('Error closing app:', error)
			}
		}

		// Close the module fixture
		try {
			if (moduleFixture) {
				await moduleFixture.close()
			}
		}
		catch (error) {
			// Ignore "Connection is closed" errors - they're expected in cleanup
			if (!(error instanceof Error) || !error.message.includes('Connection is closed')) {
				console.error('Error closing module:', error)
			}
		}

		vi.unstubAllEnvs()
	})

	// eslint-disable-next-line test/expect-expect
	it('/metrics (GET)', () => {
		return request(app.getHttpServer())

			.get('/metrics')

			.set('Authorization', `Bearer ${TEST_METRICS_TOKEN}`)

			.expect(200)

			.expect('Content-Type', TEXT_PLAIN_RE)
	})

	it('/health/live (GET)', () => {
		return request(app.getHttpServer())

			.get('/health/live')

			.expect(200)

			.expect((res) => {
				expect(res.body).toHaveProperty('status', 'alive')

				expect(res.body).toHaveProperty('uptime')
			})
	})
})
