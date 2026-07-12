# Fasse

## Flutter

[~2026/07/24]

- 環境初期再構築
- 単体テストコード化
- Amazon API Gateway - AWS Lambda - Amazon DynamoDB
- Amazon Aurora MySQL Serverless

## Slide

[~2026/07/24]

- WebAPIとは
- Flutter - SpringBoot - MySQL
- ローカル開発、AWS接続
- Postman

## SpringBoot

[~2026/09/30]

- 環境初期再構築
- 単体テストコード化
- AWS Fargate

## MySQL

- 環境初期再構築

## 仕様

将来的には、以下の構成で構築する。
APIGateway - Lambda - Amazon Aurora MySQL Serverless

最初は第一弾として、以下の構成で構築する。
APIGateway - Lambda - DynamoDB

仕入管理、売上管理を行う。

フロントエンドはFlutterで実装する。
WebAPIでDBから値を取得、更新を行う。
バックエンドはSpringBootで実装する。
ただし、第一弾では、AWSCDKで構築した構成でWebAPIの受口を構築する。

### 仕入ヘッダ

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

### 仕入明細

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
FOREIGN KEY (purchase_id)
REFERENCES t_purchase_header(id),

CONSTRAINT fk_t_purchase_detail_item
FOREIGN KEY (item_id)
REFERENCES m_item(id)

);

### 売上ヘッダ

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

### 売上明細

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
FOREIGN KEY (sales_id)
REFERENCES t_sales_header(id),

CONSTRAINT fk_t_sales_detail_menu
FOREIGN KEY (menu_id)
REFERENCES m_menu(id)
);

### 品目マスタ

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

### 仕入先マスタ

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

### メニューマスタ

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
