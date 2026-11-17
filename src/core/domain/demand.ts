import type { Demand, DemandDetails, TransitionDemand } from '../contracts/demands';
import { AppError } from '../errors/app-error';

export function isPendingDemand(status: string): boolean {
  return status === 'available' || status === 'active';
}
export function isClosedDemand(demand: Demand): boolean {
  const status = demand.status === 'archived' ? demand.statusBeforeArchive : demand.status;
  return status === 'resolved' || status === 'failed' || status === 'ignored';
}
export function planDemandTransition(
  details: DemandDetails,
  input: Pick<TransitionDemand, 'action' | 'confirmed'>,
): Demand['status'] {
  const d = details.demand;
  let next: Demand['status'];
  if (input.action === 'archive' && d.status !== 'archived') next = 'archived';
  else if (input.action === 'restore' && d.status === 'archived' && d.statusBeforeArchive)
    next = d.statusBeforeArchive;
  else if (input.action === 'reopen' && (d.status === 'failed' || d.status === 'ignored'))
    next = 'available';
  else if (input.action === 'activate' && d.status === 'available') next = 'active';
  else if (isPendingDemand(d.status) && input.action === 'resolve') next = 'resolved';
  else if (isPendingDemand(d.status) && input.action === 'fail') next = 'failed';
  else if (isPendingDemand(d.status) && input.action === 'ignore') next = 'ignored';
  else throw new AppError('DEMAND_TRANSITION_INVALID', 'Esta ação não é permitida neste estado.');
  if (
    isPendingDemand(next) &&
    details.links.some((link) => link.targetType === 'entity' && link.archived)
  )
    throw new AppError(
      'DEMAND_ENTITY_ARCHIVED',
      'Restaure primeiro todas as entidades vinculadas.',
    );
  if (input.action === 'resolve') {
    if (!details.children.every(isClosedDemand))
      throw new AppError(
        'DEMAND_CHILDREN_PENDING',
        'Encerre todas as subdemandas antes de resolver o pai.',
      );
    if (input.confirmed !== true)
      throw new AppError(
        'DEMAND_CONFIRMATION_REQUIRED',
        'Confirme a resolução e a criação do Evento imutável.',
      );
  }
  return next;
}
