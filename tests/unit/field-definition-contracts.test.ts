import { describe, expect, it } from 'vitest';
import {
  createFieldDefinitionInputSchema,
  fieldDefinitionPageRequestSchema,
  fieldDefinitionPatchSchema,
  moveFieldDefinitionInputSchema,
} from '../../src/core/contracts/field-definitions';

const campaignId = '00000000-0000-4000-8000-000000000001';
const entityTypeId = '10000000-0000-4000-8000-000000000001';
const sourceId = '20000000-0000-4000-8000-000000000001';
const targetId = '20000000-0000-4000-8000-000000000002';

describe('contratos de definições de campo', () => {
  it('normaliza a criação e aplica valores padrão', () => {
    expect(
      createFieldDefinitionInputSchema.parse({
        campaignId,
        entityTypeId,
        label: '  Nome completo  ',
        dataType: 'short_text',
      }),
    ).toEqual({
      campaignId,
      entityTypeId,
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

  it('rejeita tentativas de fornecer ou alterar a chave técnica e atualizações vazias', () => {
    expect(() =>
      createFieldDefinitionInputSchema.parse({
        campaignId,
        entityTypeId,
        key: 'nome',
        label: 'Nome',
        dataType: 'short_text',
      }),
    ).toThrow();
    expect(() => fieldDefinitionPatchSchema.parse({ key: 'outra-chave' })).toThrow();
    expect(() => fieldDefinitionPatchSchema.parse({})).toThrow();
  });

  it('mantém a ordem fora dos inputs públicos de criação e edição', () => {
    expect(() =>
      createFieldDefinitionInputSchema.parse({
        campaignId,
        entityTypeId,
        label: 'Nome',
        dataType: 'short_text',
        sortOrder: 2,
      }),
    ).toThrow();
    expect(() => fieldDefinitionPatchSchema.parse({ sortOrder: 2 })).toThrow();
  });

  it('prende o movimento ao tipo de entidade e valida as duas revisões', () => {
    const input = {
      campaignId,
      entityTypeId,
      sourceId,
      sourceRevision: 2,
      targetId,
      targetRevision: 3,
      placement: 'after' as const,
    };
    expect(moveFieldDefinitionInputSchema.parse(input)).toEqual(input);
    expect(() => moveFieldDefinitionInputSchema.parse({ ...input, sourceRevision: 0 })).toThrow();
    expect(() => moveFieldDefinitionInputSchema.parse({ ...input, placement: 'middle' })).toThrow();
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
