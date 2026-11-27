# Microsoft Store 掲載情報

Partner Center の入力欄にそのまま貼り付けて使う文章です。日本語（ja-JP）と英語（en-US）の両方を登録します
（`package.json` の `build.appx.languages` に 2 つの言語を入れているため、両方の掲載情報が必要です）。

スクリーンショットは `docs/store/screenshots/`（1920×1080）、Store 用のロゴは `build/store-listing-300.png` を使います。

---

## 共通（言語に関係ない欄）

| 欄 | 入力する内容 |
|---|---|
| アプリ名 | ARCHYNDIUM Browser |
| カテゴリ | 仕事効率化（Productivity）。セカンダリ カテゴリは「音楽」 |
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

どのタブで流している音楽も、ツールバーやミニプレイヤーからまとめて操作でき、
再生中の曲の歌詞を、再生位置に合わせてカラオケのように表示します。
アドレスバーの下に今の歌詞を 1 行だけ出すこともでき、新しいタブを開くと、
音楽に合わせて色の波が流れるスタートページに、再生中の曲と今の歌詞が表示されます。
歌詞が見つからない曲は、手持ちの .lrc ファイルを読み込んだり、歌詞エディタで曲を聴きながら
Space キーでタイミングを付けて、自分で作ったりできます。

ブラウザとしての機能もそろっています。
・一般的なブラウザと同じ、上に並ぶタブ（サイドバーに並べる形にも切り替え可）
・タブのグループ・ピン留め・まとめて閉じる、閉じたタブとセッションの復元
・タブをウィンドウの外へ引き出して別ウィンドウに、別のウィンドウの上で離して戻す
・2 つのページを左右・上下に並べる分割表示
・広告・トラッカーのブロック（標準 / 簡易 / オフ。動画・音楽サイトでは自動で簡易に）
・アドレスバーから検索エンジンをすぐに切り替え、シークレットタブ用の検索エンジンも選択可
・ページと動画の字幕を翻訳（英語 ⇔ 日本語。この PC の中だけで翻訳し、文章を外部に送りません）
・タブやリンクにマウスを乗せるとプレビュー
・コピー禁止のページの制限を解除・ページの文字を取り出す
・コマンドパレット、ページ内検索、リーダーモード、翻訳、PDF の表示と保存
・ブックマーク（Chrome・Edge・Brave などから取り込み可）、履歴、ダウンロード管理、メモ
・シークレットモード、14 種類のテーマ（白い標準テーマ・OS に合わせる設定あり）、拡張機能
・季節の演出（タブバーに雪・桜・雨・落ち葉が積もる。設定で調整・オフ可）

利用状況の収集（テレメトリ）は行いません。ソースコードは GitHub で公開しています（GPLv3）。
```

### 新機能（このバージョンの新機能）

```
バージョン 0.2.0
・一般的なブラウザと同じく、タブを上に並べる画面に（設定でサイドバーに戻せます）
・新しいタブのスタートページ：再生中の曲と今の歌詞、音楽に合わせて流れる色の波
・アドレスバーの下に今の歌詞を 1 行表示
・タブバーに雪・桜・雨・落ち葉が積もる季節の演出（設定で調整・オフ）
・白い標準テーマ、OS に合わせるテーマ、落ち着いた明るいテーマ 3 種類
・検索エンジンをアドレスバーから切り替え。シークレットタブ用の検索エンジン
・ページ翻訳と動画の字幕翻訳（英語 ⇔ 日本語、この PC の中だけで翻訳）
・タブ・リンクのプレビュー、コピー制限の解除と文字の取り出し
・ブックマークの追加・編集を右クリックから
・タブを引き出すとすぐ別のウィンドウに。別のウィンドウのタブバーへ戻すことも
・通信が遅い時の読み込み中の表示、細いウィンドウでのボタンのまとめ表示
・ミニプレイヤーのガラス表示と大きさの変更、音量をサイトと同期
・動作を軽くし、検索候補・広告ブロック・ウィンドウの移動などの不具合を修正
```

### 製品の機能（1 行ずつ別の欄に入力）

```
再生中のタブの音楽をツールバーとミニプレイヤーから操作
再生位置に合わせて歌詞をカラオケ表示
再生中の曲と今の歌詞が出る、新しいタブのスタートページ
自分の .lrc ファイルの読み込みと、タイミングを付けられる歌詞エディタ
2 つのページを並べて使える分割表示
広告・トラッカーのブロック（サイト・タブごとに切り替え）
ページと動画の字幕を、この PC の中だけで翻訳（英語 ⇔ 日本語）
アドレスバーから検索エンジンをすぐに切り替え
タブ・リンクにマウスを乗せるとプレビュー
コマンドパレットですべての操作をキーボードから
他のブラウザからブックマークを取り込み
タブバーに積もる季節の演出
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
| 1-newtab.png | 再生中の曲と今の歌詞が出る新しいタブ |
| 2-lyrics.png | 再生中の曲の歌詞をカラオケ表示 |
| 3-split.png | 2 つのページを並べて表示 |
| 4-season.png | タブバーに雪が積もる季節の演出 |
| 5-shield.png | 広告・トラッカーのブロック |

