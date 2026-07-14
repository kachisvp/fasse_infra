# task.md — 認証基盤(JWT / KMS / Cognito)実装タスク

凡例: `[ ]` 未着手 / 優先度 High=本フェーズ必須, Mid=後続フェーズ, Low=申し送り事項

## Phase 0: 基盤準備

- [ ] TASK-001 (High): AWS KMS非対称鍵(KeySpec: `RSA_2048`, KeyUsage: `SIGN_VERIFY`)を作成する
- [ ] TASK-002 (High): KMSキーに対するIAMポリシーを設計する(Lambda実行ロールに`kms:Sign`・`kms:GetPublicKey`を付与)
- [ ] TASK-003 (High): `aws kms get-public-key` で公開鍵をエクスポートし、PEM形式に変換する手順をドキュメント化する
- [ ] TASK-004 (High): AccessKeyの生成方法・配布経路(パスワードマネージャー等)を決定し、運用ルールをドキュメント化する
- [ ] TASK-005 (Mid): AccessKeyを共通1つにするか、メンバー個別発行にするかを決定する

## Phase 1: JWT発行基盤(API Gateway + Lambda)

- [ ] TASK-101 (High): API Gatewayに `POST /auth/token` (ルートA: AccessKey)エンドポイントを作成する
- [ ] TASK-102 (High): Lambda(ルートA)を実装する: AccessKey照合ロジック
- [ ] TASK-103 (High): Lambda共通処理: JWTヘッダー・ペイロード組み立て + KMS `Sign` 呼び出しによる署名処理を実装する
- [ ] TASK-104 (High): 発行するJWTのクレーム設計(`iss`, `sub`, `iat`, `exp` 等)を確定する
- [ ] TASK-105 (High): JWT有効期限を開発中は30日に設定する
- [ ] TASK-106 (Mid): API Gatewayに `POST /auth/token/cognito` (ルートB: Cognito ID Token)エンドポイントを作成する
- [ ] TASK-107 (Mid): Lambda(ルートB)を実装する: CognitoのJWKS取得・ID Token署名検証ロジック
- [ ] TASK-108 (Mid): ルートB検証OK後、Cognitoトークンの`sub`/`email`を自前JWTの`sub`に引き継ぐ処理を実装する
- [ ] TASK-109 (Mid): ルートA・ルートBの単体テスト、異常系(不正AccessKey・不正Token)のテストを作成する

## Phase 2: Cognito設定(検証環境以降)

- [ ] TASK-201 (Mid): 検証環境用 Cognito User Poolを作成する
- [ ] TASK-202 (Mid): Cognito Hosted UI(またはカスタムログイン画面)を設定する
- [ ] TASK-203 (Mid): 検証環境用ユーザーを作成する(社内メンバー分)
- [ ] TASK-204 (Mid): コールバックURL・ドメイン設定を行う
- [ ] TASK-205 (Low): 本番用 Cognito User Poolの設計(検証環境と分離するか含め)を行う

## Phase 3: WebAPI受口(検証ロジック実装)

- [ ] TASK-301 (High): Lambda(Mock WebAPI)にKMS公開鍵によるJWT検証ロジックを実装する
- [ ] TASK-302 (High): 検証NG時(署名不正・期限切れ)に401を返す処理を実装する
- [ ] TASK-303 (Mid): Spring Boot側にKMS公開鍵(PEM)を用いたJWT検証フィルタを実装する(`spring-security-oauth2-resource-server`等)
- [ ] TASK-304 (Mid): Spring Boot側の検証ロジックについて、ローカル環境・検証環境で同一コードパスとなることを確認するテストを作成する
- [ ] TASK-305 (Mid): クロックスキュー吸収のためのleeway設定をローカル環境向けに追加する

## Phase 4: フロントエンド(Flutter-Web)

- [ ] TASK-401 (High): ビルドフレーバー(`--dart-define=ENV=local/demo/prod`)の仕組みを導入する
- [ ] TASK-402 (High): `.env`からAccessKeyを読込み、ルートAへ送信してJWTを取得する処理を実装する(`ENV=local`)
- [ ] TASK-403 (High): 取得したJWTをSecureStorageに保存する処理を実装する
- [ ] TASK-404 (High): 全APIリクエストにJWTを付与するHTTP Interceptorを実装する
- [ ] TASK-405 (High): 401応答時に、`ENV=local`は自動でAccessKeyから再発行するリトライ処理を実装する
- [ ] TASK-406 (Mid): `ENV=local`以外の場合にCognitoログイン画面へ遷移する処理を実装する
- [ ] TASK-407 (Mid): Cognitoログイン成功後、ID Tokenをルート Bへ送信してJWTを取得する処理を実装する
- [ ] TASK-408 (Mid): 401応答時に、`ENV=local`以外はSecureStorageのJWTを破棄しログイン画面へ遷移する処理を実装する
- [ ] TASK-409 (High): `.env.sample`(ダミー値)をリポジトリに追加し、`.env`自体は`.gitignore`に含める
- [ ] TASK-410 (High): `ENV=demo`/`ENV=prod`ビルド成果物にAccessKeyの実体が含まれていないことを確認する(ビルド後のJS/asset調査)

## Phase 5: 移行(Mock → Fargate/Spring Boot + Aurora)

- [ ] TASK-501 (Low): Spring Boot受口をコンテナ化する(Dockerfile作成)
- [ ] TASK-502 (Low): Fargateタスク定義・サービスを作成する(タスク数2以上でALB配下に配置)
- [ ] TASK-503 (Low): API GatewayのLambda統合をALB/VPCリンク統合へ切り替える
- [ ] TASK-504 (Low): データストアをDynamoDBからAurora MySQL Serverlessへ移行する(スキーマ設計・移行スクリプト含む)
- [ ] TASK-505 (Low): 移行後もJWT発行・検証ロジックに変更が不要であることを回帰テストで確認する

## Phase 6: 申し送り事項(本タスクの対象外・後続検討)

- [ ] TASK-601 (Low): リフレッシュトークン方式の導入要否を検討する
- [ ] TASK-602 (Low): 本番環境のJWT有効期限を1〜2時間程度に短縮する対応を行う
- [ ] TASK-603 (Low): WAF(IP制限 or Basic認証)の方式選定・導入を行う
- [ ] TASK-604 (Low): CloudFront経由でのフロントエンド配信(S3直公開の廃止)を検討する
