declare module '@rfcx/s3-storage-client' {
  export interface S3ClientFactoryOptions {
    /** Access key id. Omit to use the SDK default credential chain. */
    accessKeyId?: string
    /** Secret access key. */
    secretAccessKey?: string
    /** AWS region. */
    region?: string
    /** Explicit endpoint override. Highest precedence. */
    endpoint?: string
    /** Env var name checked for an endpoint before falling back to AWS_S3_ENDPOINT (e.g. 'UPLOAD_S3_ENDPOINT'). */
    endpointEnv?: string
    /** Explicit force-path-style override. */
    forcePathStyle?: boolean
    /** Env var name checked for path-style before AWS_S3_FORCE_PATH_STYLE. */
    forcePathStyleEnv?: string
    /** Extra SDK config merged into the result (e.g. { signatureVersion: 'v4' }). */
    extra?: Record<string, unknown>
  }

  /** Build a v2 `new AWS.S3(config)` config object (endpoint-aware). */
  export function getS3ClientConfig (opts?: S3ClientFactoryOptions): Record<string, unknown>

  /** Construct an endpoint-aware AWS SDK v2 S3 client. Requires `aws-sdk`. */
  export function createS3Client (opts?: S3ClientFactoryOptions): any

  /** Build a v3 `new S3Client(config)` config object (endpoint-aware). */
  export function getS3ClientConfigV3 (opts?: S3ClientFactoryOptions): Record<string, unknown>

  /** Construct an endpoint-aware AWS SDK v3 S3Client. Requires `@aws-sdk/client-s3`. */
  export function createS3ClientV3 (opts?: S3ClientFactoryOptions): any

  /** True when a custom (proxy/MinIO) endpoint is configured. */
  export function isChainEndpoint (opts?: S3ClientFactoryOptions): boolean
}