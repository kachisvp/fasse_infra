# tech.md — 技術スタック・技術方針

## 1. 技術スタック

| 層 | 第一弾・第二弾(現行) | 将来 |
|---|---|---|
| フロントエンド | Flutter(Web) | Flutter(Web) |
| 配信 | S3 + CloudFront(stg のみ) | 同左 |
| WebAPI 受口 | API Gateway + Lambda(Node.js 20 / TypeScript) | SpringBoot(Fargate、コンテナ) |
| データストア | DynamoDB | Aurora MySQL Serverless |
| 認証 | 自前 JWT(KMS 非対称鍵 RS256 署名)、Cognito User Pool | 同左(変更しない) |
| 防御 | WAFv2(AWS マネージドルール) | 同左 |
| IaC | AWS CDK v2(TypeScript) | 同左 |

## 2. 環境

| 環境 | 位置づけ |
|---|---|
| stg | 唯一の永続的なバックエンド環境。ローカル実行・AWS ホストの双方のフロントエンドが接続する |
| dev | stg へ反映する前の一時的な検証用サンドボックス。動作確認後は `cdk destroy` で破棄する |
| prod | 未構築。構築時に別途要件化する |

- 環境は `-c env=<dev|stg>` で選択する(未指定時は stg)。環境ごとの値は `lib/config.ts` で管理する
- リソース名には `fasse-<env>` のプレフィックスを付ける
- フロントエンドのビルドフレーバー(`local` / `stg` / `prod`)と AWS 環境名(`dev` / `stg` / `prod`)は別の概念である

## 3. 技術方針

- CDK スタックは `FasseInfraStack` に集約し、原則として分割しない。例外は us-east-1 必須の CloudFront 用 WAF(`FasseWebAclStack`)のみ
- L2/L3 コンストラクトを優先し、Escape Hatch は最小限にする
- 認証済み API は KMS 公開鍵(PEM)で JWT を検証し、リクエストの都度 KMS にアクセスしない
- シークレット(AccessKey 等)はリポジトリに含めない。CDK context や AWS のシークレット管理サービス経由で渡す
- セキュリティ、ログ、例外処理、テストのルールは、ルートおよび本リポジトリの `CLAUDE.md` に従う

## 4. よく使うコマンド

```bash
npm test                                   # unit tests (Jest)
npx cdk synth                              # synthesize templates
npx cdk diff                               # check diff before deploy
npx cdk deploy --all                       # stg has two stacks (WebAcl + Infra)
npx cdk deploy -c env=dev FasseInfraStack-dev
npx cdk destroy -c env=dev FasseInfraStack-dev
```

- 動作確認は Postman(`postman/`)で行う

## 5. 開発プロセス

- 仕様駆動開発: 機能ごとに `docs/specs/<feature>/` に `requirements.md` / `design.md` / `tasks.md` を作成し、承認を得てから実装する
- 実装が仕様と食い違う場合は、先に仕様を更新してから実装を直す
- `cdk diff` で差分を確認してから `cdk deploy` する
