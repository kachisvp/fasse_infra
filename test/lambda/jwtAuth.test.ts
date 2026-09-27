import { APIGatewayProxyHandler } from 'aws-lambda';
import { withJwtAuth } from '../../lib/lambda/common/auth';
import { withErrorHandling } from '../../lib/lambda/common/errorHandler';
import { verifyJwt } from '../../lib/lambda/common/jwt';
import { generateTestKeyPair, nowSeconds, signTestJwt } from '../helpers/jwt';
import { buildEvent, invoke } from '../helpers/lambda';

const keyPair = generateTestKeyPair();
const otherKeyPair = generateTestKeyPair();

function validPayload(): Record<string, unknown> {
  const now = nowSeconds();
  return { sub: 'demo1', iss: 'fasse-stg-auth', iat: now, exp: now + 3600 };
}

describe('verifyJwt', () => {
  test('正しい署名・有効期限内のJWTはクレームを返す', () => {
    const token = signTestJwt(keyPair.privateKey, validPayload());
    expect(verifyJwt(token, keyPair.publicKeyPem)?.sub).toBe('demo1');
  });

  test('別の鍵で署名されたJWTはnull', () => {
    const token = signTestJwt(otherKeyPair.privateKey, validPayload());
    expect(verifyJwt(token, keyPair.publicKeyPem)).toBeNull();
  });

  test('有効期限切れのJWTはnull', () => {
    const token = signTestJwt(keyPair.privateKey, { ...validPayload(), exp: nowSeconds() - 1 });
    expect(verifyJwt(token, keyPair.publicKeyPem)).toBeNull();
  });

  test('expが無いJWTはnull', () => {
    const { exp: _exp, ...payload } = validPayload();
    const token = signTestJwt(keyPair.privateKey, payload);
    expect(verifyJwt(token, keyPair.publicKeyPem)).toBeNull();
  });

  test('algがRS256以外のJWTはnull', () => {
    const token = signTestJwt(keyPair.privateKey, validPayload(), { alg: 'none', typ: 'JWT' });
    expect(verifyJwt(token, keyPair.publicKeyPem)).toBeNull();
  });

  test.each(['not-a-jwt', 'a.b', '!!!.!!!.!!!'])('形式が不正なトークン(%s)はnull', (token) => {
    expect(verifyJwt(token, keyPair.publicKeyPem)).toBeNull();
  });

  test('公開鍵PEMが不正な場合も例外にせずnull', () => {
    const token = signTestJwt(keyPair.privateKey, validPayload());
    expect(verifyJwt(token, 'invalid pem')).toBeNull();
  });
});

describe('withJwtAuth', () => {
  const inner: APIGatewayProxyHandler = async () => ({ statusCode: 200, body: 'ok' });
  const handler = withErrorHandling(withJwtAuth(inner));

  beforeEach(() => {
    process.env.JWT_PUBLIC_KEY_PEM = keyPair.publicKeyPem;
  });

  afterAll(() => {
    delete process.env.JWT_PUBLIC_KEY_PEM;
  });

  test('有効なBearer Tokenの場合はハンドラを実行する', async () => {
    const token = signTestJwt(keyPair.privateKey, validPayload());
    const result = await invoke(handler, buildEvent({ headers: { Authorization: `Bearer ${token}` } }));
    expect(result.statusCode).toBe(200);
  });

  test('小文字のauthorizationヘッダも受け付ける', async () => {
    const token = signTestJwt(keyPair.privateKey, validPayload());
    const result = await invoke(handler, buildEvent({ headers: { authorization: `Bearer ${token}` } }));
    expect(result.statusCode).toBe(200);
  });

  test.each([
    ['ヘッダ欠落', {}],
    ['Bearer以外の形式', { Authorization: 'Basic abc' }],
  ])('Authorizationヘッダが%sの場合は401', async (_label, headers) => {
    const result = await invoke(handler, buildEvent({ headers }));
    expect(result.statusCode).toBe(401);
  });

  test('署名不正のJWTは401', async () => {
    const token = signTestJwt(otherKeyPair.privateKey, validPayload());
    const result = await invoke(handler, buildEvent({ headers: { Authorization: `Bearer ${token}` } }));
    expect(result.statusCode).toBe(401);
  });

  test('期限切れのJWTは401', async () => {
    const token = signTestJwt(keyPair.privateKey, { ...validPayload(), exp: nowSeconds() - 1 });
    const result = await invoke(handler, buildEvent({ headers: { Authorization: `Bearer ${token}` } }));
    expect(result.statusCode).toBe(401);
  });

  test('公開鍵が未設定の場合は401(フェイルクローズ)', async () => {
    delete process.env.JWT_PUBLIC_KEY_PEM;
    const token = signTestJwt(keyPair.privateKey, validPayload());
    const result = await invoke(handler, buildEvent({ headers: { Authorization: `Bearer ${token}` } }));
    expect(result.statusCode).toBe(401);
  });

  test('401のレスポンスにもrequestIdを含める', async () => {
    const result = await invoke(handler, buildEvent({ headers: {} }));
    expect(JSON.parse(result.body).requestId).toBe('test-request-id');
  });
});
