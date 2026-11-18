import http from 'k6/http'
import { check, sleep } from 'k6'

const rawBaseUrl = __ENV.BASE_URL

if (!rawBaseUrl) {
  throw new Error('BASE_URL is required; point this test at an isolated staging environment.')
}
if (!/^https?:\/\//i.test(rawBaseUrl)) {
  throw new Error('BASE_URL must use HTTP or HTTPS.')
}
if (rawBaseUrl.includes('app-ingles.jnmtortas.com')) {
  throw new Error('Production host is blocked. Load tests must target isolated staging only.')
}

const baseUrl = rawBaseUrl.replace(/\/$/, '')

export const options = {
  vus: Number(__ENV.VUS || '1'),
  duration: __ENV.DURATION || '30s',
  thresholds: {
    checks: ['rate==1'],
  },
}

export default function () {
  const response = http.get(`${baseUrl}/health`, {
    timeout: '5s',
    tags: { endpoint: 'bff-health' },
  })

  check(response, {
    'BFF health returns HTTP 200': (result) => result.status === 200,
    'BFF health body is present': (result) => String(result.body || '').length > 0,
  })

  sleep(1)
}
