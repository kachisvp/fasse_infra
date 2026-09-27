import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as cdk from 'aws-cdk-lib/core';
import { applyLocalContext } from '../lib/localContext';

describe('applyLocalContext', () => {
  let dir: string;
  let filePath: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fasse-local-context-'));
    filePath = path.join(dir, 'cdk.context.local.json');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function writeFile(content: unknown): void {
    fs.writeFileSync(filePath, typeof content === 'string' ? content : JSON.stringify(content));
  }

  test('ファイルが無い場合は何もしない', () => {
    const app = new cdk.App();
    applyLocalContext(app, 'stg', filePath);
    expect(app.node.tryGetContext('cognitoCallbackUrls')).toBeUndefined();
  });

  test('指定した環境のセクションだけを読み込む', () => {
    writeFile({
      stg: { cognitoDomainPrefix: 'stg-prefix' },
      dev: { cognitoDomainPrefix: 'dev-prefix', jwtSigningKeyArn: 'arn:dev' },
    });
    const app = new cdk.App();
    applyLocalContext(app, 'stg', filePath);
    expect(app.node.tryGetContext('cognitoDomainPrefix')).toBe('stg-prefix');
    expect(app.node.tryGetContext('jwtSigningKeyArn')).toBeUndefined();
  });

  test('環境のセクションが無い場合は何もしない', () => {
    writeFile({ stg: { cognitoDomainPrefix: 'stg-prefix' } });
    const app = new cdk.App();
    applyLocalContext(app, 'dev', filePath);
    expect(app.node.tryGetContext('cognitoDomainPrefix')).toBeUndefined();
  });

  test('オブジェクトはJSON文字列に、配列はカンマ区切りの文字列に変換する', () => {
    writeFile({
      stg: {
        accessKeyHashMapJson: { hash1: 'demo1', hash2: 'demo2' },
        cognitoCallbackUrls: ['http://localhost:5000/auth_callback.html', 'https://example.cloudfront.net/auth_callback.html'],
      },
    });
    const app = new cdk.App();
    applyLocalContext(app, 'stg', filePath);
    expect(JSON.parse(app.node.tryGetContext('accessKeyHashMapJson'))).toEqual({ hash1: 'demo1', hash2: 'demo2' });
    expect(app.node.tryGetContext('cognitoCallbackUrls')).toBe(
      'http://localhost:5000/auth_callback.html,https://example.cloudfront.net/auth_callback.html',
    );
  });

  test('-cで指定済みの値はファイルの値で上書きしない', () => {
    writeFile({ stg: { cognitoDomainPrefix: 'from-file', jwtPublicKeyPemBase64: 'from-file' } });
    const app = new cdk.App({ context: { cognitoDomainPrefix: 'from-cli' } });
    applyLocalContext(app, 'stg', filePath);
    expect(app.node.tryGetContext('cognitoDomainPrefix')).toBe('from-cli');
    expect(app.node.tryGetContext('jwtPublicKeyPemBase64')).toBe('from-file');
  });

  test.each([
    ['JSONとして不正', '{invalid', /not valid JSON/],
    ['最上位がオブジェクトでない', [], /object/],
    ['環境のセクションがオブジェクトでない', { stg: 'x' }, /"stg".*object/],
    ['未定義のキー(書き間違い)', { stg: { cognitoCallbackUrl: 'x' } }, /cognitoCallbackUrl/],
    ['envキー', { stg: { env: 'dev' } }, /env/],
    ['値が文字列・オブジェクト・配列以外', { stg: { cognitoRegion: 1 } }, /cognitoRegion/],
  ])('%sの場合は合成時エラー', (_label, content, pattern) => {
    writeFile(content);
    const app = new cdk.App();
    expect(() => applyLocalContext(app, 'stg', filePath)).toThrow(pattern);
  });

  test('見本ファイル(cdk.context.local.example.json)は読み込み可能な書式である', () => {
    const examplePath = path.join(__dirname, '..', 'cdk.context.local.example.json');
    for (const envName of ['dev', 'stg'] as const) {
      expect(() => applyLocalContext(new cdk.App(), envName, examplePath)).not.toThrow();
    }
  });
});
