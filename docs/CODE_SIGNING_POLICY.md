# コード署名ポリシー / Code Signing Policy

> **現在の状態**：Windows 版のインストーラーは、まだコード署名されていません。
> SignPath Foundation の無料コード署名プログラムに申請予定です（承認後にこのページを更新します）。
>
> **Status:** Windows installers are currently **not** code-signed. We plan to apply to the
> SignPath Foundation free code signing program for open source projects.

<!-- ▼ SignPath Foundation の承認後、上の「現在の状態」を消して、次の 1 行の先頭の「<!-- 」と末尾の「-->」を外す -->
<!-- Free code signing provided by [SignPath.io](https://about.signpath.io/), certificate by [SignPath Foundation](https://signpath.org/). -->

## 署名するもの / What is signed

- GitHub Releases で配布する Windows のインストーラー（`ARCHYNDIUM-Browser-Setup-<バージョン>.exe`）
- 署名するのは、このリポジトリ（https://github.com/archyndium/archyndium-browser）のソースコードから
  GitHub Actions（`.github/workflows/build.yml`）で自動ビルドしたファイルだけです。手元の PC でビルドしたファイルには署名しません。
- 署名は、`v` から始まるタグ（例：`v0.1.0`）のリリースのビルドに対してだけ行います。
- 他のプロジェクトのソフトウェアや、このリポジトリに含まれない第三者のプログラムには署名しません。

## 役割 / Team roles

| 役割 / Role | 担当 / Members |
|---|---|
| コミッター・レビュアー / Committers and reviewers | [archyndium](https://github.com/archyndium) |
| 承認者 / Approvers | [archyndium](https://github.com/archyndium) |

- すべてのメンバーは、GitHub と SignPath の両方で 2 段階認証（MFA）を使います。
  All team members use multi-factor authentication for GitHub and SignPath.
- 署名のたびに、承認者が SignPath 上で内容（バージョン・ビルド元のコミット）を確認して承認します。
  Every signing request is manually approved by an approver after checking the version and the source commit.
- 外部からのプルリクエストは、コミッターがレビューしてからマージします。
  Contributions from outside the team are reviewed by a committer before they are merged.

## プライバシー / Privacy

このプログラムは、利用者が求めた場合、または下記のプライバシーポリシーに記載した場合を除き、
ほかのネットワーク上のシステムに情報を送信しません。

This program will not transfer any information to other networked systems unless specifically requested
by the user or the person installing or operating it, except as described in the privacy policy below.

→ [プライバシーポリシー / Privacy Policy](../PRIVACY.md)

## 問題の報告 / Reporting

署名されたファイルに問題（不正なファイル・署名の悪用など）を見つけた場合は、
[SECURITY.md](../SECURITY.md) の方法で非公開でお知らせください。
