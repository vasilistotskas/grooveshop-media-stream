declare global {
	namespace NodeJS {
		interface ProcessEnv {
			NODE_ENV?: 'development' | 'production' | 'test'
			[key: string]: string | undefined
		}
	}
}

export {}
