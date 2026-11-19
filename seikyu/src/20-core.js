'use strict';
/* =========================================================
   請求システム（製作伝票 → 納品書 → 請求書 → 入金 → 得意先台帳）
   データは利用者のブラウザの中（IndexedDB。使えないときは localStorage）に保存する。
   登録したデータは消さない（取り消しは「取消」の状態で残す）。
   ========================================================= */
const APP_VERSION = '0.3.0';
const DATA_VERSION = 3;

/* ---------- 小さな道具 ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const pad2 = n => String(n).padStart(2, '0');
const pad6 = n => String(n).padStart(6, '0');
const nowIso = () => new Date().toISOString();
const ymd = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const todayStr = () => ymd(new Date());
const icon = (name, label) => `<i data-lucide="${name}"${label ? ` aria-label="${esc(label)}"` : ''}></i>`;
const sum = (arr, f = x => x) => arr.reduce((a, x) => a + (f(x) || 0), 0);

/** 全角の数字・記号を半角に。前後の空白を除く */
function toHalf(s) {
  return String(s ?? '').replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[．。]/g, '.').replace(/[，、]/g, ',').replace(/[－ー−‐―]/g, '-').replace(/[　\s]+/g, ' ').trim();
}
/** 数の入力を読む。空なら null、読めなければ NaN */
function parseNum(s) {
  const t = toHalf(s).replace(/[,\s円¥￥]/g, '');
  if (t === '') return null;
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(t)) return NaN;
  return Number(t);
}
/** 四捨五入（0から遠い方へ）。d は小数の桁数 */
function roundTo(x, d) {
  if (x == null || Number.isNaN(x)) return null;
  const m = 10 ** d;
  return Math.sign(x) * Math.round(Math.abs(x) * m + 1e-7) / m;
}
/** 円未満の端数処理。mode: floor=切り捨て, round=四捨五入, ceil=切り上げ（負の数は0に近い側が切り捨て） */
function roundYen(x, mode) {
  if (x == null || Number.isNaN(x)) return null;
  const s = Math.sign(x), a = Math.abs(x);
  const r = mode === 'round' ? Math.floor(a + 0.5 + 1e-7) : mode === 'ceil' ? Math.ceil(a - 1e-7) : Math.floor(a + 1e-7);
  return s * r || 0;
}
/** 数量×単価（数量は小数3桁、単価は小数2桁まで。整数で計算してから端数処理） */
function mulYen(q, price, mode) {
  if (q == null || price == null || Number.isNaN(q) || Number.isNaN(price)) return null;
  const qi = Math.round(q * 1000), pi = Math.round(price * 100);
  return roundYen(qi * pi / 100000, mode);
}
const ROUND_LABEL = { floor: '切り捨て', round: '四捨五入', ceil: '切り上げ' };

/* ---------- 表示の形 ---------- */
function yen(n) { if (n == null || Number.isNaN(n)) return '—'; return (n < 0 ? '−' : '') + Math.abs(n).toLocaleString('ja-JP'); }
function fmtN(n, min = 0, max = 3) { if (n == null || Number.isNaN(n)) return '—'; return (n < 0 ? '−' : '') + Math.abs(n).toLocaleString('ja-JP', { minimumFractionDigits: min, maximumFractionDigits: max }); }
const fmtKg = n => fmtN(n, 1, 3);
const fmtDim = n => n == null ? '' : n.toLocaleString('ja-JP', { minimumFractionDigits: 2, maximumFractionDigits: 3, useGrouping: false });
const fmtLen = n => n == null ? '' : n.toLocaleString('ja-JP', { minimumFractionDigits: 1, maximumFractionDigits: 2, useGrouping: false });
const fmtPrice = n => n == null ? '—' : n.toLocaleString('ja-JP', { maximumFractionDigits: 2 });
function parseYmd(s) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
function fmtDate(s) { const d = parseYmd(s); return d ? `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}` : '—'; }
function fmtDateJ(s) { const d = parseYmd(s); return d ? `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日` : '—'; }
function fmtMD(s) { const d = parseYmd(s); return d ? `${d.getMonth() + 1}/${d.getDate()}` : ''; }
function fmtDateTime(iso) { if (!iso) return '—'; const d = new Date(iso); return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
function addDays(s, n) { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); }
const lastDayOf = (y, m) => new Date(y, m, 0).getDate();
/** 得意先の締め日（その年月の）。closingDay=31 は末日 */
function closingDateOf(cust, y, m) {
  const day = Math.min(cust.closingDay || 31, lastDayOf(y, m));
  return `${y}-${pad2(m)}-${pad2(day)}`;
}
function prevClosingDate(cust, closingDate) {
  const d = parseYmd(closingDate); let y = d.getFullYear(), m = d.getMonth(); // m は前の月（1〜12 に直す）
  if (m === 0) { y -= 1; m = 12; }
  return closingDateOf(cust, y, m);
}
/** 今日までに来た、いちばん新しい締め日 */
function latestClosingOnOrBefore(cust, day) {
  const d = parseYmd(day); const y = d.getFullYear(), m = d.getMonth() + 1;
  const c = closingDateOf(cust, y, m);
  return c <= day ? c : prevClosingDate(cust, c);
}
const closingLabel = day => (!day || day >= 31) ? '末日' : `${day}日`;
/** 日付の入力を読む（2026/6/4・2026-06-04・R8.6.4 は読まない） */
function parseDateInput(s) {
  const t = toHalf(s).replace(/[年月.]/g, '/').replace(/日/g, '').replace(/-/g, '/');
  const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(t);
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > lastDayOf(y, mo)) return null;
  return `${y}-${pad2(mo)}-${pad2(d)}`;
}

