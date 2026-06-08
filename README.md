# @rfcx/s3-storage-client

A thin, **endpoint-aware** AWS S3 client factory shared across RFCx Node
services.

Its only job is to construct an AWS SDK S3 client that points at the in-cluster
**s3-proxy** (which fronts the `s3-reader` / `s3-writer` storage chain:
MinIO-primary, Backblaze B2 warm tier, AWS read-only snapshot, QNAP fallback)
when an endpoint is configured — and at vanilla AWS S3 when it is not.

It does **not** reimplement any reader/writer/chain logic. That lives entirely
in-cluster (`platform/routing/s3` in the rfcx-local repo). This package only
ensures every service constructs its SDK client the same correct way, instead
of each repo duplicating the endpoint / path-style wiring (and some forgetting
it — which silently bypasses the chain and hits AWS S3 directly).

## Why

`s3-proxy` presents a standard S3 API and routes by HTTP method:

```
GET / HEAD            -> s3-reader  (disk cache + provider chain, read-through writeback)
PUT / POST / DELETE   -> s3-writer  (fan-out to writeThrough/deleteThrough layers)
```

So pointing the SDK's `endpoint` at `https://s3.arbimon.org` (or the in-cluster
`https://s3-proxy.edge.svc.cluster.local`) routes all existing
`getObject`/`putObject`/`deleteObject`/`getSignedUrl` calls through the chain
with **no call-site changes**.

## Install

Published from GitHub (same pattern as `@rfcx/message-queue`):

```json
"@rfcx/s3-storage-client": "github:rfcx/s3-storage-client#1.0.0"
```

`aws-sdk` (v2) and/or `@aws-sdk/client-s3` (v3) are optional peer dependencies —
provide whichever your app already uses.

## Usage (AWS SDK v2)

```js
const { createS3Client } = require('@rfcx/s3-storage-client')

// Reads AWS_S3_ENDPOINT + AWS_S3_FORCE_PATH_STYLE from the environment.
const s3 = createS3Client({
  accessKeyId: config('aws').accessKeyId,
  secretAccessKey: config('aws').secretAccessKey,
  region: config('aws').region
})

s3.getObject({ Bucket: 'arbimon2', Key: key }).createReadStream()
```

### Per-bucket endpoint (e.g. an R2 upload bucket alongside the chain)

```js
const uploadClient = createS3Client({
  endpointEnv: 'UPLOAD_S3_ENDPOINT',           // checked before AWS_S3_ENDPOINT
  forcePathStyleEnv: 'UPLOAD_S3_FORCE_PATH_STYLE',
  accessKeyId: process.env.UPLOAD_S3_ACCESS_KEY_ID,
  secretAccessKey: process.env.UPLOAD_S3_SECRET_ACCESS_KEY,
  region: process.env.UPLOAD_S3_REGION_ID
})
```

## Usage (AWS SDK v3)

```js
const { createS3ClientV3 } = require('@rfcx/s3-storage-client')
const s3 = createS3ClientV3({ accessKeyId, secretAccessKey, region })
```

## Endpoint / path-style resolution

Endpoint (first non-empty wins): `opts.endpoint` → `process.env[opts.endpointEnv]`
→ `process.env.AWS_S3_ENDPOINT`.

Path-style: `opts.forcePathStyle` → `process.env[opts.forcePathStyleEnv]` →
`process.env.AWS_S3_FORCE_PATH_STYLE`; defaults to **true whenever a custom
endpoint is in play** (required for MinIO / nginx proxy).

When no endpoint resolves, endpoint/path-style are omitted entirely — the SDK
uses the default AWS endpoint for the region. Adoption is therefore a no-op
anywhere `AWS_S3_ENDPOINT` is unset.

## TLS note (in-cluster)

`s3.arbimon.org` / `s3-proxy` use a certificate signed by the internal CA.
Node honors `NODE_EXTRA_CA_CERTS`; the AWS SDK honors `AWS_CA_BUNDLE`. Both are
mounted in the deployed pods (`/etc/rfcx-ca/ca.crt`). A plain `curl` without
`--cacert /etc/rfcx-ca/ca.crt` will fail TLS verification even though the SDK
path works.

## API

| export | description |
|---|---|
| `getS3ClientConfig(opts)` | v2 config object for `new AWS.S3(...)` |
| `createS3Client(opts)` | constructed v2 `AWS.S3` (requires `aws-sdk`) |
| `getS3ClientConfigV3(opts)` | v3 config object for `new S3Client(...)` |
| `createS3ClientV3(opts)` | constructed v3 `S3Client` (requires `@aws-sdk/client-s3`) |
| `isChainEndpoint(opts)` | `true` when a custom endpoint is configured |
