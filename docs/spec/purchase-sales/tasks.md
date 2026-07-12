# 実装タスク

## 前提

- [ ] requirements.md のレビュー・承認
- [ ] design.md のレビュー・承認（特にDynamoDBのアクセスパターン・キー設計）

## 第一弾（APIGateway - Lambda - DynamoDB）

design.mdで確定した内容（テーブル構成・PK/SK/GSI、認証なし等）に基づく。

- [ ] DynamoDBテーブル定義（CDK）: m_item, m_supplier, m_menu
- [ ] DynamoDBテーブル定義（CDK）: t_purchase_header（+ gsi_purchase_date）, t_purchase_detail
- [ ] DynamoDBテーブル定義（CDK）: t_sales_header（+ gsi_sales_datetime）, t_sales_detail
- [ ] Lambda実装: マスタCRUD（m_item, m_supplier, m_menu）
- [ ] Lambda実装: 仕入伝票CRUD（登録はTransactWriteItemsでヘッダ+明細、purchase_no採番含む）
- [ ] Lambda実装: 売上伝票CRUD（登録はTransactWriteItemsでヘッダ+明細、sales_no採番含む）
- [ ] APIGateway定義・ルーティング（CDK、認証なし）
- [ ] 単体テスト
- [ ] Flutterからの疎通確認

## 将来（Aurora MySQL Serverlessへの移行）

- [ ] データモデルのFK/型不整合の解消
- [ ] Auroraスキーマ確定・マイグレーション作成
- [ ] Lambda実装をAurora接続に置き換え
- [ ] 既存DynamoDBデータの移行方針検討
