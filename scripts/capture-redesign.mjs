import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const WEB = process.env.AUDIT_WEB ?? 'http://localhost:5174';
const API = process.env.AUDIT_API ?? 'http://localhost:4000/api/v1';
const OUT = path.resolve('docs/screenshots/redesign');
const DEMO = { email: 'demo@gamequest.dev', password: process.env.AUDIT_PASSWORD ?? 'Demo1234!' };

fs.mkdirSync(OUT, { recursive: true });

console.log(`Launching chromium to audit ${WEB}...`);
const browser = await chromium.launch({ channel: 'chrome', headless: true });

const context = await browser.newContext();
const page = await context.newPage();

// Login as demo user
console.log('Logging in as demo user...');
await page.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
await page.getByLabel('Email').fill(DEMO.email);
await page.getByLabel('Password').fill(DEMO.password);
await page.getByRole('button', { name: 'Log in' }).click();
await page.waitForURL(`${WEB}/`, { timeout: 15000 });
console.log('Logged in successfully!');

// Fetch a game slug for game detail page
const res = await context.request.get(`${API}/library?limit=5`);
const data = await res.json();
const gameSlug = data.items?.find((e) => e.game?.slug)?.game?.slug || 'hades';
console.log(`Using game slug: ${gameSlug}`);

const targets = [
  { name: 'home', path: '/' },
  { name: 'explore', path: '/explore' },
  { name: 'game-detail', path: `/games/${gameSlug}` },
];

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 375, height: 812 },
];

const results = [];

for (const vp of viewports) {
  for (const t of targets) {
    const p = await context.newPage();
    await p.setViewportSize({ width: vp.width, height: vp.height });
    const errors = [];
    p.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text().slice(0, 150));
    });

    console.log(`Capturing ${t.name} on ${vp.name} (${vp.width}x${vp.height})...`);
    await p.goto(`${WEB}${t.path}`, { waitUntil: 'networkidle' }).catch(() => {});
    await p.waitForTimeout(1500);

    const brokenImages = await p.evaluate(() => {
      return [...document.images]
        .filter((i) => i.complete && i.naturalWidth === 0 && i.currentSrc)
        .map((i) => i.currentSrc.slice(0, 100));
    });

    const file = path.join(OUT, `${t.name}-${vp.name}.jpg`);
    await p.screenshot({ path: file, fullPage: false, type: 'jpeg', quality: 85 });

    results.push({
      target: t.name,
      viewport: vp.name,
      file,
      errors,
      brokenImages,
    });

    await p.close();
  }
}

await context.close();
await browser.close();

console.log('--- REDESIGN SCREENSHOT SUMMARY ---');
for (const r of results) {
  console.log(`[${r.target}] [${r.viewport}]: saved to ${r.file}`);
  if (r.errors.length) console.log(`  Errors: ${r.errors.join('; ')}`);
  if (r.brokenImages.length) console.log(`  Broken images: ${r.brokenImages.join('; ')}`);
}
