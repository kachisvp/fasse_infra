# structure.md — ディレクトリ構成・コーディング規約

## 1. ディレクトリ構成

```
fasse_infra/
├── bin/fasse_infra.ts          # CDK app entry; selects env via `-c env=...`
├── lib/
│   ├── config.ts               # per-environment settings (account/region/resourcePrefix)
│   ├── fasse_infra-stack.ts    # main stack (DynamoDB, Lambda, API Gateway, KMS, Cognito, S3/CloudFront)
│   ├── fasse-web-acl-stack.ts  # us-east-1 stack for the CloudFront WAF
│   └── lambda/
│       ├── items.ts, suppliers.ts, menus.ts, taxRates.ts, purchases.ts, sales.ts
│       ├── auth/               # JWT issuing (route A: AccessKey / route B: Cognito)
│       └── common/             # shared handlers, JWT verification, DynamoDB client, responses
├── test/                       # Jest (CDK assertions + Lambda unit tests)
├── postman/                    # Postman collection / environment
└── docs/
    ├── steering/               # project-wide context (this directory)
    └── specs/<feature>/        # requirements.md / design.md / tasks.md per feature
```

## 2. ドキュメントの置き場所

| 種類 | 置き場所 |
|---|---|
| プロジェクト全体の前提(プロダクト・技術・構成) | `docs/steering/` |
| 機能ごとの仕様 | `docs/specs/<feature>/requirements.md` / `design.md` / `tasks.md` |
| API 仕様 | `docs/specs/<feature>/openapi.yaml` |

- 新しい機能を追加するときは `docs/specs/` 配下にケバブケースのフォルダ(例: `web-hosting`)を作る
- タスクのファイル名は `tasks.md` に統一する

## 3. 命名規約

| 対象 | 規約 | 例 |
|---|---|---|
| AWS リソース名 | `${resourcePrefix}-<name>`(ケバブケース) | `fasse-stg-m-item` |
| CDK スタック名 | `<StackName>-<env>` | `FasseInfraStack-stg` |
| DynamoDB 属性 | スネークケース | `purchase_date` |
| API パス | ケバブケースの複数形 | `/tax-rates` |
| Lambda エントリ | キャメルケース | `taxRates.ts` |

## 4. コーディング規約

- 言語: 応答・ドキュメント・コードコメントは日本語、コード・識別子・ファイル名は英語
- コードコメントで仕様を参照するときは、要件 ID を併記する(例: `docs/specs/authentication REQ-108`)
- Lambda の共通処理は `lib/lambda/common/` に置き、各エントリはハンドラの組み立てのみに留める
- 認証が必要な API ハンドラは `withJwtAuth()` でラップする
- テストは `test/` 配下に置く。スタックの構成は `aws-cdk-lib/assertions` の `Template` で検証する
