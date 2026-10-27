import type { AssertionGateway } from './assertions';
import type { AppearanceGateway } from './appearance';
import type { CampaignGateway } from './campaigns';
import type { DiagnosticsGateway } from './diagnostics';
import type { EntityGateway } from './entities';
import type { EntityTypeGateway } from './entity-types';
import type { EventGateway } from './events';
import type { FieldDefinitionGateway } from './field-definitions';
import type { InboxGateway } from './inbox';
import type { ImageImportGateway } from './image-imports';
import type { PhaseZeroGateway } from './phase-zero';
import type { NoteGateway } from './notes';
import type { RelationshipTypeGateway } from './relationship-types';
import type { RelationshipGateway } from './relationships';
import type { TimelineGateway } from './timeline';
import type {
  SessionGateway,
  SessionIntentionsGateway,
  SessionParticipantsGateway,
} from './sessions';

export interface CampaignManagerGateway {
  appearance: AppearanceGateway;
  diagnostics: DiagnosticsGateway;
  phaseZero: PhaseZeroGateway;
  campaigns: CampaignGateway;
  images: ImageImportGateway;
  entityTypes: EntityTypeGateway;
  relationshipTypes: RelationshipTypeGateway;
  relationships: RelationshipGateway;
  fieldDefinitions: FieldDefinitionGateway;
  entities: EntityGateway;
  assertions: AssertionGateway;
  notes: NoteGateway;
  inbox: InboxGateway;
  events: EventGateway;
  timeline: TimelineGateway;
  sessions: SessionGateway;
  sessionParticipants: SessionParticipantsGateway;
  sessionIntentions: SessionIntentionsGateway;
}
