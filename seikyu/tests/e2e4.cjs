// 画面の動作確認 その4（v0.3.0）：宛名ラベル（仕入先などの宛名・ラベル用紙・印刷・PDF）
// テスト用の新しいブラウザで行う。宛名はすべて架空。
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const URL = 'http://localhost:8766/' + encodeURIComponent('請求システム.html');
const OUT = path.join(__dirname, '..', 'shots'); fs.mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0; const errors = [];
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'OK  ' : 'NG  '}${name}${extra ? '  ' + extra : ''}`); };

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 } }); const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const nav = async h => { await p.evaluate(x => { location.hash = x; }, h); await p.waitForTimeout(250); };
  await p.goto(URL + '#home'); await p.waitForSelector('h1'); await p.waitForTimeout(400);

  // ---- 画面と宛名の一覧 ----
  ok('メニューに「宛名ラベル」', await p.isVisible('.nav a[data-nav=labels]'));
  await p.click('.nav a[data-nav=labels]'); await p.waitForTimeout(300);
  ok('宛名ラベルの画面が開く', (await p.textContent('h1')) === '宛名ラベル');
  ok('仕入先などの宛名が出る（3件）', (await p.$$('#view tbody tr')).length === 3);
  ok('住所が空欄の宛名は選べず、理由が出る', (await p.$$('.lbPick')).length === 2 && (await p.textContent('#view')).includes('住所が空欄のため選べません'));
  ok('住所が空欄の宛名があることを知らせる', (await p.textContent('#view')).includes('住所が空欄の宛名が 1 件'));
  ok('宛名を選ぶ前は印刷ボタンが押せない', await p.isDisabled('[data-act=lbPrint]'));
  await p.click('[data-act=lbAll][data-v="1"]'); await p.waitForTimeout(250);
  ok('すべて選ぶ：2件・ラベル 2 枚（用紙 1 枚）', (await p.textContent('#lbCount')).includes('2 件') && (await p.textContent('#lbSummary')).includes('ラベル 2 枚（用紙 1 枚）'));

  // ---- ラベルの並べ方 ----
  const lay = await p.evaluate(() => {
    const host = document.createElement('div'); host.innerHTML = labelPages(ui.lb.sel, { copies: 1, start: 1 });
    const lbs = [...host.querySelectorAll('.lb')];
    return { pages: host.querySelectorAll('.page').length, n: lbs.length, s0: [lbs[0].style.left, lbs[0].style.top, lbs[0].style.width], s1: [lbs[1].style.left, lbs[1].style.top], text: lbs[0].textContent.replace(/\s+/g, ' ').trim() };
  });
  ok('12面：1ページに2枚、左上から右へ', lay.pages === 1 && lay.n === 2 && lay.s0.join() === '18.6mm,21.6mm,86.4mm' && lay.s1.join() === '105mm,21.6mm', JSON.stringify(lay));
  ok('ラベルに〒・住所1・住所2・名前・御中', /〒000-0002 架空県見本市2-3-4 見本ビル3階 見本資材\(株\)御中/.test(lay.text), lay.text);
  const st = await p.evaluate(() => { const h = document.createElement('div'); h.innerHTML = labelPages(ui.lb.sel, { copies: 3, start: 12 }); return { pages: h.querySelectorAll('.page').length, n: h.querySelectorAll('.lb').length, first: h.querySelector('.lb').style.top }; });
  ok('使いかけの用紙（12枚目から）・3枚ずつ：6枚、用紙2枚', st.pages === 2 && st.n === 6 && st.first === `${(21.6 + 5 * 42.3).toFixed(1).replace(/\.0$/, '')}mm`, JSON.stringify(st));
  const fit = await p.evaluate(() => [fitPt('見本資材(株)', 76.4, 13, 7.5, 2.5), fitPt('とても長い名前の架空の会社株式会社第二工場資材部調達課', 76.4, 13, 7.5, 2.5)]);
  ok('長い名前は文字を小さくする', fit[0] === 13 && fit[1] < 13 && fit[1] >= 7.5, JSON.stringify(fit));

  // ---- 用紙の設定 ----
  await p.selectOption('#lsSheet', 'a24'); await p.waitForTimeout(250);
  ok('24面に変えると開始位置が 24 まで選べる', (await p.$$eval('#lsStart option', e => e.length)) === 24);
  await p.selectOption('#lsSheet', 'custom'); await p.waitForTimeout(250);
  ok('「自分で決める」で寸法の欄が出る', await p.isVisible('#lcCols'));
  await p.fill('#lcCols', '9'); await p.dispatchEvent('#lcCols', 'change'); await p.waitForTimeout(200);
  ok('列の数が範囲外ならエラー（値は変えない）', (await p.$$eval('.err-msg', e => e.map(x => x.textContent))).some(x => x.includes('1〜6')) && await p.evaluate(() => S.labelSettings.custom.cols === 3));
  await p.fill('#lcW', '120'); await p.dispatchEvent('#lcW', 'change'); await p.waitForTimeout(200);
  await p.click('[data-act=lbAll][data-v="1"]'); await p.waitForTimeout(200);
  await p.click('[data-act=lbPrint]'); await p.waitForTimeout(250);
  ok('A4 からはみ出す寸法では印刷しない（理由を出す）', !(await p.isVisible('#dlg[open]')) && (await p.textContent('#toast')).includes('はみ出します'));
  await p.selectOption('#lsSheet', 'a12'); await p.waitForTimeout(250);
  ok('用紙の設定は保存される', await p.evaluate(() => S.labelSettings.sheet === 'a12'));

  // ---- 宛名の登録（敬称・コードの重なり・使わない） ----
  await nav('#addressee-new');
  await p.fill('#aCode', '901'); await p.fill('#aName', '架空商店'); await p.click('#aForm button[type=submit]'); await p.waitForTimeout(250);
  ok('同じコードはエラー', (await p.$$eval('.err-msg', e => e.map(x => x.textContent))).some(x => x.includes('901')));
  await p.fill('#aCode', '904'); await p.selectOption('#aHon', '様'); await p.fill('#aZip', '000-0004'); await p.fill('#aAddr', '架空県見本市9-9');
  await p.click('#aForm button[type=submit]'); await p.waitForTimeout(400);
  ok('宛名を登録できる（ラベルの画面へ戻る）', (await p.textContent('h1')) === '宛名ラベル' && await p.evaluate(() => S.addressees.some(a => a.code === 904)));
  const k904 = await p.evaluate(() => 'a:' + S.addressees.find(a => a.code === 904).id);
  ok('宛名ごとの敬称（様）を使う', await p.evaluate(k => { const h = document.createElement('div'); h.innerHTML = labelPages([k]); return h.textContent.includes('架空商店様'); }, k904));
  const id903 = await p.evaluate(() => S.addressees.find(a => a.code === 903).id);
  await nav('#addressee-' + id903); await p.fill('#aAddr', '架空県塗料町1-1'); await p.uncheck('#aNeedsCheck'); await p.click('#aForm button[type=submit]'); await p.waitForTimeout(400);
  ok('住所を入れると選べるようになる', (await p.$$('.lbPick')).length === 4);
  const id902 = await p.evaluate(() => S.addressees.find(a => a.code === 902).id);
  await nav('#addressee-' + id902); await p.selectOption('#aActive', '0'); await p.click('#aForm button[type=submit]'); await p.waitForTimeout(400);
  ok('「使わない」にした宛名は一覧に出ない（消さない）', (await p.$$('#view tbody tr')).length === 3 && await p.evaluate(() => S.addressees.some(a => a.code === 902 && !a.active)));
  await p.selectOption('#lbKind', 'cust'); await p.waitForTimeout(250);
  ok('得意先のラベルも選べる（住所のない得意先は選べない）', (await p.$$('.lbPick')).length >= 1 && (await p.textContent('#view')).includes('住所が空欄のため選べません'));
  await p.selectOption('#lbKind', 'addr'); await p.waitForTimeout(200);
  await p.reload(); await p.waitForSelector('h1'); await p.waitForTimeout(300);
  ok('再読み込みしても宛名が残る', await p.evaluate(() => S.addressees.length === 4));

  // ---- 印刷（ファイルを直接開いたとき） ----
  await nav('#labels'); await p.click('[data-act=lbAll][data-v="1"]'); await p.waitForTimeout(250);
  await p.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
  await p.click('[data-act=lbPrint]'); await p.waitForTimeout(300);
  ok('印刷の画面に見本が出る', (await p.$$('#pvScale .label-page')).length === 1 && (await p.$$('#pvScale .lb')).length === 3);
  await p.click('#dlg .btn.primary'); await p.waitForTimeout(300);
  ok('「印刷する」で印刷する', await p.evaluate(() => window.__printed === 1 && document.querySelectorAll('#print-root .label-page').length === 1));
  ok('印刷の記録を残す', await p.evaluate(() => S.log.some(l => l.action === '宛名ラベルを印刷・PDF')));
  await p.keyboard.press('Escape');

  // ---- claude.ai と同じく iframe の中：PDF ----
  const c2 = await b.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
  const host = await c2.newPage(); host.on('pageerror', e => errors.push('frame: ' + e.message));
  await host.setContent(`<iframe src="${URL}#labels" style="width:1340px;height:880px;border:0"></iframe>`); await host.waitForTimeout(1200);
  const f = host.frames()[1];
  await f.waitForSelector('h1'); await f.click('[data-act=lbAll][data-v="1"]'); await f.waitForTimeout(250);
  await f.selectOption('#lsCopies', '7'); await f.waitForTimeout(250);
  await f.click('[data-act=lbPrint]'); await f.waitForTimeout(300);
  ok('iframe では「印刷する」はなく「PDFで保存」', !(await f.$('#dlg .btn >> text=印刷する')) && await f.isVisible('#dlg .btn >> text=PDFで保存'));
  const dl = host.waitForEvent('download', { timeout: 90000 });
  await f.click('#dlg .btn >> text=PDFで保存');
  const d = await dl; const file = path.join(OUT, 'v030_labels.pdf'); await d.saveAs(file);
  const pages = +(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [file]).toString()) || [])[1];
  ok('PDF ができる（2件×7枚＝14枚 → 用紙2枚）', fs.readFileSync(file).slice(0, 5).toString() === '%PDF-' && pages === 2, `（${pages}ページ）`);
  execFileSync('pdftoppm', ['-r', '50', '-png', '-f', '1', '-l', '1', file, path.join(OUT, 'v030_labels')]);

  ok('JavaScript のエラーがない', errors.length === 0, errors.slice(0, 3).join(' / '));
  await b.close(); console.log(`\n${pass} 件 OK、${fail} 件 NG`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
