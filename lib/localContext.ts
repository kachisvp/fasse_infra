import * as fs from 'fs';
import * as cdk from 'aws-cdk-lib/core';
import { EnvName } from './config';

// cdk.context.local.jsonに書けるcontextキー(docs/specs/authentication design.md 3.5節)。
// envは読み込むセクションを決めるキーのため、ファイルには書けない
export const LOCAL_CONTEXT_KEYS = [
  'accessKeyHashMapJson',
  'jwtPublicKeyPemBase64',
  'jwtSigningKeyArn',
  'cognitoUserPoolId',
  'cognitoClientId',
  'cognitoRegion',
  'cognitoCallbackUrls',
  'cognitoDomainPrefix',
] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// -cで渡す場合と同じ文字列形式にそろえる(オブジェクトはJSON文字列、配列はカンマ区切り)
function toContextValue(key: string, value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(String).join(',');
  if (isPlainObject(value)) return JSON.stringify(value);
  throw new Error(`cdk.context.local.json: "${key}" must be a string, an object, or an array.`);
}

// Git管理対象外のcdk.context.local.jsonから、指定した環境のcontextを読み込む。
// -cで指定済みのキーは上書きしない(優先順位: -c > ファイル > 既定値)。
// setContextはスタックを追加する前に呼ぶ必要があるため、bin/fasse_infra.tsでスタック生成前に呼び出す
export function applyLocalContext(app: cdk.App, envName: EnvName, filePath: string): void {
  if (!fs.existsSync(filePath)) return;

  let content: unknown;
  try {
    content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`${filePath} is not valid JSON: ${(error as Error).message}`);
  }
  if (!isPlainObject(content)) {
    throw new Error(`${filePath} must be a JSON object whose keys are environment names ("dev", "stg").`);
  }

  const section = content[envName];
  if (section === undefined) return;
  if (!isPlainObject(section)) {
    throw new Error(`${filePath}: "${envName}" must be an object of context keys and values.`);
  }

  const allowedKeys: readonly string[] = LOCAL_CONTEXT_KEYS;
  const unknownKeys = Object.keys(section).filter((key) => !allowedKeys.includes(key));
  if (unknownKeys.length > 0) {
    throw new Error(
      `${filePath}: unknown context keys in "${envName}": ${unknownKeys.join(', ')}. ` +
        `Allowed keys: ${allowedKeys.join(', ')}.`,
    );
  }

  for (const [key, value] of Object.entries(section)) {
    const contextValue = toContextValue(key, value);
    if (app.node.tryGetContext(key) === undefined) {
      app.node.setContext(key, contextValue);
    }
  }
}
