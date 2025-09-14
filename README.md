<details>

<summary>Mac環境構築</summary>

# Mac 環境構築

## AWS CLI

https://docs.aws.amazon.com/ja_jp/cli/latest/userguide/getting-started-install.html

```
curl "https://awscli.amazonaws.com/AWSCLIV2.pkg" -o "AWSCLIV2.pkg"
sudo installer -pkg ./AWSCLIV2.pkg -target /
aws --version
rm -f AWSCLIV2.pkg
```

## AWS CDK の前提条件

https://docs.aws.amazon.com/ja_jp/cdk/v2/guide/prerequisites.html

### Node.js

https://nodejs.org/ja/download

```
# nvmをダウンロードしてインストールする：
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
# シェルを再起動する代わりに実行する
\. "$HOME/.nvm/nvm.sh"
# Node.jsをダウンロードしてインストールする：
nvm install 22
# Node.jsのバージョンを確認する：
node -v # "v22.19.0"が表示される。 # "v24.3.0"となった
# npmのバージョンを確認する：
npm -v # "10.9.3"が表示される。 # "11.4.2"となった
```

### TypeScript

```
npm i -g typescript
# -g でインストールされたパッケージ確認
npm list -g
```

## AWS CDK の開始方法

https://docs.aws.amazon.com/ja_jp/cdk/v2/guide/getting-started.html

```
npm i -g aws-cdk
npm list -g
cdk --version
```

## 認証とアクセスの認証情報

https://docs.aws.amazon.com/ja_jp/cli/v1/userguide/cli-chap-authentication.html

[マネジメントコンソール > IAM > Users] > [Create user]を押下
[cli]を作成

- マネジメントコンソール利用しない
- [Attach policies directry] > [AdministratorAccess]を付与

**強力な権限なので、[認証情報 > Access Key > Actions > Deactive]にすること**

以前の不要な記述が存在しないかどうかを確認

```
cat ~/.aws/config
cat ~/.aws/credentials
```

作成した[Access Key], [Secret Key]を設定

```
aws configure
```

設定を確認

```
aws configure list
```

## チュートリアル: 最初の AWS CDK アプリを作成する

https://docs.aws.amazon.com/ja_jp/cdk/v2/guide/hello-world.html

</details>

<details>

<summary>Windows環境構築</summary>

# Windows 環境構築

## AWS CLI

msiexec.exe /i https://awscli.amazonaws.com/AWSCLIV2.msi

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

### コマンドプロンプトを開き、version を確認

```
node --version
npm --version
npx --version
```

## TypeScript

コマンドプロンプトを開き、以下のコマンドを実行

```
cd "C:\Users\_username_\dev\workspaces\fasse_infra"
# 以下は初回のみで良い
# npm init -y
npm i -g typescript ts-node @types/node
# 以下は初回のみで良い
# npx tsc --init
```

## aws-cdk

コマンドプロンプトを開き、以下のコマンドを実行

```
npm i -g aws-cdk
cdk --version
```

## 認証とアクセスの認証情報

https://docs.aws.amazon.com/ja_jp/cli/v1/userguide/cli-chap-authentication.html

[マネジメントコンソール > IAM > Users] > [Create user]を押下
[cli]を作成

- マネジメントコンソール利用しない
- [Attach policies directry] > [AdministratorAccess]を付与

**強力な権限なので、[認証情報 > Access Key > Actions > Deactive]にすること**

以前の不要な記述が存在しないかどうかを確認

```
cat ~/.aws/config
cat ~/.aws/credentials
```

作成した[Access Key], [Secret Key]を設定

```
aws configure
```

設定を確認

```
aws configure list
```

## チュートリアル: 最初の AWS CDK アプリを作成する

https://docs.aws.amazon.com/ja_jp/cdk/v2/guide/hello-world.html

## Commands

### PowerShell で権限を付与して npm コマンドを実行する方法

~~Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process~~
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
Get-ExecutionPolicy

### [package.json]に["scripts"].["build"]を記述後は以下でコンパイル可能

npm run build

### [package.json]に["scripts"].["start"]を記述後は以下でサーバー起動可能

npm start

### [npx tsc --init]実行後は以下でコンパイル可能

npx tsc

### TypeScript コンパイル

npx tsc app.ts

### aws-cdk

cdk --version

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

</details>
