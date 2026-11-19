// 画面の動作確認 その5（v0.3.1）：旧システムの得意先・宛名の一覧を入れて作ったとき（本番のデータに最初から登録する）
// 架空の一覧（tests/fixtures/master_test.csv）を入れて作り直し、テスト用の新しいブラウザで確かめる。終わったら一覧なしで作り直す。
const { chromium } = require('playwright');
const path = require('path'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const URL = 'http://localhost:8766/' + encodeURIComponent('請求システム.html');
let pass = 0, fail = 0; const errors = [];
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'OK  ' : 'NG  '}${name}${extra ? '  ' + extra : ''}`); };
const build = env => execFileSync('bash', ['build.sh'], { cwd: ROOT, env: { ...process.env, ...env } }).toString().trim();

(async () => {
  console.log(build({ MASTER_CSV: path.join(__dirname, 'fixtures', 'master_test.csv') }));
  const b = await chromium.launch();
  try {
    const open = async () => { const ctx = await b.newContext({ viewport: { width: 1366, height: 900 } }); const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); return p; };
    const load = async (p, h = '#home') => { await p.goto(URL + h); await p.waitForSelector('h1'); await p.waitForTimeout(600); };

    // ---- はじめて開いたとき：本番のデータで開き、一覧の得意先・宛名が登録されている ----
    const p = await open(); await load(p);
    const st = await p.evaluate(async () => ({ mode: MODE, cust: S.customers.map(c => c.code).sort(), addr: S.addressees.map(a => a.code).sort(), bt: S.customers.find(c => c.code === 302)?.billToId === S.customers.find(c => c.code === 301)?.id, tr: S.customers.find(c => c.code === 303)?.taxRounding, nc: S.customers.find(c => c.code === 303)?.needsCheck, log: S.log.some(l => l.action === '旧システムの得意先・宛名を登録'), snap: (await listSnapshots()).some(s => s.reason === '旧システムの得意先・宛名を登録する前') }));
    ok('はじめて開くと本番のデータで開く', st.mode === 'main');
    ok('得意先 3件（締日あり）が登録されている', st.cust.join() === '301,302,303', st.cust.join());
    ok('宛名（仕入先など）2件（締日0）が登録されている（得意先には入らない）', st.addr.join() === '801,802', st.addr.join());
    ok('請求先・消費税の端数・空欄の項目も入る', st.bt && st.tr === 'floor' && st.nc.join() === '住所1');
    ok('登録の前に端末内バックアップを取り、記録を残す', st.snap && st.log);
    ok('登録したことを知らせる', (await p.textContent('#toast')).includes('得意先 3 件・宛名（仕入先など）2 件を登録しました'));
    await p.evaluate(() => { location.hash = '#customers'; }); await p.waitForTimeout(300);
    ok('得意先の画面に出る', (await p.$$('#view tbody tr')).length === 3);
    await p.reload(); await p.waitForSelector('h1'); await p.waitForTimeout(500);
    ok('開き直しても二重に登録しない', await p.evaluate(() => S.customers.length === 3 && S.addressees.length === 2));

    // ---- 足りない分を登録する画面（もう登録済みのものは取り込まない） ----
    await p.evaluate(() => { location.hash = '#customers'; }); await p.waitForTimeout(300);
    await p.click('[data-act=masterImport]'); await p.waitForTimeout(400);
    ok('「旧システムの一覧から足りない分を登録する」で確認の画面', (await p.textContent('h1')) === '得意先・宛名を取り込む（CSV）' && await p.evaluate(() => ui.ci.rows.every(x => x.status === 'exists')));
    ok('全部登録済みなら取り込むボタンは押せない', await p.isDisabled('[data-act=importCustomersRun]'));

    // ---- 本番のデータが空のまま残っていたとき（前の版で本番に切り替えていた場合） ----
    await p.evaluate(async () => { await kvSet('data:main', JSON.stringify(newDataset('main'))); });
    await p.reload(); await p.waitForSelector('h1'); await p.waitForTimeout(600);
    ok('空の本番のデータにも登録する', await p.evaluate(() => S.customers.length === 3 && S.addressees.length === 2));

    // ---- テストデータからはじめて本番に切り替えたとき ----
    const q = await open(); await load(q);
    await q.evaluate(async () => { await new Promise(r => { const t = idbConn.transaction('kv', 'readwrite'); t.objectStore('kv').delete('data:main'); t.oncomplete = r; }); await kvSet('mode', 'test'); });
    await q.reload(); await q.waitForSelector('h1'); await q.waitForTimeout(500);
    ok('テストデータでは架空の取引先だけ', await q.evaluate(() => MODE === 'test' && !S.customers.some(c => c.code === 301)));
    ok('テストデータの帯で、本番に切り替えると得意先が入っていると知らせる', (await q.textContent('#modeBand')).includes('本番のデータに切り替えると、旧システムの得意先・宛名が登録されています'));
    await q.evaluate(() => { location.hash = '#setup'; }); await q.waitForTimeout(300);
    await q.click('[data-act=switchMode][data-v=main]'); await q.waitForTimeout(250); await q.click('#dlg .btn.primary'); await q.waitForTimeout(800);
    ok('本番に切り替えると、得意先・宛名を登録して得意先の画面へ', await q.evaluate(() => MODE === 'main' && S.customers.length === 3 && S.addressees.length === 2) && (await q.textContent('h1')) === '得意先');
    await q.evaluate(() => { location.hash = '#setup'; }); await q.waitForTimeout(300);
    await q.click('[data-act=switchMode][data-v=test]'); await q.waitForTimeout(250); await q.click('#dlg .btn.primary'); await q.waitForTimeout(600);
    ok('テストデータに戻っても、テストデータは消えていない', await q.evaluate(() => MODE === 'test' && S.customers.some(c => c.code === 101)));
    ok('JavaScript のエラーがない', errors.length === 0, errors.slice(0, 3).join(' / '));
  } finally {
    await b.close();
    console.log(build({ MASTER_CSV: '', COMPANY_JSON: '' }));
  }
  console.log(`\n${pass} 件 OK、${fail} 件 NG`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); try { build({ MASTER_CSV: '', COMPANY_JSON: '' }); } catch (e2) { } process.exit(2); });
