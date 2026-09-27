import { createHash } from 'crypto';
import { AwsClientStub, mockClient } from 'aws-sdk-client-mock';
import type { KMSClient, SignCommand as SignCommandType } from '@aws-sdk/client-kms';
import { APIGatewayProxyHandler } from 'aws-lambda';
import { generateTestKeyPair, nowSeconds, signTestJwt } from '../helpers/jwt';
import { buildEvent, invoke } from '../helpers/lambda';

const REGION = 'ap-northeast-1';
const USER_POOL_ID = 'ap-northeast-1_TEST';
const CLIENT_ID = 'test-client-id';
const COGNITO_ISSUER = `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}`;

let kmsMock: AwsClientStub<KMSClient>;
let SignCommand: typeof SignCommandType;

// 環境変数・JWKSキャッシュはモジュール単位で保持されるため、テストごとに環境変数を設定してから読み込み直す。
// 読み込み直したモジュールのKMSClientをモックするため、KMSのモックもisolateModules内で作る
function loadHandler(entry: 'accessKeyToken' | 'cognitoToken', env: Record<string, string>): APIGatewayProxyHandler {
  let handler: APIGatewayProxyHandler | undefined;
  jest.isolateModules(() => {
    Object.assign(process.env, { KMS_KEY_ID: 'test-key', JWT_ISSUER: 'fasse-test-auth', ...env });
    const kms = require('@aws-sdk/client-kms');
    SignCommand = kms.SignCommand;
    kmsMock = mockClient(kms.KMSClient);
    kmsMock.on(SignCommand).resolves({ Signature: new Uint8Array([1, 2, 3]) });
    handler = require(`../../lib/lambda/auth/${entry}`).handler;
  });
  return handler!;
}

function post(body: unknown) {
  return buildEvent({ httpMethod: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });
}

function decodePayload(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
}

describe('ルートA: POST /auth/token (AccessKey)', () => {
  const accessKey = 'member-access-key';
  const hash = createHash('sha256').update(accessKey).digest('hex');
  let handler: APIGatewayProxyHandler;

  beforeEach(() => {
    handler = loadHandler('accessKeyToken', { ACCESS_KEY_HASH_MAP_JSON: JSON.stringify({ [hash]: 'demo1' }) });
  });

  test('登録済みのAccessKeyならメンバー識別子をsubに持つJWTを返す', async () => {
    const result = await invoke(handler, post({ accessKey }));
    expect(result.statusCode).toBe(200);
    const payload = decodePayload(JSON.parse(result.body).token);
    expect(payload.sub).toBe('demo1');
    expect(payload.iss).toBe('fasse-test-auth');
    expect(payload.exp).toBe((payload.iat as number) + 30 * 24 * 60 * 60);
  });

  test('未登録のAccessKeyは401', async () => {
    const result = await invoke(handler, post({ accessKey: 'unknown' }));
    expect(result.statusCode).toBe(401);
    expect(kmsMock.commandCalls(SignCommand)).toHaveLength(0);
  });

  test.each([
    ['ボディがJSONとして不正', '{invalid'],
    ['accessKeyが無い', {}],
    ['accessKeyが文字列でない', { accessKey: 123 }],
  ])('%sの場合は400', async (_label, body) => {
    const result = await invoke(handler, post(body));
    expect(result.statusCode).toBe(400);
  });

  test('KMS Signの失敗は500', async () => {
    kmsMock.on(SignCommand).rejects(new Error('kms unavailable'));
    const result = await invoke(handler, post({ accessKey }));
    expect(result.statusCode).toBe(500);
    expect(result.body).not.toContain('kms unavailable');
  });
});

describe('ルートB: POST /auth/token/cognito (Cognito ID Token)', () => {
  const cognitoKey = generateTestKeyPair();
  const otherKey = generateTestKeyPair();
  const kid = 'test-kid';
  const fetchMock = jest.fn();
  const originalFetch = global.fetch;
  const cognitoEnv = { COGNITO_USER_POOL_ID: USER_POOL_ID, COGNITO_CLIENT_ID: CLIENT_ID, COGNITO_REGION: REGION };

  function idToken(payloadOverrides: Record<string, unknown> = {}, privateKey = cognitoKey.privateKey): string {
    const now = nowSeconds();
    return signTestJwt(
      privateKey,
      { sub: 'cognito-sub', iss: COGNITO_ISSUER, aud: CLIENT_ID, exp: now + 3600, iat: now, ...payloadOverrides },
      { alg: 'RS256', kid },
    );
  }

  beforeAll(() => {
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ keys: [{ ...cognitoKey.publicJwk, kid }] }) });
  });

  test('有効なID TokenならCognitoのsubを引き継いだJWTを返す', async () => {
    const handler = loadHandler('cognitoToken', cognitoEnv);
    const result = await invoke(handler, post({ idToken: idToken() }));
    expect(result.statusCode).toBe(200);
    expect(decodePayload(JSON.parse(result.body).token).sub).toBe('cognito-sub');
    expect(fetchMock).toHaveBeenCalledWith(`${COGNITO_ISSUER}/.well-known/jwks.json`);
  });

  test.each([
    ['署名不正', () => idToken({}, otherKey.privateKey)],
    ['issが不一致', () => idToken({ iss: 'https://example.com' })],
    ['audが不一致', () => idToken({ aud: 'other-client' })],
    ['期限切れ', () => idToken({ exp: nowSeconds() - 1 })],
    ['形式不正', () => 'not-a-jwt'],
  ])('ID Tokenが%sの場合は401', async (_label, token) => {
    const handler = loadHandler('cognitoToken', cognitoEnv);
    const result = await invoke(handler, post({ idToken: token() }));
    expect(result.statusCode).toBe(401);
    expect(kmsMock.commandCalls(SignCommand)).toHaveLength(0);
  });

  test.each([
    ['ボディがJSONとして不正', '{invalid'],
    ['idTokenが無い', {}],
  ])('%sの場合は400', async (_label, body) => {
    const handler = loadHandler('cognitoToken', cognitoEnv);
    const result = await invoke(handler, post(body));
    expect(result.statusCode).toBe(400);
  });

  test('Cognito設定が未設定なら401を返し、JWKSを取得しない(フェイルクローズ)', async () => {
    const handler = loadHandler('cognitoToken', { ...cognitoEnv, COGNITO_USER_POOL_ID: '', COGNITO_CLIENT_ID: '' });
    const result = await invoke(handler, post({ idToken: idToken() }));
    expect(result.statusCode).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('JWKSの取得失敗は500', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    const handler = loadHandler('cognitoToken', cognitoEnv);
    const result = await invoke(handler, post({ idToken: idToken() }));
    expect(result.statusCode).toBe(500);
  });

  test('KMS Signの失敗は500', async () => {
    const handler = loadHandler('cognitoToken', cognitoEnv);
    kmsMock.on(SignCommand).rejects(new Error('kms unavailable'));
    const result = await invoke(handler, post({ idToken: idToken() }));
    expect(result.statusCode).toBe(500);
  });
});
