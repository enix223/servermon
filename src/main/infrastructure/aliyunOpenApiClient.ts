import { createHmac, randomUUID } from 'node:crypto'

/**
 * Minimal Alibaba Cloud OpenAPI (RPC style) client.
 *
 * Implements Signature Version 1.0 as documented by Alibaba Cloud:
 *   https://help.aliyun.com/en/kms/key-management-service/request-signatures-3
 *
 * The signing steps are:
 *   1. Sort the request parameters by name and build a canonicalized query
 *      string of percent-encoded `name=value` pairs joined by `&`.
 *   2. `StringToSign = METHOD + "&" + percentEncode("/") + "&" + percentEncode(canonicalizedQueryString)`
 *   3. `Signature = Base64(HMAC-SHA1(AccessKeySecret + "&", StringToSign))`
 *
 * Only the ECS operations ServerMon needs are exposed, so this stays small
 * enough to audit. It replaces the heavyweight Alibaba Cloud SDK packages.
 */

const SIGNATURE_METHOD = 'HMAC-SHA1'
const SIGNATURE_VERSION = '1.0'
const API_FORMAT = 'JSON'
const REQUEST_TIMEOUT_MS = 20_000

export interface AliyunCredentials {
  accessKeyId: string
  accessKeySecret: string
}

export interface AliyunClientOptions {
  regionId: string
  /** Base URL override; falls back to the regional ECS endpoint. */
  endpoint?: string | null
  /** API version of the target product (ECS). */
  version?: string
}

/** An error returned by the Alibaba Cloud API. */
export class AliyunApiError extends Error {
  readonly code: string | null
  readonly requestId: string | null
  readonly httpStatus: number | null

  constructor(
    message: string,
    code: string | null,
    requestId: string | null,
    httpStatus: number | null
  ) {
    super(message)
    this.name = 'AliyunApiError'
    this.code = code
    this.requestId = requestId
    this.httpStatus = httpStatus
  }
}

/**
 * Percent-encodes a value per RFC 3986 with only `A-Z a-z 0-9 - _ . ~`
 * left unescaped — the encoding Alibaba Cloud expects for signatures.
 *
 * `encodeURIComponent` additionally leaves `! * ' ( )` untouched, so those are
 * encoded explicitly.
 */
export function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  )
}

/** Builds the canonicalized query string: sorted, percent-encoded name=value pairs. */
export function canonicalizedQueryString(params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(params[key])}`)
    .join('&')
}

/** Signs a request and returns the base64 signature. */
export function signRequest(
  method: string,
  params: Record<string, string>,
  accessKeySecret: string
): string {
  const stringToSign = `${method}&${percentEncode('/')}&${percentEncode(
    canonicalizedQueryString(params)
  )}`
  return createHmac('sha1', `${accessKeySecret}&`).update(stringToSign, 'utf8').digest('base64')
}

/** Alibaba Cloud expects `YYYY-MM-DDTHH:mm:ssZ` in UTC. */
export function formatTimestamp(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function toQueryString(params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(params[key])}`)
    .join('&')
}

function stringifyParams(
  params: Record<string, string | number | boolean | undefined>
): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    result[key] = typeof value === 'boolean' ? String(value) : String(value)
  }
  return result
}

/** Reads a human-readable message out of an Alibaba Cloud error body. */
function extractApiMessage(body: unknown): { code: string | null; message: string | null } {
  if (!body || typeof body !== 'object') return { code: null, message: null }
  const record = body as {
    Code?: unknown
    Message?: unknown
    RequestId?: unknown
    Error?: { Code?: unknown; Message?: unknown }
  }
  const code =
    typeof record.Code === 'string'
      ? record.Code
      : typeof record.Error?.Code === 'string'
        ? record.Error.Code
        : null
  const message =
    typeof record.Message === 'string'
      ? record.Message
      : typeof record.Error?.Message === 'string'
        ? record.Error.Message
        : null
  return { code, message }
}

