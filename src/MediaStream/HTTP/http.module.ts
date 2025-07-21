import { ConfigModule } from '@microservice/Config/config.module'
import { HttpModule as NestHttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { HttpHealthIndicator } from './indicators/http-health.indicator'
import { HttpClientService } from './services/http-client.service'

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
