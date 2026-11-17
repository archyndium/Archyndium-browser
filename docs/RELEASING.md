# リリースの手順

このリポジトリでは、**タグを付けて GitHub に送るだけ**で、GitHub Actions が Windows 版のインストーラーを作り、
Releases に下書きを置きます。手作業でビルドする必要はありません。

---

## 1. 最初の 1 回だけ：GitHub にリポジトリを作る

1. GitHub の**2 段階認証**を有効にする（Settings → Password and authentication）。SignPath の申請条件です。
2. 右上の「+」→「New repository」
   - Repository name：`archyndium-browser`
   - **Public** を選ぶ（オープンソースとして公開するため）
   - 「Add a README」などのチェックは**すべて外す**（このフォルダに既にあるため）
3. このフォルダの中身をアップロードする。どちらか好きな方法で：

**A. GitHub Desktop（初めての方におすすめ）**
1. [GitHub Desktop](https://desktop.github.com/) を入れてログイン
2. 「File」→「Add local repository」→ このフォルダを選ぶ →「create a repository」を押す
3. 左下の Summary に「最初の公開」などと書いて「Commit to main」
4. 「Publish repository」を押す（「Keep this code private」のチェックは外す）

**B. コマンドで**
```bash
git init -b main
git add .
git commit -m "最初の公開"
git remote add origin https://github.com/archyndium/archyndium-browser.git
git push -u origin main
```

4. GitHub の「Actions」タブを開き、「Build」が緑のチェックになることを確認する。
   各実行の画面の「Artifacts」から、できたインストーラーをダウンロードして試せます。
5. 「Settings」→「Code security」→「Private vulnerability reporting」を **Enable** にする（SECURITY.md の報告窓口）。

---

## 2. リリースを出す（毎回）

1. `package.json` の `"version"` を上げる（例：`0.1.0` → `0.2.0`）。初回は `0.1.0` のままで OK。
2. 変更をコミットして GitHub に送る。
3. バージョンと同じ名前のタグを付けて送る（**先頭に v を付ける**。例：`v0.1.0`）
   - GitHub Desktop：「History」で最新のコミットを右クリック →「Create Tag…」→ `v0.1.0` → 上の「Push origin」
   - コマンド：`git tag v0.1.0` → `git push origin v0.1.0`
4. Actions が自動でビルドし、「Releases」に**下書き（Draft）**ができる（10〜15 分ほど）。
5. Releases の下書きを開き、変更点を書いて「**Publish release**」を押す。
   - 公開すると、インストール済みのアプリが自動アップデートで新しい版を受け取ります。
   - 下書きのままでは誰にも見えず、自動アップデートも届きません。

> タグと package.json のバージョンが違うと、ビルドは止まります（間違い防止）。

---

## 3. Microsoft Store に出す

1. [Partner Center](https://partner.microsoft.com/dashboard/apps-and-games) で開発者登録（個人）をする。
2. 「アプリとゲーム」→「新しい製品」→「MSIX または PWA アプリ」→ 名前「ARCHYNDIUM Browser」を予約。
3. 「製品管理」→「製品 ID」に出る次の値を、`package.json` の `build.appx` に書き写す。
   - `Package/Identity/Name` → `identityName`
   - `Package/Identity/Publisher`（`CN=...`）→ `publisher`
4. コミットして送ったら、GitHub の「Actions」→「Store package」→「Run workflow」。
5. できた `.appx`（Artifacts）を Partner Center の「パッケージ」にアップロードする。
6. 価格・説明文・スクリーンショット・年齢区分などを入力して提出。
   入力する文章とスクリーンショットは [docs/store/STORE_LISTING.md](store/STORE_LISTING.md) にまとめてあります。
   - Store 版は Microsoft が署名し、更新も Store が配ります（アプリ内の自動アップデートは Store 版では動きません）。
   - Store の審査では「runFullTrust（デスクトップアプリとしての動作）」の理由を聞かれます。
     「Web ブラウザとして、ユーザーが開いたサイトを表示し、ファイルのダウンロード・保存を行うため」などと説明します。

---

## 4. SignPath で署名する（GitHub 版の SmartScreen 警告を減らす）

[SignPath Foundation](https://signpath.org/) は、オープンソースのプロジェクトに無料でコード署名を提供しています。
ワークフローは署名に対応済みで、**リポジトリの変数を設定するだけ**で署名付きのリリースに切り替わります。

### 申請の前に（済んでいるか確認）

- [ ] リポジトリが Public で、OSI 承認のライセンス（GPLv3）が `LICENSE` にある
- [ ] GitHub の 2 段階認証が有効
- [ ] 署名なしのリリースを 1 回以上公開している（Releases に `v0.1.0` などがある）
- [ ] GitHub Actions でビルドしている（`.github/workflows/build.yml`）
- [ ] README からコード署名ポリシー（`docs/CODE_SIGNING_POLICY.md`）とプライバシーポリシー（`PRIVACY.md`）へリンクしている
- [ ] Windows のウイルス対策ソフトや [VirusTotal](https://www.virustotal.com/) でインストーラーに問題が出ない

> 申請条件や申請方法は変わることがあります。申請前に signpath.org の最新の条件（Terms / Conditions）を必ず確認してください。

### 申請

1. signpath.org の「Apply」から申請フォームを送る。主な記入内容：
   - プロジェクト名：ARCHYNDIUM Browser / リポジトリ：https://github.com/archyndium/archyndium-browser
   - ライセンス：GPL-3.0
   - コード署名ポリシーの URL：`https://github.com/archyndium/archyndium-browser/blob/main/docs/CODE_SIGNING_POLICY.md`
   - ビルド方法：GitHub Actions（GitHub-hosted runner）
2. 審査を待つ（数週間かかることがあります）。この間も署名なしのリリースは出せます。

### 承認されたら

1. SignPath にログインし（2 段階認証を設定）、プロジェクトを開く。
2. **Artifact Configuration**（何に署名するか）に、このリポジトリの `.signpath/artifact-configuration.xml` の内容を設定する。
3. **Trusted Build System** として GitHub.com を設定し、このリポジトリをつなぐ（SignPath の案内に従う）。
4. CI 用のユーザー（Submitter）を作り、**API トークン**を発行する。
5. GitHub のリポジトリの「Settings」→「Secrets and variables」→「Actions」で次を登録する。

   | 種類 | 名前 | 値 |
   |---|---|---|
   | Secret | `SIGNPATH_API_TOKEN` | 4 の API トークン |
   | Variable | `SIGNPATH_ORGANIZATION_ID` | SignPath の Organization ID |
   | Variable | `SIGNPATH_PROJECT_SLUG` | SignPath のプロジェクトの slug（例：`archyndium-browser`） |
   | Variable | `SIGNPATH_SIGNING_POLICY_SLUG` | 署名ポリシーの slug（例：`release-signing`） |
   | Variable | `SIGNPATH_ENABLED` | `true` |

6. `docs/CODE_SIGNING_POLICY.md` の「現在の状態」を消し、「Free code signing provided by SignPath.io, certificate by SignPath Foundation」の行を有効にする。
   README の「Windows によって PC が保護されました」の説明も「署名あり」に書き換える。
7. 次のバージョンのタグを送ると、ビルドの途中で SignPath に署名リクエストが届く。
   **SignPath の画面で内容を確認して「Approve」を押す**と署名され、署名済みのファイルで Releases の下書きが作られる。
   （承認を待つ間、Actions は最大 1 時間待ちます。間に合わなければ失敗するので、もう一度実行してください）

### 知っておくこと

- 署名の発行元（ファイルのプロパティの「デジタル署名」）は **「SignPath Foundation」** と表示されます（archyndium ではありません）。
- 署名しても、**すぐに SmartScreen の警告が消えるとは限りません**。SmartScreen はダウンロード数などの実績で判断するため、
  署名付きのファイルが多くの人にダウンロードされるにつれて、警告が出にくくなります。
- 署名をやめたい・一時的に止めたい時は、変数 `SIGNPATH_ENABLED` を `false` にすれば、署名なしのリリースに戻ります。

---

## 5. GitHub Sponsors

1. GitHub の [Sponsors](https://github.com/sponsors) から登録する（口座情報・税情報の入力があります）。
2. `.github/FUNDING.yml` は設定済み（`github: [archyndium]`）なので、承認されるとリポジトリのページの「Sponsor」ボタンから支援できるようになります。

---

## 困った時

- **Actions が赤い ✗ になった** … 失敗した実行を開き、赤い行のエラーを確認する。「構文チェック」で失敗した場合は、
  手元で `npm run check` を実行すると同じエラーが出ます。
- **アイコンを変えたい** … `build/icon.svg`（1024×1024、背景透明）を差し替えて `npm run icons` を実行する。
  `.ico`・Store 用の画像（`build/appx/`）・`build/icon.png` がすべて作り直されるので、コミットして送る。
- **ライセンス一覧を更新したい** … 依存パッケージを変えたら `npm run notices` を実行して `THIRD_PARTY_NOTICES.md` を作り直す。
