// @vitest-environment node
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import config from '../../tailwind.config.js';

// Compiles real CSS with the real config. A class that Tailwind cannot generate is silently dropped, and a
// test that only looks at class names in jsdom would never notice (that is how the art scrim once shipped
// without any CSS), so these assertions read the generated stylesheet.
let run = 0;
async function compile(classes) {
  run += 1;
  // Tailwind reuses its compile context while the config looks the same, which would hand a later test the
  // earlier test's classes; a throwaway theme key makes every compile start fresh.
  const fresh = { ...config, theme: { ...config.theme, extend: { ...config.theme.extend, __run: run } } };
  const result = await postcss([tailwind({ ...fresh, content: [{ raw: `<div class="${classes}"></div>`, extension: 'html' }] })]).process(
    '@tailwind utilities;',
    { from: undefined },
  );
  return result.css;
}

describe('design tokens in Tailwind', () => {
  it('plain token colours stay the bare CSS variable', async () => {
    const css = await compile('bg-bg text-text-muted border-border bg-accent');
    expect(css).toMatch(/\.bg-bg\s*\{[^}]*var\(--bg\)/);
    expect(css).toMatch(/\.text-text-muted\s*\{[^}]*var\(--text-muted\)/);
    expect(css).toMatch(/\.border-border\s*\{[^}]*var\(--border\)/);
    expect(css).toMatch(/\.bg-accent\s*\{[^}]*var\(--accent\)/);
  });

  it('opacity modifiers on token colours generate real CSS (they used to be dropped)', async () => {
    const css = await compile('bg-bg/50 bg-bg/60 border-accent/30 text-text/90 bg-accent/15 bg-surface-raised/60 border-border/60');
    for (const [cls, token, pct] of [
      ['bg-bg/50', 'bg', '0.5'],
      ['bg-bg/60', 'bg', '0.6'],
      ['border-accent/30', 'accent', '0.3'],
      ['text-text/90', 'text', '0.9'],
      ['bg-accent/15', 'accent', '0.15'],
      ['bg-surface-raised/60', 'surface-raised', '0.6'],
      ['border-border/60', 'border', '0.6'],
    ]) {
      const rule = new RegExp(`\\.${cls.replace('/', '\\\\/')}\\s*\\{[^}]*color-mix\\(in srgb, var\\(--${token}\\) calc\\(${pct.replace('.', '\\.')} \\* 100%\\), transparent\\)`);
      expect(css, `${cls} should compile to a color-mix of --${token}`).toMatch(rule);
    }
  });

  it('the art scrim gradient is generated, with its three stops', async () => {
    const css = await compile('bg-gradient-to-r from-bg/90 via-bg/80 to-bg/70');
    expect(css).toMatch(/\.bg-gradient-to-r\s*\{[^}]*linear-gradient/);
    expect(css).toMatch(/\.from-bg\\\/90\s*\{[^}]*color-mix\(in srgb, var\(--bg\) calc\(0\.9 \* 100%\)/);
    expect(css).toMatch(/\.via-bg\\\/80\s*\{[^}]*color-mix\(in srgb, var\(--bg\) calc\(0\.8 \* 100%\)/);
    expect(css).toMatch(/\.to-bg\\\/70\s*\{[^}]*color-mix\(in srgb, var\(--bg\) calc\(0\.7 \* 100%\)/);
  });

  it('every colour the UI uses is a token, and none is a raw palette value', () => {
    const colors = config.theme.extend.colors;
    expect(Object.keys(colors)).toEqual(expect.arrayContaining(['bg', 'surface', 'surface-raised', 'border', 'text', 'text-muted', 'accent', 'reward']));
    for (const fn of Object.values(colors)) expect(typeof fn).toBe('function');
  });
});
