# tech.md — 技術スタック・技術方針

## 1. 技術スタック

| 層 | 技術 | 環境 |
|---|---|---|
| フロントエンド | Flutter(Web) | - |
| 配信 | S3 + CloudFront(OAC、HTTPS 強制、SPA 対応) | stg のみ |
| WebAPI 受口 | API Gateway + Lambda(Node.js 20 / TypeScript) | dev / stg |
| データストア | DynamoDB(オンデマンド) | dev / stg |
| 認証(JWT 発行) | Lambda + KMS 非対称鍵(RSA_2048 / RS256 署名)。AccessKey 経路と Cognito 経路の 2 つ | dev / stg |
| 認証(JWT 検証) | 各 Lambda で KMS 公開鍵(PEM)により検証 | dev / stg |
| ID 基盤 | Cognito User Pool(Hosted UI、Authorization Code Grant + PKCE) | stg のみ(dev は stg を共用) |
| 防御 | WAFv2(AWS マネージドルール)を API Gateway と CloudFront に関連付け | stg のみ |
| IaC | AWS CDK v2(TypeScript) | - |

### 今後の方針

- WebAPI 受口は SpringBoot(Fargate、コンテナ)に、データストアは Aurora MySQL Serverless に置き換える
- JWT の発行・検証の仕組み(KMS 署名、公開鍵による検証)は置き換え後も変えない

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
