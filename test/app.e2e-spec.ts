import MediaStreamModule from '@microservice/Module/MediaStreamModule'
import { NestExpressApplication } from '@nestjs/platform-express'
import { Test, TestingModule } from '@nestjs/testing'
import request from 'supertest'

describe('MediaStreamController (e2e)', () => {
	let app: NestExpressApplication

	beforeEach(async () => {
		const moduleFixture: TestingModule = await Test.createTestingModule({
			imports: [MediaStreamModule],
		}).compile()

		app = moduleFixture.createNestApplication<NestExpressApplication>()
		app.useStaticAssets('public')
		await app.init()
	})

	afterEach(async () => {
		await app.close()
	})

	it('/ (GET) - should return a response', () => {
		return request(app.getHttpServer())
			.get('/')
			.expect((response) => {
				expect(response.status).toBe(200)
			})
	})
})
