import type { DemandRepository } from '../../db/repositories/demand-repository';
import type {
  AcceptDemand,
  DemandPage,
  DemandTargetsRequest,
  TransformDemand,
  TransitionDemand,
  UpdateDemand,
} from '../../core/contracts/demands';

// All composite writes are performed under the repository's IMMEDIATE transaction.
// No renderer payload is used as evidence or as a source identity.
export class DemandService {
  public constructor(private readonly repository: DemandRepository) {}
  public suggestion(input: { campaignId: string; signalId: string }) {
    return this.repository.suggestion(input.campaignId, input.signalId);
  }
  public get(input: { campaignId: string; id: string }) {
    return this.repository.get(input.campaignId, input.id);
  }
  public list(input: DemandPage) {
    return this.repository.list(input);
  }
  public targets(input: DemandTargetsRequest) {
    return this.repository.targets(input);
  }
  public accept(input: AcceptDemand) {
    return this.repository.accept(input);
  }
  public update(input: UpdateDemand) {
    return this.repository.update(input);
  }
  public transform(input: TransformDemand) {
    return this.repository.transform(input);
  }
  public transition(input: TransitionDemand) {
    return this.repository.transition(input);
  }
  public sourceLocks(input: { campaignId: string; id: string }) {
    return this.repository.sourceLocks(input.campaignId, input.id);
  }
}
