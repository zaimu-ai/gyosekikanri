// ファイルを直接開いた（file://）ときに、保存・再読み込み・印刷の準備ができるか
const { chromium } = require('playwright'); const path = require('path');
(async () => {
  const dir = path.join(__dirname, '..', 'tmp-profile'); 
  const url = 'file://' + path.join(__dirname, '..', 'dist', '請求システム.html');
  const ctx = await chromium.launchPersistentContext(dir, { viewport: { width: 1366, height: 900 } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(url + '#home'); await p.waitForSelector('h1'); await p.waitForTimeout(800);
  const k1 = await p.evaluate(() => ({ storage: storageKind, mode: MODE, n: S.deliveries.length, canPrint: canPrint() }));
  await p.evaluate(() => { S.memoTest = 'file-mode'; return save(true); });
  await ctx.close();
  const ctx2 = await chromium.launchPersistentContext(dir, { viewport: { width: 1366, height: 900 } });
  const p2 = await ctx2.newPage(); await p2.goto(url + '#home'); await p2.waitForSelector('h1'); await p2.waitForTimeout(800);
  const k2 = await p2.evaluate(() => ({ storage: storageKind, kept: S.memoTest === 'file-mode', n: S.deliveries.length }));
  await ctx2.close();
  console.log(JSON.stringify({ k1, k2, errs }));
  process.exit(k1.storage === 'indexeddb' && k2.kept && k1.canPrint && !errs.length ? 0 : 1);
})();
