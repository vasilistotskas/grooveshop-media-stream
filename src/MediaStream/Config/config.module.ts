import { ConfigService } from '#microservice/Config/config.service'
import { Global, Module } from '@nestjs/common'
import { ConfigModule as NestConfigModule } from '@nestjs/config'

/**
 * Global configuration module that provides validated configuration throughout the application
 */
@Global()
@Module({
	imports: [
		NestConfigModule.forRoot({
			isGlobal: true,
			envFilePath: ['.env.local', '.env'],
			cache: true,
			expandVariables: true,
		}),
	],
	providers: [ConfigService],
	exports: [ConfigService],
})
export class ConfigModule {}
