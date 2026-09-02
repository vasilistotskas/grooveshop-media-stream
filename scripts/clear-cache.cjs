#!/usr/bin/env node

/**
 * Media Stream Cache Clearing Script
 *
 * This script clears all cache layers used by the media stream service:
 * 1. Redis cache (distributed cache)
 * 2. File cache (storage directory with .rsc, .rsm, .rst files)
 * 3. Memory cache (cleared by restarting the server)
 *
 * Usage:
 *   pnpm run cache:clear -- [options]
 *
 * Options:
 *   --redis-only     Clear only Redis cache
 *   --files-only     Clear only file cache
 *   --redis-host     Redis host (default: localhost)
 *   --redis-port     Redis port (default: 6379)
 *   --redis-db       Redis database number (default: 0)
 *   --redis-pass     Redis password (optional)
 *   --storage-path   Storage directory path (default: ./storage)
 *   --help, -h       Show this help message
 */

const fs = require('node:fs')
const path = require('node:path')
const process = require('node:process')
const Redis = require('ioredis')

// Parse command line arguments
const args = process.argv.slice(2)
const options = {
	redisOnly: args.includes('--redis-only'),
	filesOnly: args.includes('--files-only'),
	redisHost: getArgValue('--redis-host') || process.env.REDIS_HOST || 'localhost',
	redisPort: Number.parseInt(getArgValue('--redis-port') || process.env.REDIS_PORT || '6379'),
	redisDb: Number.parseInt(getArgValue('--redis-db') || process.env.REDIS_DB || '0'),
	redisPass: getArgValue('--redis-pass') || process.env.REDIS_PASSWORD || '',
	storagePath: getArgValue('--storage-path') || process.env.CACHE_FILE_DIRECTORY || './storage',
	help: args.includes('--help') || args.includes('-h'),
}

function getArgValue(argName) {
	const index = args.indexOf(argName)
	return index !== -1 && args[index + 1] ? args[index + 1] : null
}

function showHelp() {
	console.log(`
Media Stream Cache Clearing Script

This script clears all cache layers used by the media stream service:
1. Redis cache (distributed cache)
2. File cache (storage directory with .rsc, .rsm, .rst files)
3. Memory cache (cleared by restarting the server)

Usage:
  pnpm run cache:clear -- [options]

Options:
  --redis-only         Clear only Redis cache
  --files-only         Clear only file cache
  --redis-host HOST    Redis host (default: localhost)
  --redis-port PORT    Redis port (default: 6379)
  --redis-db DB        Redis database number (default: 0)
  --redis-pass PASS    Redis password (optional)
  --storage-path PATH  Storage directory path (default: ./storage)
  --help, -h           Show this help message

Environment Variables (same names as the service):
  REDIS_HOST           Redis host
  REDIS_PORT           Redis port
  REDIS_DB             Redis database number
  REDIS_PASSWORD       Redis password
  CACHE_FILE_DIRECTORY Storage directory path

Examples:
  pnpm run cache:clear
  pnpm run cache:clear -- --redis-only
  pnpm run cache:clear -- --files-only
  pnpm run cache:clear -- --redis-host redis.example.com --redis-port 6380
	`)
}

async function clearRedisCache() {
	console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
	console.log('🔴 Clearing Redis Cache')
	console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

	try {
		const redisConfig = {
			host: options.redisHost,
			port: options.redisPort,
			db: options.redisDb,
			retryDelayOnFailover: 100,
			maxRetriesPerRequest: 3,
			lazyConnect: true,
			connectTimeout: 10000,
		}

		if (options.redisPass) {
			redisConfig.password = options.redisPass
		}

		console.log(`📡 Connecting to Redis at ${options.redisHost}:${options.redisPort} (DB: ${options.redisDb})`)

		const redis = new Redis(redisConfig)

		await redis.connect()
		console.log('✅ Connected to Redis')

		// Get number of keys before clearing
		const keysBefore = await redis.dbsize()
		console.log(`📊 Keys before clearing: ${keysBefore}`)

		// Clear all keys in the current database
		await redis.flushdb()
		console.log('✅ Flushed Redis database')

		// Verify clearing
		const keysAfter = await redis.dbsize()
		console.log(`📊 Keys after clearing: ${keysAfter}`)

		await redis.quit()
		console.log('✅ Redis cache cleared successfully')

		return { success: true, keysBefore, keysAfter }
	}
	catch (error) {
		console.error('❌ Redis cache clearing failed:', error.message)
		console.error('   This is expected if Redis is not running or not accessible')
		return { success: false, error: error.message }
	}
}

