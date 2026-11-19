#!/bin/bash
# src を1つのHTMLにまとめる
#  dist/seikyu.html        … claude.ai の Artifact 用（doctype/html/head/body は公開時に付く）
#  dist/請求システム.html  … パソコンで直接開く用（ダブルクリックして使う。印刷できる）
#
# 会社の実際の情報（会社名・登録番号・振込先など）は repository に入れない。
# 本番用に作るときだけ、repository の外に置いた JSON を COMPANY_JSON で渡す：
#   COMPANY_JSON=/path/to/company.json bash build.sh
#   （中身の例：{"name":"…","zip":"…","address":"…","tel":"…","fax":"…","regNo":"T…","bank":"…","title":"…"}）
# 渡さないときは、会社の情報は空（テストデータでは架空の会社）になる。
set -e
cd "$(dirname "$0")"
mkdir -p dist
JS="src/20-core.js src/25-seed.js src/28-ui.js src/30-views.js src/32-import.js src/35-delivery.js src/38-invoice.js src/40-print.js src/45-labels.js src/50-main.js"
{
  if [ -n "$COMPANY_JSON" ]; then
    node -e 'const c=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); delete c.title; process.stdout.write("window.__COMPANY_PRESET__="+JSON.stringify(c)+";\n")' "$COMPANY_JSON"
  fi
  cat $JS
} > dist/_all.js
node --check dist/_all.js
TITLE="請求システム"
if [ -n "$COMPANY_JSON" ]; then
  TITLE=$(node -e 'const c=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); process.stdout.write(c.title||"請求システム")' "$COMPANY_JSON")
fi
{
  sed "s|<title>請求システム</title>|<title>${TITLE}</title>|" src/00-head.html
  cat src/10-body.html
  echo '<script>'
  cat dist/_all.js
  echo '</script>'
} > dist/seikyu.html
{
  echo '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
  echo '<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}img{max-width:100%}[hidden]{display:none!important}</style></head><body>'
  cat dist/seikyu.html
  echo '</body></html>'
} > "dist/請求システム.html"
echo "built: $(wc -c < dist/seikyu.html) bytes${COMPANY_JSON:+（会社の情報を入れて作成）}"
