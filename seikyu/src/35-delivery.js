/* =========================================================
   納品書：一覧・入力・詳細
   ========================================================= */
const blankSize = () => ({ od: null, innerKind: 'id', inner: null, length: null, cases: null, count: null, _raw: {} });
const blankPipe = () => ({ id: uid(), kind: 'pipe', material: '', sizes: [blankSize()], kgInput: null, unitPrice: null, priceBasis: 'kg', note1: '', note2: '', orderNo: '', orderId: null, _raw: {}, _priceAuto: false, _note1Auto: false, _note2Auto: false });
const blankOther = () => ({ id: uid(), kind: 'other', name: '', qty: null, unit: '式', unitPrice: null, note1: '', note2: '', _raw: {} });
const cloneLine = l => { const c = JSON.parse(JSON.stringify(l)); c._raw = c._raw || {}; if (c.sizes) c.sizes.forEach(s => { s._raw = s._raw || {}; }); return c; };
function cleanLine(l) {
  const c = JSON.parse(JSON.stringify(l));
  delete c._raw; delete c._priceAuto; delete c._note1Auto; delete c._note2Auto; delete c._lastHint;
  if (c.sizes) c.sizes.forEach(s => delete s._raw);
  return c;
}
function deliveryState(d) {
  if (d.status === 'cancelled') return chip('mute', 'ban', '取消');
  if (d.invoiceId) { const v = S.invoices.find(x => x.id === d.invoiceId); return chip('ok', 'lock', `請求済み${v ? ` No.${pad6(v.no)}` : ''}`); }
  const t = deliveryTotals(d);
  if (t.amount == null) return chip('warn', 'triangle-alert', '単価・重量が未入力');
  return chip('info', 'circle-dashed', '未請求');
}

