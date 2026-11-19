/* ---------- 画面の部品 ---------- */
const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function drawIcons() { if (window.lucide) try { lucide.createIcons({ attrs: { 'aria-hidden': 'true' } }); } catch (e) { } }
const chip = (cls, ic, label) => `<span class="chip ${cls}">${ic ? icon(ic) : ''}${esc(label)}</span>`;
const notice = (kind, html, ic) => `<div class="notice ${kind}" role="${kind === 'err' ? 'alert' : 'note'}">${icon(ic || { info: 'info', warn: 'triangle-alert', err: 'circle-alert', ok: 'circle-check' }[kind])}<div class="body">${html}</div></div>`;
function fld(id, label, control, { req = false, opt = false, hint = '', cls = '' } = {}) {
  return `<div class="field ${cls}" data-field="${id}"><label for="${id}">${esc(label)}${req ? '<span class="req">※必須</span>' : opt ? '<span class="opt">※任意</span>' : ''}</label>${hint ? `<p class="hint" id="${id}-hint">${hint}</p>` : ''}${control}</div>`;
}
const txt = (id, val, attrs = '') => `<input type="text" id="${id}" value="${esc(val ?? '')}" autocomplete="off" ${attrs}>`;
const numIn = (id, val, attrs = '') => `<input type="text" inputmode="decimal" class="numin" id="${id}" value="${esc(val ?? '')}" autocomplete="off" ${attrs}>`;
const dateIn = (id, val, attrs = '') => `<input type="date" id="${id}" value="${esc(val || '')}" ${attrs}>`;
const numStr = n => n == null || Number.isNaN(n) ? '' : String(n);
function sel(id, options, selected, attrs = '') {
  return `<select id="${id}" ${attrs}>${options.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(selected ?? '') ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
}
function custSelect(id, selected, { all = false, includeInactive = false, attrs = '' } = {}) {
  const list = sortCustomers(S.customers.filter(c => includeInactive || c.active || c.id === selected));
  return `<select id="${id}" ${attrs}>${all ? '<option value="">すべての得意先</option>' : '<option value="">選んでください</option>'}${list.map(c => `<option value="${c.id}"${c.id === selected ? ' selected' : ''}>${esc(c.code)}　${esc(c.name)}${c.active ? '' : '（取引停止）'}</option>`).join('')}</select>`;
}
/** 得意先コードを入れると得意先が選ばれる（旧システムと同じくコードで入れられる）。選ぶ欄の id はそのまま使う */
function custPicker(id, selected, opts = {}) {
  const c = custById(selected);
  return `<div class="cust-pick"><input type="text" inputmode="numeric" class="numin code-in" id="${id}Code" value="${esc(c ? c.code : '')}" aria-label="得意先コード" placeholder="コード" autocomplete="off">${custSelect(id, selected, opts)}</div><p class="small err-inline" id="${id}CodeMsg" aria-live="polite"></p>`;
}
function bindCustPicker(id) {
  const ci = document.getElementById(id + 'Code'), se = document.getElementById(id), msg = document.getElementById(id + 'CodeMsg');
  if (!ci || !se) return;
  const apply = () => {
    if (!ci.value.trim()) { msg.textContent = ''; return; }
    const v = parseNum(ci.value);
    const c = S.customers.find(x => Number(x.code) === v && [...se.options].some(o => o.value === x.id));
    if (!c) { msg.textContent = `＊コード ${toHalf(ci.value)} の得意先はありません。コードを確かめるか、右の欄から選んでください`; return; }
    msg.textContent = '';
    if (se.value !== c.id) { se.value = c.id; se.dispatchEvent(new Event('change', { bubbles: true })); }
  };
  ci.addEventListener('change', apply);
  // Enter（旧システムの「実行」）で決める。フォームを送らない
  ci.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); apply(); } });
  se.addEventListener('change', () => { const c = custById(se.value); ci.value = c ? c.code : ''; msg.textContent = ''; });
}
const destLabel = x => `${x.code ? `${x.code}　` : ''}${x.name}`;
/** 摘要2に入れる送り先の略称（略称がなければ、会社の種類を除いた名前） */
const destShort = x => x ? (x.short || String(x.name || '').replace(/株式会社|有限会社|[（(][株有][）)]|㈱|㈲|\s/g, '')) : '';
function destSelect(id, cust, destId, withFree = true) {
  const opts = [['', '得意先と同じ']];
  if (cust) for (const x of cust.destinations) if (x.active !== false || x.id === destId) opts.push([x.id, destLabel(x)]);
  if (withFree) opts.push(['free', 'ほかの送り先を入れる']);
  return sel(id, opts, destId || '');
}

function toast(msg, ic = 'circle-check') {
  const t = $('#toast'); t.innerHTML = `${icon(ic)}<span>${esc(msg)}</span>`; t.hidden = false; drawIcons();
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 4200);
}
/** 入力の誤りを表示し、いちばん上の誤りへ移る。errs: [{el, msg}] */
function showErrors(container, errs) {
  $$('.err-msg', container).forEach(e => e.remove());
  $$('.has-err', container).forEach(e => { e.classList.remove('has-err'); e.removeAttribute('aria-invalid'); });
  if (!errs.length) return true;
  for (const { el, msg } of errs) {
    if (!el) continue;
    const f = el.closest('.field');
    (f || el).classList.add('has-err'); el.classList.add('has-err'); el.setAttribute('aria-invalid', 'true');
    const m = document.createElement('p'); m.className = 'err-msg'; m.textContent = '＊' + msg;
    (f || el.parentElement).appendChild(m);
  }
  const first = errs.find(e => e.el)?.el;
  if (first) {
    first.scrollIntoView({ block: 'center', behavior: REDUCED ? 'auto' : 'smooth' });
    first.focus({ preventScroll: true });
    first.classList.add('flash'); setTimeout(() => first.classList.remove('flash'), 1700);
  }
  return false;
}
/** 処理のエラー（保存できなかった等）を画面の上に出して、そこへ移る */
function showProblem(container, html) {
  let box = $('.problem-box', container);
  if (!box) { box = document.createElement('div'); box.className = 'problem-box'; container.prepend(box); }
  box.innerHTML = notice('err', html); drawIcons();
  box.scrollIntoView({ block: 'center', behavior: REDUCED ? 'auto' : 'smooth' });
  box.setAttribute('tabindex', '-1'); box.focus({ preventScroll: true });
}

/* ---------- ダイアログ ---------- */
function openDialog({ title, body, buttons = [], wide = false, onOpen }) {
  const d = $('#dlg');
  d.className = wide ? 'wide' : '';
  d.innerHTML = `<div class="dlg-hd"><h2 id="dlgTitle">${esc(title)}</h2><button type="button" class="icon-btn" data-close aria-label="閉じる">${icon('x')}<span>閉じる</span></button></div>
    <div class="dlg-bd">${body}</div>
    ${buttons.length ? `<div class="dlg-ft">${buttons.map((b, i) => `<button type="button" class="btn ${b.cls || ''}" data-bi="${i}">${b.icon ? icon(b.icon) : ''}${esc(b.label)}</button>`).join('')}</div>` : ''}`;
  d.querySelector('[data-close]').onclick = () => d.close();
  buttons.forEach((b, i) => { d.querySelector(`[data-bi="${i}"]`).onclick = async () => { const r = b.fn ? await b.fn(d) : true; if (r !== false && d.open) d.close(); }; });
  drawIcons();
  if (!d.open) d.showModal();
  onOpen && onOpen(d);
  return d;
}
/** 理由を書いてもらってから実行する（取消など） */
function askReason({ title, message, okLabel, danger = true }) {
  return new Promise(resolve => {
    let done = false;
    const d = openDialog({
      title,
      body: `${message ? `<p>${message}</p>` : ''}${fld('reasonIn', '理由', '<textarea id="reasonIn"></textarea>', { req: true, hint: '操作の履歴に残ります。' })}`,
      buttons: [
        { label: 'やめる', cls: 'text', fn: () => { done = true; resolve(null); } },
        { label: okLabel, cls: danger ? 'danger' : 'primary', icon: danger ? 'ban' : 'check', fn: dd => { const v = $('#reasonIn', dd).value.trim(); if (!v) { showErrors(dd, [{ el: $('#reasonIn', dd), msg: '理由を書いてください' }]); return false; } done = true; resolve(v); } },
      ],
      onOpen: dd => $('#reasonIn', dd).focus(),
    });
    d.addEventListener('close', () => { if (!done) resolve(null); }, { once: true });
  });
}
function confirmDialog({ title, body, okLabel, okIcon = 'check', danger = false }) {
  return new Promise(resolve => {
    let done = false;
    const d = openDialog({ title, body, buttons: [{ label: 'やめる', cls: 'text', fn: () => { done = true; resolve(false); } }, { label: okLabel, cls: danger ? 'danger' : 'primary', icon: okIcon, fn: () => { done = true; resolve(true); } }] });
    d.addEventListener('close', () => { if (!done) resolve(false); }, { once: true });
  });
}

/* ---------- ファイルの保存（claude.ai の中では確認の画面を出す） ---------- */
async function saveFile(name, blob) {
  if (window.claude && typeof window.claude.use === 'function') {
    let ns = null;
    try { ns = await window.claude.use('downloads'); } catch (e) { ns = null; }
    if (ns) {
      try { await ns.save({ filename: name, data: blob }); toast('ファイルを保存しました'); return true; }
      catch (e) { if (e && e.code === 'declined') return false; toast(`ファイルを保存できませんでした（${(e && e.code) || '原因不明'}）`, 'circle-alert'); return false; }
    }
  }
  try {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('ファイルを保存しました'); return true;
  } catch (e) { toast('ファイルを保存できませんでした', 'circle-alert'); return false; }
}
const IN_FRAME = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();
const canPrint = () => !IN_FRAME;
const stampName = () => { const d = new Date(); return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}_${pad2(d.getHours())}${pad2(d.getMinutes())}`; };
function toCsv(rows) { return rows.map(r => r.map(v => { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\r\n'); }
