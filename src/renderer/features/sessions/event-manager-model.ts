import type { Entity } from '../../../core/contracts/entities';
import type {
  CreateEventInput,
  Event,
  EventDetails,
  EventEntityLinkInput,
  EventPatch,
} from '../../../core/contracts/events';

export function activeEntities(entities: Entity[]): Entity[] {
  return entities.filter((entity) => entity.archivedAt === null);
}

export function eventPatch(input: CreateEventInput, event: Event): EventPatch {
  const patch: EventPatch = {};
  if (input.sessionId !== event.sessionId) patch.sessionId = input.sessionId;
  if (input.title !== event.title) patch.title = input.title;
  if (input.descriptionMarkdown !== event.descriptionMarkdown)
    patch.descriptionMarkdown = input.descriptionMarkdown;
  if (input.eventOrder !== event.eventOrder) patch.eventOrder = input.eventOrder;
  if (input.occurredAtLabel !== event.occurredAtLabel)
    patch.occurredAtLabel = input.occurredAtLabel;
  if (input.canonState !== event.canonState) patch.canonState = input.canonState;
  if (input.knowledgeState !== event.knowledgeState) patch.knowledgeState = input.knowledgeState;
  if (input.visibility !== event.visibility) patch.visibility = input.visibility;
  if (input.originKind !== event.originKind) patch.originKind = input.originKind;
  if (input.sourceId !== event.sourceId) patch.sourceId = input.sourceId;
  return patch;
}

export function linksChanged(
  submitted: EventEntityLinkInput[],
  current: EventDetails['links'],
): boolean {
  const normalize = (links: readonly EventEntityLinkInput[]) =>
    [...links]
      .sort(
        (left, right) =>
          left.sortOrder - right.sortOrder ||
          left.entityId.localeCompare(right.entityId) ||
          left.role.localeCompare(right.role),
      )
      .map(({ entityId, role, sortOrder }) => ({ entityId, role, sortOrder }));
  return JSON.stringify(normalize(submitted)) !== JSON.stringify(normalize(current));
}

export function validateEventInput(
  input: Pick<
    CreateEventInput,
    | 'title'
    | 'descriptionMarkdown'
    | 'eventOrder'
    | 'occurredAtLabel'
    | 'links'
    | 'originKind'
    | 'sourceSessionId'
  >,
  activeEntityIds: ReadonlySet<string>,
): string | null {
  if (input.title.trim().length < 1 || input.title.trim().length > 200)
    return 'O t\u00edtulo deve ter entre 1 e 200 caracteres.';
  if (input.descriptionMarkdown !== null && input.descriptionMarkdown.length > 100000)
    return 'A descri\u00e7\u00e3o deve ter no m\u00e1ximo 100.000 caracteres.';
  if (input.occurredAtLabel !== null && input.occurredAtLabel.trim().length > 200)
    return 'A refer\u00eancia temporal deve ter no m\u00e1ximo 200 caracteres.';
  if (!Number.isInteger(input.eventOrder) || input.eventOrder < 0)
    return 'A ordem do evento deve ser um n\u00famero inteiro n\u00e3o negativo.';
  if (input.originKind === 'session' && input.sourceSessionId === undefined)
    return 'Selecione a sess\u00e3o que originou este evento.';
  if (input.links.length > 100) return 'Um evento pode ter no m\u00e1ximo 100 v\u00ednculos.';
  const seen = new Set<string>();
  for (const link of input.links) {
    if (!activeEntityIds.has(link.entityId))
      return 'Selecione somente entidades ativas desta campanha.';
    if (!Number.isInteger(link.sortOrder) || link.sortOrder < 0)
      return 'A ordem de cada v\u00ednculo deve ser um n\u00famero inteiro n\u00e3o negativo.';
    const key = `${link.entityId}\u0000${link.role}`;
    if (seen.has(key)) return 'Remova v\u00ednculos com a mesma entidade e papel.';
    seen.add(key);
  }
  return null;
}
