# design.md — フロントエンド配信基盤(S3 / CloudFront)

## 1. アーキテクチャ概要

```mermaid
flowchart LR
    Dev["デプロイ担当者 / CI"]
    FlutterBuild["flutter build web\n(fasse_front)"]
    BuildDir["../fasse_front/build/web\n(ローカルディレクトリ)"]

    subgraph UsEast1["us-east-1スタック(FasseWebAclStack-stg)"]
        WebAcl["WAFv2 WebACL(scope: CLOUDFRONT)\nAWSManagedRulesCommonRuleSet"]
    end

    subgraph StgStack["stgスタック(FasseInfraStack-stg, ap-northeast-1)"]
        CDKApp["cdk deploy"]
        S3["S3 Bucket: fasse-stg-web\n(BLOCK_ALL / SSE-S3 / OACのみ許可)"]
        CF["CloudFront Distribution\n(既定ドメイン, HTTPS強制, SPAエラーハンドリング)"]
    end

    Browser["ブラウザ(利用者)"]

    Dev --> FlutterBuild --> BuildDir
    BuildDir -->|BucketDeployment(Asset)| CDKApp
    CDKApp -->|デプロイ| S3
    CDKApp -->|キャッシュ無効化(/*)| CF
    CF -->|OAC経由で取得| S3
    WebAcl -.crossRegionReferences.-> CF
    Browser -->|HTTPS| CF
```

`fasse_infra` のCDKアプリは `flutter build web` 自体を実行しない。デプロイ担当者(またはCI)が事前に `fasse_front` で `flutter build web` を実行し、生成された `build/web` を `cdk deploy` 実行時にCDKアセットとして取り込む。

## 2. 設計方針

- 既存の `lib/fasse_infra-stack.ts` の方針(スタック分割をせず単一スタックに集約)を踏襲し、S3バケット・CloudFront Distributionは `FasseInfraStack` 内に追加する
- ただし、CloudFront用WAFv2 WebACL(`scope: CLOUDFRONT`)は技術的制約により `us-east-1` でしか作成できないため、この部分のみ例外的に別スタック(`FasseWebAclStack-stg`)に切り出し、`crossRegionReferences: true` でARNを受け渡す。この分割はアーキテクチャ上の都合であり、それ以外の点(環境ごとのスタック運用等)は既存方針を変更しない
- ビルド成果物の取り込みは `aws-s3-deployment` モジュールの `BucketDeployment` + `Source.asset('../fasse_front/build/web')` を用いる。CDKアセットの仕組みにより、`cdk synth`/`cdk deploy` 時点でディレクトリの中身がハッシュ化されS3(CDK Bootstrap用バケット)経由でステージングされ、`BucketDeployment` がカスタムリソース(Lambda)を通じて配信用バケットへ同期する

## 3. コンポーネント設計

### 3.1 S3バケット

```ts
const webBucket = new s3.Bucket(this, 'WebBucket', {
  bucketName: `${resourcePrefix}-web`,
  blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
  encryption: s3.BucketEncryption.S3_MANAGED,
  removalPolicy: cdk.RemovalPolicy.DESTROY,
  autoDeleteObjects: true,
});
```

- パブリックアクセスは完全ブロック(REQ-102)。バケットポリシーはCDKが `S3BucketOrigin.withOriginAccessControl()` 使用時に自動生成する、CloudFrontのOACからのみ許可するステートメントに限定する(NFR-103)
- ビルド成果物のみを保持する再生成可能なバケットのため、`DESTROY` + `autoDeleteObjects: true` とし、スタック削除時に手動でのオブジェクト削除作業を不要にする(REQ-103)

### 3.2 CloudFront Distribution

```ts
const distribution = new cloudfront.Distribution(this, 'WebDistribution', {
  defaultBehavior: {
    origin: cloudfrontOrigins.S3BucketOrigin.withOriginAccessControl(webBucket),
    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
  },
  defaultRootObject: 'index.html',
  errorResponses: [
    { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html' },
    { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html' },
  ],
  webAclId: envName === 'stg' ? webAclArn : undefined,
});
```

- `S3BucketOrigin.withOriginAccessControl()`(aws-cdk-lib 2.180+相当のAPI。本リポジトリの `aws-cdk-lib@^2.260.0` で利用可能)によりOACを自動構成する(REQ-201)。旧来の `S3Origin` + Origin Access Identity(OAI)は用いない
- `viewerProtocolPolicy: REDIRECT_TO_HTTPS` によりHTTP接続をHTTPSへ強制リダイレクトする(REQ-202、NFR-102)
- `errorResponses` により、Flutter-Webのクライアントサイドルーティングで存在しないパスに直接アクセス・リロードされた場合でも、S3が返す403/404を200 + `index.html` へ読み替え、SPAとして正しく初期化させる(REQ-204)
- ドメインはCloudFront既定の `*.cloudfront.net` を用い、`domainNames`/`certificate` は設定しない(REQ-205)
- `webAclId` には後述のus-east-1スタックから受け渡されるWebACLのARNを設定する(REQ-301)。stg環境のみ設定し、それ以外の環境では未設定とする(REQ-401)

