// 画面の動作確認 その3（v0.2.0）：得意先の取込・請求先にまとめる・得意先ごとの消費税の端数・前品名コピー・製作伝票入力・古い形のデータ
// テスト用の新しいブラウザで行う。取引先・住所はすべて架空。
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const URL = 'http://localhost:8766/' + encodeURIComponent('請求システム.html');
const FIX = path.join(__dirname, 'fixtures'); fs.mkdirSync(FIX, { recursive: true });
let pass = 0, fail = 0; const errors = [];
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'OK  ' : 'NG  '}${name}${extra ? '  ' + extra : ''}`); };

// 架空の得意先の CSV（UTF-8・BOM つき）と、同じ中身の Shift_JIS 版
const CSV = [
  'コード,メニュー,得意先名,郵便番号,住所1,住所2,電話番号,FAX番号,締日,税,丸目,繰越,請コード,印字用,重なりで空欄にした項目',
  '201,て,テスト金属(株) 本社,000-0001,架空県テスト市1-1,,000-000-0000,,31,0,1,0,201,,',
  '202,て,テスト金属(株) 支店,000-0002,,,,,31,0,1,1,201,,"住所1,電話番号"',
  '203,か,架空工業(株),,,,,,20,0,0,0,203,,',
  '204,,架空市役所 税務課,,,,,,0,0,0,0,204,,',
  '205,,丸目2の架空会社,,,,,,15,0,2,0,205,,',
  '206,,請求先のない架空会社,,,,,,31,0,1,0,999,,',
  '207,,締日なしへまとめる架空会社,,,,,,20,0,1,0,204,,',
  '101,,登録済みと同じコード,,,,,,31,0,1,0,101,,',
  'abc,,コードが読めない,,,,,,31,0,1,0,,,',
  '203,,ファイル内で重複,,,,,,31,0,1,0,203,,',
  '208,,,,,,,,31,0,1,0,208,,',
  '209,,締日が読めない架空会社,,,,,,45,0,1,0,209,,',
].join('\r\n') + '\r\n';
const csvUtf8 = path.join(FIX, 'customers_test_utf8.csv');
fs.writeFileSync(csvUtf8, '﻿' + CSV, 'utf8');
const csvSjis = path.join(FIX, 'customers_test_sjis.csv');
execFileSync('python3', ['-I', '-c', 'import sys;open(sys.argv[2],"wb").write(open(sys.argv[1],encoding="utf-8-sig").read().encode("cp932"))', csvUtf8, csvSjis]);

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 } }); const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const nav = async h => { await p.evaluate(x => { location.hash = x; }, h); await p.waitForTimeout(250); };
  await p.goto(URL + '#home'); await p.waitForSelector('h1'); await p.waitForTimeout(400);

  // ---- 名前の変更 ----
  ok('メニューが「製作伝票入力」', (await p.textContent('.nav a[data-nav=orders]')).includes('製作伝票入力'));
  ok('画面に「指図書」という言葉が残っていない', !(await p.evaluate(() => document.body.innerText.includes('指図書'))));

  // ---- 請求先にまとめる（テストデータ：105 大阪営業所 → 101 見本金属） ----
  const m = await p.evaluate(() => {
    const c1 = S.customers.find(c => c.code === 101), c5 = S.customers.find(c => c.code === 105);
    const cd = latestClosingOnOrBefore(c1, todayStr()); const next = closingDateOf(c1, ...(() => { const d = parseYmd(cd); d.setMonth(d.getMonth() + 1, 1); return [d.getFullYear(), d.getMonth() + 1]; })());
    const dr = invoiceDraft(c1, next);
    return { members: [...billMembers(c1)].length, inDraft: dr.dels.some(d => d.customerId === c5.id), c5billing: isBillingCustomer(c5), c5bill: billToOf(c5.id) === c1.id };
  });
  ok('営業所の納品書が本社の請求書に入る', m.members === 2 && m.inDraft && m.c5bill, JSON.stringify(m));
  ok('営業所（締日なし・請求先あり）には請求書を作らない', !m.c5billing);
  await p.evaluate(() => { ui.inv.month = null; }); await nav('#invoices');
  ok('請求書の画面に「まとめる得意先」が出る', (await p.textContent('#view')).includes('まとめる得意先：105'));
  ok('請求書の画面に営業所だけの行は出ない', !(await p.$$eval('td.name', e => e.map(x => x.textContent))).some(t => t.startsWith('見本金属(株) 大阪営業所')));

  // ---- 得意先ごとの消費税の端数 ----
  const tx = await p.evaluate(() => { const c = S.customers.find(x => x.code === 104); return { floor: taxOf(1463859, S.rules, custTaxRounding(c)), round: taxOf(1096408, S.rules, custTaxRounding(S.customers.find(x => x.code === 101))) }; });
  ok('丸目0（切り捨て）：1,463,859 → 146,385（請求一覧表と同じ）', tx.floor === 146385, JSON.stringify(tx));
  ok('丸目1（四捨五入）：1,096,408 → 109,641（請求一覧表と同じ）', tx.round === 109641);

  // ---- 得意先の取込 ----
  await nav('#customers'); await p.click('a[href="#customers-import"]'); await p.waitForTimeout(250);
  ok('取込の画面が開く', (await p.textContent('h1')) === '得意先・宛名を取り込む（CSV）');
  await p.setInputFiles('#ciFile', csvSjis); await p.waitForTimeout(400);
  const sj = await p.evaluate(() => ui.ci && ui.ci.rows.map(x => [x.rec.code, x.status]));
  ok('Shift_JIS の CSV も読める', sj && sj.length === 12 && sj[0][0] === 201, JSON.stringify(sj && sj.slice(0, 2)));
  await p.setInputFiles('#ciFile', csvUtf8); await p.waitForTimeout(400);
  const an = await p.evaluate(() => ui.ci.rows.map(x => ({ c: x.rec.code, s: x.status, e: x.errs.join('/'), w: x.warns.join('/'), bt: x.rec.billTo, tr: x.rec.taxRounding, cd: x.rec.closingDay, nc: x.rec.needsCheck, t: x.rec.target })));
  const by = c => an.find(x => x.c === c && x.s !== 'error') || an.find(x => x.c === c);
  ok('取り込む 7件・登録済み 1件・取り込めない 4件', an.filter(x => x.s === 'new').length === 7 && an.filter(x => x.s === 'exists').length === 1 && an.filter(x => x.s === 'error').length === 4, JSON.stringify(an.map(x => [x.c, x.s])));
  ok('取り込めない行には理由が出る（コード・重複・名前・締日）', an.filter(x => x.s === 'error').every(x => x.e) && $text(an, 'コード「abc」') && $text(an, '同じコードが') && $text(an, '得意先名が空欄') && $text(an, '締日「45」'));
  ok('締日0は得意先ではなく宛名（仕入先など）に入れる', by(204).t === 'addr' && by(204).s === 'new' && by(204).w.includes('宛名'));
  ok('ほかの行は得意先に入れる', an.filter(x => x.s === 'new' && x.t === 'cust').length === 6);
  ok('丸目0は切り捨て、1は四捨五入、2は会社の設定（理由を出す）', by(203).tr === 'floor' && by(201).tr === 'round' && by(205).tr === null && by(205).w.includes('丸目 2'));
  ok('請コードで請求先を決める（202→201）', by(202).bt === 201);
  ok('請求先が見つからないときは未設定（理由を出す）', by(206).bt === null && by(206).w.includes('999'));
  ok('請求先が宛名（締日0）のときは未設定（理由を出す）', by(207).bt === null && by(207).w.includes('204'));
  ok('空欄にした項目を読む', JSON.stringify(by(202).nc) === JSON.stringify(['住所1', '電話番号']));
  ok('確認の表に全部の行が出る', (await p.$$('#view tbody tr')).length === 12);
  const before = await p.evaluate(() => S.customers.length);
  await p.click('[data-act=importCustomersRun]'); await p.waitForTimeout(250); await p.click('#dlg .btn.primary'); await p.waitForTimeout(800);
  const after = await p.evaluate(() => { const g = c => S.customers.find(x => x.code === c); return { addr: S.addressees.some(a => a.code === 204) && !S.customers.some(c => c.code === 204), n: S.customers.length, bt: g(202).billToId === g(201).id, old: g(101).name, nc: g(202).needsCheck, legacy: !!g(203).legacy, tr: g(203).taxRounding }; });
  ok('得意先6件・宛名1件を取り込む（登録済みの 101 は上書きしない）', after.n === before + 6 && after.addr && after.old === '見本金属(株)', JSON.stringify(after));
  ok('取り込んだ得意先の請求先・端数・空欄の項目・元の値', after.bt && after.tr === 'floor' && after.nc.length === 2 && after.legacy);
  const snaps = await p.evaluate(async () => (await listSnapshots()).map(s => s.reason));
  ok('取り込む前に端末内バックアップを取る', snaps.some(r => r.startsWith('得意先・宛名の取込の前')), JSON.stringify(snaps.slice(-2)));
  ok('得意先の一覧に「空欄の項目がある得意先」の知らせが出る', (await p.textContent('#view')).includes('空欄にした項目がある得意先が 1 件'));
  await p.reload(); await p.waitForSelector('h1'); await p.waitForTimeout(300);
  ok('再読み込みしても取り込んだ得意先が残る', await p.evaluate(() => S.customers.some(c => c.code === 207)));

  // ---- 得意先の画面：締日なし・請求先・消費税の端数 ----
  const id202 = await p.evaluate(() => S.customers.find(c => c.code === 202).id);
  await nav('#customer-' + id202);
  ok('得意先の画面に空欄の項目の知らせ', (await p.textContent('#view')).includes('取り込んだときに空欄にした項目：住所1、電話番号'));
  ok('請求先の欄に 201 が選ばれている', (await p.$eval('#cBillTo', e => e.options[e.selectedIndex].text)).includes('201'));
  await p.fill('#cAddr', '架空県テスト市2-2'); await p.uncheck('#cNeedsCheck');
  await p.click('#cForm button[type=submit]'); await p.waitForTimeout(400);
  ok('手で入れて「空欄の確認」を外せる', await p.evaluate(() => { const c = S.customers.find(x => x.code === 202); return c.address === '架空県テスト市2-2' && c.needsCheck.length === 0 && c.legacy; }));

  // ---- 製作伝票入力：コードで得意先、P/K、続けて入れる ----
  await nav('#order-new');
  ok('製作伝票入力の画面', (await p.textContent('h1')) === '製作伝票入力');
  await p.fill('#oNo', '30119001'); await p.fill('#oCustCode', '999'); await p.press('#oCustCode', 'Enter'); await p.waitForTimeout(100);
  ok('ないコードは知らせる', (await p.textContent('#oCustCodeMsg')).includes('999'));
  await p.fill('#oCustCode', '103'); await p.press('#oCustCode', 'Enter'); await p.waitForTimeout(150);
  await p.fill('#oUser', '試験台'); await p.fill('#oMat', '5056s-h34'); await p.fill('#oOd', '18'); await p.fill('#oInner', '11'); await p.fill('#oLen', '5000');
  await p.fill('#oQty', '9000p'); await p.click('[data-act=oBasis][data-v=pc]'); await p.fill('#oPrice', '420'); await p.fill('#oNote', '曲り厳重注意');
  await p.waitForTimeout(100);
  ok('摘要の見本が出る', (await p.textContent('#oNotePrev')).includes('試験台') && (await p.textContent('#oNotePrev')).includes('9000P'));
  await p.click('#oForm button[type=submit]'); await p.waitForTimeout(400);
  const o = await p.evaluate(() => S.orders.find(x => x.no === '30119001'));
  ok('製作伝票を登録できる（商品名は大文字、受注量、P単価）', o && o.material === '5056S-H34' && o.qtyText === '9000P' && o.priceBasis === 'pc' && o.unitPrice === 420 && o.user === '試験台', JSON.stringify(o && { m: o.material, q: o.qtyText, b: o.priceBasis }));
  ok('登録したあと、次の伝票を入れられる（空の入力画面）', (await p.inputValue('#oNo')) === '' && (await p.textContent('h1')) === '製作伝票入力');
  await p.fill('#oNo', '30119001'); await p.click('#oForm button[type=submit]'); await p.waitForTimeout(300);
  ok('同じ製作伝票No.はエラー', (await p.$$eval('.err-msg', e => e.map(x => x.textContent))).some(x => x.includes('もう登録しています')));
  await p.evaluate(() => { ui.dirty = false; });

  // ---- 納品書：製作伝票（P単価）を呼び出す・前品名コピー ----
  await nav('#order-' + o.id); await p.click('[data-act=orderToDelivery]'); await p.waitForTimeout(400);
  ok('P単価の製作伝票は、納品書でも「円/本」', await p.evaluate(() => ui.df.lines[0].priceBasis === 'pc'));
  await p.fill('#s0-0-count', '100'); await p.fill('#s0-0-cases', '1'); await p.waitForTimeout(100);
  await p.click('[data-act=copyPrev]'); await p.waitForTimeout(300);
  const cp = await p.evaluate(() => { const [a, c] = ui.df.lines; return { mat: c.material === a.material, od: c.sizes[0].od === a.sizes[0].od, count: c.sizes[0].count, order: c.orderId, price: c.unitPrice === a.unitPrice, n2: c.note2 === a.note2 }; });
  ok('前品名コピー：品名・寸法・単価・摘要を写し、本数と製作伝票のつながりは写さない', cp.mat && cp.od && cp.count == null && cp.order == null && cp.price && cp.n2, JSON.stringify(cp));
  await p.click('[data-act=removeLine][data-l="1"]'); await p.waitForTimeout(200);
  await p.click('#dForm button[type=submit]'); await p.waitForTimeout(500);
  const dl = await p.evaluate(() => { const d = S.deliveries[S.deliveries.length - 1]; return { amt: deliveryTotals(d).amount, ono: d.lines[0].orderNo }; });
  ok('P単価の金額＝本数×単価（100本×420＝42,000）', dl.amt === 42000, JSON.stringify(dl));

  // ---- 古い形（第1版）のデータを読む ----
  const mg = await p.evaluate(() => {
    const old = { version: 1, kind: 'main', customers: [{ id: 'a', code: 1, name: '旧', closingDay: 20, destinations: [{ id: 'x', name: '送' }], opening: { date: '', balance: 0 }, active: true }], orders: [{ id: 'o', no: '1', customerId: 'a' }], deliveries: [], invoices: [], payments: [] };
    const d = migrate(JSON.parse(JSON.stringify(old)));
    const c = d.customers[0];
    return { v: d.version, addr: Array.isArray(d.addressees) && d.addressees.length === 0 && d.labelSettings.sheet === 'me504t', cd: c.closingDay, tr: c.taxRounding, bt: c.billToId, nc: c.needsCheck, dc: c.destinations[0].code, keep: c.name === '旧' && d.orders.length === 1 && d.orders[0].priceBasis === 'kg' };
  });
  ok('第1版のデータを読める（締日などはそのまま、足した項目は未設定）', mg.v === 3 && mg.addr && mg.cd === 20 && mg.tr === null && mg.bt === null && Array.isArray(mg.nc) && mg.dc === '' && mg.keep, JSON.stringify(mg));

  // ---- スマホ幅 ----
  const mctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); const mp = await mctx.newPage();
  mp.on('pageerror', e => errors.push('mobile: ' + e.message));
  await mp.goto(URL + '#home'); await mp.waitForSelector('h1'); await mp.waitForTimeout(300);
  for (const h of ['#order-new', '#orders', '#customers', '#customers-import', '#customer-new', '#delivery-new', '#invoices', '#labels', '#addressee-new']) {
    await mp.evaluate(x => { location.hash = x; }, h); await mp.waitForTimeout(250);
    const w = await mp.evaluate(() => document.documentElement.scrollWidth);
    ok(`スマホ幅：${h} が横にはみ出さない`, w <= 390, `（${w}px）`);
  }
  await mp.evaluate(() => { location.hash = '#order-new'; }); await mp.waitForTimeout(250);
  const hCode = await mp.evaluate(() => document.querySelector('#oCustCode').getBoundingClientRect().height);
  ok('得意先コードの欄の高さが 44px 以上', hCode >= 44, `（${hCode}px）`);
  await mp.screenshot({ path: path.join(__dirname, '..', 'shots', 'v020_order_mobile.png'), fullPage: true });
  await p.setViewportSize({ width: 1366, height: 900 });
  await nav('#order-new'); await p.screenshot({ path: path.join(__dirname, '..', 'shots', 'v020_order_pc.png'), fullPage: true });

  ok('JavaScript のエラーがない', errors.length === 0, errors.slice(0, 3).join(' / '));
  await b.close(); console.log(`\n${pass} 件 OK、${fail} 件 NG`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
function $text(an, s) { return an.some(x => x.e.includes(s)); }
