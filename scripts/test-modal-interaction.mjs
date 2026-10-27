import { chromium } from 'playwright';

async function run() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto('http://localhost:5174/login', { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill('demo@gamequest.dev');
  await page.getByLabel('Password').fill('Demo1234!');
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL('http://localhost:5174/', { timeout: 15000 });

  // 1. Open trailer modal
  const watchBtn = page.getByRole('button', { name: 'Watch Trailer' });
  await watchBtn.click();
  await page.waitForSelector('[role="dialog"]');
  console.log('Dialog opened successfully!');

  // Check body overflow is locked
  const bodyOverflow = await page.evaluate(() => document.body.style.overflow);
  console.log('Body overflow:', bodyOverflow);
  if (bodyOverflow !== 'hidden') throw new Error('Expected body overflow hidden');

  // 2. Click inside the modal content - dialog should STAY OPEN
  const dialog = page.locator('[role="dialog"]');
  await dialog.click();
  await page.waitForTimeout(300);
  if (!await dialog.isVisible()) throw new Error('Dialog closed unexpectedly on inside click');
  console.log('Dialog stayed open on inside click!');

  // 3. Press Escape - dialog should close and body overflow restore
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  if (await dialog.isVisible()) throw new Error('Dialog failed to close on Escape');
  const bodyOverflowAfterEsc = await page.evaluate(() => document.body.style.overflow);
  console.log('Body overflow after Escape:', bodyOverflowAfterEsc || 'default');
  if (bodyOverflowAfterEsc !== '') throw new Error('Body overflow not restored after Escape');
  console.log('Escape dismiss & scroll restore verified!');

  // 4. Reopen and test backdrop click dismiss
  await watchBtn.click();
  await page.waitForSelector('[role="dialog"]');
  // Click backdrop outside dialog (top left corner)
  await page.mouse.click(50, 50);
  await page.waitForTimeout(300);
  if (await dialog.isVisible()) throw new Error('Dialog failed to close on backdrop click');
  console.log('Backdrop click dismiss verified!');

  await browser.close();
  console.log('All modal interaction tests PASSED!');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
