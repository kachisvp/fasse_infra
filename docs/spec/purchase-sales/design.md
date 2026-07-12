# 仕入管理・売上管理 設計

## アーキテクチャ

第一弾:

```
Flutter (Client) → Amazon API Gateway → AWS Lambda → Amazon DynamoDB
```

将来:

```
Flutter (Client) → AWS Fargate (SpringBoot) → Amazon Aurora MySQL Serverless
```

第一弾のAPIGateway - Lambda構成は暫定的なWebAPI受口であり、将来的にはSpringBoot(Fargate)がWebAPIを直接提供する構成に置き換わる。

## データモデル

### 将来形（Aurora MySQL Serverless移行後・最終形）

memo.md初稿のDDLをベースとした暫定案。FK/型の不整合は要修正（下記「レビュー指摘」参照）。

```sql
CREATE TABLE t_purchase_header (
  id CHAR(36) PRIMARY KEY,
  purchase_no VARCHAR(20) NOT NULL UNIQUE,
  supplier_id BIGINT NOT NULL,
  purchase_date DATE NOT NULL,
  delivery_date DATE,
  subtotal DECIMAL(12,2) NOT NULL,
  tax_amount DECIMAL(12,2) NOT NULL,
  total_amount DECIMAL(12,2) NOT NULL,
  remarks VARCHAR(500),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE t_purchase_detail (
  id CHAR(36) PRIMARY KEY,
  purchase_id BIGINT NOT NULL,
  item_id BIGINT NOT NULL,
  quantity DECIMAL(10,2) NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_t_purchase_detail_purchase
    FOREIGN KEY (purchase_id) REFERENCES t_purchase_header(id),
  CONSTRAINT fk_t_purchase_detail_item
    FOREIGN KEY (item_id) REFERENCES m_item(id)
);

CREATE TABLE t_sales_header (
  id CHAR(36) PRIMARY KEY,
  sales_no VARCHAR(20) NOT NULL UNIQUE,
  sales_datetime DATETIME NOT NULL,
  table_no VARCHAR(10),
  customer_count INT NOT NULL DEFAULT 1,
  subtotal DECIMAL(12,2) NOT NULL,
  tax_amount DECIMAL(12,2) NOT NULL,
  discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(12,2) NOT NULL,
  payment_method VARCHAR(20) NOT NULL,
  staff_id BIGINT,
  remarks VARCHAR(500),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE t_sales_detail (
  id CHAR(36) PRIMARY KEY,
  sales_id BIGINT NOT NULL,
  menu_id BIGINT NOT NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_t_sales_detail_sales
    FOREIGN KEY (sales_id) REFERENCES t_sales_header(id),
  CONSTRAINT fk_t_sales_detail_menu
    FOREIGN KEY (menu_id) REFERENCES m_menu(id)
);

CREATE TABLE m_item (
  id CHAR(36) PRIMARY KEY,
  item_name VARCHAR(100) NOT NULL,
  unit VARCHAR(20) NOT NULL,
  standard_price DECIMAL(12,2),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE m_supplier (
  id CHAR(36) PRIMARY KEY,
  supplier_name VARCHAR(100) NOT NULL,
  postal_code VARCHAR(10),
  address VARCHAR(255),
  phone_number VARCHAR(30),
  email VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE m_menu (
  id CHAR(36) PRIMARY KEY,
  menu_name VARCHAR(100) NOT NULL,
  category VARCHAR(50) NOT NULL,
  standard_price DECIMAL(12,2) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP
);
```

**レビュー指摘（TODO: 修正して確定させる）**

- PKが`CHAR(36)`（UUID想定）に対し、FK列（`supplier_id`, `purchase_id`, `item_id`, `sales_id`, `menu_id`）が`BIGINT`になっている。型を統一する。
- `t_purchase_header.supplier_id`にFK制約が付いていない。
- `staff_id`の参照先マスタ（`m_staff`）が未定義。
- `m_supplier`に`is_active`が無い（第一弾で論理削除の対象とするため追加が必要）。

### 第一弾（DynamoDB）

対象業種は飲食店（テーブル会計）。以下の方針で確定。

**アクセスパターン**

- IDを指定した1件取得
- 日付範囲での一覧取得（仕入: `purchase_date`、売上: `sales_datetime`）
- 仕入先/メニュー単位の集計・一覧は第一弾ではスコープ外

