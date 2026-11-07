import { describe, expect, it } from 'vitest'
import { SecurityCheckerService } from '#microservice/Validation/services/security-checker.service'
import { createConfigServiceMock } from '../../helpers/config-service.mock.js'

/**
 * A video id reaches the service's injection checks like any other route
 * param, and YouTube ids are random base64url: a false positive would be a 400
 * and a store's poster gone. Ids shaped like what those checks look for.
 */
describe('securityCheckerService with YouTube video ids', () => {
	const checker = new SecurityCheckerService(createConfigServiceMock())

	it.each([
		'eIiZ-JHL5aw',
		'frC_MO1lVaE',
		'vrd010OWYBg',
		'a--b_c-d-e1',
		'--ORoptions',
		'ScRiPt_alrT',
		'SELECT_FROM',
		'x_________x',
		'dQw4w9WgXcQ',
		'0123456789a',
	])('lets %s through', (id) => {
		expect(checker.checkForMaliciousContent(id)).toBe(false)
	})
})
