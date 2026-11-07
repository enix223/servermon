import { createHmac } from 'node:crypto'
import { createServer } from 'node:http'

/**
 * Mock Alibaba Cloud ECS OpenAPI (RPC style) server.
 *
 * It verifies the Signature Version 1.0 signature independently of the app
 * implementation, so a signing bug on either side is caught. Only the
 * DescribeInstances action is implemented.
 */

const ACCESS_KEY_ID = process.env.MOCK_ACCESS_KEY_ID || 'test-access-key-id'
const ACCESS_KEY_SECRET = process.env.MOCK_ACCESS_KEY_SECRET || 'test-access-key-secret'
const REGION_ID = process.env.MOCK_REGION_ID || 'cn-hangzhou'
const PROFILE = process.env.MOCK_PROFILE || 'full'
const requestedPort = Number(process.env.MOCK_PORT || 0)

const startedAt = Date.now()
const iso = (msAgo) => new Date(startedAt - msAgo).toISOString()

const stats = { describeRequests: 0, unauthorized: 0, badSignature: 0 }

/** RFC 3986 encoding with only `A-Z a-z 0-9 - _ . ~` left unescaped. */
function percentEncode(value) {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  )
}

function canonicalizedQueryString(params) {
  return Object.keys(params)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(params[key])}`)
    .join('&')
}

function expectedSignature(params) {
  const { Signature: _signature, ...rest } = params
  const stringToSign = `GET&${percentEncode('/')}&${percentEncode(canonicalizedQueryString(rest))}`
  return createHmac('sha1', `${ACCESS_KEY_SECRET}&`).update(stringToSign, 'utf8').digest('base64')
}

function makeInstance({
  instanceId,
  name,
  status,
  instanceType,
  cpu,
  memory,
  osName,
  zoneId,
  privateIp,
  publicIp = '',
  chargeType = 'PostPaid',
  createdDaysAgo = 30
}) {
  return {
    InstanceId: instanceId,
    InstanceName: name,
    InstanceType: instanceType,
    Status: status,
    OSName: osName,
    OSType: osName.toLowerCase().includes('windows') ? 'windows' : 'linux',
    Cpu: cpu,
    Memory: memory,
    RegionId: REGION_ID,
    ZoneId: zoneId,
    PrivateIpAddress: privateIp,
    PublicIpAddress: publicIp,
    ChargeType: chargeType,
    HostName: name,
    VpcId: 'vpc-bp67acfmxazb4pmock',
    CreationTime: iso(createdDaysAgo * 24 * 60 * 60 * 1000),
    ExpiredTime: chargeType === 'PrePaid' ? iso(200 * 24 * 60 * 60 * 1000) : ''
  }
}

const instances = [
  makeInstance({
    instanceId: 'i-bp1mock00000001',
    name: 'web-frontend-01',
    status: 'Running',
    instanceType: 'ecs.g7.large',
    cpu: 2,
    memory: 8192,
    osName: 'Alibaba Cloud Linux 3 64位',
    zoneId: 'cn-hangzhou-h',
    privateIp: '172.16.0.11',
    publicIp: '47.100.1.11'
  }),
  makeInstance({
    instanceId: 'i-bp1mock00000002',
    name: 'web-frontend-02',
    status: 'Running',
    instanceType: 'ecs.g7.large',
    cpu: 2,
    memory: 8192,
    osName: 'Alibaba Cloud Linux 3 64位',
    zoneId: 'cn-hangzhou-h',
    privateIp: '172.16.0.12',
    publicIp: '47.100.1.12'
  }),
  makeInstance({
    instanceId: 'i-bp1mock00000003',
    name: 'api-gateway-01',
    status: 'Running',
    instanceType: 'ecs.c7.xlarge',
    cpu: 4,
    memory: 8192,
    osName: 'Alibaba Cloud Linux 3 64位',
    zoneId: 'cn-hangzhou-i',
    privateIp: '172.16.1.21',
    publicIp: '47.100.1.21',
    chargeType: 'PrePaid'
  }),
  makeInstance({
    instanceId: 'i-bp1mock00000004',
    name: 'batch-worker-01',
    status: 'Stopped',
    instanceType: 'ecs.e-c1m1.large',
    cpu: 2,
    memory: 2048,
    osName: 'Ubuntu 22.04 64位',
    zoneId: 'cn-hangzhou-h',
    privateIp: '172.16.0.31'
  }),
  makeInstance({
    instanceId: 'i-bp1mock00000005',
    name: 'legacy-db-01',
    status: 'Starting',
    instanceType: 'ecs.r6.large',
    cpu: 2,
    memory: 16384,
    osName: 'CentOS 7.9 64位',
    zoneId: 'cn-hangzhou-i',
    privateIp: '172.16.1.41'
  }),
  makeInstance({
    instanceId: 'i-bp1mock00000006',
    name: 'windows-build-01',
    status: 'Running',
    instanceType: 'ecs.g7.xlarge',
    cpu: 4,
    memory: 16384,
    osName: 'Windows Server 2022 64位',
    zoneId: 'cn-hangzhou-j',
    privateIp: '172.16.2.51',
    publicIp: '47.100.1.51'
  })
]

function send(response, statusCode, body) {
  const payload = JSON.stringify(body)
  response.writeHead(statusCode, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload)
  })
  response.end(payload)
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1')

  if (url.pathname === '/stats') {
    send(response, 200, stats)
    return
  }

  const params = Object.fromEntries(url.searchParams.entries())

  if (params.AccessKeyId !== ACCESS_KEY_ID) {
    stats.unauthorized += 1
    send(response, 400, {
      RequestId: 'mock-request-id',
      HostId: params.AccessKeyId ?? 'unknown',
      Code: 'InvalidAccessKeyId.NotFound',
      Message: 'Specified access key is not found.'
    })
    return
  }

  if (params.Signature !== expectedSignature(params)) {
    stats.badSignature += 1
    send(response, 400, {
      RequestId: 'mock-request-id',
      HostId: params.AccessKeyId,
      Code: 'SignatureDoesNotMatch',
      Message: 'Specified signature is not matched with our calculation.'
    })
    return
  }

  if (params.Action !== 'DescribeInstances') {
    send(response, 400, {
      RequestId: 'mock-request-id',
      Code: 'InvalidAction.NotFound',
      Message: `The action "${params.Action}" is not supported by this mock server.`
    })
    return
  }

  if (params.RegionId !== REGION_ID) {
    send(response, 400, {
      RequestId: 'mock-request-id',
      Code: 'InvalidRegionId',
      Message: `The specified region "${params.RegionId}" is not valid.`
    })
    return
  }

  stats.describeRequests += 1

  const items =
    PROFILE === 'small'
      ? instances.slice(0, 3)
      : PROFILE === 'empty'
        ? []
        : instances

  setTimeout(() => {
    send(response, 200, {
      RequestId: 'mock-request-id',
      TotalCount: items.length,
      PageNumber: 1,
      PageSize: Number(params.MaxResults ?? 10),
      Instances: { Instance: items }
    })
  }, 30)
})

server.listen(requestedPort, '127.0.0.1', () => {
  const address = server.address()
  console.log(
    `mock-aliyun-ecs listening on http://127.0.0.1:${address.port} (${REGION_ID}, ${PROFILE})`
  )
  console.log(`mock-aliyun-ecs access key id: ${ACCESS_KEY_ID}`)
  console.log(`mock-aliyun-ecs access key secret: ${ACCESS_KEY_SECRET}`)
})

const shutdown = () => server.close(() => process.exit(0))
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