**テーブル構成**

エンティティごとにテーブルを分ける（7テーブル）。

| テーブル | PK | SK | GSI |
|---|---|---|---|
| t_purchase_header | id (UUID) | - | `gsi_purchase_date`: PK=`"PURCHASE_HEADER"`固定, SK=`purchase_date` |
| t_purchase_detail | purchase_id | id (UUID) | - |
| t_sales_header | id (UUID) | - | `gsi_sales_datetime`: PK=`"SALES_HEADER"`固定, SK=`sales_datetime` |
| t_sales_detail | sales_id | id (UUID) | - |
| m_item | id (UUID) | - | - |
| m_supplier | id (UUID) | - | - |
| m_menu | id (UUID) | - | - |

- 明細はヘッダの`id`をPKにすることで「あるヘッダの明細一覧」を`Query`で取得できる（ヘッダ登録時のTransactWriteItemsにもそのまま使える）
- 日付範囲一覧用のGSIはPKを固定値にする単純な設計。書き込み頻度が低い小規模業務用途を想定しているため許容するが、将来的にホットパーティションが問題になった場合は年月バケット等への見直しを検討する

**マスタデータ**

- m_item / m_supplier / m_menuはCRUD APIを提供する（登録・更新・削除もLambda経由）
- 削除は論理削除とする。DELETE APIが呼ばれてもDynamoDBのアイテムは物理削除せず、`is_active`を`false`に更新する（仕入/売上明細から参照されている可能性があるため）

**伝票番号（purchase_no / sales_no）**

- Lambda側で日付+連番から生成する（例: `PO-20260712-0001`）
- 連番はカウンタ用アイテムへの`UpdateItem`（`ADD`）で採番する想定

**金額フィールド**

- DynamoDBのNumber型で保持する
- 金額の整合性（`quantity × unit_price = amount`、明細合計 = `subtotal`等）はLambda側で検証しない。クライアントが計算した値をそのまま信頼して登録する

**日付・日時の扱い**

- `purchase_date` / `sales_datetime`等はJST（UTC+9）固定で扱う。UTC変換は行わず、JSTのローカル時刻をそのままISO 8601文字列（例: `2026-07-12`, `2026-07-12T19:30:00+09:00`）としてDynamoDBに保存する

**ヘッダ+明細の同時登録**

- `TransactWriteItems`でアトミックに書き込む

**ヘッダ+明細の更新（PUT）**

- 全洗い替え方式とする。PUT時は既存の明細を`purchase_id`/`sales_id`をキーに`Query`で取得して全件削除し、リクエストの`details`を全て新規挿入として`TransactWriteItems`で書き込む
- 明細の`id`はリクエストに含めない（レスポンスにのみ含む）。小規模な伝票（明細数が少ない）を想定しているため、書き込み件数の増加は許容する

**ヘッダ+明細の削除**

- 対象ヘッダの明細を`purchase_id`/`sales_id`をキーに`Query`で取得し、ヘッダの削除と明細全件の削除を`TransactWriteItems`でアトミックに行う

**staff_id**

- 第一弾ではスコープ外。`t_sales_header`からは項目自体を削除する（第一弾のDynamoDBスキーマに含めない）

## API仕様

認証方式: なし（第一弾は疎通確認優先。将来的な認証導入は別途課題とする）

エンドポイント一覧・リクエスト/レスポンススキーマは[openapi.yaml](./openapi.yaml)を参照。

- マスタ（品目/仕入先/メニュー）: `/items`, `/suppliers`, `/menus`（各CRUD）
- 仕入伝票: `/purchases`（一覧は`from`/`to`で日付範囲指定、登録・更新はヘッダ+明細をまとめて送信）
- 売上伝票: `/sales`（同上）

## 実装方針

**CDKスタック構成**

- 既存の`lib/fasse_infra-stack.ts`にDynamoDB/Lambda/APIGatewayを追加する（スタック分割はしない）

**Lambda実装**

- Node.js + TypeScriptで実装する

**環境分離**

- stg/prodの2環境に分ける。第一弾はstg環境のみ実装する
- 環境ごとに変わる値（アカウントID、リージョン、リソース名等）は変数化し、`config.ts`でstgを指定する

## 未確定事項

なし（第一弾のスコープ・設計は本ドキュメントで確定）
