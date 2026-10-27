// Lighthouse on Home and one game page, signed in (production build), mobile and desktop.
//
//   node scripts/ui-audit/lighthouse.mjs
//
// Chrome is started with a debugging port; Playwright logs in as the demo account in that same Chrome, then Lighthouse
// audits it without clearing storage, so the pages are audited as the signed-in user sees them.
import fs from 'node:fs';
import { launch } from 'chrome-launcher';
import { chromium } from 'playwright';
import lighthouse from 'lighthouse';

const WEB = process.env.AUDIT_WEB ?? 'http://localhost:4173';
const API = process.env.AUDIT_API ?? 'http://localhost:4001/api/v1';
const REPORT = process.env.AUDIT_LH_REPORT ?? 'docs/screenshots/lighthouse-report.json';

const chrome = await launch({ chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'] });
const browser = await chromium.connectOverCDP(`http://localhost:${chrome.port}`);
const context = browser.contexts()[0] ?? (await browser.newContext());
const page = await context.newPage();
await page.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
await page.getByLabel('Email').fill('demo@gamequest.dev');
await page.getByLabel('Password').fill((process.env.AUDIT_PASSWORD ?? 'Demo1234!'));
await page.getByRole('button', { name: 'Log in' }).click();
await page.waitForURL(`${WEB}/`);
const entry = (await (await context.request.get(`${API}/library?limit=5`)).json()).items?.find((e) => e.game?.slug);
await page.close();

const targets = [['home', '/'], ...(entry ? [['game', `/games/${entry.game.slug}`]] : [])].filter(([name]) => !process.env.AUDIT_ONLY || process.env.AUDIT_ONLY === name);
const out = [];
for (const [name, url] of targets) {
  for (const formFactor of ['mobile', 'desktop']) {
    const flags = { port: chrome.port, output: 'json', logLevel: 'error', disableStorageReset: true, onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'] };
    const config =
      formFactor === 'desktop'
        ? { extends: 'lighthouse:default', settings: { formFactor: 'desktop', screenEmulation: { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false }, throttling: { rttMs: 40, throughputKbps: 10 * 1024, cpuSlowdownMultiplier: 1 } } }
        : undefined;
    const run = await lighthouse(`${WEB}${url}`, flags, config);
    const lhr = run.lhr;
    const score = (c) => Math.round((lhr.categories[c]?.score ?? 0) * 100);
    const audit = (id) => lhr.audits[id]?.displayValue;
    out.push({
      page: name,
      formFactor,
      scores: { performance: score('performance'), accessibility: score('accessibility'), bestPractices: score('best-practices'), seo: score('seo') },
      metrics: { fcp: audit('first-contentful-paint'), lcp: audit('largest-contentful-paint'), tbt: audit('total-blocking-time'), cls: audit('cumulative-layout-shift'), si: audit('speed-index') },
      shifts: (lhr.audits['layout-shifts']?.details?.items ?? []).slice(0, 6).map((i) => ` ${i.node?.selector ?? i.node?.snippet?.slice(0, 60) ?? '?'}`),
      failing: Object.values(lhr.audits)
        .filter((a) => a.score !== null && a.score < 0.9 && a.scoreDisplayMode !== 'informative' && a.scoreDisplayMode !== 'notApplicable' && !a.id.startsWith('lcp-lazy'))
        .map((a) => `${a.id} (${Math.round(a.score * 100)}): ${a.title}`)
        .slice(0, 12),
    });
    console.log(`${name} ${formFactor}:`, JSON.stringify(out.at(-1).scores), JSON.stringify(out.at(-1).metrics));
  }
}
await browser.close();
await chrome.kill();
fs.writeFileSync(REPORT, JSON.stringify(out, null, 2));
for (const r of out) console.log(`\n${r.page} ${r.formFactor} layout shifts:\n  ${r.shifts.join('\n  ') || '(none)'}\nweak audits:\n  ${r.failing.join('\n  ') || '(none)'}`);
