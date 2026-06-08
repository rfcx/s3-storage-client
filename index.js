'use strict'

/**
 * @rfcx/s3-storage-client
 *
 * A thin, endpoint-aware AWS S3 client factory shared across RFCx Node
 * services. Its ONLY job is to construct an AWS SDK S3 client that points at
 * the in-cluster s3-proxy (which fronts the s3-reader / s3-writer storage
 * chain: MinIO-primary, B2 warm tier, AWS read-only, QNAP fallback) when an
 * endpoint is configured, and at vanilla AWS S3 when it is not.
 *
 * It deliberately does NOT reimplement any reader/writer/chain logic — that
 * lives entirely in-cluster (platform/routing/s3). This package only ensures
 * every service constructs its SDK client the same correct way instead of
 * each repo duplicating ~15 lines of endpoint/path-style wiring (and some
 * forgetting it, which causes direct-to-AWS bypasses of the chain).
 *
 * Endpoint resolution (first match wins), all overridable per-call:
 *   1. explicit opts.endpoint
 *   2. process.env[opts.endpointEnv]  (e.g. 'UPLOAD_S3_ENDPOINT')
 *   3. process.env.AWS_S3_ENDPOINT
 * Path-style resolution:
 *   1. explicit opts.forcePathStyle (boolean)
 *   2. process.env[opts.forcePathStyleEnv]
 *   3. process.env.AWS_S3_FORCE_PATH_STYLE === 'true'
 *
 * When no endpoint resolves, the returned config omits endpoint/path-style so
 * the SDK falls back to the default AWS endpoint for the region — i.e. the
 * pre-existing behavior. This makes adoption a no-op anywhere AWS_S3_ENDPOINT
 * is unset.
 */

function asBool (v) {
  return String(v == null ? '' : v).trim().toLowerCase() === 'true'
}

function firstDefined (...vals) {
  for (const v of vals) {
    if (v !== undefined && v !== null && String(v).trim() !== '') return v
  }
  return undefined
}

/**
 * Build a plain config object suitable for `new AWS.S3(config)` (SDK v2).
 *
 * @param {object} [opts]
 * @param {string} [opts.accessKeyId]
 * @param {string} [opts.secretAccessKey]
 * @param {string} [opts.region]
 * @param {string} [opts.endpoint]            explicit endpoint override
 * @param {string} [opts.endpointEnv]         env var name checked before AWS_S3_ENDPOINT
 * @param {boolean}[opts.forcePathStyle]      explicit path-style override
 * @param {string} [opts.forcePathStyleEnv]   env var name checked before AWS_S3_FORCE_PATH_STYLE
 * @param {object} [opts.extra]               any extra SDK config to merge (e.g. signatureVersion)
 * @returns {object} v2 S3 client config
 */
function getS3ClientConfig (opts = {}) {
  const cfg = {}

  if (opts.accessKeyId) cfg.accessKeyId = opts.accessKeyId
  if (opts.secretAccessKey) cfg.secretAccessKey = opts.secretAccessKey
  if (opts.region) cfg.region = opts.region

  const endpoint = firstDefined(
    opts.endpoint,
    opts.endpointEnv ? process.env[opts.endpointEnv] : undefined,
    process.env.AWS_S3_ENDPOINT
  )
  if (endpoint) {
    cfg.endpoint = String(endpoint).trim()
    // Path-style is required for almost every S3-compatible endpoint
    // (MinIO, the nginx s3-proxy, etc.) because virtual-host-style
    // (<bucket>.host) does not resolve. Honor an explicit value, else the
    // env, else default to true WHEN a custom endpoint is in play.
    const fps = firstDefined(
      typeof opts.forcePathStyle === 'boolean' ? opts.forcePathStyle : undefined,
      opts.forcePathStyleEnv ? process.env[opts.forcePathStyleEnv] : undefined,
      process.env.AWS_S3_FORCE_PATH_STYLE
    )
    cfg.s3ForcePathStyle = fps === undefined ? true : asBool(fps)
  }

  if (opts.extra && typeof opts.extra === 'object') {
    Object.assign(cfg, opts.extra)
  }
  return cfg
}

/**
 * Construct an AWS SDK v2 S3 client routed through the storage chain.
 * Requires `aws-sdk` to be installed in the host app (peer dependency).
 *
 * @param {object} [opts] same shape as getS3ClientConfig
 * @returns {import('aws-sdk').S3}
 */
function createS3Client (opts = {}) {
  // Lazy-require so a v3-only app that never calls this doesn't need aws-sdk.
  const AWS = require('aws-sdk')
  return new AWS.S3(getS3ClientConfig(opts))
}

/**
 * Build config for the AWS SDK v3 `new S3Client(config)`. v3 uses
 * `forcePathStyle` (not `s3ForcePathStyle`) and a nested `credentials` object.
 *
 * @param {object} [opts] same inputs as getS3ClientConfig
 * @returns {object} v3 S3Client config
 */
function getS3ClientConfigV3 (opts = {}) {
  const v2 = getS3ClientConfig(opts)
  const cfg = {}
  if (v2.region) cfg.region = v2.region
  if (v2.accessKeyId || v2.secretAccessKey) {
    cfg.credentials = {
      accessKeyId: v2.accessKeyId,
      secretAccessKey: v2.secretAccessKey
    }
  }
  if (v2.endpoint) {
    cfg.endpoint = v2.endpoint
    cfg.forcePathStyle = v2.s3ForcePathStyle !== false
  }
  return cfg
}

/**
 * Construct an AWS SDK v3 S3Client routed through the storage chain.
 * Requires `@aws-sdk/client-s3` to be installed in the host app.
 *
 * @param {object} [opts]
 * @returns {import('@aws-sdk/client-s3').S3Client}
 */
function createS3ClientV3 (opts = {}) {
  const { S3Client } = require('@aws-sdk/client-s3')
  return new S3Client(getS3ClientConfigV3(opts))
}

/**
 * True when a custom (proxy/MinIO) endpoint is configured — useful for
 * callers that branch behavior (e.g. skip canned ACLs on non-AWS backends).
 */
function isChainEndpoint (opts = {}) {
  return Boolean(firstDefined(
    opts.endpoint,
    opts.endpointEnv ? process.env[opts.endpointEnv] : undefined,
    process.env.AWS_S3_ENDPOINT
  ))
}

module.exports = {
  getS3ClientConfig,
  createS3Client,
  getS3ClientConfigV3,
  createS3ClientV3,
  isChainEndpoint
}
