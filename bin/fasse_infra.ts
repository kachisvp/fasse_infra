#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { FasseInfraStack } from '../lib/fasse_infra-stack';
import { EnvName, getConfig } from '../lib/config';

const app = new cdk.App();

// デプロイ対象環境は `cdk deploy -c env=dev` のようにcontextで選択する（未指定時はstg。
// docs/spec/authentication REQ-109: dev環境は一時的なサンドボックスであり、常設はstgのみ）
const envName = (app.node.tryGetContext('env') as EnvName | undefined) ?? 'stg';
const config = getConfig(envName);

new FasseInfraStack(app, `FasseInfraStack-${config.envName}`, {
  env: { account: config.account, region: config.region },
  config,
});
