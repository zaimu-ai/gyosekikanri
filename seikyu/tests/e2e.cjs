// 画面の動作確認（テスト用の新しいブラウザで行う。本番のデータには触れない）
// 使い方：dist で python3 -m http.server 8766 を動かしてから node tests/e2e.cjs
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const URL = 'http://localhost:8766/' + encodeURIComponent('請求システム.html');
const OUT = path.join(__dirname, '..', 'shots'); fs.mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0; const errors = [];
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'OK  ' : 'NG  '}${name}${extra ? '  ' + extra : ''}`); };
const ROUTES = ['#home', '#orders', '#order-new', '#deliveries', '#delivery-new', '#invoices', '#payments', '#ledger', '#customers', '#customer-new', '#setup'];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true, locale: 'ja-JP' });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push('console: ' + m.text()); });
  page.on('dialog', d => { errors.push('native dialog: ' + d.message()); d.dismiss(); });
  await page.goto(URL + '#home'); await page.waitForSelector('h1');
  await page.waitForFunction(() => window.lucide && document.querySelector('svg.lucide'));
  ok('ホームが開く', (await page.textContent('h1')).includes('ホーム'));
  ok('テストデータの帯が出る', await page.isVisible('.mode-band'));

  // すべての画面
  for (const r of ROUTES) { await page.evaluate(h => { location.hash = h; }, r); await page.waitForTimeout(150); ok(`画面 ${r} が開く`, (await page.$$('h1')).length === 1 && !(await page.isVisible('.notice.err'))); }
  // 一覧から詳細へ
  await page.evaluate(() => { location.hash = '#deliveries'; }); await page.waitForTimeout(150);
  await page.selectOption('#dlMonth', ''); await page.waitForTimeout(150);
  await page.click('table.tbl tbody tr.clickable td:nth-child(3)'); await page.waitForTimeout(200);
  ok('納品書の詳細が開く', (await page.textContent('h1')).startsWith('納品書 No.'));
  await page.evaluate(() => { location.hash = '#invoices'; }); await page.waitForTimeout(150);
  const invLink = await page.$('a[href^="#invoice-"]'); if (invLink) { await invLink.click(); await page.waitForTimeout(200); }
  ok('請求書の詳細が開く', (await page.textContent('h1')).startsWith('請求書 No.'));
  await page.evaluate(() => { location.hash = '#customers'; }); await page.waitForTimeout(150);
  await page.click('table.tbl tbody tr.clickable td:nth-child(2) a'); await page.waitForTimeout(200);
  ok('得意先の詳細が開く', await page.isVisible('#cForm'));
  await page.evaluate(() => { location.hash = '#orders'; }); await page.waitForTimeout(150);
  await page.click('table.tbl tbody td:nth-child(3) a'); await page.waitForTimeout(200);
  ok('製作伝票の詳細が開く', await page.isVisible('#oForm'));

  // ---- 納品書の入力：空のまま登録 → エラーの場所へ ----
  await page.evaluate(() => { location.hash = '#delivery-new'; }); await page.waitForTimeout(200);
  await page.click('#dForm button[type=submit]'); await page.waitForTimeout(400);
  const errCount = await page.$$eval('.err-msg', e => e.length);
  ok('空で登録するとエラーが出る', errCount >= 4, `（${errCount}件）`);
  ok('いちばん上のエラーへフォーカス', await page.evaluate(() => document.activeElement && document.activeElement.id === 'dCust'));

  // ---- 入力：見本金属・82×68.5×2337.6・3ケース42本 ----
  const custId = await page.$eval('#dCust option:nth-child(2)', o => o.value);
  await page.selectOption('#dCust', custId); await page.waitForTimeout(200);
  await page.fill('#l0-mat', '5056S-H34');
  await page.fill('#s0-0-od', '８２'); // 全角でも読む
  await page.fill('#s0-0-inner', '68.5');
  await page.fill('#s0-0-length', '2337.6');
  await page.fill('#s0-0-cases', '3');
  await page.fill('#s0-0-count', '42');
  await page.dispatchEvent('#s0-0-count', 'change'); await page.waitForTimeout(150);
  ok('1本の重さ 10.09', (await page.textContent('#s0-0-u')).includes('10.09'));
  ok('計算重量 423.8', (await page.textContent('#l0-calc')).trim() === '423.8');
  const priceAuto = await page.inputValue('#l0-price');
  ok('前回の単価が入る（1,255）', priceAuto === '1255', `（${priceAuto}）`);
  ok('計算重量での金額 531,869', (await page.textContent('#l0-amt')).trim() === '531,869');
  await page.fill('#l0-kg', '417.9'); await page.waitForTimeout(100);
  ok('はかった重さでの金額 524,464', (await page.textContent('#l0-amt')).trim() === '524,464');
  await page.fill('#l0-n1', 'No.134 6/4出');
  // 長さ違いの寸法を足す
  await page.click('[data-act=addPipe]'); await page.waitForTimeout(150);
  await page.fill('#l1-mat', '5056S-H34'); await page.fill('#s1-0-od', '53'); await page.fill('#s1-0-inner', '49'); await page.fill('#s1-0-length', '1880'); await page.fill('#s1-0-cases', '1'); await page.fill('#s1-0-count', '1');
  await page.click('[data-act=addSize][data-l="1"]'); await page.waitForTimeout(150);
  await page.fill('#s1-1-length', '1800'); await page.fill('#s1-1-count', '2'); await page.waitForTimeout(100);
  ok('長さ違い2つの計算重量 4.8（1.63＋1.56×2）', (await page.textContent('#l1-calc')).trim() === '4.8');
  await page.fill('#l1-kg', '4.7'); await page.fill('#l1-price', '1299'); await page.waitForTimeout(100);
  ok('4.7kg×1,299＝6,105', (await page.textContent('#l1-amt')).trim() === '6,105');
  // 誤った寸法
  await page.click('[data-act=addPipe]'); await page.waitForTimeout(150);
  await page.fill('#l2-mat', '5056S-H32'); await page.fill('#s2-0-od', '20'); await page.fill('#s2-0-inner', '25'); await page.fill('#s2-0-length', '1000'); await page.fill('#s2-0-count', '1x');
  await page.click('#dForm button[type=submit]'); await page.waitForTimeout(400);
  const msgs = await page.$$eval('.err-msg', e => e.map(x => x.textContent));
  ok('内径が外径以上のエラー', msgs.some(m => m.includes('内径が外径以上')));
  ok('本数が数字でないエラー', msgs.some(m => m.includes('本数は数字')));
  await page.click('[data-act=removeLine][data-l="2"]'); await page.waitForTimeout(150);
  ok('合計金額 530,569（524,464＋6,105）', (await page.textContent('#dTotals')).includes('530,569'));
  await page.click('#dForm button[type=submit]'); await page.waitForTimeout(500);
  const h1 = await page.textContent('h1');
  ok('納品書を登録できた', /^納品書 No\.\d{6}$/.test(h1.trim()), h1);
  const newNo = h1.replace(/\D/g, '');
  await page.screenshot({ path: path.join(OUT, 'pc_delivery_detail.png'), fullPage: true });

  // ---- 印刷：A4のページができる ----
  await page.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
  await page.click('[data-act=printDelivery]'); await page.waitForTimeout(400);
  ok('印刷の画面に「印刷する」がある（パソコンで開いたとき）', await page.isVisible('#dlg button:has-text("印刷する")'));
  await page.screenshot({ path: path.join(OUT, 'pc_print_preview.png') });
  await page.click('#dlg button:has-text("印刷する")'); await page.waitForTimeout(300);
  ok('印刷が呼ばれ、A4のページが1枚（納品書＋控）', await page.evaluate(() => window.__printed === 1 && document.querySelectorAll('#print-root .page').length === 1));
  const pdfPromise = page.waitForEvent('download', { timeout: 60000 });
  await page.click('#dlg button:has-text("PDFで保存")');
  const dl = await pdfPromise; const pdfPath = path.join(OUT, 'nohin.pdf'); await dl.saveAs(pdfPath);
  const pdfBuf = fs.readFileSync(pdfPath);
  ok('PDFができる', pdfBuf.slice(0, 5).toString() === '%PDF-' && pdfBuf.length > 20000, `（${dl.suggestedFilename()}、${Math.round(pdfBuf.length / 1024)}KB）`);
  ok('PDFのファイル名に納品書No.', dl.suggestedFilename().startsWith(`納品書_${newNo}_`), '（LANG が UTF-8 のときに確認できる）');
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  // 帳票の画像
  await page.evaluate(() => { const st = document.getElementById('pdf-stage'); st.style.left = '0'; st.style.zIndex = '99'; st.style.background = '#fff'; st.innerHTML = document.getElementById('print-root').innerHTML; });
  await page.setViewportSize({ width: 800, height: 1130 });
  await page.locator('#pdf-stage .page').first().screenshot({ path: path.join(OUT, 'a4_nohin.png') });
  await page.evaluate(() => { const st = document.getElementById('pdf-stage'); st.innerHTML = ''; st.style.left = '-20000px'; });
  await page.setViewportSize({ width: 1366, height: 900 });
  // 仮納品書（送り先が違う架空産業の納品書）
  await page.evaluate(() => { const d = S.deliveries.find(x => x.destId); location.hash = '#delivery-' + d.id; }); await page.waitForTimeout(200);
  await page.click('[data-act=printKari]'); await page.waitForTimeout(400);
  ok('仮納品書：送り先が違うので金額を出さない（初期）', !(await page.isChecked('#dlg .printOpt[value=amount]')));
  await page.click('#dlg button:has-text("印刷する")'); await page.waitForTimeout(300);
  ok('仮納品書に金額の列がない', await page.evaluate(() => !document.querySelector('#print-root').textContent.includes('金額')));
  await page.evaluate(() => { const st = document.getElementById('pdf-stage'); st.style.left = '0'; st.style.zIndex = '99'; st.innerHTML = document.getElementById('print-root').innerHTML; });
  await page.setViewportSize({ width: 800, height: 1130 });
  await page.locator('#pdf-stage .page').first().screenshot({ path: path.join(OUT, 'a4_kari.png') });
  await page.evaluate(() => { const st = document.getElementById('pdf-stage'); st.innerHTML = ''; st.style.left = '-20000px'; });
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);

  // ---- 請求書を作る：締め日が来ている得意先（サンプル軽金：末日締め） ----
  await page.evaluate(() => { location.hash = '#invoices'; }); await page.waitForTimeout(250);
  const readyCount = await page.$$eval('.invPick', e => e.length);
  ok('請求書を作れる得意先がある', readyCount >= 1, `（${readyCount}件）`);
  const expect = await page.evaluate(() => { const id = document.querySelector('.invPick').value; const cd = document.querySelector('.invPick').dataset.cd; const c = S.customers.find(x => x.id === id); const dr = invoiceDraft(c, cd); return { name: c.name, total: dr.total, sales: dr.sales, tax: dr.tax, carry: dr.carry }; });
  await page.click('[data-act=createInvoices]'); await page.waitForTimeout(300);
  await page.click('#dlg .btn.primary'); await page.waitForTimeout(600);
  ok('請求書を作ると印刷の画面が開く', await page.isVisible('#dlg .preview-box'));
  await page.click('#dlg button:has-text("印刷する")'); await page.waitForTimeout(300);
  const invText = await page.evaluate(() => document.querySelector('#print-root').textContent);
  ok('請求書に合計金額・登録番号・消費税', invText.includes(`¥${expect.total.toLocaleString('ja-JP')}`) && invText.includes('登録番号') && invText.includes('消費税'), `（${expect.name} ${expect.total}）`);
  ok('消費税＝売上×10%（四捨五入）', expect.tax === Math.floor(expect.sales * 0.1 + 0.5));
  await page.screenshot({ path: path.join(OUT, 'pc_invoice_preview.png') });
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  await page.evaluate(() => { const st = document.getElementById('pdf-stage'); st.style.left = '0'; st.style.zIndex = '99'; st.innerHTML = document.getElementById('print-root').innerHTML; });
  await page.setViewportSize({ width: 800, height: 1130 });
  await page.locator('#pdf-stage .page').first().screenshot({ path: path.join(OUT, 'a4_seikyu.png') });
  await page.evaluate(() => { const st = document.getElementById('pdf-stage'); st.innerHTML = ''; st.style.left = '-20000px'; });
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  // 請求済みの納品書は直せない
  const lockedId = await page.evaluate(() => S.deliveries.find(d => d.invoiceId).id);
  await page.evaluate(id => { location.hash = '#delivery-edit-' + id; }, lockedId); await page.waitForTimeout(200);
  ok('請求済みの納品書は直せない', (await page.textContent('#view')).includes('直せません'));

  // ---- 入金 ----
  await page.evaluate(() => { location.hash = '#payments'; }); await page.waitForTimeout(200);
  await page.selectOption('#pCust', custId); await page.fill('#pAmt', '100000'); await page.fill('#pFee', '440');
  await page.click('#pForm button[type=submit]'); await page.waitForTimeout(400);
  ok('入金を登録できる', await page.evaluate(() => S.payments.some(p => p.amount === 100000 && p.fee === 440)));

  // ---- 得意先台帳：差引残高が合う ----
  await page.evaluate(id => { ui.lg = { cust: id, from: '', to: '' }; location.hash = '#ledger'; }, custId); await page.waitForTimeout(250);
  const lg = await page.evaluate(id => { const c = S.customers.find(x => x.id === id); const L = ledgerData(c, '2000-01-01', '2099-12-31'); const r = receivable(c); const unbilled = sum(S.deliveries.filter(d => billMembers(c).has(d.customerId) && !d.invoiceId && d.status !== 'cancelled'), d => deliveryTotals(d).partial); return { end: L.end, expect: r.rest + unbilled }; }, custId);
  ok('台帳の残高＝未回収＋まだ請求していない売上（請求をまとめる営業所の分を含む）', lg.end === lg.expect, JSON.stringify(lg));

  // ---- 再読み込みしてもデータが残る ----
  await page.reload(); await page.waitForSelector('h1'); await page.waitForTimeout(300);
  ok('再読み込み後も登録した納品書が残る', await page.evaluate(no => S.deliveries.some(d => String(d.no).padStart(6, '0') === no), newNo));
  ok('再読み込み後も入金が残る', await page.evaluate(() => S.payments.some(p => p.amount === 100000)));

  // ---- バックアップの書き出し ----
  await page.evaluate(() => { location.hash = '#setup'; }); await page.waitForTimeout(300);
  const bk = page.waitForEvent('download'); await page.click('[data-act=exportBackup]'); const bkf = await bk; const bkPath = path.join(OUT, 'backup.json'); await bkf.saveAs(bkPath);
  const bkData = JSON.parse(fs.readFileSync(bkPath, 'utf8'));
  ok('バックアップに全データが入る', Array.isArray(bkData.deliveries) && bkData.deliveries.length > 5 && bkData.invoices.length >= 2);
  ok('自動バックアップがある（請求書を作る前）', (await page.textContent('#snapList')).includes('請求書を作る前'));

  // ---- 本番のデータに切り替え（テストデータは残る） ----
  await page.click('[data-act=switchMode][data-v=main]'); await page.waitForTimeout(200); await page.click('#dlg .btn.primary'); await page.waitForTimeout(500);
  ok('本番は空で始まる', await page.evaluate(() => MODE === 'main' && S.deliveries.length === 0 && S.customers.length === 0));
  ok('本番：得意先の登録を案内', (await page.textContent('#view')).includes('はじめに得意先を登録'));
  await page.evaluate(() => { location.hash = '#setup'; }); await page.waitForTimeout(300);
  await page.click('[data-act=switchMode][data-v=test]'); await page.waitForTimeout(200); await page.click('#dlg .btn.primary'); await page.waitForTimeout(500);
  ok('テストデータに戻ると、登録した内容が残っている', await page.evaluate(no => MODE === 'test' && S.deliveries.some(d => String(d.no).padStart(6, '0') === no), newNo));

  // ---- デザインの決まり ----
  for (const r of ['#home', '#delivery-new', '#invoices', '#setup']) {
    await page.evaluate(h => { location.hash = h; }, r); await page.waitForTimeout(200);
    const small = await page.evaluate(() => [...document.querySelectorAll('main .btn, main .icon-btn, nav a, main input:not([type=checkbox]):not([type=hidden]):not([type=file]), main select')].filter(e => e.offsetParent && e.getBoundingClientRect().height < 44).map(e => e.outerHTML.slice(0, 60)));
    ok(`${r} 押せる部分は高さ44px以上`, small.length === 0, small.slice(0, 3).join(' | '));
    const tiny = await page.evaluate(() => [...document.querySelectorAll('main *, nav *')].filter(e => e.offsetParent && e.childNodes.length && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 14).map(e => e.tagName + ':' + e.textContent.slice(0, 20)));
    ok(`${r} 14px未満の文字がない`, tiny.length === 0, tiny.slice(0, 3).join(' | '));
    const leftAccent = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(e => { const s = getComputedStyle(e); const l = parseFloat(s.borderLeftWidth), r2 = parseFloat(s.borderRightWidth); return l >= 2 && l > r2 && s.borderLeftStyle !== 'none'; }).map(e => e.className));
    ok(`${r} 左端だけの色の帯がない`, leftAccent.length === 0, leftAccent.join(','));
  }
  const src = fs.readFileSync(path.join(__dirname, '..', 'dist', 'seikyu.html'), 'utf8');
  ok('絵文字を使っていない', !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(src));

  // ---- スマホ幅（390px）で横にはみ出さない ----
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const mp = await m.newPage(); mp.on('pageerror', e => errors.push('mobile pageerror: ' + e.message));
  await mp.goto(URL + '#home'); await mp.waitForSelector('h1'); await mp.waitForTimeout(400);
  const detail = await mp.evaluate(() => ['#delivery-' + S.deliveries[0].id, '#invoice-' + S.invoices[0].id, '#order-' + S.orders[0].id, '#customer-' + S.customers[0].id]);
  for (const r of [...ROUTES, ...detail]) {
    await mp.evaluate(h => { location.hash = h; }, r); await mp.waitForTimeout(200);
    const w = await mp.evaluate(() => document.documentElement.scrollWidth);
    ok(`スマホ ${r} 横にはみ出さない`, w <= 390, `（${w}px）`);
  }
  await mp.evaluate(() => { location.hash = '#delivery-new'; }); await mp.waitForTimeout(200);
  await mp.screenshot({ path: path.join(OUT, 'sp_delivery_new.png'), fullPage: false });
  await mp.click('#menuBtn'); await mp.waitForTimeout(150);
  ok('スマホ：メニューが開く', await mp.isVisible('#nav a[data-nav=invoices]'));
  await mp.click('#nav a[data-nav=invoices]'); await mp.waitForTimeout(250);
  ok('スマホ：メニューから移ると閉じる', !(await mp.isVisible('#nav a[data-nav=customers]')) && (await mp.textContent('h1')) === '請求書');
  await mp.screenshot({ path: path.join(OUT, 'sp_invoices.png') });

  // ---- 画面（PC・ダーク） ----
  const dk = await browser.newContext({ viewport: { width: 1366, height: 900 }, colorScheme: 'dark' });
  const dp = await dk.newPage(); dp.on('pageerror', e => errors.push('dark pageerror: ' + e.message));
  await dp.goto(URL + '#home'); await dp.waitForSelector('h1'); await dp.waitForTimeout(600);
  await dp.screenshot({ path: path.join(OUT, 'pc_home_dark.png') });
  await page.evaluate(() => { location.hash = '#home'; }); await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, 'pc_home.png') });
  await page.evaluate(() => { location.hash = '#delivery-new'; }); await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, 'pc_delivery_new.png') });
  await page.evaluate(() => { location.hash = '#invoices'; }); await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, 'pc_invoices.png'), fullPage: true });

  // ---- claude.ai の中のように iframe で開くと「印刷する」を出さない ----
  const fp = await ctx.newPage(); fp.on('pageerror', e => errors.push('frame pageerror: ' + e.message));
  await fp.setContent(`<iframe src="${URL}#deliveries" style="width:1300px;height:880px"></iframe>`); await fp.waitForTimeout(1500);
  const fr = fp.frames()[1];
  await fr.evaluate(() => { location.hash = '#delivery-' + S.deliveries[0].id; }); await fr.waitForTimeout(300);
  await fr.click('[data-act=printDelivery]'); await fr.waitForTimeout(400);
  ok('iframe の中では「印刷する」を出さず、PDFで保存だけ', !(await fr.isVisible('#dlg button:has-text("印刷する")')) && await fr.isVisible('#dlg button:has-text("PDFで保存")'));

  ok('JavaScript のエラーがない', errors.length === 0, errors.slice(0, 5).join(' / '));
  await browser.close();
  console.log(`\n${pass} 件 OK、${fail} 件 NG`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
