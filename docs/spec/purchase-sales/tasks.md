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
- [ ] 単体テスト
- [ ] Flutterからの疎通確認（stg環境）

## 将来（Aurora MySQL Serverlessへの移行）

- [x] データモデルのFK/型不整合の解消（design.md「将来形」DDLで対応済み）
- [ ] Auroraスキーマ確定・マイグレーション作成
- [ ] Lambda実装をAurora接続に置き換え
- [ ] 既存DynamoDBデータの移行方針検討
