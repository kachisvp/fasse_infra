# 実装タスク

## 前提

- [x] requirements.md のレビュー・承認
- [x] design.md のレビュー・承認（DynamoDBのアクセスパターン・キー設計、CDK構成、環境分離を含む）
- [ ] openapi.yaml のレビュー・承認（エンドポイント・スキーマ）

## 第一弾（APIGateway - Lambda - DynamoDB, stg環境）

design.mdで確定した内容（テーブル構成・PK/SK/GSI、認証なし、既存スタックへの追加、Node.js+TypeScript、stg/prod分離等）に基づく。

- [x] `config.ts`を作成し、stg環境用のパラメータ（アカウントID/リージョン/リソース名等）を定義する
- [x] DynamoDBテーブル定義（CDK、`lib/fasse_infra-stack.ts`に追加）: counters（採番用）
- [x] DynamoDBテーブル定義（CDK）: m_item, m_supplier, m_menu（idはcountersテーブルで連番採番）
- [x] DynamoDBテーブル定義（CDK）: t_purchase_header（+ gsi_purchase_date）, t_purchase_detail
- [x] DynamoDBテーブル定義（CDK）: t_sales_header（+ gsi_business_date）, t_sales_detail
- [x] Lambda実装（Node.js + TypeScript）: マスタCRUD（m_item, m_supplier, m_menu、id採番・論理削除含む）
- [x] Lambda実装（Node.js + TypeScript）: 仕入伝票CRUD（登録はTransactWriteItemsでヘッダ+明細、purchase_no採番はpurchase_date単位）
- [x] Lambda実装（Node.js + TypeScript）: 売上伝票CRUD（登録はTransactWriteItemsでヘッダ+明細、business_date必須、sales_no採番はbusiness_date単位）
- [x] APIGateway定義・ルーティング（CDK、認証なし）
- [x] 単体テスト
- [x] APIレベルでの疎通確認（stg環境、items/suppliers/purchasesのCRUD・TransactWriteItems・日付範囲一覧を確認済み）
- [ ] Flutterアプリからの疎通確認（別途Flutterプロジェクト側の対応が必要）

## 第二弾（JWT認証導入）

詳細タスクは`docs/spec/authentication/task.md`を参照。本タスクリストでは、purchase-sales側の実装(既存Lambda・既存スタック)に対する影響のみを記す。

- [ ] `config.ts`の`EnvName`型に`dev`を追加し、`bin/fasse_infra.ts`をデプロイ対象環境の選択に対応させる
- [ ] 既存の6つのLambda(items/suppliers/menus/tax-rates/purchases/sales)に、共通のJWT検証処理(`lib/lambda/common/`配下に追加)を組み込む
- [ ] JWT発行基盤(ルートA/ルートB、KMSキー)を既存の`lib/fasse_infra-stack.ts`に追加する(スタック分割はしない方針を踏襲)
- [ ] API GatewayのCORS設定(`defaultCorsPreflightOptions`)に`Authorization`ヘッダーを含む`allowHeaders`を明示する
- [ ] stg環境へのWAF追加、API Gatewayのスロットリング設定を行う(NFR-004/NFR-005準拠)

## 将来（Aurora MySQL Serverlessへの移行）

- [x] データモデルのFK/型不整合の解消（design.md「将来形」DDLで対応済み）
- [ ] Auroraスキーマ確定・マイグレーション作成
- [ ] Lambda実装をAurora接続に置き換え
- [ ] 既存DynamoDBデータの移行方針検討
