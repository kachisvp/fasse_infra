#!/usr/bin/env node
import * as path from 'path';
import * as cdk from 'aws-cdk-lib/core';
import { FasseInfraStack } from '../lib/fasse_infra-stack';
import { FasseWebAclStack } from '../lib/fasse-web-acl-stack';
import { getConfig, parseEnvName } from '../lib/config';
import { applyLocalContext } from '../lib/localContext';

const app = new cdk.App();

// デプロイ対象環境は `cdk deploy -c env=dev` のようにcontextで選択する（未指定時はstg、dev/stg以外はエラー。
// docs/specs/authentication REQ-109: dev環境は一時的なサンドボックスであり、常設はstgのみ）
const envName = parseEnvName(app.node.tryGetContext('env'));
const config = getConfig(envName);

// env以外のcontextはGit管理対象外のcdk.context.local.jsonから読み込む(-cで指定した値が優先)。
// スタックを追加する前に呼ぶ必要がある(docs/specs/authentication design.md 3.5節)
applyLocalContext(app, envName, path.join(__dirname, '..', 'cdk.context.local.json'));

// フロントエンド配信用CloudFrontに関連付けるWAFv2 WebACL(scope: CLOUDFRONT)は、
// us-east-1でのみ作成可能なため専用スタックに分離する(docs/specs/web-hosting REQ-301/REQ-302)。
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
