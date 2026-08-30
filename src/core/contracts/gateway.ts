import type { CampaignGateway } from './campaigns';
import type { EntityGateway } from './entities';
import type { EntityTypeGateway } from './entity-types';
import type { FieldDefinitionGateway } from './field-definitions';
import type { PhaseZeroGateway } from './phase-zero';

export interface CampaignManagerGateway {
  phaseZero: PhaseZeroGateway;
  campaigns: CampaignGateway;
  entityTypes: EntityTypeGateway;
  fieldDefinitions: FieldDefinitionGateway;
  entities: EntityGateway;
}
