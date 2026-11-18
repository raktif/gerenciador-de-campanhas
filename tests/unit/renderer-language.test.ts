import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const englishUiCopy =
  /(?<![\p{L}\p{N}_])(?:accept(?:ed)?|add|apply|archive(?:d)?|back|cancel|changes?|choose|click|close|confirm|continue|create|created|current|delete(?:d)?|details|discard|download|edit|empty|error|errors|failed|failure|fields?|filter|finish|help|import|export|invalid|items?|list|loading|manage|name|next|none|open|options|page|please|previous|refresh|remove|required|reset|retry|save|saved|search|select|selected|settings|source|start|submit|success|update(?:d)?|upload|view|warning|yes)(?![\p{L}\p{N}_])/iu;
const copyAttributes =
  /\b(?:aria-label|placeholder|title|alt|retryLabel|label)\s*=\s*["']([^"']+)["']/giu;
const jsxText = />([^<>{}]+)<\/[A-Za-z]/gu;
const stringLiteral = /(["'])([^"'\\\r\n]{2,})\1/gu;
const templateLiteral = /`((?:\\.|[^`])*)`/gsu;
const identifierValue = /^[a-z][a-z0-9._-]*$/u;
const cssClassValue = /^[a-z0-9\s:/#.[\](),%-_]+$/u;

describe('inventário de idioma da interface', () => {
  it('não expõe rótulos, ajuda ou textos JSX comuns em inglês', async () => {
    const files = await listSource(path.resolve('src/renderer'));
    const findings: string[] = [];
    for (const file of files) {
      const source = await readFile(file, 'utf8');
      const relative = path.relative(process.cwd(), file);
      for (const match of source.matchAll(stringLiteral)) {
        const text = match[2]?.trim();
        if (
          text !== undefined &&
          !text.includes('throw new Error') &&
          !identifierValue.test(text) &&
          !cssClassValue.test(text) &&
          !text.includes('/') &&
          englishUiCopy.test(text)
        )
          findings.push(`${relative}: ${text}`);
      }
      for (const match of source.matchAll(templateLiteral)) {
        const text = match[1]?.replace(/\$\{[^}]*\}/gu, ' ').trim();
        if (text !== undefined && !cssClassValue.test(text) && englishUiCopy.test(text))
          findings.push(`${relative}: ${text}`);
      }
      for (const match of source.matchAll(copyAttributes)) {
        const text = match[1]?.trim();
        if (text !== undefined && !text.includes('throw new Error') && englishUiCopy.test(text))
          findings.push(`${relative}: ${text}`);
      }
      for (const match of source.matchAll(jsxText)) {
        const text = match[1]?.trim();
        if (text !== undefined && !text.includes('throw new Error') && englishUiCopy.test(text))
          findings.push(`${relative}: ${text}`);
      }
    }
    expect(findings).toEqual([]);
  });
});

async function listSource(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) return listSource(target);
      return /\.(?:ts|tsx)$/u.test(entry.name) ? [target] : [];
    }),
  );
  return nested.flat();
}
