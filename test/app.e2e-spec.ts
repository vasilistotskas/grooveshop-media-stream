import MediaStreamModule from '@microservice/Module/MediaStreamModule'
import { INestApplication } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import request from 'supertest'

describe('MediaStreamModule (e2e)', () => {
	let app: INestApplication
	let moduleFixture: TestingModule

	beforeAll(async () => {
		moduleFixture = await Test.createTestingModule({
			imports: [MediaStreamModule],
		}).compile()

		app = moduleFixture.createNestApplication()
		await app.init()
	})

	afterAll(async () => {
		try {
			if (app) {
				await app.close()
			}
		}
		catch {
			// Ignore cleanup errors in tests
		}

		try {
			if (moduleFixture) {
				await moduleFixture.close()
			}
		}
		catch {
			// Ignore cleanup errors in tests
		}

		// Give time for async cleanup
		await new Promise(resolve => setTimeout(resolve, 500))
	})

	it('/metrics (GET)', () => {
		return request(app.getHttpServer())
			.get('/metrics')
			.expect(200)
			.expect('Content-Type', /text\/plain/)
	})

	it('/metrics/health (GET)', () => {
		return request(app.getHttpServer())
			.get('/metrics/health')
			.expect(200)
			.expect((res) => {
				expect(res.body).toHaveProperty('status')
				expect(res.body).toHaveProperty('timestamp')
				expect(res.body).toHaveProperty('service')
			})
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
