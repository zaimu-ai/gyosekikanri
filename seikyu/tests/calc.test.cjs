// 計算の検算（実物の帳票の数字と合うか）。node tests/calc.test.cjs
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..', 'src');
const ctx = { console, Math, Date, JSON, Number, String, Array, Object, Set, Map, Promise, setTimeout, clearTimeout, window: {}, localStorage: null };
vm.createContext(ctx);
for (const f of ['20-core.js', '25-seed.js']) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
vm.runInContext('S = newDataset("test");', ctx);
let fail = 0, pass = 0;
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; console.log(`${ok ? 'OK  ' : 'NG  '}${name}: ${JSON.stringify(got)}${ok ? '' : `  (期待 ${JSON.stringify(want)})`}`); };
const run = code => vm.runInContext(code, ctx);

// 重さ：事務コンの画面（5056S 82.00×内径68.50×2,337.6、42本 → 単位重量 10.09、重量 423.8）
eq('1本の重さ 82×68.5×2337.6', run('unitKg({od:82,innerKind:"id",inner:68.5,length:2337.6})'), 10.09);
eq('計算重量 42本', run('lineCalcKg({kind:"pipe",sizes:[{od:82,innerKind:"id",inner:68.5,length:2337.6,count:42}]})'), 423.8);
// 製作伝票（18×11、M単重 0.43138、13mm の単重 0.00561、肉厚3.5）
eq('M単重 18×11', run('kgPerM({od:18,innerKind:"id",inner:11})'), 0.43138);
eq('M単重 18×肉厚3.5', run('kgPerM({od:18,innerKind:"t",inner:3.5})'), 0.43138);
eq('単重 18×11×13', run('unitKg({od:18,innerKind:"id",inner:11,length:13})'), 0.00561);
eq('9000本の重さ（受注量 50.5kg）', run('lineCalcKg({kind:"pipe",sizes:[{od:18,innerKind:"id",inner:11,length:13,count:9000}]})'), 50.5);
// 金額：納品書の見本（重量×単価、円未満切り捨て）
const lines = [[417.9, 1255, 524464], [4, 1299, 5196], [7, 1349, 9443], [4.7, 1299, 6105], [12.2, 1299, 15847], [24.2, 1239, 29983], [20.4, 1289, 26295]];
for (const [kg, p, want] of lines) eq(`金額 ${kg}kg×${p}`, run(`mulYen(${kg},${p},"floor")`), want);
eq('納品書の見本の合計', lines.reduce((a, [kg, p]) => a + run(`mulYen(${kg},${p},"floor")`), 0), 617333);
eq('得意先台帳の見本 116.1×1188', run('mulYen(116.1,1188,"floor")'), 137926);
eq('得意先台帳の見本 483.6×1138', run('mulYen(483.6,1138,"floor")'), 550336);
eq('得意先台帳の見本 160.6×1148', run('mulYen(160.6,1148,"floor")'), 184368);
// 消費税：請求書の見本（3,089,906 → 308,991、合計 3,398,897）
eq('消費税 3,089,906', run('taxOf(3089906)'), 308991);
eq('請求額', 3089906 + run('taxOf(3089906)'), 3398897);
eq('消費税 切り捨てにすると', run('roundYen(308990.6,"floor")'), 308990);
// 端数の向き（マイナスは0に近い側へ切り捨て）
eq('値引き -1.5×1000', run('mulYen(-1.5,1000,"floor")'), -1500);
eq('値引き -0.7×3 切り捨て', run('mulYen(-0.7,3,"floor")'), -2);
// 寸法の誤り
eq('内径が外径以上', run('wallT({od:20,innerKind:"id",inner:20})'), null);
eq('肉厚が大きすぎる', run('wallT({od:20,innerKind:"t",inner:11})'), null);
// 締め日
eq('20日締めの前', run('prevClosingDate({closingDay:20},"2026-11-20")'), '2026-10-20');
eq('末日締め 2月', run('closingDateOf({closingDay:31},2027,2)'), '2027-02-28');
eq('末日締めの前（3月→2月）', run('prevClosingDate({closingDay:31},"2027-03-31")'), '2027-02-28');
eq('今日までの締め日 11/19（20日締め）', run('latestClosingOnOrBefore({closingDay:20},"2026-11-19")'), '2026-10-20');
eq('今日までの締め日 11/20（20日締め）', run('latestClosingOnOrBefore({closingDay:20},"2026-11-20")'), '2026-11-20');
// 入力の読み取り
eq('全角の数字', run('parseNum("１，２５５")'), 1255);
eq('空', run('parseNum("  ")'), null);
eq('読めない', Number.isNaN(run('parseNum("12a")')), true);

// テストデータで請求書の計算（いくつかの日付で）
for (const day of ['2026-11-19', '2026-11-20', '2026-12-01', '2027-01-31', '2027-03-01']) {
  run(`S = seedTestData("${day}");`);
  const r = run(`(() => { const c = S.customers[0]; const cd = closingDateOf(c, ${+day.slice(0, 4)}, ${+day.slice(5, 7)}); const dr = invoiceDraft(c, cd > "${day}" ? cd : cd); return { prev: dr.prevBilled, recv: dr.received, carry: dr.carry, count: dr.count, sales: dr.sales, tax: dr.tax, total: dr.total, ok: dr.carry + dr.sales + dr.tax === dr.total, missing: dr.missing.length }; })()`);
  eq(`テストデータ ${day} 見本金属の次の請求：繰越＋売上＋税＝請求額`, r.ok, true);
  eq(`テストデータ ${day} 前回請求額＝前の請求書`, r.prev, run('S.invoices[0].total'));
  const dates = run('S.deliveries.map(d => d.date).filter(x => x > "' + day + '").length');
  eq(`テストデータ ${day} 未来の日付の納品書がない`, dates, 0);
}
// 1年分の毎日で、テストデータに今日より先の日付がないこと
{
  let bad = [];
  for (let k = 0; k < 400; k++) {
    const day = run(`addDays("2026-11-01", ${k})`);
    run(`S = seedTestData("${day}");`);
    const n = run(`[...S.deliveries.map(d=>d.date), ...S.payments.map(p=>p.date), ...S.invoices.map(v=>v.closingDate), ...S.orders.map(o=>o.date)].filter(x => x > "${day}").length`);
    const neg = run(`S.deliveries.filter(d => d.customerId === S.customers[0].id && !d.invoiceId).some(d => d.date <= S.invoices[0].closingDate)`);
    if (n || neg) bad.push(day);
  }
  eq('400日分のテストデータの日付', bad, []);
}
console.log(`\n${pass} 件 OK、${fail} 件 NG`);
process.exit(fail ? 1 : 0);