/* ---------- 会社・きまりの初期値 ---------- */
/* 会社の実際の情報は repository に入れない。本番用に作るときだけ build.sh が COMPANY_JSON から入れる */
const COMPANY_PRESET = Object.assign({ name: '', zip: '', address: '', tel: '', fax: '', regNo: '', bank: '' },
  (typeof window !== 'undefined' && window.__COMPANY_PRESET__) || {});
/** テストデータで使う架空の会社（会社の情報が入っていないとき） */
const COMPANY_FICTIONAL = { name: '見本軽合金株式会社（架空）', zip: '000-0000', address: '架空県見本市1-2-3', tel: '(000)000-0000', fax: '(000)000-0001', regNo: 'T0000000000000', bank: '見本銀行 本店　当座 0000000（架空）' };
const RULES_DEFAULT = {
  taxRate: 10,            // 消費税率（%）
  taxRounding: 'round',   // 請求書の消費税の端数（請求書の見本 3,089,906×10%＝308,990.6 → 308,991 から。四捨五入か切り上げかは確認事項）
  amountRounding: 'floor',// 金額＝数量×単価の円未満（納品書の見本 12.2kg×1,299＝15,847.8 → 15,847 で切り捨てを確認）
  coef: 0.0085,           // 1mあたりの重さ（kg）＝（外径−肉厚）×肉厚×係数（製作伝票の M単重 0.43138 で確認）
  unitDigits: 2,          // 1本の重さを丸める桁（事務コンの画面 10.09 で確認）
  weightDigits: 1,        // 明細の重量の桁（事務コンの画面 423.8 で確認）
  honorific: { delivery: '様', kari: '殿', invoice: '殿' },
};
/* 宛名ラベルの用紙（A4）。寸法は mm。お使いの用紙に合わせて「自分で決める」で変えられる */
const LABEL_SHEETS = {
  a12: { label: '12面（2列×6段・86.4×42.3mm）', cols: 2, rows: 6, w: 86.4, h: 42.3, top: 21.6, left: 18.6, gapX: 0, gapY: 0 },
  a10: { label: '10面（2列×5段・86.4×50.8mm）', cols: 2, rows: 5, w: 86.4, h: 50.8, top: 21.5, left: 18.6, gapX: 0, gapY: 0 },
  a18: { label: '18面（3列×6段・70×42.3mm）', cols: 3, rows: 6, w: 70, h: 42.3, top: 21.6, left: 0, gapX: 0, gapY: 0 },
  a24: { label: '24面（3列×8段・70×33.9mm）', cols: 3, rows: 8, w: 70, h: 33.9, top: 12.9, left: 0, gapX: 0, gapY: 0 },
};
const LABEL_DEFAULT = { sheet: 'a12', custom: { ...LABEL_SHEETS.a12 }, honorific: '御中', offsetX: 0, offsetY: 0, copies: 1, start: 1 };
const MATERIALS_DEFAULT = ['5056S-H34', '5056S-H32', '5056S-O', '52S-H34', '52S-H32', '52S-H', '52S-O'];

