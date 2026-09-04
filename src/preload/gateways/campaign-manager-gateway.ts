import type { z } from 'zod';
import {
  assertionLifecycleInputSchema,
  assertionPageRequestSchema,
  createAssertionInputSchema,
  getAssertionInputSchema,
  updateAssertionInputSchema,
  type Assertion,
  type AssertionPageResult,
} from '../../core/contracts/assertions';
import {
  campaignLifecycleInputSchema,
  campaignPageRequestSchema,
  createCampaignInputSchema,
  getCampaignInputSchema,
  updateCampaignInputSchema,
  type Campaign,
  type CampaignPageResult,
} from '../../core/contracts/campaigns';
import {
  createEntityInputSchema,
  entityLifecycleInputSchema,
  entityPageRequestSchema,
  getEntityInputSchema,
  updateEntityInputSchema,
  type EntityDetails,
  type EntityPageResult,
} from '../../core/contracts/entities';
import type { CampaignManagerGateway } from '../../core/contracts/gateway';
import {
  createNoteInputSchema,
  getNoteInputSchema,
  noteLifecycleInputSchema,
  notePageRequestSchema,
  updateNoteInputSchema,
  type NoteDetails,
  type NotePageResult,
} from '../../core/contracts/notes';
import {
  createRelationshipInputSchema,
  getRelationshipInputSchema,
  relationshipLifecycleInputSchema,
  relationshipNeighborhoodInputSchema,
  relationshipPageRequestSchema,
  updateRelationshipInputSchema,
  type Relationship,
  type RelationshipMutationResult,
  type RelationshipNeighborhoodResult,
  type RelationshipPageResult,
} from '../../core/contracts/relationships';
import {
  createRelationshipTypeInputSchema,
  getRelationshipTypeInputSchema,
  relationshipTypeLifecycleInputSchema,
  relationshipTypePageRequestSchema,
  updateRelationshipTypeInputSchema,
  type RelationshipType,
  type RelationshipTypePageResult,
} from '../../core/contracts/relationship-types';
import {
  createEntityTypeInputSchema,
  entityTypeLifecycleInputSchema,
  entityTypePageRequestSchema,
  getEntityTypeInputSchema,
  updateEntityTypeInputSchema,
  type EntityType,
  type EntityTypePageResult,
} from '../../core/contracts/entity-types';
import {
  createFieldDefinitionInputSchema,
  fieldDefinitionLifecycleInputSchema,
  fieldDefinitionPageRequestSchema,
  getFieldDefinitionInputSchema,
  updateFieldDefinitionInputSchema,
  type FieldDefinition,
  type FieldDefinitionPageResult,
} from '../../core/contracts/field-definitions';
import {
  assertionChannels,
  campaignChannels,
  entityChannels,
  entityTypeChannels,
  fieldDefinitionChannels,
  noteChannels,
  phaseZeroChannels,
  relationshipTypeChannels,
  relationshipChannels,
} from '../../core/contracts/ipc-channels';
import {
  emptyInputSchema,
  type ApplicationStatus,
  type OpenDataDirectoryResult,
  type PhaseZeroTestRecord,
} from '../../core/contracts/phase-zero';
import type { Result } from '../../core/contracts/result';

export type IpcInvoker = (channel: string, input: unknown) => Promise<unknown>;

