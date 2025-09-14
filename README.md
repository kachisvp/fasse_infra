<details>

<summary>Mac環境構築</summary>

# AWS CLI

https://docs.aws.amazon.com/ja_jp/cli/latest/userguide/getting-started-install.html

```
curl "https://awscli.amazonaws.com/AWSCLIV2.pkg" -o "AWSCLIV2.pkg"
sudo installer -pkg ./AWSCLIV2.pkg -target /
aws --version
rm -f AWSCLIV2.pkg
```

# AWS CDK の前提条件

https://docs.aws.amazon.com/ja_jp/cdk/v2/guide/prerequisites.html

## Node.js

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

## TypeScript

```
npm i -g typescript
# -g でインストールされたパッケージ確認
npm list -g
```

# AWS CDK の開始方法

https://docs.aws.amazon.com/ja_jp/cdk/v2/guide/getting-started.html

```
npm i -g aws-cdk
npm list -g
cdk --version
```

# 認証とアクセスの認証情報

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

# チュートリアル: 最初の AWS CDK アプリを作成する

https://docs.aws.amazon.com/ja_jp/cdk/v2/guide/hello-world.html

</details>