function newDataset(kind) {
  return {
    version: DATA_VERSION, kind, createdAt: nowIso(), updatedAt: nowIso(),
    company: { ...COMPANY_PRESET },
    rules: JSON.parse(JSON.stringify(RULES_DEFAULT)),
    numbers: { delivery: 1, kari: 1, invoice: 1 },
    numbersConfirmed: false,
    materials: [...MATERIALS_DEFAULT],
    customers: [], orders: [], deliveries: [], invoices: [], payments: [], log: [],
    addressees: [],   // 宛名（仕入先など。請求はしない。封筒のラベルを印刷するためだけ）
    labelSettings: JSON.parse(JSON.stringify(LABEL_DEFAULT)),
  };
}
/** 古い形・欠けた項目を補う（登録済みのデータは消さない） */
function migrate(d) {
  const base = newDataset(d.kind || 'main');
  d.company = Object.assign({ ...base.company }, d.company || {});
  d.rules = Object.assign(JSON.parse(JSON.stringify(RULES_DEFAULT)), d.rules || {});
  d.rules.honorific = Object.assign({ ...RULES_DEFAULT.honorific }, (d.rules && d.rules.honorific) || {});
  d.numbers = Object.assign({ ...base.numbers }, d.numbers || {});
  for (const k of ['customers', 'orders', 'deliveries', 'invoices', 'payments', 'log', 'addressees']) if (!Array.isArray(d[k])) d[k] = [];
  // 第3版で足した項目：宛名（仕入先など）とラベルの設定
  d.labelSettings = Object.assign(JSON.parse(JSON.stringify(LABEL_DEFAULT)), d.labelSettings || {});
  d.labelSettings.custom = Object.assign({ ...LABEL_SHEETS.a12 }, d.labelSettings.custom || {});
  for (const a of d.addressees) { if (a.active == null) a.active = true; if (!Array.isArray(a.needsCheck)) a.needsCheck = []; if (a.honorific == null) a.honorific = ''; if (a.address2 == null) a.address2 = ''; }
  if (!Array.isArray(d.materials)) d.materials = [...MATERIALS_DEFAULT];
  for (const c of d.customers) {
    if (!Array.isArray(c.destinations)) c.destinations = []; if (c.active == null) c.active = true; if (!c.opening) c.opening = { date: '', balance: 0 };
    // 第2版で足した項目（旧システムの得意先登録に合わせる）。値がないときは「未設定」のまま
    if (c.address2 == null) c.address2 = '';
    if (c.taxRounding === undefined) c.taxRounding = null;   // null＝会社の設定に従う
    if (c.billToId === undefined) c.billToId = null;         // null＝この得意先に請求する
    if (!Array.isArray(c.needsCheck)) c.needsCheck = [];
    c.destinations.forEach(x => { if (x.code === undefined) x.code = ''; if (x.short === undefined) x.short = ''; });
  }
  for (const o of d.orders) { if (o.user === undefined) o.user = ''; if (o.qtyText === undefined) o.qtyText = ''; if (!o.priceBasis) o.priceBasis = 'kg'; }
  for (const x of d.deliveries) { if (!Array.isArray(x.lines)) x.lines = []; for (const l of x.lines) { if (!Array.isArray(l.sizes)) l.sizes = []; } }
  d.version = DATA_VERSION;
  return d;
}
function validDataset(d) {
  return d && typeof d === 'object' && Array.isArray(d.customers) && Array.isArray(d.deliveries) && Array.isArray(d.invoices);
}

