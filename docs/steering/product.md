# product.md — プロダクト概要

本ファイルはプロジェクト全体に共通する前提(ステアリング)を定める。機能単位の要求・設計・タスクは `docs/specs/<feature>/` 配下の `requirements.md` / `design.md` / `tasks.md` に記載する。

## 1. プロダクト

**Fasse**: 飲食店(テーブル会計)向けの仕入管理・売上管理システム。

- フロントエンド(Flutter)から WebAPI を経由して DB の値を取得・更新する
- 対象業務
  - 仕入管理: 仕入先マスタ、品目マスタ、仕入伝票(ヘッダ+明細)
  - 売上管理: メニューマスタ、売上伝票(ヘッダ+明細)
  - 消費税管理: 消費税率マスタ(標準/軽減/非課税、適用期間)

## 2. リポジトリ構成

| リポジトリ | 役割 |
|---|---|
| `fasse_front` | Flutter(Web)フロントエンド |
| `fasse_infra`(本リポジトリ) | AWS CDK によるインフラ、および第一弾の WebAPI 受口(Lambda) |
| SpringBoot バックエンド | 将来の WebAPI 本実装(未着手) |

## 3. ロードマップ

| フェーズ | 構成 | 状態 |
|---|---|---|
| 第一弾 | Flutter → API Gateway → Lambda → DynamoDB | 実装済み(stg) |
| 第二弾 | 第一弾 + JWT認証(KMS署名 / Cognito)、Flutter-Web の S3/CloudFront 配信 | 実装済み(stg) |
| 将来 | Flutter → SpringBoot(Fargate) → Aurora MySQL Serverless | 未着手 |

- 第一弾の API Gateway + Lambda は暫定的な WebAPI 受口であり、将来は SpringBoot に置き換える
- 移行の前後で API 仕様(`docs/specs/purchase-sales/openapi.yaml`)と JWT 認証の仕組みは変えない

## 4. 作業トラック

memo.md で挙げられている、リポジトリ横断の作業項目。

| 領域 | 作業項目 |
|---|---|
| Flutter | 環境の初期再構築、単体テストのコード化、API Gateway - Lambda - DynamoDB への接続、Aurora MySQL Serverless 構成への接続 |
| SpringBoot | 環境の初期再構築、単体テストのコード化、AWS Fargate へのデプロイ |
| MySQL | 環境の初期再構築 |
| 説明資料(Slide) | WebAPI とは、Flutter - SpringBoot - MySQL の構成、ローカル開発と AWS 接続、Postman の使い方 |

## 5. 仕様の正本

- memo.md の DDL は初稿である。型の不整合等を修正した最新のデータモデルは `docs/specs/purchase-sales/design.md` を正とする
- 機能ごとの仕様
  - `docs/specs/purchase-sales/`: 仕入管理・売上管理
  - `docs/specs/authentication/`: 認証基盤(JWT / KMS / Cognito)
  - `docs/specs/web-hosting/`: フロントエンド配信基盤(S3 / CloudFront)
