import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ColorPicker } from '../../src/renderer/components/color-picker';
import {
  commitHexDraft,
  createColorPickerModel,
  selectColor,
  updateHexDraft,
} from '../../src/renderer/components/color-picker-model';

describe('ColorPicker', () => {
  it('oferece controles nativos rotulados e amostra textual sem depender somente da cor', () => {
    const markup = renderToStaticMarkup(
      <ColorPicker id="entity-color" onChange={() => undefined} value="#1D4ED8" />,
    );

    expect(markup).toContain('<legend');
    expect(markup).toContain('Cor');
    expect(markup).toContain('aria-label="Paleta de cores"');
    expect(markup.match(/type="radio"/g)).toHaveLength(13);
    expect(markup).toContain('Sem cor');
    expect(markup).toContain('Azul');
    expect(markup).toContain('type="color"');
    expect(markup.match(/type="range"/g)).toHaveLength(3);
    expect(markup).toContain('Matiz');
    expect(markup).toContain('Saturação');
    expect(markup).toContain('Luminosidade');
    expect(markup).toContain('Amostra');
    expect(markup).toContain('#1D4ED8');
    expect(markup).not.toContain('aria-live');
    expect(markup).not.toContain('role="status"');
    expect(markup).toContain('<details');
    expect(markup).toContain('Opções avançadas');
    expect(markup).toContain('min-h-11');
    expect(markup).toContain('focus-visible:outline-3');
    expect(markup).toContain('pattern="#[0-9A-Fa-f]{6}"');
    expect(markup).toContain('maxLength="7"');
  });

  it('representa Sem cor por texto e marca a opção correspondente', () => {
    const markup = renderToStaticMarkup(
      <ColorPicker id="entity-color" onChange={() => undefined} value={null} />,
    );

    expect(markup).toContain('Sem cor');
    expect(markup).toContain('id="entity-color-none"');
    expect(markup).toContain('checked=""');
    expect(markup).not.toContain('aria-live');
    expect(markup).not.toContain('role="status"');
  });

  it('preserva valor legado com aviso acessível sem expor seu conteúdo', () => {
    const legacy = '<style>body{display:none}</style>';
    const markup = renderToStaticMarkup(
      <ColorPicker disabled id="entity-color" onChange={() => undefined} value={legacy} />,
    );

    expect(markup).toContain('disabled=""');
    expect(markup).toContain('aria-describedby="entity-color-legacy-message"');
    expect(markup).toContain('id="entity-color-legacy-message"');
    expect(markup).toContain('role="status"');
    expect(markup).toContain('será preservada');
    expect(markup).toContain('Cor anterior preservada');
    expect(markup).toContain('aria-disabled="true"');
    expect(markup).toContain('tabindex="-1"');
    expect(markup).toContain('cursor-not-allowed');
    expect(markup).not.toContain('hover:border-amber-600');
    expect(markup).not.toContain(legacy);
  });
});

describe('modelo do ColorPicker', () => {
  it('normaliza valor compatível e distingue legado sem descartá-lo', () => {
    expect(createColorPickerModel('  #a1b2c3 ')).toEqual({
      selectedColor: '#A1B2C3',
      hexDraft: '#A1B2C3',
      hasLegacyValue: false,
      validationMessage: null,
    });
    expect(createColorPickerModel('amber')).toEqual({
      selectedColor: null,
      hexDraft: '',
      hasLegacyValue: true,
      validationMessage: null,
    });
  });

  it('mantém o valor selecionado enquanto o hexadecimal parcial é digitado', () => {
    const selected = createColorPickerModel('#1D4ED8');
    const partial = updateHexDraft(selected, '#A1');

    expect(partial.selectedColor).toBe('#1D4ED8');
    expect(partial.hexDraft).toBe('#A1');
    expect(partial.validationMessage).toBeNull();

    const invalid = commitHexDraft(partial);
    expect(invalid.status).toBe('invalid');
    expect(invalid.model.selectedColor).toBe('#1D4ED8');
    expect(invalid.model.hexDraft).toBe('#A1');
    expect(invalid.model.validationMessage).toContain('#RRGGBB');
  });

  it('normaliza apenas no commit e permite limpar ou substituir legado', () => {
    const editing = updateHexDraft(createColorPickerModel(null), '  #abcdef ');
    expect(editing.hexDraft).toBe('  #abcdef ');
    expect(commitHexDraft(editing)).toMatchObject({
      status: 'committed',
      value: '#ABCDEF',
      model: { selectedColor: '#ABCDEF', hexDraft: '#ABCDEF' },
    });

    expect(commitHexDraft(updateHexDraft(editing, '   '))).toMatchObject({
      status: 'committed',
      value: null,
      model: { selectedColor: null, hexDraft: '' },
    });
    expect(selectColor(createColorPickerModel('legacy'), '#B91C1C')).toMatchObject({
      selectedColor: '#B91C1C',
      hasLegacyValue: false,
    });
  });
});
