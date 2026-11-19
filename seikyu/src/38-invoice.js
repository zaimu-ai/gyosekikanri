/* =========================================================
   請求書：締めて作る・一覧・詳細・取消
   ========================================================= */
ui.inv = { month: null, listMonth: '' };
function defaultInvoiceMonth() {
  const t = todayStr(); let best = null;
  for (const c of S.customers.filter(x => x.active && isBillingCustomer(x))) { const d = latestClosingOnOrBefore(c, t); if (!best || d > best) best = d; }
  return (best || t).slice(0, 7);
}
function monthOptions() {
  const t = parseYmd(todayStr()); const out = [];
  for (let k = 1; k >= -12; k--) { const d = new Date(t.getFullYear(), t.getMonth() + k, 1); out.push(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`); }
  return out;
}
function invoiceRowState(c, closingDate) {
  const t = todayStr();
  const existing = S.invoices.find(v => v.customerId === c.id && v.closingDate === closingDate && v.status !== 'cancelled');
  if (existing) return { kind: 'done', inv: existing };
  const later = latestInvoice(c.id);
  if (later && later.closingDate > closingDate) return { kind: 'later', inv: later };
  const dr = invoiceDraft(c, closingDate);
  if (closingDate > t) return { kind: 'before', dr };
  if (dr.missing.length) return { kind: 'missing', dr };
  if (dr.empty) return { kind: 'empty', dr };
  return { kind: 'ready', dr };
}
function viewInvoices() {
  const f = ui.inv; if (!f.month) f.month = defaultInvoiceMonth();
  const [y, m] = f.month.split('-').map(Number);
  const unbilled = c => { const ms = billMembers(c); return S.deliveries.some(d => ms.has(d.customerId) && !d.invoiceId && d.status !== 'cancelled'); };
  const custs = sortCustomers(S.customers.filter(c => isBillingCustomer(c) && (c.active || unbilled(c))));
  // 締日が決まっていない得意先の、まだ請求していない納品書（黙って外さず、知らせる）
  const noClose = S.customers.filter(c => c.closingDay == null && billToOf(c.id) === c.id && unbilled(c));
  const rows = custs.map(c => { const cd = closingDateOf(c, y, m); return { c, cd, st: invoiceRowState(c, cd) }; });
  const ready = rows.filter(r => r.st.kind === 'ready');
  const listM = f.listMonth;
  const invs = S.invoices.filter(v => !listM || v.closingDate.startsWith(listM)).sort((a, b) => b.no - a.no);
  const cell = (r) => {
    const s = r.st; const dr = s.dr;
    if (s.kind === 'done') { const v = s.inv; return `<td class="num">${yen(v.prevBilled)}</td><td class="num">${yen(v.received)}</td><td class="num">${yen(v.carry)}</td><td class="num">${yen(v.sales)}<span class="sub">${v.count}枚</span></td><td class="num">${yen(v.tax)}</td><td class="num"><b>${yen(v.total)}</b></td>`; }
    if (s.kind === 'later') return `<td colspan="6" class="muted">${fmtDateJ(s.inv.closingDate)}締めの請求書がもうあります</td>`;
    return `<td class="num">${yen(dr.prevBilled)}</td><td class="num">${yen(dr.received)}</td><td class="num">${yen(dr.carry)}</td><td class="num">${yen(dr.sales)}<span class="sub">${dr.count}枚${dr.older.length ? `（うち前の期間 ${dr.older.length}枚）` : ''}</span></td><td class="num">${yen(dr.tax)}</td><td class="num"><b>${yen(dr.total)}</b></td>`;
  };
  const stateChip = r => {
    const s = r.st;
    if (s.kind === 'done') return `${chip('ok', 'circle-check', '作成済み')}<span class="sub"><a href="#invoice-${s.inv.id}">No.${pad6(s.inv.no)}</a></span>`;
    if (s.kind === 'later') return chip('mute', 'circle-check', 'あとの請求書あり');
    if (s.kind === 'before') return chip('mute', 'clock', '締め日の前');
    if (s.kind === 'missing') return `${chip('warn', 'triangle-alert', '単価・重量が未入力')}<span class="sub">${s.dr.missing.map(d => `<a href="#delivery-${d.id}">No.${pad6(d.no)}</a>`).join('、')}</span>`;
    if (s.kind === 'empty') return chip('mute', 'circle-dashed', '対象なし');
    return chip('info', 'file-text', '作れます');
  };
  return `
  <div class="page-head"><div><h1>請求書</h1><p class="lead">締め日までの納品書と入金をまとめて、合計請求書を作ります。作った請求書に入った納品書は直せなくなります。</p></div></div>
  <div class="card stack">
    <div class="card-head"><h2>締めて請求書を作る</h2>
      <div class="field" style="min-width:220px">${'<label for="invMonth">締め日の年月</label>'}${sel('invMonth', monthOptions().map(x => [x, monthLabel(x)]), f.month)}</div></div>
    ${noClose.length ? notice('warn', `<b>締日が決まっていない得意先に、まだ請求していない納品書があります。</b>得意先の画面で締日（または請求先）を入れると、ここに出ます：${noClose.map(c => `<a href="#customer-${c.id}">${esc(c.code)} ${esc(c.name)}</a>`).join('、')}`) : ''}
    ${rows.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th class="check-cell">選ぶ</th><th>得意先</th><th>締め日</th><th class="num">前回請求額</th><th class="num">入金額</th><th class="num">繰越額</th><th class="num">今回の売上（税抜）</th><th class="num">消費税</th><th class="num">今回請求額</th><th>状態</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td class="check-cell">${r.st.kind === 'ready' ? `<label class="check"><input type="checkbox" class="invPick" value="${r.c.id}" data-cd="${r.cd}" checked aria-label="${esc(r.c.name)} を選ぶ"></label>` : ''}</td>
        <td class="name">${esc(r.c.name)}<span class="sub">コード ${esc(r.c.code)}・締日 ${closingLabel(r.c.closingDay)}${r.c.taxRounding ? `・消費税 ${ROUND_LABEL[r.c.taxRounding]}` : ''}</span>${billMembers(r.c).size > 1 ? `<span class="sub">${icon('git-merge')}まとめる得意先：${[...billMembers(r.c)].filter(id => id !== r.c.id).map(id => esc(custById(id)?.code + ' ' + custName(id))).join('、')}</span>` : ''}</td><td class="nowrap">${fmtDate(r.cd)}</td>${cell(r)}<td>${stateChip(r)}</td></tr>`).join('')}
      </tbody></table></div>` : `<div class="empty">${icon('building-2')}<p>得意先がまだありません。</p><a class="btn" href="#customer-new">得意先を登録する</a></div>`}
    <p class="small muted">繰越額＝前回請求額−入金額（振込手数料などを含む）。今回請求額＝繰越額＋今回の売上＋消費税。消費税は請求書ごとに、税抜の合計×${S.rules.taxRate}%（円未満は${ROUND_LABEL[S.rules.taxRounding]}。得意先ごとに決めているときはその方法）で計算します。</p>
    <div class="actions"><button type="button" class="btn primary" data-act="createInvoices">${icon('file-text')}選んだ得意先の請求書を作る</button><span class="small muted">${ready.length ? `この締め日で作れるのは ${ready.length} 件です。` : 'この締め日で、今作れる請求書はありません。'}</span></div>
  </div>
  <div class="card stack">
    <div class="card-head"><h2>作った請求書</h2>
      <div class="field" style="min-width:220px"><label for="invListMonth">締め日の年月</label>${sel('invListMonth', [['', 'すべて'], ...monthsOf(S.invoices.map(v => v.closingDate)).map(x => [x, monthLabel(x)])], listM)}</div></div>
    ${invs.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>No.</th><th>締め日</th><th>得意先</th><th class="num">今回の売上（税抜）</th><th class="num">消費税</th><th class="num">今回請求額</th><th>状態</th></tr></thead><tbody>
      ${invs.map(v => `<tr class="clickable${v.status === 'cancelled' ? ' is-cancel' : ''}" data-href="#invoice-${v.id}"><td class="tnum"><a href="#invoice-${v.id}">${pad6(v.no)}</a></td><td class="nowrap">${fmtDate(v.closingDate)}</td><td class="name">${esc(custName(v.customerId))}</td><td class="num strike">${yen(v.sales)}</td><td class="num strike">${yen(v.tax)}</td><td class="num strike">${yen(v.total)}</td><td>${v.status === 'cancelled' ? chip('mute', 'ban', '取消') : v.printedAt ? chip('ok', 'circle-check', '発行済み') : chip('info', 'circle-dashed', 'まだ印刷していない')}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="actions"><button type="button" class="btn" data-act="printInvoicesBulk">${icon(canPrint() ? 'printer' : 'file-down')}まだ印刷していない請求書をまとめて${canPrint() ? '印刷・PDF' : 'PDFで保存'}</button></div>` : `<div class="empty">${icon('file-text')}<p>まだ請求書はありません。</p></div>`}
  </div>`;
}
function bindInvoices() {
  $('#invMonth').onchange = e => { ui.inv.month = e.target.value; render(); };
  $('#invListMonth').onchange = e => { ui.inv.listMonth = e.target.value; render(); };
}
async function createInvoices() {
  const picks = $$('.invPick:checked').map(x => ({ c: custById(x.value), cd: x.dataset.cd }));
  if (!picks.length) { showErrors($('#view'), [{ el: $('.invPick') || $('[data-act=createInvoices]'), msg: $('.invPick') ? '請求書を作る得意先を選んでください' : '今、請求書を作れる得意先はありません（状態の欄を見てください）' }]); return; }
  const drafts = picks.map(p => invoiceDraft(p.c, p.cd)).filter(d => !d.blocked && !d.missing.length);
  const body = `<p>次の ${drafts.length} 件の請求書を作ります。作ると、入った納品書は直せなくなります（請求書を取り消せば直せます）。</p>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>得意先</th><th>締め日</th><th class="num">納品書</th><th class="num">今回請求額</th></tr></thead><tbody>
    ${drafts.map(d => `<tr><td>${esc(d.cust.name)}</td><td>${fmtDate(d.closingDate)}</td><td class="num">${d.count}枚</td><td class="num">${yen(d.total)}</td></tr>`).join('')}</tbody></table></div>`;
  if (!(await confirmDialog({ title: '請求書を作る', body, okLabel: `${drafts.length}件の請求書を作る`, okIcon: 'file-text' }))) return;
  await snapshot('請求書を作る前');
  const made = [];
  for (const d of drafts) {
    const inv = {
      id: uid(), no: S.numbers.invoice, customerId: d.cust.id, closingDate: d.closingDate, issueDate: d.closingDate, periodFrom: d.periodFrom, periodTo: d.periodTo,
      prevBilled: d.prevBilled, received: d.received, carry: d.carry, sales: d.sales, tax: d.tax, total: d.total, count: d.count,
      deliveryIds: d.dels.map(x => x.id), paymentIds: d.pays.map(x => x.id), rules: { taxRate: S.rules.taxRate, taxRounding: d.taxRounding }, memberIds: [...d.members],
      status: 'issued', createdAt: nowIso(), printedAt: null,
    };
    if (S.invoices.some(v => v.no === inv.no)) { toast(`請求書No.${pad6(inv.no)} はもう使われています。「設定・データ」で次の番号を確かめてください`, 'circle-alert'); break; }
    S.numbers.invoice += 1;
    for (const x of d.dels) x.invoiceId = inv.id;
    for (const p of d.pays) p.invoiceId = inv.id;
    S.invoices.push(inv); made.push(inv);
    logAction('請求書を作成', `No.${pad6(inv.no)} ${d.cust.name} ${fmtDate(d.closingDate)}締め 今回請求額 ${yen(inv.total)}円（納品書 ${inv.count}枚）`, inv.id);
  }
  await save(true);
  toast(`請求書を ${made.length} 件作りました`);
  render();
  if (made.length) openPrintInvoices(made.map(v => v.id));
}
function viewInvoiceDetail(id) {
  const v = S.invoices.find(x => x.id === id); if (!v) return notFound('請求書');
  const c = custById(v.customerId);
  const dels = v.deliveryIds.map(x => S.deliveries.find(d => d.id === x)).filter(Boolean);
  const pays = (v.paymentIds || []).map(x => S.payments.find(p => p.id === x)).filter(Boolean);
  const isLatest = latestInvoice(v.customerId)?.id === v.id;
  return `${backLink('#invoices', '請求書')}
  <div class="page-head"><div><h1>請求書 No.${pad6(v.no)}</h1><p class="lead">${v.status === 'cancelled' ? chip('mute', 'ban', '取消') : v.printedAt ? chip('ok', 'circle-check', `発行済み（${fmtDateTime(v.printedAt)}）`) : chip('info', 'circle-dashed', 'まだ印刷していません')}</p></div>
    <div class="actions">${v.status !== 'cancelled' ? `<button type="button" class="btn primary" data-act="printInvoice" data-id="${v.id}">${icon(canPrint() ? 'printer' : 'file-down')}請求書を${canPrint() ? '印刷・PDF' : 'PDFで保存'}</button>` : ''}</div></div>
  ${v.status === 'cancelled' ? notice('warn', `この請求書は取り消しました（${fmtDateTime(v.cancelledAt)}）。理由：${esc(v.cancelReason || '')}`) : ''}
  <div class="card"><dl class="kv">
    <dt>得意先</dt><dd>${c ? `<a href="#customer-${c.id}">${esc(c.code)}　${esc(c.name)}</a>` : '—'}</dd>
    <dt>締め日</dt><dd>${fmtDateJ(v.closingDate)}（対象：${fmtDate(v.periodFrom)}〜${fmtDate(v.periodTo)}）</dd>
    <dt>前回請求額</dt><dd class="tnum">${yen(v.prevBilled)}円</dd>
    <dt>入金額</dt><dd class="tnum">${yen(v.received)}円</dd>
    <dt>繰越額</dt><dd class="tnum">${yen(v.carry)}円</dd>
    <dt>今回の売上（税抜）</dt><dd class="tnum">${yen(v.sales)}円（納品書 ${v.count}枚、${v.rules.taxRate}%対象）</dd>
    <dt>消費税</dt><dd class="tnum">${yen(v.tax)}円（円未満${ROUND_LABEL[v.rules.taxRounding]}）</dd>
    <dt>今回請求額</dt><dd class="tnum"><b>${yen(v.total)}円</b></dd>
  </dl></div>
  <div class="card"><h2>入った納品書</h2>${dels.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>納品日</th><th>No.</th><th>品名</th><th class="num">重量（kg）</th><th class="num">金額（税抜）</th></tr></thead><tbody>
    ${dels.map(d => { const t = deliveryTotals(d); return `<tr class="clickable" data-href="#delivery-${d.id}"><td>${fmtDate(d.date)}</td><td><a href="#delivery-${d.id}">${pad6(d.no)}</a></td><td>${esc(lineTitle(d.lines[0] || { kind: 'other', name: '' }))}${d.lines.length > 1 ? `<span class="sub">ほか ${d.lines.length - 1} 行</span>` : ''}</td><td class="num">${fmtKg(t.kg)}</td><td class="num">${yen(t.amount)}</td></tr>`; }).join('')}
    </tbody></table></div>` : '<p class="muted">この期間の納品書はありません。</p>'}</div>
  ${pays.length ? `<div class="card"><h2>入った入金</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>入金日</th><th>種類</th><th class="num">入金額</th><th class="num">手数料など</th><th>メモ</th></tr></thead><tbody>
    ${pays.map(p => `<tr><td>${fmtDate(p.date)}</td><td>${esc(p.method)}</td><td class="num">${yen(p.amount)}</td><td class="num">${yen(p.fee || 0)}</td><td>${esc(p.memo || '')}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
  ${v.status !== 'cancelled' ? `<div class="actions">${isLatest ? `<button type="button" class="btn text danger" data-act="cancelInvoice" data-id="${v.id}">${icon('ban')}この請求書を取り消す</button>` : `<p class="small muted">${icon('info')} この得意先には、これよりあとの請求書があります。取り消すときは、新しい請求書から順に取り消してください。</p>`}</div>` : ''}`;
}
async function cancelInvoice(id) {
  const v = S.invoices.find(x => x.id === id); if (!v) return;
  if (latestInvoice(v.customerId)?.id !== v.id) { toast('新しい請求書から順に取り消してください', 'circle-alert'); return; }
  const reason = await askReason({ title: `請求書 No.${pad6(v.no)} を取り消す`, message: '取り消しても記録は残ります。入っていた納品書と入金は「まだ請求していない」状態に戻り、直せるようになります。', okLabel: '取り消す' });
  if (!reason) return;
  await snapshot(`請求書 No.${pad6(v.no)} の取消の前`);
  for (const d of S.deliveries) if (d.invoiceId === v.id) d.invoiceId = null;
  for (const p of S.payments) if (p.invoiceId === v.id) p.invoiceId = null;
  v.status = 'cancelled'; v.cancelReason = reason; v.cancelledAt = nowIso();
  logAction('請求書を取消', `No.${pad6(v.no)} ${custName(v.customerId)} ${fmtDate(v.closingDate)}締め　理由：${reason}`, v.id);
  await save(true); toast(`請求書 No.${pad6(v.no)} を取り消しました`); render();
}
