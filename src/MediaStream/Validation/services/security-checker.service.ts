import { Injectable } from '@nestjs/common'
import { ConfigService } from '#microservice/Config/config.service'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'

const SUSPICIOUS_PATTERNS: readonly RegExp[] = [
	/<script\b[^>]{0,100}>/i,
	/javascript:/i,
	/vbscript:/i,
	/data:text\/html/i,
	/\bon\w{1,20}\s*=/i,

	/union\s{1,5}select/i,
	/drop\s{1,5}table/i,
	/insert\s{1,5}into/i,
	/delete\s{1,5}from/i,

	/\.\.\//,
	/\.\.\\/,
	/\.\.\\\\/,
	/%2e%2e%2f/i,
	/%2e%2e%5c/i,

	/;\s{0,5}rm\s{1,5}-rf/i,
	/;\s{0,5}cat\s{1,5}/i,
	/;\s{0,5}ls\s{1,5}/i,
	/\|\s{0,5}nc\s{1,5}/i,

	/<!entity\b/i,
	/<!doctype[^>]{0,100}\[/i,

	/\(\|\(/,
	/\)\(\|/,

	/\$where\b/i,
	/\$ne\b/i,
	/\$gt\b/i,
	/\$lt\b/i,
]

/** Upload filenames carry random suffixes (`__ytXSDgf`), so image names skip the entropy test. */
const IMAGE_EXTENSION_RE = /\.(?:jpe?g|png|gif|webp|svg|bmp|tiff?|ico|avif)$/i

/** Patterns are tested on a prefix so a huge value cannot turn matching into a DoS. */
const PATTERN_TEST_MAX_LENGTH = 5000
const ENTROPY_MIN_LENGTH = 20
const ENTROPY_MAX_LENGTH = 1000
const ENTROPY_SAMPLE_LENGTH = 500
const ENTROPY_MAX_DISTINCT_CHARS = 256
const ENTROPY_THRESHOLD_BITS = 4.5

/**
 * Detects injection, traversal and encoded-payload shapes in route parameters.
 * Every parameter reaching the image pipeline is a string, so this is a
 * string check only.
 */
@Injectable()
export class SecurityCheckerService {
	private readonly maxStringLength: number

	constructor(configService: ConfigService) {
		this.maxStringLength = configService.get<number>('validation.maxStringLength')
	}

	checkForMaliciousContent(input: string): boolean {
		if (input.length === 0) {
			return false
		}

		if (input.length > this.maxStringLength) {
			CorrelatedLogger.warn(`Excessively long string detected: ${input.length} characters`, SecurityCheckerService.name)
			return true
		}

		const sample = input.length > PATTERN_TEST_MAX_LENGTH ? input.substring(0, PATTERN_TEST_MAX_LENGTH) : input
		const matched = SUSPICIOUS_PATTERNS.find(pattern => pattern.test(sample))
		if (matched) {
			CorrelatedLogger.warn(`Suspicious pattern detected: ${matched.source}`, SecurityCheckerService.name)
			return true
		}

		// Decoded variants catch mixed-case encoding (%2E%2E/), partial encoding
		// (..%2f) and double encoding (%252e%252e%252f → ../).
		if (this.containsEncodedTraversal(input)) {
			CorrelatedLogger.warn('Path traversal detected in decoded input', SecurityCheckerService.name)
			return true
		}

		if (this.hasHighEntropy(input)) {
			CorrelatedLogger.warn('High entropy string detected (potential encoded payload)', SecurityCheckerService.name)
			return true
		}

		return false
	}

	private containsEncodedTraversal(value: string): boolean {
		try {
			const decoded = decodeURIComponent(value)
			if (decoded !== value && SUSPICIOUS_PATTERNS.some(pattern => pattern.test(decoded))) {
				return true
			}

			const doubleDecoded = decodeURIComponent(decoded)
			return doubleDecoded !== decoded && SUSPICIOUS_PATTERNS.some(pattern => pattern.test(doubleDecoded))
		}
		catch {
			// Malformed percent-encoding is inherently suspicious — reject it
			return true
		}
	}

	private hasHighEntropy(value: string): boolean {
		if (value.length < ENTROPY_MIN_LENGTH || value.length > ENTROPY_MAX_LENGTH) {
			return false
		}

		if (IMAGE_EXTENSION_RE.test(value)) {
			return false
		}

		const sample = value.length > ENTROPY_SAMPLE_LENGTH ? value.substring(0, ENTROPY_SAMPLE_LENGTH) : value

		const charCount = new Map<string, number>()
		for (const char of sample) {
			charCount.set(char, (charCount.get(char) ?? 0) + 1)
		}

		if (charCount.size > ENTROPY_MAX_DISTINCT_CHARS) {
			return false
		}

		let entropy = 0
		for (const count of charCount.values()) {
			const probability = count / sample.length
			entropy -= probability * Math.log2(probability)
		}

		return entropy > ENTROPY_THRESHOLD_BITS
	}
}
