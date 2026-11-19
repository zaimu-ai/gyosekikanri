/* =========================================================
   ホーム・製作伝票・得意先・入金・得意先台帳・設定
   ========================================================= */
const backLink = (href, label) => `<p><a href="${href}" class="small">${icon('arrow-left')}${esc(label)}へ戻る</a></p>`;
const notFound = what => `${notice('warn', `${esc(what)}が見つかりません。一覧から開き直してください。`)}<p><a class="btn" href="#home">ホームへ</a></p>`;

/* ---------- ホーム ---------- */
function dueInvoiceRows() {
  const t = todayStr(); const out = [];
  for (const c of sortCustomers(S.customers.filter(x => x.active && isBillingCustomer(x)))) {
    const cd = latestClosingOnOrBefore(c, t);
    const st = invoiceRowState(c, cd);
    if (st.kind === 'ready' || st.kind === 'missing') out.push({ c, cd, st });
  }
  return out;
}
function viewHome() {
  const t = todayStr(); const ym = t.slice(0, 7);
  const monthDels = S.deliveries.filter(d => d.status !== 'cancelled' && d.date.startsWith(ym));
  const monthAmt = sum(monthDels, d => deliveryTotals(d).partial);
  const openOrders = S.orders.filter(o => ['open', 'partial'].includes(orderState(o))).sort((a, b) => (a.dueDate || '9999') < (b.dueDate || '9999') ? -1 : 1);
  const due = dueInvoiceRows();
  const recv = sum(S.customers, c => receivable(c).rest);
  const missing = S.deliveries.filter(d => d.status !== 'cancelled' && !d.invoiceId && deliveryTotals(d).amount == null);
  const notPrinted = S.deliveries.filter(d => d.status !== 'cancelled' && !d.printedAt);
  const setupNotes = [];
  if (MODE === 'main' && !S.customers.length) setupNotes.push(notice('info', `<b>はじめに得意先を登録してください。</b>締日と、事務コンから移るときの残高（開始時の残高）もここで入れます。<div class="actions" style="margin-top:8px"><a class="btn" href="#customer-new">${icon('plus')}得意先を登録する</a></div>`));
  if (MODE === 'main' && !S.numbersConfirmed) setupNotes.push(notice('warn', `<b>伝票の番号の続きをまだ決めていません。</b>事務コンの納品書No.・仮納品書No.の続きから始めるときは「設定・データ」で番号を入れてください。<div class="actions" style="margin-top:8px"><a class="btn" href="#setup">${icon('sliders-horizontal')}番号を決める</a></div>`));
  return `
  <div class="page-head"><div><h1>ホーム</h1><p class="lead">${fmtDateJ(t)}（${'日月火水木金土'[parseYmd(t).getDay()]}）</p></div>
    <div class="actions"><a class="btn primary" href="#delivery-new">${icon('plus')}納品書を入力する</a><a class="btn" href="#order-new">${icon('clipboard-list')}製作伝票を登録する</a></div></div>
  ${setupNotes.join('')}
  <div class="grid-cards">
    <div class="card stat"><span class="label">${icon('truck')}今月の納品（税抜）</span><span class="value">${yen(monthAmt)}<small>円</small></span><span class="small muted">納品書 ${monthDels.length} 枚</span></div>
    <div class="card stat"><span class="label">${icon('clipboard-list')}出荷待ちの製作伝票</span><span class="value">${openOrders.length}<small>件</small></span><a class="small" href="#orders">製作伝票の一覧へ</a></div>
    <div class="card stat"><span class="label">${icon('file-text')}請求書を作る得意先</span><span class="value">${due.length}<small>社</small></span><a class="small" href="#invoices">請求書の画面へ</a></div>
    <div class="card stat"><span class="label">${icon('landmark')}まだ入金されていない額</span><span class="value">${yen(recv)}<small>円</small></span><a class="small" href="#payments">入金の画面へ</a></div>
  </div>
  <div class="split two">
    <div class="card"><div class="card-head"><h2>締め日が来た得意先</h2><a href="#invoices" class="small">請求書の画面へ</a></div>
      ${due.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>得意先</th><th>締め日</th><th class="num">今回請求額</th><th>状態</th></tr></thead><tbody>
      ${due.map(r => `<tr class="clickable" data-href="#invoices" data-month="${r.cd.slice(0, 7)}"><td>${esc(r.c.name)}</td><td class="nowrap">${fmtDate(r.cd)}</td><td class="num">${yen(r.st.dr.total)}</td><td>${r.st.kind === 'ready' ? chip('info', 'file-text', '作れます') : chip('warn', 'triangle-alert', '未入力あり')}</td></tr>`).join('')}</tbody></table></div>`
      : `<p class="muted">今、請求書を作る得意先はありません。</p>`}</div>
    <div class="card"><div class="card-head"><h2>出荷待ちの製作伝票</h2><a href="#orders" class="small">すべて見る</a></div>
      ${openOrders.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>納期</th><th>得意先・品名</th><th>状態</th></tr></thead><tbody>
      ${openOrders.slice(0, 8).map(o => { const st = ORDER_STATE[orderState(o)]; const late = o.dueDate && o.dueDate < t; return `<tr class="clickable" data-href="#order-${o.id}"><td class="nowrap">${o.dueDate ? fmtDate(o.dueDate) : '—'}</td><td>${esc(custName(o.customerId))}<span class="sub">${esc(o.material)}　${esc(sizeText(o))}</span></td><td>${chip(st.cls, st.icon, st.label)}${late ? `<span class="sub">${chip('err', 'circle-alert', '納期を過ぎています')}</span>` : ''}</td></tr>`; }).join('')}</tbody></table></div>`
      : `<p class="muted">出荷待ちの製作伝票はありません。</p>`}</div>
  </div>
  ${missing.length || notPrinted.length ? `<div class="card"><h2>確かめてほしい納品書</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>納品日</th><th>No.</th><th>得意先</th><th>内容</th></tr></thead><tbody>
    ${missing.map(d => `<tr class="clickable" data-href="#delivery-${d.id}"><td>${fmtDate(d.date)}</td><td><a href="#delivery-${d.id}">${pad6(d.no)}</a></td><td>${esc(custName(d.customerId))}</td><td>${chip('warn', 'triangle-alert', '単価・重量が未入力')}</td></tr>`).join('')}
    ${notPrinted.filter(d => !missing.includes(d)).map(d => `<tr class="clickable" data-href="#delivery-${d.id}"><td>${fmtDate(d.date)}</td><td><a href="#delivery-${d.id}">${pad6(d.no)}</a></td><td>${esc(custName(d.customerId))}</td><td>${chip('info', 'printer', 'まだ印刷していない')}</td></tr>`).join('')}
    </tbody></table></div></div>` : ''}`;
}

