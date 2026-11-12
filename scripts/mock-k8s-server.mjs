import { createServer } from 'node:http'

const TOKEN = process.env.MOCK_TOKEN || 'test-token'
const requestedPort = Number(process.env.MOCK_PORT || 0)
const VERSION = process.env.MOCK_VERSION || 'v1.31.4'
const PROFILE = process.env.MOCK_PROFILE || 'full'
const SEMVER = VERSION.replace(/^v/, '').split('.')

const startedAt = Date.now()
const iso = (msAgo) => new Date(startedAt - msAgo).toISOString()

const stats = {
  podsRequests: 0,
  versionRequests: 0,
  logsRequests: 0,
  unauthorized: 0,
  lastLogQuery: null
}

function containerStatus({ phase, ready, restarts, waitingReason, terminatedReason, image }) {
  const status = {
    name: 'main',
    image,
    imageID: 'docker://sha256:0000000000000000000000000000000000000000000000000000000000000000',
    ready,
    restartCount: restarts,
    started: phase === 'Running'
  }
  if (waitingReason) {
    status.state = { waiting: { reason: waitingReason, message: waitingReason } }
  } else if (terminatedReason) {
    status.state = {
      terminated: {
        reason: terminatedReason,
        exitCode: terminatedReason === 'Completed' ? 0 : 1,
        finishedAt: iso(60_000)
      }
    }
  } else if (phase === 'Running') {
    status.state = { running: { startedAt: iso(10 * 60_000) } }
  }
  return status
}

function makePod({
  namespace,
  name,
  phase = 'Running',
  ready = true,
  waitingReason,
  terminatedReason,
  restarts = 0,
  node = 'node-a',
  podIP,
  createdMinutesAgo = 10,
  terminating = false,
  image = 'ghcr.io/example/app:1.4.2'
}) {
  return {
    metadata: {
      name,
      namespace,
      uid: `${namespace}-${name}`,
      resourceVersion: '1042',
      creationTimestamp: iso(createdMinutesAgo * 60_000),
      labels: { app: name.split('-').slice(0, -2).join('-') || name },
      ...(terminating ? { deletionTimestamp: iso(5_000) } : {})
    },
    spec: {
      nodeName: node || undefined,
      containers: [{ name: 'main', image, imagePullPolicy: 'IfNotPresent' }]
    },
    status: {
      phase,
      podIP: podIP || undefined,
      containerStatuses: [
        containerStatus({ phase, ready, restarts, waitingReason, terminatedReason, image })
      ]
    }
  }
}

const pods = [
  makePod({
    namespace: 'kube-system',
    name: 'coredns-7f6c5b7c8f-2xk4p',
    node: 'node-a',
    podIP: '10.244.0.2',
    createdMinutesAgo: 4320,
    image: 'registry.k8s.io/coredns/coredns:v1.11.1'
  }),
  makePod({
    namespace: 'production',
    name: 'api-6f9c8d7b5-x2m4n',
    node: 'node-b',
    podIP: '10.244.1.15',
    createdMinutesAgo: 120,
    restarts: 23,
    ready: false,
    waitingReason: 'CrashLoopBackOff',
    image: 'ghcr.io/acme/api:2.8.0'
  }),
  makePod({
    namespace: 'production',
    name: 'worker-5d8f9c7b6-q8w2e',
    node: '',
    createdMinutesAgo: 1,
    restarts: 0,
    ready: false,
    waitingReason: 'ContainerCreating',
    phase: 'Pending',
    image: 'ghcr.io/acme/worker:2.8.0'
  }),
  makePod({
    namespace: 'production',
    name: 'batch-29012345-completed',
    phase: 'Succeeded',
    node: 'node-a',
    podIP: '10.244.0.90',
    createdMinutesAgo: 60,
    ready: false,
    terminatedReason: 'Completed',
    image: 'ghcr.io/acme/batch:1.0.0'
  }),
  makePod({
    namespace: 'monitoring',
    name: 'grafana-7d9f8b6c5-abc12',
    node: 'node-a',
    podIP: '10.244.0.22',
    createdMinutesAgo: 7200,
    restarts: 2,
    image: 'grafana/grafana:11.1.0'
  }),
  makePod({
    namespace: 'staging',
    name: 'web-6c7d8e9f0-zz123',
    node: 'node-b',
    podIP: '10.244.1.31',
    createdMinutesAgo: 45,
    ready: false,
    waitingReason: 'ImagePullBackOff',
    image: 'ghcr.io/acme/web:3.0.0-rc1'
  }),
  makePod({
    namespace: 'default',
    name: 'oom-demo-5f6g7h8i9-jkl34',
    phase: 'Failed',
    node: 'node-a',
    podIP: '10.244.0.44',
    createdMinutesAgo: 30,
    ready: false,
    terminatedReason: 'OOMKilled',
    image: 'ghcr.io/acme/memory-hog:0.1.0'
  }),
  makePod({
    namespace: 'production',
    name: 'old-release-7a8b9c0d1-mno56',
    node: 'node-b',
    podIP: '10.244.1.8',
    createdMinutesAgo: 240,
    terminating: true,
    image: 'ghcr.io/acme/api:2.7.4'
  })
]

