// 帳票のページ分けの確認：行が多くても、ページの下が切れないこと（テスト用のブラウザで行う）
const { chromium } = require('playwright');
const URL = 'http://localhost:8766/' + encodeURIComponent('請求システム.html');
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext()).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL + '#home'); await p.waitForSelector('h1'); await p.waitForTimeout(500);
  const res = await p.evaluate(async () => {
    await document.fonts.ready;
    const out = [];
    const c = S.customers[0];
    const mkLine = (k, sizes = 1) => ({ id: uid(), kind: 'pipe', material: '5056S-H34', sizes: Array.from({ length: sizes }, (_, j) => ({ od: 30 + k, innerKind: 'id', inner: 20 + k, length: 2000 + j * 10, cases: 1, count: 5 + j })), kgInput: null, unitPrice: 1188, priceBasis: 'kg', note1: `No.${900 + k} 11/1出`, note2: k % 3 ? '' : 'A社材', orderId: null });
    const check = (label, html) => {
      const st = document.getElementById('pdf-stage'); st.innerHTML = html;
      const pages = [...st.querySelectorAll('.page')];
      const bad = [];
      pages.forEach((pg, i) => { if (pg.scrollHeight > pg.clientHeight + 1) bad.push(`p${i + 1} ${pg.scrollHeight}>${pg.clientHeight}`); pg.querySelectorAll('.half').forEach((h, j) => { if (h.scrollHeight > h.clientHeight + 1) bad.push(`p${i + 1}-half${j + 1} ${h.scrollHeight}>${h.clientHeight}`); }); });
      out.push({ label, pages: pages.length, bad }); st.innerHTML = '';
    };
    for (const n of [1, 9, 10, 18, 19, 40]) {
      const d = { id: uid(), no: 99000 + n, date: '2026-11-01', customerId: c.id, destId: c.destinations[0]?.id || null, lines: Array.from({ length: n }, (_, k) => mkLine(k)), status: 'issued', kariNo: 27000 + n };
      check(`納品書 ${n}行`, packHalves([...deliverySheets(d, ''), ...deliverySheets(d, '控')]));
      check(`仮納品書 ${n}行`, packHalves([...kariSheets(d, '', false), ...kariSheets(d, '控', true)]));
    }
    const d2 = { id: uid(), no: 99100, date: '2026-11-01', customerId: c.id, lines: [mkLine(1, 3), mkLine(2, 4), mkLine(3), mkLine(4, 3)], status: 'issued' };
    check('納品書 長さ違いの寸法が多い', packHalves(deliverySheets(d2, '')));
    for (const n of [1, 20, 21, 60, 61, 130]) {
      const dels = []; for (let k = 0; k < n; k++) { const d = { id: uid(), no: 98000 + k, date: '2026-11-0' + (1 + (k % 9)), customerId: c.id, lines: [mkLine(k % 20)], status: 'issued', invoiceId: null }; S.deliveries.push(d); dels.push(d); }
      const v = { id: uid(), no: 9999, customerId: c.id, closingDate: '2026-11-20', issueDate: '2026-11-20', periodFrom: '2026-10-21', periodTo: '2026-11-20', prevBilled: 1000000, received: 999340, carry: 660, sales: 123456789, tax: 12345679, total: 135803128, count: n, deliveryIds: dels.map(d => d.id), rules: { taxRate: 10, taxRounding: 'round' }, status: 'issued' };
      check(`請求書 明細${n}行`, invoicePages(v, '').join(''));
      S.deliveries = S.deliveries.filter(d => !dels.includes(d));
    }
    // 台帳（テストデータに行を足して）
    const dels = []; for (let k = 0; k < 90; k++) { const d = { id: uid(), no: 97000 + k, date: '2026-11-05', customerId: c.id, lines: [mkLine(k % 20)], status: 'issued', invoiceId: null }; S.deliveries.push(d); dels.push(d); }
    check('得意先台帳 90行以上', ledgerPages(c, '2026-01-01', '2026-12-31').join(''));
    S.deliveries = S.deliveries.filter(d => !dels.includes(d));
    return out;
  });
  let ng = 0;
  for (const r of res) { const ok = !r.bad.length; if (!ok) ng++; console.log(`${ok ? 'OK  ' : 'NG  '}${r.label}：${r.pages}ページ${r.bad.length ? '  はみ出し ' + r.bad.join(', ') : ''}`); }
  if (errs.length) { ng++; console.log('NG  エラー', errs); }
  await b.close(); console.log(ng ? `${ng} 件 NG` : 'すべて OK'); process.exit(ng ? 1 : 0);
})();
