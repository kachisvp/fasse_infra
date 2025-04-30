<details>

<summary>Windows環境構築</summary>

# Windows環境構築
## Node.js
https://nodejs.org/en
[Download Node.js (LTS)]を押下
[node-v22.15.0-x64.msi]をダブルクリック
[Next] > [I accept the terms in the License Agreement]をチェック > [Next]を押下
[Install Node.js to:]で[Change]を押下
"C:\Users\_username_\dev\nodejs\"を入力 > [OK] > [Next]を押下
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
npm install typescript
```



## Commands
### TypeScriptコンパイル
npx tsc app.ts 


### PowerShellで権限を付与してnpmコマンドを実行する方法
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process
Get-ExecutionPolicy



## References
- [TypeScriptのインストールから実行まで](https://qiita.com/eiji-noguchi/items/8c1d3741ac9f2857b230)
- [TypeScriptを始めよう ~ すぐにできる実行環境構築 ~](https://qiita.com/Yuki-Kurita/items/5e449e2c05aaeeef80ac)
- [npm よく使うコマンドまとめ](https://qiita.com/standard-software/items/2ac49a409688733c90e7)
- [https://qiita.com/ponsuke0531/items/4629626a3e84bcd9398f](https://qiita.com/ponsuke0531/items/4629626a3e84bcd9398f)
- [HTMLのテンプレート的なの](https://qiita.com/matsui-a/items/8d26f66ded3560d3d004)

</details>