/* ---------- 製作伝票 ---------- */
ui.ol = { state: 'open', cust: '', q: '' };
function viewOrders() {
  const f = ui.ol; const t = todayStr();
  let list = S.orders.filter(o => !f.cust || o.customerId === f.cust);
  const st = o => orderState(o);
  if (f.state === 'open') list = list.filter(o => ['open', 'partial'].includes(st(o)));
  if (f.state === 'closed') list = list.filter(o => ['shipped', 'done'].includes(st(o)));
  if (f.state === 'cancelled') list = list.filter(o => st(o) === 'cancelled');
  if (f.q) { const q = toHalf(f.q).toLowerCase(); list = list.filter(o => [o.no, o.orderNo, o.user, o.material, sizeText(o), custName(o.customerId), o.note, o.memo].join(' ').toLowerCase().includes(q)); }
  list.sort((a, b) => (a.dueDate || '9999') < (b.dueDate || '9999') ? -1 : (a.dueDate || '9999') > (b.dueDate || '9999') ? 1 : String(a.no).localeCompare(String(b.no)));
  return `
  <div class="page-head"><div><h1>製作伝票</h1><p class="lead">届いた製作伝票を登録しておくと、出荷のときに納品書へそのまま入れられます。製作伝票を登録せずに納品書を入力することもできます。</p></div>
    <div class="actions"><a class="btn primary" href="#order-new">${icon('plus')}製作伝票を入力する</a></div></div>
  <div class="card stack">
    <div class="form-grid">
      ${fld('olState', '状態', sel('olState', [['open', '出荷待ち・一部出荷'], ['', 'すべて'], ['closed', '出荷済み・完了'], ['cancelled', '取消']], f.state))}
      ${fld('olCust', '得意先', custSelect('olCust', f.cust, { all: true, includeInactive: true }))}
      ${fld('olQ', '探す（製作伝票No.・注文番号・ユーザー・商品名）', txt('olQ', f.q))}
    </div>
    ${list.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th class="check-cell">選ぶ</th><th>納期</th><th>製作伝票No.</th><th>得意先</th><th>品名・寸法</th><th class="num">受注</th><th class="num">出荷済み</th><th class="num">単価</th><th>状態</th></tr></thead><tbody>
      ${list.map(o => { const s = ORDER_STATE[st(o)]; const sh = orderShipped(o); const late = ['open', 'partial'].includes(st(o)) && o.dueDate && o.dueDate < t; return `<tr class="${st(o) === 'cancelled' ? 'is-cancel' : ''}">
        <td class="check-cell">${['open', 'partial'].includes(st(o)) ? `<label class="check"><input type="checkbox" class="ordPick" value="${o.id}" aria-label="製作伝票 ${esc(o.no)} を選ぶ"></label>` : ''}</td>
        <td class="nowrap">${o.dueDate ? fmtDate(o.dueDate) : '—'}${late ? `<span class="sub">${chip('err', 'circle-alert', '納期を過ぎています')}</span>` : ''}</td>
        <td><a href="#order-${o.id}">${esc(o.no || '（番号なし）')}</a>${o.orderNo ? `<span class="sub">注文No.${esc(o.orderNo)}</span>` : ''}</td>
        <td>${esc(custName(o.customerId))}${o.user ? `<span class="sub">ユーザー：${esc(o.user)}</span>` : ''}${destOf(o) ? `<span class="sub">送り先：${esc(destOf(o).name)}</span>` : ''}</td>
        <td>${esc(o.material)}<span class="sub">${esc(sizeText(o))}</span></td>
        <td class="num">${o.qtyText ? esc(o.qtyText) : o.plannedCount == null ? '—' : `${fmtN(o.plannedCount)}本`}${o.qtyText && o.plannedCount != null ? `<span class="sub">${fmtN(o.plannedCount)}本</span>` : ''}${o.plannedKg != null ? `<span class="sub">${fmtKg(o.plannedKg)}kg</span>` : ''}</td>
        <td class="num">${fmtN(sh.count)}本<span class="sub">${fmtKg(sh.kg)}kg</span></td>
        <td class="num">${o.unitPrice == null ? '—' : `${o.priceBasis === 'pc' ? 'P' : 'K'} ${fmtPrice(o.unitPrice)}`}</td><td>${chip(s.cls, s.icon, s.label)}</td></tr>`; }).join('')}
      </tbody></table></div>
      <div class="actions"><button type="button" class="btn primary" data-act="ordersToDelivery">${icon('truck')}選んだ製作伝票で納品書を作る</button></div>`
      : `<div class="empty">${icon('clipboard-list')}<p>条件に合う製作伝票はありません。</p></div>`}
  </div>`;
}
function bindOrders() {
  $('#olState').onchange = e => { ui.ol.state = e.target.value; render(); };
  $('#olCust').onchange = e => { ui.ol.cust = e.target.value; render(); };
  $('#olQ').onchange = e => { ui.ol.q = e.target.value; render(); };
}
function ordersToDelivery() {
  const ids = $$('.ordPick:checked').map(x => x.value);
  if (!ids.length) { showErrors($('#view'), [{ el: $('.ordPick'), msg: '納品書に入れる製作伝票を選んでください' }]); return; }
  const custs = new Set(ids.map(id => S.orders.find(o => o.id === id).customerId));
  if (custs.size > 1) { showErrors($('#view'), [{ el: $('.ordPick:checked'), msg: '1枚の納品書には、同じ得意先の製作伝票だけを入れられます' }]); return; }
  ui.df = null; ui.pendingOrders = ids; go('#delivery-new');
}
function viewOrderForm(id) {
  const o = id ? S.orders.find(x => x.id === id) : null;
  if (id && !o) return notFound('製作伝票');
  const v = o || { no: '', date: todayStr(), customerId: '', user: '', destId: '', orderNo: '', material: '', od: null, innerKind: 'id', inner: null, length: null, qtyText: '', plannedCount: null, plannedKg: null, dueDate: '', unitPrice: null, priceBasis: 'kg', note: '', memo: '' };
  const st = o ? orderState(o) : null; const sh = o ? orderShipped(o) : null;
  const cust = custById(v.customerId);
  const ships = o ? S.deliveries.filter(d => d.status !== 'cancelled' && d.lines.some(l => l.orderId === o.id)) : [];
  const ro = o && st === 'cancelled';
  const pk = v.priceBasis === 'pc' ? 'pc' : 'kg';
  return `${backLink('#orders', '製作伝票の一覧')}
  <div class="page-head"><div><h1>${o ? `製作伝票 ${esc(o.no || '（番号なし）')}` : '製作伝票入力'}</h1>${o ? `<p class="lead">${chip(ORDER_STATE[st].cls, ORDER_STATE[st].icon, ORDER_STATE[st].label)}</p>` : '<p class="lead">届いた製作伝票を、伝票と同じ順に入れます（伝票No.・日付・納期 → 得意先・ユーザー → 商品名・寸法 → 受注量・単価）。</p>'}</div>
    ${o && ['open', 'partial'].includes(st) ? `<div class="actions"><button type="button" class="btn" data-act="orderToDelivery" data-id="${o.id}">${icon('truck')}この製作伝票で納品書を作る</button></div>` : ''}</div>
  ${o && o.status === 'cancelled' ? notice('warn', `取り消した製作伝票です。理由：${esc(o.cancelReason || '')}`) : ''}
  ${o ? `<div class="card"><h2>出荷の状況</h2><p>出荷済み：<b class="tnum">${fmtN(sh.count)}本・${fmtKg(sh.kg)}kg</b>${o.plannedCount != null ? `（受注 ${fmtN(o.plannedCount)}本、残り ${fmtN(Math.max(o.plannedCount - sh.count, 0))}本）` : ''}</p>
    ${ships.length ? `<ul>${ships.map(d => `<li><a href="#delivery-${d.id}">納品書 No.${pad6(d.no)}</a>　${fmtDate(d.date)}</li>`).join('')}</ul>` : '<p class="muted">まだ出荷していません。</p>'}</div>` : ''}
  <form id="oForm" class="card stack" novalidate>
    <h2>伝票</h2>
    <div class="form-grid">
      ${fld('oNo', '製作伝票No.', numIn('oNo', v.no), { req: true, hint: '伝票の左上の番号（例：30110001）' })}
      ${fld('oDate', '日付', dateIn('oDate', v.date), { req: true, hint: '製作伝票の日付（摘要に入ります）' })}
      ${fld('oDue', '納期', dateIn('oDue', v.dueDate), { opt: true, hint: '「11/12出」のような出荷予定日' })}
    </div>
    <h2>得意先</h2>
    <div class="form-grid">
      ${fld('oCust', '得意先（コードを入れて Enter でも選べます）', custPicker('oCust', v.customerId), { req: true, cls: 'wide' })}
      ${fld('oUser', 'ユーザー', txt('oUser', v.user), { opt: true, hint: '得意先の先のお客さま。例：見本台（摘要に入ります）' })}
      ${fld('oDest', '送り先', destSelect('oDest', cust, v.destId, false), { opt: true, hint: '得意先と別の場所へ届けるとき（摘要2に「略称＋入」が入ります）' })}
      ${fld('oOrderNo', '注文番号', txt('oOrderNo', v.orderNo), { opt: true, hint: '得意先の注文番号（仮納品書に出ます）' })}
    </div>
    <h2>商品</h2>
    <div class="form-grid">
      ${fld('oMat', '商品名（材質・質別）', `<input type="text" id="oMat" list="matList2" value="${esc(v.material)}">`, { req: true, hint: '例：5056S-H34' })}
      ${fld('oOd', '外径（mm）', numIn('oOd', numStr(v.od)), { req: true })}
      <div class="field" data-field="oInner"><label for="oInner">${v.innerKind === 't' ? '肉厚' : '内径'}（mm）<span class="req">※必須</span></label>
        <div class="row"><div class="seg" role="group" aria-label="内径か肉厚か"><button type="button" data-act="oInnerKind" data-v="id" aria-pressed="${v.innerKind !== 't'}">内径</button><button type="button" data-act="oInnerKind" data-v="t" aria-pressed="${v.innerKind === 't'}">肉厚</button></div></div>
        ${numIn('oInner', numStr(v.inner))}<input type="hidden" id="oInnerKind" value="${v.innerKind === 't' ? 't' : 'id'}"></div>
      ${fld('oLen', '長さ（mm）', numIn('oLen', numStr(v.length)), { req: true, hint: '定尺の長さ' })}
    </div>
    <h2>受注量・単価</h2>
    <div class="form-grid">
      ${fld('oQty', '受注量', txt('oQty', v.qtyText), { opt: true, hint: '伝票のとおりに。例：5M、300K、9000P（摘要に入ります）' })}
      ${fld('oCount', '受注本数', numIn('oCount', numStr(v.plannedCount)), { opt: true, hint: '入れると、出荷済み・残りの本数がわかります' })}
      ${fld('oKg', '受注重量（kg）', numIn('oKg', numStr(v.plannedKg)), { opt: true, hint: '<span id="oKgHint"></span>' })}
      <div class="field" data-field="oPrice"><label for="oPrice">単価<span class="opt">※任意</span></label><p class="hint">伝票の P（1本の値段）か K（1kgの値段）</p>
        <div class="row"><div class="seg" role="group" aria-label="単価の単位"><button type="button" data-act="oBasis" data-v="kg" aria-pressed="${pk === 'kg'}">K（円/kg）</button><button type="button" data-act="oBasis" data-v="pc" aria-pressed="${pk === 'pc'}">P（円/本）</button></div></div>
        ${numIn('oPrice', numStr(v.unitPrice))}<input type="hidden" id="oBasis" value="${pk}"></div>
      ${fld('oNote', '出荷の注意', txt('oNote', v.note), { opt: true, cls: 'wide', hint: '例：楕円・曲り厳重注意、L=5200' })}
      ${fld('oMemo', 'メモ', txt('oMemo', v.memo), { opt: true, cls: 'wide', hint: '社内用' })}
    </div>
    <div class="calc-out" style="display:block"><span class="small muted">納品書の摘要に入る内容（納品日が今日のとき）</span><div class="tnum" id="oNotePrev"></div></div>
    <datalist id="matList2">${S.materials.map(m => `<option value="${esc(m)}">`).join('')}</datalist>
    <div class="actions">${!ro ? `<button type="submit" class="btn primary">${icon('save')}${o ? '直した内容を登録する' : '製作伝票を登録する'}</button>` : ''}<a class="btn text" href="#orders">やめる</a>
      ${o && ['open', 'partial'].includes(st) ? `<button type="button" class="btn text" data-act="orderDone" data-id="${o.id}">${icon('circle-check')}完了にする（これ以上出荷しない）</button>` : ''}
      ${o && st === 'done' ? `<button type="button" class="btn text" data-act="orderReopen" data-id="${o.id}">${icon('rotate-ccw')}出荷待ちに戻す</button>` : ''}
      ${o && st !== 'cancelled' && !ships.length ? `<button type="button" class="btn text danger" data-act="orderCancel" data-id="${o.id}">${icon('ban')}取り消す</button>` : ''}</div>
  </form>`;
}
function orderFormCalcHint() {
  const s = { od: parseNum($('#oOd').value), innerKind: $('#oInnerKind').value, inner: parseNum($('#oInner').value), length: parseNum($('#oLen').value) };
  const fix = x => Number.isNaN(x) ? null : x; Object.keys(s).forEach(k => { if (k !== 'innerKind') s[k] = fix(s[k]); });
  const u = unitKg(s); const n = fix(parseNum($('#oCount').value));
  const h = $('#oKgHint');
  if (h) h.textContent = u == null ? '寸法を入れると1本の重さを計算します' : `1本 ${fmtN(u, 0, 5)}kg${n != null && n > 0 ? `、${fmtN(n)}本で約 ${fmtKg(roundTo(u * n, 1))}kg` : ''}`;
  const p = $('#oNotePrev');
  if (p) {
    const c = custById($('#oCust').value); const dest = c?.destinations.find(x => x.id === $('#oDest').value) || null;
    const o = { user: $('#oUser').value.trim(), date: $('#oDate').value, qtyText: toHalf($('#oQty').value).toUpperCase(), no: toHalf($('#oNo').value) };
    p.textContent = `摘要：${autoNote1(o) || '—'}　／　摘要2：${autoNote2(o, todayStr(), dest) || '—'}`;
  }
}
function bindOrderForm(id) {
  const form = $('#oForm'); if (!form) return;
  orderFormCalcHint();
  bindCustPicker('oCust');
  form.addEventListener('input', () => { ui.dirty = true; orderFormCalcHint(); });
  form.addEventListener('change', () => orderFormCalcHint());
  $('#oCust').addEventListener('change', e => { const c = custById(e.target.value); $('#oDest').outerHTML = destSelect('oDest', c, '', false); orderFormCalcHint(); });
  form.addEventListener('submit', e => {
    e.preventDefault();
    const g = sid => $(sid, form); const errs = []; const E = (el, msg) => errs.push({ el, msg });
    const no = toHalf(g('#oNo').value), date = g('#oDate').value, cust = g('#oCust').value, mat = toHalf(g('#oMat').value).toUpperCase();
    const nums = {}; for (const [k, sid, req2, label] of [['od', '#oOd', true, '外径'], ['inner', '#oInner', true, g('#oInnerKind').value === 't' ? '肉厚' : '内径'], ['length', '#oLen', true, '長さ'], ['plannedCount', '#oCount', false, '受注本数'], ['plannedKg', '#oKg', false, '受注重量'], ['unitPrice', '#oPrice', false, '単価']]) {
      const v = parseNum(g(sid).value); nums[k] = v;
      if (v == null && req2) E(g(sid), `${label}を入れてください`);
      else if (Number.isNaN(v)) E(g(sid), `${label}は数字で入れてください`);
      else if (v != null && v <= 0) E(g(sid), `${label}は0より大きい数を入れてください`);
      else if (k === 'plannedCount' && v != null && !Number.isInteger(v)) E(g(sid), '受注本数は整数で入れてください');
    }
    if (!no) E(g('#oNo'), '製作伝票No.を入れてください');
    else if (!/^[0-9A-Za-z-]+$/.test(no)) E(g('#oNo'), '製作伝票No.は数字（と英字・ハイフン）で入れてください');
    else if (S.orders.some(x => x.id !== id && x.status !== 'cancelled' && String(x.no) === no)) E(g('#oNo'), `製作伝票No.${no} はもう登録しています。一覧から開いて直してください`);
    if (!date) E(g('#oDate'), '日付を入れてください');
    if (!cust) E(g('#oCust'), '得意先を選んでください');
    if (!mat) E(g('#oMat'), '商品名（材質・質別）を入れてください');
    const sz = { od: nums.od, innerKind: g('#oInnerKind').value, inner: nums.inner };
    if (!errs.length && wallT(sz) == null) E(g('#oInner'), sz.innerKind === 't' ? '肉厚が外径の半分より大きくなっています' : '内径が外径以上になっています');
    if (!showErrors(form, errs)) return;
    const rec = { no, date, customerId: cust, user: g('#oUser').value.trim(), destId: g('#oDest').value || null, orderNo: toHalf(g('#oOrderNo').value), material: mat, od: nums.od, innerKind: sz.innerKind, inner: nums.inner, length: nums.length, qtyText: toHalf(g('#oQty').value).toUpperCase(), plannedCount: nums.plannedCount, plannedKg: nums.plannedKg, dueDate: g('#oDue').value, unitPrice: nums.unitPrice, priceBasis: g('#oBasis').value === 'pc' ? 'pc' : 'kg', note: g('#oNote').value.trim(), memo: g('#oMemo').value.trim(), updatedAt: nowIso() };
    let o = id ? S.orders.find(x => x.id === id) : null;
    if (o) { Object.assign(o, rec); logAction('製作伝票を直す', `${o.no} ${custName(o.customerId)} ${o.material} ${sizeText(o)}`, o.id); }
    else { o = { id: uid(), status: 'active', createdAt: nowIso(), ...rec }; S.orders.push(o); logAction('製作伝票を登録', `${o.no} ${custName(o.customerId)} ${o.material} ${sizeText(o)}`, o.id); }
    if (mat && !S.materials.includes(mat)) S.materials.push(mat);
    ui.dirty = false; save(true); toast(id ? '製作伝票を直しました' : '製作伝票を登録しました');
    // 続けて次の伝票を入れられるように、新しく入れたときは空の入力画面に戻る（旧システムと同じ流れ）
    if (id) go('#orders'); else { lastRouteKey = null; render(); focusLater('#oNo'); }
  });
}
async function orderSetStatus(id, status) {
  const o = S.orders.find(x => x.id === id); if (!o) return;
  if (status === 'cancelled') {
    const reason = await askReason({ title: '製作伝票を取り消す', message: '取り消しても記録は残ります。', okLabel: '取り消す' }); if (!reason) return;
    o.cancelReason = reason; logAction('製作伝票を取消', `${o.no || '（番号なし）'} ${custName(o.customerId)}　理由：${reason}`, o.id);
  } else logAction(status === 'done' ? '製作伝票を完了' : '製作伝票を出荷待ちに戻す', `${o.no || '（番号なし）'} ${custName(o.customerId)}`, o.id);
  o.status = status; o.updatedAt = nowIso(); ui.dirty = false;
  await save(true); toast(status === 'cancelled' ? '製作伝票を取り消しました' : status === 'done' ? '製作伝票を完了にしました' : '出荷待ちに戻しました'); render();
}

/* ---------- 得意先 ---------- */
ui.cl = { q: '', show: 'active' };
function viewCustomers() {
  const f = ui.cl;
  let list = sortCustomers(S.customers);
  if (f.show === 'active') list = list.filter(c => c.active);
  if (f.show === 'billing') list = list.filter(c => c.active && isBillingCustomer(c));
  if (f.show === 'check') list = list.filter(c => c.needsCheck && c.needsCheck.length);
  if (f.q) { const q = toHalf(f.q).toLowerCase(); list = list.filter(c => [c.code, c.kana, c.name, c.address, c.address2, c.tel].join(' ').toLowerCase().includes(q)); }
  const nCheck = S.customers.filter(c => c.needsCheck && c.needsCheck.length).length;
  return `
  <div class="page-head"><div><h1>得意先</h1><p class="lead">得意先ごとに締日・請求先・消費税の端数・送り先を決めます。取引をやめた得意先は「取引停止」にします（消しません）。</p></div>
    <div class="actions"><a class="btn primary" href="#customer-new">${icon('plus')}得意先を登録する</a><a class="btn" href="#customers-import">${icon('file-up')}得意先・宛名を取り込む（CSV）</a></div></div>
  ${nCheck ? notice('warn', `<b>取り込んだときに空欄にした項目がある得意先が ${nCheck} 件あります。</b>元の一覧で文字が重なっていて読めなかった項目です。手で入れてください。<div class="actions" style="margin-top:8px"><button type="button" class="btn sm" data-act="clShow" data-v="check">${icon('list-checks')}その得意先だけ表示する</button></div>`) : ''}
  <div class="card stack"><div class="form-grid">
    ${fld('clQ', '探す（コード・名前・住所・電話番号）', txt('clQ', f.q))}
    ${fld('clShow', '表示する得意先', sel('clShow', [['active', '取引中'], ['billing', '請求書を作る得意先（締日あり）'], ['check', '空欄の項目がある得意先'], ['', 'すべて（取引停止を含む）']], f.show))}
  </div>
  ${list.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th class="num">コード</th><th>名前</th><th>締日</th><th>請求先</th><th>消費税の円未満</th><th class="num">送り先</th><th class="num">まだ入金されていない額</th><th>状態</th></tr></thead><tbody>
    ${list.map(c => { const bt = billToOf(c.id); return `<tr class="clickable${c.active ? '' : ' is-cancel'}" data-href="#customer-${c.id}"><td class="num">${esc(c.code)}</td><td><a href="#customer-${c.id}">${esc(c.name)}</a>${c.needsCheck && c.needsCheck.length ? `<span class="sub">${chip('warn', 'triangle-alert', `空欄：${c.needsCheck.join('・')}`)}</span>` : ''}</td>
      <td>${c.closingDay == null ? chip('mute', 'circle-dashed', '締日なし') : closingLabel(c.closingDay)}</td><td>${bt === c.id ? '—' : `${esc(custById(bt)?.code)} ${esc(custName(bt))}`}</td><td>${c.taxRounding ? ROUND_LABEL[c.taxRounding] : '会社の設定'}</td>
      <td class="num">${c.destinations.filter(x => x.active !== false).length}</td><td class="num">${isBillingCustomer(c) ? yen(receivable(c).rest) : '—'}</td><td>${c.active ? chip('ok', 'circle-check', '取引中') : chip('mute', 'ban', '取引停止')}</td></tr>`; }).join('')}
  </tbody></table></div><p class="small muted">${list.length} 件</p>` : `<div class="empty">${icon('building-2')}<p>${S.customers.length ? '条件に合う得意先はありません。' : '得意先がまだありません。'}</p>${S.customers.length ? '' : `<a class="btn primary" href="#customer-new">${icon('plus')}得意先を登録する</a>`}</div>`}
  </div>`;
}
function bindCustomers() {
  $('#clQ').onchange = e => { ui.cl.q = e.target.value; render(); };
  $('#clShow').onchange = e => { ui.cl.show = e.target.value; render(); };
}
ui.cf = null;
function viewCustomerForm(id) {
  const c = id ? custById(id) : null; if (id && !c) return notFound('得意先');
  if (!ui.cf || ui.cf.id !== (id || null)) ui.cf = { id: id || null, dests: c ? JSON.parse(JSON.stringify(c.destinations)) : [] };
  const v = c || { code: nextCustCode(), name: '', kana: '', zip: '', address: '', address2: '', tel: '', fax: '', closingDay: 31, taxRounding: null, billToId: null, payNote: '', memo: '', opening: { date: '', balance: 0 }, active: true, needsCheck: [] };
  const cdOpts = [[5, '5日'], [10, '10日'], [15, '15日'], [20, '20日'], [25, '25日'], [31, '末日'], ['other', 'その他の日'], ['none', '締日なし（請求書を作らない）']];
  const cdSel = v.closingDay == null ? 'none' : [5, 10, 15, 20, 25, 31].includes(Number(v.closingDay)) ? Number(v.closingDay) : 'other';
  const others = sortCustomers(S.customers.filter(x => x.id !== id && (x.active || x.id === v.billToId) && billToOf(x.id) === x.id));
  const members = c ? [...billMembers(c)].filter(x => x !== c.id) : [];
  const lg = v.legacy;
  return `${backLink('#customers', '得意先の一覧')}
  <div class="page-head"><div><h1>${c ? esc(c.name) : '得意先を登録する'}</h1></div>${c ? `<div class="actions"><a class="btn" href="#ledger" data-act="openLedger" data-id="${c.id}">${icon('book-open-text')}得意先台帳を見る</a></div>` : ''}</div>
  ${v.needsCheck && v.needsCheck.length ? notice('warn', `<b>取り込んだときに空欄にした項目：${esc(v.needsCheck.join('、'))}</b><br>元の一覧で文字が重なっていて読めなかった項目です。入れたら、下の「空欄の確認」を外してください。`) : ''}
  <form id="cForm" class="stack" novalidate>
    <div class="card stack"><h2>基本</h2><div class="form-grid">
      ${fld('cCode', '得意先コード', numIn('cCode', v.code), { req: true, hint: '事務コンと同じ番号' })}
      ${fld('cName', '得意先名', txt('cName', v.name), { req: true, hint: '帳票に出る名前。例：○○金属(株)' })}
      ${fld('cKana', 'メニュー（読みの頭文字）', txt('cKana', v.kana), { opt: true, hint: '例：い（探すときに使います）' })}
      ${fld('cZip', '郵便番号', txt('cZip', v.zip), { opt: true })}
      ${fld('cAddr', '住所1', txt('cAddr', v.address), { opt: true, cls: 'wide' })}
      ${fld('cAddr2', '住所2', txt('cAddr2', v.address2), { opt: true, cls: 'wide', hint: 'ビル名など' })}
      ${fld('cTel', '電話番号', txt('cTel', v.tel), { opt: true })}
      ${fld('cFax', 'FAX番号', txt('cFax', v.fax), { opt: true })}
    </div></div>
    <div class="card stack"><h2>請求</h2><div class="form-grid">
      ${fld('cClose', '締日', sel('cClose', cdOpts, cdSel), { req: true, hint: '「締日なし」は宛名だけの登録など、請求書を作らない得意先' })}
      ${fld('cCloseOther', 'その他の締日（1〜28）', numIn('cCloseOther', cdSel === 'other' ? v.closingDay : ''), { req: true, cls: cdSel === 'other' ? '' : 'is-hidden' })}
      ${fld('cBillTo', '請求先（事務コンの「請コード」）', sel('cBillTo', [['', 'この得意先に請求する'], ...others.map(x => [x.id, `${x.code}　${x.name}にまとめる`])], v.billToId || ''), { req: true, hint: '支店・工場の売上を、本社などの請求書にまとめるときに選びます' })}
      ${fld('cTaxR', '消費税の円未満（事務コンの「丸目」）', sel('cTaxR', [['', `会社の設定に従う（今は${ROUND_LABEL[S.rules.taxRounding]}）`], ...Object.entries(ROUND_LABEL)], v.taxRounding || ''), { req: true, hint: '事務コンの丸目 0＝切り捨て、1＝四捨五入（請求一覧表で確かめました）' })}
      ${fld('cPay', '支払いの条件', txt('cPay', v.payNote), { opt: true, hint: '例：翌月末 振込（メモとして使います）' })}
      ${fld('cOpenDate', '開始時の残高の日付', dateIn('cOpenDate', v.opening?.date), { opt: true, hint: '事務コンから移るとき、最後に請求した締め日' })}
      ${fld('cOpenBal', '開始時の残高（円）', numIn('cOpenBal', numStr(v.opening?.balance)), { opt: true, hint: '最後の請求書の今回請求額。最初の請求書の「前回請求額」になります' })}
      ${fld('cActive', '取引の状態', sel('cActive', [['1', '取引中'], ['0', '取引停止']], v.active ? '1' : '0'), { req: true })}
      ${fld('cMemo', 'メモ', txt('cMemo', v.memo), { opt: true, cls: 'wide' })}
    </div>
    ${members.length ? `<p class="small">${icon('git-merge')}この得意先の請求書にまとめている得意先：${members.map(x => `<a href="#customer-${x}">${esc(custById(x)?.code)} ${esc(custName(x))}</a>`).join('、')}</p>` : ''}
    ${v.needsCheck && v.needsCheck.length ? `<label class="check"><input type="checkbox" id="cNeedsCheck" checked> 空欄の確認（${esc(v.needsCheck.join('、'))}）がまだ残っている</label>` : ''}
    ${lg ? `<details><summary class="small">事務コンから取り込んだときの値（参考）</summary><p class="small tnum">締日 ${esc(lg.closing)}・税 ${esc(lg.tax)}・丸目 ${esc(lg.round)}・繰越 ${esc(lg.carry)}・請コード ${esc(lg.billCode)}・印字用 ${esc(lg.print || '（なし）')}　${fmtDateTime(lg.importedAt)} に取り込み</p></details>` : ''}
    </div>
    <div class="card stack"><div class="card-head"><h2>送り先</h2><button type="button" class="btn sm" data-act="addDest">${icon('plus')}送り先を足す</button></div>
      <p class="small muted">得意先（注文主）と別の場所へ届けるときの送り先です。略称は納品書の摘要2（例：見本入）に使います。使わなくなった送り先は「使わない」にします。</p>
      <div id="destRows" class="stack">${ui.cf.dests.length ? ui.cf.dests.map((x, i) => destRowHtml(x, i)).join('') : '<p class="muted">送り先はありません。</p>'}</div></div>
    <div class="sticky-foot"><a class="btn text" href="#customers">やめる</a><button type="submit" class="btn primary">${icon('save')}${c ? '直した内容を登録する' : '得意先を登録する'}</button></div>
  </form>`;
}
function destRowHtml(x, i) {
  return `<div class="form-grid dest-row" data-dest="${i}">
    ${fld(`dc${i}`, '送り先コード', `<input type="text" inputmode="numeric" class="numin" id="dc${i}" data-di="${i}" data-df="code" value="${esc(x.code || '')}">`, { opt: true })}
    ${fld(`dn${i}`, '送り先の名前', `<input type="text" id="dn${i}" data-di="${i}" data-df="name" value="${esc(x.name)}">`, { req: true })}
    ${fld(`ds${i}`, '略称', `<input type="text" id="ds${i}" data-di="${i}" data-df="short" value="${esc(x.short || '')}">`, { opt: true, hint: '例：見本' })}
    ${fld(`da${i}`, '住所', `<input type="text" id="da${i}" data-di="${i}" data-df="address" value="${esc(x.address || '')}">`, { opt: true })}
    ${fld(`dt${i}`, '電話番号', `<input type="text" id="dt${i}" data-di="${i}" data-df="tel" value="${esc(x.tel || '')}">`, { opt: true })}
    ${fld(`du${i}`, '使うか', sel(`du${i}`, [['1', '使う'], ['0', '使わない']], x.active === false ? '0' : '1', `data-di="${i}" data-df="active"`))}
  </div>`;
}
function nextCustCode() { return (Math.max(0, ...S.customers.map(c => Number(c.code) || 0)) + 1); }
function bindCustomerForm(id) {
  const form = $('#cForm'); if (!form) return;
  const hideOther = () => { const box = $('[data-field=cCloseOther]'); box.classList.toggle('is-hidden', $('#cClose').value !== 'other'); box.hidden = $('#cClose').value !== 'other'; };
  hideOther(); $('#cClose').onchange = hideOther;
  form.addEventListener('input', e => {
    ui.dirty = true; const t = e.target;
    if (t.dataset.di != null) { const x = ui.cf.dests[+t.dataset.di]; if (t.dataset.df === 'active') x.active = t.value === '1'; else x[t.dataset.df] = t.value; }
  });
  form.addEventListener('change', e => { const t = e.target; if (t.dataset.di != null && t.dataset.df === 'active') ui.cf.dests[+t.dataset.di].active = t.value === '1'; });
  form.addEventListener('submit', e => {
    e.preventDefault();
    const g = s => $(s, form); const errs = []; const E = (el, msg) => errs.push({ el, msg });
    const code = parseNum(g('#cCode').value), name = g('#cName').value.trim();
    if (code == null) E(g('#cCode'), '得意先コードを入れてください'); else if (Number.isNaN(code) || !Number.isInteger(code) || code <= 0) E(g('#cCode'), '得意先コードは1以上の整数で入れてください');
    else if (S.customers.some(c => c.id !== id && Number(c.code) === code)) E(g('#cCode'), `コード ${code} はほかの得意先で使っています`);
    if (!name) E(g('#cName'), '得意先名を入れてください');
    const cv = g('#cClose').value;
    let cd = cv === 'none' ? null : cv === 'other' ? parseNum(g('#cCloseOther').value) : Number(cv);
    if (cv === 'other' && (cd == null || Number.isNaN(cd) || !Number.isInteger(cd) || cd < 1 || cd > 28)) E(g('#cCloseOther'), '1〜28 の数を入れてください（末日は「末日」を選びます）');
    const ob = parseNum(g('#cOpenBal').value); if (Number.isNaN(ob)) E(g('#cOpenBal'), '数字で入れてください');
    if (ob && !g('#cOpenDate').value) E(g('#cOpenDate'), '残高を入れたときは、その日付も入れてください');
    const billTo = g('#cBillTo').value || null;
    if (billTo && id && S.customers.some(x => x.billToId === id && x.id !== id)) E(g('#cBillTo'), 'ほかの得意先がこの得意先の請求書にまとめているので、この得意先をさらに別の請求書にはまとめられません');
    if (billTo && id && S.invoices.some(v => v.customerId === id && v.status !== 'cancelled' && S.deliveries.some(d => d.invoiceId === v.id))) { /* 作成済みの請求書はそのまま。これからの納品書だけが請求先へまとまる */ }
    ui.cf.dests.forEach((x, i) => { if (!String(x.name || '').trim()) E(g(`#dn${i}`), '送り先の名前を入れてください'); });
    const dcodes = ui.cf.dests.map(x => toHalf(x.code || '')).filter(Boolean);
    ui.cf.dests.forEach((x, i) => { const k = toHalf(x.code || ''); if (k && dcodes.indexOf(k) !== dcodes.lastIndexOf(k)) E(g(`#dc${i}`), `送り先コード ${k} が重なっています`); });
    if (!showErrors(form, errs)) return;
    const c0 = id ? custById(id) : null;
    const nc = g('#cNeedsCheck'); const needsCheck = nc ? (nc.checked ? (c0?.needsCheck || []) : []) : (c0?.needsCheck || []);
    const rec = { code, name, kana: g('#cKana').value.trim(), zip: g('#cZip').value.trim(), address: g('#cAddr').value.trim(), address2: g('#cAddr2').value.trim(), tel: g('#cTel').value.trim(), fax: g('#cFax').value.trim(), closingDay: cd, billToId: billTo, taxRounding: g('#cTaxR').value || null, payNote: g('#cPay').value.trim(), memo: g('#cMemo').value.trim(), opening: { date: g('#cOpenDate').value, balance: ob || 0 }, active: g('#cActive').value === '1', needsCheck, destinations: ui.cf.dests.map(x => ({ ...x, code: toHalf(x.code || ''), name: String(x.name).trim(), short: String(x.short || '').trim(), id: x.id || uid(), active: x.active !== false })), updatedAt: nowIso() };
    let c = c0;
    if (c) {
      const hasInv = activeInvoices(c.id).length;
      if (hasInv && Number(c.opening?.balance || 0) !== Number(rec.opening.balance)) { showErrors(form, [{ el: g('#cOpenBal'), msg: 'もう請求書を作ったので、開始時の残高は変えられません（変えるには請求書を取り消してください）' }]); return; }
      Object.assign(c, rec); logAction('得意先を直す', `${c.code} ${c.name}`, c.id);
    } else { c = { id: uid(), createdAt: nowIso(), ...rec }; S.customers.push(c); logAction('得意先を登録', `${c.code} ${c.name}（締日 ${c.closingDay == null ? 'なし' : closingLabel(c.closingDay)}）`, c.id); }
    ui.dirty = false; ui.cf = null; save(true); toast(id ? '得意先を直しました' : '得意先を登録しました'); go('#customers');
  });
}

