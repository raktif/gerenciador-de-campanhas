import type { z } from 'zod';
import {
  acceptDemandSchema,
  demandIdentitySchema,
  demandPageSchema,
  demandSuggestionRequestSchema,
  demandTargetRequestSchema,
  transformDemandSchema,
  transitionDemandSchema,
  updateDemandSchema,
  type DemandDetails,
  type DemandSuggestion,
  type DemandTarget,
  type Demand,
} from '../../core/contracts/demands';
import { demandChannels } from '../../core/contracts/ipc-channels';
import {
  appearanceSettingSchema,
  updateAppearanceThemeInputSchema,
  type AppearanceSetting,
} from '../../core/contracts/appearance';
import {
  assertionLifecycleInputSchema,
  assertionPageRequestSchema,
  promoteAssertionPossibilityInputSchema,
  createAssertionInputSchema,
  getAssertionInputSchema,
  updateAssertionInputSchema,
  type Assertion,
  type AssertionPageResult,
  type AssertionRegistryPageResult,
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
import {
  createEventInputSchema,
  eventLifecycleInputSchema,
  eventPageRequestSchema,
  getEventInputSchema,
  updateEventInputSchema,
  type EventDetails,
  type EventPageResult,
} from '../../core/contracts/events';
import {
  captureInboxItemInputSchema,
  convertInboxItemToAssertionInputSchema,
  convertInboxItemToEventInputSchema,
  convertInboxItemToNoteInputSchema,
  convertInboxItemToEntityInputSchema,
  convertInboxItemToRelationshipInputSchema,
  getInboxItemInputSchema,
  inboxLifecycleInputSchema,
  inboxPageRequestSchema,
  type InboxItem,
  type InboxPageResult,
  type InboxEntityConversionResult,
  type InboxAssertionConversionResult,
  type InboxEventConversionResult,
  type InboxNoteConversionResult,
  type InboxRelationshipConversionResult,
} from '../../core/contracts/inbox';
import type { CampaignManagerGateway } from '../../core/contracts/gateway';
import {
  deleteAttachmentInputSchema,
  getCampaignCoverInputSchema,
  removeCampaignCoverInputSchema,
  setCampaignCoverInputSchema,
  type CampaignCover,
  type CampaignCoverPreview,
  type DeleteAttachmentResult,
} from '../../core/contracts/campaign-covers';
import {
  importImageBytesInputSchema,
  importImageUrlInputSchema,
  selectLocalImageInputSchema,
  type ImageImportResult,
} from '../../core/contracts/image-imports';
import {
  getEntityReferenceImageInputSchema,
  importEntityReferenceImageBytesInputSchema,
  importEntityReferenceImageUrlInputSchema,
  removeEntityReferenceImageInputSchema,
  selectLocalEntityReferenceImageInputSchema,
  setEntityReferenceImageInputSchema,
  type EntityReferenceImage,
  type EntityReferenceImageImportResult,
  type EntityReferenceImagePreview,
  type EntityReferenceImageDisplay,
} from '../../core/contracts/entity-reference-images';
import {
  getImageFieldValueInputSchema,
  importImageFieldValueBytesInputSchema,
  importImageFieldValueUrlInputSchema,
  listImageFieldValuesInputSchema,
  moveImageFieldValueInputSchema,
  removeImageFieldValueInputSchema,
  selectLocalImageFieldValueInputSchema,
  updateImageFieldValueInputSchema,
  type ImageFieldValueDetails,
  type ImageFieldValueImportResult,
  type ImageFieldValuePreview,
  type ImageFieldValueDisplay,
} from '../../core/contracts/image-field-values';
import {
  copyStartupDiagnosticInputSchema,
  type CopiedStartupDiagnostic,
} from '../../core/contracts/diagnostics';
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
  applyRelationshipAutoLayoutInputSchema,
  getRelationshipViewInputSchema,
  resetRelationshipLayoutInputSchema,
  saveRelationshipNodePositionInputSchema,
  saveRelationshipViewportInputSchema,
  type RelationshipViewState,
} from '../../core/contracts/relationship-views';
import {
  createRelationshipTypeInputSchema,
  getRelationshipTypeInputSchema,
  moveRelationshipTypeInputSchema,
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
  moveEntityTypeInputSchema,
  updateEntityTypeInputSchema,
  type EntityType,
  type EntityTypePageResult,
} from '../../core/contracts/entity-types';
import {
  createFieldDefinitionInputSchema,
  fieldDefinitionLifecycleInputSchema,
  fieldDefinitionPageRequestSchema,
  getFieldDefinitionInputSchema,
  moveFieldDefinitionInputSchema,
  updateFieldDefinitionInputSchema,
  type FieldDefinition,
  type FieldDefinitionPageResult,
} from '../../core/contracts/field-definitions';
import {
  assertionChannels,
  appearanceChannels,
  campaignChannels,
  campaignSignalChannels,
  diagnosticsChannels,
  entityChannels,
  entityTypeChannels,
  eventChannels,
  fieldDefinitionChannels,
  inboxChannels,
  imageFieldValueChannels,
  imageImportChannels,
  noteChannels,
  phaseZeroChannels,
  relationshipTypeChannels,
  relationshipChannels,
  relationshipViewChannels,
  timelineChannels,
} from '../../core/contracts/ipc-channels';
import {
  campaignSignalCampaignInputSchema,
  dismissCampaignSignalInputSchema,
  markContradictionExceptionInputSchema,
  type ContradictionReview,
  reactivateCampaignSignalInputSchema,
  reviewCampaignSignalInputSchema,
  snoozeCampaignSignalInputSchema,
  type CampaignSignalListResult,
  type CampaignSignalRecalculationResult,
} from '../../core/contracts/campaign-signal-engine';
import {
  clockChannels,
  sessionChannels,
  sessionIntentionChannels,
  storyThreadChannels,
  sessionParticipantChannels,
} from '../../core/contracts/ipc-channels';
import {
  emptyInputSchema,
  type ApplicationStatus,
  type OpenDataDirectoryResult,
  type PhaseZeroTestRecord,
} from '../../core/contracts/phase-zero';
import type { Result } from '../../core/contracts/result';
import {
  createStoryThreadInputSchema,
  getStoryThreadInputSchema,
  setStoryThreadStatusInputSchema,
  storyThreadLifecycleInputSchema,
  storyThreadPageRequestSchema,
  storyThreadTargetRequestSchema,
  updateStoryThreadInputSchema,
  type StoryThreadDetails,
  type StoryThreadPageResult,
  type StoryThreadTargetPageResult,
} from '../../core/contracts/story-threads';
import {
  clockPageRequestSchema,
  completeClockInputSchema,
  createClockInputSchema,
  getClockInputSchema,
  updateClockInputSchema,
  type Clock,
  type ClockPageResult,
} from '../../core/contracts/clocks';
import type { CampaignSignal } from '../../core/contracts/campaign-signals';
import {
  createSessionInputSchema,
  createSessionIntentionInputSchema,
  getSessionInputSchema,
  getSessionIntentionInputSchema,
  listSessionParticipantsInputSchema,
  replaceSessionParticipantsInputSchema,
  sessionIntentionPageRequestSchema,
  updateSessionInputSchema,
  updateSessionIntentionInputSchema,
  sessionPageRequestSchema,
  type Session,
  type SessionIntention,
  type SessionIntentionPageResult,
  type SessionPageResult,
  type SessionParticipant,
} from '../../core/contracts/sessions';
import {
  timelineCampaignRequestSchema,
  timelineEntityRequestSchema,
  type TimelinePageResult,
} from '../../core/contracts/timeline';

