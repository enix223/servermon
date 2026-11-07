/**
 * Verifies the Alibaba Cloud RPC signature implementation against the worked
 * example in the official Alibaba Cloud request-signature documentation:
 *   https://help.aliyun.com/en/kms/key-management-service/request-signatures-3
 *
 * Run with: node --experimental-strip-types scripts/verify-aliyun-signature.ts
 */
import {
  canonicalizedQueryString,
  formatTimestamp,
  percentEncode,
  signRequest
} from '../src/main/infrastructure/aliyunOpenApiClient.ts'

const params: Record<string, string> = {
  Action: 'CreateKey',
  SignatureVersion: '1.0',
  Format: 'json',
  Version: '2016-01-20',
  AccessKeyId: 'testid',
  SignatureMethod: 'HMAC-SHA1',
  Timestamp: '2016-03-28T03:13:08Z'
}

const expectedStringToSign =
  'GET&%2F&AccessKeyId%3Dtestid%26Action%3DCreateKey%26Format%3Djson%26SignatureMethod%3DHMAC-SHA1%26SignatureVersion%3D1.0%26Timestamp%3D2016-03-28T03%253A13%253A08Z%26Version%3D2016-01-20'

const expectedSignaturePrefix = '41wk2SSX1GJh7fwnc5eqOfiJPF'

const stringToSign = `GET&${percentEncode('/')}&${percentEncode(
  canonicalizedQueryString(params)
)}`
const signature = signRequest('GET', params, 'testsecret')

let failed = false

function check(label: string, actual: string, expected: string): void {
  const ok = actual === expected
  if (!ok) failed = true
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) {
    console.log(`  expected: ${expected}`)
    console.log(`  actual:   ${actual}`)
  }
}

function checkPrefix(label: string, actual: string, expected: string): void {
  const ok = actual.startsWith(expected)
  if (!ok) failed = true
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) {
    console.log(`  expected prefix: ${expected}`)
    console.log(`  actual:          ${actual}`)
  }
}

check('StringToSign matches the Alibaba Cloud documentation', stringToSign, expectedStringToSign)
checkPrefix('Signature matches the Alibaba Cloud documentation', signature, expectedSignaturePrefix)

check('percentEncode leaves unreserved characters alone', percentEncode('a-b_c.d~e'), 'a-b_c.d~e')
check('percentEncode escapes reserved characters', percentEncode("a!*'() b"), 'a%21%2A%27%28%29%20b')
check(
  'formatTimestamp drops milliseconds',
  formatTimestamp(new Date('2024-01-01T00:00:00.123Z')),
  '2024-01-01T00:00:00Z'
)

if (failed) {
  console.error('\nSignature verification FAILED.')
  process.exit(1)
}

console.log('\nSignature verification passed.')
