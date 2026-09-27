# product.md — プロダクト概要

本ファイルはプロジェクト全体に共通する前提(ステアリング)を定める。記載内容は常に「現時点の仕様とその実装」であり、過去の経緯(履歴)は持たない。機能単位の要求・設計・タスクは `docs/specs/<feature>/` 配下の `requirements.md` / `design.md` / `tasks.md` に記載する。

## 1. プロダクト

**Fasse**: 飲食店(テーブル会計)向けの仕入管理・売上管理システム。

- フロントエンド(Flutter)から WebAPI を経由して DB の値を取得・更新する
- 対象業務
  - 仕入管理: 仕入先マスタ、品目マスタ、仕入伝票(ヘッダ+明細)
  - 売上管理: メニューマスタ、売上伝票(ヘッダ+明細)
  - 消費税管理: 消費税率マスタ(標準/軽減/非課税、適用期間)
- 利用者の認証
  - ローカル実行のフロントエンド: メンバーごとに発行した AccessKey
  - AWS でホストしたフロントエンド: Cognito の事前登録ユーザー(セルフサインアップなし)

## 2. 現在の構成

```
Flutter(Web) → API Gateway → Lambda → DynamoDB
```

- Flutter-Web は S3 + CloudFront で配信する(stg のみ)
- WebAPI はすべて JWT 認証を必要とする。JWT は KMS 非対称鍵で署名した単一形式に統一する
- 構成の詳細は [tech.md](./tech.md) を参照

## 3. リポジトリ構成

| リポジトリ | 役割 |
|---|---|
| `fasse_front` | Flutter(Web)フロントエンド |
| `fasse_infra`(本リポジトリ) | AWS CDK によるインフラ、および WebAPI 受口(Lambda) |

## 4. 今後の方針

- WebAPI 受口を SpringBoot(Fargate)に、データストアを Aurora MySQL Serverless に置き換える
  ```
  Flutter(Web) → SpringBoot(Fargate) → Aurora MySQL Serverless
  ```
- 置き換えの前後で、API 仕様(`docs/specs/purchase-sales/openapi.yaml`)と JWT 認証の仕組みは変えない
- 置き換えに合わせて SpringBoot のリポジトリを新設する

## 5. 作業トラック

リポジトリ横断で進める作業項目。

| 領域 | 作業項目 |
|---|---|
| Flutter | 環境の初期再構築、単体テストのコード化、現行 WebAPI(API Gateway - Lambda - DynamoDB)への接続、Aurora MySQL Serverless 構成への接続 |
| SpringBoot | 環境の初期再構築、単体テストのコード化、AWS Fargate へのデプロイ |
| MySQL | 環境の初期再構築 |
| 説明資料(Slide) | WebAPI とは、Flutter - SpringBoot - MySQL の構成、ローカル開発と AWS 接続、Postman の使い方 |

## 6. 仕様の正本

- データモデル(DDL を含む)は `docs/specs/purchase-sales/design.md` を正とする
- 機能ごとの仕様
  - `docs/specs/purchase-sales/`: 仕入管理・売上管理
  - `docs/specs/authentication/`: 認証基盤(JWT / KMS / Cognito)
  - `docs/specs/web-hosting/`: フロントエンド配信基盤(S3 / CloudFront)
