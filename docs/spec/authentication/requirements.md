# requirements.md — 認証基盤(JWT / KMS / Cognito)

## 1. 背景・目的

本プロジェクトのWebAPI(Flutter-Web ⇄ API Gateway ⇄ WebAPI受口 ⇄ DB)に対して、環境ごとに適切な認証方式を提供しつつ、**WebAPI受口(検証ロジック)は常に単一形式のJWTのみを検証すればよい**構成とする。これにより、開発初期(Mock構成)から本番相当構成への移行時に、認証・認可ロジックの作り直しを不要にする。

## 2. スコープ

- フロントエンド: Flutter-Web
- JWT発行基盤: Amazon API Gateway + AWS Lambda + AWS KMS(非対称鍵)
- WebAPI受口: 開発初期はLambda(Mock)、開発後期はSpring Boot(コンテナ化しFargateで稼働)
- ID基盤(検証環境以降): Amazon Cognito User Pool
- データストア: 開発初期はDynamoDB(Mock)、本番相当はAmazon Aurora MySQL Serverless

## 3. 環境定義

| 環境 | フロントエンド認証情報の入手方法 | JWT発行経路 | WebAPI受口 | データストア |
|---|---|---|---|---|
| ローカル開発 | `.env`にAccessKeyを保持(ビルドフレーバーで読込) | AccessKey → JWT発行API(Lambda) | ローカルSpring Boot | ローカルMySQL |
| 検証環境(AWS) | `.env`にAccessKeyを保持しない。Cognitoログイン | Cognito ID Token → JWT発行API(Lambda) | Fargate(Spring Boot)※開発初期はLambda Mock | 開発初期: DynamoDB(Mock) / 開発後期: Aurora MySQL Serverless |
| 本番 | 検証環境と同様の想定(詳細は別途) | Cognito ID Token → JWT発行API(Lambda) | Fargate(Spring Boot) | Aurora MySQL Serverless |

## 4. 機能要件

### 4.1 JWT発行基盤(共通)

- REQ-101: JWT発行APIは、以下2種類の入力経路(ルート)を受け付けること。
  - ルートA: AccessKey(事前登録された共有シークレット文字列)
  - ルートB: Cognito ID Token
- REQ-102: ルートAの場合、受け取ったAccessKeyを事前登録リストと照合し、一致した場合にのみJWTを発行すること。
- REQ-103: ルートBの場合、受け取ったCognito ID TokenをCognitoのJWKSエンドポイントから取得した公開鍵で署名検証し、検証OKの場合にのみJWTを発行すること。
- REQ-104: ルートA・ルートBいずれの場合も、最終的に発行されるJWTはAWS KMSの非対称鍵(RSA_2048等)による署名(KMS `Sign` API呼び出し)で生成すること。
- REQ-105: 発行するJWTには、有効期限(`exp`)クレームを必ず含めること。
  - 開発中: 30日程度
  - 本番運用時: 1〜2時間程度を目安に短縮を検討する(別途チケット化)
- REQ-106: Cognito経由(ルートB)で発行する場合、Cognitoトークン内のユーザー識別子(`sub`等)を、発行する自前JWTの`sub`クレームに引き継ぐこと。

### 4.2 WebAPI受口(Spring Boot / Lambda Mock 共通)

- REQ-201: WebAPI受口は、JWT発行基盤がKMSで署名したJWT**のみ**を検証対象とすること。Cognitoが発行するJWTを直接検証する実装は行わない(マルチ発行者対応は不要とする)。
- REQ-202: 検証はKMSの公開鍵(エクスポート済みPEM)を用いて行い、WebAPI受口からKMSへの都度アクセスは不要とすること。
- REQ-203: 署名検証に加え、有効期限(`exp`)の検証を行うこと。ローカル環境ではクロックスキュー吸収のため妥当なleewayを設定してよい。
- REQ-204: JWT検証に失敗した場合(署名不正・期限切れ含む)、HTTPステータス401を返すこと。

### 4.3 フロントエンド(Flutter-Web)

- REQ-301: ビルドフレーバー(`--dart-define=ENV=local` / `ENV=demo` 等)により、認証情報取得方式を切り替えること。
- REQ-302: `ENV=local`の場合、`.env`からAccessKeyを読み込み、自動的にJWT発行APIのルートAへ送信し、JWTを取得すること。ユーザーへの入力画面は表示しない。
- REQ-303: `ENV=local`以外の場合、Cognitoログイン画面(Hosted UI等)へ遷移させ、ログイン成功後に取得したCognito ID Tokenを用いてJWT発行APIのルートBへ送信し、JWTを取得すること。
- REQ-304: 取得したJWTを用いてWebAPIへリクエストすること。
- REQ-305: WebAPIから401が返却された場合、JWT期限切れ/無効と判断し、再度JWT取得フローを実行すること(`ENV=local`は自動再発行、それ以外はログイン画面への再遷移)。
- REQ-306: AccessKeyの実体を、`ENV=local`以外のビルド成果物(JSバンドル・asset等)に一切含めないこと。

### 4.4 移行要件

- REQ-401: 開発初期はWebAPI受口・データストアをAPI Gateway + Lambda(Mock) + DynamoDBとする。
- REQ-402: Spring Boot側の実装が整い次第、WebAPI受口をコンテナ化しFargateへ、データストアをAurora MySQL Serverlessへ移行する。
- REQ-403: 移行に伴い、JWT発行・検証の仕組み自体に変更が生じないこと(検証ロジックの作り直しが不要であることを移行完了の判定基準とする)。

## 5. 非機能要件

- NFR-001: JWT発行基盤(Lambda)が単一障害点とならないよう、可用性を考慮すること(詳細はdesign.mdの可用性方針を参照)。
- NFR-002: KMSの秘密鍵はエクスポート不可のまま運用し、署名処理は常にKMS `Sign` API経由で行うこと(秘密鍵の平文取得・配布は行わない)。
- NFR-003: AccessKeyはリポジトリにコミットしない(`.env`はGit管理外とし、`.env.sample`のみ管理する)。
- NFR-004: 検証環境・本番環境は、WAF(IP制限またはBasic認証等)による外側の防御を併用することを推奨する(別途セキュリティ設計として検討)。

## 6. 対象外(Out of Scope)

- リフレッシュトークン方式の導入(開発期間中は単一JWTで妥協する方針のため、本仕様の対象外。本番移行時の再検討事項とする)。
- Cognitoにおけるソーシャルログイン・MFA等の詳細設定。
- WAF・CloudFrontの詳細設計(別紙とする)。
