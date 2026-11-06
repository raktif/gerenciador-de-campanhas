import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Entity, EntityDetails } from '../../src/core/contracts/entities';
import { replaceDetailsEntity } from '../../src/renderer/features/entities/entity-details';
import {
  activateImagePicker,
  EntityReferenceConfirmationDialog,
  EntityReferenceImageManager,
  EntityReferenceImagePreview,
} from '../../src/renderer/features/entities/entity-reference-image';

describe('interface de imagem de referência da entidade', () => {
  it('exibe fallback acessível e cartão compacto de 96 por 96 pixels', () => {
    const html = renderToStaticMarkup(
      <EntityReferenceImagePreview className="size-24" entity={entity} />,
    );

    expect(html).toContain('size-24');
    expect(html).toContain('Gorel sem imagem de referência');
    expect(html).not.toMatch(/sourceUrl|relativePath|storedFilename|https?:\/\//u);
  });

  it('oferece arquivo, drag and drop, clipboard e URL em diálogo acessível', () => {
    const html = renderToStaticMarkup(
      <EntityReferenceImageManager defaultOpen entity={entity} onEntityChange={() => undefined} />,
    );

    expect(html).toContain('Imagem de referência');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('Selecionar arquivo');
    expect(html).toContain('Arraste e solte uma imagem aqui ou cole com Ctrl+V');
    expect(html).toContain('URL da imagem');
    expect(html).toContain('URL HTTP ou HTTPS');
    expect(html).toContain('PNG, JPEG ou WebP, até 10 MB');
    expect(html).not.toMatch(/sourceUrl|relativePath|storedFilename|C:\\/u);
  });

  it('abre o seletor pelo clique e mantém ativação por Enter ou Espaço', () => {
    let calls = 0;
    const open = () => {
      calls += 1;
    };

    expect(activateImagePicker('click', undefined, false, open)).toBe(true);
    expect(activateImagePicker('keyboard', 'Enter', false, open)).toBe(true);
    expect(activateImagePicker('keyboard', ' ', false, open)).toBe(true);
    expect(activateImagePicker('keyboard', 'Escape', false, open)).toBe(false);
    expect(activateImagePicker('click', undefined, true, open)).toBe(false);
    expect(calls).toBe(3);
  });

  it.each([
    ['replace', 'Substituir a imagem de referência?', 'A imagem atual será substituída.'],
    [
      'remove',
      'Remover a imagem de referência?',
      'A entidade voltará a exibir o marcador sem imagem.',
    ],
  ] as const)('confirma a ação destrutiva %s', (kind, title, explanation) => {
    const html = renderToStaticMarkup(
      <EntityReferenceConfirmationDialog
        busy={false}
        kind={kind}
        onCancel={() => undefined}
        onConfirm={() => undefined}
      />,
    );

    expect(html).toContain(title);
    expect(html).toContain(explanation);
    expect(html).toContain('Cancelar');
    expect(html).toContain('Confirmar');
  });

  it('propaga a nova revisão sem descartar os valores já carregados dos detalhes', () => {
    const details: EntityDetails = {
      entity,
      fieldValues: [
        {
          id: '00000000-0000-4000-8000-000000000010',
          entityId: entity.id,
          fieldDefinitionId: '00000000-0000-4000-8000-000000000011',
          value: 'Capataz',
          createdAt: entity.createdAt,
          updatedAt: entity.updatedAt,
          revision: 1,
        },
      ],
    };
    const updated = replaceDetailsEntity(details, {
      ...entity,
      referenceImageAttachmentId: '00000000-0000-4000-8000-000000000012',
      revision: 2,
    });

    expect(updated.entity.revision).toBe(2);
    expect(updated.fieldValues).toBe(details.fieldValues);
  });
});

const entity: Entity = {
  id: '00000000-0000-4000-8000-000000000001',
  campaignId: '00000000-0000-4000-8000-000000000002',
  entityTypeId: '00000000-0000-4000-8000-000000000003',
  name: 'Gorel',
  summary: null,
  canonState: 'draft',
  knowledgeState: 'fact',
  visibility: 'gm',
  originKind: 'manual',
  sourceId: null,
  referenceImageAttachmentId: null,
  createdAt: '2026-11-03T10:00:00.000Z',
  updatedAt: '2026-11-03T10:00:00.000Z',
  archivedAt: null,
  revision: 1,
};
