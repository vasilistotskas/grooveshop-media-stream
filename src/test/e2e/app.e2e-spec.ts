import type { INestApplication } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import MediaStreamModule from '#microservice/media-stream.module'

const TEXT_PLAIN_RE = /text\/plain/

// /metrics is protected by ``InternalSecretGuard`` since the
// audit-hardening pass.  E2E tests load a known secret via
// ``INTERNAL_ADMIN_SECRET`` env var and attach the matching header.
const TEST_INTERNAL_SECRET = 'test-internal-secret-for-e2e-spec'

describe('MediaStreamModule (e2e)', () => {
	let app: INestApplication
	let moduleFixture: TestingModule

	beforeAll(async () => {
		// Set the secret BEFORE module compilation so ConfigService
		// picks it up at startup.
		vi.stubEnv('INTERNAL_ADMIN_SECRET', TEST_INTERNAL_SECRET)

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

			.set('x-internal-secret', TEST_INTERNAL_SECRET)

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
