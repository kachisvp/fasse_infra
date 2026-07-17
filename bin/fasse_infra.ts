#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { FasseInfraStack } from '../lib/fasse_infra-stack';
import { FasseWebAclStack } from '../lib/fasse-web-acl-stack';
import { EnvName, getConfig } from '../lib/config';

const app = new cdk.App();

// デプロイ対象環境は `cdk deploy -c env=dev` のようにcontextで選択する（未指定時はstg。
// docs/spec/authentication REQ-109: dev環境は一時的なサンドボックスであり、常設はstgのみ）
const envName = (app.node.tryGetContext('env') as EnvName | undefined) ?? 'stg';
const config = getConfig(envName);

// フロントエンド配信用CloudFrontに関連付けるWAFv2 WebACL(scope: CLOUDFRONT)は、
// us-east-1でのみ作成可能なため専用スタックに分離する(docs/spec/web-hosting REQ-301/REQ-302)。
// 本機能はstg環境のみ対象とする(REQ-401)。
let webAclArn: string | undefined;
if (envName === 'stg') {
  const webAclStack = new FasseWebAclStack(app, `FasseWebAclStack-${config.envName}`, {
    env: { account: config.account, region: 'us-east-1' },
    crossRegionReferences: true,
    config,
  });
  webAclArn = webAclStack.webAclArn;
}

new FasseInfraStack(app, `FasseInfraStack-${config.envName}`, {
  env: { account: config.account, region: config.region },
  crossRegionReferences: envName === 'stg',
  config,
  webAclArn,
});
