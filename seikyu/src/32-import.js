/* =========================================================
   得意先・宛名の取込（CSV）
   事務コンの「得意先登録」の一覧を CSV にしたものを読み込む。
   - 締日がある行は「得意先」、締日 0 の行は「宛名（仕入先など。ラベル印刷用。請求はしない）」に入れる
   - 取り込む前に、全部の行を確かめる画面を出す（読めない行は理由を出し、黙って捨てない）
   - 同じコードの得意先がもうあるときは上書きしない
   - 取り込む前に端末内バックアップを取る
   ========================================================= */
ui.ci = null;
const CI_COLS = {
  code: ['コード', '得意先コード'], kana: ['メニュー', 'ふりがな'], name: ['得意先名', '名前'], zip: ['郵便番号'],
  address: ['住所1', '住所'], address2: ['住所2'], tel: ['電話番号'], fax: ['FAX番号', 'FAX', 'ＦＡＸ番号'],
  closing: ['締日'], tax: ['税'], round: ['丸目'], carry: ['繰越'], billCode: ['請コード', '請求先コード'], print: ['印字用'],
  blank: ['重なりで空欄にした項目', '空欄にした項目', '要確認'],
};
const CI_ROUND = { '0': 'floor', '1': 'round' };   // 請求一覧表で確かめた。2 などは意味が未確認
/** CSV を読む（ダブルクォートの中の改行・カンマも読む） */
function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim() !== ''));
}
/** 文字コード：UTF-8 で読めなければ Shift_JIS（Excel で保存した CSV） */
function decodeText(buf) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, ''); }
  catch (e) { return new TextDecoder('shift_jis').decode(buf); }
}
function analyzeCustomerCsv(text, fileName) {
  const rows = parseCsv(text);
  const res = { fileName, rows: [], headerError: '' };
  if (!rows.length) { res.headerError = 'ファイルに行がありません。'; return res; }
  const head = rows[0].map(h => toHalf(h).replace(/\s/g, ''));
  const col = {};
  for (const [k, names] of Object.entries(CI_COLS)) { const i = head.findIndex(h => names.some(n => toHalf(n).replace(/\s/g, '') === h)); if (i >= 0) col[k] = i; }
  const lack = ['code', 'name'].filter(k => col[k] == null).map(k => CI_COLS[k][0]);
  if (lack.length) { res.headerError = `1行目（見出し）に「${lack.join('」「')}」の列がありません。見出しの行を確かめてください。`; return res; }
  const get = (r, k) => col[k] == null ? '' : String(r[col[k]] ?? '').trim();
  const seen = new Map();
  rows.slice(1).forEach((r, k) => {
    const line = k + 2; const errs = [], warns = [];
    const codeS = toHalf(get(r, 'code')), name = get(r, 'name');
    const code = parseNum(codeS);
    if (!codeS) errs.push('コードが空欄です');
    else if (code == null || Number.isNaN(code) || !Number.isInteger(code) || code <= 0) errs.push(`コード「${codeS}」が1以上の整数ではありません`);
    if (!name) errs.push('得意先名が空欄です');
    if (code && seen.has(code)) errs.push(`同じコードが ${seen.get(code)} 行目にもあります`);
    if (code && !seen.has(code)) seen.set(code, line);
    const closeS = toHalf(get(r, 'closing')); let closingDay = null, target = 'cust';
    if (closeS === '') errs.push('締日が空欄です（得意先は締日の日、仕入先などの宛名は 0）');
    else if (closeS === '0') target = 'addr';   // 仕入先など：ラベル印刷のためだけの登録
    else { const n = parseNum(closeS); if (n == null || Number.isNaN(n) || !Number.isInteger(n) || n < 1 || n > 31) errs.push(`締日「${closeS}」が読めません（1〜31、または 0）`); else closingDay = n >= 31 ? 31 : n; }
    const roundS = toHalf(get(r, 'round')); let taxRounding = null;
    if (roundS !== '' && target === 'cust') { if (CI_ROUND[roundS]) taxRounding = CI_ROUND[roundS]; else warns.push(`丸目 ${roundS} の意味がまだ確かめられていないため、消費税の円未満は「会社の設定に従う」にします`); }
    const billS = toHalf(get(r, 'billCode')); const billCode = billS === '' ? null : parseNum(billS);
    if (billS !== '' && (billCode == null || Number.isNaN(billCode))) warns.push(`請コード「${billS}」が読めないため、請求先は未設定にします`);
    const blank = get(r, 'blank').split(/[,、・\s]+/).map(x => x.trim()).filter(Boolean);
    const exists = code && (target === 'addr' ? S.addressees : S.customers).find(c => Number(c.code) === code);
    const rec = {
      target, code, name, kana: get(r, 'kana'), zip: toHalf(get(r, 'zip')), address: get(r, 'address'), address2: get(r, 'address2'),
      tel: toHalf(get(r, 'tel')), fax: toHalf(get(r, 'fax')), closingDay, taxRounding, billCode: Number.isNaN(billCode) ? null : billCode, needsCheck: blank,
      legacy: { closing: get(r, 'closing'), tax: get(r, 'tax'), round: get(r, 'round'), carry: get(r, 'carry'), billCode: get(r, 'billCode'), print: get(r, 'print') },
    };
    const status = errs.length ? 'error' : exists ? 'exists' : 'new';
    if (status === 'exists') warns.unshift(`コード ${code} の${target === 'addr' ? '宛名' : '得意先'}「${exists.name}」がもう登録されています。上書きしません`);
    if (status === 'new' && target === 'addr') warns.unshift('締日 0 のため、得意先ではなく宛名（仕入先など）に入れます。宛名ラベルの画面で使います');
    res.rows.push({ line, rec, status, errs, warns });
  });
  // 請求先（請コード）を確かめる：1段だけ。請求先に締日がない・請求先がさらに別にまとめている・見つからないときは未設定（この得意先に請求）
  const byCode = new Map();
  for (const c of S.customers) byCode.set(Number(c.code), { code: Number(c.code), closingDay: c.closingDay, bill: c.billToId ? Number(custById(c.billToId)?.code) : Number(c.code), name: c.name });
  for (const x of res.rows) if (x.status === 'new' && x.rec.target === 'cust') byCode.set(x.rec.code, { code: x.rec.code, closingDay: x.rec.closingDay, bill: x.rec.billCode ?? x.rec.code, name: x.rec.name });
  for (const x of res.rows) {
    const b = x.rec.billCode; x.rec.billTo = null;
    if (x.status !== 'new' || x.rec.target !== 'cust' || b == null || b === x.rec.code) continue;
    const t = byCode.get(b);
    if (!t) { x.warns.push(`請コード ${b} の得意先がないため、請求先は未設定（この得意先に請求）にします`); continue; }
    if (t.bill !== t.code) { x.warns.push(`請求先 ${b} はさらに別の得意先にまとめているため、請求先は未設定にします`); continue; }
    if (t.closingDay == null) { x.warns.push(`請求先 ${b}（${t.name}）に締日がないため、請求先は未設定にします`); continue; }
    x.rec.billTo = b;
  }
  return res;
}
function viewCustomerImport() {
  const R = ui.ci;
  const cnt = (k, t) => R ? R.rows.filter(x => x.status === k && (!t || x.rec.target === t)).length : 0;
  return `${backLink('#customers', '得意先の一覧')}
  <div class="page-head"><div><h1>得意先・宛名を取り込む（CSV）</h1><p class="lead">事務コンの「得意先登録」の一覧を CSV にしたものを読み込みます。締日がある行は得意先に、締日 0 の行（仕入先など）は宛名ラベル用の宛名に入れます。取り込む前に、全部の行を確かめられます。</p></div></div>
  ${MODE === 'test' ? notice('warn', '<b>いまはテストデータを使っています。</b>本番で使う得意先は、「設定・データ」で本番のデータに切り替えてから取り込んでください（テストデータに取り込んでも本番には入りません）。') : ''}
  <div class="card stack">
    <h2>1. ファイルを選ぶ</h2>
    <p class="small">1行目は見出し：コード、メニュー、得意先名、郵便番号、住所1、住所2、電話番号、FAX番号、締日、税、丸目、繰越、請コード、印字用、重なりで空欄にした項目（コードと得意先名は必須。ほかの列はなくてもかまいません）。文字コードは UTF-8 か Shift_JIS。</p>
    <div class="actions"><button type="button" class="btn" data-act="importCustomersPick">${icon('file-up')}CSV ファイルを選ぶ</button>${R ? `<span class="small">${esc(R.fileName)}</span>` : ''}</div>
    <input type="file" id="ciFile" accept=".csv,text/csv" hidden>
  </div>
  ${R && R.headerError ? notice('err', esc(R.headerError)) : ''}
  ${R && !R.headerError ? `<div class="card stack">
    <h2>2. 中身を確かめる</h2>
    <p>${chip('ok', 'circle-plus', `得意先に取り込む ${cnt('new', 'cust')} 件`)} ${chip('info', 'mail', `宛名（仕入先など）に取り込む ${cnt('new', 'addr')} 件`)} ${chip('mute', 'circle-minus', `登録済みのため取り込まない ${cnt('exists')} 件`)} ${chip('err', 'circle-alert', `取り込めない ${cnt('error')} 件`)}</p>
    <p class="small muted">締日 0 の行は宛名（仕入先など）に入れます。丸目 0 は消費税の円未満を切り捨て、1 は四捨五入にします。請コードが自分と違う得意先は、その得意先の請求書にまとめます。空欄にした項目は、取り込んだあと得意先の一覧に「空欄」と出るので、手で入れてください。</p>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th class="num">行</th><th class="num">コード</th><th>得意先名</th><th>入れ先</th><th>締日</th><th>請求先</th><th>消費税の円未満</th><th>空欄の項目</th><th>判定</th></tr></thead><tbody>
    ${R.rows.map(x => { const r = x.rec; return `<tr class="${x.status === 'error' ? 'is-error' : x.status === 'exists' ? 'is-cancel' : ''}"><td class="num">${x.line}</td><td class="num">${esc(r.code ?? '')}</td><td>${esc(r.name)}${r.address ? `<span class="sub">${esc(r.address)}</span>` : ''}</td>
      <td>${r.target === 'addr' ? '宛名' : '得意先'}</td><td>${r.target === 'addr' ? '0' : r.closingDay == null ? '—' : closingLabel(r.closingDay)}</td><td>${r.billTo ? esc(r.billTo) : '—'}</td><td>${r.target === 'addr' ? '—' : r.taxRounding ? ROUND_LABEL[r.taxRounding] : '会社の設定'}</td><td>${r.needsCheck.length ? esc(r.needsCheck.join('・')) : '—'}</td>
      <td>${x.status === 'new' ? (r.target === 'addr' ? chip('info', 'mail', '宛名に取り込む') : chip('ok', 'circle-plus', '得意先に取り込む')) : x.status === 'exists' ? chip('mute', 'circle-minus', '取り込まない') : chip('err', 'circle-alert', '取り込めない')}${[...x.errs.map(m => `<span class="sub err-text">＊${esc(m)}</span>`), ...x.warns.map(m => `<span class="sub">${esc(m)}</span>`)].join('')}</td></tr>`; }).join('')}
    </tbody></table></div>
    <h2>3. 取り込む</h2>
    <p class="small">取り込む前に、今のデータを端末内バックアップに残します（「設定・データ」から戻せます）。</p>
    <div class="actions"><button type="button" class="btn primary" data-act="importCustomersRun" ${cnt('new') ? '' : 'disabled'}>${icon('download')}${cnt('new')} 件を取り込む</button><a class="btn text" href="#customers">やめる</a></div>
  </div>` : ''}`;
}
function bindCustomerImport() {
  const inp = $('#ciFile'); if (!inp) return;
  inp.onchange = async () => {
    const file = inp.files[0]; if (!file) return;
    try { const text = decodeText(await file.arrayBuffer()); ui.ci = analyzeCustomerCsv(text, file.name); }
    catch (e) { ui.ci = { fileName: file.name, rows: [], headerError: `ファイルを読めませんでした（${e.message}）` }; }
    render();
  };
}
async function importCustomersRun() {
  const R = ui.ci; if (!R) return;
  const adds = R.rows.filter(x => x.status === 'new');
  if (!adds.length) return;
  const nc = adds.filter(x => x.rec.target === 'cust').length, na = adds.length - nc;
  if (!(await confirmDialog({ title: '得意先・宛名を取り込む', body: `<p>得意先 ${nc} 件、宛名（仕入先など）${na} 件を取り込みます。取り込む前の状態は端末内バックアップに残します。</p>`, okLabel: '取り込む', okIcon: 'download' }))) return;
  // 取り込むあいだに、ほかで同じコードが登録されていないか確かめ直す
  const dup = adds.filter(x => (x.rec.target === 'addr' ? S.addressees : S.customers).some(c => Number(c.code) === x.rec.code));
  if (dup.length) { toast(`コード ${dup.map(x => x.rec.code).join('、')} がもう登録されています。ファイルを選び直してください`, 'circle-alert'); return; }
    await snapshot(`得意先・宛名の取込の前（${R.fileName}）`);
  const at = nowIso(); const made = [];
  let nAddr = 0;
  for (const x of adds) {
    const r = x.rec;
    if (r.target === 'addr') {
      S.addressees.push({ id: uid(), createdAt: at, updatedAt: at, code: r.code, name: r.name, kana: r.kana, honorific: '', zip: r.zip, address: r.address, address2: r.address2, tel: r.tel, fax: r.fax, memo: '', active: true, needsCheck: r.needsCheck, legacy: { ...r.legacy, importedAt: at, fileName: R.fileName } });
      nAddr++; continue;
    }
    const c = { id: uid(), createdAt: at, updatedAt: at, code: r.code, name: r.name, kana: r.kana, zip: r.zip, address: r.address, address2: r.address2, tel: r.tel, fax: r.fax, closingDay: r.closingDay, taxRounding: r.taxRounding, billToId: null, payNote: '', memo: '', opening: { date: '', balance: 0 }, active: true, destinations: [], needsCheck: r.needsCheck, legacy: { ...r.legacy, importedAt: at, fileName: R.fileName } };
    S.customers.push(c); made.push([c, r.billTo]);
  }
  for (const [c, b] of made) if (b != null) { const t = S.customers.find(x => Number(x.code) === b); if (t) c.billToId = t.id; }
  logAction('得意先・宛名を取込', `得意先 ${made.length} 件・宛名 ${nAddr} 件（${R.fileName}）`);
  await save(true);
  ui.ci = null; ui.cl = { q: '', show: '' };
  toast(`得意先を ${made.length} 件、宛名（仕入先など）を ${nAddr} 件取り込みました`); go(made.length ? '#customers' : '#labels');
}
