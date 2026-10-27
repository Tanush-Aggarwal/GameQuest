import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

async function extract() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  
  const refPath = path.resolve('C:/Users/ASUS/.gemini/antigravity-cli/brain/9a1ae09e-8ccf-41ea-ae75-fcb5bce5b0d7/.user_uploaded/uploaded_media_0_1793098594772.png');
  const fileUrl = 'file:///' + refPath.replace(/\\/g, '/');

  await page.goto(fileUrl);
  await page.waitForLoadState('networkidle');

  const outDir = path.resolve('client/public/assets');
  fs.mkdirSync(outDir, { recursive: true });

  // In the 1536 x 1024 composite reference:
  // Sidebar is roughly x: 0 to 160
  // Top nav is roughly y: 0 to 45
  // Hero is roughly x: 160 to 1536, y: 0 to 365
  // In the hero:
  // Landscape artwork extends across the right half: roughly x: 500 to 1536, y: 0 to 365
  // Trending cards: y is roughly 418 to 625
  // Right column (rec + community): x is roughly 1110 to 1500
  const crops = [
    // Hero fantasy artwork
    { name: 'hero-fantasy.jpg', x: 450, y: 0, w: 1086, h: 365 },
    // Full hero backdrop
    { name: 'hero-landscape.jpg', x: 160, y: 0, w: 1376, h: 365 },
    // Trending 1: Hollow Knight Silksong
    { name: 'trending-hollow-knight.jpg', x: 190, y: 418, w: 175, h: 140 },
    // Trending 2: Elden Ring Nightreign
    { name: 'trending-elden-ring.jpg', x: 376, y: 418, w: 175, h: 140 },
    // Trending 3: Clair Obscur Expedition 33
    { name: 'trending-clair-obscur.jpg', x: 561, y: 418, w: 175, h: 140 },
    // Trending 4: Hades II
    { name: 'trending-hades-2.jpg', x: 743, y: 418, w: 175, h: 140 },
    // Trending 5: Zenless Zone Zero
    { name: 'trending-zenless.jpg', x: 926, y: 418, w: 175, h: 140 },
    // Recommendation: Genshin Impact adventure
    { name: 'rec-genshin.jpg', x: 1110, y: 365, w: 395, h: 175 },
    // Community banner
    { name: 'community-banner.jpg', x: 1110, y: 550, w: 395, h: 90 }
  ];

  for (const crop of crops) {
    const dataUrl = await page.evaluate((c) => {
      const img = document.querySelector('img');
      const canvas = document.createElement('canvas');
      canvas.width = c.w;
      canvas.height = c.h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, c.x, c.y, c.w, c.h, 0, 0, c.w, c.h);
      return canvas.toDataURL('image/jpeg', 0.95);
    }, crop);
    const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, '');
    fs.writeFileSync(path.join(outDir, crop.name), Buffer.from(base64, 'base64'));
    console.log('Saved', crop.name);
  }

  await browser.close();
  console.log('All crops extracted successfully!');
}

extract().catch(console.error);
