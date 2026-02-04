import { CacheModule } from '#microservice/Cache/cache.module'
import { ConfigModule } from '#microservice/Config/config.module'
import { HttpModule as NestHttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { HttpHealthIndicator } from './indicators/http-health.indicator.js'
import { HttpClientService } from './services/http-client.service.js'

@Module({
	imports: [
		NestHttpModule.register({}),
		ConfigModule,
		CacheModule,
	],
	providers: [
		HttpClientService,
		HttpHealthIndicator,
	],
	exports: [
		HttpClientService,
		HttpHealthIndicator,
		NestHttpModule,
	],
})
export class HttpModule { }
