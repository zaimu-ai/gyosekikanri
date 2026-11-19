/* =========================================================
   宛名ラベル：仕入先など（宛名）と得意先の、封筒に貼るラベルシールを印刷する
   - 宛名（仕入先など）は得意先とは別に登録する（請求はしない）
   - 住所が空欄の宛名は選べない（理由を出す。黙って外さない）
   - 宛名は消さない（使わなくなったら「使わない」）
   ========================================================= */
ui.lb = { kind: 'addr', q: '', sel: [] };
const HONORIFICS = [['御中', '御中'], ['様', '様'], ['殿', '殿'], ['', 'なし']];
const labelKey = (kind, id) => `${kind}:${id}`;
/** ラベルに使う宛名の一覧（種類・探す・使っているものだけ） */
function labelCandidates() {
  const f = ui.lb; const out = [];
  if (f.kind !== 'cust') for (const a of sortCustomers(S.addressees.filter(x => x.active))) out.push({ key: labelKey('a', a.id), kind: 'a', rec: a, href: `#addressee-${a.id}`, kindLabel: '宛名' });
  if (f.kind !== 'addr') for (const c of sortCustomers(S.customers.filter(x => x.active))) out.push({ key: labelKey('c', c.id), kind: 'c', rec: c, href: `#customer-${c.id}`, kindLabel: '得意先' });
  if (!f.q) return out;
  const q = toHalf(f.q).toLowerCase();
  return out.filter(x => [x.rec.code, x.rec.kana, x.rec.name, x.rec.address, x.rec.address2].join(' ').toLowerCase().includes(q));
}
const labelReady = r => !!(String(r.address || '').trim() && String(r.name || '').trim());
function labelFromKey(key) {
  const [k, id] = key.split(':');
  const r = k === 'a' ? S.addressees.find(x => x.id === id) : custById(id);
  if (!r) return null;
  const hon = k === 'a' && r.honorific != null && r.honorific !== '' ? (r.honorific === '-' ? '' : r.honorific) : S.labelSettings.honorific;
  return { name: r.name, hon, zip: r.zip || '', address: r.address || '', address2: r.address2 || '', ready: labelReady(r) };
}
function labelSheet() { const L = S.labelSettings; return L.sheet === 'custom' ? L.custom : (LABEL_SHEETS[L.sheet] || LABEL_SHEETS.me504t); }
/** 文字の幅（全角を1、半角を0.55として数える） */
const textUnits = s => [...String(s || '')].reduce((a, ch) => a + (/[ -~｡-ﾟ]/.test(ch) ? 0.55 : 1), 0);
/** 幅に収まる文字の大きさ（pt）。max〜min の間で、0.5pt きざみ */
function fitPt(text, widthMm, max, min, extra = 0) {
  const u = textUnits(text) + extra; if (!u) return max;
  const pt = widthMm / (u * 0.3528); return Math.max(min, Math.min(max, Math.floor(pt * 2) / 2));
}
function labelHtml(l, sh) {
  const inner = sh.w - 10;   // 左右の余白 5mm ずつ
  const name = `${esc(l.name)}${l.hon ? `<span class="lb-hon">${esc(l.hon)}</span>` : ''}`;
  return `<div class="lb-zip">${l.zip ? `〒${esc(l.zip)}` : ''}</div>
    <div class="lb-addr" style="font-size:${fitPt(l.address, inner, 10, 6.5)}pt">${esc(l.address)}</div>
    ${l.address2 ? `<div class="lb-addr" style="font-size:${fitPt(l.address2, inner, 10, 6.5)}pt">${esc(l.address2)}</div>` : ''}
    <div class="lb-name" style="font-size:${fitPt(l.name, inner / 1.1, 13, 7.5, l.hon ? 2.5 : 0)}pt">${name}</div>`;
}
/** ラベルを A4 のページに並べる。start は1枚目の用紙で何枚目のラベルから使うか（使いかけの用紙のため） */
function labelPages(keys, { copies = 1, start = 1 } = {}) {
  const sh = labelSheet(); const L = S.labelSettings;
  const per = sh.cols * sh.rows;
  const list = [];
  for (const k of keys) { const l = labelFromKey(k); if (l && l.ready) for (let i = 0; i < copies; i++) list.push(l); }
  if (!list.length) return '';
  const slots = [...Array(Math.max(0, Math.min(start, per) - 1)).fill(null), ...list];
  const pages = [];
  for (let p = 0; p < slots.length; p += per) {
    const cells = slots.slice(p, p + per).map((l, i) => {
      if (!l) return '';
      const c = i % sh.cols, r = Math.floor(i / sh.cols);
      const mm = v => +v.toFixed(3);   // 小数の誤差（127.34999…）を出さない
      const x = mm(sh.left + (Number(L.offsetX) || 0) + c * (sh.w + sh.gapX)), y = mm(sh.top + (Number(L.offsetY) || 0) + r * (sh.h + sh.gapY));
      return `<div class="lb" style="left:${x}mm;top:${y}mm;width:${sh.w}mm;height:${sh.h}mm">${labelHtml(l, sh)}</div>`;
    }).join('');
    pages.push(`<div class="page label-page">${cells}</div>`);
  }
  return pages.join('');
}

