import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const featuresRoot = path.join(process.cwd(), 'src', 'renderer', 'features');
const styles = readFileSync(path.join(process.cwd(), 'src', 'renderer', 'styles.css'), 'utf8');
const featureSources = collectTsxFiles(featuresRoot).map((file) => ({
  file,
  source: readFileSync(file, 'utf8'),
}));
const appSources = ['campaign-app.tsx', 'phase-zero-app.tsx'].map((file) => ({
  file,
  source: readFileSync(path.join(process.cwd(), 'src', 'renderer', 'app', file), 'utf8'),
}));
const visualSources = [...featureSources, ...appSources];
const combinedSource = visualSources.map(({ source }) => source).join('\n');

describe('contrato visual das telas de domínio', () => {
  it('não usa paleta rígida para superfícies, textos, bordas ou estados', () => {
    const rigidPaletteClass =
      /(?:bg|text|border|outline|ring|divide|placeholder|shadow|accent|from|via|to)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(?:-[0-9]{2,3})?(?:\/[0-9]{1,3})?/;
    const rigidCssColor = /#[0-9a-f]{3,8}\b|rgba?\(/i;

    for (const { file, source } of visualSources) {
      expect(source, file).not.toMatch(rigidPaletteClass);
      expect(source, file).not.toMatch(rigidCssColor);
      expect(source, file).not.toMatch(/semantic-[a-z-]+\d/);
    }
  });

  it('cobre superfícies, hierarquia textual, foco, seleção e estados de retorno', () => {
    for (const semanticClass of [
      'semantic-surface',
      'semantic-surface-muted',
      'semantic-text-primary',
      'semantic-text-secondary',
      'semantic-border',
      'semantic-focus-outline',
      'semantic-selected-surface',
      'semantic-danger-surface',
      'semantic-warning-surface',
      'semantic-success-surface',
    ]) {
      expect(combinedSource).toContain(semanticClass);
    }
  });

  it('mantém ícones e imagens sem filtros cromáticos', () => {
    expect(combinedSource).not.toMatch(/(?:filter|invert|brightness|grayscale|sepia)-\S+/);
  });

  it('define todas as classes semânticas usadas e mantém contraste na navegação', () => {
    const semanticClasses = new Set(combinedSource.match(/semantic-[a-z-]+/g) ?? []);
    for (const semanticClass of semanticClasses) {
      expect(styles, semanticClass).toMatch(new RegExp(`\\.${semanticClass}(?:[\\s,.:{]|$)`));
    }

    expect(styles).toMatch(
      /\.semantic-navigation-border\s*\{[^}]*border-color:\s*var\(--navigation-border\)/s,
    );
    expect(combinedSource).not.toMatch(
      /semantic-navigation-(?:current|surface-elevated)[^"'`]*semantic-selected-text|semantic-selected-text[^"'`]*semantic-navigation-(?:current|surface-elevated)/,
    );
    expect(combinedSource).not.toMatch(
      /semantic-navigation-surface[^"'`]*semantic-success-text|semantic-success-text[^"'`]*semantic-navigation-surface/,
    );

    for (const selector of [':root', ":root[data-theme='dark']"] as const) {
      const block = cssBlock(selector);
      const navigationSurface = cssToken(block, '--navigation-surface');
      const navigationSurfaceElevated = cssToken(block, '--navigation-surface-elevated');
      expect(
        contrast(cssToken(block, '--navigation-text'), navigationSurface),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(cssToken(block, '--navigation-text-active'), navigationSurfaceElevated),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('distingue status de campanha também por forma', () => {
    const campaignList = readFileSync(
      path.join(featuresRoot, 'campaigns', 'campaign-list.tsx'),
      'utf8',
    );
    expect(campaignList).toContain('semantic-card-accent');
    expect(campaignList).toContain('semantic-success-ring rounded-full');
    expect(campaignList).toContain('semantic-accent-ring rounded-sm');
    expect(campaignList).toContain('semantic-strong-ring rotate-45 rounded-sm');
    expect(styles).toMatch(/\.semantic-strong-ring\s*\{[^}]*--tw-ring-color:\s*var\(--border\)/s);
    for (const selector of [':root', ":root[data-theme='dark']"] as const) {
      const block = cssBlock(selector);
      expect(
        contrast(cssToken(block, '--border'), cssToken(block, '--surface')),
      ).toBeGreaterThanOrEqual(3);
    }
  });
});

function collectTsxFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectTsxFiles(entryPath);
    return entry.isFile() && entry.name.endsWith('.tsx') ? [entryPath] : [];
  });
}

function cssBlock(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const block = new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`).exec(styles)?.[1];
  if (block === undefined) throw new Error(`Bloco CSS ausente: ${selector}`);
  return block;
}

function cssToken(block: string, token: string): string {
  const value = new RegExp(`${token}:\\s*(#[0-9a-f]{6})`, 'i').exec(block)?.[1];
  if (value === undefined) throw new Error(`Token CSS ausente: ${token}`);
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
