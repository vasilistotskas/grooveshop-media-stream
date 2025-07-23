import { ConfigModule } from '@microservice/Config/config.module'
import { HttpHealthIndicator } from '@microservice/HTTP/indicators/http-health.indicator'
import { HttpClientService } from '@microservice/HTTP/services/http-client.service'
import { HttpModule as NestHttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'

@Module({
	imports: [
		NestHttpModule.register({}),
		ConfigModule,
	],
	providers: [
		HttpClientService,
		HttpHealthIndicator,
	],
	exports: [
		HttpClientService,
		HttpHealthIndicator,
	],
})
export class HttpModule {}
