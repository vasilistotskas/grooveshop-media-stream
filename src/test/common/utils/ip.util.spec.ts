import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { getClientIp, isInternalIp, TRUSTED_PROXY_HOPS } from '#microservice/common/utils/ip.util'

describe('ip.util', () => {
	describe('tRUSTED_PROXY_HOPS', () => {
		// Real Express resolution: the supertest socket plays Traefik.
		const app = express()
		app.set('trust proxy', TRUSTED_PROXY_HOPS)
		app.get('/', (req, res) => {
			res.send(getClientIp(req))
		})

		it.each([
			['a Cloudflare visitor', '203.0.113.7, 162.158.1.1', '203.0.113.7'],
			['a visitor that prepends its own entries', '6.6.6.6, 10.0.0.1, 203.0.113.7, 162.158.1.1', '203.0.113.7'],
			['a direct caller (Traefik replaced its header)', '198.51.100.9', '198.51.100.9'],
		])('should resolve %s', async (_case, forwardedFor, expected) => {
			const res = await request(app).get('/').set('X-Forwarded-For', forwardedFor)
			expect(res.text).toBe(expected)
		})

		it('should keep an in-cluster caller as the socket address', async () => {
			const res = await request(app).get('/')
			expect(isInternalIp(res.text)).toBe(true)
		})
	})

	describe('getClientIp', () => {
		it('should prefer req.ip', () => {
			expect(getClientIp({ ip: '1.2.3.4', socket: { remoteAddress: '5.6.7.8' } })).toBe('1.2.3.4')
		})

		it('should fall back to socket.remoteAddress', () => {
			expect(getClientIp({ socket: { remoteAddress: '5.6.7.8' } })).toBe('5.6.7.8')
		})

		it('should fall back to connection.remoteAddress', () => {
			expect(getClientIp({ connection: { remoteAddress: '9.10.11.12' } })).toBe('9.10.11.12')
		})

		it('should return "unknown" when nothing is available', () => {
			expect(getClientIp({})).toBe('unknown')
		})
	})

	describe('isInternalIp', () => {
		it.each([
			['127.0.0.1', true],
			['::1', true],
			['::ffff:127.0.0.1', true],
			['10.0.0.1', true],
			['10.255.255.255', true],
			['172.16.0.1', true],
			['172.31.255.254', true],
			['192.168.1.1', true],
			['::ffff:10.1.2.3', true],
		])('should treat %s as internal', (ip, expected) => {
			expect(isInternalIp(ip)).toBe(expected)
		})

		it.each([
			['8.8.8.8', false],
			['172.15.0.1', false],
			['172.32.0.1', false],
			['192.169.0.1', false],
			['11.0.0.1', false],
			['2001:db8::1', false],
			['unknown', false],
			['', false],
			['10.0.0', false],
			['not-an-ip', false],
		])('should treat %s as external', (ip, expected) => {
			expect(isInternalIp(ip)).toBe(expected)
		})
	})
})
