/* ---------- テストデータ（取引先はすべて架空） ---------- */
function seedTestData(today = todayStr()) {
  const d = newDataset('test');
  if (!COMPANY_PRESET.name) d.company = { ...COMPANY_FICTIONAL };
  d.numbers = { delivery: 64450, kari: 27100, invoice: 120 };
  d.numbersConfirmed = true;
  const mk = (code, name, closingDay, extra = {}) => ({ id: uid(), code, name, kana: '', zip: '', address: '', address2: '', tel: '', fax: '', closingDay, taxRounding: null, billToId: null, needsCheck: [], payNote: '', memo: '', destinations: [], opening: { date: '', balance: 0 }, active: true, createdAt: nowIso(), updatedAt: nowIso(), ...extra });
  const c1 = mk(101, '見本金属(株)', 20, { address: '大阪府堺市（架空）', tel: '000-000-0001', payNote: '翌月末 振込' });
  const c2 = mk(102, 'サンプル軽金(株) 本社', 31, { address: '大阪府大阪市（架空）', payNote: '翌月末 振込' });
  const c3 = mk(103, '架空産業(株)', 20, { payNote: '翌々月10日 手形' });
  const c4 = mk(104, '試験アルミ(株)', 31, { memo: 'テスト用：取引なし', taxRounding: 'floor' });
  // 請求先の例：営業所の売上を本社（見本金属）の請求書にまとめる。締日なし
  const c5 = mk(105, '見本金属(株) 大阪営業所', null, { billToId: c1.id, kana: 'み' });
  c3.destinations.push({ id: uid(), code: '1', name: '(株)テスト工業 八尾工場', short: 'テスト工業', zip: '', address: '大阪府八尾市（架空）', tel: '', active: true });
  c1.destinations.push({ id: uid(), code: '2', name: '見本金属(株) 第二工場', short: '見本第二', zip: '', address: '', tel: '', active: true });
  d.customers.push(c1, c2, c3, c4, c5);

  // 日付は「今日」から決める（いつ開いても筋の通る例にする）
  const t = today;
  const c1Last = (() => { const c = latestClosingOnOrBefore(c1, t); return c === t ? prevClosingDate(c1, c) : c; })();
  const c1Prev = prevClosingDate(c1, c1Last);
  c1.opening = { date: c1Prev, balance: 1188000 };
  const c2Last = (() => { const c = latestClosingOnOrBefore(c2, t); return c === t ? prevClosingDate(c2, c) : c; })();
  c2.opening = { date: prevClosingDate(c2, c2Last), balance: 0 };
  c3.opening = { date: prevClosingDate(c3, latestClosingOnOrBefore(c3, t)), balance: 0 };
  const clamp = (s, lo, hi) => { const x = s < lo ? lo : s; return x > hi ? hi : x; }; // 今日より先の日付にはしない
  const sz = (od, inner, length, cases, count, innerKind = 'id') => ({ od, innerKind, inner, length, cases, count });
  const pipe = (material, sizes, kgInput, unitPrice, note1 = '', note2 = '', orderId = null) => ({ id: uid(), kind: 'pipe', material, sizes, kgInput, unitPrice, priceBasis: 'kg', note1, note2, orderId });
  let no = 64430;
  const del = (cust, date, lines, extra = {}) => { const x = { id: uid(), no: no++, date, customerId: cust.id, destId: null, destFree: null, lines, memo: '', status: 'issued', invoiceId: null, kariNo: null, createdAt: nowIso(), updatedAt: nowIso(), printedAt: nowIso(), ...extra }; d.deliveries.push(x); return x; };

  // 製作伝票
  const ord = (cust, no2, date, orderNo, material, s, plannedCount, unitPrice, due, extra = {}) => { const o = { id: uid(), no: no2, date, customerId: cust.id, user: '', destId: null, orderNo, material, od: s.od, innerKind: s.innerKind, inner: s.inner, length: s.length, qtyText: plannedCount ? `${plannedCount}P` : '', plannedCount, plannedKg: null, dueDate: due, unitPrice, priceBasis: 'kg', note: '', memo: '', status: 'active', createdAt: nowIso(), updatedAt: nowIso(), ...extra }; d.orders.push(o); return o; };
  const o1 = ord(c1, '30110131', addDays(t, -20), '134', '5056S-H34', sz(82, 68.5, 2337.6), 84, 1255, addDays(t, -2), { user: '見本町' });
  const o2 = ord(c1, '30110140', addDays(t, -9), '141', '5056S-H32', sz(29, 21, 2480), 20, 1289, addDays(t, 5), { user: '見本町', note: '曲り注意' });
  const o3 = ord(c3, '30110142', addDays(t, -8), 'A-77', '52S-H34', sz(80.2, 72.5, 1830), 12, 1180, addDays(t, 3), { destId: c3.destinations[0].id, user: '試験台' });
  ord(c2, '30110143', addDays(t, -3), '9001', '5056S-O', sz(60, 53, 2450), 6, 1148, addDays(t, 9), { qtyText: '5M' });

  // 見本金属：前の期間（請求済み）
  const p1a = clamp(addDays(c1Prev, 4), addDays(c1Prev, 1), c1Last), p1b = clamp(addDays(c1Prev, 12), addDays(c1Prev, 1), c1Last), p1c = clamp(addDays(c1Prev, 25), addDays(c1Prev, 1), c1Last);
  const da = del(c1, p1a, [pipe('5056S-H34', [sz(30.5, 26, 2500, 1, 88)], 116.1, 1188, `No.279 ${fmtMD(p1a)}出`), pipe('5056S-H34', [sz(87, 62.5, 1660, 1, 3)], 37.8, 1208, `No.281 ${fmtMD(p1a)}出`)]);
  const db = del(c1, p1b, [pipe('5056S-H34', [sz(77, 67, 2602.8, 4, 62)], 483.6, 1138, `No.267 ${fmtMD(p1b)}出`)]);
  const dc = del(c1, p1c, [pipe('5056S-H32', [sz(29, 25.5, 2400, 1, 24)], 23.2, 1238, `No.283 ${fmtMD(p1c)}出`, 'A社材'), pipe('5056S-O', [sz(68, 61, 2367.4, 2, 36)], 160.6, 1148, `No.285 ${fmtMD(p1c)}出`)]);
  // 請求書（前の締め日）
  const tmpS = S; S = d;
  const inv = { id: uid(), no: d.numbers.invoice++, customerId: c1.id, closingDate: c1Last, issueDate: c1Last, periodFrom: addDays(c1Prev, 1), periodTo: c1Last, prevBilled: 1188000, received: 0, carry: 1188000, sales: 0, tax: 0, total: 0, count: 3, deliveryIds: [da.id, db.id, dc.id], paymentIds: [], rules: { taxRate: 10, taxRounding: 'round' }, status: 'issued', createdAt: nowIso(), printedAt: nowIso() };
  inv.sales = sum([da, db, dc], x => deliveryTotals(x).amount); inv.tax = taxOf(inv.sales); inv.total = inv.carry + inv.sales + inv.tax;
  for (const x of [da, db, dc]) x.invoiceId = inv.id;
  d.invoices.push(inv);
  S = tmpS;
  // 入金（前の前の請求分。振込手数料を差し引かれた例）
  const payDate = clamp(addDays(c1Last, 10), addDays(c1Last, 1), t);
  d.payments.push({ id: uid(), date: payDate, customerId: c1.id, amount: 1187340, fee: 660, method: '振込', memo: '振込手数料を差し引き', status: 'active', invoiceId: null, createdAt: nowIso() });

  // 見本金属：今の期間（まだ請求していない）
  const n1 = clamp(addDays(c1Last, 3), addDays(c1Last, 1), t), n2 = clamp(addDays(c1Last, 8), addDays(c1Last, 1), t);
  del(c1, n1, [
    pipe('5056S-H34', [sz(82, 68.5, 2337.6, 3, 42)], 417.9, 1255, `No.134 ${fmtMD(n1)}出`, '', o1.id),
    pipe('5056S-H34', [sz(32.5, 29, 2220, 1, 4)], 4, 1299, `No.135 ${fmtMD(n1)}出`),
    pipe('5056S-H34', [sz(53, 49, 1880, 1, 1), sz(53, 49, 1800, 0, 2)], 4.7, 1299, `No.135 ${fmtMD(n1)}出`),
    pipe('5056S-H32', [sz(58.5, 39, 2050, 1, 3)], 24.2, 1239, `No.137 ${fmtMD(n1)}出`),
  ]);
  del(c1, n2, [pipe('5056S-H32', [sz(29, 21, 2480, 1, 10)], null, 1289, `No.141 ${fmtMD(n2)}出`, '', o2.id)], { printedAt: null });
  // 見本金属 大阪営業所：請求は見本金属の請求書にまとめる
  del(c5, n1, [pipe('5056S-H34', [sz(40, 34, 2000, 1, 10)], 25.5, 1200, `見本町 ${fmtMD(n1)} 10P`, `30110150 ${fmtMD(n1)}出`)]);
  // 架空産業：送り先が違う（仮納品書は金額なし）
  const n3 = clamp(addDays(t, -2), addDays(latestClosingOnOrBefore(c3, t), 1), t);
  del(c3, n3, [pipe('52S-H34', [sz(80.2, 72.5, 1830, 1, 6)], 27.5, 1180, `No.A-77 ${fmtMD(n3)}出`, '', o3.id), pipe('52S-H34', [sz(79.5, 72, 1880, 1, 9)], 41, 1180, `No.A-77 ${fmtMD(n3)}出`)], { destId: c3.destinations[0].id });
  // サンプル軽金：前の月（締め日が来ていて、まだ請求書を作っていない）と今の月
  const m1 = clamp(addDays(c2Last, -12), addDays(c2.opening.date, 1), c2Last), m2 = clamp(addDays(c2Last, -3), addDays(c2.opening.date, 1), c2Last), m3 = clamp(addDays(c2Last, 4), addDays(c2Last, 1), t);
  del(c2, m1, [pipe('5056S-H34', [sz(55.5, 37, 1970, 1, 12)], 84, 1188, `No.9001 ${fmtMD(m1)}出`), pipe('5056S-H34', [sz(37, 31.6, 2530, 4, 52)], 103, 1158, `No.9002 ${fmtMD(m1)}出`)]);
  del(c2, m2, [pipe('5056S-H34', [sz(19, 14.5, 2060, 1, 60)], 38.5, 1238, `No.9003 ${fmtMD(m2)}出`, 'A社材'), { id: uid(), kind: 'other', name: '運賃', qty: 1, unit: '式', unitPrice: 3500, note1: '', note2: '' }]);
  del(c2, m3, [pipe('5056S-H32', [sz(42.5, 38, 1980, 1, 18)], 27, 1188, `No.9004 ${fmtMD(m3)}出`)]);
  d.deliveries.sort((a, b) => a.no - b.no);
  d.numbers.delivery = no;
  d.log.push({ at: nowIso(), action: 'テストデータ', summary: 'テストデータ（架空の取引先）を作りました', ref: null });
  return d;
}