/* ---------- 一覧 ---------- */
ui.dl = { month: null, cust: '', state: '', q: '' };
function monthsOf(dates) { const s = new Set(dates.filter(Boolean).map(d => d.slice(0, 7))); s.add(todayStr().slice(0, 7)); return [...s].sort().reverse(); }
const monthLabel = m => `${m.slice(0, 4)}年${Number(m.slice(5, 7))}月`;
function viewDeliveries() {
  const f = ui.dl; if (f.month == null) f.month = todayStr().slice(0, 7);
  const months = monthsOf(S.deliveries.map(d => d.date));
  let list = S.deliveries.filter(d => (!f.month || d.date.startsWith(f.month)) && (!f.cust || d.customerId === f.cust));
  if (f.state === 'open') list = list.filter(d => d.status !== 'cancelled' && !d.invoiceId);
  if (f.state === 'billed') list = list.filter(d => d.status !== 'cancelled' && d.invoiceId);
  if (f.state === 'cancelled') list = list.filter(d => d.status === 'cancelled');
  if (f.state === 'missing') list = list.filter(d => d.status !== 'cancelled' && deliveryTotals(d).amount == null);
  if (f.q) { const q = toHalf(f.q).toLowerCase(); list = list.filter(d => [pad6(d.no), custName(d.customerId), destOf(d)?.name, d.memo, ...d.lines.map(l => `${lineTitle(l)} ${l.note1} ${l.note2}`)].join(' ').toLowerCase().includes(q)); }
  list.sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : b.no - a.no);
  const live = list.filter(d => d.status !== 'cancelled');
  const tAmt = sum(live, d => deliveryTotals(d).partial), tKg = sum(live, d => deliveryTotals(d).kg);
  return `
  <div class="page-head"><div><h1>納品書</h1><p class="lead">出荷した品物の納品書を入力・印刷します。請求書はここに登録した納品書から作ります。</p></div>
    <div class="actions"><a class="btn primary" href="#delivery-new">${icon('plus')}納品書を入力する</a></div></div>
  <div class="card stack">
    <div class="form-grid">
      ${fld('dlMonth', '納品した月', sel('dlMonth', [['', 'すべての月'], ...months.map(m => [m, monthLabel(m)])], f.month))}
      ${fld('dlCust', '得意先', custSelect('dlCust', f.cust, { all: true, includeInactive: true }))}
      ${fld('dlState', '状態', sel('dlState', [['', 'すべて'], ['open', '未請求'], ['missing', '単価・重量が未入力'], ['billed', '請求済み'], ['cancelled', '取消']], f.state))}
      ${fld('dlQ', '探す（No・品名・摘要）', txt('dlQ', f.q))}
    </div>
    ${list.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>納品日</th><th>No.</th><th>得意先・送り先</th><th>品名</th><th class="num">重量（kg）</th><th class="num">金額（税抜・円）</th><th>状態</th></tr></thead><tbody>
      ${list.map(d => { const t = deliveryTotals(d); const ds = destOf(d); return `<tr class="clickable${d.status === 'cancelled' ? ' is-cancel' : ''}" data-href="#delivery-${d.id}">
        <td class="nowrap">${fmtDate(d.date)}</td><td class="tnum"><a href="#delivery-${d.id}">${pad6(d.no)}</a></td>
        <td>${esc(custName(d.customerId))}${ds ? `<span class="sub">送り先：${esc(ds.name)}</span>` : ''}</td>
        <td>${esc(d.lines[0] ? lineTitle(d.lines[0]) : '')}${d.lines.length > 1 ? `<span class="sub">ほか ${d.lines.length - 1} 行</span>` : ''}</td>
        <td class="num strike">${fmtKg(t.kg)}</td><td class="num strike">${t.amount == null ? `${yen(t.partial)}<span class="sub">未入力あり</span>` : yen(t.amount)}</td><td>${deliveryState(d)}</td></tr>`; }).join('')}
      </tbody><tfoot><tr><td colspan="4">合計（取消を除く ${live.length} 枚）</td><td class="num">${fmtKg(roundTo(tKg, 1))}</td><td class="num">${yen(tAmt)}</td><td></td></tr></tfoot></table></div>`
      : `<div class="empty">${icon('truck')}<p>条件に合う納品書はありません。</p><a class="btn" href="#delivery-new">${icon('plus')}納品書を入力する</a></div>`}
    <div class="actions"><button type="button" class="btn sm" data-act="dlCsv">${icon('file-spreadsheet')}この一覧の明細をCSVで書き出す</button></div>
  </div>`;
}
function bindDeliveries() {
  const re = () => render();
  $('#dlMonth').onchange = e => { ui.dl.month = e.target.value; re(); };
  $('#dlCust').onchange = e => { ui.dl.cust = e.target.value; re(); };
  $('#dlState').onchange = e => { ui.dl.state = e.target.value; re(); };
  $('#dlQ').onchange = e => { ui.dl.q = e.target.value; re(); };
}
function exportDeliveriesCsv() {
  const f = ui.dl;
  const list = S.deliveries.filter(d => (!f.month || d.date.startsWith(f.month)) && (!f.cust || d.customerId === f.cust)).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.no - b.no);
  const rows = [['納品日', '納品書No', '得意先コード', '得意先', '送り先', '状態', '行', '品名', '寸法', 'ケース', '本数', '計算重量kg', '重量kg', '単価', '単価の単位', '金額（税抜）', '摘要1', '摘要2', '請求書No']];
  for (const d of list) {
    const c = custById(d.customerId); const inv = d.invoiceId ? S.invoices.find(v => v.id === d.invoiceId) : null;
    d.lines.forEach((l, i) => rows.push([d.date, pad6(d.no), c?.code ?? '', c?.name ?? '', destOf(d)?.name ?? '', d.status === 'cancelled' ? '取消' : d.invoiceId ? '請求済み' : '未請求', i + 1,
      l.kind === 'other' ? l.name : l.material, l.kind === 'other' ? '' : l.sizes.map(sizeText).join(' / '), l.kind === 'other' ? '' : lineCases(l), l.kind === 'other' ? l.qty : lineCount(l),
      l.kind === 'other' ? '' : lineCalcKg(l) ?? '', l.kind === 'other' ? '' : lineKg(l) ?? '', l.unitPrice ?? '', l.kind === 'other' ? (l.unit || '') : (l.priceBasis === 'pc' ? '円/本' : '円/kg'), lineAmount(l) ?? '', l.note1 || '', l.note2 || '', inv ? pad6(inv.no) : '']));
  }
  return saveFile(`納品明細_${f.month || '全期間'}_${stampName()}.csv`, new Blob(['﻿' + toCsv(rows)], { type: 'text/csv' }));
}

/* ---------- 入力 ---------- */
function viewDeliveryForm(id) {
  let src = id ? S.deliveries.find(d => d.id === id) : null;
  if (id && !src) return notFound('納品書');
  if (src && src.status === 'cancelled') return `${backLink('#deliveries', '納品書の一覧')}${notice('warn', '取り消した納品書は直せません。')}`;
  if (src && src.invoiceId) { const v = S.invoices.find(x => x.id === src.invoiceId); return `${backLink('#delivery-' + src.id, '納品書')}${notice('warn', `この納品書は請求書 No.${pad6(v?.no)} に入っているため、直せません。直すには、先に<a href="#invoice-${v?.id}">請求書</a>を取り消してください。`)}`; }
  // 入力中の内容（画面を描き直しても残す）
  if (!ui.df || ui.df.srcId !== (id || null) || ui.df.fresh) {
    const base = src ? { date: src.date, customerId: src.customerId, destId: src.destId || '', destFree: src.destFree ? { ...src.destFree } : { name: '', address: '' }, memo: src.memo || '', lines: src.lines.map(cloneLine) }
      : { date: todayStr(), customerId: '', destId: '', destFree: { name: '', address: '' }, memo: '', lines: [blankPipe()] };
    if (ui.copyFrom) { const c = S.deliveries.find(d => d.id === ui.copyFrom); if (c) { Object.assign(base, { customerId: c.customerId, destId: c.destId || '', destFree: c.destFree ? { ...c.destFree } : { name: '', address: '' }, lines: c.lines.map(l => { const x = cloneLine(l); x.id = uid(); x.orderId = null; x.kgInput = null; return x; }) }); } ui.copyFrom = null; }
    ui.df = { srcId: id || null, ...base };
    if (ui.pendingOrders) { addOrderLines(ui.pendingOrders); ui.pendingOrders = null; }
  }
  const f = ui.df; const cust = custById(f.customerId);
  return `
  ${backLink(src ? '#delivery-' + src.id : '#deliveries', src ? '納品書' : '納品書の一覧')}
  <div class="page-head"><div><h1>${src ? `納品書を直す（No.${pad6(src.no)}）` : '納品書を入力する'}</h1>
    <p class="lead">事務コンの「自社納品書発行」と同じ順に入れます：日付・得意先コード → 商品名・寸法・本数 → 重量・単価。製作伝票を登録していれば「製作伝票から入れる」で呼び出せます（仮納品書も同じ伝票から印刷するので、入れ直しはいりません）。</p></div>
    <div class="actions">${!src ? `<button type="button" class="btn" data-act="pickOrders">${icon('clipboard-list')}製作伝票から入れる</button>` : ''}</div></div>
  <form id="dForm" class="stack" novalidate>
    <div class="card">
      <div class="form-grid">
        ${fld('dDate', '納品日', dateIn('dDate', f.date), { req: true })}
        ${fld('dCust', '得意先（コードを入れて Enter でも選べます）', custPicker('dCust', f.customerId), { req: true, cls: 'wide', hint: cust ? `締日：${cust.closingDay == null ? '未設定' : closingLabel(cust.closingDay)}${billToOf(cust.id) !== cust.id ? `・請求は ${esc(custName(billToOf(cust.id)))} にまとめます` : ''}` : '' })}
        ${fld('dDest', '送り先', destSelect('dDest', cust, f.destId), { opt: true, hint: '得意先と違う場所へ届けるとき。仮納品書は金額なしになります。' })}
        <div class="field"><span class="label">納品書No.</span><div class="calc-out"><span class="v" id="dNo">${pad6(src ? src.no : S.numbers.delivery)}</span>${src ? '' : '<span class="small muted">登録したときに決まります</span>'}</div></div>
        <div class="wide form-grid" id="destFreeBox" ${f.destId === 'free' ? '' : 'hidden'}>
          ${fld('dDestName', 'ほかの送り先の名前', txt('dDestName', f.destFree.name), { req: true, hint: '登録すると、この得意先の送り先に加わり、次から選べます。' })}
          ${fld('dDestAddr', 'ほかの送り先の住所', txt('dDestAddr', f.destFree.address), { opt: true })}
        </div>
        ${fld('dMemo', 'メモ', txt('dMemo', f.memo), { opt: true, hint: '社内用。帳票には出ません。', cls: 'wide' })}
      </div>
    </div>
    <datalist id="matList">${[...new Set([...S.materials, ...S.deliveries.flatMap(d => d.lines.map(l => l.material)).filter(Boolean)])].map(m => `<option value="${esc(m)}">`).join('')}</datalist>
    <div class="lines" id="lines">${f.lines.map((l, i) => lineCardHtml(l, i)).join('')}</div>
    <div class="actions"><button type="button" class="btn" data-act="addPipe">${icon('list-plus')}品物の行を足す</button><button type="button" class="btn" data-act="copyPrev">${icon('copy')}前の行をコピーして足す（前品名コピー）</button><button type="button" class="btn" data-act="addOther">${icon('plus')}運賃・加工賃などの行を足す</button></div>
    <div class="totals" id="dTotals">${totalsHtml()}</div>
    <div class="sticky-foot"><a class="btn text" href="${src ? '#delivery-' + src.id : '#deliveries'}" data-act="cancelForm">やめる</a>
      <button type="submit" class="btn primary">${icon('save')}${src ? '直した内容を登録する' : '納品書を登録する'}</button></div>
  </form>`;
}
function lineCardHtml(l, i) {
  const n = i + 1;
  const head = `<div class="line-top"><span class="line-no">${icon(l.kind === 'pipe' ? 'package' : 'receipt-text')}${n} 行目${l.orderId ? (() => { const o = S.orders.find(x => x.id === l.orderId); return o ? `　${chip('info', 'clipboard-list', `製作伝票 ${o.no || ''}${o.orderNo ? ` 注文No.${o.orderNo}` : ''}`)}` : ''; })() : ''}</span>
    <button type="button" class="btn text sm" data-act="removeLine" data-l="${i}">${icon('x')}この行を外す</button></div>`;
  if (l.kind === 'other') {
    return `<div class="line-card is-other" data-line="${i}">${head}
      <div class="line-grid">
        ${fld(`l${i}-name`, '品名', `<input type="text" id="l${i}-name" data-l="${i}" data-f="name" value="${esc(l.name)}">`, { req: true, cls: 'mat', hint: '例：運賃、加工賃、値引き（値引きは単価をマイナスで）' })}
        ${fld(`l${i}-qty`, '数量', `<input type="text" inputmode="decimal" class="numin" id="l${i}-qty" data-l="${i}" data-f="qty" value="${esc(l._raw.qty ?? numStr(l.qty))}">`, { req: true })}
        ${fld(`l${i}-unit`, '単位', `<input type="text" id="l${i}-unit" data-l="${i}" data-f="unit" value="${esc(l.unit)}">`, { opt: true })}
        ${fld(`l${i}-price`, '単価（円）', `<input type="text" inputmode="decimal" class="numin" id="l${i}-price" data-l="${i}" data-f="unitPrice" value="${esc(l._raw.unitPrice ?? numStr(l.unitPrice))}">`, { req: true })}
        <div class="field"><span class="label">金額（円）</span><div class="calc-out"><span class="v" id="l${i}-amt">${yen(lineAmount(l))}</span></div></div>
      </div>
      <div class="form-grid">
        ${fld(`l${i}-n1`, '摘要', `<input type="text" id="l${i}-n1" data-l="${i}" data-f="note1" value="${esc(l.note1)}">`, { opt: true })}
        ${fld(`l${i}-n2`, '摘要2', `<input type="text" id="l${i}-n2" data-l="${i}" data-f="note2" value="${esc(l.note2)}">`, { opt: true })}
      </div></div>`;
  }
  const calc = lineCalcKg(l);
  return `<div class="line-card" data-line="${i}">${head}
    <div class="line-grid">
      ${fld(`l${i}-mat`, '品名（材質）', `<input type="text" id="l${i}-mat" list="matList" data-l="${i}" data-f="material" value="${esc(l.material)}">`, { req: true, cls: 'mat' })}
      <div class="field"><span class="label">計算重量（kg）</span><div class="calc-out"><span class="v" id="l${i}-calc">${fmtKg(calc)}</span><span class="small muted">寸法×本数から</span></div></div>
      ${fld(`l${i}-kg`, '重量（kg）', `<input type="text" inputmode="decimal" class="numin" id="l${i}-kg" data-l="${i}" data-f="kgInput" value="${esc(l._raw.kgInput ?? numStr(l.kgInput))}">`, { opt: true, hint: '空なら計算重量を使います' })}
      ${fld(`l${i}-price`, `単価（${l.priceBasis === 'pc' ? '円/本' : '円/kg'}）`, `<input type="text" inputmode="decimal" class="numin" id="l${i}-price" data-l="${i}" data-f="unitPrice" value="${esc(l._raw.unitPrice ?? numStr(l.unitPrice))}">`, { opt: true, hint: `<span id="l${i}-phint">${l._lastHint ? esc(l._lastHint) : '空のままでも登録できます'}</span>` })}
      <div class="field"><span class="label">金額（円）</span><div class="calc-out"><span class="v" id="l${i}-amt">${yen(lineAmount(l))}</span><span class="small muted" id="l${i}-kgsrc">${kgSourceText(l)}</span></div></div>
    </div>
    <div class="tbl-wrap"><table class="size-tbl"><thead><tr><th>外径</th><th>内径か肉厚か</th><th>内径・肉厚</th><th>長さ</th><th>ケース（束）</th><th>本数</th><th class="num">1本の重さ</th><th></th></tr></thead><tbody>
      ${l.sizes.map((s, j) => sizeRowHtml(l, s, i, j)).join('')}
    </tbody></table></div>
    <div class="actions">
      <button type="button" class="btn sm" data-act="addSize" data-l="${i}">${icon('plus')}寸法を足す（同じ束に長さ違いがあるとき）</button>
      <span class="small muted">単価の単位：</span><div class="seg" role="group" aria-label="単価の単位"><button type="button" data-act="basis" data-l="${i}" data-v="kg" aria-pressed="${l.priceBasis !== 'pc'}">円/kg</button><button type="button" data-act="basis" data-l="${i}" data-v="pc" aria-pressed="${l.priceBasis === 'pc'}">円/本</button></div>
    </div>
    <div class="form-grid">
      ${fld(`l${i}-ono`, '注文番号', `<input type="text" id="l${i}-ono" data-l="${i}" data-f="orderNo" value="${esc(l.orderNo || '')}">`, { opt: true, hint: '得意先の注文番号（仮納品書に出ます）' })}
      ${fld(`l${i}-n1`, '摘要', `<input type="text" id="l${i}-n1" data-l="${i}" data-f="note1" value="${esc(l.note1)}">`, { opt: true, hint: '事務コンと同じ形：ユーザー・製作伝票の日付・受注量（例：見本台 10/27 5M）' })}
      ${fld(`l${i}-n2`, '摘要2', `<input type="text" id="l${i}-n2" data-l="${i}" data-f="note2" value="${esc(l.note2)}">`, { opt: true, hint: '事務コンと同じ形：製作伝票No.と送り先か出荷日（例：30110001 11/5出）' })}
    </div></div>`;
}
function sizeRowHtml(l, s, i, j) {
  const u = unitKg(s);
  const inp = (f, v, extra = '') => `<input type="text" inputmode="decimal" class="numin" id="s${i}-${j}-${f}" data-l="${i}" data-s="${j}" data-f="${f}" value="${esc(s._raw[f] ?? numStr(v))}" aria-label="${{ od: '外径', inner: '内径・肉厚', length: '長さ', cases: 'ケース', count: '本数' }[f]}（${i + 1}行目 ${j + 1}つ目）" ${extra}>`;
  return `<tr data-size="${j}"><td>${inp('od', s.od)}</td>
    <td><div class="seg" role="group" aria-label="内径か肉厚か"><button type="button" data-act="innerKind" data-l="${i}" data-s="${j}" data-v="id" aria-pressed="${s.innerKind !== 't'}">内径</button><button type="button" data-act="innerKind" data-l="${i}" data-s="${j}" data-v="t" aria-pressed="${s.innerKind === 't'}">肉厚</button></div></td>
    <td>${inp('inner', s.inner)}</td><td>${inp('length', s.length)}</td><td>${inp('cases', s.cases)}</td><td>${inp('count', s.count)}</td>
    <td class="out" id="s${i}-${j}-u">${u == null ? '—' : `${fmtN(u, 0, 5)} kg`}</td>
    <td>${l.sizes.length > 1 ? `<button type="button" class="btn text sm" data-act="removeSize" data-l="${i}" data-s="${j}" aria-label="この寸法を外す">${icon('x')}外す</button>` : ''}</td></tr>`;
}
function kgSourceText(l) {
  if (l.kind !== 'pipe') return '';
  if (l.kgInput != null && !Number.isNaN(l.kgInput)) return 'はかった重さで計算';
  return lineCalcKg(l) != null ? '計算重量で計算' : '重量を入れてください';
}
function totalsHtml() {
  const t = deliveryTotals({ lines: ui.df.lines.map(l => sanitizeForCalc(l)) });
  return `<div class="t"><span>ケース</span><b>${fmtN(t.cases)}</b></div><div class="t"><span>本数</span><b>${fmtN(t.count)}</b></div><div class="t"><span>重量計（kg）</span><b>${fmtKg(roundTo(t.kg, 1))}</b></div>
    <div class="t"><span>合計金額（税抜）</span><b>${t.amount == null ? `${yen(t.partial)}<span class="small muted">（未入力の行あり）</span>` : `¥${yen(t.amount)}`}</b></div>`;
}
/** 計算に使う形（読めない数は null として扱う） */
function sanitizeForCalc(l) {
  const fix = v => (v == null || Number.isNaN(v)) ? null : v;
  if (l.kind === 'other') return { ...l, qty: fix(l.qty), unitPrice: fix(l.unitPrice) };
  return { ...l, kgInput: fix(l.kgInput), unitPrice: fix(l.unitPrice), sizes: l.sizes.map(s => ({ ...s, od: fix(s.od), inner: fix(s.inner), length: fix(s.length), cases: fix(s.cases), count: fix(s.count) })) };
}
function refreshLine(i) {
  const l = ui.df.lines[i]; if (!l) return;
  const c = sanitizeForCalc(l);
  const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  if (l.kind === 'pipe') {
    set(`l${i}-calc`, fmtKg(lineCalcKg(c)));
    c.sizes.forEach((s, j) => { const u = unitKg(s); set(`s${i}-${j}-u`, u == null ? '—' : `${fmtN(u, 0, 5)} kg`); });
    set(`l${i}-kgsrc`, kgSourceText(c));
  }
  set(`l${i}-amt`, yen(lineAmount(c)));
  const tot = $('#dTotals'); if (tot) tot.innerHTML = totalsHtml();
}
/** 単価の候補（同じ得意先・材質・寸法で最後に使った単価）を入れる */
function suggestPrice(i) {
  const f = ui.df, l = f.lines[i]; if (!l || l.kind !== 'pipe') return;
  if (l.unitPrice != null && !l._priceAuto) return;
  const s = sanitizeForCalc(l).sizes[0]; if (!s) return;
  const lp = lastPrice(f.customerId, l.material, s, f.srcId);
  const hint = document.getElementById(`l${i}-phint`);
  const inp = document.getElementById(`l${i}-price`);
  if (lp) {
    l.unitPrice = lp.price; l._priceAuto = true; l._raw.unitPrice = undefined; if (lp.basis) l.priceBasis = lp.basis;
    l._lastHint = `前回の単価（${fmtDate(lp.date)} No.${pad6(lp.no)}）を入れました`;
    if (inp) inp.value = numStr(lp.price);
    if (hint) hint.textContent = l._lastHint;
  } else if (l._priceAuto) {
    // 寸法や得意先が変わって、前回の単価が当てはまらなくなった
    l.unitPrice = null; l._priceAuto = false; l._lastHint = '';
    if (inp) inp.value = ''; if (hint) hint.textContent = '空のままでも登録できます';
  }
  refreshLine(i);
}
/** 摘要（事務コンの書き方）：摘要1＝ユーザー 製作伝票の日付 受注量、摘要2＝製作伝票No. と「送り先の略称＋入」か「出荷日＋出」 */
function autoNote1(o) { return [o.user, fmtMD(o.date), o.qtyText].filter(Boolean).join(' '); }
function autoNote2(o, shipDate, dest) { return [o.no, dest ? `${destShort(dest)}入` : `${fmtMD(shipDate)}出`].filter(Boolean).join(' '); }
/** 入力中の納品書の送り先（ほかの送り先を入れているときはその名前） */
function draftDest(f) { if (!f.destId) return null; if (f.destId === 'free') return f.destFree.name ? { name: f.destFree.name } : null; const c = custById(f.customerId); return c?.destinations.find(x => x.id === f.destId) || null; }
/** 送り先・納品日が変わったら、自動で入れた摘要2を入れ直す */
function refreshAutoNotes() {
  const f = ui.df; if (!f) return;
  f.lines.forEach((l, i) => { if (!l._note2Auto || !l.orderId) return; const o = S.orders.find(x => x.id === l.orderId); if (!o) return; l.note2 = autoNote2(o, f.date, draftDest(f)); const e2 = document.getElementById(`l${i}-n2`); if (e2) e2.value = l.note2; });
}
function addOrderLines(ids) {
  const f = ui.df;
  const orders = ids.map(id => S.orders.find(o => o.id === id)).filter(Boolean);
  if (!orders.length) return;
  if (!f.customerId) f.customerId = orders[0].customerId;
  if (!f.destId && orders[0].destId) f.destId = orders[0].destId;
  // 空の1行目は置きかえる
  if (f.lines.length === 1 && f.lines[0].kind === 'pipe' && !f.lines[0].material && f.lines[0].sizes.every(s => s.od == null && s.count == null)) f.lines = [];
  for (const o of orders) {
    const sh = orderShipped(o);
    const rest = o.plannedCount != null ? Math.max(o.plannedCount - sh.count, 0) : null;
    const l = blankPipe();
    l.orderId = o.id; l.material = o.material || '';
    l.sizes = [{ od: o.od, innerKind: o.innerKind || 'id', inner: o.inner, length: o.length, cases: null, count: rest || null, _raw: {} }];
    l.orderNo = o.orderNo || '';
    if (o.unitPrice != null) { l.unitPrice = o.unitPrice; l.priceBasis = o.priceBasis || 'kg'; l._lastHint = '製作伝票の単価を入れました'; }
    else { const lp = lastPrice(o.customerId, o.material, l.sizes[0], f.srcId); if (lp) { l.unitPrice = lp.price; l.priceBasis = lp.basis || 'kg'; l._priceAuto = true; l._lastHint = `前回の単価（${fmtDate(lp.date)}）を入れました`; } }
    l.note1 = autoNote1(o); l._note1Auto = true; l.note2 = autoNote2(o, f.date, draftDest(f)); l._note2Auto = true;
    f.lines.push(l);
  }
}
function openOrderPicker() {
  const f = ui.df;
  const list = S.orders.filter(o => ['open', 'partial'].includes(orderState(o)) && (!f.customerId || o.customerId === f.customerId))
    .sort((a, b) => (a.dueDate || '9999') < (b.dueDate || '9999') ? -1 : 1);
  const body = list.length ? `<p>${f.customerId ? `${esc(custName(f.customerId))} の` : ''}出荷待ち・一部出荷の製作伝票です。今回出荷するものを選んでください。</p>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th class="check-cell">選ぶ</th><th>製作伝票No.</th><th>得意先</th><th>品名・寸法</th><th class="num">受注</th><th class="num">出荷済み</th><th>納期</th></tr></thead><tbody>
    ${list.map(o => { const sh = orderShipped(o); return `<tr><td class="check-cell"><label class="check"><input type="checkbox" value="${o.id}" aria-label="製作伝票 ${esc(o.no)} を選ぶ"></label></td><td>${esc(o.no || '—')}${o.orderNo ? `<span class="sub">注文No.${esc(o.orderNo)}</span>` : ''}</td><td>${esc(custName(o.customerId))}</td><td>${esc(o.material)}<span class="sub">${esc(sizeText(o))}</span></td><td class="num">${o.plannedCount == null ? '—' : `${fmtN(o.plannedCount)}本`}</td><td class="num">${fmtN(sh.count)}本</td><td class="nowrap">${o.dueDate ? fmtDate(o.dueDate) : '—'}</td></tr>`; }).join('')}
    </tbody></table></div>` : `<div class="empty">${icon('clipboard-list')}<p>${f.customerId ? 'この得意先の' : ''}出荷待ちの製作伝票はありません。</p><a class="btn" href="#order-new">製作伝票を登録する</a></div>`;
  openDialog({
    title: '製作伝票から入れる', wide: true, body,
    buttons: list.length ? [{ label: 'やめる', cls: 'text' }, {
      label: '選んだ製作伝票を入れる', cls: 'primary', icon: 'check', fn: d => {
        const ids = $$('input[type=checkbox]:checked', d).map(x => x.value);
        if (!ids.length) { showErrors(d, [{ el: $('input[type=checkbox]', d), msg: '製作伝票を1つ以上選んでください' }]); return false; }
        const custs = new Set(ids.map(id => S.orders.find(o => o.id === id).customerId));
        if (custs.size > 1 || (f.customerId && !custs.has(f.customerId))) { showErrors(d, [{ el: $('input[type=checkbox]:checked', d), msg: '1枚の納品書には、同じ得意先の製作伝票だけを入れられます' }]); return false; }
        addOrderLines(ids); ui.dirty = true; render(); toast(`製作伝票 ${ids.length} 件を入れました`);
      },
    }] : [],
  });
}
function bindDeliveryForm() {
  const form = $('#dForm'); if (!form) return;
  const f = ui.df;
  form.addEventListener('input', e => {
    const t = e.target; ui.dirty = true;
    if (t.id === 'dDate') { const old = f.date; f.date = t.value; if (old !== f.date) refreshAutoNotes(); return; }
    if (t.id === 'dCustCode') return;
    if (t.id === 'dMemo') { f.memo = t.value; return; }
    if (t.id === 'dDestName') { f.destFree.name = t.value; refreshAutoNotes(); return; }
    if (t.id === 'dDestAddr') { f.destFree.address = t.value; return; }
    const li = t.dataset.l; if (li == null) return;
    const l = f.lines[+li]; const fieldName = t.dataset.f;
    if (t.dataset.s != null) {
      const s = l.sizes[+t.dataset.s]; const v = parseNum(t.value); s[fieldName] = v; s._raw[fieldName] = Number.isNaN(v) ? t.value : undefined;
    } else if (['kgInput', 'unitPrice', 'qty'].includes(fieldName)) {
      const v = parseNum(t.value); l[fieldName] = v; l._raw[fieldName] = Number.isNaN(v) ? t.value : undefined;
      if (fieldName === 'unitPrice') { l._priceAuto = false; l._lastHint = ''; const h = document.getElementById(`l${li}-phint`); if (h) h.textContent = ''; }
    } else {
      l[fieldName] = t.value;
      if (fieldName === 'note1') l._note1Auto = false;
      if (fieldName === 'note2') l._note2Auto = false;
    }
    refreshLine(+li);
  });
  form.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'dCust') { f.customerId = t.value; f.destId = ''; ui.dirty = true; render(); f.lines.forEach((l, i) => suggestPrice(i)); return; }
    if (t.id === 'dDest') { f.destId = t.value; ui.dirty = true; $('#destFreeBox').hidden = f.destId !== 'free'; refreshAutoNotes(); return; }
    const li = t.dataset.l; if (li == null) return;
    if (['material', 'od', 'inner', 'length'].includes(t.dataset.f)) suggestPrice(+li);
  });
  form.addEventListener('submit', e => { e.preventDefault(); submitDelivery(form); });
  bindCustPicker('dCust');
}
function deliveryAction(act, el) {
  const f = ui.df; const i = el.dataset.l != null ? +el.dataset.l : null; const j = el.dataset.s != null ? +el.dataset.s : null;
  ui.dirty = true;
  if (act === 'addPipe') { f.lines.push(blankPipe()); render(); focusLater(`#l${f.lines.length - 1}-mat`); }
  if (act === 'addOther') { f.lines.push(blankOther()); render(); focusLater(`#l${f.lines.length - 1}-name`); }
  if (act === 'copyPrev') {
    // 前品名コピー：いちばん下の品物の行の、品名・寸法・単価・摘要を写す（本数・ケース・重量・製作伝票とのつながりは写さない）
    const prev = [...f.lines].reverse().find(l => l.kind === 'pipe');
    if (!prev) { f.lines.push(blankPipe()); render(); focusLater(`#l${f.lines.length - 1}-mat`); return; }
    const l = blankPipe();
    Object.assign(l, { material: prev.material, priceBasis: prev.priceBasis, unitPrice: prev.unitPrice, note1: prev.note1, note2: prev.note2, orderNo: prev.orderNo || '' });
    l.sizes = prev.sizes.map(s => ({ ...blankSize(), od: s.od, innerKind: s.innerKind, inner: s.inner, length: s.length }));
    f.lines.push(l); render(); focusLater(`#s${f.lines.length - 1}-0-count`);
  }
  if (act === 'removeLine') { f.lines.splice(i, 1); if (!f.lines.length) f.lines.push(blankPipe()); render(); }
  if (act === 'addSize') { const prev = f.lines[i].sizes[f.lines[i].sizes.length - 1]; f.lines[i].sizes.push({ ...blankSize(), od: prev.od, innerKind: prev.innerKind, inner: prev.inner, cases: 0 }); render(); focusLater(`#s${i}-${f.lines[i].sizes.length - 1}-length`); }
  if (act === 'removeSize') { f.lines[i].sizes.splice(j, 1); render(); }
  if (act === 'innerKind') { const s = f.lines[i].sizes[j]; if (s.innerKind !== el.dataset.v) { s.innerKind = el.dataset.v; s.inner = null; s._raw.inner = undefined; } render(); focusLater(`#s${i}-${j}-inner`); }
  if (act === 'basis') { f.lines[i].priceBasis = el.dataset.v; render(); }
  if (act === 'pickOrders') openOrderPicker();
}
function focusLater(sel2) { setTimeout(() => { const e = $(sel2); if (e) { e.focus(); e.scrollIntoView({ block: 'center', behavior: REDUCED ? 'auto' : 'smooth' }); } }, 30); }
function submitDelivery(form) {
  const f = ui.df; const errs = [];
  const E = (sel2, msg) => errs.push({ el: $(sel2, form), msg });
  if (!f.date || !parseYmd(f.date)) E('#dDate', '納品日を入れてください');
  if (!f.customerId) E('#dCust', '得意先を選んでください');
  if (f.destId === 'free' && !f.destFree.name.trim()) E('#dDestName', '送り先の名前を入れてください');
  if (!f.lines.length) E('[data-act=addPipe]', '品物の行を1つ以上入れてください');
  f.lines.forEach((l, i) => {
    const bad = (v, sel2, label, { int = false, min0 = false, allowNeg = false } = {}) => {
      if (Number.isNaN(v)) { E(sel2, `${label}は数字で入れてください`); return true; }
      if (v != null && int && !Number.isInteger(v)) { E(sel2, `${label}は整数で入れてください`); return true; }
      if (v != null && !allowNeg && (min0 ? v < 0 : v <= 0)) { E(sel2, `${label}は0より大きい数を入れてください`); return true; }
      return false;
    };
    if (l.kind === 'other') {
      if (!l.name.trim()) E(`#l${i}-name`, '品名を入れてください');
      if (l.qty == null) E(`#l${i}-qty`, '数量を入れてください'); else bad(l.qty, `#l${i}-qty`, '数量', { allowNeg: true });
      if (l.unitPrice == null) E(`#l${i}-price`, '単価を入れてください（値引きはマイナス）'); else bad(l.unitPrice, `#l${i}-price`, '単価', { allowNeg: true });
      return;
    }
    if (!l.material.trim()) E(`#l${i}-mat`, '品名（材質）を入れてください');
    l.sizes.forEach((s, j) => {
      const p = `#s${i}-${j}-`;
      if (s.od == null) E(p + 'od', '外径を入れてください'); else bad(s.od, p + 'od', '外径');
      if (s.inner == null) E(p + 'inner', s.innerKind === 't' ? '肉厚を入れてください' : '内径を入れてください');
      else if (!bad(s.inner, p + 'inner', s.innerKind === 't' ? '肉厚' : '内径') && s.od > 0 && wallT(s) == null) E(p + 'inner', s.innerKind === 't' ? '肉厚が外径の半分より大きくなっています' : '内径が外径以上になっています');
      if (s.length == null) E(p + 'length', '長さを入れてください'); else bad(s.length, p + 'length', '長さ');
      bad(s.cases, p + 'cases', 'ケース', { int: true, min0: true });
      if (s.count == null) E(p + 'count', '本数を入れてください'); else bad(s.count, p + 'count', '本数', { int: true });
    });
    if (l.kgInput != null) bad(l.kgInput, `#l${i}-kg`, '重量');
    if (l.unitPrice != null) bad(l.unitPrice, `#l${i}-price`, '単価');
  });
  if (!showErrors(form, errs)) return;
  const isNew = !f.srcId;
  const cust = custById(f.customerId);
  let destId = f.destId || null, destFree = null;
  if (destId === 'free') {
    const name = f.destFree.name.trim();
    let ex = cust.destinations.find(x => x.name === name);
    if (!ex) { ex = { id: uid(), name, zip: '', address: f.destFree.address.trim(), tel: '', active: true }; cust.destinations.push(ex); logAction('送り先を追加', `${cust.name} に送り先「${name}」を追加`, cust.id); }
    destId = ex.id;
  }
  const lines = f.lines.map(cleanLine);
  let d;
  if (isNew) {
    d = { id: uid(), no: S.numbers.delivery, date: f.date, customerId: f.customerId, destId, destFree, lines, memo: f.memo.trim(), status: 'issued', invoiceId: null, kariNo: null, createdAt: nowIso(), updatedAt: nowIso(), printedAt: null };
    if (S.deliveries.some(x => x.no === d.no)) { showProblem(form, `納品書No.${pad6(d.no)} はもう使われています。「設定・データ」で次の番号を確かめてください。`); return; }
    S.numbers.delivery += 1; S.deliveries.push(d);
    const t = deliveryTotals(d);
    logAction('納品書を登録', `No.${pad6(d.no)} ${cust.name} ${fmtDate(d.date)} ${t.amount == null ? '（単価・重量が未入力の行あり）' : `${yen(t.amount)}円`}`, d.id);
  } else {
    d = S.deliveries.find(x => x.id === f.srcId);
    const before = deliveryTotals(d);
    Object.assign(d, { date: f.date, customerId: f.customerId, destId, destFree, lines, memo: f.memo.trim(), updatedAt: nowIso() });
    const after = deliveryTotals(d);
    logAction('納品書を直す', `No.${pad6(d.no)} ${cust.name}：金額 ${yen(before.amount)} → ${yen(after.amount)}、重量 ${fmtKg(before.kg)} → ${fmtKg(after.kg)}`, d.id);
  }
  ui.dirty = false; ui.df = null;
  save(true).then(ok => { if (!ok) toast('保存できませんでした。「設定・データ」でバックアップを書き出してください', 'circle-alert'); });
  toast(isNew ? `納品書 No.${pad6(d.no)} を登録しました` : `納品書 No.${pad6(d.no)} を直しました`);
  go('#delivery-' + d.id);
}

