import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(path.join(process.cwd(), 'src', 'renderer', 'styles.css'), 'utf8');
const campaignApp = readFileSync(
  path.join(process.cwd(), 'src', 'renderer', 'app', 'campaign-app.tsx'),
  'utf8',
);
const sharedPickerSources = ['color-picker.tsx', 'icon-picker.tsx']
  .map((file) =>
    readFileSync(path.join(process.cwd(), 'src', 'renderer', 'components', file), 'utf8'),
  )
  .join('\n');
const requiredTokens = [
  '--background',
  '--surface',
  '--surface-elevated',
  '--text-primary',
  '--text-secondary',
  '--border',
  '--accent',
  '--danger',
  '--warning',
  '--success',
  '--focus',
] as const;

describe('tokens semânticos de aparência', () => {
  it('define o contrato completo nos temas claro e escuro sem preto puro', () => {
    const light = declarationsFor(':root');
    const dark = declarationsFor(":root[data-theme='dark']");

    for (const token of requiredTokens) {
      expect(requiredToken(light, token, 'tema claro')).toMatch(/^#[0-9a-f]{6}$/i);
      expect(requiredToken(dark, token, 'tema escuro')).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(requiredToken(dark, '--background', 'tema escuro')).not.toBe('#000000');
    expect(requiredToken(dark, '--surface', 'tema escuro')).not.toBe('#000000');
  });

  it('mantém contraste textual e foco perceptível nos dois temas', () => {
    for (const selector of [':root', ":root[data-theme='dark']"] as const) {
      const tokens = declarationsFor(selector);
      expect(
        contrast(
          requiredToken(tokens, '--text-primary', selector),
          requiredToken(tokens, '--background', selector),
        ),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(
          requiredToken(tokens, '--text-secondary', selector),
          requiredToken(tokens, '--background', selector),
        ),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(
          requiredToken(tokens, '--accent', selector),
          requiredToken(tokens, '--background', selector),
        ),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(
          requiredToken(tokens, '--focus', selector),
          requiredToken(tokens, '--background', selector),
        ),
      ).toBeGreaterThanOrEqual(3);
      expect(
        contrast(
          requiredToken(tokens, '--border', selector),
          requiredToken(tokens, '--surface', selector),
        ),
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it('aplica tokens à base e preserva a redução global de movimento', () => {
    expect(styles).toContain('background: var(--background);');
    expect(styles).toContain('color: var(--text-primary);');
    expect(styles).toContain('background: var(--surface);');
    expect(styles).toContain('outline-color: var(--focus);');
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('expõe estados interativos por forma e remove cores fixas dos controles compartilhados', () => {
    expect(styles).toMatch(
      /\.action-button--secondary\[aria-pressed='true'\][^{]*\{[^}]*box-shadow:/s,
    );
    expect(styles).toMatch(
      /\.action-button--dark-navigation\[aria-current='page'\][^{]*\{[^}]*border-inline-start-width:\s*0\.25rem/s,
    );
    expect(styles).toContain(".theme-switch:not([aria-disabled='true']):hover");
    expect(sharedPickerSources).toContain('semantic-accent-control');
    expect(sharedPickerSources).not.toContain('accent-amber-700');
  });

  it('usa rótulo de navegação com contraste textual suficiente', () => {
    const tokens = declarationsFor(':root');
    expect(
      contrast(requiredToken(tokens, '--navigation-text', ':root'), '#020617'),
    ).toBeGreaterThanOrEqual(4.5);
    expect(campaignApp.match(/navigation-label/g)).toHaveLength(3);
  });
});

function declarationsFor(selector: string): Record<string, string> {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const block = new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`).exec(styles)?.[1];
  if (block === undefined) throw new Error(`Bloco CSS ausente: ${selector}`);
  const declarations: Record<string, string> = {};
  for (const match of block.matchAll(/(--[a-z-]+)\s*:\s*(#[0-9a-f]{6})\s*;/gi)) {
    const name = match[1];
    const value = match[2];
    if (name !== undefined && value !== undefined) declarations[name] = value.toLowerCase();
  }
  return declarations;
}

function requiredToken(
  declarations: Readonly<Record<string, string>>,
  token: string,
  context: string,
): string {
  const value = declarations[token];
  if (value === undefined) throw new Error(`Token CSS ausente em ${context}: ${token}`);
  return value;
}

function contrast(foreground: string, background: string): number {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map(
    (offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255,
  );
  const [red = 0, green = 0, blue = 0] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}