export function createCampaignManagerGateway(invokeIpc: IpcInvoker): CampaignManagerGateway {
  const invoke = <TResult>(
    channel: string,
    input: unknown,
    schema: z.ZodType,
  ): Promise<Result<TResult>> => {
    const validatedInput = schema.parse(input ?? {});
    return invokeIpc(channel, validatedInput) as Promise<Result<TResult>>;
  };

  return {
    phaseZero: {
      getStatus: (input = {}) =>
        invoke<ApplicationStatus>(phaseZeroChannels.getStatus, input, emptyInputSchema),
      writeTest: (input = {}) =>
        invoke<PhaseZeroTestRecord>(phaseZeroChannels.writeTest, input, emptyInputSchema),
      readTest: (input = {}) =>
        invoke<PhaseZeroTestRecord | null>(phaseZeroChannels.readTest, input, emptyInputSchema),
      openDataDirectory: (input = {}) =>
        invoke<OpenDataDirectoryResult>(
          phaseZeroChannels.openDataDirectory,
          input,
          emptyInputSchema,
        ),
    },
    campaigns: {
      create: (input) =>
        invoke<Campaign>(campaignChannels.create, input, createCampaignInputSchema),
      get: (input) => invoke<Campaign>(campaignChannels.get, input, getCampaignInputSchema),
      list: (input = {}) =>
        invoke<CampaignPageResult>(campaignChannels.list, input, campaignPageRequestSchema),
      update: (input) =>
        invoke<Campaign>(campaignChannels.update, input, updateCampaignInputSchema),
      archive: (input) =>
        invoke<Campaign>(campaignChannels.archive, input, campaignLifecycleInputSchema),
      restore: (input) =>
        invoke<Campaign>(campaignChannels.restore, input, campaignLifecycleInputSchema),
      moveToTrash: (input) =>
        invoke<Campaign>(campaignChannels.moveToTrash, input, campaignLifecycleInputSchema),
    },
    entityTypes: {
      create: (input) =>
        invoke<EntityType>(entityTypeChannels.create, input, createEntityTypeInputSchema),
      get: (input) => invoke<EntityType>(entityTypeChannels.get, input, getEntityTypeInputSchema),
      list: (input) =>
        invoke<EntityTypePageResult>(entityTypeChannels.list, input, entityTypePageRequestSchema),
      update: (input) =>
        invoke<EntityType>(entityTypeChannels.update, input, updateEntityTypeInputSchema),
      archive: (input) =>
        invoke<EntityType>(entityTypeChannels.archive, input, entityTypeLifecycleInputSchema),
      restore: (input) =>
        invoke<EntityType>(entityTypeChannels.restore, input, entityTypeLifecycleInputSchema),
    },
    relationshipTypes: {
      create: (input) =>
        invoke<RelationshipType>(
          relationshipTypeChannels.create,
          input,
          createRelationshipTypeInputSchema,
        ),
      get: (input) =>
        invoke<RelationshipType>(
          relationshipTypeChannels.get,
          input,
          getRelationshipTypeInputSchema,
        ),
      list: (input) =>
        invoke<RelationshipTypePageResult>(
          relationshipTypeChannels.list,
          input,
          relationshipTypePageRequestSchema,
        ),
      update: (input) =>
        invoke<RelationshipType>(
          relationshipTypeChannels.update,
          input,
          updateRelationshipTypeInputSchema,
        ),
      archive: (input) =>
        invoke<RelationshipType>(
          relationshipTypeChannels.archive,
          input,
          relationshipTypeLifecycleInputSchema,
        ),
      restore: (input) =>
        invoke<RelationshipType>(
          relationshipTypeChannels.restore,
          input,
          relationshipTypeLifecycleInputSchema,
        ),
    },
    relationships: {
      create: (input) =>
        invoke<RelationshipMutationResult>(
          relationshipChannels.create,
          input,
          createRelationshipInputSchema,
        ),
      get: (input) =>
        invoke<Relationship>(relationshipChannels.get, input, getRelationshipInputSchema),
      list: (input) =>
        invoke<RelationshipPageResult>(
          relationshipChannels.list,
          input,
          relationshipPageRequestSchema,
        ),
      update: (input) =>
        invoke<RelationshipMutationResult>(
          relationshipChannels.update,
          input,
          updateRelationshipInputSchema,
        ),
      archive: (input) =>
        invoke<Relationship>(relationshipChannels.archive, input, relationshipLifecycleInputSchema),
      restore: (input) =>
        invoke<Relationship>(relationshipChannels.restore, input, relationshipLifecycleInputSchema),
      neighborhood: (input) =>
        invoke<RelationshipNeighborhoodResult>(
          relationshipChannels.neighborhood,
          input,
          relationshipNeighborhoodInputSchema,
        ),
    },
    fieldDefinitions: {
      create: (input) =>
        invoke<FieldDefinition>(
          fieldDefinitionChannels.create,
          input,
          createFieldDefinitionInputSchema,
        ),
      get: (input) =>
        invoke<FieldDefinition>(fieldDefinitionChannels.get, input, getFieldDefinitionInputSchema),
      list: (input) =>
        invoke<FieldDefinitionPageResult>(
          fieldDefinitionChannels.list,
          input,
          fieldDefinitionPageRequestSchema,
        ),
      update: (input) =>
        invoke<FieldDefinition>(
          fieldDefinitionChannels.update,
          input,
          updateFieldDefinitionInputSchema,
        ),
      archive: (input) =>
        invoke<FieldDefinition>(
          fieldDefinitionChannels.archive,
          input,
          fieldDefinitionLifecycleInputSchema,
        ),
      restore: (input) =>
        invoke<FieldDefinition>(
          fieldDefinitionChannels.restore,
          input,
          fieldDefinitionLifecycleInputSchema,
        ),
    },
    entities: {
      create: (input) =>
        invoke<EntityDetails>(entityChannels.create, input, createEntityInputSchema),
      get: (input) => invoke<EntityDetails>(entityChannels.get, input, getEntityInputSchema),
      list: (input) =>
        invoke<EntityPageResult>(entityChannels.list, input, entityPageRequestSchema),
      update: (input) =>
        invoke<EntityDetails>(entityChannels.update, input, updateEntityInputSchema),
      archive: (input) =>
        invoke<EntityDetails>(entityChannels.archive, input, entityLifecycleInputSchema),
      restore: (input) =>
        invoke<EntityDetails>(entityChannels.restore, input, entityLifecycleInputSchema),
    },
    assertions: {
      create: (input) =>
        invoke<Assertion>(assertionChannels.create, input, createAssertionInputSchema),
      get: (input) => invoke<Assertion>(assertionChannels.get, input, getAssertionInputSchema),
      list: (input) =>
        invoke<AssertionPageResult>(assertionChannels.list, input, assertionPageRequestSchema),
      update: (input) =>
        invoke<Assertion>(assertionChannels.update, input, updateAssertionInputSchema),
      archive: (input) =>
        invoke<Assertion>(assertionChannels.archive, input, assertionLifecycleInputSchema),
      restore: (input) =>
        invoke<Assertion>(assertionChannels.restore, input, assertionLifecycleInputSchema),
    },
    notes: {
      create: (input) => invoke<NoteDetails>(noteChannels.create, input, createNoteInputSchema),
      get: (input) => invoke<NoteDetails>(noteChannels.get, input, getNoteInputSchema),
      list: (input) => invoke<NotePageResult>(noteChannels.list, input, notePageRequestSchema),
      update: (input) => invoke<NoteDetails>(noteChannels.update, input, updateNoteInputSchema),
      archive: (input) =>
        invoke<NoteDetails>(noteChannels.archive, input, noteLifecycleInputSchema),
      restore: (input) =>
        invoke<NoteDetails>(noteChannels.restore, input, noteLifecycleInputSchema),
    },
  };
}
