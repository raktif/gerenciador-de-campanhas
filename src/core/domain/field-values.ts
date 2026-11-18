export interface ProgressValue {
  current: number;
  final: number;
  legacyCurrent?: true;
}

export function isProgressValue(value: unknown): value is ProgressValue {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  const isLegacyCurrent = candidate.legacyCurrent === true && typeof candidate.current === 'number';
  return (
    typeof candidate.current === 'number' &&
    Number.isFinite(candidate.current) &&
    (candidate.current >= 0 || isLegacyCurrent) &&
    Number.isFinite(candidate.final) &&
    typeof candidate.final === 'number' &&
    candidate.final > 0 &&
    candidate.current <= candidate.final &&
    Object.keys(candidate).every(
      (key) => key === 'current' || key === 'final' || (isLegacyCurrent && key === 'legacyCurrent'),
    )
  );
}

export function structuredJsonToRichText(source: string): string {
  const parser = new StructuredJsonParser(source);
  return renderStructuredValue(parser.parse());
}

type StructuredJsonValue =
  | { type: 'object'; entries: { key: string; value: StructuredJsonValue }[] }
  | { type: 'array'; items: StructuredJsonValue[] }
  | { type: 'string'; raw: string }
  | { type: 'number'; raw: string }
  | { type: 'boolean'; value: boolean }
  | { type: 'null' };

class StructuredJsonParser {
  private position = 0;

  public constructor(private readonly source: string) {}

  public parse(): StructuredJsonValue {
    const value = this.parseValue();
    this.skipWhitespace();
    if (this.position !== this.source.length) this.fail();
    return value;
  }

  private parseValue(): StructuredJsonValue {
    this.skipWhitespace();
    const character = this.source[this.position];
    if (character === '{') return this.parseObject();
    if (character === '[') return this.parseArray();
    if (character === '"') return { type: 'string', raw: this.parseString() };
    if (character === 't' && this.consumeLiteral('true')) return { type: 'boolean', value: true };
    if (character === 'f' && this.consumeLiteral('false')) return { type: 'boolean', value: false };
    if (character === 'n' && this.consumeLiteral('null')) return { type: 'null' };
    return this.parseNumber();
  }

  private parseObject(): StructuredJsonValue {
    this.position += 1;
    this.skipWhitespace();
    const entries: { key: string; value: StructuredJsonValue }[] = [];
    if (this.consume('}')) return { type: 'object', entries };
    while (this.position < this.source.length) {
      this.skipWhitespace();
      if (this.source[this.position] !== '"') this.fail();
      const key = this.parseString();
      this.skipWhitespace();
      if (!this.consume(':')) this.fail();
      entries.push({ key, value: this.parseValue() });
      this.skipWhitespace();
      if (this.consume('}')) return { type: 'object', entries };
      if (!this.consume(',')) this.fail();
    }
    return this.fail();
  }

  private parseArray(): StructuredJsonValue {
    this.position += 1;
    this.skipWhitespace();
    const items: StructuredJsonValue[] = [];
    if (this.consume(']')) return { type: 'array', items };
    while (this.position < this.source.length) {
      items.push(this.parseValue());
      this.skipWhitespace();
      if (this.consume(']')) return { type: 'array', items };
      if (!this.consume(',')) this.fail();
    }
    return this.fail();
  }

  private parseString(): string {
    const start = this.position;
    this.position += 1;
    while (this.position < this.source.length) {
      const character = this.source[this.position];
      if (character === '"') {
        this.position += 1;
        const token = this.source.slice(start, this.position);
        try {
          if (typeof JSON.parse(token) !== 'string') this.fail();
          return token;
        } catch {
          this.fail();
        }
      }
      if (character === '\\') {
        this.position += 2;
        continue;
      }
      if (character === undefined || character.charCodeAt(0) < 0x20) this.fail();
      this.position += 1;
    }
    return this.fail();
  }

  private parseNumber(): StructuredJsonValue {
    const rest = this.source.slice(this.position);
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u.exec(rest);
    if (match === null) return this.fail();
    this.position += match[0].length;
    return { type: 'number', raw: match[0] };
  }

  private consumeLiteral(literal: string): boolean {
    if (!this.source.startsWith(literal, this.position)) return false;
    this.position += literal.length;
    return true;
  }

  private consume(character: string): boolean {
    if (this.source[this.position] !== character) return false;
    this.position += 1;
    return true;
  }

  private skipWhitespace(): void {
    while (
      this.position < this.source.length &&
      isJsonWhitespaceCode(this.source.charCodeAt(this.position))
    )
      this.position += 1;
  }

  private fail(): never {
    throw new Error('O conteúdo estruturado não é um JSON válido.');
  }
}

function isJsonWhitespaceCode(code: number): boolean {
  return code === 9 || code === 10 || code === 13 || code === 32;
}

/** Compatibility comparison for values rendered by the already-shipped v30 converter. */
export function legacyStructuredJsonToRichText(source: string): string {
  return legacyRender(JSON.parse(source) as unknown);
}

/**
 * Compares generated legacy markup by text-node meaning, allowing the DOM editor's
 * normal HTML serialization (for example `&quot;` to `"`) without ignoring structure.
 * Attributes are deliberately rejected because the v30 converter never emitted any.
 */