function viewLabels() {
  const f = ui.lb; const L = S.labelSettings; const sh = labelSheet();
  const cands = labelCandidates();
  const picked = new Set(f.sel.filter(k => { const l = labelFromKey(k); return l && l.ready; }));
  const per = sh.cols * sh.rows; const n = picked.size * (Number(L.copies) || 1);
  const sheets = n ? Math.ceil((n + Math.min(L.start, per) - 1) / per) : 0;
  const nAddr = S.addressees.filter(a => a.active).length;
  const blank = S.addressees.filter(a => a.active && !labelReady(a)).length;
  const num = (id, v, label, hint) => fld(id, label, numIn(id, numStr(v), `data-ls="${id}"`), { hint });
  return `
  <div class="page-head"><div><h1>宛名ラベル</h1><p class="lead">仕入先などの封筒に貼るラベルシールを印刷します。仕入先などの宛名は、得意先とは別に登録します（請求書は作りません）。</p></div>
    <div class="actions"><a class="btn" href="#addressee-new">${icon('plus')}宛名を登録する</a><a class="btn" href="#customers-import">${icon('file-up')}宛名を取り込む（CSV）</a></div></div>
  ${blank ? notice('warn', `<b>住所が空欄の宛名が ${blank} 件あります。</b>住所が空欄の宛名はラベルに印刷できないため、選べないようにしています。宛名の画面で住所を入れてください。`) : ''}
  <div class="card stack"><h2>1. 印刷する宛名を選ぶ</h2>
    <div class="form-grid">
      ${fld('lbKind', '種類', sel('lbKind', [['addr', `仕入先など（宛名）${nAddr} 件`], ['cust', '得意先'], ['all', '両方']], f.kind))}
      ${fld('lbQ', '探す（コード・名前・住所）', txt('lbQ', f.q))}
    </div>
    <div class="actions"><button type="button" class="btn sm" data-act="lbAll" data-v="1">${icon('square-check')}表示している宛名をすべて選ぶ</button><button type="button" class="btn sm text" data-act="lbAll" data-v="0">${icon('square')}選ぶのをやめる</button><span class="small" id="lbCount">選んでいる宛名：${picked.size} 件</span></div>
    ${cands.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th class="check-cell">選ぶ</th><th class="num">コード</th><th>名前</th><th>住所</th><th>種類</th></tr></thead><tbody>
      ${cands.map(x => { const r = x.rec; const ok = labelReady(r); return `<tr><td class="check-cell">${ok ? `<label class="check"><input type="checkbox" class="lbPick" value="${x.key}"${picked.has(x.key) ? ' checked' : ''} aria-label="${esc(r.name)} を選ぶ"></label>` : ''}</td>
        <td class="num">${esc(r.code ?? '')}</td><td><a href="${x.href}">${esc(r.name)}</a>${r.needsCheck && r.needsCheck.length ? `<span class="sub">${chip('warn', 'triangle-alert', `空欄：${r.needsCheck.join('・')}`)}</span>` : ''}</td>
        <td>${ok ? `${r.zip ? `〒${esc(r.zip)} ` : ''}${esc(r.address)}${r.address2 ? ` ${esc(r.address2)}` : ''}` : chip('warn', 'circle-alert', '住所が空欄のため選べません')}</td><td>${x.kindLabel}</td></tr>`; }).join('')}
      </tbody></table></div>`
      : `<div class="empty">${icon('mail')}<p>${f.q ? '条件に合う宛名はありません。' : f.kind === 'addr' ? '仕入先などの宛名はまだありません。' : '宛名はありません。'}</p>${f.kind === 'addr' && !f.q ? `<div class="actions"><a class="btn" href="#addressee-new">${icon('plus')}宛名を登録する</a><a class="btn" href="#customers-import">${icon('file-up')}宛名を取り込む（CSV）</a></div>` : ''}</div>`}
  </div>
  <div class="card stack"><h2>2. ラベルの用紙</h2>
    <p class="small muted">はじめは、お使いの ME-504T（21面・余白なし）になっています。余白なしの用紙は、プリンターによっては端が印刷されないことがあります。ほかの用紙のときは、面の数と寸法に合わせてください。合う用紙がないときは「自分で決める」で、用紙の箱に書かれた寸法を入れます。はじめは普通の紙に印刷して、ラベル用紙と重ねて位置を確かめてください。</p>
    <div class="form-grid">
      ${fld('lsSheet', '用紙', sel('lsSheet', [...Object.entries(LABEL_SHEETS).map(([k, v]) => [k, v.label]), ['custom', '自分で決める']], L.sheet))}
      ${fld('lsStart', '1枚目は何枚目のラベルから使うか', sel('lsStart', Array.from({ length: per }, (_, i) => [i + 1, `${i + 1} 枚目から${i ? '' : '（新しい用紙）'}`]), Math.min(L.start, per)), { hint: '使いかけの用紙に印刷するとき。左上から右へ数えます' })}
      ${fld('lsCopies', '1件あたりの枚数', sel('lsCopies', Array.from({ length: 10 }, (_, i) => [i + 1, `${i + 1} 枚`]), L.copies))}
      ${fld('lsHon', '敬称', sel('lsHon', HONORIFICS, L.honorific), { hint: '宛名ごとに決めているときはそちらを使います' })}
      ${num('lsOffX', L.offsetX, '位置の調整：右へ（mm）', 'ずれるときだけ。左へは −')}
      ${num('lsOffY', L.offsetY, '位置の調整：下へ（mm）', 'ずれるときだけ。上へは −')}
    </div>
    ${L.sheet === 'custom' ? `<div class="form-grid">
      ${num('lcCols', L.custom.cols, '列の数')}${num('lcRows', L.custom.rows, '段の数')}${num('lcW', L.custom.w, 'ラベルの幅（mm）')}${num('lcH', L.custom.h, 'ラベルの高さ（mm）')}
      ${num('lcTop', L.custom.top, '用紙の上からの余白（mm）')}${num('lcLeft', L.custom.left, '用紙の左からの余白（mm）')}${num('lcGapX', L.custom.gapX, 'ラベルの横の間隔（mm）')}${num('lcGapY', L.custom.gapY, 'ラベルの縦の間隔（mm）')}
    </div>` : ''}
    <p id="lbSummary">${n ? `ラベル ${n} 枚（用紙 ${sheets} 枚）` : '宛名を選ぶと、ラベルと用紙の枚数が出ます。'}</p>
    <div class="actions"><button type="button" class="btn primary" data-act="lbPrint" ${n ? '' : 'disabled'}>${icon(canPrint() ? 'printer' : 'file-down')}ラベルを${canPrint() ? '印刷・PDF' : 'PDFで保存'}</button></div>
  </div>`;
}
function labelSelectAll(on) {
  const keys = labelCandidates().filter(x => labelReady(x.rec)).map(x => x.key);
  const s = new Set(ui.lb.sel); keys.forEach(k => on ? s.add(k) : s.delete(k)); ui.lb.sel = [...s]; render();
}
function bindLabels() {
  $('#lbKind').onchange = e => { ui.lb.kind = e.target.value; render(); };
  $('#lbQ').onchange = e => { ui.lb.q = e.target.value; render(); };
  $$('.lbPick').forEach(x => x.addEventListener('change', () => { const s = new Set(ui.lb.sel); x.checked ? s.add(x.value) : s.delete(x.value); ui.lb.sel = [...s]; render(); }));
  const L = S.labelSettings;
  const setv = (id, fn) => { const el = $('#' + id); if (el) el.onchange = () => { fn(el.value); save(); render(); }; };
  setv('lsSheet', v => { if (v === 'custom' && L.sheet !== 'custom') L.custom = { ...labelSheet() }; L.sheet = v; L.chosen = true; L.start = 1; });
  setv('lsStart', v => { L.start = Number(v) || 1; });
  setv('lsCopies', v => { L.copies = Number(v) || 1; });
  setv('lsHon', v => { L.honorific = v; });
  // 数の入力：読めない・範囲外の値は入れない（理由を出す）
  const numv = (id, key, obj, { min = -Infinity, max = Infinity, int = false } = {}) => {
    const el = $('#' + id); if (!el) return;
    el.onchange = () => {
      const v = parseNum(el.value);
      if (v == null || Number.isNaN(v) || v < min || v > max || (int && !Number.isInteger(v))) { showErrors($('#view'), [{ el, msg: `${min}〜${max} の${int ? '整数' : '数'}を入れてください` }]); return; }
      obj[key] = v; save(); render();
    };
  };
  numv('lsOffX', 'offsetX', L, { min: -20, max: 20 }); numv('lsOffY', 'offsetY', L, { min: -20, max: 20 });
  numv('lcCols', 'cols', L.custom, { min: 1, max: 6, int: true }); numv('lcRows', 'rows', L.custom, { min: 1, max: 15, int: true });
  numv('lcW', 'w', L.custom, { min: 20, max: 210 }); numv('lcH', 'h', L.custom, { min: 10, max: 297 });
  numv('lcTop', 'top', L.custom, { min: 0, max: 100 }); numv('lcLeft', 'left', L.custom, { min: 0, max: 100 });
  numv('lcGapX', 'gapX', L.custom, { min: 0, max: 30 }); numv('lcGapY', 'gapY', L.custom, { min: 0, max: 30 });
}
function openPrintLabels() {
  const keys = ui.lb.sel.filter(k => { const l = labelFromKey(k); return l && l.ready; });
  if (!keys.length) { toast('印刷する宛名を選んでください', 'circle-alert'); return; }
  const L = S.labelSettings;
  const sh = labelSheet();
  if (sh.left + sh.cols * sh.w + (sh.cols - 1) * sh.gapX > 210.5 || sh.top + sh.rows * sh.h + (sh.rows - 1) * sh.gapY > 297.5) { toast('ラベルが A4 の用紙からはみ出します。用紙の寸法を確かめてください', 'circle-alert'); return; }
  openPrintDialog({
    title: `宛名ラベル ${keys.length} 件の印刷・PDF`, options: [],
    build: () => labelPages(keys, { copies: Number(L.copies) || 1, start: Number(L.start) || 1 }),
    fileName: `宛名ラベル_${keys.length}件_${stampName()}.pdf`,
    onDone: () => { logAction('宛名ラベルを印刷・PDF', `${keys.length} 件（${(labelSheet().label || '自分で決めた用紙')}）`); save(); },
  });
}

/* ---------- 宛名（仕入先など）の登録 ---------- */
function viewAddresseeForm(id) {
  const a = id ? S.addressees.find(x => x.id === id) : null; if (id && !a) return notFound('宛名');
  const v = a || { code: '', kana: '', name: '', honorific: '', zip: '', address: '', address2: '', tel: '', fax: '', memo: '', active: true, needsCheck: [] };
  return `${backLink('#labels', '宛名ラベル')}
  <div class="page-head"><div><h1>${a ? esc(a.name) : '宛名を登録する'}</h1><p class="lead">仕入先など、封筒のラベルを印刷する相手です。請求書は作りません（得意先には入りません）。</p></div></div>
  ${v.needsCheck && v.needsCheck.length ? notice('warn', `<b>取り込んだときに空欄にした項目：${esc(v.needsCheck.join('、'))}</b><br>元の一覧で文字が重なっていて読めなかった項目です。入れたら、下の「空欄の確認」を外してください。`) : ''}
  <form id="aForm" class="card stack" novalidate>
    <div class="form-grid">
      ${fld('aCode', 'コード', numIn('aCode', v.code), { opt: true, hint: '事務コンと同じ番号' })}
      ${fld('aName', '名前', txt('aName', v.name), { req: true, hint: 'ラベルに出る名前' })}
      ${fld('aKana', 'メニュー（読みの頭文字）', txt('aKana', v.kana), { opt: true })}
      ${fld('aHon', '敬称', sel('aHon', [['', `ラベルの設定に従う（今は${S.labelSettings.honorific || 'なし'}）`], ['御中', '御中'], ['様', '様'], ['殿', '殿'], ['-', 'なし']], v.honorific), { req: true })}
      ${fld('aZip', '郵便番号', txt('aZip', v.zip), { opt: true })}
      ${fld('aAddr', '住所1', txt('aAddr', v.address), { opt: true, cls: 'wide', hint: '空欄のままだとラベルに印刷できません' })}
      ${fld('aAddr2', '住所2', txt('aAddr2', v.address2), { opt: true, cls: 'wide', hint: 'ビル名・部署など' })}
      ${fld('aTel', '電話番号', txt('aTel', v.tel), { opt: true })}
      ${fld('aFax', 'FAX番号', txt('aFax', v.fax), { opt: true })}
      ${fld('aActive', '使うか', sel('aActive', [['1', '使う'], ['0', '使わない（一覧に出さない）']], v.active ? '1' : '0'), { req: true })}
      ${fld('aMemo', 'メモ', txt('aMemo', v.memo), { opt: true, cls: 'wide' })}
    </div>
    ${v.needsCheck && v.needsCheck.length ? `<label class="check"><input type="checkbox" id="aNeedsCheck" checked> 空欄の確認（${esc(v.needsCheck.join('、'))}）がまだ残っている</label>` : ''}
    ${v.legacy ? `<details><summary class="small">事務コンから取り込んだときの値（参考）</summary><p class="small tnum">締日 ${esc(v.legacy.closing)}・丸目 ${esc(v.legacy.round)}・請コード ${esc(v.legacy.billCode)}　${fmtDateTime(v.legacy.importedAt)} に取り込み</p></details>` : ''}
    <div class="actions"><button type="submit" class="btn primary">${icon('save')}${a ? '直した内容を登録する' : '宛名を登録する'}</button><a class="btn text" href="#labels">やめる</a></div>
  </form>`;
}
function bindAddresseeForm(id) {
  const form = $('#aForm'); if (!form) return;
  form.addEventListener('input', () => { ui.dirty = true; });
  form.addEventListener('submit', e => {
    e.preventDefault();
    const g = s => $(s, form); const errs = []; const E = (el, msg) => errs.push({ el, msg });
    const codeS = toHalf(g('#aCode').value); const code = codeS === '' ? null : parseNum(codeS);
    if (codeS !== '' && (Number.isNaN(code) || !Number.isInteger(code) || code <= 0)) E(g('#aCode'), 'コードは1以上の整数で入れてください');
    else if (code != null && S.addressees.some(x => x.id !== id && Number(x.code) === code)) E(g('#aCode'), `コード ${code} はほかの宛名で使っています`);
    const name = g('#aName').value.trim(); if (!name) E(g('#aName'), '名前を入れてください');
    if (!showErrors(form, errs)) return;
    const a0 = id ? S.addressees.find(x => x.id === id) : null;
    const nc = g('#aNeedsCheck'); const needsCheck = nc ? (nc.checked ? (a0?.needsCheck || []) : []) : (a0?.needsCheck || []);
    const rec = { code, name, kana: g('#aKana').value.trim(), honorific: g('#aHon').value, zip: toHalf(g('#aZip').value), address: g('#aAddr').value.trim(), address2: g('#aAddr2').value.trim(), tel: toHalf(g('#aTel').value), fax: toHalf(g('#aFax').value), memo: g('#aMemo').value.trim(), active: g('#aActive').value === '1', needsCheck, updatedAt: nowIso() };
    let a = a0;
    if (a) { Object.assign(a, rec); logAction('宛名を直す', `${a.code ?? ''} ${a.name}`, a.id); }
    else { a = { id: uid(), createdAt: nowIso(), ...rec }; S.addressees.push(a); logAction('宛名を登録', `${a.code ?? ''} ${a.name}`, a.id); }
    ui.dirty = false; save(true); toast(id ? '宛名を直しました' : '宛名を登録しました'); go('#labels');
  });
}
