# 実装タスク

## 仕様の承認

- [x] requirements.md のレビュー・承認
- [x] design.md のレビュー・承認（DynamoDBのアクセスパターン・キー設計、CDK構成、環境分離を含む）
- [ ] openapi.yaml のレビュー・承認（エンドポイント・スキーマ）
- [ ] openapi.yaml にJWT認証（`securitySchemes` / `security`、401レスポンス）を反映する

## 環境・スタック

- [x] `lib/config.ts`に環境（dev/stg）ごとのパラメータ（アカウントID/リージョン/リソース名等）を定義する
- [x] `bin/fasse_infra.ts`でデプロイ対象環境をcontext（`-c env=<dev|stg>`）で選択できるようにする

## DynamoDB（`lib/fasse_infra-stack.ts`）

- [x] counters（採番用）
- [x] m_item, m_supplier, m_menu（idはcountersテーブルで連番採番）
- [x] m_tax_rate（tax_category + valid_fromの複合キー）
- [x] t_purchase_header（+ gsi_purchase_date）, t_purchase_detail
- [x] t_sales_header（+ gsi_business_date）, t_sales_detail

## Lambda（Node.js + TypeScript）

- [x] マスタCRUD（m_item, m_supplier, m_menu、id採番・論理削除含む）
- [x] 消費税率マスタCRUD（m_tax_rate、物理削除）
- [x] 仕入伝票CRUD（登録はTransactWriteItemsでヘッダ+明細、purchase_no採番はpurchase_date単位）
- [x] 売上伝票CRUD（登録はTransactWriteItemsでヘッダ+明細、business_date必須、sales_no採番はbusiness_date単位）
- [x] 全Lambdaに共通のJWT検証処理（`withJwtAuth`）を組み込む（`docs/specs/authentication` TASK-301/301b）

## APIGateway

- [x] ルーティング定義（CDK）
- [x] CORS設定（`defaultCorsPreflightOptions`の`allowHeaders`に`Authorization`を含める）

## テスト・動作確認

- [x] 単体テスト（CDK Template、マスタ・伝票ハンドラ）
- [x] APIレベルでの疎通確認（stg環境、items/suppliers/purchasesのCRUD・TransactWriteItems・日付範囲一覧）
- [ ] Flutterアプリからの疎通確認（fasse_front側の対応が必要）

## SpringBoot(Fargate) / Aurora MySQL Serverlessへの置き換え

- [x] RDBスキーマのFK/型整合（design.md「RDBスキーマ」）
- [ ] Auroraスキーマ確定・マイグレーション作成
- [ ] WebAPI受口をSpringBoot(Fargate)に置き換える
- [ ] DynamoDBデータの移行方針検討
