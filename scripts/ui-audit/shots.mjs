// Screenshots of every page at 375, 768 and 1440 px, plus a few open states, into docs/screenshots/.
// It also records, per page and width: horizontal overflow, console errors, failed requests, and broken images.
//
//   node scripts/ui-audit/shots.mjs            (API on :4000 and the built client on :4173, see scripts/ui-audit/README.md)
//
// Uses the Chrome that is already installed (no browser download) and the seeded demo account.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const WEB = process.env.AUDIT_WEB ?? 'http://localhost:4173';
const API = process.env.AUDIT_API ?? 'http://localhost:4000/api/v1';
const OUT = path.resolve('docs/screenshots');
const REPORT = process.env.AUDIT_REPORT ?? path.resolve('docs/screenshots/report.json');
const WIDTHS = [375, 768, 1440];
const HEIGHT = { 375: 812, 768: 1024, 1440: 900 };
const DEMO = { email: 'demo@gamequest.dev', password: process.env.AUDIT_PASSWORD ?? 'Demo1234!' };

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report = [];

async function visit(context, name, url, width, { after, fullPage = true } = {}) {
  const page = await context.newPage();
  await page.setViewportSize({ width, height: HEIGHT[width] });
  const problems = { console: [], failed: [], brokenImages: [] };
  page.on('console', (m) => m.type() === 'error' && problems.console.push(m.text().slice(0, 200)));
  page.on('requestfailed', (r) => problems.failed.push(`${r.method()} ${r.url().slice(0, 120)} ${r.failure()?.errorText ?? ''}`));
  page.on('response', (r) => r.status() >= 400 && problems.failed.push(`${r.status()} ${r.url().slice(0, 120)}`));
  await page.goto(`${WEB}${url}`, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(1200); // first paint, rails near the top start loading
  // scroll down and back, so lazy images and lazy rails below the fold load before a full-page capture
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 500) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(1500);
  if (after) await after(page);
  const facts = await page.evaluate(() => ({
    title: document.title,
    h1: [...document.querySelectorAll('h1')].map((h) => h.textContent.trim()),
    overflowX: document.documentElement.scrollWidth - window.innerWidth,
    brokenImages: [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.currentSrc).map((i) => i.currentSrc.slice(0, 100)),
  }));
  const file = `${name}-${width}.jpg`; // JPEG keeps 54 full-page captures small enough to commit
  await page.screenshot({ path: path.join(OUT, file), fullPage, type: 'jpeg', quality: 72 });
  report.push({ name, url, width, file, ...facts, console: problems.console, failed: problems.failed });
  await page.close();
}

// ── signed out: the sign-in pages ───────────────────────────────────────────────────────────────
const anon = await browser.newContext();
for (const width of WIDTHS) {
  await visit(anon, 'login', '/login', width, { fullPage: false });
  await visit(anon, 'register', '/register', width, { fullPage: false });
}
await anon.close();

// ── signed in ───────────────────────────────────────────────────────────────────────────────────
const context = await browser.newContext();
const login = await context.newPage();
await login.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
await login.getByLabel('Email').fill(DEMO.email);
await login.getByLabel('Password').fill(DEMO.password);
await login.getByRole('button', { name: 'Log in' }).click();
await login.waitForURL(`${WEB}/`, { timeout: 15000 });
await login.close();

const get = async (p) => (await (await context.request.get(`${API}${p}`)).json());
const library = await get('/library?limit=5');
const entry = library.items?.find((e) => e.game?.slug) ?? null;
const collections = await get('/collections?limit=5');
const sessions = await get('/sessions?limit=5');
const trailerGame = (await get('/games?limit=1')).items?.[0];

const pages = [
  ['home', '/'],
  ['library', '/library'],
  ['explore', '/explore'],
  ['collections', '/collections'],
  ['friends', '/friends'],
  ['profile', '/profile'],
  ['public-profile', '/u/demo'],
  ['sessions', '/sessions'],
  ['session-new', '/sessions/new'],
  ['not-found', '/this-page-does-not-exist'],
];
if (entry) pages.push(['library-entry', `/library/${entry.id}`]);
if (entry || trailerGame) pages.push(['game', `/games/${(entry?.game ?? trailerGame).slug}`]);
if (collections.items?.[0]) pages.push(['collection', `/collections/${collections.items[0].id}`]);
if (sessions.items?.[0]) pages.push(['session', `/sessions/${sessions.items[0].id}`]);

for (const width of WIDTHS) for (const [name, url] of pages) await visit(context, name, url, width);

// ── open states, at desktop and phone ───────────────────────────────────────────────────────────
for (const width of [375, 1440]) {
  await visit(context, 'palette-open', '/', width, {
    fullPage: false,
    after: async (page) => {
      await page.keyboard.press('Control+K');
      await page.getByRole('combobox').fill('hades');
      await page.waitForTimeout(1200);
    },
  });
  if (entry) {
    await visit(context, 'library-quick-menu', '/library', width, {
      fullPage: false,
      after: async (page) => {
        await page.getByRole('button', { name: /^Change status of/ }).first().click();
        await page.waitForTimeout(300);
      },
    });
    await visit(context, 'lightbox-open', `/games/${entry.game.slug}`, width, {
      fullPage: false,
      after: async (page) => {
        const shot = page.getByRole('button', { name: /^Open .* screenshot 1 of/ });
        if (await shot.count()) {
          await shot.first().click();
          await page.waitForTimeout(800);
        }
      },
    });
  }
}

await context.close();
await browser.close();
fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
const bad = report.filter((r) => r.overflowX > 0 || r.console.length || r.failed.length || r.brokenImages.length);
console.log(`${report.length} screenshots in docs/screenshots; ${bad.length} with problems`);
for (const r of bad) console.log(` - ${r.name} @${r.width}: overflowX=${r.overflowX} console=${r.console.length} failed=${r.failed.length} brokenImages=${r.brokenImages.length}`);
