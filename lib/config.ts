export type EnvName = 'dev' | 'stg' | 'prod';

export interface EnvironmentConfig {
  envName: EnvName;
  account?: string;
  region: string;
  resourcePrefix: string;
}

const environments: Record<EnvName, EnvironmentConfig> = {
  // stg反映前にバックエンドの変更を一時検証するためのサンドボックス。
  // 動作確認後はcdk destroyで速やかに破棄する運用とする(docs/spec/authentication REQ-109)
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
  prod: {
    envName: 'prod',
    account: process.env.CDK_PROD_ACCOUNT,
    region: process.env.CDK_PROD_REGION ?? 'ap-northeast-1',
    resourcePrefix: 'fasse-prod',
  },
};

export function getConfig(envName: EnvName): EnvironmentConfig {
  return environments[envName];
}
