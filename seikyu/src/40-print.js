/* =========================================================
   帳票（A4）：納品書・仮納品書・請求書・得意先台帳
   印刷はブラウザの印刷機能。claude.ai の中では印刷できないため PDF で保存する。
   ========================================================= */
const HALF_ROWS = 9;            // 納品書：A4の半分に入る行の数
const KARI_ROWS = 8;            // 仮納品書：A4の半分に入る行の数（あいさつ文と会社名の分だけ少ない）
const INV_FIRST_ROWS = 20, INV_NEXT_ROWS = 40, LEDGER_ROWS = 38;
function chunk(arr, first, next) {
  const out = []; let i = 0; const n0 = Math.max(first, 1);
  out.push(arr.slice(0, n0)); i = n0;
  while (i < arr.length) { out.push(arr.slice(i, i + next)); i += next; }
  return out;
}
const companyBlock = (C, { reg = true } = {}) => `<div class="doc-from">${reg && C.regNo ? `<div><b>登録番号 ${esc(C.regNo)}</b></div>` : ''}<div>〒${esc(C.zip)} ${esc(C.address)}</div><div class="nm">${esc(C.name)}</div><div>TEL ${esc(C.tel)}${C.fax ? `　FAX ${esc(C.fax)}` : ''}</div></div>`;
const jpDate = s => { const d = parseYmd(s); return d ? `${d.getFullYear()}年 ${d.getMonth() + 1}月 ${d.getDate()}日` : ''; };

