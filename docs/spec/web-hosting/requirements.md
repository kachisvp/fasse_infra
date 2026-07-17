# requirements.md — フロントエンド配信基盤(S3 / CloudFront)

## 1. 背景・目的

`fasse_front`(Flutter-Web)は `flutter build web` によりブラウザで動作する静的ファイル一式(`build/web`)を生成する。現状の `fasse_infra` にはこれを配信する仕組み(S3/CloudFront)が存在しないため、新たに構築する。

また、[docs/spec/authentication/design.md](../authentication/design.md) NFR-004にて「stg環境ではCloudFront + WAFを外側の防御として必須で併用すること」と定められており、その詳細設計は同仕様の「6. 対象外」にて本仕様(別紙)に委譲されている。本仕様はその委譲を引き継ぎ、CloudFrontおよび付随するWAFの詳細を定める。

## 2. スコープ

- 配信対象: `fasse_front` の `flutter build web` 成果物(`../fasse_front/build/web`)
- ホスティング: Amazon S3(非公開) + Amazon CloudFront
- デプロイ手段: `fasse_infra` のCDK(`aws-s3-deployment.BucketDeployment`)が、ローカルパス上のビルド成果物を直接アセットとして取り込み、`cdk deploy` 時にS3へアップロード・CloudFrontキャッシュを無効化する
- WAF: [docs/spec/authentication/design.md](../authentication/design.md) NFR-004準拠。CloudFront用WAFv2 WebACL(`us-east-1`必須)をAWSマネージドルールのみで構築する
- 対象環境: 本仕様で構築するのは **stg環境のみ** とする(認証仕様と同様、prod環境は現時点で未構築。dev環境も本機能では対象外とする。理由は4節を参照)

## 3. 前提条件

- `flutter build web` の実行は `fasse_front` 側の責務であり、`fasse_infra` のCDKアプリはこれを自動実行しない。デプロイ担当者(またはCI)が事前に `fasse_front` 側で `flutter build web` を実行し、`build/web` を生成しておく必要がある
- `fasse_front` と `fasse_infra` は同一階層の兄弟ディレクトリとして配置されていることを前提とする(現状の配置と一致)
- `../fasse_front/build/web` が存在しない状態で `cdk synth` / `cdk deploy` を実行した場合はエラーとする(アセット解決失敗によりCDKが合成時に検知する。フェイルセーフとして正しい挙動であり、特別なエラーハンドリングは追加しない)

## 4. 機能要件

### 4.1 S3バケット

- REQ-101: 静的ファイル配信用のS3バケットを新設すること。バケット名は `${resourcePrefix}-web` とする(例: `fasse-stg-web`)
- REQ-102: バケットはパブリックアクセスを完全にブロックすること(`BlockPublicAccess.BLOCK_ALL`)。CloudFront経由(Origin Access Control)以外からの直接アクセスを許可しないこと
- REQ-103: バケットの内容はビルドの都度 `BucketDeployment` により総入れ替えされるものであり、恒久データを保持しない。スタック削除時にバケットも削除できるよう、`removalPolicy: DESTROY` および `autoDeleteObjects: true` を設定すること

### 4.2 CloudFront Distribution

- REQ-201: S3バケットを非公開のままオリジンとして参照するため、Origin Access Control(OAC)を用いること(Origin Access Identity(OAI)等の旧方式は用いない)
- REQ-202: ビューワープロトコルポリシーはHTTPS強制(`redirect-to-https`)とすること
- REQ-203: デフォルトルートオブジェクトを `index.html` とすること
- REQ-204: Flutter-WebのSPA(クライアントサイドルーティング)による直リンク・リロードに対応するため、S3オリジンが403/404を返した場合に `index.html` を200として返すエラーレスポンス設定を行うこと
- REQ-205: ドメインはCloudFront既定ドメイン(`*.cloudfront.net`)を用いる。独自ドメイン(Route53/ACM)は本仕様の対象外とする(6節参照)
- REQ-206: `BucketDeployment` の `distribution`/`distributionPaths` 設定により、デプロイの都度CloudFrontキャッシュ(`/*`)を自動的に無効化すること

### 4.3 WAF(認証仕様 NFR-004準拠)

- REQ-301: CloudFront用のWAFv2 WebACL(`scope: CLOUDFRONT`)を作成し、CloudFront Distributionに関連付けること
- REQ-302: `scope: CLOUDFRONT` のWebACLは `us-east-1` リージョンでのみ作成可能であるため、stgスタックの主リージョン(`ap-northeast-1`)とは別に、`us-east-1` の専用スタックを作成し、`crossRegionReferences: true` によりWebACLのARNをstgスタック側へ受け渡すこと
- REQ-303: 適用するルールは、既存のAPI Gateway用WAF(`lib/fasse_infra-stack.ts` の `ApiWebAcl`)と同様、AWSマネージドルール(`AWSManagedRulesCommonRuleSet`)のみとする。IP制限・Basic認証等の追加方式は、認証仕様の「7. 未決定事項」と同一の未決定事項として扱い、本仕様でも決定しない(6節参照)

### 4.4 対象環境

- REQ-401: 本機能はstg環境のCDKスタックにのみ構築する。dev環境は認証仕様REQ-109により動作確認後に速やかに`cdk destroy`で破棄される一時的なサンドボックスであり、フロントエンド配信という永続的な公開用途とは性質が異なるため、本仕様の対象外とする。prod環境は認証仕様と同様、現時点では未構築とする

## 5. 非機能要件

- NFR-101: S3バケットの保存データは暗号化すること(S3のデフォルト暗号化(SSE-S3)を用いる)
- NFR-102: 通信はCloudFront〜ユーザー間・CloudFront〜S3間ともにTLSで暗号化すること(REQ-202、およびOACはHTTPS通信が前提)
- NFR-103: S3バケットへの直接アクセス経路を残さないこと(REQ-102のBLOCK_ALLに加え、バケットポリシーはCloudFrontのOACからのみ許可する最小権限とすること)

## 6. 対象外(Out of Scope)

- CloudFrontの独自ドメイン(Route53ホストゾーン・ACM証明書)の導入。将来必要になった時点で別途仕様化する
- WAFにおけるIP制限・Basic認証等、AWSマネージドルール以外の追加防御方式の選定(認証仕様design.md「7. 未決定事項」と同一の未決定事項)
- dev環境・prod環境向けのフロントエンド配信構成の構築
- `flutter build web` の自動実行を含むCI/CDパイプラインの構築(現時点ではデプロイ担当者が手動で `flutter build web` → `cdk deploy` を実行する運用とする。自動化は将来の検討課題とする)
