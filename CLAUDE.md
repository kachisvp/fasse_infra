# AWS CDK - Agent Instructions

ルートの `CLAUDE.md` の方針（言語、セキュリティ、仕様駆動開発）を前提とする。

## 仕様駆動開発

- インフラ変更を行う前に、このフォルダ配下（または対象スタック配下）に `requirements.md` / `design.md` / `tasks.md` を作成・更新し、承認を得ること
- `design.md` にはスタック構成、リソース一覧、IAM権限方針、ネットワーク構成（VPC/Subnet等）を記載すること

## セキュリティ

- IAMポリシーは最小権限とし、`iam.PolicyStatement` にワイルドカード（`*`）の多用を避けること
- S3バケットはデフォルトでパブリックアクセスをブロックすること（`blockPublicAccess: BlockPublicAccess.BLOCK_ALL`）
- 保存データ・通信データは暗号化すること（S3/RDS/EBS等の暗号化、ALB/CloudFrontのTLS化）
- シークレットは `aws-cdk-lib/aws-secretsmanager` 等で管理し、コード内にハードコードしないこと
- セキュリティグループは必要なポート・送信元のみ許可すること
- CloudTrail / Config / GuardDuty等の監査・検知の仕組みを可能な限り有効化すること

## 実装方針

- スタックは環境（dev/stg/prod）ごとに分離し、`cdk.context.json` や環境変数で切り替えられるようにすること
- リソース命名は環境・プロジェクト名を含む一貫した命名規則に従うこと
- L2/L3コンストラクトを優先して使用し、Escape Hatch（`CfnResource`）の利用は最小限にすること
- `cdk diff` の結果を確認してから `cdk deploy` を実行すること

## ログ出力

- CDKアプリ自体（デプロイ時処理等）で`console.log`によるデバッグ出力を残さないこと。CLIの出力確認が必要な場合は `cdk deploy --outputs-file` 等の正式な仕組みを使うこと
- Lambda等のアプリケーションコードは、Lambda Powertools for TypeScript/Python等の構造化ロガーを使用し、`console.log`の生出力に頼らないこと
- Lambdaのログは自動的にCloudWatch Logsへ送られる前提だが、ロググループの保持期間（`logRetention`）を明示的に設定すること
- ログレベルは環境変数等で制御し、本番環境では過度なDEBUGログを出さないこと

## 例外処理

- CDKコンストラクトの初期化・設定エラーは握りつぶさず、合成時（`cdk synth`）に検知できるようにすること
- Lambda等のアプリケーションコードでは、想定される例外（外部API呼び出し失敗、バリデーションエラー等）を捕捉し、CloudWatch Logsに詳細を出力した上で、呼び出し元・利用者には状況が分かるレスポンス（エラーコード・メッセージ）を返すこと
- 未処理例外によるLambdaの異常終了を防ぐため、ハンドラの最上位で共通のエラーハンドリングを実装すること
- DLQ（Dead Letter Queue）やアラーム（CloudWatch Alarm）を設定し、エラー発生を検知・通知できるようにすること

## テスト自動化

- ユニットテスト（`aws-cdk-lib/assertions` の `Template`）でスタックが期待通りのリソースを生成しているか検証すること
- スナップショットテストを用いて、意図しないリソース構成の変更（差分）を検知すること
- ポリシー・セキュリティグループ等のセキュリティ関連リソースは、`Template.hasResourceProperties` で許可範囲（ポート、CIDR、権限）を明示的に検証すること
- `cdk synth` をCIで実行し、合成エラーが無いことを継続的に確認すること
- `cdk-nag` 等の静的解析ツールを導入し、セキュリティ・ベストプラクティス違反を自動検知すること
- 可能であれば、サンドボックス環境へのデプロイと基本疎通確認（Smoke Test）をCI/CDパイプラインに組み込むこと
- Lambda等のアプリケーションコードを含む場合は、そのランタイムに応じた単体テストも別途整備すること

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
