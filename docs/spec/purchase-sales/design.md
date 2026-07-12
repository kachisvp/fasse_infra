# 仕入管理・売上管理 設計

## アーキテクチャ

第一弾:

```
Flutter (Client) → Amazon API Gateway → AWS Lambda → Amazon DynamoDB
```

将来:

```
Flutter (Client) → Amazon API Gateway → AWS Lambda → Amazon Aurora MySQL Serverless
```

> TODO: memo.mdの「SpringBoot」項（AWS Fargate稼働）との関係が未整理。
> 最終形のバックエンドはLambdaのままか、SpringBoot(Fargate)に置き換わるのか確認する。

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

### 第一弾（DynamoDB）

**未確定 - アクセスパターンの洗い出しから着手する。**

DynamoDBはRDBと異なりJOIN/外部キー/UNIQUE制約が無いため、先にアクセスパターンを決めてからテーブル・PK/SK/GSIを設計する。

TODO:

- [ ] アクセスパターン一覧を洗い出す（例: 仕入伝票を日付範囲で一覧、仕入先ごとに集計 など）
- [ ] テーブル構成を決める（シングルテーブル設計 or エンティティごとにテーブル分割）
- [ ] Partition Key / Sort Key を決める
- [ ] GSIの要否を決める
- [ ] `purchase_no` / `sales_no`の一意性の担保方法（条件付き書き込み等）を決める
- [ ] 金額（DECIMAL相当）をNumberで持つか文字列で持つか決める
- [ ] ヘッダ+明細の同時登録を`TransactWriteItems`で行うか決める
- [ ] マスタ（品目・仕入先・メニュー）のテーブル構成を決める

## API仕様

TODO: OpenAPI定義を`docs/spec/purchase-sales/openapi.yaml`として作成する。

- [ ] エンドポイント一覧（仕入/売上のCRUD、マスタのCRUD）
- [ ] リクエスト/レスポンススキーマ
- [ ] 認証方式

## 未確定事項

- 対象業種・利用シーン（飲食店前提か？）
- 認証方式
- 集計・検索のアクセスパターン
- DynamoDBのキー設計全般
