# santei-atlas-app

santei-atlas（算定で迷ったときの個人用ナレッジ）を、**iPhone のホーム画面からアプリのようにひらき、パソコンからは URL でひらく** ための入れ物。

- アプリ・パソコン：https://peirin1230-ship-it.github.io/santei-atlas-app/
- Claude がその場で検索しながら答える壁打ち：claude.ai の santei-atlas（URL は santei-atlas の README）

## しくみ

このリポジトリ（公開）には **画面の入れ物だけ** を置く。ページ・一次情報・点数・DPC のデータは非公開の `santei-atlas` リポジトリにあり、
ひらいた端末に貼った GitHub のトークンで、GitHub API から直接読む（読み取りだけ）。

| 何を | どこから |
|---|---|
| 画面（ページ・壁打ち・一次情報・点数・DPC・運用のタブ） | `santei-atlas` の **`site` ブランチ** の `index.html`（`scripts/build_portal.py` が作る） |
| 一次情報・点数・DPC電子点数表のデータ | `santei-atlas` の **`site` ブランチ** の `data/*.json`（使うときに読み、端末にとっておく） |
| `site` ブランチ | `santei-atlas` の `main` に push すると、Actions の `site` が作り直す |

読み込んだ画面とデータはその端末にとっておき、次からはすぐひらく。裏で新しい版が出ていないかを確かめ、出ていれば「ひらき直す」を出す。
電波がないときも、とっておいた版でひらける（図は描けないことがある）。

壁打ちのタブでは、質問に関係するページ・告示・通知・点数を集めて回答ルールと一緒にまとめ、コピーして Claude（アプリまたは claude.ai）に貼って相談する。
Claude がその場で検索しながら答える壁打ちは、claude.ai の santei-atlas のページで使う。

## ホーム画面に置く（iPhone）

1. 上の URL を Safari でひらく
2. 共有（□に↑。無ければ右下の「…」の中）→「ホーム画面に追加」→「Webアプリとして開く」はオンのまま「追加」
3. ホーム画面の santei-atlas からひらいて、最初に一度だけトークンを貼る（Safari とホーム画面のアプリでは保存場所が別）

パソコンは URL をブラウザでひらき、同じようにトークンを貼る（ブラウザごとに1回）。

## トークン（端末ごとに 1 回）

[トークンを作る画面](https://github.com/settings/personal-access-tokens/new?name=santei-atlas-app&target_name=peirin1230-ship-it&expires_in=365&contents=read)
（名前・期限・Contents: Read-only が入った状態でひらく）で、

- Repository access: **Only select repositories → santei-atlas**
- いちばん下の「Generate token」

出てきた `github_pat_…` を、アプリの最初の画面に貼る。トークンはその端末にだけ保存され、api.github.com 以外には送られない。

## 変えたいとき

- **ページ・壁打ち・一次情報などの中身と画面** は `santei-atlas` 側で直す（ページは `regions/` など、画面は `scripts/portal_template.html`）。`main` に入れば Actions が `site` を作り直し、アプリが次にひらいたときに「新しい版があります」と出る
- **アイコン・名前・色・トークンの画面** はこのリポジトリで直す（`shell.js`・`shell.css`・`manifest.webmanifest`・`icon*`）。`main` に push すると `pages` ワークフローが `gh-pages` に置き直す
  - 正本は `santei-atlas` の `app/`。直したらこのリポジトリにも同じものを置く

ここには個人のデータを置かない。患者を特定できる情報はアプリにも入力しない。
