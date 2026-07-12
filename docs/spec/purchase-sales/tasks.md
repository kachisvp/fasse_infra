# 実装タスク

## 前提

- [ ] requirements.md のレビュー・承認
- [ ] design.md のレビュー・承認（特にDynamoDBのアクセスパターン・キー設計）

## 第一弾（APIGateway - Lambda - DynamoDB）

- [ ] DynamoDBアクセスパターンの確定
- [ ] DynamoDBテーブル定義（CDK）: マスタ（品目・仕入先・メニュー）
- [ ] DynamoDBテーブル定義（CDK）: 仕入伝票（ヘッダ+明細）
- [ ] DynamoDBテーブル定義（CDK）: 売上伝票（ヘッダ+明細）
- [ ] Lambda実装: マスタCRUD
- [ ] Lambda実装: 仕入伝票CRUD
- [ ] Lambda実装: 売上伝票CRUD
- [ ] APIGateway定義・ルーティング（CDK）
- [ ] 認証方式の実装
- [ ] 単体テスト
- [ ] Flutterからの疎通確認

## 将来（Aurora MySQL Serverlessへの移行）

- [ ] データモデルのFK/型不整合の解消
- [ ] Auroraスキーマ確定・マイグレーション作成
- [ ] Lambda実装をAurora接続に置き換え
- [ ] 既存DynamoDBデータの移行方針検討