/* ---------- 入金 ---------- */
ui.pl = { month: '', cust: '' };
function viewPayments() {
  const f = ui.pl;
  const list = S.payments.filter(p => (!f.month || p.date.startsWith(f.month)) && (!f.cust || p.customerId === f.cust)).sort((a, b) => a.date < b.date ? 1 : -1);
  const custs = sortCustomers(S.customers.filter(c => c.active || receivable(c).rest !== 0));
  return `
  <div class="page-head"><div><h1>入金</h1><p class="lead">得意先からの入金を登録します。次に作る請求書の「入金額」に入ります。</p></div></div>
  <form id="pForm" class="card stack" novalidate><h2>入金を登録する</h2>
    <div class="form-grid">
      ${fld('pDate', '入金日', dateIn('pDate', todayStr()), { req: true })}
      ${fld('pCust', '得意先', custSelect('pCust', f.cust), { req: true, hint: '<span id="pCustHint"></span>' })}
      ${fld('pAmt', '入金額（円）', numIn('pAmt', ''), { req: true, hint: '口座に入った額' })}
      ${fld('pFee', '振込手数料など（円）', numIn('pFee', ''), { opt: true, hint: '差し引かれた振込手数料・値引きなど。入金額と合わせて消し込みます' })}
      ${fld('pMethod', '種類', sel('pMethod', ['振込', '手形', '電子記録債権', '小切手', '現金', '相殺', 'その他'].map(x => [x, x]), '振込'), { req: true })}
      ${fld('pMemo', 'メモ', txt('pMemo', ''), { opt: true })}
    </div>
    <div class="actions"><button type="submit" class="btn primary">${icon('save')}入金を登録する</button></div>
  </form>
  <div class="card stack"><h2>得意先ごとの、まだ入金されていない額</h2>
    ${custs.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>得意先</th><th>最後の請求書</th><th class="num">その請求額</th><th class="num">その後の入金</th><th class="num">まだ入金されていない額</th></tr></thead><tbody>
    ${custs.map(c => { const r = receivable(c); return `<tr><td>${esc(c.name)}</td><td>${r.inv ? `<a href="#invoice-${r.inv.id}">No.${pad6(r.inv.no)}（${fmtDate(r.inv.closingDate)}締め）</a>` : (c.opening?.date ? `開始時の残高（${fmtDate(c.opening.date)}）` : '—')}</td><td class="num">${yen(r.base)}</td><td class="num">${yen(r.paid)}</td><td class="num"><b>${yen(r.rest)}</b></td></tr>`; }).join('')}
    </tbody></table></div><p class="small muted">まだ請求書に入っていない納品の分は含みません。</p>` : '<p class="muted">得意先がありません。</p>'}</div>
  <div class="card stack"><div class="card-head"><h2>入金の一覧</h2></div>
    <div class="form-grid">${fld('plMonth', '入金した月', sel('plMonth', [['', 'すべての月'], ...monthsOf(S.payments.map(p => p.date)).map(m => [m, monthLabel(m)])], f.month))}${fld('plCust', '得意先', custSelect('plCust', f.cust, { all: true, includeInactive: true }))}</div>
    ${list.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>入金日</th><th>得意先</th><th>種類</th><th class="num">入金額</th><th class="num">手数料など</th><th>請求書</th><th>メモ</th><th></th></tr></thead><tbody>
    ${list.map(p => { const inv = p.invoiceId ? S.invoices.find(v => v.id === p.invoiceId) : null; return `<tr class="${p.status === 'cancelled' ? 'is-cancel' : ''}"><td class="nowrap">${fmtDate(p.date)}</td><td>${esc(custName(p.customerId))}</td><td>${esc(p.method)}</td><td class="num strike">${yen(p.amount)}</td><td class="num strike">${yen(p.fee || 0)}</td>
      <td>${p.status === 'cancelled' ? chip('mute', 'ban', `取消：${p.cancelReason || ''}`) : inv ? `<a href="#invoice-${inv.id}">No.${pad6(inv.no)}</a>` : chip('info', 'circle-dashed', '次の請求書に入ります')}</td><td>${esc(p.memo || '')}</td>
      <td class="act">${p.status !== 'cancelled' && !p.invoiceId ? `<button type="button" class="btn text sm danger" data-act="cancelPayment" data-id="${p.id}">${icon('ban')}取り消す</button>` : ''}</td></tr>`; }).join('')}
    </tbody></table></div>` : `<div class="empty">${icon('landmark')}<p>入金はまだありません。</p></div>`}
  </div>`;
}
function bindPayments() {
  $('#plMonth').onchange = e => { ui.pl.month = e.target.value; render(); };
  $('#plCust').onchange = e => { ui.pl.cust = e.target.value; render(); };
  const hint = () => { const c = custById($('#pCust').value); $('#pCustHint').textContent = c ? `まだ入金されていない額：${yen(receivable(c).rest)}円` : ''; };
  $('#pCust').addEventListener('change', hint); hint();
  const form = $('#pForm');
  form.addEventListener('input', () => { ui.dirty = true; });
  form.addEventListener('submit', e => {
    e.preventDefault();
    const g = s => $(s, form); const errs = []; const E = (el, msg) => errs.push({ el, msg });
    const date = g('#pDate').value, cust = g('#pCust').value, amt = parseNum(g('#pAmt').value), fee = parseNum(g('#pFee').value);
    if (!date) E(g('#pDate'), '入金日を入れてください');
    if (!cust) E(g('#pCust'), '得意先を選んでください');
    if (amt == null) E(g('#pAmt'), '入金額を入れてください'); else if (Number.isNaN(amt) || !Number.isInteger(amt)) E(g('#pAmt'), '入金額は円単位の数字で入れてください');
    if (fee != null && (Number.isNaN(fee) || !Number.isInteger(fee))) E(g('#pFee'), '円単位の数字で入れてください');
    if (!showErrors(form, errs)) return;
    const p = { id: uid(), date, customerId: cust, amount: amt, fee: fee || 0, method: g('#pMethod').value, memo: g('#pMemo').value.trim(), status: 'active', invoiceId: null, createdAt: nowIso() };
    S.payments.push(p); logAction('入金を登録', `${custName(cust)} ${fmtDate(date)} ${yen(amt)}円${p.fee ? `（手数料など ${yen(p.fee)}円）` : ''}`, p.id);
    const later = latestInvoice(cust); ui.dirty = false; save(true);
    toast(later && later.closingDate >= date ? `入金を登録しました。${fmtDate(later.closingDate)}締めの請求書は作成済みのため、次の請求書に入ります` : '入金を登録しました');
    ui.pl.cust = cust; render();
  });
}
async function cancelPayment(id) {
  const p = S.payments.find(x => x.id === id); if (!p) return;
  if (p.invoiceId) { toast('請求書に入っている入金は取り消せません。先に請求書を取り消してください', 'circle-alert'); return; }
  const reason = await askReason({ title: '入金を取り消す', message: `${esc(custName(p.customerId))}　${fmtDate(p.date)}　${yen(p.amount)}円。取り消しても記録は残ります。`, okLabel: '取り消す' });
  if (!reason) return;
  p.status = 'cancelled'; p.cancelReason = reason; p.cancelledAt = nowIso();
  logAction('入金を取消', `${custName(p.customerId)} ${fmtDate(p.date)} ${yen(p.amount)}円　理由：${reason}`, p.id);
  await save(true); toast('入金を取り消しました'); render();
}