/** 納品書の行（寸法ごとに1行。金額は最初の行に） */
function deliveryRows(d) {
  const rows = [];
  for (const l of d.lines) {
    if (l.kind === 'other') { rows.push({ mat: '', sz: l.name, cs: '', kg: `${fmtN(l.qty)}${l.unit ? ' ' + l.unit : ''}`, price: fmtPrice(l.unitPrice), amt: yen(lineAmount(l)), note: [l.note1, l.note2].filter(Boolean).join(' '), l }); continue; }
    l.sizes.forEach((s, j) => rows.push({
      mat: j === 0 ? l.material : '', sz: sizeText(s).replace(/×/g, 'X'), cs: `${fmtN(s.cases ?? 0)} - ${fmtN(s.count)}`,
      kg: j === 0 ? fmtKg(lineKg(l)) : '', price: j === 0 ? (l.unitPrice == null ? '' : `${fmtPrice(l.unitPrice)}${l.priceBasis === 'pc' ? '/本' : ''}`) : '', amt: j === 0 ? (lineAmount(l) == null ? '' : yen(lineAmount(l))) : '',
      note: j === 0 ? [l.note1, l.note2].filter(Boolean).join(' ') : '', l,
    }));
  }
  return rows;
}
function deliverySheets(d, copyLabel, title = '納 品 書') {
  const C = S.company, cust = custById(d.customerId), ds = destOf(d), t = deliveryTotals(d);
  const rows = deliveryRows(d); const pages = chunk(rows, HALF_ROWS, HALF_ROWS);
  const isReceipt = title.startsWith('受');
  return pages.map((pr, pi) => {
    const last = pi === pages.length - 1;
    const pad = Array.from({ length: HALF_ROWS - pr.length }, () => ({}));
    return `<div class="half">
      <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:end"><div></div><div class="doc-title">${title}</div><div class="doc-no">${copyLabel ? `<span class="copy-label">${esc(copyLabel)}</span>　` : ''}No.${pad6(d.no)}</div></div>
      <div class="doc-head">
        <div style="display:grid;gap:1.2mm">
          <div class="doc-to"><span>${esc(cust?.name || '')}</span><span class="hon">${esc(S.rules.honorific.delivery)}</span></div>
          ${ds ? `<div style="font-size:8.5pt">送り先：${esc(ds.name)}</div>` : ''}
          <div class="doc-date">${jpDate(d.date)}</div>
          <div class="doc-msg">${isReceipt ? '下記のとおり受領いたしました' : '下記のとおり納品いたしました'}</div>
        </div>
        ${companyBlock(C)}
      </div>
      <table class="dt"><colgroup><col style="width:56mm"><col style="width:20mm"><col style="width:19mm"><col style="width:16mm"><col style="width:24mm"><col></colgroup>
        <thead><tr><th>品　　　名</th><th>ケース-本数</th><th>数量（kg）</th><th>単価</th><th>金　額</th><th>摘　要</th></tr></thead>
        <tbody>${pr.map(r => `<tr><td>${r.mat ? `<span class="mat">${esc(r.mat)}</span>` : ''}<span class="sz">${esc(r.sz || '')}</span></td><td class="c">${esc(r.cs || '')}</td><td class="n">${esc(r.kg || '')}</td><td class="n">${esc(r.price || '')}</td><td class="n">${esc(r.amt || '')}</td><td style="font-size:8pt">${esc(r.note || '')}</td></tr>`).join('')}
          ${pad.map(() => '<tr><td></td><td></td><td></td><td></td><td></td><td></td></tr>').join('')}
          <tr class="tot"><td>${last ? '合　　　計' : '（次のページへ続く）'}</td><td class="c">${last ? `${fmtN(t.cases)} - ${fmtN(t.count)}` : ''}</td><td class="n">${last ? fmtKg(roundTo(t.kg, 1)) : ''}</td><td></td><td class="n">${last ? (t.amount == null ? '未入力あり' : `¥${yen(t.amount)}`) : ''}</td><td></td></tr></tbody></table>
      <div class="doc-foot"><span>消費税抜き金額です。消費税は請求書でまとめて計算します。</span>${isReceipt ? '' : ''}<span>${pages.length > 1 ? `${pi + 1} / ${pages.length}` : ''}</span></div>
      ${isReceipt && last ? `<div style="display:flex;justify-content:flex-end;margin-top:1mm"><div class="stamp-box">受領印</div></div>` : ''}
    </div>`;
  });
}
function kariSheets(d, copyLabel, showAmount) {
  const C = S.company, cust = custById(d.customerId), ds = destOf(d), t = deliveryTotals(d);
  const rows = [];
  for (const l of d.lines) {
    if (l.kind === 'other') { if (showAmount) rows.push({ ord: '', mat: '', sz: l.name, cnt: '', kg: `${fmtN(l.qty)}${l.unit ? ' ' + l.unit : ''}`, note: [l.note1, l.note2].filter(Boolean).join(' '), price: fmtPrice(l.unitPrice), amt: yen(lineAmount(l)) }); continue; }
    const o = l.orderId ? S.orders.find(x => x.id === l.orderId) : null;
    l.sizes.forEach((s, j) => rows.push({ ord: j === 0 ? (o?.orderNo || '') : '', mat: j === 0 ? l.material : '', sz: sizeText(s).replace(/×/g, 'X'), cnt: `${fmtN(s.count)}本`, kg: j === 0 ? `${fmtKg(lineKg(l))} Kg` : '', note: `${s.cases ? `${fmtN(s.cases)}束` : ''}${j === 0 && l.note2 ? ` ${l.note2}` : ''}`, price: j === 0 && l.unitPrice != null ? fmtPrice(l.unitPrice) : '', amt: j === 0 && lineAmount(l) != null ? yen(lineAmount(l)) : '' }));
  }
  const pages = chunk(rows, KARI_ROWS, KARI_ROWS);
  return pages.map((pr, pi) => {
    const last = pi === pages.length - 1; const pad = Array.from({ length: KARI_ROWS - pr.length }, () => ({}));
    return `<div class="half">
      <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:end"><div class="doc-date">年月日　${fmtDate(d.date).replace(/\//g, '.')}</div><div class="doc-title">${copyLabel === '受領書' ? '受 領 書' : '仮 納 品 書'}</div><div class="doc-no">${copyLabel && copyLabel !== '受領書' ? `<span class="copy-label">${esc(copyLabel)}</span>　` : ''}No.${pad6(d.kariNo || 0)}</div></div>
      <div class="doc-head">
        <div style="display:grid;gap:1.5mm">
          <div class="doc-to"><span><span style="font-size:8.5pt;font-weight:400">依頼主　</span>${esc(cust?.name || '')}</span><span class="hon">${esc(S.rules.honorific.kari)}</span></div>
          <div class="doc-to"><span><span style="font-size:8.5pt;font-weight:400">お届先　</span>${esc(ds ? ds.name : cust?.name || '')}</span><span class="hon">${esc(S.rules.honorific.kari)}</span></div>
        </div>
        <div style="font-size:8.5pt;max-width:80mm">${copyLabel === '受領書' ? '下記の品物を受領いたしました。' : '毎度御引立に預り有難う御座います。<br>下記の通り納品致しますから御査収下さい。<br>尚本書は本納品書発行迄御保存願います。'}</div>
      </div>
      <table class="dt"><colgroup>${showAmount ? '<col style="width:20mm"><col style="width:56mm"><col style="width:16mm"><col style="width:21mm"><col style="width:16mm"><col style="width:22mm"><col>' : '<col style="width:24mm"><col style="width:66mm"><col style="width:20mm"><col style="width:26mm"><col>'}</colgroup>
        <thead><tr><th>注文番号</th><th>品　　名</th><th>員数</th><th>数量</th>${showAmount ? '<th>単価</th><th>金額</th>' : ''}<th>摘　要</th></tr></thead>
        <tbody>${pr.map(r => `<tr><td>${esc(r.ord || '')}</td><td>${r.mat ? `<span class="mat">${esc(r.mat)}</span>` : ''}<span class="sz">${esc(r.sz || '')}</span></td><td class="n">${esc(r.cnt || '')}</td><td class="n">${esc(r.kg || '')}</td>${showAmount ? `<td class="n">${esc(r.price || '')}</td><td class="n">${esc(r.amt || '')}</td>` : ''}<td>${esc(r.note || '')}</td></tr>`).join('')}
          ${pad.map(() => `<tr><td></td><td></td><td></td><td></td>${showAmount ? '<td></td><td></td>' : ''}<td></td></tr>`).join('')}
          <tr class="tot"><td></td><td>${last ? '合　　計' : '（次のページへ続く）'}</td><td class="n">${last ? `${fmtN(t.count)}本` : ''}</td><td class="n">${last ? `${fmtKg(roundTo(t.kg, 1))} Kg` : ''}</td>${showAmount ? `<td></td><td class="n">${last && t.amount != null ? `¥${yen(t.amount)}` : ''}</td>` : ''}<td>${last ? `${fmtN(t.cases)}束` : ''}</td></tr></tbody></table>
      <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:1.5mm;gap:6mm">
        <div style="font-size:8pt">${showAmount ? '消費税抜き金額です。' : ''}${pages.length > 1 ? `　${pi + 1} / ${pages.length}` : ''}</div>
        ${copyLabel === '受領書' && last ? '<div class="stamp-box">受領印</div>' : ''}
        ${companyBlock(C, { reg: false })}
      </div>
    </div>`;
  });
}
/** 半分の大きさの帳票を、A4に2つずつ並べる */
function packHalves(halves) {
  const pages = [];
  for (let i = 0; i < halves.length; i += 2) pages.push(`<div class="page">${halves[i]}${halves[i + 1] || ''}</div>`);
  return pages.join('');
}

