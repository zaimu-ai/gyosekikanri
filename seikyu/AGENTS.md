# AGENTS.md — 請求システム（seikyu/）

このフォルダ（`seikyu/`）で作業する AI エージェント（Codex、Claude Code など）の作業ルールです。
repository 直下の `AGENTS.md`（業績管理のルール）のうち、「登録データを消さない」「本番データで試さない」「未確定の値を 0 と表示しない」「実データ・個人情報を repository に入れない」「デザインのルール」「作業と報告のルール」は、ここでも同じように守ってください。
人間向けの説明は `seikyu/README.md` を参照してください。

## プロジェクトの概要

- アルミ引抜管メーカー向けの請求システムです。流れは「製作伝票入力 → 納品書（仮納品書）→ 合計請求書 → 入金 → 得意先台帳」。
- 旧システム（事務コン）から移る担当の方が迷わないよう、入力の順番と項目は事務コンに合わせています。
  - これを変えるときは利用者に確認します。

## 構成

- 元のファイルは `src/` にあります。`bash build.sh` を実行すると、1つの HTML（`dist/`）にまとまります。`dist/` は repository に入れません。
- 外部ライブラリは版を固定しています。勝手に版を上げないでください。
  - Lucide 0.460.0（unpkg）
  - Noto Sans JP（Google Fonts）
  - html2canvas 1.4.1・jsPDF 2.5.1（cdnjs。PDF を作るときだけ読み込む）
- データは利用者のブラウザの中に保存します。
  - IndexedDB：database `seikyu-system`、store `kv`
  - key：`data:main`・`data:test`・`backups:<mode>`・`mode`・`lastDaily:<mode>`
  - IndexedDB が使えないときは、localStorage の `seikyu-system:` で始まる key に保存します。
- 保存の形は `DATA_VERSION`（今は 2）で管理します。形を変えるときは `migrate` に古い形を読む処理を足し、古い key は消しません。
- 会社の実際の情報（会社名・登録番号・振込先）はコードに入れません。
  - 本番用に作るときだけ、`COMPANY_JSON` で repository の外の JSON を渡します。
  - 渡さないとき、テストデータでは架空の会社（`COMPANY_FICTIONAL`）を表示します。

## 今の依頼：デザイン（見た目）の仕上げ

`docs/codex_design_brief.md` を読んで、そのとおりに進めてください。要点は次のとおりです。

- **変えてよいもの**
  - `src/00-head.html` の CSS
  - 各画面の HTML の組み立て（class・要素の並び）
- **変えないもの**
  - 計算と保存（`src/20-core.js`）、帳票の大きさ（`src/40-print.js`）
  - 要素の `id`、`data-act`・`data-l`・`data-s`・`data-f`・`data-di`・`data-df` 属性
- 業務の言葉の意味は変えません（「取消」「締日なし」「請求先」「摘要」など）。

## 動作確認のしかた

1. `bash build.sh`
2. `cd dist && python3 -m http.server 8766`
3. `seikyu/` で、次をすべて実行し、NG が 0 件であることを確かめます。
   - 実行の前に `LANG=C.UTF-8` にしてください。そうしないと、ダウンロードしたファイルの日本語の名前を確かめられません。
   - `node tests/calc.test.cjs`
   - `node tests/e2e.cjs`
   - `node tests/e2e2.cjs`
   - `node tests/e2e3.cjs`
   - `node tests/pages.cjs`
   - `node tests/file-mode.cjs`
4. テストには Playwright（Chromium）が必要です。使えない環境では、そのことを報告に書いてください。確かめていないことを「確認済み」と書かないでください。

## Code Review Rules（seikyu/）

- 保存データ（`S`、IndexedDB / localStorage の key）を削除・初期化・空で上書きする変更は P0。
- 請求書の作成・取消、得意先の取込、設定の変更、データを戻す処理の前に `snapshot` を呼ばない変更は P1。
- 未確定・未入力の値（単価・重量など）を 0 として計算・表示する変更は P1。
- 取込で、読めない行を黙って捨てる・黙って別の値に置き換える変更は P1。
- 実在の会社名・取引先名・口座番号・登録番号を、コード・テストデータ・コメントに入れる変更は P0。
- 絵文字をアイコンとして使う変更、左ボーダーのアクセント表現を足す変更は P1。
- テストが使う `id`・`data-*` 属性を変えたのに、テストを直していない変更は P1。