export type IpcInvoker = (channel: string, input: unknown) => Promise<unknown>;
export type IpcSubscriber = (channel: string, listener: (payload: unknown) => void) => () => void;

export function createCampaignManagerGateway(
  invokeIpc: IpcInvoker,
  subscribeIpc: IpcSubscriber = () => () => undefined,
): CampaignManagerGateway {
  const invoke = <TResult>(
    channel: string,
    input: unknown,
    schema: z.ZodType,
  ): Promise<Result<TResult>> => {
    const publicInput = input ?? {};
    schema.parse(publicInput);
    return invokeIpc(channel, publicInput) as Promise<Result<TResult>>;
  };

  return {
    appearance: {
      getTheme: (input = {}) =>
        invoke<AppearanceSetting>(appearanceChannels.getTheme, input, emptyInputSchema),
      setTheme: (input) =>
        invoke<AppearanceSetting>(
          appearanceChannels.setTheme,
          input,
          updateAppearanceThemeInputSchema,
        ),
      onThemeChanged: (listener) =>
        subscribeIpc(appearanceChannels.themeChanged, (payload) => {
          const setting = appearanceSettingSchema.safeParse(payload);
          if (setting.success) listener(setting.data);
        }),
    },
    demands: {
      suggestion: (input) =>
        invoke<DemandSuggestion>(demandChannels.suggestion, input, demandSuggestionRequestSchema),
      get: (input) => invoke<DemandDetails>(demandChannels.get, input, demandIdentitySchema),
      list: (input) =>
        invoke<{ items: Demand[]; nextCursor: string | null; total: number }>(
          demandChannels.list,
          input,
          demandPageSchema,
        ),
      targets: (input) =>
        invoke<{ items: DemandTarget[]; nextCursor: string | null }>(
          demandChannels.targets,
          input,
          demandTargetRequestSchema,
        ),
      accept: (input) => invoke<DemandDetails>(demandChannels.accept, input, acceptDemandSchema),
      update: (input) => invoke<DemandDetails>(demandChannels.update, input, updateDemandSchema),
      transform: (input) =>
        invoke<DemandDetails>(demandChannels.transform, input, transformDemandSchema),
      transition: (input) =>
        invoke<DemandDetails>(demandChannels.transition, input, transitionDemandSchema),
      sourceLocks: (input) =>
        invoke<string[]>(demandChannels.sourceLocks, input, demandIdentitySchema),
    },
    clocks: {
      create: (input) => invoke<Clock>(clockChannels.create, input, createClockInputSchema),
      get: (input) => invoke<Clock>(clockChannels.get, input, getClockInputSchema),
      list: (input) => invoke<ClockPageResult>(clockChannels.list, input, clockPageRequestSchema),
      update: (input) => invoke<Clock>(clockChannels.update, input, updateClockInputSchema),
      complete: (input) => invoke<Clock>(clockChannels.complete, input, completeClockInputSchema),
    },
    storyThreads: {
      create: (input) =>
        invoke<StoryThreadDetails>(storyThreadChannels.create, input, createStoryThreadInputSchema),
      get: (input) =>
        invoke<StoryThreadDetails>(storyThreadChannels.get, input, getStoryThreadInputSchema),
      list: (input) =>
        invoke<StoryThreadPageResult>(
          storyThreadChannels.list,
          input,
          storyThreadPageRequestSchema,
        ),
      listTargets: (input) =>
        invoke<StoryThreadTargetPageResult>(
          storyThreadChannels.listTargets,
          input,
          storyThreadTargetRequestSchema,
        ),
      update: (input) =>
        invoke<StoryThreadDetails>(storyThreadChannels.update, input, updateStoryThreadInputSchema),
      setStatus: (input) =>
        invoke<StoryThreadDetails>(
          storyThreadChannels.setStatus,
          input,
          setStoryThreadStatusInputSchema,
        ),
      resolve: (input) =>
        invoke<StoryThreadDetails>(
          storyThreadChannels.resolve,
          input,
          storyThreadLifecycleInputSchema,
        ),
      abandon: (input) =>
        invoke<StoryThreadDetails>(
          storyThreadChannels.abandon,
          input,
          storyThreadLifecycleInputSchema,
        ),
      reopen: (input) =>
        invoke<StoryThreadDetails>(
          storyThreadChannels.reopen,
          input,
          storyThreadLifecycleInputSchema,
        ),
      archive: (input) =>
        invoke<StoryThreadDetails>(
          storyThreadChannels.archive,
          input,
          storyThreadLifecycleInputSchema,
        ),
      restore: (input) =>
        invoke<StoryThreadDetails>(
          storyThreadChannels.restore,
          input,
          storyThreadLifecycleInputSchema,
        ),
    },
    diagnostics: {
      copyStartupDiagnostic: (input) =>
        invoke<CopiedStartupDiagnostic>(
          diagnosticsChannels.copyStartupDiagnostic,
          input,
          copyStartupDiagnosticInputSchema,
        ),
    },
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
    images: {
      selectLocal: (input) =>
        invoke<ImageImportResult>(
          imageImportChannels.selectLocal,
          input,
          selectLocalImageInputSchema,
        ),
      importBytes: (input) =>
        invoke<ImageImportResult>(
          imageImportChannels.importBytes,
          input,
          importImageBytesInputSchema,
        ),
      importUrl: (input) =>
        invoke<ImageImportResult>(imageImportChannels.importUrl, input, importImageUrlInputSchema),
      getCover: (input) =>
        invoke<CampaignCover>(imageImportChannels.getCover, input, getCampaignCoverInputSchema),
      setCover: (input) =>
        invoke<CampaignCover>(imageImportChannels.setCover, input, setCampaignCoverInputSchema),
      removeCover: (input) =>
        invoke<CampaignCover>(
          imageImportChannels.removeCover,
          input,
          removeCampaignCoverInputSchema,
        ),
      getCoverPreview: (input) =>
        invoke<CampaignCoverPreview>(
          imageImportChannels.getCoverPreview,
          input,
          getCampaignCoverInputSchema,
        ),
      deleteAttachment: (input) =>
        invoke<DeleteAttachmentResult>(
          imageImportChannels.deleteAttachment,
          input,
          deleteAttachmentInputSchema,
        ),
      selectEntityReferenceLocal: (input) =>
        invoke<EntityReferenceImageImportResult>(
          imageImportChannels.selectEntityReferenceLocal,
          input,
          selectLocalEntityReferenceImageInputSchema,
        ),
      importEntityReferenceBytes: (input) =>
        invoke<EntityReferenceImageImportResult>(
          imageImportChannels.importEntityReferenceBytes,
          input,
          importEntityReferenceImageBytesInputSchema,
        ),
      importEntityReferenceUrl: (input) =>
        invoke<EntityReferenceImageImportResult>(
          imageImportChannels.importEntityReferenceUrl,
          input,
          importEntityReferenceImageUrlInputSchema,
        ),
      getEntityReference: (input) =>
        invoke<EntityReferenceImage>(
          imageImportChannels.getEntityReference,
          input,
          getEntityReferenceImageInputSchema,
        ),
      getEntityReferencePreview: (input) =>
        invoke<EntityReferenceImagePreview>(
          imageImportChannels.getEntityReferencePreview,
          input,
          getEntityReferenceImageInputSchema,
        ),
      getEntityReferenceDisplay: (input) =>
        invoke<EntityReferenceImageDisplay>(
          imageImportChannels.getEntityReferenceDisplay,
          input,
          getEntityReferenceImageInputSchema,
        ),
      setEntityReference: (input) =>
        invoke<EntityReferenceImage>(
          imageImportChannels.setEntityReference,
          input,
          setEntityReferenceImageInputSchema,
        ),
      removeEntityReference: (input) =>
        invoke<EntityReferenceImage>(
          imageImportChannels.removeEntityReference,
          input,
          removeEntityReferenceImageInputSchema,
        ),
    },
    imageFieldValues: {
      selectLocal: (input) =>
        invoke<ImageFieldValueImportResult>(
          imageFieldValueChannels.selectLocal,
          input,
          selectLocalImageFieldValueInputSchema,
        ),
      importBytes: (input) =>
        invoke<ImageFieldValueImportResult>(
          imageFieldValueChannels.importBytes,
          input,
          importImageFieldValueBytesInputSchema,
        ),
      importUrl: (input) =>
        invoke<ImageFieldValueImportResult>(
          imageFieldValueChannels.importUrl,
          input,
          importImageFieldValueUrlInputSchema,
        ),
      list: (input) =>
        invoke<ImageFieldValueDetails[]>(
          imageFieldValueChannels.list,
          input,
          listImageFieldValuesInputSchema,
        ),
      getPreview: (input) =>
        invoke<ImageFieldValuePreview>(
          imageFieldValueChannels.getPreview,
          input,
          getImageFieldValueInputSchema,
        ),
      getDisplay: (input) =>
        invoke<ImageFieldValueDisplay>(
          imageFieldValueChannels.getDisplay,
          input,
          getImageFieldValueInputSchema,
        ),
      update: (input) =>
        invoke<ImageFieldValueDetails>(
          imageFieldValueChannels.update,
          input,
          updateImageFieldValueInputSchema,
        ),
      remove: (input) =>
        invoke<ImageFieldValueDetails>(
          imageFieldValueChannels.remove,
          input,
          removeImageFieldValueInputSchema,
        ),
      move: (input) =>
        invoke<ImageFieldValueDetails[]>(
          imageFieldValueChannels.move,
          input,
          moveImageFieldValueInputSchema,
        ),
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
      move: (input) =>
        invoke<EntityType[]>(entityTypeChannels.move, input, moveEntityTypeInputSchema),
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
      move: (input) =>
        invoke<RelationshipType[]>(
          relationshipTypeChannels.move,
          input,
          moveRelationshipTypeInputSchema,
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
    relationshipViews: {
      get: (input) =>
        invoke<RelationshipViewState>(
          relationshipViewChannels.get,
          input,
          getRelationshipViewInputSchema,
        ),
      saveNodePosition: (input) =>
        invoke<RelationshipViewState>(
          relationshipViewChannels.saveNodePosition,
          input,
          saveRelationshipNodePositionInputSchema,
        ),
      saveViewport: (input) =>
        invoke<RelationshipViewState>(
          relationshipViewChannels.saveViewport,
          input,
          saveRelationshipViewportInputSchema,
        ),
      autoLayout: (input) =>
        invoke<RelationshipViewState>(
          relationshipViewChannels.autoLayout,
          input,
          applyRelationshipAutoLayoutInputSchema,
        ),
      resetLayout: (input) =>
        invoke<RelationshipViewState>(
          relationshipViewChannels.resetLayout,
          input,
          resetRelationshipLayoutInputSchema,
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
      move: (input) =>
        invoke<FieldDefinition[]>(
          fieldDefinitionChannels.move,
          input,
          moveFieldDefinitionInputSchema,
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
      listRegistry: (input) =>
        invoke<AssertionRegistryPageResult>(
          assertionChannels.listRegistry,
          input,
          assertionPageRequestSchema,
        ),
      update: (input) =>
        invoke<Assertion>(assertionChannels.update, input, updateAssertionInputSchema),
      promotePossibilityToFact: (input) =>
        invoke<Assertion>(
          assertionChannels.promotePossibilityToFact,
          input,
          promoteAssertionPossibilityInputSchema,
        ),
      archive: (input) =>
        invoke<Assertion>(assertionChannels.archive, input, assertionLifecycleInputSchema),
      restore: (input) =>
        invoke<Assertion>(assertionChannels.restore, input, assertionLifecycleInputSchema),
    },
    campaignSignals: {
      getContradictionReview: (input) =>
        invoke<ContradictionReview>(
          campaignSignalChannels.getContradictionReview,
          input,
          reviewCampaignSignalInputSchema,
        ),
      list: (input) =>
        invoke<CampaignSignalListResult>(
          campaignSignalChannels.list,
          input,
          campaignSignalCampaignInputSchema,
        ),
      recalculate: (input) =>
        invoke<CampaignSignalRecalculationResult>(
          campaignSignalChannels.recalculate,
          input,
          campaignSignalCampaignInputSchema,
        ),
      review: (input) =>
        invoke<CampaignSignal>(
          campaignSignalChannels.review,
          input,
          reviewCampaignSignalInputSchema,
        ),
      dismiss: (input) =>
        invoke<CampaignSignal>(
          campaignSignalChannels.dismiss,
          input,
          dismissCampaignSignalInputSchema,
        ),
      reactivate: (input) =>
        invoke<CampaignSignal>(
          campaignSignalChannels.reactivate,
          input,
          reactivateCampaignSignalInputSchema,
        ),
      snooze: (input) =>
        invoke<CampaignSignal>(
          campaignSignalChannels.snooze,
          input,
          snoozeCampaignSignalInputSchema,
        ),
      markContradictionException: (input) =>
        invoke<CampaignSignal>(
          campaignSignalChannels.markContradictionException,
          input,
          markContradictionExceptionInputSchema,
        ),
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
    inbox: {
      capture: (input) =>
        invoke<InboxItem>(inboxChannels.capture, input, captureInboxItemInputSchema),
      get: (input) => invoke<InboxItem>(inboxChannels.get, input, getInboxItemInputSchema),
      list: (input) => invoke<InboxPageResult>(inboxChannels.list, input, inboxPageRequestSchema),
      beginReview: (input) =>
        invoke<InboxItem>(inboxChannels.beginReview, input, inboxLifecycleInputSchema),
      dismiss: (input) =>
        invoke<InboxItem>(inboxChannels.dismiss, input, inboxLifecycleInputSchema),
      archive: (input) =>
        invoke<InboxItem>(inboxChannels.archive, input, inboxLifecycleInputSchema),
      restore: (input) =>
        invoke<InboxItem>(inboxChannels.restore, input, inboxLifecycleInputSchema),
      convertToEntity: (input) =>
        invoke<InboxEntityConversionResult>(
          inboxChannels.convertToEntity,
          input,
          convertInboxItemToEntityInputSchema,
        ),
      convertToAssertion: (input) =>
        invoke<InboxAssertionConversionResult>(
          inboxChannels.convertToAssertion,
          input,
          convertInboxItemToAssertionInputSchema,
        ),
      convertToNote: (input) =>
        invoke<InboxNoteConversionResult>(
          inboxChannels.convertToNote,
          input,
          convertInboxItemToNoteInputSchema,
        ),
      convertToEvent: (input) =>
        invoke<InboxEventConversionResult>(
          inboxChannels.convertToEvent,
          input,
          convertInboxItemToEventInputSchema,
        ),
      convertToRelationship: (input) =>
        invoke<InboxRelationshipConversionResult>(
          inboxChannels.convertToRelationship,
          input,
          convertInboxItemToRelationshipInputSchema,
        ),
    },
    events: {
      create: (input) => invoke<EventDetails>(eventChannels.create, input, createEventInputSchema),
      get: (input) => invoke<EventDetails>(eventChannels.get, input, getEventInputSchema),
      list: (input) => invoke<EventPageResult>(eventChannels.list, input, eventPageRequestSchema),
      update: (input) => invoke<EventDetails>(eventChannels.update, input, updateEventInputSchema),
      archive: (input) =>
        invoke<EventDetails>(eventChannels.archive, input, eventLifecycleInputSchema),
      restore: (input) =>
        invoke<EventDetails>(eventChannels.restore, input, eventLifecycleInputSchema),
    },
    timeline: {
      listCampaign: (input) =>
        invoke<TimelinePageResult>(
          timelineChannels.listCampaign,
          input,
          timelineCampaignRequestSchema,
        ),
      listEntity: (input) =>
        invoke<TimelinePageResult>(timelineChannels.listEntity, input, timelineEntityRequestSchema),
    },
    sessions: {
      create: (input) => invoke<Session>(sessionChannels.create, input, createSessionInputSchema),
      get: (input) => invoke<Session>(sessionChannels.get, input, getSessionInputSchema),
      list: (input) =>
        invoke<SessionPageResult>(sessionChannels.list, input, sessionPageRequestSchema),
      update: (input) => invoke<Session>(sessionChannels.update, input, updateSessionInputSchema),
    },
    sessionParticipants: {
      list: (input) =>
        invoke<SessionParticipant[]>(
          sessionParticipantChannels.list,
          input,
          listSessionParticipantsInputSchema,
        ),
      replace: (input) =>
        invoke<SessionParticipant[]>(
          sessionParticipantChannels.replace,
          input,
          replaceSessionParticipantsInputSchema,
        ),
    },
    sessionIntentions: {
      create: (input) =>
        invoke<SessionIntention>(
          sessionIntentionChannels.create,
          input,
          createSessionIntentionInputSchema,
        ),
      get: (input) =>
        invoke<SessionIntention>(
          sessionIntentionChannels.get,
          input,
          getSessionIntentionInputSchema,
        ),
      list: (input) =>
        invoke<SessionIntentionPageResult>(
          sessionIntentionChannels.list,
          input,
          sessionIntentionPageRequestSchema,
        ),
      update: (input) =>
        invoke<SessionIntention>(
          sessionIntentionChannels.update,
          input,
          updateSessionIntentionInputSchema,
        ),
    },
  };
}
