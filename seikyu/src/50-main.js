/* =========================================================
   画面の切り替え・起動
   ========================================================= */
function parseHash() {
  const h = (location.hash || '').replace(/^#/, '');
  if (!h) return { name: 'home' };
  const m = /^(order|delivery|invoice|customer|addressee)-(new|edit-([a-z0-9]+)|([a-z0-9]+))$/.exec(h);
  if (m) {
    if (m[2] === 'new') return { name: `${m[1]}-new` };
    if (m[3]) return { name: `${m[1]}-edit`, id: m[3] };
    return { name: m[1], id: m[4] };
  }
  return { name: h };
}
const ROUTES = {
  home: { nav: 'home', view: viewHome },
  orders: { nav: 'orders', view: viewOrders, bind: bindOrders },
  'order-new': { nav: 'orders', view: () => viewOrderForm(null), bind: () => bindOrderForm(null), form: true },
  order: { nav: 'orders', view: r => viewOrderForm(r.id), bind: r => bindOrderForm(r.id), form: true },
  deliveries: { nav: 'deliveries', view: viewDeliveries, bind: bindDeliveries },
  'delivery-new': { nav: 'deliveries', view: () => viewDeliveryForm(null), bind: bindDeliveryForm, form: true },
  'delivery-edit': { nav: 'deliveries', view: r => viewDeliveryForm(r.id), bind: bindDeliveryForm, form: true },
  delivery: { nav: 'deliveries', view: r => viewDeliveryDetail(r.id) },
  invoices: { nav: 'invoices', view: viewInvoices, bind: bindInvoices },
  invoice: { nav: 'invoices', view: r => viewInvoiceDetail(r.id) },
  payments: { nav: 'payments', view: viewPayments, bind: bindPayments, form: true },
  ledger: { nav: 'ledger', view: viewLedger, bind: bindLedger },
  customers: { nav: 'customers', view: viewCustomers, bind: bindCustomers },
  'customers-import': { nav: 'customers', view: viewCustomerImport, bind: bindCustomerImport },
  labels: { nav: 'labels', view: viewLabels, bind: bindLabels },
  'addressee-new': { nav: 'labels', view: () => viewAddresseeForm(null), bind: () => bindAddresseeForm(null), form: true },
  addressee: { nav: 'labels', view: r => viewAddresseeForm(r.id), bind: r => bindAddresseeForm(r.id), form: true },
  'customer-new': { nav: 'customers', view: () => viewCustomerForm(null), bind: () => bindCustomerForm(null), form: true },
  customer: { nav: 'customers', view: r => viewCustomerForm(r.id), bind: r => bindCustomerForm(r.id), form: true },
  setup: { nav: 'setup', view: viewSetup, bind: bindSetup, form: true },
};
let currentHash = null, lastRouteKey = null;
function go(hash) { if (location.hash === hash) render(); else { ui.dirty = false; location.hash = hash; } }
function render() {
  if (!S) return;
  const r = parseHash(); const route = ROUTES[r.name] || ROUTES.home;
  const key = `${r.name}:${r.id || ''}`;
  if (key !== lastRouteKey) {
    // ほかの画面へ移ったら、入力中の内容は捨てて、いちばん上から表示する
    if (!r.name.startsWith('delivery-')) ui.df = null;
    if (!r.name.startsWith('customer')) ui.cf = null;
    if (r.name !== 'customers-import') ui.ci = null;
    window.scrollTo(0, 0);
  }
  const keepScroll = key === lastRouteKey ? window.scrollY : 0;
  lastRouteKey = key;
  const view = $('#view');
  let html;
  try { html = route.view(r); } catch (e) { console.error(e); html = notice('err', `画面を表示できませんでした（${esc(e.message)}）。ホームへ戻ってください。`); }
  view.innerHTML = html;
  $$('.nav a').forEach(a => { if (a.dataset.nav === route.nav) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  try { route.bind && route.bind(r); } catch (e) { console.error(e); }
  drawIcons(); renderChrome();
  if (keepScroll) window.scrollTo(0, keepScroll);
  closeNav();
}
function renderChrome() {
  $('#brandCo').textContent = S.company.name || '';
  const band = $('#modeBand');
  band.innerHTML = MODE === 'test' ? `<div class="mode-band"><strong>${icon('triangle-alert')}テストデータで表示しています</strong><span>取引先・金額は架空です${COMPANY_PRESET.name ? '（会社の情報だけは実際の値）' : ''}。${MASTER_CSV ? '本番のデータに切り替えると、旧システムの得意先・宛名が登録されています。' : ''}本番のデータとは別に保存されます。</span><a href="#setup" class="small">本番のデータに切り替える</a></div>` : '';
  const openOrders = S.orders.filter(o => ['open', 'partial'].includes(orderState(o))).length;
  const bo = $('#badgeOrders'); bo.hidden = !openOrders; bo.textContent = openOrders; bo.setAttribute('aria-label', `出荷待ち ${openOrders}件`);
  const due = dueInvoiceRows().length;
  const bi = $('#badgeInvoices'); bi.hidden = !due; bi.textContent = due; bi.setAttribute('aria-label', `請求書を作る得意先 ${due}社`);
  drawIcons(); renderSaveState();
}
function renderSaveState() {
  const el = $('#saveState'); if (!el) return;
  if (saveBlocked) { el.innerHTML = `${icon('circle-alert')}<span class="txt">保存を止めています</span>`; }
  else if (saveFailed) { el.innerHTML = `<span class="chip err">${icon('circle-alert')}保存できませんでした</span>`; }
  else if (lastSavedAt) { el.innerHTML = `${icon('circle-check')}<span class="txt">保存しました ${pad2(lastSavedAt.getHours())}:${pad2(lastSavedAt.getMinutes())}</span>`; }
  else el.innerHTML = '';
  drawIcons();
}
function closeNav() { const n = $('#nav'); if (n.classList.contains('open')) { n.classList.remove('open'); $('#menuBtn').setAttribute('aria-expanded', 'false'); } }

/* ---------- 入力中に画面を離れるとき ---------- */
let ignoreHash = false;
window.addEventListener('hashchange', async () => {
  if (ignoreHash) { ignoreHash = false; return; }
  if (ui.dirty && currentHash && currentHash !== location.hash) {
    const target = location.hash;
    ignoreHash = true; history.replaceState(null, '', currentHash); ignoreHash = false;
    const ok = await confirmDialog({ title: '入力中の内容があります', body: '<p>登録していない内容は消えます。このページを離れますか？</p>', okLabel: '離れる', okIcon: 'arrow-left', danger: true });
    if (!ok) return;
    ui.dirty = false; ui.df = null; ui.cf = null; location.hash = target; return;
  }
  currentHash = location.hash; render();
});
window.addEventListener('beforeunload', e => { if (ui.dirty) { e.preventDefault(); e.returnValue = ''; } });

/* ---------- ボタン（data-act） ---------- */
const ACTIONS = {
  printDelivery: el => openPrintDelivery(el.dataset.id),
  printKari: el => openPrintKari(el.dataset.id),
  printInvoice: el => openPrintInvoices([el.dataset.id]),
  printInvoicesBulk: () => { const ids = S.invoices.filter(v => v.status !== 'cancelled' && !v.printedAt).map(v => v.id); if (!ids.length) { toast('まだ印刷していない請求書はありません', 'info'); return; } openPrintInvoices(ids); },
  printLedger: () => openPrintLedger(),
  cancelDelivery: el => cancelDelivery(el.dataset.id),
  copyDelivery: el => { ui.df = null; ui.copyFrom = el.dataset.id; },
  createInvoices: () => createInvoices(),
  cancelInvoice: el => cancelInvoice(el.dataset.id),
  cancelPayment: el => cancelPayment(el.dataset.id),
  ordersToDelivery: () => ordersToDelivery(),
  orderToDelivery: el => { ui.dirty = false; ui.df = null; ui.pendingOrders = [el.dataset.id]; go('#delivery-new'); },
  orderDone: el => orderSetStatus(el.dataset.id, 'done'),
  orderReopen: el => orderSetStatus(el.dataset.id, 'active'),
  orderCancel: el => orderSetStatus(el.dataset.id, 'cancelled'),
  oBasis: el => { $('#oBasis').value = el.dataset.v; $$('[data-act=oBasis]').forEach(b => b.setAttribute('aria-pressed', String(b === el))); ui.dirty = true; },
  importCustomersPick: () => $('#ciFile').click(),
  clShow: el => { ui.cl.show = el.dataset.v; render(); },
  lbAll: el => labelSelectAll(el.dataset.v === '1'),
  lbPrint: () => openPrintLabels(),
  masterImport: () => openMasterImport(),
  importCustomersRun: () => importCustomersRun(),
  oInnerKind: el => { $('#oInnerKind').value = el.dataset.v; $$('[data-act=oInnerKind]').forEach(b => b.setAttribute('aria-pressed', String(b === el))); $('label[for=oInner]').firstChild.textContent = `${el.dataset.v === 't' ? '肉厚' : '内径'}（mm）`; $('#oInner').value = ''; $('#oInner').focus(); orderFormCalcHint(); },
  addDest: () => { ui.cf.dests.push({ id: uid(), name: '', address: '', tel: '', active: true }); ui.dirty = true; $('#destRows').innerHTML = ui.cf.dests.map((x, i) => destRowHtml(x, i)).join(''); drawIcons(); focusLater(`#dn${ui.cf.dests.length - 1}`); },
  openLedger: el => { ui.lg = { cust: el.dataset.id, from: '', to: '' }; },
  lgPeriod: el => ledgerPeriod(Number(el.dataset.v)),
  switchMode: el => switchMode(el.dataset.v),
  fieldHeight: el => setFieldHeight(el.dataset.v),
  resetTest: () => resetTestData(),
  exportBackup: () => exportBackup(),
  importBackup: () => $('#importFile').click(),
  restoreSnap: el => restoreSnap(el.dataset.at),
};
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (b) {
    const a = b.dataset.act;
    if (ACTIONS[a]) { if (b.tagName === 'BUTTON') e.preventDefault(); ACTIONS[a](b, e); return; }
    if (ui.df && ['addPipe', 'addOther', 'copyPrev', 'removeLine', 'addSize', 'removeSize', 'innerKind', 'basis', 'pickOrders'].includes(a)) { e.preventDefault(); deliveryAction(a, b); return; }
  }
  const tr = e.target.closest('tr[data-href]');
  if (tr && !e.target.closest('a,button,input,label,select')) { if (tr.dataset.month) ui.inv.month = tr.dataset.month; location.hash = tr.dataset.href; }
  const link = e.target.closest('a[href^="#"]');
  if (link && link.getAttribute('href') === location.hash) { e.preventDefault(); render(); }
});
$('#menuBtn').addEventListener('click', () => { const n = $('#nav'); const open = !n.classList.contains('open'); n.classList.toggle('open', open); $('#menuBtn').setAttribute('aria-expanded', String(open)); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeNav(); });

/* ---------- テスト／本番の切り替え ---------- */
async function switchMode(to) {
  if (to === MODE) return;
  const body = to === 'main' ? '<p>本番のデータに切り替えます。テストデータは消さずに残します（あとで戻せます）。</p>' : '<p>テストデータ（架空の取引先）に切り替えます。本番のデータは消さずに残します。</p>';
  if (!(await confirmDialog({ title: to === 'main' ? '本番のデータに切り替える' : 'テストデータに切り替える', body, okLabel: '切り替える', okIcon: 'database' }))) return;
  await save(true);
  const raw = await kvGet('data:' + to);
  let d = null;
  if (raw) { try { d = JSON.parse(raw); } catch (e) { d = null; } if (!validDataset(d)) { showLoadError(raw, to); return; } d = migrate(d); }
  else d = to === 'main' ? newDataset('main') : seedTestData();
  MODE = to; S = d; await kvSet('mode', MODE);
  if (!raw) await save(true);
  const reg = await registerMasterIfEmpty();
  if (reg) { ui.df = null; ui.cf = null; ui.dirty = false; toast(`本番のデータに切り替え、旧システムの得意先 ${reg.nCust} 件・宛名 ${reg.nAddr} 件を登録しました`); go('#customers'); return; }
  ui.df = null; ui.cf = null; ui.dirty = false;
  toast(to === 'main' ? '本番のデータに切り替えました' : 'テストデータに切り替えました');
  go('#home');
}
async function resetTestData() {
  if (MODE !== 'test') return;
  if (!(await confirmDialog({ title: 'テストデータを作り直す', body: '<p>テストデータを最初の状態に作り直します。今のテストデータは自動バックアップに残します。本番のデータには影響しません。</p>', okLabel: '作り直す', okIcon: 'rotate-ccw' }))) return;
  await snapshot('テストデータを作り直す前');
  S = seedTestData(); await save(true); toast('テストデータを作り直しました'); go('#home');
}

/* ---------- 読み込みに失敗したとき（保存しない） ---------- */
function showLoadError(raw, which) {
  saveBlocked = true; renderSaveState();
  $('#view').innerHTML = `<div class="page-head"><h1>データを読み込めませんでした</h1></div>
    ${notice('err', `<b>保存されているデータ（${which === 'test' ? 'テストデータ' : '本番'}）を読み込めませんでした。</b>データを守るため、このまま何も保存しません。下のボタンで、保存されている内容をそのままファイルに書き出してから、担当者に相談してください。`)}
    <div class="actions"><button type="button" class="btn primary" id="dlRaw">${icon('download')}保存されている内容をそのまま書き出す</button></div>`;
  $('#dlRaw').onclick = () => saveFile(`請求システム_読み込めなかったデータ_${stampName()}.json`, new Blob([raw], { type: 'application/json' }));
  drawIcons();
}

/* ---------- 起動 ---------- */
async function boot() {
  idbConn = await openIdb();
  storageKind = idbConn ? 'indexeddb' : (() => { try { localStorage.setItem(LS_PREFIX + 't', '1'); localStorage.removeItem(LS_PREFIX + 't'); return 'localstorage'; } catch (e) { return 'none'; } })();
  try { applyFieldHeight(await kvGet('pref:fieldHeight')); } catch (e) { applyFieldHeight('normal'); }
  let mode = await kvGet('mode');
  // はじめて開いたとき：本番のデータがあるか、旧システムの一覧を入れて作ったときは本番で開く
  if (mode !== 'main' && mode !== 'test') mode = ((await kvGet('data:main')) || MASTER_CSV) ? 'main' : 'test';
  MODE = mode;
  const raw = await kvGet('data:' + MODE);
  if (raw) {
    let d = null; try { d = JSON.parse(raw); } catch (e) { d = null; }
    if (!validDataset(d)) { S = newDataset(MODE); renderChrome(); showLoadError(raw, MODE); return; }
    const before = d.version;
    // 形を新しくする前の、元のままのデータを端末内バックアップに残す
    if (before !== DATA_VERSION) { S = d; await snapshot('データの形を新しくする前'); }
    S = migrate(d);
    if (before !== DATA_VERSION) { logAction('データの形を新しくする', `${before ?? '不明'} → ${DATA_VERSION}`); await save(true); }
  } else {
    S = MODE === 'test' ? seedTestData() : newDataset('main');
    if (storageKind !== 'none') { await kvSet('mode', MODE); await save(true); }
  }
  const reg = await registerMasterIfEmpty();
  currentHash = location.hash;
  render();
  if (reg) toast(`旧システムの得意先 ${reg.nCust} 件・宛名（仕入先など）${reg.nAddr} 件を登録しました`);
  if (storageKind === 'none') toast('このブラウザではデータを保存できません（プライベートモードなど）。閉じると入力した内容は消えます', 'circle-alert');
}
boot();