const CODE_HINTS: Record<string, string> = {
  InvalidAccessKeyId: 'the AccessKey ID does not exist — check the credentials',
  'InvalidAccessKeyId.NotFound': 'the AccessKey ID does not exist — check the credentials',
  SignatureDoesNotMatch:
    'the signature does not match — check the AccessKey secret and the system clock',
  Forbidden: 'the credentials are not allowed to list ECS instances in this region',
  InvalidRegionId: 'the region id is not valid — check the region, e.g. cn-hangzhou',
  RequestThrottled: 'the API is rate limited — try again in a moment',
  InvalidParameter: 'the API rejected one of the request parameters'
}

/** Turns an API error into a message a user can act on. */
export function describeAliyunError(error: unknown): string {
  if (error instanceof AliyunApiError) {
    const hint = error.code ? CODE_HINTS[error.code] : null
    const detail = error.message ?? 'The request failed.'
    const base = hint ? `${hint}: ${detail}` : detail
    return error.code ? `${base} (${error.code})` : base
  }

  const anyError = error as { cause?: { code?: string; message?: string }; message?: string }
  const causeCode = anyError?.cause?.code ?? null
  if (causeCode === 'ENOTFOUND' || causeCode === 'EAI_AGAIN') {
    return 'Cannot resolve the Alibaba Cloud endpoint — check the region or network access.'
  }
  if (causeCode === 'ECONNREFUSED') {
    return 'Connection refused by the Alibaba Cloud endpoint.'
  }
  if (causeCode === 'ETIMEDOUT' || causeCode === 'UND_ERR_CONNECT_TIMEOUT') {
    return 'Connection to Alibaba Cloud timed out — check network access.'
  }
  if (causeCode === 'CERT_HAS_EXPIRED' || causeCode === 'DEPTH_ZERO_SELF_SIGNED_CERT') {
    return 'TLS verification failed for the Alibaba Cloud endpoint.'
  }
  return error instanceof Error ? error.message : String(error ?? 'Unknown error')
}

/** Thin OpenAPI transport. Signing, HTTP, and error shaping only. */
export class AliyunOpenApiClient {
  private readonly credentials: AliyunCredentials
  private readonly options: AliyunClientOptions

  constructor(credentials: AliyunCredentials, options: AliyunClientOptions) {
    this.credentials = credentials
    this.options = options
  }

  private get baseUrl(): string {
    const endpoint = this.options.endpoint?.trim()
    if (endpoint) return endpoint.replace(/\/+$/, '')
    return `https://ecs.${this.options.regionId}.aliyuncs.com`
  }

  /** Signs and performs an RPC-style GET request, returning the parsed JSON body. */
  async request<T>(
    action: string,
    params: Record<string, string | number | boolean | undefined> = {},
    signal?: AbortSignal
  ): Promise<T> {
    const query: Record<string, string> = {
      ...stringifyParams(params),
      Action: action,
      Format: API_FORMAT,
      Version: this.options.version ?? '2014-05-26',
      AccessKeyId: this.credentials.accessKeyId,
      SignatureMethod: SIGNATURE_METHOD,
      SignatureVersion: SIGNATURE_VERSION,
      SignatureNonce: randomUUID(),
      Timestamp: formatTimestamp(new Date()),
      RegionId: this.options.regionId
    }

    query.Signature = signRequest('GET', query, this.credentials.accessKeySecret)

    const url = `${this.baseUrl}/?${toQueryString(query)}`

    let response: Response
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal: signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      })
    } catch (error) {
      throw new Error(describeAliyunError(error), { cause: error })
    }

    const text = await response.text()
    let body: unknown = null
    if (text) {
      try {
        body = JSON.parse(text)
      } catch {
        body = null
      }
    }

    if (!response.ok) {
      const { code, message } = extractApiMessage(body)
      throw new AliyunApiError(
        message ?? `The Alibaba Cloud API returned HTTP ${response.status}.`,
        code,
        typeof (body as { RequestId?: unknown })?.RequestId === 'string'
          ? (body as { RequestId: string }).RequestId
          : null,
        response.status
      )
    }

    if (!body) {
      throw new AliyunApiError(
        'The Alibaba Cloud API returned a response that could not be parsed as JSON.',
        null,
        null,
        response.status
      )
    }

    return body as T
  }
}
