# プライバシーポリシー / Privacy Policy

最終更新：2026 年 11 月 26 日 / Last updated: 2026-11-26

ARCHYNDIUM Browser（以下「本アプリ」）は、archyndium が開発・配布するデスクトップ用 Web ブラウザです。

## 収集しない情報

- 本アプリは、利用状況の収集（テレメトリ・解析・クラッシュレポートの送信）を**行いません**。
- 閲覧履歴・ブックマーク・メモ・マイ歌詞・設定などは、**利用者の PC の中だけ**に保存され、作者を含む第三者に送信されません。
- 作者（archyndium）が運営するサーバーはありません。

## 本アプリが自動的に通信する先

利用者が開いた Web ページとの通信のほか、本アプリは次の場合に外部と通信します。
送るのは、その目的に必要な情報（下の表の「送る情報」）だけです。通信の際、相手先には通常のインターネット通信と同様に IP アドレスなどが伝わります。

| 通信先 | いつ | 送る情報 | 目的 | 止める方法 |
|---|---|---|---|---|
| GitHub（github.com / raw.githubusercontent.com） | 起動時、起動中 6 時間ごと | なし（ファイルの取得のみ） | アップデートの確認、広告ブロック用フィルターリストの取得 | — |
| 設定で選んだ検索エンジン | アドレスバーに文字を入力した時（シークレットタブを除く） | 入力中の文字 | 検索候補の表示 | 設定 > Search「入力中に検索候補を表示」をオフ |
| Mozilla の翻訳モデルの配布場所（storage.googleapis.com） | 端末内翻訳を初めて使う時（言語の組み合わせごとに 1 回） | なし（ファイルの取得のみ。ページの文章は送りません） | 翻訳モデルのダウンロード | 翻訳を使わない／設定 > 翻訳 で「Google 翻訳」を選ぶ |
| Google 翻訳（translate.google.com） | 翻訳の方法で「Google 翻訳」を選んで翻訳した時だけ | 翻訳するページの URL（ページの内容は Google が取得） | ページの翻訳 | 「端末内で翻訳」を選ぶ（初期設定） |
| リンク先のサイト | ページのリンクにマウスを 0.7 秒乗せた時（シークレットタブを除く） | なし（Cookie を送らずにページの先頭を読み込むだけ） | リンクのプレビュー（タイトル・説明・画像）の表示 | 設定 > Downloads / Bookmarks / Trash「リンクにマウスを乗せるとプレビュー」をオフ |
| LRCLIB（lrclib.net） | 歌詞パネルやミニプレイヤーを開いて曲を再生した時 | 曲名・アーティスト名・曲の長さ | 歌詞の検索 | 歌詞パネル・ミニプレイヤーを閉じる／マイ歌詞を用意した曲は通信しない |
| YouTube（www.youtube.com/oembed） | YouTube の動画が切り替わった時 | 動画の ID | 曲名の取得 | — |
| Chrome ウェブストア（clients2.google.com） | 利用者が拡張機能を追加した時だけ | 拡張機能の ID | 拡張機能のダウンロード | 拡張機能を追加しない |

## シークレットタブ

シークレットタブの履歴・Cookie・キャッシュはメモリ上だけに置かれ、最後のシークレットタブを閉じると消去されます。
シークレットタブでは、サイトに Global Privacy Control（Sec-GPC）と Do Not Track を送ります（従うかどうかはサイト次第です）。
シークレットタブは、この PC に記録を残さないための機能です。サイトや通信事業者から IP アドレスなどを隠すものではありません。

## 拡張機能

利用者が追加した拡張機能は、その拡張機能の作者が定めるプライバシーポリシーに従って動作します。

## お問い合わせ

GitHub の Issues（https://github.com/archyndium/archyndium-browser/issues）からお問い合わせください。

---

## English summary

ARCHYNDIUM Browser does **not** collect telemetry, analytics or crash reports, and the author operates no servers.
Browsing history, bookmarks, notes, user lyrics and settings are stored only on the user's computer.
Besides the web pages the user opens, the app connects only to: GitHub (update checks and ad-block filter lists),
the selected search engine (search suggestions while typing; can be turned off), LRCLIB (lyrics search with the
song title/artist), YouTube oEmbed (video title lookup), the Chrome Web Store (only when the user installs an extension),
and, for link previews, the linked site (only the beginning of the page is fetched without cookies when the user hovers a link;
not in private tabs; can be turned off). Private tabs keep history, cookies and cache in memory only and send Sec-GPC / DNT headers.
Page and subtitle translation runs on the device by default; the translation models are downloaded once from Mozilla's
public storage (storage.googleapis.com) and no page text is sent. Only if the user chooses "Google Translate" is the page URL sent to Google.
