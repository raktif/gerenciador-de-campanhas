import type { EventEntityLink } from '../../../core/contracts/events';
import type { TimelineEntry } from '../../../core/contracts/timeline';

const roleLabels: Record<EventEntityLink['role'], string> = {
  participant: 'Participante',
  location: 'Local',
  cause: 'Causa',
  target: 'Alvo',
  witness: 'Testemunha',
  beneficiary: 'Beneficiário',
  victim: 'Vítima',
  related: 'Relacionado',
};

export function timelineGroupLabel(entry: TimelineEntry): string {
  return entry.sessionSequenceNumber === null
    ? 'Evento sem sessão associada'
    : `Sessão ${String(entry.sessionSequenceNumber)}`;
}

export function rolesForEntity(entry: TimelineEntry, entityId: string): string[] {
  return entry.links
    .filter((link) => link.entityId === entityId)
    .map((link) => roleLabels[link.role]);
}

export function linkSummary(entry: TimelineEntry): string {
  if (entry.links.length === 0) return 'Nenhuma entidade vinculada.';
  return entry.links
    .map((link) => `${roleLabels[link.role]} (ordem ${String(link.sortOrder + 1)})`)
    .join(' · ');
}

export function originLabel(value: TimelineEntry['event']['originKind']): string {
  return {
    manual: 'Manual',
    session: 'Sessão',
    import: 'Importação',
    document: 'Documento',
    ruleset: 'Regras',
    ai: 'IA',
    generator: 'Gerador',
  }[value];
}
