// 画面の動作確認 その6（v0.3.2）：入力欄の位置をそろえる・入力欄の高さを選ぶ・宛名ラベルの敬称を得意先・宛名ごとに登録する
// テスト用の新しいブラウザで行う。取引先はすべて架空。
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const URL = 'http://localhost:8766/' + encodeURIComponent('請求システム.html');
const OUT = path.join(__dirname, '..', 'shots'); fs.mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0; const errors = [];
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'OK  ' : 'NG  '}${name}${extra ? '  ' + extra : ''}`); };

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 } }); const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const nav = async h => { await p.evaluate(x => { location.hash = x; }, h); await p.waitForTimeout(300); };
  await p.goto(URL + '#home'); await p.waitForSelector('h1'); await p.waitForTimeout(400);

  // ---- 入力欄の上端が、同じ行でそろう ----
  // 行ごと（見出しの上端が同じもの）に、入力欄の上端を集める。ずれ（最大−最小）を返す
  const misalign = () => p.evaluate(() => {
    let worst = 0, rowsChecked = 0;
    for (const g of document.querySelectorAll('#view .form-grid')) {
      const rows = {};
      for (const f of g.querySelectorAll(':scope > .field')) {
        if (!f.offsetParent) continue;
        const ctl = f.querySelector('.field-ctl input:not([type=hidden]), .field-ctl select, .field-ctl textarea, .calc-out'); if (!ctl) continue;
        const k = Math.round(f.getBoundingClientRect().top);
        (rows[k] = rows[k] || []).push(ctl.getBoundingClientRect().top);
      }
      for (const tops of Object.values(rows)) if (tops.length > 1) { rowsChecked++; worst = Math.max(worst, Math.max(...tops) - Math.min(...tops)); }
    }
    return { worst: Math.round(worst * 10) / 10, rowsChecked };
  });
  for (const [h, name] of [['#order-new', '製作伝票入力'], ['#delivery-new', '納品書を作る'], ['#customer-new', '得意先の登録'], ['#addressee-new', '宛名の登録'], ['#setup', '設定・データ']]) {
    await nav(h); const m = await misalign();
    ok(`${name}：説明の行数が違っても、同じ行の入力欄の上端がそろう`, m.rowsChecked > 0 && m.worst <= 1, JSON.stringify(m));
  }
  await nav('#order-new'); await p.click('#oForm button[type=submit]'); await p.waitForTimeout(400);
  const me = await misalign();
  ok('入力の誤りを出しても、入力欄の位置はずれない', (await p.$$('.err-msg')).length > 0 && me.worst <= 1, JSON.stringify(me));
  await p.screenshot({ path: path.join(OUT, 'v032_order_normal.png'), fullPage: true });

  // ---- 入力欄の高さを選ぶ ----
  const hOf = sel => p.evaluate(s => Math.round(document.querySelector(s).getBoundingClientRect().height), sel);
  ok('はじめは「ふつう」（48px）', (await hOf('#oNo')) === 48);
  await nav('#setup');
  ok('設定・データに「入力欄の高さ」がある（ふつうが選ばれている）', await p.isVisible('[data-act=fieldHeight][data-v=low]') && (await p.getAttribute('[data-act=fieldHeight][data-v=normal]', 'aria-pressed')) === 'true');
  const before = await p.evaluate(() => JSON.stringify(S));
  await p.click('[data-act=fieldHeight][data-v=low]'); await p.waitForTimeout(300);
  ok('「低め」を押すと、すぐ低くなる（40px）', (await hOf('#sName')) === 40 && (await p.getAttribute('[data-act=fieldHeight][data-v=low]', 'aria-pressed')) === 'true');
  ok('入力欄の高さはデータに入れない（端末ごとの設定）', await p.evaluate(b => JSON.stringify(S) === b, before));
  await p.click('[data-act=fieldHeight][data-v=lower]'); await p.waitForTimeout(300);
  await p.reload(); await p.waitForSelector('h1'); await p.waitForTimeout(500);
  await nav('#order-new');
  const hl = await hOf('#oNo'), sl = await hOf('[data-act=oBasis][data-v=kg]');
  ok('開き直しても「さらに低め」のまま（入力欄 34〜36px）', hl >= 33 && hl <= 36, `${hl}px`);
  ok('切り替えボタン（K・P）も入力欄に合わせて低くなる', sl <= 34, `${sl}px`);
  ok('低くしても、入力欄の上端はそろう', (await misalign()).worst <= 1);
  await p.screenshot({ path: path.join(OUT, 'v032_order_lower.png'), fullPage: true });
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  ok('スマホの幅では、押しやすさのため 44px 以上のまま', (await hOf('#oNo')) >= 44 && (await hOf('[data-act=oBasis][data-v=kg]')) >= 44);
  ok('スマホの幅で横にはみ出さない（製作伝票入力）', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await p.setViewportSize({ width: 1366, height: 900 });
  await nav('#setup'); await p.click('[data-act=fieldHeight][data-v=normal]'); await p.waitForTimeout(300);
  ok('「ふつう」に戻せる', (await hOf('#sName')) === 48);

  // ---- 宛名ラベルの敬称：得意先・宛名ごとに登録 ----
  ok('前の版のデータの得意先は「まだ決めていない」になる', await p.evaluate(() => { const d = migrate({ version: 3, kind: 'main', customers: [{ id: 'x', code: 1, name: '架空' }], deliveries: [], invoices: [] }); return d.customers[0].honorific === ''; }));
  // 得意先の画面
  const c101 = await p.evaluate(() => S.customers.find(c => c.code === 101).id);
  await nav('#customer-' + c101);
  ok('得意先の画面に「宛名ラベルの敬称」がある（まだ決めていない）', await p.isVisible('#cHon') && (await p.inputValue('#cHon')) === '' && (await p.textContent('#cHon option[value=""]')).includes('まだ決めていない'));
  await p.selectOption('#cHon', '様'); await p.click('#cForm button[type=submit]'); await p.waitForTimeout(400);
  ok('得意先ごとに敬称を登録できる', await p.evaluate(id => custById(id).honorific === '様', c101));
  ok('登録したら「まだ決めていない」は選べなくなる', await p.evaluate(id => { location.hash = '#customer-' + id; return true; }, c101) && (await p.waitForTimeout(300), !(await p.$('#cHon option[value=""]'))));
  await nav('#customer-new');
  ok('新しい得意先は「御中」から始まる', (await p.inputValue('#cHon')) === '御中');
  await nav('#addressee-new');
  ok('新しい宛名も「御中」から始まる', (await p.inputValue('#aHon')) === '御中');
  // 宛名ラベルの一覧で、その場で登録する
  await nav('#labels');
  ok('宛名ラベルの一覧に「敬称」の列', (await p.$$('.lbHon')).length === 3 && (await p.textContent('#view thead')).includes('敬称'));
  ok('まだ決めていないものの数と、そのとき使う敬称を知らせる', (await p.textContent('#view')).includes('敬称をまだ決めていないものが、表示している中に 3 件') && (await p.textContent('#view')).includes('「御中」で印刷'));
  const k901 = await p.evaluate(() => 'a:' + S.addressees.find(a => a.code === 901).id);
  const k902 = await p.evaluate(() => 'a:' + S.addressees.find(a => a.code === 902).id);
  await p.selectOption(`.lbHon[data-key="${k901}"]`, '様'); await p.waitForTimeout(400);
  ok('一覧で選ぶと、その宛名に登録される（記録も残る）', await p.evaluate(k => S.addressees.find(a => 'a:' + a.id === k).honorific === '様' && S.log.some(l => l.action === '宛名の敬称を登録'), k901));
  ok('登録したことを知らせ、選んだ欄にとどまる', (await p.textContent('#toast')).includes('敬称を「様」で登録しました') && await p.evaluate(k => document.activeElement && document.activeElement.dataset.key === k, k901));
  await p.selectOption(`.lbHon[data-key="${k902}"]`, '-'); await p.waitForTimeout(400);
  const txt = k => p.evaluate(k => { const h = document.createElement('div'); h.innerHTML = labelPages([k]); return h.querySelector('.lb-name').textContent; }, k);
  ok('ラベルには、宛名ごとの敬称が付く（様）', (await txt(k901)) === '見本資材(株)様', await txt(k901));
  ok('「なし」にした宛名は敬称を付けない', (await txt(k902)) === '架空梱包(有)', await txt(k902));
  ok('得意先のラベルにも、得意先ごとの敬称が付く', (await txt('c:' + c101)) === '見本金属(株)様', await txt('c:' + c101));
  const c102 = await p.evaluate(() => 'c:' + S.customers.find(c => c.code === 102).id);
  ok('まだ決めていない得意先は、ラベルの設定の敬称（御中）', (await txt(c102)).endsWith('御中'));
  await p.selectOption('#lsHon', '殿'); await p.waitForTimeout(300);
  ok('ラベルの設定を変えると、まだ決めていないものだけ変わる', (await txt(c102)).endsWith('殿') && (await txt(k901)).endsWith('様'));
  await p.selectOption('#lbKind', 'all'); await p.waitForTimeout(300);
  ok('両方を表示すると、得意先の敬称も一覧で選べる', (await p.$$('.lbHon')).length === 3 + 5 && (await p.inputValue(`.lbHon[data-key="c:${c101}"]`)) === '様');
  await p.screenshot({ path: path.join(OUT, 'v032_labels.png'), fullPage: true });
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  ok('スマホの幅で横にはみ出さない（宛名ラベル）', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await p.screenshot({ path: path.join(OUT, 'v032_labels_390.png'), fullPage: true });

  ok('JavaScript のエラーがない', errors.length === 0, errors.slice(0, 3).join(' / '));
  await b.close(); console.log(`\n${pass} 件 OK、${fail} 件 NG`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
