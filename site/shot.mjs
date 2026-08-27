// Capture the review viewports. Uses the installed Chrome channel so no
// browser download is needed. Reports scrollWidth vs viewport per shot, so a
// capture that silently laid out at the wrong width is visible, not assumed.
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:4321/';
const outDir = process.argv[3] ?? '.impeccable/review';
const targets = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'mobile',  width: 390,  height: 844  },
];

const browser = await chromium.launch({ channel: 'chrome' });
for (const t of targets) {
  const page = await browser.newPage({ viewport: { width: t.width, height: t.height } });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.emulateMedia({ reducedMotion: 'reduce' });   // settle entrance motion
  const m = await page.evaluate(() => ({
    vw: document.documentElement.clientWidth,
    sw: document.body.scrollWidth,
  }));
  const overflow = m.sw > m.vw + 1 ? `  OVERFLOW +${m.sw - m.vw}px` : '  ok';
  console.log(`${t.name.padEnd(8)} viewport=${m.vw} scrollWidth=${m.sw}${overflow}`);
  await page.screenshot({ path: `${outDir}/${t.name}.png`, fullPage: false });
  await page.screenshot({ path: `${outDir}/${t.name}-full.png`, fullPage: true });
  await page.close();
}
await browser.close();
