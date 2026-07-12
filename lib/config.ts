export type EnvName = 'stg' | 'prod';

export interface EnvironmentConfig {
  envName: EnvName;
  account?: string;
  region: string;
  resourcePrefix: string;
}

const environments: Record<EnvName, EnvironmentConfig> = {
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
