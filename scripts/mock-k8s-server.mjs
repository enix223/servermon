import { createServer } from 'node:http'

const TOKEN = process.env.MOCK_TOKEN || 'test-token'
const requestedPort = Number(process.env.MOCK_PORT || 0)

const startedAt = Date.now()
const iso = (msAgo) => new Date(startedAt - msAgo).toISOString()

const stats = { podsRequests: 0, versionRequests: 0, unauthorized: 0 }

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
      major: '1',
      minor: '31',
      gitVersion: 'v1.31.4',
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
    setTimeout(() => {
      send(response, 200, {
        kind: 'PodList',
        apiVersion: 'v1',
        metadata: { resourceVersion: '1042' },
        items: pods
      })
    }, 40)
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
  console.log(`mock-k8s listening on http://127.0.0.1:${address.port}`)
  console.log(`mock-k8s bearer token: ${TOKEN}`)
})

const shutdown = () => server.close(() => process.exit(0))
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