/** Deterministic log stream ending at server start, ~80 lines at 20 s intervals. */
function generateLogs(pod, previous) {
  const name = pod.metadata.name
  const count = 80
  const lines = []
  for (let index = 0; index < count; index += 1) {
    const at = startedAt - (count - 1 - index) * 20_000
    const stamp = new Date(at).toISOString()
    let level = 'INFO'
    let message = `${name} tick=${index} serving on :8080`
    if (index === count - 3) {
      level = 'WARN'
      message = `${name} slow request 1203ms`
    } else if (index === count - 1) {
      level = 'ERROR'
      message = `${name} request failed: upstream timeout`
    }
    if (previous) {
      level = 'ERROR'
      message = `${name} previous instance crashed: simulated failure`
    }
    lines.push(`${stamp} ${level} ${message}`)
  }
  return lines
}

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

  if (request.headers.authorization !== `Bearer ${TOKEN}`) {
    stats.unauthorized += 1
    send(response, 401, {
      kind: 'Status',
      apiVersion: 'v1',
      status: 'Failure',
      message: 'Unauthorized — expected a valid bearer token',
      reason: 'Unauthorized',
      code: 401
    })
    return
  }

  if (url.pathname === '/version') {
    stats.versionRequests += 1
    send(response, 200, {
      major: SEMVER[0] ?? '1',
      minor: SEMVER[1] ?? '31',
      gitVersion: VERSION,
      gitCommit: '948afe5ca072329a73c8e79ed5934778f52141ac',
      gitTreeState: 'clean',
      buildDate: '2024-09-11T21:24:43Z',
      goVersion: 'go1.22.7',
      compiler: 'gc',
      platform: 'linux/arm64'
    })
    return
  }

  if (url.pathname === '/api/v1/pods' && request.method === 'GET') {
    stats.podsRequests += 1
    const items =
      PROFILE === 'healthy'
        ? pods.filter((pod) => {
            if (pod.metadata.deletionTimestamp) return false
            if (pod.status.phase !== 'Running' && pod.status.phase !== 'Succeeded') return false
            return !pod.status.containerStatuses?.some((status) => status.state?.waiting)
          })
        : PROFILE === 'small'
          ? pods.slice(0, 5)
          : pods
    setTimeout(() => {
      send(response, 200, {
        kind: 'PodList',
        apiVersion: 'v1',
        metadata: { resourceVersion: '1042' },
        items
      })
    }, 40)
    return
  }

  const logMatch = url.pathname.match(/^\/api\/v1\/namespaces\/([^/]+)\/pods\/([^/]+)\/log$/)
  if (logMatch && request.method === 'GET') {
    stats.logsRequests += 1
    const namespace = decodeURIComponent(logMatch[1])
    const podName = decodeURIComponent(logMatch[2])
    const container = url.searchParams.get('container')
    const previous = url.searchParams.get('previous') === 'true'
    const timestamps = url.searchParams.get('timestamps') === 'true'
    const tailLines = Number(url.searchParams.get('tailLines') || 0)
    const sinceSeconds = Number(url.searchParams.get('sinceSeconds') || 0)
    const limitBytes = Number(url.searchParams.get('limitBytes') || 0)
    stats.lastLogQuery = { namespace, podName, container, previous, timestamps, tailLines, sinceSeconds, limitBytes }

    const pod = pods.find(
      (item) => item.metadata.namespace === namespace && item.metadata.name === podName
    )
    if (!pod) {
      send(response, 404, {
        kind: 'Status',
        apiVersion: 'v1',
        status: 'Failure',
        message: `pods "${podName}" not found`,
        reason: 'NotFound',
        code: 404
      })
      return
    }
    if (container && container !== 'main') {
      send(response, 400, {
        kind: 'Status',
        apiVersion: 'v1',
        status: 'Failure',
        message: `container ${container} is not valid for pod ${podName}`,
        reason: 'BadRequest',
        code: 400
      })
      return
    }
    if (previous && (pod.status.containerStatuses?.[0]?.restartCount ?? 0) === 0) {
      send(response, 400, {
        kind: 'Status',
        apiVersion: 'v1',
        status: 'Failure',
        message: `previous terminated container "main" in pod "${podName}" not found`,
        reason: 'BadRequest',
        code: 400
      })
      return
    }

    let lines = generateLogs(pod, previous)
    if (sinceSeconds > 0) {
      const cutoff = Date.now() - sinceSeconds * 1000
      lines = lines.filter((line) => Date.parse(line.slice(0, line.indexOf(' '))) >= cutoff)
    }
    if (tailLines > 0) lines = lines.slice(-tailLines)
    let body = lines.length > 0 ? `${lines.join('\n')}\n` : ''
    if (!timestamps) body = body.replace(/^\S+ /gm, '')
    if (limitBytes > 0) body = Buffer.from(body).subarray(0, limitBytes).toString('utf8')

    response.writeHead(200, {
      'content-type': 'text/plain',
      'content-length': Buffer.byteLength(body)
    })
    response.end(body)
    return
  }

  send(response, 404, {
    kind: 'Status',
    apiVersion: 'v1',
    status: 'Failure',
    message: `The server could not find the requested resource: ${url.pathname}`,
    reason: 'NotFound',
    code: 404
  })
})

server.listen(requestedPort, '127.0.0.1', () => {
  const address = server.address()
  console.log(
    `mock-k8s listening on http://127.0.0.1:${address.port} (${VERSION}, ${PROFILE})`
  )
  console.log(`mock-k8s bearer token: ${TOKEN}`)
})

const shutdown = () => server.close(() => process.exit(0))
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
