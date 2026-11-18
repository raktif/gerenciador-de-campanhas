import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { FieldDefinition } from '../../src/core/contracts/field-definitions';
import { importImageFieldValueBytesInputSchema } from '../../src/core/contracts/image-field-values';
import {
  ImageFieldGallery,
  imageRemovalFocusTarget,
  imageMetadataDraftKey,
} from '../../src/renderer/features/entities/image-field-gallery';
import {
  toFieldValueInputs,
  toFieldValueTexts,
} from '../../src/renderer/features/entities/entity-form';
import { FieldDefinitionForm } from '../../src/renderer/features/field-definitions/field-definition-form';

describe('interface de campos personalizados de imagem', () => {
  it('oferece o dataType image sem expor configuracoes JSON', () => {
    const html = renderToStaticMarkup(
      <FieldDefinitionForm
        busy={false}
        campaignId={campaignId}
        error={null}
        field={imageField}
        mode="edit"
        onCancel={() => undefined}
        onSubmit={() => Promise.resolve()}
      />,
    );

    expect(html).toContain('<option value="image" selected="">Imagem</option>');
    expect(html).toContain('Campos de imagem são sempre opcionais');
    expect(html).toContain('Secreto por padrão');
    expect(html).toContain('não se aplica a este tipo');
    expect(html).not.toContain('Valor padrão (JSON)');
    expect(html).not.toContain('Opções (JSON)');
    expect(html).not.toContain('Validação (JSON)');
    expect(html.match(/disabled=""/gu)?.length).toBeGreaterThanOrEqual(3);
  });

  it('nunca converte campos image em fieldValues da entidade', () => {
    const textField = { ...imageField, id: textFieldId, dataType: 'short_text' as const };
    expect(
      toFieldValueInputs([imageField, textField], {
        [imageField.id]: 'nao deve ser enviado',
        [textField.id]: 'Capataz',
      }),
    ).toEqual([{ fieldDefinitionId: textFieldId, value: 'Capataz' }]);
  });

  it('mantém progresso legado negativo ao editar outros campos e aceita total positivo decimal', () => {
    const progressField = {
      ...imageField,
      id: '30000000-0000-4000-8000-000000000003',
      dataType: 'progress' as const,
    };
    expect(toFieldValueInputs([progressField], { [progressField.id]: '-2.5' })).toEqual([
      { fieldDefinitionId: progressField.id, value: -2.5 },
    ]);
    expect(
      toFieldValueInputs([progressField], {
        [progressField.id]: '{"current":-2.5,"final":10,"legacyCurrent":true}',
      }),
    ).toEqual([
      {
        fieldDefinitionId: progressField.id,
        value: { current: -2.5, final: 10, legacyCurrent: true },
      },
    ]);
    expect(
      toFieldValueInputs([progressField], {
        [progressField.id]: '{"current":0,"final":0.00000001}',
      }),
    ).toEqual([{ fieldDefinitionId: progressField.id, value: { current: 0, final: 1e-8 } }]);
    expect(
      toFieldValueInputs([progressField], {
        [progressField.id]: '{"current":2,"final":10}',
      }),
    ).toEqual([{ fieldDefinitionId: progressField.id, value: { current: 2, final: 10 } }]);
    expect(() =>
      toFieldValueInputs([progressField], {
        [progressField.id]: '{"current":-2.5,"final":10}',
      }),
    ).toThrow('valor atual não negativo');
  });

  it('mantém uma opção legada com vírgula como escolha única no formulário de entidade', () => {
    const multiSelectField = {
      ...imageField,
      id: '30000000-0000-4000-8000-000000000004',
      dataType: 'multi_select' as const,
      options: ['Norte, Sul', 'Oeste'],
    };
    const persistedValue = {
      id: '40000000-0000-4000-8000-000000000004',
      entityId,
      fieldDefinitionId: multiSelectField.id,
      value: ['Norte, Sul'],
      createdAt: '2026-11-04T10:00:00.000Z',
      updatedAt: '2026-11-04T10:00:00.000Z',
      revision: 1,
    };
    const formValues = toFieldValueTexts([persistedValue]);
    expect(formValues[multiSelectField.id]).toBe('["Norte, Sul"]');
    expect(toFieldValueInputs([multiSelectField], formValues)).toEqual([
      { fieldDefinitionId: multiSelectField.id, value: ['Norte, Sul'] },
    ]);
  });

  it('exibe opção legada com vírgula como item individual na configuração de campo', () => {
    const multiSelectField = {
      ...imageField,
      dataType: 'multi_select' as const,
      options: ['Norte, Sul', 'Oeste'],
    };
    const markup = renderToStaticMarkup(
      <FieldDefinitionForm
        busy={false}
        campaignId={campaignId}
        error={null}
        field={multiSelectField}
        mode="edit"
        onCancel={() => undefined}
        onSubmit={() => Promise.resolve()}
      />,
    );
    expect(markup).toContain('Esta definição contém valores antigos com vírgulas');
    expect(markup).toContain('<li>Norte, Sul</li>');
    expect(markup).toContain('<li>Oeste</li>');
  });

  it('exige texto alternativo descritivo no contrato de importacao', () => {
    const base = {
      campaignId,
      entityId,
      fieldDefinitionId: imageField.id,
      caption: null,
      bytes: new Uint8Array([1]),
      metadata: { originalFilename: 'brasao.png', sourceKind: 'clipboard' as const },
    };
    expect(() => importImageFieldValueBytesInputSchema.parse({ ...base, altText: '' })).toThrow();
    expect(
      importImageFieldValueBytesInputSchema.parse({ ...base, altText: 'Brasao azul e dourado' })
        .altText,
    ).toBe('Brasao azul e dourado');
  });

  it('nao substitui rascunhos de metadados quando apenas a revisao muda ao reordenar', () => {
    const item = imageDetails(1, 'Legenda persistida', 'Brasao azul');
    expect(imageMetadataDraftKey({ ...item, value: { ...item.value, revision: 2 } })).toBe(
      imageMetadataDraftKey(item),
    );
    expect(
      imageMetadataDraftKey({ ...item, value: { ...item.value, revision: 2, caption: 'Nova' } }),
    ).not.toBe(imageMetadataDraftKey(item));
  });

  it('define destinos de foco recuperaveis para cada resultado de remocao', () => {
    expect(imageRemovalFocusTarget('success')).toBe('add');
    expect(imageRemovalFocusTarget({ errorCode: 'IMAGE_FIELD_VALUE_REMOVE_FAILED' })).toBe(
      'confirm',
    );
    expect(imageRemovalFocusTarget({ errorCode: 'REVISION_CONFLICT' })).toBe('reload');
  });

  it('renderiza galeria e dialogo acessivel sem lightbox ou caminhos privados', () => {
    const html = renderToStaticMarkup(
      <ImageFieldGallery
        campaignId={campaignId}
        defaultOpen
        entityId={entityId}
        field={imageField}
      />,
    );

    expect(html).toContain('Brasao');
    expect(html).toContain('Adicionar imagem');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('Selecionar arquivo');
    expect(html).toContain('Arraste e solte uma imagem aqui ou cole com Ctrl+V');
    expect(html).toContain('URL da imagem');
    expect(html).toContain('Texto alternativo');
    expect(html).not.toMatch(/lightbox|sourceUrl|relativePath|storedFilename|C:\\/iu);
  });
});

