// 画面の動作確認 その2：製作伝票→納品書、得意先の登録、取消、入力中に離れるとき、バックアップから戻す
const { chromium } = require('playwright');
const URL = 'http://localhost:8766/' + encodeURIComponent('請求システム.html');
let pass = 0, fail = 0; const errors = [];
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'OK  ' : 'NG  '}${name}${extra ? '  ' + extra : ''}`); };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1366, height: 900 } }); const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const nav = async h => { await p.evaluate(x => { location.hash = x; }, h); await p.waitForTimeout(250); };
  await p.goto(URL + '#home'); await p.waitForSelector('h1'); await p.waitForTimeout(400);

  // ---- 得意先を登録（締日 その他=15 は選択肢、25日 ではなく「その他」で 18日） ----
  await nav('#customer-new');
  await p.fill('#cName', 'テスト新規金属(株)');
  await p.selectOption('#cClose', 'other'); await p.waitForTimeout(100);
  ok('「その他の締日」の欄が出る', await p.isVisible('#cCloseOther'));
  await p.fill('#cCloseOther', '30');
  await p.click('[data-act=addDest]'); await p.waitForTimeout(100);
  await p.click('#cForm button[type=submit]'); await p.waitForTimeout(300);
  const errs = await p.$$eval('.err-msg', e => e.map(x => x.textContent));
  ok('締日 30 はエラー（1〜28）', errs.some(x => x.includes('1〜28')));
  ok('送り先の名前が空はエラー', errs.some(x => x.includes('送り先の名前')));
  await p.fill('#cCloseOther', '18'); await p.fill('#dn0', 'テスト新規金属(株) 堺工場');
  await p.fill('#cOpenBal', '50000');
  await p.click('#cForm button[type=submit]'); await p.waitForTimeout(300);
  ok('残高だけ入れて日付がないとエラー', (await p.$$eval('.err-msg', e => e.map(x => x.textContent))).some(x => x.includes('日付')));
  await p.fill('#cOpenDate', '2026-10-18');
  await p.click('#cForm button[type=submit]'); await p.waitForTimeout(400);
  const cust = await p.evaluate(() => S.customers.find(c => c.name === 'テスト新規金属(株)'));
  ok('得意先を登録できる（締日18日・送り先1・開始残高）', cust && cust.closingDay === 18 && cust.destinations.length === 1 && cust.opening.balance === 50000, JSON.stringify(cust && { cd: cust.closingDay, code: cust.code }));

  // ---- 製作伝票を登録 → 納品書へ ----
  await nav('#order-new');
  await p.fill('#oNo', '3001'); await p.fill('#oCustCode', String(cust.code)); await p.press('#oCustCode', 'Enter'); await p.waitForTimeout(150);
  ok('製作伝票：得意先コードを入れて Enter で得意先が選ばれる', (await p.inputValue('#oCust')) === cust.id);
  await p.fill('#oUser', '見本台'); await p.fill('#oQty', '100p');
  await p.selectOption('#oDest', cust.destinations[0].id);
  await p.fill('#oOrderNo', 'K-55'); await p.fill('#oMat', '52S-H34');
  await p.fill('#oOd', '18'); await p.click('[data-act=oInnerKind][data-v=t]'); await p.fill('#oInner', '3.5'); await p.fill('#oLen', '4000');
  await p.fill('#oCount', '100'); await p.fill('#oPrice', '1500'); await p.fill('#oNote', 'A社材'); await p.waitForTimeout(100);
  // 1本の重さを2桁に丸めてから本数を掛ける（事務コンと同じ：10.09×42＝423.8）。1.73×100＝173.0
  ok('製作伝票：重さの目安（1本 1.73kg、100本で約 173.0kg）', (await p.textContent('#oKgHint')).includes('1.73') && (await p.textContent('#oKgHint')).includes('173.0'), await p.textContent('#oKgHint'));
  await p.click('#oForm button[type=submit]'); await p.waitForTimeout(400);
  const ord = await p.evaluate(() => S.orders.find(o => o.no === '3001'));
  ok('製作伝票を登録できる（肉厚で入力）', ord && ord.innerKind === 't' && ord.inner === 3.5 && ord.destId === cust.destinations[0].id);
  await nav('#order-' + ord.id);
  await p.click('[data-act=orderToDelivery]'); await p.waitForTimeout(400);
  ok('納品書の画面に製作伝票の内容が入る', (await p.inputValue('#l0-mat')) === '52S-H34' && (await p.inputValue('#s0-0-od')) === '18' && (await p.inputValue('#s0-0-count')) === '100' && (await p.inputValue('#l0-price')) === '1500');
  const md = await p.evaluate(() => fmtMD(todayStr()));
  ok('摘要＝ユーザー・製作伝票の日付・受注量（事務コンと同じ形）', (await p.inputValue('#l0-n1')) === `見本台 ${md} 100P`, await p.inputValue('#l0-n1'));
  ok('摘要2＝製作伝票No.と送り先の略称＋入', (await p.inputValue('#l0-n2')) === '3001 テスト新規金属堺工場入', await p.inputValue('#l0-n2'));
  ok('注文番号が明細に入る', (await p.inputValue('#l0-ono')) === 'K-55');
  await p.selectOption('#dDest', ''); await p.waitForTimeout(100);
  ok('送り先を「得意先と同じ」にすると摘要2は出荷日＋出', (await p.inputValue('#l0-n2')) === `3001 ${md}出`, await p.inputValue('#l0-n2'));
  await p.selectOption('#dDest', cust.destinations[0].id); await p.waitForTimeout(100);
  ok('送り先が製作伝票から入る', (await p.inputValue('#dDest')) === cust.destinations[0].id);
  await p.fill('#s0-0-count', '60'); await p.fill('#s0-0-cases', '2');
  await p.click('#dForm button[type=submit]'); await p.waitForTimeout(500);
  ok('製作伝票は「一部出荷」になる', await p.evaluate(id => orderState(S.orders.find(o => o.id === id)) === 'partial', ord.id));
  const del1 = await p.evaluate(() => S.deliveries[S.deliveries.length - 1].id);
  // 残りを出荷（ピッカーから）
  await nav('#delivery-new'); await p.selectOption('#dCust', cust.id); await p.waitForTimeout(200);
  await p.click('[data-act=pickOrders]'); await p.waitForTimeout(300);
  await p.check(`#dlg input[value="${ord.id}"]`); await p.click('#dlg .btn.primary'); await p.waitForTimeout(300);
  ok('ピッカーで入れると残りの本数（40本）', (await p.inputValue('#s0-0-count')) === '40');
  await p.click('#dForm button[type=submit]'); await p.waitForTimeout(500);
  ok('製作伝票は「出荷済み」になる', await p.evaluate(id => orderState(S.orders.find(o => o.id === id)) === 'shipped', ord.id));

  // ---- 入力中に離れるとき ----
  await nav('#delivery-new'); await p.fill('#l0-mat', '5056S-H34'); await p.waitForTimeout(100);
  await p.evaluate(() => { location.hash = '#home'; }); await p.waitForTimeout(300);
  ok('入力中に離れようとすると確かめる', await p.isVisible('#dlg >> text=入力中の内容があります'));
  await p.click('#dlg .btn.text'); await p.waitForTimeout(200);
  ok('「やめる」で入力の画面に残る', (await p.textContent('h1')) === '納品書を入力する');
  ok('入力が残っている', (await p.inputValue('#l0-mat')) === '5056S-H34');
  await p.evaluate(() => { location.hash = '#home'; }); await p.waitForTimeout(300);
  await p.click('#dlg .btn.danger'); await p.waitForTimeout(300);
  ok('「離れる」でホームへ', (await p.textContent('h1')) === 'ホーム');

  // ---- 納品書の取消（理由が必要） ----
  await nav('#delivery-' + del1);
  await p.click('[data-act=cancelDelivery]'); await p.waitForTimeout(200);
  await p.click('#dlg .btn.danger'); await p.waitForTimeout(200);
  ok('理由なしでは取り消せない', await p.isVisible('#dlg .err-msg'));
  await p.fill('#reasonIn', 'テスト：入力の誤り'); await p.click('#dlg .btn.danger'); await p.waitForTimeout(400);
  ok('納品書を取り消せる（記録は残る）', await p.evaluate(id => { const d = S.deliveries.find(x => x.id === id); return d && d.status === 'cancelled' && d.cancelReason.includes('テスト'); }, del1));
  ok('取り消すと製作伝票は「一部出荷」に戻る', await p.evaluate(id => orderState(S.orders.find(o => o.id === id)) === 'partial', ord.id));

  // ---- 請求書を作って取り消す ----
  const before = await p.evaluate(() => ({ n: S.invoices.length, locked: S.deliveries.filter(d => d.invoiceId).length }));
  await p.evaluate(() => { ui.inv.month = defaultInvoiceMonth(); }); await nav('#invoices');
  const n = await p.$$eval('.invPick', e => e.length);
  if (n) {
    await p.click('[data-act=createInvoices]'); await p.waitForTimeout(300); await p.click('#dlg .btn.primary'); await p.waitForTimeout(600);
    await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  }
  const vid = await p.evaluate(() => { const v = S.invoices.filter(x => x.status !== 'cancelled').sort((a, b) => b.no - a.no)[0]; return v.id; });
  await nav('#invoice-' + vid);
  await p.click('[data-act=cancelInvoice]'); await p.waitForTimeout(200);
  await p.fill('#reasonIn', 'テスト：取消'); await p.click('#dlg .btn.danger'); await p.waitForTimeout(500);
  const after = await p.evaluate(id => { const v = S.invoices.find(x => x.id === id); return { st: v.status, locked: S.deliveries.filter(d => d.invoiceId === id).length, pays: S.payments.filter(x => x.invoiceId === id).length }; }, vid);
  ok('請求書を取り消すと、納品書・入金が「未請求」に戻る', after.st === 'cancelled' && after.locked === 0 && after.pays === 0, JSON.stringify(after));

  // ---- バックアップ（端末内）から戻す ----
  await nav('#setup'); await p.waitForTimeout(400);
  const snapCount = await p.$$eval('[data-act=restoreSnap]', e => e.length);
  ok('端末内のバックアップの一覧が出る', snapCount >= 2, `（${snapCount}件）`);
  const cntBefore = await p.evaluate(() => S.invoices.filter(v => v.status === 'cancelled').length);
  // 「請求書 No.… の取消の前」に戻す
  const btn = await p.$('tr:has-text("取消の前") [data-act=restoreSnap]');
  await btn.click(); await p.waitForTimeout(300);
  await p.click('#dlg .btn.danger'); await p.waitForTimeout(500);
  const cntAfter = await p.evaluate(() => S.invoices.filter(v => v.status === 'cancelled').length);
  ok('取消の前の状態に戻せる', cntAfter === cntBefore - 1, `${cntBefore} → ${cntAfter}`);
  await p.reload(); await p.waitForSelector('h1'); await p.waitForTimeout(300);
  ok('戻した状態が保存されている', await p.evaluate(c => S.invoices.filter(v => v.status === 'cancelled').length === c, cntAfter));

  // ---- 設定：使っている番号より小さい番号はエラー ----
  await nav('#setup');
  await p.fill('#sNoD', '1'); await p.click('#sForm button[type=submit]'); await p.waitForTimeout(300);
  ok('使っている番号より小さい納品書No.はエラー', (await p.$$eval('.err-msg', e => e.map(x => x.textContent))).some(x => x.includes('まで使っています')));
  await p.fill('#sReg', 'T612'); await p.click('#sForm button[type=submit]'); await p.waitForTimeout(300);
  ok('登録番号の形のエラー', (await p.$$eval('.err-msg', e => e.map(x => x.textContent))).some(x => x.includes('13桁')));

  ok('JavaScript のエラーがない', errors.length === 0, errors.slice(0, 3).join(' / '));
  await b.close(); console.log(`\n${pass} 件 OK、${fail} 件 NG`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