async function clearFileCache() {
	console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
	console.log('📁 Clearing File Cache')
	console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

	const storagePath = path.resolve(options.storagePath)
	console.log(`📂 Storage path: ${storagePath}`)

	if (!fs.existsSync(storagePath)) {
		console.log('⚠️  Storage directory not found. Nothing to clear.')
		return { success: true, deletedCount: 0, skippedCount: 0 }
	}

	try {
		const files = fs.readdirSync(storagePath)
		let deletedCount = 0
		let skippedCount = 0
		const errors = []

		console.log(`📊 Total files in storage: ${files.length}`)

		for (const file of files) {
			const filePath = path.join(storagePath, file)
			const stats = fs.statSync(filePath)

			// Skip directories (like 'image' subdirectory)
			if (stats.isDirectory()) {
				console.log(`📁 Skipping directory: ${file}`)
				skippedCount++
				continue
			}

			// Delete cache files:
			// - .rsc (resource cache)
			// - .rsm (resource metadata)
			// - .rst (resource temp)
			// - default_optimized_* (optimized default images)
			const shouldDelete
				= file.endsWith('.rsc')
					|| file.endsWith('.rsm')
					|| file.endsWith('.rst')
					|| file.startsWith('default_optimized_')

			if (shouldDelete) {
				try {
					fs.unlinkSync(filePath)
					deletedCount++
					if (deletedCount <= 10) {
						console.log(`  ✓ Deleted: ${file}`)
					}
					else if (deletedCount === 11) {
						console.log('  ... (showing first 10 files only)')
					}
				}
				catch (error) {
					errors.push({ file, error: error.message })
					console.error(`  ✗ Error deleting ${file}: ${error.message}`)
				}
			}
			else {
				skippedCount++
			}
		}

		console.log(`✅ Deleted ${deletedCount} cache file(s)`)
		console.log(`📊 Skipped ${skippedCount} file(s) (non-cache files or directories)`)

		if (errors.length > 0) {
			console.log(`⚠️  ${errors.length} error(s) occurred during deletion`)
		}

		return { success: true, deletedCount, skippedCount, errors }
	}
	catch (error) {
		console.error('❌ File cache clearing failed:', error.message)
		return { success: false, error: error.message }
	}
}

async function clearMediaStreamCache() {
	console.log('\n')
	console.log('╔═══════════════════════════════════════════╗')
	console.log('║   Media Stream Cache Clearing Script     ║')
	console.log('╚═══════════════════════════════════════════╝')
	console.log('\n')

	if (options.help) {
		showHelp()
		return
	}

	const startTime = Date.now()
	const results = {}

	try {
		if (!options.filesOnly) {
			results.redis = await clearRedisCache()
			console.log('\n')
		}

		if (!options.redisOnly) {
			results.files = await clearFileCache()
			console.log('\n')
		}

		// Summary
		console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
		console.log('📋 Summary')
		console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

		if (results.redis) {
			if (results.redis.success) {
				console.log(`✅ Redis cache: Cleared ${results.redis.keysBefore} key(s)`)
			}
			else {
				console.log(`❌ Redis cache: Failed (${results.redis.error})`)
			}
		}

		if (results.files) {
			if (results.files.success) {
				console.log(`✅ File cache: Deleted ${results.files.deletedCount} file(s)`)
			}
			else {
				console.log(`❌ File cache: Failed (${results.files.error})`)
			}
		}

		const duration = Date.now() - startTime
		console.log(`⏱️  Total time: ${duration}ms`)

		console.log('\n')
		console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
		console.log('⚠️  IMPORTANT: Memory cache will be cleared')
		console.log('   when you restart the media stream server')
		console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
		console.log('\n')

		// Exit with appropriate code
		const hasFailures
			= (results.redis && !results.redis.success)
				|| (results.files && !results.files.success)

		process.exit(hasFailures ? 1 : 0)
	}
	catch (error) {
		console.error('\n')
		console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
		console.error('❌ Fatal Error')
		console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
		console.error(error)
		process.exit(1)
	}
}

// Run the script
clearMediaStreamCache().catch(console.error)
