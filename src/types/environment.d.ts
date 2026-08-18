declare global {
	namespace NodeJS {
		interface ProcessEnv {
			NODE_ENV?: 'development' | 'production' | 'test'
			BACKEND_URL?: string
			[key: string]: string | undefined
		}
	}
}

export {}
