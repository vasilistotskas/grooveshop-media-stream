import { Buffer } from 'node:buffer'

export default class ManipulationJobResult {
	size: string = ''
	format: string = ''
	buffer: Buffer = Buffer.alloc(0)

	constructor(data?: Partial<ManipulationJobResult>) {
		Object.assign(this, data)
	}
}
