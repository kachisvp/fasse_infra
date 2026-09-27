// 構築する環境はdev・stgのみ。prod環境は未構築であり、構築時に別途要件化する(docs/steering/tech.md)
export type EnvName = 'dev' | 'stg';

export interface EnvironmentConfig {
  envName: EnvName;
  account?: string;
  region: string;
  resourcePrefix: string;
}

const environments: Record<EnvName, EnvironmentConfig> = {
  // stg反映前にバックエンドの変更を一時検証するためのサンドボックス。
  // 動作確認後はcdk destroyで速やかに破棄する運用とする(docs/specs/authentication REQ-109)
  dev: {
    envName: 'dev',
    account: process.env.CDK_DEV_ACCOUNT,
    region: process.env.CDK_DEV_REGION ?? 'ap-northeast-1',
    resourcePrefix: 'fasse-dev',
  },
  stg: {
    envName: 'stg',
    account: process.env.CDK_STG_ACCOUNT,
    region: process.env.CDK_STG_REGION ?? 'ap-northeast-1',
    resourcePrefix: 'fasse-stg',
  },
};

// context `env` の値を検証する。未指定時はstg、dev/stg以外は合成時エラーとする
// (docs/specs/authentication design.md 3.5節)
export function parseEnvName(value: unknown): EnvName {
  if (value === undefined) return 'stg';
  if (value === 'dev' || value === 'stg') return value;
  throw new Error(`Invalid context "env": ${JSON.stringify(value)}. Use "dev" or "stg".`);
}

export function getConfig(envName: EnvName): EnvironmentConfig {
  return environments[envName];
}
