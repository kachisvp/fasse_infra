# 実装タスク

## 前提

- [ ] requirements.md のレビュー・承認
- [ ] design.md のレビュー・承認(us-east-1のWAFスタック分割・`crossRegionReferences`方式を含む)

## 第一弾(S3 + CloudFront、stg環境のみ)

- [ ] `npm install`: `aws-cdk-lib/aws-s3-deployment`, `aws-cdk-lib/aws-cloudfront`, `aws-cdk-lib/aws-cloudfront-origins` を利用可能にする(いずれも`aws-cdk-lib`本体に同梱のため追加インストールは不要な想定。バージョン確認のみ行う)
- [ ] `lib/fasse_infra-stack.ts` に S3バケット定義を追加する(`${resourcePrefix}-web`、`BLOCK_ALL`、`S3_MANAGED`暗号化、`DESTROY`+`autoDeleteObjects`)
- [ ] `lib/fasse_infra-stack.ts` に CloudFront Distribution定義を追加する(OAC、`REDIRECT_TO_HTTPS`、`defaultRootObject: index.html`、403/404→index.htmlのエラーレスポンス)
- [ ] `lib/fasse_infra-stack.ts` に `BucketDeployment` を追加する(`Source.asset('../fasse_front/build/web')`、`distribution`/`distributionPaths: ['/*']`)
- [ ] CloudFrontのドメインを `CfnOutput` として出力する
- [ ] `FasseInfraStackProps` に `webAclArn?: string` を追加し、`webAclId` に受け渡す(stg以外は未設定のままとする)

## 第二弾(WAF、us-east-1専用スタック)

- [ ] `lib/fasse-web-acl-stack.ts`(新規)を作成し、`scope: CLOUDFRONT` のWAFv2 WebACL(`AWSManagedRulesCommonRuleSet`のみ)を定義する
- [ ] `bin/fasse_infra.ts` を修正し、`envName === 'stg'` の場合のみ `FasseWebAclStack` を `us-east-1` に作成、`crossRegionReferences: true` を設定した上でARNを `FasseInfraStack` へ渡す
- [ ] `FasseInfraStack` 側にも `crossRegionReferences: true` を設定する

## 第三弾(検証)

- [ ] ユニットテスト(`test/fasse_infra.test.ts`): S3バケットの`BlockPublicAccess`設定、CloudFrontのOAC構成、WAF関連付けを`Template.hasResourceProperties`で検証する
- [ ] `npx cdk synth` がエラーなく完了することを確認する(`../fasse_front/build/web` が存在しない場合はエラーになることも合わせて確認し、フェイルセーフとして機能することを確認する)
- [ ] `fasse_front` 側で `flutter build web --dart-define=ENV=stg` を実行し、`npx cdk diff` → `npx cdk deploy` を実行する
- [ ] デプロイ後、`CfnOutput` のCloudFrontドメインにブラウザでアクセスし、Flutter-Webアプリの表示・SPAルーティング(直接URL指定でのリロード)・WAF関連付け(AWSコンソール上での確認)を確認する
- [ ] `BucketDeployment`の`memoryLimit`を1024MBに設定し、S3同期処理がOutOfMemoryを起こさず完了することを確認する

## 将来(申し送り事項、design.md 6節も参照)

- [ ] WAF方式(IP制限 / Basic認証)の選定(認証仕様と共通の未決定事項)
- [ ] CloudFrontの独自ドメイン化(Route53/ACM)
- [ ] dev環境・prod環境向けフロントエンド配信構成
- [ ] `flutter build web` を含むCI/CDパイプライン自動化