/* ---------- 得意先台帳 ---------- */
ui.lg = { cust: '', from: '', to: '' };
function ledgerData(cust, from, to) {
  // from より前の残高
  const od = cust.opening?.date || '';
  let bal = (od && od < from) ? Number(cust.opening.balance) || 0 : 0;
  const before = d => d < from && (!od || d > od);
  const ms = billMembers(cust);
  for (const d of S.deliveries) if (d.status !== 'cancelled' && ms.has(d.customerId) && before(d.date)) bal += deliveryTotals(d).partial;
  for (const v of S.invoices) if (v.status !== 'cancelled' && v.customerId === cust.id && before(v.closingDate)) bal += v.tax;
  for (const p of S.payments) if (p.status !== 'cancelled' && ms.has(p.customerId) && before(p.date)) bal -= (p.amount || 0) + (p.fee || 0);
  const ev = [];
  if (od && od >= from && od <= to) ev.push({ date: od, ord: 0, kind: 'open', amount: Number(cust.opening.balance) || 0 });
  for (const d of S.deliveries) if (d.status !== 'cancelled' && ms.has(d.customerId) && d.date >= from && d.date <= to && (!od || d.date > od)) d.lines.forEach((l, i) => ev.push({ date: d.date, ord: 1, kind: 'sale', d, l, i, amount: lineAmount(l) }));
  for (const v of S.invoices) if (v.status !== 'cancelled' && v.customerId === cust.id && v.closingDate >= from && v.closingDate <= to) ev.push({ date: v.closingDate, ord: 2, kind: 'tax', v, amount: v.tax });
  for (const p of S.payments) if (p.status !== 'cancelled' && ms.has(p.customerId) && p.date >= from && p.date <= to) ev.push({ date: p.date, ord: 3, kind: 'pay', p, amount: (p.amount || 0) + (p.fee || 0) });
  ev.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.ord - b.ord || ((a.d?.no || 0) - (b.d?.no || 0)) || (a.i || 0) - (b.i || 0));
  const start = bal; let sales = 0, recv = 0;
  for (const e of ev) {
    if (e.kind === 'open') bal = e.amount;
    else if (e.kind === 'pay') { bal -= e.amount; recv += e.amount; }
    else { bal += e.amount || 0; sales += e.amount || 0; }
    e.bal = bal;
  }
  return { start, ev, end: bal, sales, recv };
}
function ledgerDefaultRange(cust) {
  const t = todayStr(); const c = closingDateOf(cust, parseYmd(t).getFullYear(), parseYmd(t).getMonth() + 1);
  const to = c >= t ? c : closingDateOf(cust, ...(() => { const d = parseYmd(t); d.setMonth(d.getMonth() + 1, 1); return [d.getFullYear(), d.getMonth() + 1]; })());
  return { from: addDays(prevClosingDate(cust, to), 1), to };
}
function viewLedger() {
  const f = ui.lg; const custs = sortCustomers(S.customers);
  if (!f.cust && custs.length) f.cust = custs[0].id;
  const cust = custById(f.cust);
  if (cust && (!f.from || !f.to)) Object.assign(f, ledgerDefaultRange(cust));
  const L = cust ? ledgerData(cust, f.from, f.to) : null;
  return `
  <div class="page-head"><div><h1>得意先台帳</h1><p class="lead">得意先ごとの売上・消費税・入金と、差し引きの残高です。消費税は請求書を作った締め日に加わります。</p></div>
    ${cust ? `<div class="actions"><button type="button" class="btn" data-act="printLedger">${icon(canPrint() ? 'printer' : 'file-down')}台帳を${canPrint() ? '印刷・PDF' : 'PDFで保存'}</button></div>` : ''}</div>
  <div class="card stack"><div class="form-grid">
    ${fld('lgCust', '得意先', custSelect('lgCust', f.cust, { includeInactive: true }))}
    ${fld('lgFrom', 'いつから', dateIn('lgFrom', f.from))}
    ${fld('lgTo', 'いつまで', dateIn('lgTo', f.to))}
    <div class="field"><span class="label">期間を選ぶ</span><div class="row"><button type="button" class="btn sm" data-act="lgPeriod" data-v="0">今の締め期間</button><button type="button" class="btn sm" data-act="lgPeriod" data-v="-1">前の締め期間</button></div></div>
  </div></div>
  ${!cust ? `<div class="card empty">${icon('building-2')}<p>得意先がまだありません。</p></div>` : `
  <div class="tbl-wrap"><table class="tbl"><thead><tr><th>月日</th><th>品名</th><th class="num">数量（kg）</th><th class="num">単価</th><th class="num">売上金額</th><th class="num">受入金額</th><th class="num">差引残高</th><th>摘要</th></tr></thead><tbody>
    <tr><td></td><td>前からの繰越残高</td><td></td><td></td><td></td><td></td><td class="num">${yen(L.start)}</td><td></td></tr>
    ${L.ev.map(e => {
      if (e.kind === 'open') return `<tr><td class="nowrap">${fmtDate(e.date)}</td><td>開始時の残高</td><td></td><td></td><td></td><td></td><td class="num">${yen(e.bal)}</td><td></td></tr>`;
      if (e.kind === 'tax') return `<tr><td class="nowrap">${fmtDate(e.date)}</td><td>消費税（${e.v.rules.taxRate}%）<span class="sub">${fmtDate(e.v.closingDate)}締め 請求書 No.${pad6(e.v.no)}</span></td><td></td><td></td><td class="num">${yen(e.amount)}</td><td></td><td class="num">${yen(e.bal)}</td><td></td></tr>`;
      if (e.kind === 'pay') return `<tr><td class="nowrap">${fmtDate(e.date)}</td><td>入金（${esc(e.p.method)}）${e.p.fee ? `<span class="sub">うち手数料など ${yen(e.p.fee)}</span>` : ''}</td><td></td><td></td><td></td><td class="num">${yen(e.amount)}</td><td class="num">${yen(e.bal)}</td><td>${esc(e.p.memo || '')}</td></tr>`;
      const l = e.l;
      return `<tr><td class="nowrap">${e.i === 0 ? fmtDate(e.date) : ''}</td><td>${l.kind === 'other' ? esc(l.name) : `${esc(l.material)}${l.sizes.map(s => `<span class="sub tnum">${esc(sizeText(s))}　${fmtN(s.cases ?? 0)}-${fmtN(s.count)}</span>`).join('')}`}</td>
        <td class="num">${l.kind === 'other' ? `${fmtN(l.qty)}${esc(l.unit || '')}` : fmtKg(lineKg(l))}</td><td class="num">${fmtPrice(l.unitPrice)}</td><td class="num">${yen(e.amount)}</td><td></td><td class="num">${yen(e.bal)}</td>
        <td>${esc(l.note1 || '')}${l.note2 ? ` ${esc(l.note2)}` : ''}<span class="sub"><a href="#delivery-${e.d.id}">No.${pad6(e.d.no)}</a></span></td></tr>`;
    }).join('')}
  </tbody><tfoot><tr><td colspan="4">期間の合計</td><td class="num">${yen(L.sales)}</td><td class="num">${yen(L.recv)}</td><td class="num">${yen(L.end)}</td><td></td></tr></tfoot></table></div>`}`;
}
function bindLedger() {
  $('#lgCust').onchange = e => { ui.lg.cust = e.target.value; ui.lg.from = ''; ui.lg.to = ''; render(); };
  $('#lgFrom').onchange = e => { ui.lg.from = e.target.value; render(); };
  $('#lgTo').onchange = e => { ui.lg.to = e.target.value; render(); };
}
function ledgerPeriod(k) {
  const cust = custById(ui.lg.cust); if (!cust) return;
  let r = ledgerDefaultRange(cust);
  if (k === -1) { const to = prevClosingDate(cust, r.to); r = { from: addDays(prevClosingDate(cust, to), 1), to }; }
  Object.assign(ui.lg, r); render();
}