### 3.3 デプロイ(BucketDeployment)

```ts
new s3deploy.BucketDeployment(this, 'DeployWebsite', {
  sources: [s3deploy.Source.asset('../fasse_front/build/web')],
  destinationBucket: webBucket,
  distribution,
  distributionPaths: ['/*'],
});
```

- `sources` に `../fasse_front/build/web` を指定することで、`fasse_front` 側でのビルド成果物をそのままCDKアセットとして取り込む(REQ-104配下の実装)
- `distribution`/`distributionPaths: ['/*']` を指定することで、デプロイの都度CloudFrontのキャッシュを自動的に無効化する(REQ-206)。手動での `aws cloudfront create-invalidation` 実行は不要とする

### 3.4 WAF(us-east-1専用スタック)

CloudFront用WAFv2 WebACLは `scope: CLOUDFRONT` の場合、`us-east-1` リージョンでの作成が必須というAWS側の制約がある。そのため、`bin/fasse_infra.ts` にて以下のように専用スタックを追加し、stgスタックとクロスリージョンで連携する。

```ts
// bin/fasse_infra.ts (イメージ)
const app = new cdk.App();
const envName = (app.node.tryGetContext('env') as EnvName | undefined) ?? 'stg';
const config = getConfig(envName);

let webAclArn: string | undefined;
if (envName === 'stg') {
  const webAclStack = new FasseWebAclStack(app, `FasseWebAclStack-${config.envName}`, {
    env: { account: config.account, region: 'us-east-1' },
    crossRegionReferences: true,
    config,
  });
  webAclArn = webAclStack.webAclArn;
}

new FasseInfraStack(app, `FasseInfraStack-${config.envName}`, {
  env: { account: config.account, region: config.region },
  crossRegionReferences: true,
  config,
  webAclArn,
});
```

- `FasseWebAclStack` は `scope: CLOUDFRONT` のWAFv2 WebACLを1つだけ持つ小さなスタックとし、既存のAPI Gateway用WAF(`ApiWebAcl`、`scope: REGIONAL`)と同様に `AWSManagedRulesCommonRuleSet` のみを適用する(REQ-303)
- `crossRegionReferences: true` をアプリ・両スタックの双方に設定することで、CDKが内部的にSSMパラメータ経由でARNを解決し、us-east-1のWebACL ARNをap-northeast-1側のCloudFront Distributionへ受け渡す
- 本機能はstg環境のみ対象のため、`envName === 'stg'` の場合にのみ `FasseWebAclStack` を作成する(REQ-401)。dev環境等でこの分岐に入らない場合、`webAclId` は `undefined` となりWAF未関連付けのCloudFrontとなるが、本仕様ではstg以外のフロントエンド配信自体を構築しないため実質的に影響しない

## 4. IAM・権限方針

- `BucketDeployment` はCDKが内部的に生成するLambda(カスタムリソース)経由でS3への読み書き権限を持つ。この権限はCDK標準の実装に従い、対象バケットへのアクセスに限定される(最小権限の原則に反しない)
- CloudFrontからS3への読み取りは、OACに紐づくバケットポリシーのみで許可し、IAMユーザー・ロールへの恒久的なS3アクセス権限付与は行わない

## 5. デプロイ手順(運用フロー)

1. `fasse_front` で `flutter build web --dart-define=ENV=stg` を実行し、`build/web` を生成する(認証仕様design.md 3.4節のビルドフレーバーに準拠)
2. `fasse_infra` で `npx cdk diff` により差分を確認する(ルートCLAUDE.md方針準拠)
3. `npx cdk deploy` を実行する(`-c env=stg` は省略可。既定値がstgのため)
4. デプロイ完了後、`CfnOutput` として出力されるCloudFrontのドメイン(`*.cloudfront.net`)にアクセスし、Flutter-Webアプリが表示されることを確認する

## 6. 未決定事項・今後の検討課題(申し送り事項)

- WAF方式(IP制限 / Basic認証)の選定。[docs/spec/authentication/design.md](../authentication/design.md) 「7. 未決定事項」と同一の未決定事項であり、本仕様でも決定しない
- CloudFrontの独自ドメイン化(Route53/ACM)の要否・時期
- dev環境・prod環境向けフロントエンド配信構成の要否・時期
- `flutter build web` を含むCI/CDパイプライン自動化の要否・時期