/* ---------- 詳細 ---------- */
function viewDeliveryDetail(id) {
  const d = S.deliveries.find(x => x.id === id); if (!d) return notFound('納品書');
  const cust = custById(d.customerId); const ds = destOf(d); const t = deliveryTotals(d);
  const inv = d.invoiceId ? S.invoices.find(v => v.id === d.invoiceId) : null;
  const logs = S.log.filter(x => x.ref === d.id).slice(-20).reverse();
  const notes = [];
  if (d.status === 'cancelled') notes.push(notice('warn', `この納品書は取り消しました（${fmtDateTime(d.cancelledAt)}）。理由：${esc(d.cancelReason || '')}`));
  if (t.amount == null && d.status !== 'cancelled') notes.push(notice('warn', `${t.missing.join('・')} 行目の単価か重量が入っていません。請求書を作る前に「直す」から入れてください。`));
  if (d.printedAt && d.updatedAt > d.printedAt && d.status !== 'cancelled') notes.push(notice('info', '印刷・PDFのあとで内容を直しました。必要なら印刷し直してください。'));
  if (!d.printedAt && d.status !== 'cancelled') notes.push(notice('info', 'まだ印刷・PDFにしていません。'));
  const rows = d.lines.map((l, i) => {
    if (l.kind === 'other') return `<tr><td>${i + 1}</td><td>${esc(l.name)}</td><td class="num">${fmtN(l.qty)} ${esc(l.unit || '')}</td><td class="num">—</td><td class="num">—</td><td class="num">${fmtPrice(l.unitPrice)}</td><td class="num">${yen(lineAmount(l))}</td><td>${esc(l.note1)}${l.note2 ? `<span class="sub">${esc(l.note2)}</span>` : ''}</td></tr>`;
    const calc = lineCalcKg(l);
    return `<tr><td>${i + 1}</td><td>${esc(l.material)}${l.sizes.map(s => `<span class="sub tnum">${esc(sizeText(s))}　${fmtN(s.cases ?? 0)}-${fmtN(s.count)}</span>`).join('')}</td>
      <td class="num">${fmtN(lineCount(l))}本<span class="sub">${fmtN(lineCases(l))}ケース</span></td><td class="num">${fmtKg(calc)}</td>
      <td class="num">${fmtKg(lineKg(l))}<span class="sub">${l.kgInput != null ? 'はかった重さ' : '計算重量'}</span></td>
      <td class="num">${fmtPrice(l.unitPrice)}<span class="sub">${l.priceBasis === 'pc' ? '円/本' : '円/kg'}</span></td><td class="num">${yen(lineAmount(l))}</td>
      <td>${esc(l.note1)}${l.note2 ? `<span class="sub">${esc(l.note2)}</span>` : ''}</td></tr>`;
  }).join('');
  const editable = d.status !== 'cancelled' && !d.invoiceId;
  return `${backLink('#deliveries', '納品書の一覧')}
  <div class="page-head"><div><h1>納品書 No.${pad6(d.no)}</h1><p class="lead">${deliveryState(d)}</p></div>
    <div class="actions">
      ${d.status !== 'cancelled' ? `<button type="button" class="btn primary" data-act="printDelivery" data-id="${d.id}">${icon(canPrint() ? 'printer' : 'file-down')}納品書を${canPrint() ? '印刷・PDF' : 'PDFで保存'}</button>
      <button type="button" class="btn" data-act="printKari" data-id="${d.id}">${icon(canPrint() ? 'printer' : 'file-down')}仮納品書</button>` : ''}
      ${editable ? `<a class="btn" href="#delivery-edit-${d.id}">${icon('pencil')}直す</a>` : ''}
    </div></div>
  ${notes.join('')}
  <div class="card"><dl class="kv">
    <dt>納品日</dt><dd>${fmtDateJ(d.date)}</dd>
    <dt>得意先</dt><dd>${cust ? `<a href="#customer-${cust.id}">${esc(cust.code)}　${esc(cust.name)}</a>（締日：${closingLabel(cust.closingDay)}）` : '—'}</dd>
    <dt>送り先</dt><dd>${ds ? `${esc(ds.name)}${ds.address ? `　${esc(ds.address)}` : ''}` : '得意先と同じ'}</dd>
    <dt>請求書</dt><dd>${inv ? `<a href="#invoice-${inv.id}">No.${pad6(inv.no)}（${fmtDateJ(inv.closingDate)}締め）</a>` : 'まだ請求書に入っていません'}</dd>
    ${d.kariNo ? `<dt>仮納品書No.</dt><dd>${pad6(d.kariNo)}</dd>` : ''}
    ${d.memo ? `<dt>メモ</dt><dd>${esc(d.memo)}</dd>` : ''}
    <dt>登録</dt><dd>${fmtDateTime(d.createdAt)}${d.updatedAt !== d.createdAt ? `（最後に直した日時 ${fmtDateTime(d.updatedAt)}）` : ''}</dd>
  </dl></div>
  <div class="tbl-wrap"><table class="tbl"><thead><tr><th>行</th><th>品名・寸法（ケース-本数）</th><th class="num">本数</th><th class="num">計算重量（kg）</th><th class="num">重量（kg）</th><th class="num">単価</th><th class="num">金額（円）</th><th>摘要</th></tr></thead>
    <tbody>${rows}</tbody><tfoot><tr><td colspan="2">合計</td><td class="num">${fmtN(t.count)}本<span class="sub">${fmtN(t.cases)}ケース</span></td><td></td><td class="num">${fmtKg(roundTo(t.kg, 1))}</td><td></td><td class="num">${t.amount == null ? '—' : yen(t.amount)}</td><td>税抜</td></tr></tfoot></table></div>
  <div class="actions">
    <a class="btn" href="#delivery-new" data-act="copyDelivery" data-id="${d.id}">${icon('copy')}同じ内容で新しく入力する</a>
    ${editable ? `<button type="button" class="btn text danger" data-act="cancelDelivery" data-id="${d.id}">${icon('ban')}この納品書を取り消す</button>` : ''}
  </div>
  ${logs.length ? `<div class="card"><h2>この納品書の履歴</h2><ul class="small">${logs.map(x => `<li>${fmtDateTime(x.at)}　${esc(x.action)}：${esc(x.summary)}</li>`).join('')}</ul></div>` : ''}`;
}
async function cancelDelivery(id) {
  const d = S.deliveries.find(x => x.id === id); if (!d) return;
  if (d.invoiceId) { toast('請求書に入っている納品書は取り消せません。先に請求書を取り消してください', 'circle-alert'); return; }
  const reason = await askReason({ title: `納品書 No.${pad6(d.no)} を取り消す`, message: '取り消しても記録は残ります（番号は欠番になります）。請求書には入らなくなります。', okLabel: '取り消す' });
  if (!reason) return;
  await snapshot(`納品書 No.${pad6(d.no)} の取消の前`);
  d.status = 'cancelled'; d.cancelReason = reason; d.cancelledAt = nowIso(); d.updatedAt = nowIso();
  logAction('納品書を取消', `No.${pad6(d.no)} ${custName(d.customerId)}　理由：${reason}`, d.id);
  await save(true); toast(`納品書 No.${pad6(d.no)} を取り消しました`); render();
}
