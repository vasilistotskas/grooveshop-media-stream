declare global {
	namespace NodeJS {
		interface ProcessEnv {
			NEST_PUBLIC_DJANGO_URL?: string
			NODE_ENV?: 'development' | 'production' | 'test'
		}
	}
}

export {}
