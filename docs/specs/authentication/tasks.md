# tasks.md — 認証基盤(JWT / KMS / Cognito)実装タスク

凡例: `[x]` 完了 / `[ ]` 未完了 / 優先度 High=必須, Mid=後続, Low=申し送り事項

## 基盤準備

- [x] TASK-001 (High): AWS KMS非対称鍵(KeySpec: `RSA_2048`, KeyUsage: `SIGN_VERIFY`)をstg環境のCDKスタックで作成する
- [ ] TASK-001b (High): dev環境のCDKスタックは、stg環境のKMSキーARNをCDK contextで受け取りインポートする(REQ-108。現在の実装はdev環境でもKMSキーを新規作成しており未準拠)
- [ ] TASK-002 (High): KMSキーに対するIAMポリシーを設計する(dev環境・stg環境それぞれのLambda実行ロールに対し、共用のKMSキーへの`kms:Sign`・`kms:GetPublicKey`を付与する。現在の実装は`kms:Sign`のみ付与)
- [x] TASK-003 (High): `aws kms get-public-key` で公開鍵をエクスポートし、PEM形式に変換する手順をドキュメント化する(README「Deploy」)
- [ ] TASK-004 (High): AccessKeyの生成方法・配布経路(パスワードマネージャー等)を決定し、運用ルールをドキュメント化する(生成手順はREADME記載済み。配布経路の運用ルールは未記載)
- [ ] TASK-005 (High): メンバーごとに個別のAccessKeyを生成し、事前登録リストに登録する(REQ-102。dev環境・stg環境で同一セットを共用する。登録手順はREADME記載済み。実施状況は要確認)
- [ ] TASK-006 (Mid): dev環境の動作確認完了後に`cdk destroy`で速やかに破棄する運用手順をドキュメント化する(REQ-109)
- [ ] TASK-007 (Mid): KMSキーローテーション(漏洩時のみ実施)時の公開鍵再配布手順(WebAPI受口への反映方法を含む)を運用ドキュメントとして整備する(NFR-006)
- [ ] TASK-008 (Mid): メンバー離脱・AccessKey漏洩疑い時に、事前登録リストから該当AccessKeyを削除する運用手順をドキュメント化する(発行済みJWTは削除後も最長30日間有効なままである旨を明記する。NFR-007)
- [x] TASK-009 (High): `lib/config.ts`の`EnvName`型に`dev`を定義し、dev環境用のパラメータ(アカウントID/リージョン/リソース名等)を定義する
- [x] TASK-010 (High): `bin/fasse_infra.ts`で、CDK context(`-c env=<dev|stg>`)によりデプロイ対象環境を選択できるようにする

## JWT発行基盤(API Gateway + Lambda)

- [x] TASK-101 (High): API Gatewayに `POST /auth/token` (ルートA: AccessKey)エンドポイントを作成する(REQ-107)
- [ ] TASK-101b (High): ルートA・ルートBに対応するCDK Constructを共通化する(現在の実装は`FasseInfraStack`内に直接定義。dev環境・stg環境の双方に同一構成で作成される点は実装済み。REQ-107)
- [x] TASK-102 (High): Lambda(ルートA)を実装する: AccessKey照合ロジック(SHA-256ハッシュで照合)
- [x] TASK-103 (High): Lambda共通処理: JWTヘッダー・ペイロード組み立て + KMS `Sign` 呼び出しによる署名処理を実装する
- [x] TASK-104 (High): 発行するJWTのクレーム(`iss`, `sub`, `iat`, `exp`)を確定する
- [x] TASK-105 (High): JWT有効期限を30日に設定する
- [x] TASK-106 (Mid): API Gatewayに `POST /auth/token/cognito` (ルートB: Cognito ID Token)エンドポイントを作成する
- [x] TASK-107 (Mid): Lambda(ルートB)を実装する: CognitoのJWKS取得・ID Token署名検証ロジック
- [x] TASK-107b (Mid): dev環境のルートB Lambdaは専用のCognito User Poolを持たず、stg環境のUser Pool(context指定)のJWKSを参照する(REQ-107)
- [x] TASK-108 (Mid): ルートB検証OK後、Cognitoトークンの`sub`を自前JWTの`sub`に引き継ぐ処理を実装する
- [ ] TASK-109 (Mid): ルートA・ルートBの単体テスト、異常系(不正AccessKey・不正Token)のテストを作成する
- [x] TASK-110 (High): ルートA・ルートBのAPI Gatewayにスロットリング(レート制限: 10 req/sec、バースト制限: 20)を設定する(NFR-005)
- [x] TASK-111 (High): stg環境にWAF(`wafv2.CfnWebACL`)を作成し、API Gatewayに関連付ける(NFR-004。dev環境は対象外)
- [x] TASK-112 (Mid): API Gatewayの`defaultCorsPreflightOptions`の`allowHeaders`に`Authorization`を含める(`Cors.DEFAULT_HEADERS`を指定)