/* ---------- 設定・データ ---------- */
function viewSetup() {
  const C = S.company, R = S.rules, N = S.numbers;
  const maxNo = arr => Math.max(0, ...arr.map(x => Number(x) || 0));
  const logs = S.log.slice(-80).reverse();
  return `
  <div class="page-head"><div><h1>設定・データ</h1><p class="lead">会社の情報、伝票の番号、計算のきまり、バックアップです。</p></div></div>
  <div class="card stack"><h2>使っているデータ</h2>
    ${MODE === 'test' ? notice('warn', '<b>テストデータ（架空の取引先）を使っています。</b>本番のデータとは別に保存しています。試し終わったら、本番のデータに切り替えてください。') : notice('ok', '<b>本番のデータを使っています。</b>')}
    <div class="actions">${MODE === 'test' ? `<button type="button" class="btn" data-act="switchMode" data-v="main">${icon('database')}本番のデータに切り替える</button><button type="button" class="btn text" data-act="resetTest">${icon('rotate-ccw')}テストデータを作り直す</button>` : `<button type="button" class="btn" data-act="switchMode" data-v="test">${icon('database')}テストデータに切り替える（試すとき）</button>`}</div>
    <p class="small muted">保存先：この端末のブラウザの中（${storageKind === 'indexeddb' ? 'IndexedDB' : storageKind === 'localstorage' ? 'localStorage' : '保存できません'}）。ほかのパソコンやブラウザとは共有されません。ブラウザの「閲覧データの削除」をすると消えることがあるため、バックアップを書き出してください。</p>
  </div>
  <form id="sForm" class="stack" novalidate>
    <div class="card stack"><h2>会社の情報（帳票に出ます）</h2><div class="form-grid">
      ${fld('sName', '会社名', txt('sName', C.name), { req: true })}
      ${fld('sZip', '郵便番号', txt('sZip', C.zip), { opt: true })}
      ${fld('sAddr', '住所', txt('sAddr', C.address), { opt: true, cls: 'wide' })}
      ${fld('sTel', '電話番号', txt('sTel', C.tel), { opt: true })}
      ${fld('sFax', 'FAX', txt('sFax', C.fax), { opt: true })}
      ${fld('sReg', '登録番号（適格請求書発行事業者）', txt('sReg', C.regNo), { req: true, hint: 'T と13桁の数字' })}
      ${fld('sBank', '振込先（請求書に出ます）', `<textarea id="sBank">${esc(C.bank)}</textarea>`, { opt: true, cls: 'wide', hint: '1行に1つの口座' })}
    </div></div>
    <div class="card stack"><h2>伝票の番号（次に使う番号）</h2>
      ${!S.numbersConfirmed && MODE === 'main' ? notice('warn', '事務コンから移るときは、事務コンで最後に使った番号の次を入れてください。') : ''}
      <div class="form-grid">
      ${fld('sNoD', '納品書No.', numIn('sNoD', N.delivery), { req: true, hint: `いちばん大きい番号：${pad6(maxNo(S.deliveries.map(d => d.no)))}` })}
      ${fld('sNoK', '仮納品書No.', numIn('sNoK', N.kari), { req: true, hint: `いちばん大きい番号：${pad6(maxNo(S.deliveries.map(d => d.kariNo)))}` })}
      ${fld('sNoI', '請求書No.', numIn('sNoI', N.invoice), { req: true, hint: `いちばん大きい番号：${pad6(maxNo(S.invoices.map(v => v.no)))}` })}
    </div></div>
    <div class="card stack"><h2>計算のきまり</h2>
      <p class="small muted">初期値は、今の帳票（製作伝票・事務コンの画面・納品書・請求書）の数字で確かめた値です。変えると、まだ請求書に入っていない納品書の計算も変わります（作った請求書の額は変わりません）。</p>
      <div class="form-grid">
      ${fld('sTax', '消費税率（%）', numIn('sTax', R.taxRate), { req: true })}
      ${fld('sTaxR', '消費税の円未満', sel('sTaxR', Object.entries(ROUND_LABEL), R.taxRounding), { req: true, hint: '請求書の見本：308,990.6円 → 308,991円（四捨五入か切り上げ）' })}
      ${fld('sAmtR', '金額（数量×単価）の円未満', sel('sAmtR', Object.entries(ROUND_LABEL), R.amountRounding), { req: true, hint: '納品書の見本：15,847.8円 → 15,847円（切り捨て）' })}
      ${fld('sCoef', '重さの係数', numIn('sCoef', R.coef), { req: true, hint: '1mの重さ(kg)＝(外径−肉厚)×肉厚×係数。製作伝票の M単重 0.43138（18×11）で確認' })}
      ${fld('sUD', '1本の重さの小数の桁', sel('sUD', [[1, '1桁'], [2, '2桁'], [3, '3桁']], R.unitDigits), { req: true, hint: '事務コンの画面 10.09kg で確認（0.1kg 未満は5桁）' })}
      ${fld('sWD', '明細の重量の小数の桁', sel('sWD', [[0, '0桁'], [1, '1桁'], [2, '2桁']], R.weightDigits), { req: true, hint: '事務コンの画面 423.8kg で確認' })}
    </div></div>
    <div class="card stack"><h2>帳票の敬称</h2><div class="form-grid">
      ${fld('sHonD', '納品書', sel('sHonD', [['様', '様'], ['殿', '殿'], ['御中', '御中']], R.honorific.delivery))}
      ${fld('sHonK', '仮納品書', sel('sHonK', [['殿', '殿'], ['様', '様'], ['御中', '御中']], R.honorific.kari))}
      ${fld('sHonI', '請求書', sel('sHonI', [['殿', '殿'], ['様', '様'], ['御中', '御中']], R.honorific.invoice))}
    </div></div>
    <div class="card stack"><h2>品名（材質）の候補</h2>
      ${fld('sMat', '1行に1つ', `<textarea id="sMat" rows="6">${esc(S.materials.join('\n'))}</textarea>`, { opt: true, hint: '納品書・製作伝票の品名の候補に出ます。納品書で使った品名も自動で候補に出ます' })}
    </div>
    <div class="actions"><button type="submit" class="btn primary">${icon('save')}設定を保存する</button></div>
  </form>
  <div class="card stack"><h2>バックアップ</h2>
    <p>すべてのデータを1つのファイル（.json）に書き出します。月に1回以上と、請求書を作ったあとに書き出して、社内の共有フォルダなどに保管してください。</p>
    <div class="actions"><button type="button" class="btn" data-act="exportBackup">${icon('download')}バックアップを書き出す</button><button type="button" class="btn" data-act="importBackup">${icon('upload')}バックアップファイルから戻す</button><input type="file" id="importFile" accept=".json,application/json" hidden></div>
    <h3>この端末の中の自動バックアップ</h3>
    <p class="small muted">請求書を作る前・取り消す前などと、毎日の最初の保存のときに自動で取っています（最新の20件）。</p>
    <div id="snapList"><p class="muted">読み込んでいます…</p></div>
  </div>
  <div class="card stack"><h2>操作の履歴（新しい順・80件）</h2>
    ${logs.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>日時</th><th>操作</th><th>内容</th></tr></thead><tbody>${logs.map(x => `<tr><td class="nowrap">${fmtDateTime(x.at)}</td><td class="nowrap">${esc(x.action)}</td><td>${esc(x.summary)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">まだありません。</p>'}
  </div>
  <p class="small muted">請求システム 版 ${APP_VERSION}（データの形 ${DATA_VERSION}）</p>`;
}
async function bindSetup() {
  const form = $('#sForm');
  form.addEventListener('input', () => { ui.dirty = true; });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const g = s => $(s, form); const errs = []; const E = (el, msg) => errs.push({ el, msg });
    if (!g('#sName').value.trim()) E(g('#sName'), '会社名を入れてください');
    const reg = toHalf(g('#sReg').value).toUpperCase().replace(/[\s-]/g, '');
    if (!/^T\d{13}$/.test(reg)) E(g('#sReg'), 'T と13桁の数字で入れてください（例：T1234567890123）');
    const nums = {};
    for (const [k, sid, label, used] of [['delivery', '#sNoD', '納品書No.', S.deliveries.map(d => d.no)], ['kari', '#sNoK', '仮納品書No.', S.deliveries.map(d => d.kariNo).filter(Boolean)], ['invoice', '#sNoI', '請求書No.', S.invoices.map(v => v.no)]]) {
      const v = parseNum(g(sid).value); nums[k] = v;
      if (v == null || Number.isNaN(v) || !Number.isInteger(v) || v < 1) E(g(sid), `${label}は1以上の整数で入れてください`);
      else if (used.some(n => n >= v)) E(g(sid), `${label} ${pad6(Math.max(...used))} まで使っています。それより大きい番号を入れてください`);
    }
    const tax = parseNum(g('#sTax').value); if (tax == null || Number.isNaN(tax) || tax < 0 || tax > 30) E(g('#sTax'), '0〜30 の数で入れてください');
    const coef = parseNum(g('#sCoef').value); if (coef == null || Number.isNaN(coef) || coef <= 0 || coef > 0.1) E(g('#sCoef'), '0より大きく0.1以下の数で入れてください（アルミは 0.0085）');
    if (!showErrors(form, errs)) return;
    await snapshot('設定を変える前');
    Object.assign(S.company, { name: g('#sName').value.trim(), zip: g('#sZip').value.trim(), address: g('#sAddr').value.trim(), tel: g('#sTel').value.trim(), fax: g('#sFax').value.trim(), regNo: reg, bank: g('#sBank').value.trim() });
    Object.assign(S.numbers, nums); S.numbersConfirmed = true;
    Object.assign(S.rules, { taxRate: tax, taxRounding: g('#sTaxR').value, amountRounding: g('#sAmtR').value, coef, unitDigits: Number(g('#sUD').value), weightDigits: Number(g('#sWD').value) });
    S.rules.honorific = { delivery: g('#sHonD').value, kari: g('#sHonK').value, invoice: g('#sHonI').value };
    S.materials = [...new Set(g('#sMat').value.split('\n').map(x => toHalf(x)).filter(Boolean))];
    logAction('設定を変える', `番号：納品書 ${pad6(nums.delivery)}・仮納品書 ${pad6(nums.kari)}・請求書 ${pad6(nums.invoice)}、消費税 ${tax}%（${ROUND_LABEL[S.rules.taxRounding]}）、金額 ${ROUND_LABEL[S.rules.amountRounding]}、係数 ${coef}`);
    ui.dirty = false; await save(true); toast('設定を保存しました'); render();
  });
  $('#importFile').addEventListener('change', e => { const file = e.target.files[0]; e.target.value = ''; if (file) importBackupFile(file); });
  const snaps = (await listSnapshots()).slice().reverse();
  const box = $('#snapList'); if (!box) return;
  box.innerHTML = snaps.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>日時</th><th>いつ取ったか</th><th class="num">納品書</th><th class="num">請求書</th><th></th></tr></thead><tbody>
    ${snaps.map((s, i) => { let d = null; try { d = JSON.parse(s.data); } catch (e) { } return `<tr><td class="nowrap">${fmtDateTime(s.at)}</td><td>${esc(s.reason)}</td><td class="num">${d ? d.deliveries.length : '—'}</td><td class="num">${d ? d.invoices.length : '—'}</td><td class="act"><button type="button" class="btn sm" data-act="restoreSnap" data-at="${esc(s.at)}">${icon('rotate-ccw')}この時点に戻す</button></td></tr>`; }).join('')}
  </tbody></table></div>` : '<p class="muted">まだありません。</p>';
  drawIcons();
}
async function exportBackup() {
  const name = `請求システム_${MODE === 'test' ? 'テストデータ' : '本番'}_バックアップ_${stampName()}.json`;
  const ok = await saveFile(name, new Blob([JSON.stringify(S)], { type: 'application/json' }));
  if (ok) { logAction('バックアップを書き出す', name); save(); }
}
async function restoreData(d, label) {
  if (!validDataset(d)) { toast('このファイルは請求システムのバックアップではありません', 'circle-alert'); return; }
  const body = `<p>${esc(label)} の内容に戻します。今のデータは、戻す前に自動バックアップに残します（「この時点に戻す」で今の状態に戻せます）。</p>
    <dl class="kv"><dt>戻す内容</dt><dd>得意先 ${d.customers.length}社・納品書 ${d.deliveries.length}枚・請求書 ${d.invoices.length}件・入金 ${(d.payments || []).length}件</dd><dt>今の内容</dt><dd>得意先 ${S.customers.length}社・納品書 ${S.deliveries.length}枚・請求書 ${S.invoices.length}件・入金 ${S.payments.length}件</dd></dl>`;
  if (!(await confirmDialog({ title: 'データを戻す', body, okLabel: 'この内容に戻す', okIcon: 'rotate-ccw', danger: true }))) return;
  await snapshot(`${label} に戻す前`);
  S = migrate(d); S.kind = MODE;
  logAction('データを戻す', label);
  await save(true); toast('データを戻しました'); render();
}
function importBackupFile(file) {
  const r = new FileReader();
  r.onload = () => { let d = null; try { d = JSON.parse(r.result); } catch (e) { toast('ファイルを読めませんでした（JSONではありません）', 'circle-alert'); return; } restoreData(d, `バックアップファイル「${file.name}」`); };
  r.onerror = () => toast('ファイルを読めませんでした', 'circle-alert');
  r.readAsText(file);
}
async function restoreSnap(at) {
  const s = (await listSnapshots()).find(x => x.at === at); if (!s) { toast('そのバックアップが見つかりません', 'circle-alert'); return; }
  let d = null; try { d = JSON.parse(s.data); } catch (e) { toast('そのバックアップは読めません', 'circle-alert'); return; }
  restoreData(d, `${fmtDateTime(s.at)} の自動バックアップ`);
}
