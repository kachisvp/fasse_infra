# AWS CDK - Agent Instructions

ルートの `CLAUDE.md` の方針（言語、セキュリティ、仕様駆動開発）を前提とすること

## 仕様駆動開発

- インフラ変更前に、対象フォルダ配下に `requirements.md` / `design.md` / `tasks.md` を作成・更新し、承認を得ること
- `design.md` にはスタック構成・リソース一覧・IAM権限方針・ネットワーク構成（VPC/Subnet等）を記載すること

## セキュリティ

- IAMポリシーは最小権限とし、`iam.PolicyStatement` でのワイルドカード（`*`）の多用を避けること
- S3バケットはデフォルトでパブリックアクセスをブロックすること（`blockPublicAccess: BlockPublicAccess.BLOCK_ALL`）
- 保存データ・通信データを暗号化すること（S3/RDS/EBS暗号化、ALB/CloudFrontのTLS化）
- シークレットは `aws-cdk-lib/aws-secretsmanager` 等で管理し、コードにハードコードしないこと
- セキュリティグループは必要なポート・送信元のみ許可すること
- CloudTrail / Config / GuardDuty等の監査・検知の仕組みを可能な限り有効化すること

## 実装方針

- スタックは環境（dev/stg/prod）ごとに分離し、`cdk.context.json`や環境変数で切り替えられるようにすること
- リソース命名は環境・プロジェクト名を含む一貫した命名規則に従うこと
- L2/L3コンストラクトを優先し、Escape Hatch（`CfnResource`）の利用は最小限にすること
- `cdk diff` の結果を確認してから `cdk deploy` を実行すること

## ログ出力

- CDKアプリ自体（デプロイ時処理等）で`console.log`によるデバッグ出力を残さないこと。確認が必要な場合は `cdk deploy --outputs-file` 等の正式な仕組みを使うこと
- Lambda等のアプリケーションコードは、Lambda Powertools等の構造化ロガーを使用すること
- ロググループの保持期間（`logRetention`）を明示的に設定すること
- ログレベルは環境変数等で制御し、本番環境で過度なDEBUGログを出さないこと

## 例外処理

- CDKコンストラクトの初期化・設定エラーは握りつぶさず、合成時（`cdk synth`）に検知できるようにすること
- Lambda等では想定される例外（外部API呼び出し失敗、バリデーションエラー等）を捕捉し、CloudWatch Logsに詳細を出力した上で、利用者には状況が分かるレスポンスを返すこと
- ハンドラ最上位で共通のエラーハンドリングを実装し、未処理例外によるLambdaの異常終了を防ぐこと
- DLQ（Dead Letter Queue）やCloudWatch Alarmを設定し、エラー発生を検知・通知できるようにすること

## テスト自動化

- ユニットテスト（`aws-cdk-lib/assertions` の `Template`）でスタックが期待通りのリソースを生成しているか検証すること
- スナップショットテストで意図しないリソース構成の変更（差分）を検知すること
- セキュリティ関連リソースは `Template.hasResourceProperties` で許可範囲（ポート、CIDR、権限）を明示的に検証すること
- `cdk synth` をCIで実行し、合成エラーがないことを継続的に確認すること
- `cdk-nag` 等の静的解析ツールでセキュリティ・ベストプラクティス違反を自動検知すること
- 可能であればサンドボックス環境へのデプロイとSmoke TestをCI/CDパイプラインに組み込むこと
- Lambda等のアプリケーションコードを含む場合は、ランタイムに応じた単体テストも整備すること

## コマンド例

```bash
# 依存パッケージのインストール
npm i -D aws-cdk

# ユニットテスト実行
npm test

# CloudFormationテンプレートを合成（構文・設定エラーの確認）
npx cdk synth

# 現在のデプロイ済みリソースとの差分確認
npx cdk diff

# スタックのデプロイ
npx cdk deploy

# スタックの削除
npx cdk destroy

# cdk-nagによるセキュリティ・ベストプラクティスチェック（導入している場合）
npm run lint:nag
```