export function legacyRichTextSemanticallyEqual(first: string, second: string): boolean {
  const firstTokens = legacyRichTextTokens(first);
  const secondTokens = legacyRichTextTokens(second);
  return (
    firstTokens !== null &&
    secondTokens !== null &&
    JSON.stringify(firstTokens) === JSON.stringify(secondTokens)
  );
}

function legacyRichTextTokens(html: string): string[] | null {
  // HTML parsing normalizes literal line endings before decoding character references.
  html = html.replace(/\r\n?/gu, '\n');
  const tokens: string[] = [];
  let position = 0;
  const tagPattern = /<\/?[A-Za-z][A-Za-z0-9]*>/gu;
  for (const match of html.matchAll(tagPattern)) {
    const index = match.index;
    if (index < position) return null;
    const text = html.slice(position, index);
    if (text.includes('<') || text.includes('>')) return null;
    tokens.push(`text:${decodeLegacyHtmlText(text)}`);
    const tag = match[0];
    tokens.push(`tag:${tag.toLowerCase()}`);
    position = index + tag.length;
  }
  const tail = html.slice(position);
  if (tail.includes('<') || tail.includes('>')) return null;
  tokens.push(`text:${decodeLegacyHtmlText(tail)}`);
  return tokens;
}

function decodeLegacyHtmlText(value: string): string {
  return value.replace(/&(?:#(?:x[0-9a-f]+|\d+)|amp|lt|gt|quot|apos);/giu, (entity) => {
    if (entity.startsWith('&#')) {
      const hex = entity[2]?.toLowerCase() === 'x';
      const digits = entity.slice(hex ? 3 : 2, -1);
      const codePoint = Number.parseInt(digits, hex ? 16 : 10);
      if (
        Number.isInteger(codePoint) &&
        codePoint > 0 &&
        codePoint <= 0x10ffff &&
        !(codePoint >= 0xd800 && codePoint <= 0xdfff)
      )
        return String.fromCodePoint(codePoint);
      return '\uFFFD';
    }
    return (
      {
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&quot;': '"',
        '&apos;': "'",
      }[entity.toLowerCase()] ?? entity
    );
  });
}

function legacyRender(value: unknown): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return '<p>[]</p>';
    return `<table><thead><tr><th>Índice</th><th>Valor</th></tr></thead><tbody>${value
      .map((item, index) => `<tr><td>${String(index + 1)}</td><td>${legacyCell(item)}</td></tr>`)
      .join('')}</tbody></table>`;
  }
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return '<p>{}</p>';
    return `<table><thead><tr><th>Campo</th><th>Valor</th></tr></thead><tbody>${entries
      .map(([key, item]) => `<tr><th>${escapeHtml(key)}</th><td>${legacyCell(item)}</td></tr>`)
      .join('')}</tbody></table>`;
  }
  return `<p>${escapeHtml(legacyPrimitiveText(value))}</p>`;
}

function legacyCell(value: unknown): string {
  return Array.isArray(value) || (typeof value === 'object' && value !== null)
    ? legacyRender(value)
    : escapeHtml(legacyPrimitiveText(value));
}

function legacyPrimitiveText(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  return '';
}

function renderStructuredValue(value: StructuredJsonValue): string {
  if (value.type === 'object')
    return renderStructuredRows(value.entries.map(({ key, value: item }) => [key, item]));
  if (value.type === 'array')
    return renderStructuredRows(value.items.map((item, index) => [String(index + 1), item]));
  return `<p><strong>${typeLabel(value.type)}:</strong> ${renderStructuredPrimitive(value)}</p>`;
}

function renderStructuredRows(rows: [string, StructuredJsonValue][]): string {
  if (rows.length === 0) return '<p>Sem itens.</p>';
  return `<table><thead><tr><th>Chave ou índice</th><th>Tipo</th><th>Valor</th></tr></thead><tbody>${rows
    .map(
      ([key, value]) =>
        `<tr><th>${escapeHtml(key)}</th><td>${typeLabel(value.type)}</td><td>${renderStructuredCell(value)}</td></tr>`,
    )
    .join('')}</tbody></table>`;
}

function renderStructuredCell(value: StructuredJsonValue): string {
  if (value.type === 'object' || value.type === 'array') return renderStructuredValue(value);
  return `<code>${escapeHtml(structuredPrimitiveText(value))}</code>`;
}

function renderStructuredPrimitive(
  value: Exclude<StructuredJsonValue, { type: 'object' | 'array' }>,
): string {
  return `<code>${escapeHtml(structuredPrimitiveText(value))}</code>`;
}

function structuredPrimitiveText(
  value: Exclude<StructuredJsonValue, { type: 'object' | 'array' }>,
): string {
  if (value.type === 'string') return value.raw;
  if (value.type === 'number') return value.raw;
  if (value.type === 'boolean') return String(value.value);
  return 'null';
}

function typeLabel(type: StructuredJsonValue['type']): string {
  switch (type) {
    case 'object':
      return 'Objeto';
    case 'array':
      return 'Lista';
    case 'string':
      return 'Texto';
    case 'number':
      return 'Número';
    case 'boolean':
      return 'Booleano';
    case 'null':
      return 'Nulo';
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