const campaignId = '00000000-0000-4000-8000-000000000001';
const entityTypeId = '10000000-0000-4000-8000-000000000001';
const entityId = '20000000-0000-4000-8000-000000000001';
const textFieldId = '30000000-0000-4000-8000-000000000002';

const imageField: FieldDefinition = {
  id: '30000000-0000-4000-8000-000000000001',
  entityTypeId,
  key: 'brasao',
  label: 'Brasao',
  description: 'Imagens heraldicas',
  helpText: null,
  exampleText: null,
  helpArticleId: null,
  dataType: 'image',
  semanticRole: null,
  required: false,
  searchable: false,
  secretByDefault: false,
  defaultValue: null,
  options: null,
  validation: null,
  referenceRelationshipTypeId: null,
  referenceDirection: null,
  allowedTargetTypeIds: null,
  onDeleteBehavior: null,
  sortOrder: 0,
  isArchived: false,
  createdAt: '2026-11-04T10:00:00.000Z',
  updatedAt: '2026-11-04T10:00:00.000Z',
  revision: 1,
};

function imageDetails(revision: number, caption: string, altText: string) {
  const timestamp = '2026-11-05T10:00:00.000Z';
  return {
    value: {
      id: '40000000-0000-4000-8000-000000000001',
      entityId,
      fieldDefinitionId: imageField.id,
      attachmentId: '50000000-0000-4000-8000-000000000001',
      caption,
      altText,
      sortOrder: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
      revision,
    },
    attachment: {
      id: '50000000-0000-4000-8000-000000000001',
      campaignId,
      originalFilename: 'brasao.png',
      mimeType: 'image/png' as const,
      fileSize: 68,
      checksumSha256: 'a'.repeat(64),
      visibility: 'gm' as const,
      width: 1,
      height: 1,
      sourceKind: 'drag_drop' as const,
      processedMimeType: 'image/webp' as const,
      processingStatus: 'ready' as const,
      createdAt: timestamp,
      updatedAt: timestamp,
      revision: 1,
    },
  };
}
