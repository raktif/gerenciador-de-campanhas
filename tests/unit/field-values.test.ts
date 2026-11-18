import { describe, expect, it } from 'vitest';
import {
  isProgressValue,
  legacyRichTextSemanticallyEqual,
  structuredJsonToRichText,
} from '../../src/core/domain/field-values';

describe('valores progressivos e conversão de conteúdo estruturado', () => {
  it('compara texto renderizado semanticamente sem ignorar conteúdo, estrutura ou atributos', () => {
    expect(legacyRichTextSemanticallyEqual('<th>&quot;fala&quot;</th>', '<th>"fala"</th>')).toBe(
      true,
    );
    expect(legacyRichTextSemanticallyEqual('<th>&quot;fala&quot;</th>', '<th>"outra"</th>')).toBe(
      false,
    );
    expect(
      legacyRichTextSemanticallyEqual('<th>&quot;fala&quot;</th>', '<th class="x">"fala"</th>'),
    ).toBe(false);
  });

  it('aceita CRLF literal normalizado pelo parser, sem ignorar quebra removida ou adicionada', () => {
    expect(
      legacyRichTextSemanticallyEqual('<p>a\r\nb\r&quot;c&quot;</p>', '<p>a\nb\n"c"</p>'),
    ).toBe(true);
    expect(legacyRichTextSemanticallyEqual('<p>a\r\nb</p>', '<p>ab</p>')).toBe(false);
    expect(legacyRichTextSemanticallyEqual('<p>a&#13;b</p>', '<p>a\nb</p>')).toBe(false);
  });

  it('aceita pares atuais/finais decimais e atuais negativos somente como legado', () => {
    expect(isProgressValue({ current: 2.5, final: 4.75 })).toBe(true);
    expect(isProgressValue({ current: 4, final: 4 })).toBe(true);
    expect(isProgressValue({ current: -1, final: 4 })).toBe(false);
    expect(isProgressValue({ current: -2.5, final: 10, legacyCurrent: true })).toBe(true);
    expect(isProgressValue({ current: 2.5, final: 4, legacyCurrent: true })).toBe(true);
    expect(isProgressValue({ current: 5, final: 4 })).toBe(false);
    expect(isProgressValue({ current: 1, final: 0 })).toBe(false);
    expect(isProgressValue({ current: 1, final: 2, extra: true })).toBe(false);
  });

  it('transforma JSON aninhado em tabelas legíveis e preserva texto com escape HTML', () => {
    const result = structuredJsonToRichText(
      JSON.stringify({ nome: '<script>texto</script>', detalhes: ['um', { n: 2 }] }),
    );
    expect(result).toContain('<table>');
    expect(result).toContain('nome');
    expect(result).toContain('&lt;script&gt;texto&lt;/script&gt;');
    expect(result).toContain('um');
    expect(result).toContain('n');
    expect(result).toContain('2');
    expect(result).not.toContain('<script>');
  });

  it('preserva valores JSON primitivos sem truncar ou serializar as aspas', () => {
    expect(structuredJsonToRichText('"texto"')).toContain('<code>&quot;texto&quot;</code>');
    expect(structuredJsonToRichText('17')).toContain('<strong>Número:</strong> <code>17</code>');
    expect(structuredJsonToRichText('true')).toContain(
      '<strong>Booleano:</strong> <code>true</code>',
    );
  });

  it('preserva lexemas numéricos, chaves repetidas e distinção de tipos em conteúdo aninhado', () => {
    const result = structuredJsonToRichText(
      '{"grande":9007199254740993,"infinito":1e400,"duplicada":1,"duplicada":2,"tabela":[{"valor":true},{"valor":"true"}]}',
    );
    expect(result).toContain('9007199254740993');
    expect(result).toContain('1e400');
    expect(result.match(/duplicada/g)).toHaveLength(2);
    expect(result).toContain('<td>Booleano</td><td><code>true</code></td>');
    expect(result).toContain('<td>Texto</td><td><code>&quot;true&quot;</code></td>');
  });

  it('rejeita conteúdo que não seja JSON integral e válido', () => {
    expect(() => structuredJsonToRichText('{"valor":1} lixo')).toThrow('JSON válido');
    expect(() => structuredJsonToRichText('{"valor":01}')).toThrow('JSON válido');
  });
});
