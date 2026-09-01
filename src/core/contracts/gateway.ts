import type { CampaignGateway } from './campaigns';
import type { EntityGateway } from './entities';
import type { EntityTypeGateway } from './entity-types';
import type { FieldDefinitionGateway } from './field-definitions';
import type { PhaseZeroGateway } from './phase-zero';
import type { RelationshipTypeGateway } from './relationship-types';

export interface CampaignManagerGateway {
  phaseZero: PhaseZeroGateway;
  campaigns: CampaignGateway;
  entityTypes: EntityTypeGateway;
  relationshipTypes: RelationshipTypeGateway;
  fieldDefinitions: FieldDefinitionGateway;
  entities: EntityGateway;
}