function invoicePages(v, copyLabel) {
  const C = S.company, cust = custById(v.customerId);
  const dels = v.deliveryIds.map(id => S.deliveries.find(d => d.id === id)).filter(Boolean);
  const rows = [];
  for (const d of dels) d.lines.forEach((l, i) => rows.push({ date: i === 0 ? fmtMD(d.date) : '', no: i === 0 ? pad6(d.no) : '', name: l.kind === 'other' ? l.name : `${l.material}　${l.sizes.map(s => sizeText(s).replace(/×/g, 'X')).join(' / ')}`, qty: l.kind === 'other' ? `${fmtN(l.qty)}${l.unit || ''}` : `${fmtKg(lineKg(l))}kg`, price: fmtPrice(l.unitPrice), amt: yen(lineAmount(l)), note: [l.note1, l.note2].filter(Boolean).join(' ') }));
  const pages = chunk(rows, INV_FIRST_ROWS, INV_NEXT_ROWS);
  const bank = String(C.bank || '').split('\n').filter(Boolean);
  const detailTable = (pr, last) => `<table class="dt compact" style="margin-top:3mm"><colgroup><col style="width:12mm"><col style="width:16mm"><col style="width:72mm"><col style="width:20mm"><col style="width:14mm"><col style="width:22mm"><col></colgroup>
    <thead><tr><th>月日</th><th>伝票No.</th><th>品名</th><th>数量</th><th>単価</th><th>金額</th><th>摘要</th></tr></thead>
    <tbody>${pr.map(r => `<tr style="height:auto"><td class="c" style="height:5.6mm">${esc(r.date)}</td><td class="c">${esc(r.no)}</td><td style="font-size:8pt;white-space:nowrap;overflow:hidden">${esc(r.name)}</td><td class="n">${esc(r.qty)}</td><td class="n">${esc(r.price)}</td><td class="n">${esc(r.amt)}</td><td style="font-size:7.5pt;white-space:nowrap;overflow:hidden">${esc(r.note)}</td></tr>`).join('')}
    ${last ? `<tr class="tot"><td colspan="5">${v.rules.taxRate}%対象　合計（税抜）</td><td class="n">${yen(v.sales)}</td><td></td></tr><tr class="tot"><td colspan="5">消費税（${v.rules.taxRate}%）</td><td class="n">${yen(v.tax)}</td><td></td></tr>` : '<tr class="tot"><td colspan="7">（次のページへ続く）</td></tr>'}</tbody></table>`;
  return pages.map((pr, pi) => {
    const last = pi === pages.length - 1;
    if (pi > 0) return `<div class="page"><div style="display:flex;justify-content:space-between;font-size:9pt"><span>${esc(cust?.name || '')} ${esc(S.rules.honorific.invoice)}　請求書 No.${pad6(v.no)} の明細（続き）</span><span>${esc(C.name)}</span></div>${detailTable(pr, last)}<div class="page-num">${pi + 1} / ${pages.length}</div></div>`;
    return `<div class="page">
      <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:end"><div class="doc-no" style="text-align:left">No.${pad6(v.no)}</div><div class="doc-title" style="font-size:20pt">請 求 書</div><div class="doc-no">${copyLabel ? `<span class="copy-label">${esc(copyLabel)}</span>` : ''}</div></div>
      <div style="text-align:right;margin-top:2mm" class="doc-date">${jpDate(v.issueDate || v.closingDate)}</div>
      <div class="doc-head" style="margin-top:1mm">
        <div style="display:grid;gap:3mm;align-content:start">
          <div class="doc-to" style="font-size:14pt"><span>${esc(cust?.name || '')}</span><span class="hon">${esc(S.rules.honorific.invoice)}</span></div>
          <div class="total-box">合計金額　¥${yen(v.total)}</div>
          <div style="font-size:8.5pt">対象期間：${fmtDate(v.periodFrom)}〜${fmtDate(v.periodTo)}（${fmtDateJ(v.closingDate)}締め）</div>
        </div>
        ${companyBlock(C)}
      </div>
      <table class="sum-tbl"><colgroup><col style="width:58mm"><col style="width:22mm"><col style="width:42mm"><col></colgroup>
        <thead><tr><th>摘　　要</th><th>伝票枚数</th><th>金　　額</th><th>備　　考</th></tr></thead>
        <tbody>
          <tr><td>前回御請求額</td><td></td><td class="n">${yen(v.prevBilled)}</td><td></td></tr>
          <tr><td>御入金額</td><td></td><td class="n">${yen(v.received)}</td><td style="font-size:8.5pt">${v.received ? '振込手数料などを含みます' : ''}</td></tr>
          <tr><td>繰越残高</td><td></td><td class="n">${yen(v.carry)}</td><td></td></tr>
          <tr><td>当月分御買上額（税抜）</td><td class="n">${v.count}</td><td class="n">${yen(v.sales)}</td><td>${v.rules.taxRate}%対象</td></tr>
          <tr><td>消費税</td><td></td><td class="n">${yen(v.tax)}</td><td>（${v.rules.taxRate}%）</td></tr>
          <tr><td><b>合　　計（今回御請求額）</b></td><td></td><td class="n"><b>${yen(v.total)}</b></td><td></td></tr>
        </tbody></table>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6mm;margin-top:2mm">
        <div style="font-size:12pt;font-weight:700">上記の通り御請求申し上げます</div>
        ${bank.length ? `<div style="font-size:8.5pt;text-align:right">振込先　${bank.map(esc).join('<br>')}</div>` : ''}
      </div>
      <div style="margin-top:3mm;font-size:10pt;font-weight:700">御買上明細</div>
      ${pr.length ? detailTable(pr, last) : '<p style="font-size:9pt;margin-top:2mm">この期間の御買上はありません。</p>'}
      <div class="page-num">${pages.length > 1 ? `${pi + 1} / ${pages.length}` : ''}</div>
    </div>`;
  });
}
function ledgerPages(cust, from, to) {
  const L = ledgerData(cust, from, to);
  const rows = [{ name: '前からの繰越残高', bal: yen(L.start) }];
  for (const e of L.ev) {
    if (e.kind === 'open') rows.push({ date: fmtMD(e.date), name: '開始時の残高', bal: yen(e.bal) });
    else if (e.kind === 'tax') rows.push({ date: fmtMD(e.date), name: `消費税（${e.v.rules.taxRate}%）請求書No.${pad6(e.v.no)}`, sale: yen(e.amount), bal: yen(e.bal) });
    else if (e.kind === 'pay') rows.push({ date: fmtMD(e.date), name: `入金（${e.p.method}）${e.p.fee ? ` うち手数料など ${yen(e.p.fee)}` : ''}`, recv: yen(e.amount), bal: yen(e.bal), note: e.p.memo || '' });
    else { const l = e.l; rows.push({ date: e.i === 0 ? fmtMD(e.date) : '', name: l.kind === 'other' ? l.name : `${l.material} ${l.sizes.map(s => `${sizeText(s).replace(/×/g, 'X')} ${s.cases ?? 0}-${s.count}`).join(' / ')}`, qty: l.kind === 'other' ? `${fmtN(l.qty)}${l.unit || ''}` : fmtKg(lineKg(l)), price: fmtPrice(l.unitPrice), sale: yen(e.amount), bal: yen(e.bal), note: [l.note1, l.note2].filter(Boolean).join(' ') }); }
  }
  const pages = chunk(rows, LEDGER_ROWS, LEDGER_ROWS);
  return pages.map((pr, pi) => `<div class="page">
    <div style="display:flex;justify-content:space-between;align-items:flex-end"><div style="font-size:9pt">${esc(cust.code)}</div><div class="doc-title">得 意 先 台 帳</div><div style="font-size:9pt">締日 ${closingLabel(cust.closingDay)}</div></div>
    <div style="display:flex;justify-content:space-between;margin-top:2mm"><div class="doc-to" style="min-width:90mm"><span>${esc(cust.name)}</span><span class="hon">殿</span></div><div style="font-size:9pt">${fmtDate(from)}〜${fmtDate(to)}</div></div>
    <table class="dt compact"><colgroup><col style="width:11mm"><col style="width:64mm"><col style="width:15mm"><col style="width:13mm"><col style="width:21mm"><col style="width:21mm"><col style="width:23mm"><col></colgroup>
      <thead><tr><th>月日</th><th>品名</th><th>数量</th><th>単価</th><th>売上金額</th><th>受入金額</th><th>差引残高</th><th>摘要</th></tr></thead>
      <tbody>${pr.map(r => `<tr><td class="c" style="height:5.8mm">${esc(r.date || '')}</td><td style="font-size:7.5pt;white-space:nowrap;overflow:hidden">${esc(r.name || '')}</td><td class="n">${esc(r.qty || '')}</td><td class="n">${esc(r.price || '')}</td><td class="n">${esc(r.sale || '')}</td><td class="n">${esc(r.recv || '')}</td><td class="n">${esc(r.bal || '')}</td><td style="font-size:7pt;white-space:nowrap;overflow:hidden">${esc(r.note || '')}</td></tr>`).join('')}
      ${pi === pages.length - 1 ? `<tr class="tot"><td colspan="4">期間の合計</td><td class="n">${yen(L.sales)}</td><td class="n">${yen(L.recv)}</td><td class="n">${yen(L.end)}</td><td></td></tr>` : ''}</tbody></table>
    <div class="page-num">${esc(S.company.name)}　${pi + 1} / ${pages.length}</div></div>`);
}