## Cognito設定(stg環境)

- [x] TASK-201 (High): stg環境用 Cognito User Poolを`FasseInfraStack`にCDKで作成する(セルフサインアップ無効、サインイン方式はユーザー名(`demo1`等、メール形式に限らない)+emailエイリアス。パスワードポリシーは最小6文字、複雑性要件なし。dev環境は専用Poolを作らずcontext経由でstgの値を共用する。REQ-107・REQ-110)
- [x] TASK-202 (High): Cognito Hosted UIドメイン(User Pool Domain)と、publicクライアント(シークレットなし、Authorization Code Grant + PKCE、スコープ`openid`/`email`)のApp ClientをCDKで作成する(REQ-110)
- [ ] TASK-203 (High): `demo1`, `demo2`のように、複数のデモユーザーを`aws cognito-idp admin-create-user`等で作成する(REQ-110。作成手順はREADME記載済み。実施状況は要確認)
- [x] TASK-204 (Mid): fasse_frontの`auth_callback.html`に対応するコールバックURL・ログアウトURLをCDK context(`cognitoCallbackUrls`)で指定する
- [ ] TASK-205 (Low): prod用 Cognito User Poolの設計(stg環境と分離するか含め)を行う

## WebAPI受口(検証ロジック)

- [x] TASK-301 (High): 6つのLambda(items/suppliers/menus/tax-rates/purchases/sales)共通のJWT検証処理(KMS公開鍵によるBearer Token検証)を`lib/lambda/common/`配下に実装する
- [x] TASK-301b (High): TASK-301の共通検証処理(`withJwtAuth`)を、6つのLambdaのハンドラそれぞれに組み込む
- [x] TASK-302 (High): 検証NG時(署名不正・期限切れ)に401を返す処理を実装する
- [ ] TASK-303 (Mid): Spring Boot側にKMS公開鍵(PEM)を用いたJWT検証フィルタを実装する(`spring-security-oauth2-resource-server`等)
- [ ] TASK-304 (Mid): Spring Boot側の検証ロジックについて、dev環境・stg環境で同一コードパスとなることを確認するテストを作成する

## フロントエンド(Flutter-Web、fasse_front)

fasse_front では、ビルドフレーバー(`ENV`)ではなく「`.env`に`ACCESS_KEY`があればルートA、無ければCognito(ルートB)」という方式で認証経路を切り替えている。REQ-301〜306との整合を取るまで、以下は未完了として扱う。

- [ ] TASK-401 (High): ビルドフレーバー(`--dart-define=ENV=local/stg/prod`)の仕組みを導入する
- [ ] TASK-402 (High): `.env`からAccessKeyを読込み、ルートAへ送信してJWTを取得する処理を実装する(`ENV=local`)
- [ ] TASK-403 (High): 取得したJWTをSecureStorageに保存する処理を実装する
- [ ] TASK-404 (High): 全APIリクエストにJWTを付与するHTTP Interceptorを実装する
- [ ] TASK-405 (High): 401応答時に、`ENV=local`は自動でAccessKeyから再発行するリトライ処理を実装する
- [ ] TASK-406 (Mid): `ENV=local`以外の場合にCognitoログイン画面へ遷移する処理を実装する
- [ ] TASK-407 (Mid): Cognitoログイン成功後、ID TokenをルートBへ送信してJWTを取得する処理を実装する
- [ ] TASK-408 (Mid): 401応答時に、`ENV=local`以外はSecureStorageのJWTを破棄しログイン画面へ遷移する処理を実装する
- [ ] TASK-409 (High): `.env.sample`(ダミー値)をリポジトリに追加し、`.env`自体は`.gitignore`に含める
- [ ] TASK-410 (High): `ENV=stg`/`ENV=prod`ビルド成果物にAccessKeyの実体が含まれていないことを確認する(ビルド後のJS/asset調査)

## WebAPI受口の置き換え(Fargate/Spring Boot + Aurora)

- [ ] TASK-501 (Low): Spring Boot受口をコンテナ化する(Dockerfile作成)
- [ ] TASK-502 (Low): Fargateタスク定義・サービスを作成する(タスク数2以上でALB配下に配置)
- [ ] TASK-503 (Low): API GatewayのLambda統合をALB/VPCリンク統合へ切り替える
- [ ] TASK-504 (Low): データストアをDynamoDBからAurora MySQL Serverlessへ置き換える(スキーマ設計・移行スクリプト含む)
- [ ] TASK-505 (Low): 置き換え後もJWT発行・検証ロジックに変更が不要であることを回帰テストで確認する

## 申し送り事項

- [ ] TASK-601 (Low): リフレッシュトークン方式の導入要否を検討する
- [ ] TASK-602 (Low): prod環境のJWT有効期限を1〜2時間程度に短縮する対応を行う
- [ ] TASK-603 (Low): WAF(IP制限 or Basic認証)の方式選定・導入を行う
