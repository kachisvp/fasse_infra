# 実装タスク

## 仕様の承認

- [x] requirements.md のレビュー・承認
- [x] design.md のレビュー・承認（DynamoDBのアクセスパターン・キー設計、CDK構成、環境分離を含む）
- [ ] openapi.yaml のレビュー・承認（エンドポイント・スキーマ）
- [x] openapi.yaml にJWT認証（`securitySchemes` / `security`、401レスポンス）を反映する
- [x] design.md・openapi.yaml に入力検証・エラー応答（400/500、エラーレスポンス形式）の方針を反映する

## 環境・スタック

- [x] `lib/config.ts`に環境（dev/stg）ごとのパラメータ（アカウントID/リージョン/リソース名等）を定義する
- [x] `bin/fasse_infra.ts`でデプロイ対象環境をcontext（`-c env=<dev|stg>`）で選択できるようにする
- [x] `dev`/`stg`以外のenvを合成時エラーにする（`docs/specs/authentication` TASK-011）

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
- [x] 売上伝票CRUD（登録はTransactWriteItemsでヘッダ+明細、sales_no採番はbusiness_date単位。business_dateの必須チェックは下記「入力検証・エラー応答」で対応）
- [x] 全Lambdaに共通のJWT検証処理（`withJwtAuth`）を組み込む（`docs/specs/authentication` TASK-301/301b）

## 入力検証・エラー応答（design.md「入力検証・エラー応答」）

- [x] `@aws-lambda-powertools/logger`を導入し、共通エラーハンドラ（未処理例外→500、`requestId`付きエラーレスポンス、ERRORログ）を`lib/lambda/common/`に実装する（単体テストを含む）
- [x] 共通の入力検証処理を`lib/lambda/common/`に実装する（必須・型・ENUM・日付形式の検証、未定義項目とサーバー管理項目の除去。単体テストを含む）
- [x] マスタ（items/suppliers/menus）に入力検証を組み込む（`masterHandler`の単体テストに400のケースと`created_at`を上書きできないケースを追加）
- [x] 消費税率マスタ（tax-rates）に入力検証を組み込み、`taxRates`ハンドラの単体テストを新規作成する
- [x] 仕入・売上伝票に入力検証を組み込む（`purchase_date`/`business_date`必須、`from`/`to`必須、PUTで伝票番号を上書きできない。`headerDetailHandler`の単体テストをpurchases/sales双方の設定で実行し、400のケースと伝票番号保護のケースを追加）
- [x] 全Lambda（認証Lambdaを含む）のハンドラ最上位に共通エラーハンドラを組み込む（`docs/specs/authentication` TASK-113と合わせて実施）

## APIGateway

- [x] ルーティング定義（CDK）
- [x] CORS設定（`defaultCorsPreflightOptions`の`allowHeaders`に`Authorization`を含める）

## テスト・動作確認

- [x] 単体テスト（CDK Template、マスタ・仕入伝票ハンドラ。消費税率マスタ・売上伝票の追加分は上記「入力検証・エラー応答」で対応）
- [x] APIレベルでの疎通確認（stg環境、items/suppliers/purchasesのCRUD・TransactWriteItems・日付範囲一覧）
- [ ] Flutterアプリからの疎通確認（fasse_front側の対応が必要）

## SpringBoot(Fargate) / Aurora MySQL Serverlessへの置き換え

- [x] RDBスキーマのFK/型整合（design.md「RDBスキーマ」）
- [ ] Auroraスキーマ確定・マイグレーション作成
- [ ] WebAPI受口をSpringBoot(Fargate)に置き換える
- [ ] DynamoDBデータの移行方針検討
