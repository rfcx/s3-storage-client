const {
  getS3ClientConfig,
  getS3ClientConfigV3,
  createS3Client,
  isChainEndpoint
} = require('./index')

const ENV_KEYS = [
  'AWS_S3_ENDPOINT',
  'AWS_S3_FORCE_PATH_STYLE',
  'UPLOAD_S3_ENDPOINT',
  'UPLOAD_S3_FORCE_PATH_STYLE'
]

describe('@rfcx/s3-storage-client', () => {
  let saved
  beforeEach(() => {
    saved = {}
    for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k] }
  })
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  })

  describe('getS3ClientConfig (v2)', () => {
    test('no endpoint anywhere => default AWS behavior (no endpoint/path-style)', () => {
      const cfg = getS3ClientConfig({ accessKeyId: 'a', secretAccessKey: 'b', region: 'eu-west-1' })
      expect(cfg.endpoint).toBeUndefined()
      expect(cfg.s3ForcePathStyle).toBeUndefined()
      expect(cfg).toMatchObject({ accessKeyId: 'a', secretAccessKey: 'b', region: 'eu-west-1' })
    })

    test('AWS_S3_ENDPOINT set => endpoint applied + path-style defaults true', () => {
      process.env.AWS_S3_ENDPOINT = 'https://s3.arbimon.org'
      const cfg = getS3ClientConfig({ region: 'us-east-1' })
      expect(cfg.endpoint).toBe('https://s3.arbimon.org')
      expect(cfg.s3ForcePathStyle).toBe(true)
    })

    test('AWS_S3_FORCE_PATH_STYLE=false respected when endpoint set', () => {
      process.env.AWS_S3_ENDPOINT = 'https://s3.arbimon.org'
      process.env.AWS_S3_FORCE_PATH_STYLE = 'false'
      const cfg = getS3ClientConfig({})
      expect(cfg.s3ForcePathStyle).toBe(false)
    })

    test('explicit endpoint overrides env', () => {
      process.env.AWS_S3_ENDPOINT = 'https://env.example'
      const cfg = getS3ClientConfig({ endpoint: 'https://explicit.example' })
      expect(cfg.endpoint).toBe('https://explicit.example')
    })

    test('endpointEnv (e.g. UPLOAD_S3_ENDPOINT) takes precedence over AWS_S3_ENDPOINT', () => {
      process.env.AWS_S3_ENDPOINT = 'https://default.example'
      process.env.UPLOAD_S3_ENDPOINT = 'https://upload.example'
      const cfg = getS3ClientConfig({ endpointEnv: 'UPLOAD_S3_ENDPOINT' })
      expect(cfg.endpoint).toBe('https://upload.example')
    })

    test('explicit forcePathStyle=false wins over default-true', () => {
      const cfg = getS3ClientConfig({ endpoint: 'https://x', forcePathStyle: false })
      expect(cfg.s3ForcePathStyle).toBe(false)
    })

    test('extra config is merged', () => {
      const cfg = getS3ClientConfig({ endpoint: 'https://x', extra: { signatureVersion: 'v4' } })
      expect(cfg.signatureVersion).toBe('v4')
    })

    test('empty-string env values are ignored (treated as unset)', () => {
      process.env.AWS_S3_ENDPOINT = '   '
      const cfg = getS3ClientConfig({ region: 'us-east-1' })
      expect(cfg.endpoint).toBeUndefined()
    })
  })

  describe('getS3ClientConfigV3', () => {
    test('maps to v3 shape (credentials nested, forcePathStyle key)', () => {
      process.env.AWS_S3_ENDPOINT = 'https://s3.arbimon.org'
      const cfg = getS3ClientConfigV3({ accessKeyId: 'a', secretAccessKey: 'b', region: 'us-east-1' })
      expect(cfg.endpoint).toBe('https://s3.arbimon.org')
      expect(cfg.forcePathStyle).toBe(true)
      expect(cfg.credentials).toEqual({ accessKeyId: 'a', secretAccessKey: 'b' })
      expect(cfg.s3ForcePathStyle).toBeUndefined()
    })

    test('no endpoint => no endpoint/forcePathStyle keys', () => {
      const cfg = getS3ClientConfigV3({ region: 'us-east-1' })
      expect(cfg.endpoint).toBeUndefined()
      expect(cfg.forcePathStyle).toBeUndefined()
    })
  })

  describe('isChainEndpoint', () => {
    test('false when nothing set', () => { expect(isChainEndpoint()).toBe(false) })
    test('true when AWS_S3_ENDPOINT set', () => {
      process.env.AWS_S3_ENDPOINT = 'https://s3.arbimon.org'
      expect(isChainEndpoint()).toBe(true)
    })
    test('true via explicit opts', () => {
      expect(isChainEndpoint({ endpoint: 'https://x' })).toBe(true)
    })
  })

  describe('createS3Client (v2, requires aws-sdk)', () => {
    test('returns a configured S3 client honoring the endpoint', () => {
      process.env.AWS_S3_ENDPOINT = 'https://s3.arbimon.org'
      const s3 = createS3Client({ accessKeyId: 'a', secretAccessKey: 'b', region: 'us-east-1' })
      expect(s3).toBeTruthy()
      // aws-sdk v2 exposes the resolved endpoint host on the client config
      expect(s3.config.endpoint).toContain('s3.arbimon.org')
      expect(s3.config.s3ForcePathStyle).toBe(true)
    })
  })
})