// Accessibility pass: axe-core (WCAG 2.0/2.1 A and AA) on every page at phone and desktop width, and a keyboard walk
// (Tab through the page, is there always a visible focus indicator, does Ctrl+K work with the keyboard alone).
//
//   node scripts/ui-audit/a11y.mjs
import fs from 'node:fs';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const WEB = process.env.AUDIT_WEB ?? 'http://localhost:4173';
const API = process.env.AUDIT_API ?? 'http://localhost:4001/api/v1';
const REPORT = process.env.AUDIT_A11Y_REPORT ?? 'docs/screenshots/a11y-report.json';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext();

const anonPage = await context.newPage();
const results = [];

async function scan(page, name, url, width) {
  await page.setViewportSize({ width, height: width < 500 ? 812 : 900 });
  await page.goto(`${WEB}${url}`, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(1500);
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  results.push({
    name,
    width,
    violations: axe.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.length,
      sample: v.nodes.slice(0, 2).map((n) => ({ target: n.target.join(' '), summary: (n.failureSummary ?? '').split('\n').slice(0, 3).join(' | ').slice(0, 260) })),
    })),
  });
}

// signed out
for (const width of [375, 1440]) {
  await scan(anonPage, 'login', '/login', width);
  await scan(anonPage, 'register', '/register', width);
}

// signed in
await anonPage.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
await anonPage.getByLabel('Email').fill('demo@gamequest.dev');
await anonPage.getByLabel('Password').fill((process.env.AUDIT_PASSWORD ?? 'Demo1234!'));
await anonPage.getByRole('button', { name: 'Log in' }).click();
await anonPage.waitForURL(`${WEB}/`);
const get = async (p) => (await (await context.request.get(`${API}${p}`)).json());
const entry = (await get('/library?limit=5')).items?.find((e) => e.game?.slug);
const collection = (await get('/collections?limit=2')).items?.[0];
const session = (await get('/sessions?limit=2')).items?.[0];
const pages = [['home', '/'], ['library', '/library'], ['explore', '/explore'], ['collections', '/collections'], ['friends', '/friends'], ['profile', '/profile'], ['public-profile', '/u/demo'], ['sessions', '/sessions'], ['session-new', '/sessions/new']];
if (entry) pages.push(['library-entry', `/library/${entry.id}`], ['game', `/games/${entry.game.slug}`]);
if (collection) pages.push(['collection', `/collections/${collection.id}`]);
if (session) pages.push(['session', `/sessions/${session.id}`]);
for (const width of [375, 1440]) for (const [name, url] of pages) await scan(anonPage, name, url, width);

// keyboard walk
const keyboard = [];
async function walk(name, url, steps) {
  await anonPage.setViewportSize({ width: 1440, height: 900 });
  await anonPage.goto(`${WEB}${url}`, { waitUntil: 'networkidle' });
  await anonPage.waitForTimeout(1200);
  await anonPage.evaluate(() => document.activeElement?.blur());
  const stops = [];
  for (let i = 0; i < steps; i += 1) {
    await anonPage.keyboard.press('Tab');
    stops.push(
      await anonPage.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return { tag: 'BODY' };
        const cs = getComputedStyle(el);
        const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
        const ring = cs.boxShadow && cs.boxShadow !== 'none';
        const r = el.getBoundingClientRect();
        return {
          tag: el.tagName,
          name: (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 40),
          visibleIndicator: outline || Boolean(ring),
          onScreen: r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight,
        };
      }),
    );
  }
  keyboard.push({ page: name, stops, missingIndicator: stops.filter((s) => s.tag !== 'BODY' && !s.visibleIndicator).map((s) => s.name) });
}
await walk('home', '/', 25);
await walk('library', '/library', 20);
await walk('explore', '/explore', 20);
if (entry) await walk('game', `/games/${entry.game.slug}`, 25);

// the palette with the keyboard alone
await anonPage.goto(`${WEB}/`, { waitUntil: 'networkidle' });
await anonPage.keyboard.press('Control+K');
await anonPage.waitForSelector('[role=dialog]');
const focusedInInput = await anonPage.evaluate(() => document.activeElement?.getAttribute('role') === 'combobox');
await anonPage.keyboard.type('hades');
await anonPage.waitForTimeout(1200);
await anonPage.keyboard.press('ArrowDown');
await anonPage.keyboard.press('Enter');
await anonPage.waitForTimeout(1500);
const landedOn = new URL(anonPage.url()).pathname;
keyboard.push({ page: 'palette', focusedInInput, landedOn });

await browser.close();
fs.writeFileSync(REPORT, JSON.stringify({ axe: results, keyboard }, null, 2));
const bad = results.filter((r) => r.violations.length);
console.log(`axe: ${results.length} scans, ${bad.length} with violations`);
for (const r of bad) for (const v of r.violations) console.log(` - ${r.name} @${r.width}: ${v.id} (${v.impact}) x${v.nodes}: ${v.help}`);
for (const k of keyboard) console.log(`keyboard ${k.page}:`, k.missingIndicator ? `${k.stops.length} tab stops, without a visible indicator: ${JSON.stringify(k.missingIndicator)}` : JSON.stringify({ focusedInInput: k.focusedInInput, landedOn: k.landedOn }));
