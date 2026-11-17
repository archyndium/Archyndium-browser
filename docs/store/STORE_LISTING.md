# Microsoft Store 掲載情報

Partner Center の入力欄にそのまま貼り付けて使う文章です。日本語（ja-JP）と英語（en-US）の両方を登録します
（`package.json` の `build.appx.languages` に 2 つの言語を入れているため、両方の掲載情報が必要です）。

スクリーンショットは `docs/store/screenshots/`（1920×1080）、Store 用のロゴは `build/store-listing-300.png` を使います。

---

## 共通（言語に関係ない欄）

| 欄 | 入力する内容 |
|---|---|
| アプリ名 | ARCHYNDIUM Browser |
| カテゴリ | 生産性（Productivity） |
| プライバシーポリシーの URL | https://github.com/archyndium/Archyndium-browser/blob/main/PRIVACY.md |
| Web サイト | https://github.com/archyndium/Archyndium-browser |
| サポートの連絡先 | https://github.com/archyndium/Archyndium-browser/issues |
| 著作権と商標の情報 | © 2026 archyndium |
| 追加のライセンス条項 | This app is open source software licensed under the GNU General Public License v3.0. Source code: https://github.com/archyndium/Archyndium-browser |

---

## 日本語（ja-JP）

### 説明

```
ARCHYNDIUM Browser は、音楽を聴きながら Web を使う人のための、デザイン重視の無料ブラウザです。

どのタブで流している音楽も、サイドバーのプレイヤーやミニプレイヤーからまとめて操作でき、
再生中の曲の歌詞を、再生位置に合わせてカラオケのように表示します。
歌詞が見つからない曲は、手持ちの .lrc ファイルを読み込んだり、歌詞エディタで曲を聴きながら
Space キーでタイミングを付けて、自分で作ったりできます。

ブラウザとしての機能もそろっています。
・タブのグループ・ピン留め・まとめて閉じる、閉じたタブとセッションの復元
・2 つのページを左右・上下に並べる分割表示、複数ウィンドウ
・広告・トラッカーのブロック（サイトごと・タブごとに切り替え）
・コマンドパレット、ページ内検索、リーダーモード、翻訳、PDF の表示と保存
・ブックマーク（Chrome・Edge・Brave などから取り込み可）、履歴、ダウンロード管理、メモ
・シークレットモード、12 種類のテーマ、拡張機能

利用状況の収集（テレメトリ）は行いません。ソースコードは GitHub で公開しています（GPLv3）。
```

### 新機能（このバージョンの新機能）

```
最初の公開版です。
```

### 製品の機能（1 行ずつ別の欄に入力）

```
再生中のタブの音楽をサイドバーとミニプレイヤーから操作
再生位置に合わせて歌詞をカラオケ表示
自分の .lrc ファイルの読み込みと、タイミングを付けられる歌詞エディタ
2 つのページを並べて使える分割表示
広告・トラッカーのブロック（サイト・タブごとに切り替え）
コマンドパレットですべての操作をキーボードから
他のブラウザからブックマークを取り込み
テレメトリなし・オープンソース（GPLv3）
```

### 検索用キーワード（最大 7 個）

```
ブラウザ
歌詞
カラオケ
音楽
広告ブロック
分割表示
lrc
```

### スクリーンショットの説明（任意。画像ごと）

| ファイル | 説明 |
|---|---|
| 1-lyrics.png | 再生中の曲の歌詞をカラオケ表示 |
| 2-split.png | 2 つのページを並べて表示 |
| 3-lyrics-editor.png | 歌詞エディタで自分の歌詞を作る |
| 4-command-palette.png | コマンドパレットですばやく操作 |
| 5-shield.png | 広告・トラッカーのブロック |

---

## English (en-US)

### Description

```
ARCHYNDIUM Browser is a free, design-focused web browser for people who browse while listening to music.

Control the music playing in any tab from the sidebar player or the always-on-top mini player,
and follow the lyrics of the current song, highlighted line by line in sync with playback.
For songs without lyrics, load your own .lrc file or create one in the built-in lyrics editor:
just press Space at the start of each line while the song plays.

Everyday browsing features are included:
- Tab groups, pinned tabs, bulk close, and session restore
- Split view (side by side or top and bottom) and multiple windows
- Ad and tracker blocking, switchable per site and per tab
- Command palette, find in page, reader mode, translation, PDF viewing and saving
- Bookmarks (import from Chrome, Edge, Brave and more), history, downloads, notes
- Private mode, 12 themes, and browser extensions

No telemetry is collected. The source code is available on GitHub under the GPLv3.
```

### What's new in this version

```
First public release.
```

### Product features

```
Control music playing in any tab from the sidebar and a mini player
Synced, karaoke-style lyrics for the current song
Load your own .lrc files or create timed lyrics in the built-in editor
Split view to use two pages side by side
Ad and tracker blocking, switchable per site and per tab
Command palette for keyboard-driven browsing
Import bookmarks from other browsers
No telemetry, open source (GPLv3)
```

### Search terms

```
browser
lyrics
karaoke
music
ad blocker
split view
lrc
```

---

## 提出時に入力する説明

### 制限付き機能（runFullTrust）の理由

Electron で作ったデスクトップアプリは `runFullTrust` が必要です。理由を聞かれたら次を入力します。

```
ARCHYNDIUM Browser is a desktop web browser built with Electron (Chromium). It requires runFullTrust
to run as a full desktop application: it renders web pages in Chromium's multi-process sandbox,
downloads and saves files to the user's Downloads folder at the user's request, and plays media.
It does not install drivers or services and does not modify system settings without the user's action.
```

### 審査担当者へのメモ（Notes for certification）

```
ARCHYNDIUM Browser is a web browser. No account or sign-in is required.
To test: launch the app, type a URL or search term in the address bar, and play a video or music page
to see the player and lyrics panel (click the lyrics button next to the player).
The app uses the Chromium engine (via Electron) and is updated through the Microsoft Store;
the built-in auto-updater is disabled in the Store version.
Source code: https://github.com/archyndium/Archyndium-browser
```

### 年齢区分（IARC のアンケート）

- アプリの種類は「アプリ（ゲームではない）」を選びます。
- 「ユーザーが制限なくインターネットにアクセスできるか」には **はい**（Web ブラウザのため）と答えます。
  ブラウザは、この回答によって年齢区分が上がることがありますが、正しく答えることが大切です。
- 「ユーザー同士のやり取り」「位置情報の共有」「アプリ内購入」などは、本アプリの機能としてはないので **いいえ** です。
