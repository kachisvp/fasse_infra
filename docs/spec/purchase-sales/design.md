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

memo.md初稿のDDLをベースに、型不整合等を修正したもの（下記「修正内容」参照）。

```sql
-- マスタ（IDはBIGINT AUTO_INCREMENT）
CREATE TABLE m_item (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  item_name VARCHAR(100) NOT NULL,
  unit VARCHAR(20) NOT NULL,
  standard_price DECIMAL(12,2),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE m_supplier (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  supplier_name VARCHAR(100) NOT NULL,
  postal_code VARCHAR(10),
  address VARCHAR(255),
  phone_number VARCHAR(30),
  email VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE m_menu (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  menu_name VARCHAR(100) NOT NULL,
  category VARCHAR(50) NOT NULL,
  standard_price DECIMAL(12,2) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP
);

-- 仕入（IDはCHAR(36)=UUID。headerを先に定義する）
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
    ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_t_purchase_header_supplier
    FOREIGN KEY (supplier_id) REFERENCES m_supplier(id)
);

CREATE TABLE t_purchase_detail (
  id CHAR(36) PRIMARY KEY,
  purchase_id CHAR(36) NOT NULL,
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

-- 売上（IDはCHAR(36)=UUID。headerを先に定義する）
CREATE TABLE t_sales_header (
  id CHAR(36) PRIMARY KEY,
  sales_no VARCHAR(20) NOT NULL UNIQUE,
  sales_datetime DATETIME NOT NULL,
  business_date DATE NOT NULL,
  table_no VARCHAR(10),
  customer_count INT NOT NULL DEFAULT 1,
  subtotal DECIMAL(12,2) NOT NULL,
  tax_amount DECIMAL(12,2) NOT NULL,
  discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(12,2) NOT NULL,
  payment_method VARCHAR(20) NOT NULL,
  remarks VARCHAR(500),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE t_sales_detail (
  id CHAR(36) PRIMARY KEY,
  sales_id CHAR(36) NOT NULL,
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
```

**修正内容**

- マスタ（`m_item`, `m_supplier`, `m_menu`）のPKは`BIGINT AUTO_INCREMENT`にする（UUIDは不要な容量・インデックスコストがかかるため）
- 伝票系（`t_purchase_header/detail`, `t_sales_header/detail`）のPKは`CHAR(36)`（UUID）のまま維持し、`t_purchase_detail.purchase_id` / `t_sales_detail.sales_id`も`CHAR(36)`に統一した（旧: ここが`BIGINT`でPKと型不一致だった）
- テーブル定義順序はFK依存順（マスタ→header→detail）に統一し、インラインのFK制約定義のみで完結するようにした
- `t_purchase_header.supplier_id`に不足していたFK制約（`m_supplier(id)`）を追加した
- `m_supplier`に`is_active`を追加した（第一弾で論理削除の対象とするため）
- `t_sales_header`に`business_date`（営業日）を追加した。深夜営業などで日付をまたぐ取引を、実際の会計上の営業日に正しく紐付けるための項目
- `staff_id`は削除した。日本では伝票単位で担当者を紐付ける文化が無いため、当面不要と判断

### 第一弾（DynamoDB）

対象業種は飲食店（テーブル会計）。以下の方針で確定。

**アクセスパターン**

- IDを指定した1件取得
- 日付範囲での一覧取得（仕入: `purchase_date`、売上: `business_date`）
- 仕入先/メニュー単位の集計・一覧は第一弾ではスコープ外

**テーブル構成**

エンティティごとにテーブルを分ける（8テーブル、採番用の`counters`テーブルを含む）。

| テーブル | PK | SK | GSI |
|---|---|---|---|
| t_purchase_header | id (UUID) | - | `gsi_purchase_date`: PK=`"PURCHASE_HEADER"`固定, SK=`purchase_date` |
| t_purchase_detail | purchase_id | id (UUID) | - |
| t_sales_header | id (UUID) | - | `gsi_business_date`: PK=`"SALES_HEADER"`固定, SK=`business_date` |
| t_sales_detail | sales_id | id (UUID) | - |
| m_item | id (連番) | - | - |
| m_supplier | id (連番) | - | - |
| m_menu | id (連番) | - | - |
| counters | counter_name | - | - |

- 明細はヘッダの`id`をPKにすることで「あるヘッダの明細一覧」を`Query`で取得できる（ヘッダ登録時のTransactWriteItemsにもそのまま使える）
- 日付範囲一覧用のGSIはPKを固定値にする単純な設計。書き込み頻度が低い小規模業務用途を想定しているため許容するが、将来的にホットパーティションが問題になった場合は年月バケット等への見直しを検討する
- `counters`テーブルは連番採番専用。`counter_name`をキーに`value`（Number）を持ち、`UpdateItem`の`ADD`でアトミックに採番する。用途は以下の3種類
  - `m_item` / `m_supplier` / `m_menu`: マスタの`id`採番用（カウンタキーはエンティティ名固定）
  - `purchase_no#<purchase_date>`: 仕入伝票番号の採番用（`purchase_date`ごとにリセット）
  - `sales_no#<business_date>`: 売上伝票番号の採番用（`business_date`ごとにリセット）

**マスタデータ**

- m_item / m_supplier / m_menuはCRUD APIを提供する（登録・更新・削除もLambda経由）
- IDはAuroraの`BIGINT AUTO_INCREMENT`に合わせ、DynamoDB側も`counters`テーブルを使った連番とする（UUIDにしない）
- 削除は論理削除とする。DELETE APIが呼ばれてもDynamoDBのアイテムは物理削除せず、`is_active`を`false`に更新する（仕入/売上明細から参照されている可能性があるため）

**business_date（営業日）**

- `t_sales_header`の項目。クライアント（Flutter）が明示的に指定して送信する（サーバー側での自動算出は行わない）
- 深夜営業などで日付をまたぐ取引（例: 2026/07/13 02:00の売上）を、実際の営業日（例: 2026/07/12）に正しく紐付けるための項目
- 日付範囲一覧（`gsi_business_date`）・`sales_no`の採番はいずれも`sales_datetime`ではなく`business_date`を基準にする

**伝票番号（purchase_no / sales_no）**

- Lambda側で連番から生成する（例: `PO-20260712-0001`）
- `purchase_no`は`purchase_date`単位、`sales_no`は`business_date`単位でカウンタをリセットする
- 連番は`counters`テーブルへの`UpdateItem`（`ADD`）で採番する

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
