# 実装タスク

## 仕様の承認

- [ ] requirements.md のレビュー・承認(実施状況は要確認)
- [ ] design.md のレビュー・承認(us-east-1のWAFスタック分割・`crossRegionReferences`方式を含む。実施状況は要確認)

## S3 + CloudFront(stg環境のみ)

- [x] `aws-cdk-lib/aws-s3-deployment`, `aws-cdk-lib/aws-cloudfront`, `aws-cdk-lib/aws-cloudfront-origins` を利用可能にする(いずれも`aws-cdk-lib`本体に同梱)
- [x] `lib/fasse_infra-stack.ts` に S3バケット定義を追加する(`${resourcePrefix}-web`、`BLOCK_ALL`、`S3_MANAGED`暗号化、`DESTROY`+`autoDeleteObjects`)
- [x] `lib/fasse_infra-stack.ts` に CloudFront Distribution定義を追加する(OAC、`REDIRECT_TO_HTTPS`、`defaultRootObject: index.html`、403/404→index.htmlのエラーレスポンス)
- [x] `lib/fasse_infra-stack.ts` に `BucketDeployment` を追加する(`Source.asset('../fasse_front/build/web')`、`distribution`/`distributionPaths: ['/*']`、`memoryLimit: 1024`)
- [x] CloudFrontのドメインを `CfnOutput` として出力する
- [x] `FasseInfraStackProps` に `webAclArn?: string` を追加し、`webAclId` に受け渡す(stg以外は未設定)

## WAF(us-east-1専用スタック)

- [x] `lib/fasse-web-acl-stack.ts` を作成し、`scope: CLOUDFRONT` のWAFv2 WebACL(`AWSManagedRulesCommonRuleSet`のみ)を定義する
- [x] `bin/fasse_infra.ts` で、`envName === 'stg'` の場合のみ `FasseWebAclStack` を `us-east-1` に作成し、`crossRegionReferences: true` を設定した上でARNを `FasseInfraStack` へ渡す
- [x] `FasseInfraStack` 側にも `crossRegionReferences: true` を設定する

## 検証

- [x] ユニットテスト(`test/fasse_infra.test.ts`): S3バケットの`BlockPublicAccess`設定、CloudFrontのHTTPS強制・SPAエラーレスポンス、`FasseWebAclStack`のWebACL定義を検証する
- [ ] ユニットテスト: `webAclArn` を渡した場合にCloudFrontへWAFが関連付けられることを検証する
- [ ] `../fasse_front/build/web` が存在しない場合に `npx cdk synth` がエラーになることを確認する(実施状況は要確認)
- [ ] `fasse_front` 側で `flutter build web --dart-define=ENV=stg` を実行し、`npx cdk diff` → `npx cdk deploy --all` を実行する(実施状況は要確認)
- [ ] `BucketDeployment` の同期処理がOutOfMemoryを起こさず完了することを確認する(`memoryLimit: 1024`。実施状況は要確認)
- [ ] デプロイ後、`CfnOutput` のCloudFrontドメインにブラウザでアクセスし、Flutter-Webアプリの表示・SPAルーティング(直接URL指定でのリロード)・WAF関連付け(AWSコンソール上での確認)を確認する(実施状況は要確認)

## 申し送り事項(design.md 6節も参照)

- [ ] WAF方式(IP制限 / Basic認証)の選定(認証仕様と共通の未決定事項)
- [ ] CloudFrontの独自ドメイン化(Route53/ACM)
- [ ] dev環境・prod環境向けフロントエンド配信構成
- [ ] `flutter build web` を含むCI/CDパイプライン自動化