/* ---------- 印刷・PDFの画面 ---------- */
let printJob = null;
function openPrintDialog({ title, options, build, fileName, onDone }) {
  printJob = { build, fileName, onDone };
  const optHtml = options.length ? `<fieldset class="field" style="border:0;padding:0;margin:0"><legend class="label" style="font-weight:700">印刷するもの</legend><div class="row">${options.map(o => `<label class="check"><input type="checkbox" class="printOpt" value="${o.v}"${o.on ? ' checked' : ''}>${esc(o.label)}</label>`).join('')}</div></fieldset>` : '';
  const how = canPrint() ? 'ブラウザの印刷の画面で、用紙を A4・縦、余白を「なし」、倍率を 100% にしてください。' : 'この画面（claude.ai）では印刷できません。PDF で保存して、PDF を開いて印刷してください。';
  openDialog({
    title, wide: true,
    body: `${optHtml}<p class="small muted">${how}</p><div class="preview-box" id="pvBox"><div class="preview-scale" id="pvScale"></div></div>`,
    buttons: [
      { label: '閉じる', cls: 'text' },
      { label: 'PDFで保存', cls: canPrint() ? '' : 'primary', icon: 'file-down', fn: () => { doPdf(); return false; } },
      ...(canPrint() ? [{ label: '印刷する', cls: 'primary', icon: 'printer', fn: () => { doPrint(); return false; } }] : []),
    ],
    onOpen: d => { $$('.printOpt', d).forEach(x => x.addEventListener('change', refreshPreview)); refreshPreview(); },
  });
}
window.addEventListener('resize', () => { if ($('#dlg').open && $('#pvBox')) refreshPreview(); });
function selectedOpts() { return $$('#dlg .printOpt:checked').map(x => x.value); }
function refreshPreview() {
  const box = $('#pvBox'), sc = $('#pvScale'); if (!box || !printJob) return;
  const html = printJob.build(selectedOpts());
  sc.innerHTML = html || '<p class="muted" style="padding:16px">印刷するものを選んでください。</p>';
  const pageW = 210 * 96 / 25.4; const avail = box.clientWidth - 26;
  const k = Math.min(1, avail / pageW);
  sc.style.transform = `scale(${k})`; sc.style.width = `${pageW}px`;
  const n = $$('.page', sc).length; sc.style.height = `${(n * (297 * 96 / 25.4 + 12)) * k}px`;
}
async function doPrint() {
  const html = printJob.build(selectedOpts()); if (!html) { toast('印刷するものを選んでください', 'circle-alert'); return; }
  $('#print-root').innerHTML = html;
  try { await document.fonts?.ready; } catch (e) { }
  window.print();
  printJob.onDone && printJob.onDone(selectedOpts());
}
const PDF_LIBS = ['https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'];
function loadScript(src) {
  return new Promise((res, rej) => { if ($$('script').some(s => s.src === src)) return res(); const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('load')); document.head.appendChild(s); });
}
async function doPdf() {
  const html = printJob.build(selectedOpts()); if (!html) { toast('印刷するものを選んでください', 'circle-alert'); return; }
  toast('PDF を作っています…', 'file-down');
  try { for (const u of PDF_LIBS) await loadScript(u); }
  catch (e) { toast('PDF を作る部品を読み込めませんでした。インターネットにつながっているか確かめてください', 'circle-alert'); return; }
  const stage = $('#pdf-stage'); stage.innerHTML = html;
  try {
    try { await document.fonts?.ready; } catch (e) { }
    const { jsPDF } = window.jspdf; const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    const pages = $$('.page', stage);
    for (let i = 0; i < pages.length; i++) {
      const canvas = await html2canvas(pages[i], { scale: 2, backgroundColor: '#ffffff', logging: false, useCORS: true });
      if (i) pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297);
    }
    const blob = pdf.output('blob');
    const ok = await saveFile(printJob.fileName, blob);
    if (ok) printJob.onDone && printJob.onDone(selectedOpts());
  } catch (e) { toast('PDF を作れませんでした', 'circle-alert'); }
  finally { stage.innerHTML = ''; }
}

