import { describe, expect, it } from 'vitest';
import {
  createFieldDefinitionInputSchema,
  fieldDefinitionPageRequestSchema,
  fieldDefinitionPatchSchema,
} from '../../src/core/contracts/field-definitions';

const campaignId = '00000000-0000-4000-8000-000000000001';
const entityTypeId = '10000000-0000-4000-8000-000000000001';

describe('contratos de definições de campo', () => {
  it('normaliza a criação e aplica valores padrão', () => {
    expect(
      createFieldDefinitionInputSchema.parse({
        campaignId,
        entityTypeId,
        key: 'nome-completo',
        label: '  Nome completo  ',
        dataType: 'short_text',
      }),
    ).toEqual({
      campaignId,
      entityTypeId,
      key: 'nome-completo',
      label: 'Nome completo',
      description: null,
      dataType: 'short_text',
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
    });
  });

  it('rejeita chaves instáveis e atualizações vazias', () => {
    expect(() =>
      createFieldDefinitionInputSchema.parse({
        campaignId,
        entityTypeId,
        key: 'Nome--Completo',
        label: 'Nome',
        dataType: 'short_text',
      }),
    ).toThrow();
    expect(() => fieldDefinitionPatchSchema.parse({})).toThrow();
  });

  it('configura paginação ativa e ordenação manual por padrão', () => {
    expect(fieldDefinitionPageRequestSchema.parse({ campaignId, entityTypeId })).toMatchObject({
      campaignId,
      entityTypeId,
      limit: 50,
      filters: { isArchived: false },
      sort: 'sortOrder',
      order: 'asc',
    });
  });
});
