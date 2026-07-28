<details>

<summary>よく使うコマンド</summary>

# Commands

```
npx cdk deploy FasseInfraStack-stg --require-approval never
npx cdk destroy FasseInfraStack-stg

npx cdk diff FasseInfraStack-stg
npx cdk synth FasseInfraStack-stg
npx cdk list
npm test
npm run build
aws logs tail /aws/lambda/<関数名> --follow
aws dynamodb scan --table-name fasse-stg-m-item

# create AccessKey
export accesskey=`openssl rand -base64 32`
echo -n ${accesskey} | shasum -a 256 | awk '{print $1}'

# drawio作成
## cfn-diagram install
npm i -D @mhlabs/cfn-diagram

## CloudFormation templateを、JSON形式で出力
export stackname=<StackName>
mkdir -p drawio
aws cloudformation get-template --stack-name ${stackname} --query TemplateBody > drawio/deployed-template.json

## cfn-diagramでdrawioファイルを出力
npx cfn-dia draw.io --template-file drawio/deployed-template.json --output-file drawio/architecture.drawio
```

</details>

<details>

<summary>Windows環境構築</summary>

# Windows環境構築

## Node.js

https://nodejs.org/en
[Download Node.js (LTS)]を押下
[node-v22.15.0-x64.msi]をダブルクリック
[Next] > [I accept the terms in the License Agreement]をチェック > [Next]を押下
[Install Node.js to:]で[Change]を押下
"C:\Users_username\_\dev\nodejs\"を入力 > [OK] > [Next]を押下
[Next]を押下
[Automatically install the necessary tools. ...]にはチェックを入れない > [Next]を押下
[Install]を押下
[Finish]を押下

### コマンドプロンプトを開き、versionを確認

```
node --version
npm --version
```

## TypeScript

コマンドプロンプトを開き、以下のコマンドを実行

```
cd "C:\Users\_username_\dev\workspaces\fasse_infra"
npm init -y
npm install typescript ts-node @types/node --save-dev
npx tsc --init
```

## aws-cdk

コマンドプロンプトを開き、以下のコマンドを実行

```
npm install -g aws-cdk
mkdir temp; cd temp
cdk init app --language typescript
```

[cdk init]した内容にルートフォルダ配下を差し替える

### Commands

```
# Welcome to your CDK TypeScript project

This is a blank project for CDK development with TypeScript.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `npx cdk deploy`  deploy this stack to your default AWS account/region
* `npx cdk diff`    compare deployed stack with current state
* `npx cdk synth`   emits the synthesized CloudFormation template
```

## Commands

### PowerShellで権限を付与してnpmコマンドを実行する方法

Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process
Get-ExecutionPolicy

### [package.json]に["scripts"].["build"]を記述後は以下でコンパイル可能

npm run build

### [package.json]に["scripts"].["start"]を記述後は以下でサーバー起動可能

npm start

### [npx tsc --init]実行後は以下でコンパイル可能

npx tsc

### TypeScriptコンパイル

npx tsc app.ts

### aws-cdk

cdk --version

## References

### install

- [【Node.js/TypeScript】比較して理解する ts-node](https://qiita.com/Yasushi-Mo/items/d787ee035f0896071394)
- [npm よく使うコマンドまとめ](https://qiita.com/standard-software/items/2ac49a409688733c90e7)

### TypeScript

- [TypeScript Deep Dive 日本語版](https://typescript-jp.gitbook.io/deep-dive/getting-started)

### AWS CDK

- [AWS CDK CLI のインストール](https://docs.aws.amazon.com/ja_jp/cdk/v2/guide/getting-started.html#getting-started-install)
- [チュートリアル: 最初の AWS CDK アプリを作成する](https://docs.aws.amazon.com/ja_jp/cdk/v2/guide/hello-world.html)
- https://docs.aws.amazon.com/ja_jp/cdk/v2/guide/work-with-cdk-typescript.html
- https://dev.classmethod.jp/articles/aws-cdk-typescript-tutorial/
- https://zenn.dev/murakami_koki/articles/81c0bcba772428
- [AWS CDKを使うためTypeScriptに入門したので図解してみた](https://qiita.com/minorun365/items/0c8a59af95309b64d624)
- https://catalog.workshops.aws/typescript-and-cdk-for-beginner/ja-JP/40-cdk-introduction/10-create-project/10-cdk-init

### PowerShell

- [PowerShell](https://qiita.com/ponsuke0531/items/4629626a3e84bcd9398f)

### HTML

- [HTMLのテンプレート的なの](https://qiita.com/matsui-a/items/8d26f66ded3560d3d004)

### Bookmarks

- [TypeScriptのインストールから実行まで](https://qiita.com/eiji-noguchi/items/8c1d3741ac9f2857b230)
- [TypeScriptを始めよう ~ すぐにできる実行環境構築 ~](https://qiita.com/Yuki-Kurita/items/5e449e2c05aaeeef80ac)

## Deploy

Cognito, KMSに関連してdeployに手順が必要だったため記録する

```
# 事前準備: AccessKeyを決める(AWS操作は不要)
## デモユーザーごとにAccessKeyを生成
openssl rand -base64 32
## 生成したAccessKeyのSHA-256ハッシュを計算
echo -n "_accessKey_" | shasum -a 256 | awk '{print $1}'

# 1回目のデプロイ(KMSキー・Cognito User Pool等の箱を作る)
npx cdk deploy FasseInfraStack-stg --require-approval never \
  -c accessKeyHashMapJson='{"newhash123...":"demo1","1db15a85...":"demo2","ee6dc7d8...":"demo3"}' \
  -c cognitoCallbackUrls="http://localhost:5000/auth_callback.html"

## デプロイ完了後、出力(Outputs)に以下が表示されます。
- JwtSigningKeyId: KMSキーID
- CognitoUserPoolId / CognitoUserPoolClientId / CognitoHostedUiDomain

> この時点ではJWT_PUBLIC_KEY_PEMが未設定なので、items等のAPIは全て401を返します(想定通りです)。

# KMS公開鍵をPEM形式でエクスポートする(TASK-003)
aws kms get-public-key --key-id <JwtSigningKeyIdの値> --query PublicKey --output text \
  | base64 -d | openssl rsa -pubin -inform DER -outform PEM -out jwt_public_key.pem

# 2回目のデプロイ(公開鍵を設定し、検証を有効化する)
npx cdk deploy FasseInfraStack-stg --require-approval never \
  -c accessKeyHashMapJson='{"newhash123...":"demo1","1db15a85...":"demo2","ee6dc7d8...":"demo3"}' \
  -c cognitoCallbackUrls="http://localhost:5000/auth_callback.html" \
  -c jwtPublicKeyPemBase64="$(base64 < jwt_public_key.pem | tr -d '\n')"

> これで items等のAPIも正常にJWTを検証できるようになります。

# Cognitoデモユーザーの作成(TASK-203)
aws cognito-idp admin-create-user \
  --user-pool-id <CognitoUserPoolIdの値> \
  --username demo1 \
  --user-attributes Name=email,Value=demo1@example.com Name=email_verified,Value=true \
  --temporary-password '<初期パスワード>'

# fasse_front側の.env設定
ACCESS_KEY=<demo1用に生成したAccessKeyの値>
COGNITO_DOMAIN=<CognitoHostedUiDomainの値>
COGNITO_CLIENT_ID=<CognitoUserPoolClientIdの値>

```

</details>