---

## English (en-US)

### Description

```
ARCHYNDIUM Browser is a free, design-focused web browser for people who browse while listening to music.

Control the music playing in any tab from the toolbar or the always-on-top mini player,
and follow the lyrics of the current song, highlighted line by line in sync with playback.
You can also show the current lyric line under the address bar, and every new tab opens a start page
with the song that is playing, its current lyric line, and colorful waves that move with the music.
For songs without lyrics, load your own .lrc file or create one in the built-in lyrics editor:
just press Space at the start of each line while the song plays.

Everyday browsing features are included:
- Tabs along the top like other browsers (or in a sidebar, if you prefer)
- Tab groups, pinned tabs, bulk close, and session restore
- Drag a tab out to make a new window, or drop it on another window to move it back
- Split view (side by side or top and bottom)
- Ad and tracker blocking: Standard / Light / Off, automatically Light on video and music sites
- Switch search engines right from the address bar, with a separate engine for private tabs
- Translate pages and video subtitles on your device (English ⇔ Japanese); no text is sent anywhere
- Previews when you hover over tabs and links
- Unlock copy-protected pages and extract a page's text
- Command palette, find in page, reader mode, translation, PDF viewing and saving
- Bookmarks (import from Chrome, Edge, Brave and more), history, downloads, notes
- Private mode, 14 themes (including a plain light theme and one that follows the system), and browser extensions
- Seasonal effects: snow, petals, rain or leaves settle on the tab bar (adjustable, can be turned off)

No telemetry is collected. The source code is available on GitHub under the GPLv3.
```

### What's new in this version

```
Version 0.2.0
- Tabs now run along the top like other browsers (switch back to the sidebar in Settings)
- New tab start page with the song that is playing, its current lyric line and waves that move with the music
- Optional current lyric line under the address bar
- Seasonal effects on the tab bar (snow, petals, rain, leaves), adjustable or off
- Plain light theme, a theme that follows the system, and three calm light themes
- Switch search engines from the address bar; separate search engine for private tabs
- On-device page and subtitle translation (English ⇔ Japanese)
- Tab and link previews; unlock copy-protected pages and extract text
- Add and edit bookmarks from right-click menus
- Pull a tab out to make it a window right away, or drop it on another window's tab bar
- Loading indicator for slow connections; toolbar buttons fold into a menu in narrow windows
- Mini player glass mode and resizing; volume stays in sync with the site
- Faster, plus fixes for search suggestions, ad blocking and window dragging
```

### Product features

```
Control music playing in any tab from the toolbar and a mini player
Synced, karaoke-style lyrics for the current song
New tab start page with the playing song and its current lyric line
Load your own .lrc files or create timed lyrics in the built-in editor
Split view to use two pages side by side
Ad and tracker blocking, switchable per site and per tab
Translate pages and subtitles on your device (English ⇔ Japanese)
Switch search engines right from the address bar
Previews when you hover over tabs and links
Command palette for keyboard-driven browsing
Import bookmarks from other browsers
Seasonal effects that settle on the tab bar
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

---

## 更新を出す時（2 回目以降の提出）

1. `package.json` の `version` を上げる（Store は前より大きい番号しか受け付けません。0.2.0 → パッケージは 0.2.0.0）。
2. GitHub に送ったら、「Actions」→「Store package」→「Run workflow」（Branch は main）。できた `.appx` を Artifacts からダウンロード。
3. Partner Center →「アプリとゲーム」→ ARCHYNDIUM Browser →「更新」（または「新しい申請を作成」）。
4. 「パッケージ」で古いパッケージを削除し、新しい `.appx` をアップロード。
5. 「ストア登録情報」→ 日本語・英語それぞれで、このファイルの「説明」「新機能」「製品の機能」を貼り替え、
   スクリーンショットを `docs/store/screenshots/` の新しいものに差し替える。
6. 価格・年齢区分などは変えなくてよい。「ストアに提出」を押して審査を待つ（数時間〜数日）。