/* ---------- 保存 ---------- */
const DB_NAME = 'seikyu-system', STORE = 'kv', LS_PREFIX = 'seikyu-system:';
let idbConn = null, storageKind = 'none';
function openIdb() {
  return new Promise(res => {
    try {
      if (!('indexedDB' in window)) return res(null);
      const rq = indexedDB.open(DB_NAME, 1);
      rq.onupgradeneeded = () => { try { rq.result.createObjectStore(STORE); } catch (e) { } };
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => res(null);
      rq.onblocked = () => res(null);
      setTimeout(() => res(null), 4000);
    } catch (e) { res(null); }
  });
}
async function kvGet(key) {
  if (idbConn) {
    try {
      return await new Promise((res, rej) => { const t = idbConn.transaction(STORE, 'readonly').objectStore(STORE).get(key); t.onsuccess = () => res(t.result ?? null); t.onerror = () => rej(t.error); });
    } catch (e) { /* 下の localStorage を見る */ }
  }
  try { return localStorage.getItem(LS_PREFIX + key); } catch (e) { return null; }
}
async function kvSet(key, val) {
  if (idbConn) {
    try {
      await new Promise((res, rej) => { const tx = idbConn.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(val, key); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
      return true;
    } catch (e) { /* localStorage へ */ }
  }
  try { localStorage.setItem(LS_PREFIX + key, val); return true; } catch (e) { return false; }
}

let S = null;              // 使っているデータ
let MODE = 'test';         // 'test'（テストデータ）| 'main'（本番）
let saveBlocked = false;   // 読み込みに失敗したときは保存しない
let saveTimer = null, lastSavedAt = null, saveFailed = false;
const ui = { dirty: false, navOpen: false };

function logAction(action, summary, ref) {
  S.log.push({ at: nowIso(), action, summary, ref: ref || null });
  if (S.log.length > 3000) S.log.splice(0, S.log.length - 3000);
}
function save(immediate) {
  if (saveBlocked || !S) return Promise.resolve(false);
  S.updatedAt = nowIso();
  clearTimeout(saveTimer);
  const run = async () => {
    const ok = await kvSet('data:' + MODE, JSON.stringify(S));
    saveFailed = !ok; if (ok) lastSavedAt = new Date();
    renderSaveState();
    if (ok) await dailyBackup();
    return ok;
  };
  if (immediate) return run();
  return new Promise(res => { saveTimer = setTimeout(() => run().then(res), 250); });
}
/** 端末内バックアップ（変更の前に取る）。最新の20件を残す */
async function snapshot(reason) {
  if (saveBlocked || !S) return;
  const key = 'backups:' + MODE;
  let list = [];
  try { const raw = await kvGet(key); list = raw ? JSON.parse(raw) : []; if (!Array.isArray(list)) list = []; } catch (e) { list = []; }
  list.push({ at: nowIso(), reason, data: JSON.stringify(S) });
  const keep = storageKind === 'indexeddb' ? 20 : 3;
  if (list.length > keep) list = list.slice(list.length - keep);
  const ok = await kvSet(key, JSON.stringify(list));
  if (!ok && list.length > 1) await kvSet(key, JSON.stringify(list.slice(-1)));
}
async function dailyBackup() {
  const key = 'lastDaily:' + MODE; const t = todayStr();
  try { if ((await kvGet(key)) === t) return; } catch (e) { }
  await snapshot('毎日の自動バックアップ');
  await kvSet(key, t);
}
async function listSnapshots() {
  try { const raw = await kvGet('backups:' + MODE); const l = raw ? JSON.parse(raw) : []; return Array.isArray(l) ? l : []; } catch (e) { return []; }
}

/* ---------- 参照 ---------- */
const custById = id => S.customers.find(c => c.id === id) || null;
const custName = id => custById(id)?.name || '（得意先なし）';
function destOf(d) {
  // 納品書・製作伝票の送り先。null は「得意先と同じ」
  if (!d.destId) return null;
  if (d.destId === 'free') return d.destFree && d.destFree.name ? { name: d.destFree.name, address: d.destFree.address || '' } : null;
  const c = custById(d.customerId);
  return c?.destinations.find(x => x.id === d.destId) || null;
}
const sortCustomers = list => [...list].sort((a, b) => (Number(a.code) || 0) - (Number(b.code) || 0) || String(a.name).localeCompare(String(b.name), 'ja'));

/* ---------- 重さと金額の計算 ---------- */
/** 肉厚（mm）。内径で入れたときは（外径−内径）÷2。正しくない寸法は null */
function wallT(s) {
  if (s.od == null || s.inner == null || !(s.od > 0) || !(s.inner > 0)) return null;
  const t = s.innerKind === 't' ? s.inner : (s.od - s.inner) / 2;
  return t > 0 && t <= s.od / 2 ? roundTo(t, 4) : null;
}
const innerDia = s => { const t = wallT(s); return t == null ? null : roundTo(s.od - 2 * t, 3); };
/** 1mあたりの重さ（kg）＝（外径−肉厚）×肉厚×係数（小数5桁で四捨五入） */
function kgPerM(s, rules = S.rules) { const t = wallT(s); return t == null ? null : roundTo((s.od - t) * t * rules.coef, 5); }
/** 1本の重さ（kg）。0.1kg 以上は設定の桁（2桁）で、小さい部品は小数5桁で四捨五入 */
function unitKg(s, rules = S.rules) {
  const m = kgPerM(s, rules); if (m == null || !(s.length > 0)) return null;
  const u = m * s.length / 1000;
  return u >= 0.1 ? roundTo(u, rules.unitDigits) : roundTo(u, 5);
}
function sizeKg(s, rules = S.rules) { const u = unitKg(s, rules); return u == null || s.count == null ? null : u * s.count; }
/** 明細の計算重量（kg）。寸法が1つでも足りなければ null */
function lineCalcKg(l, rules = S.rules) {
  if (l.kind !== 'pipe' || !l.sizes.length) return null;
  let t = 0; for (const s of l.sizes) { const k = sizeKg(s, rules); if (k == null) return null; t += k; }
  return roundTo(t, rules.weightDigits);
}
/** 請求に使う重量：はかった重さ（入力）があればそれ、なければ計算重量 */
const lineKg = (l, rules = S.rules) => l.kind !== 'pipe' ? null : (l.kgInput != null ? l.kgInput : lineCalcKg(l, rules));
const lineCount = l => l.kind === 'pipe' ? sum(l.sizes, s => s.count) : 0;
const lineCases = l => l.kind === 'pipe' ? sum(l.sizes, s => s.cases) : 0;
function lineAmount(l, rules = S.rules) {
  if (l.kind === 'other') return mulYen(l.qty, l.unitPrice, rules.amountRounding);
  if (l.priceBasis === 'pc') return mulYen(lineCount(l), l.unitPrice, rules.amountRounding);
  return mulYen(lineKg(l, rules), l.unitPrice, rules.amountRounding);
}
function deliveryTotals(d, rules = S.rules) {
  let amount = 0, kg = 0, count = 0, cases = 0; const missing = [];
  d.lines.forEach((l, i) => {
    const a = lineAmount(l, rules);
    if (a == null) missing.push(i + 1); else amount += a;
    if (l.kind === 'pipe') { const k = lineKg(l, rules); if (k != null) kg += k; count += lineCount(l); cases += lineCases(l); }
  });
  return { amount: missing.length ? null : amount, partial: amount, kg: roundTo(kg, 3), count, cases, missing };
}
/** 消費税。mode を渡さないときは会社の設定（得意先ごとの設定は custTaxRounding で選ぶ） */
const taxOf = (sales, rules = S.rules, mode) => roundYen(sales * rules.taxRate / 100, mode || rules.taxRounding);
const custTaxRounding = (cust, rules = S.rules) => (cust && cust.taxRounding) || rules.taxRounding;
function sizeText(s) {
  const parts = [];
  if (s.od != null) parts.push(fmtDim(s.od));
  if (s.inner != null) parts.push(s.innerKind === 't' ? `t${fmtDim(s.inner)}` : fmtDim(s.inner));
  if (s.length != null) parts.push(fmtLen(s.length));
  return parts.join('×');
}
function lineTitle(l) {
  if (l.kind === 'other') return l.name || '（品名なし）';
  return [l.material || '（材質なし）', l.sizes.map(sizeText).filter(Boolean).join(' / ')].filter(Boolean).join('　');
}

/* ---------- 製作伝票の出荷の状況 ---------- */
function orderShipped(o) {
  let count = 0, kg = 0;
  for (const d of S.deliveries) {
    if (d.status === 'cancelled') continue;
    for (const l of d.lines) if (l.orderId === o.id) { count += lineCount(l); const k = lineKg(l); if (k != null) kg += k; }
  }
  return { count, kg: roundTo(kg, 1) };
}
function orderState(o) {
  if (o.status === 'cancelled') return 'cancelled';
  if (o.status === 'done') return 'done';
  const sh = orderShipped(o);
  if (o.plannedCount != null && o.plannedCount > 0 && sh.count >= o.plannedCount) return 'shipped';
  if (sh.count > 0) return 'partial';
  return 'open';
}
const ORDER_STATE = {
  open: { label: '出荷待ち', cls: 'warn', icon: 'clock' },
  partial: { label: '一部出荷', cls: 'info', icon: 'package' },
  shipped: { label: '出荷済み', cls: 'ok', icon: 'circle-check' },
  done: { label: '完了', cls: 'ok', icon: 'circle-check' },
  cancelled: { label: '取消', cls: 'mute', icon: 'ban' },
};

/* ---------- 請求先（旧システムの「請コード」） ----------
   支店・工場などの得意先の売上を、本社などの別の得意先の請求書にまとめる。1段だけ（請求先の請求先はたどらない） */
function billToOf(custId) {
  const c = custById(custId); if (!c || !c.billToId || c.billToId === c.id) return custId;
  return custById(c.billToId) ? c.billToId : custId;
}
const billMembers = cust => new Set(S.customers.filter(c => billToOf(c.id) === cust.id).map(c => c.id).concat(cust.id));
/** 請求書を作る得意先か（締日があり、ほかの得意先にまとめていない） */
const isBillingCustomer = c => c.closingDay != null && billToOf(c.id) === c.id;

/* ---------- 請求の計算 ---------- */
const activeInvoices = cid => S.invoices.filter(v => v.customerId === cid && v.status !== 'cancelled').sort((a, b) => a.closingDate < b.closingDate ? -1 : 1);
const latestInvoice = cid => { const l = activeInvoices(cid); return l[l.length - 1] || null; };
/** 締め日に作る請求書の中身（まだ保存しない） */
function invoiceDraft(cust, closingDate) {
  const prev = latestInvoice(cust.id);
  const r = { cust, closingDate, prev, problems: [] };
  if (prev && prev.closingDate >= closingDate) { r.problems.push(`${fmtDateJ(prev.closingDate)}締めの請求書（No.${pad6(prev.no)}）がもうあります`); r.blocked = 'exists'; }
  r.prevBilled = prev ? prev.total : (Number(cust.opening?.balance) || 0);
  r.periodFrom = prev ? addDays(prev.closingDate, 1) : addDays(prevClosingDate(cust, closingDate), 1);
  r.periodTo = closingDate;
  const members = billMembers(cust); r.members = members;
  if (cust.closingDay == null) { r.problems.push('締日が決まっていません（得意先の画面で締日を入れてください）'); r.blocked = 'noclosing'; }
  if (billToOf(cust.id) !== cust.id) { r.problems.push(`請求は ${custName(billToOf(cust.id))} の請求書にまとめています`); r.blocked = 'billto'; }
  r.pays = S.payments.filter(p => p.status !== 'cancelled' && members.has(p.customerId) && !p.invoiceId && p.date <= closingDate).sort((a, b) => a.date < b.date ? -1 : 1);
  r.received = sum(r.pays, p => (p.amount || 0) + (p.fee || 0));
  r.dels = S.deliveries.filter(d => d.status !== 'cancelled' && members.has(d.customerId) && !d.invoiceId && d.date <= closingDate).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.no - b.no);
  r.missing = r.dels.filter(d => deliveryTotals(d).amount == null);
  r.older = r.dels.filter(d => d.date < r.periodFrom);
  r.sales = sum(r.dels, d => deliveryTotals(d).partial);
  r.taxRounding = custTaxRounding(cust);
  r.tax = taxOf(r.sales, S.rules, r.taxRounding);
  r.carry = r.prevBilled - r.received;
  r.total = r.carry + r.sales + r.tax;
  r.count = r.dels.length;
  r.empty = r.count === 0 && r.carry === 0 && r.pays.length === 0;
  if (r.missing.length) r.problems.push(`単価・重量が入っていない納品書が ${r.missing.length} 枚あります（No.${r.missing.map(d => pad6(d.no)).join('、No.')}）`);
  return r;
}
/** 得意先ごとの、今の未回収の額（最後の請求書の額 − その後の入金） */
function receivable(cust) {
  const inv = latestInvoice(cust.id);
  const base = inv ? inv.total : (Number(cust.opening?.balance) || 0);
  const members = billMembers(cust);
  const paid = sum(S.payments.filter(p => p.status !== 'cancelled' && members.has(p.customerId) && !p.invoiceId), p => (p.amount || 0) + (p.fee || 0));
  return { base, paid, rest: base - paid, inv };
}

/* ---------- 単価の候補（同じ得意先・材質・寸法で最後に使った単価） ---------- */
function lastPrice(customerId, material, s, excludeDeliveryId) {
  const idd = innerDia(s); if (!customerId || !material || s.od == null || idd == null) return null;
  let best = null;
  for (const d of S.deliveries) {
    if (d.status === 'cancelled' || d.customerId !== customerId || d.id === excludeDeliveryId) continue;
    for (const l of d.lines) {
      if (l.kind !== 'pipe' || l.unitPrice == null || l.material !== material || !l.sizes.length) continue;
      const s0 = l.sizes[0];
      if (s0.od === s.od && innerDia(s0) === idd && (!best || d.date > best.date)) best = { price: l.unitPrice, basis: l.priceBasis || 'kg', date: d.date, no: d.no };
    }
  }
  return best;
}
