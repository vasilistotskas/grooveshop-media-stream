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

	// Label values come from the route table, never from the path a client sent.
	it('labels HTTP metrics with the registered route and no tenant', async () => {
		const server = app.getHttpServer()
		await request(server).get('/media_stream-image/media/attacker_chosen_schema/uploads/x.png/1/1/contain/centre/transparent/0/80.exe')
		await request(server).get('/no-such-route-7f3a/with/segments').expect(404)

		const { text } = await request(server).get('/metrics').set('Authorization', `Bearer ${TEST_METRICS_TOKEN}`).expect(200)
		const httpSeries = text.split('\n').filter(line => line.startsWith('mediastream_http_requests_total{'))

		expect(httpSeries.some(line => line.includes('route="/media_stream-image/*path"'))).toBe(true)
		expect(httpSeries.some(line => line.includes('route="unmatched",status_code="404"'))).toBe(true)
		expect(text).not.toContain('tenant_schema')
		expect(text).not.toContain('attacker_chosen_schema')
		expect(text).not.toContain('no-such-route-7f3a')
	})
})
