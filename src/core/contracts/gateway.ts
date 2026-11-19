import type { AssertionGateway } from './assertions';
import type { AppearanceGateway } from './appearance';
import type { CampaignGateway } from './campaigns';
import type { CampaignCoverGateway } from './campaign-covers';
import type { CampaignSignalGateway } from './campaign-signal-engine';
import type { ClockGateway } from './clocks';
import type { DemandGateway } from './demands';
import type { DiagnosticsGateway } from './diagnostics';
import type { EntityGateway } from './entities';
import type { EntityReferenceImageGateway } from './entity-reference-images';
import type { EntityTypeGateway } from './entity-types';
import type { EventGateway } from './events';
import type { FieldDefinitionGateway } from './field-definitions';
import type { InboxGateway } from './inbox';
import type { ImageImportGateway } from './image-imports';
import type { ImageFieldValueGateway } from './image-field-values';
import type { PhaseZeroGateway } from './phase-zero';
import type { NoteGateway } from './notes';
import type { RelationshipTypeGateway } from './relationship-types';
import type { RelationshipGateway } from './relationships';
import type { RelationshipViewGateway } from './relationship-views';
import type { TimelineGateway } from './timeline';
import type { StoryThreadGateway } from './story-threads';
import type { CausalityGateway } from './causality';
import type {
  SessionGateway,
  SessionIntentionsGateway,
  SessionParticipantsGateway,
} from './sessions';
import type { SessionClosingGateway } from './session-closing';

export interface CampaignManagerGateway {
  appearance: AppearanceGateway;
  diagnostics: DiagnosticsGateway;
  phaseZero: PhaseZeroGateway;
  campaigns: CampaignGateway;
  images: ImageImportGateway & CampaignCoverGateway & EntityReferenceImageGateway;
  imageFieldValues: ImageFieldValueGateway;
  entityTypes: EntityTypeGateway;
  relationshipTypes: RelationshipTypeGateway;
  relationships: RelationshipGateway;
  relationshipViews: RelationshipViewGateway;
  fieldDefinitions: FieldDefinitionGateway;
  entities: EntityGateway;
  assertions: AssertionGateway;
  campaignSignals: CampaignSignalGateway;
  clocks: ClockGateway;
  demands: DemandGateway;
  notes: NoteGateway;
  storyThreads: StoryThreadGateway;
  causality: CausalityGateway;
  inbox: InboxGateway;
  events: EventGateway;
  timeline: TimelineGateway;
  sessions: SessionGateway;
  sessionParticipants: SessionParticipantsGateway;
  sessionIntentions: SessionIntentionsGateway;
  sessionClosing: SessionClosingGateway;
}
