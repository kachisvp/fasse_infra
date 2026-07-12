#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { FasseInfraStack } from '../lib/fasse_infra-stack';
import { getConfig } from '../lib/config';

const app = new cdk.App();

// 第一弾はstg環境のみ実装する（docs/spec/purchase-sales/design.md参照）
const config = getConfig('stg');

new FasseInfraStack(app, `FasseInfraStack-${config.envName}`, {
  env: { account: config.account, region: config.region },
  config,
});