/* ---------- 各帳票の呼び出し ---------- */
function openPrintDelivery(id) {
  const d = S.deliveries.find(x => x.id === id); if (!d) return;
  openPrintDialog({
    title: `納品書 No.${pad6(d.no)} の印刷・PDF`,
    options: [{ v: 'main', label: '納品書', on: true }, { v: 'copy', label: '納品書（控）', on: true }, { v: 'recv', label: '受領書', on: false }],
    build: opts => { const halves = []; if (opts.includes('main')) halves.push(...deliverySheets(d, '')); if (opts.includes('copy')) halves.push(...deliverySheets(d, '控')); if (opts.includes('recv')) halves.push(...deliverySheets(d, '', '受 領 書')); return halves.length ? packHalves(halves) : ''; },
    fileName: `納品書_${pad6(d.no)}_${custName(d.customerId)}.pdf`,
    onDone: () => { d.printedAt = nowIso(); logAction('納品書を印刷・PDF', `No.${pad6(d.no)}`, d.id); save(); },
  });
}
function openPrintKari(id) {
  const d = S.deliveries.find(x => x.id === id); if (!d) return;
  if (!d.kariNo) {
    if (S.deliveries.some(x => x.kariNo === S.numbers.kari)) { toast(`仮納品書No.${pad6(S.numbers.kari)} はもう使われています。「設定・データ」で番号を確かめてください`, 'circle-alert'); return; }
    d.kariNo = S.numbers.kari; S.numbers.kari += 1; logAction('仮納品書の番号', `納品書 No.${pad6(d.no)} に仮納品書 No.${pad6(d.kariNo)}`, d.id); save();
  }
  const diff = !!destOf(d);
  openPrintDialog({
    title: `仮納品書 No.${pad6(d.kariNo)} の印刷・PDF`,
    options: [{ v: 'main', label: '仮納品書', on: true }, { v: 'copy', label: '仮納品書（控）', on: true }, { v: 'recv', label: '受領書', on: true }, { v: 'amount', label: `金額を出す${diff ? '（送り先が違うため、ふつうは出しません）' : ''}`, on: !diff }],
    build: opts => { const show = opts.includes('amount'); const halves = []; if (opts.includes('main')) halves.push(...kariSheets(d, '', show)); if (opts.includes('copy')) halves.push(...kariSheets(d, '控', show)); if (opts.includes('recv')) halves.push(...kariSheets(d, '受領書', show)); return halves.length ? packHalves(halves) : ''; },
    fileName: `仮納品書_${pad6(d.kariNo)}_${custName(d.customerId)}.pdf`,
    onDone: () => { logAction('仮納品書を印刷・PDF', `No.${pad6(d.kariNo)}（納品書 No.${pad6(d.no)}）`, d.id); save(); },
  });
}
function openPrintInvoices(ids) {
  const invs = ids.map(id => S.invoices.find(v => v.id === id)).filter(v => v && v.status !== 'cancelled');
  if (!invs.length) { toast('印刷する請求書がありません', 'circle-alert'); return; }
  openPrintDialog({
    title: invs.length === 1 ? `請求書 No.${pad6(invs[0].no)} の印刷・PDF` : `請求書 ${invs.length}件 の印刷・PDF`,
    options: [{ v: 'main', label: '請求書', on: true }, { v: 'copy', label: '請求書（控）', on: false }],
    build: opts => { const out = []; for (const v of invs) { if (opts.includes('main')) out.push(...invoicePages(v, '')); if (opts.includes('copy')) out.push(...invoicePages(v, '控')); } return out.join(''); },
    fileName: invs.length === 1 ? `請求書_${pad6(invs[0].no)}_${custName(invs[0].customerId)}_${invs[0].closingDate}.pdf` : `請求書_${invs.length}件_${stampName()}.pdf`,
    onDone: () => { for (const v of invs) { if (!v.printedAt) v.printedAt = nowIso(); logAction('請求書を印刷・PDF', `No.${pad6(v.no)} ${custName(v.customerId)}`, v.id); } save(); render(); },
  });
}
function openPrintLedger() {
  const cust = custById(ui.lg.cust); if (!cust) return;
  openPrintDialog({ title: `得意先台帳（${cust.name}）の印刷・PDF`, options: [], build: () => ledgerPages(cust, ui.lg.from, ui.lg.to).join(''), fileName: `得意先台帳_${cust.name}_${ui.lg.from}_${ui.lg.to}.pdf` });
}
