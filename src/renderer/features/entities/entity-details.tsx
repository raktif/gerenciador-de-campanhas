import { useEffect, useRef, useState } from 'react';
import type { Campaign } from '../../../core/contracts/campaigns';
import type { EntityDetails } from '../../../core/contracts/entities';
import type { EntityType } from '../../../core/contracts/entity-types';
import type { FieldDefinition } from '../../../core/contracts/field-definitions';
import type { RelationshipType } from '../../../core/contracts/relationship-types';
import type { Relationship } from '../../../core/contracts/relationships';

export function EntityDetailsView({
  campaign,
  details,
  entityTypes,
  onBack,
  onEdit,
  onOpenAssertions,
  onOpenNotes,
  onOpenTimeline,
  onOpenRelationships,
  focusRelationshipButton = false,
}: {
  campaign: Campaign;
  details: EntityDetails;
  entityTypes: EntityType[];
  onBack: () => void;
  onEdit: () => void;
  onOpenAssertions: () => void;
  onOpenNotes: () => void;
  onOpenTimeline: () => void;
  onOpenRelationships: (entity: EntityDetails['entity']) => void;
  focusRelationshipButton?: boolean;
}): React.JSX.Element {
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [relationshipTypes, setRelationshipTypes] = useState<RelationshipType[]>([]);
  const [relatedEntities, setRelatedEntities] = useState<EntityDetails['entity'][]>([]);
  const [fieldsLoading, setFieldsLoading] = useState(true);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const relationshipsButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    (focusRelationshipButton ? relationshipsButtonRef.current : titleRef.current)?.focus();
  }, [focusRelationshipButton]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      window.campaignManager.fieldDefinitions.list({
        campaignId: campaign.id,
        entityTypeId: details.entity.entityTypeId,
        filters: { isArchived: false },
      }),
      window.campaignManager.relationships.list({
        campaignId: campaign.id,
        limit: 100,
        filters: { archived: false, entityId: details.entity.id },
      }),
      window.campaignManager.relationshipTypes.list({
        campaignId: campaign.id,
        limit: 100,
        filters: { isArchived: false },
      }),
      window.campaignManager.entities.list({
        campaignId: campaign.id,
        limit: 100,
        filters: { archived: false },
      }),
    ]).then(([fieldResult, relationshipResult, typeResult, entityResult]) => {
        if (cancelled) return;
        if (fieldResult.ok) setFields(fieldResult.data.items);
        if (relationshipResult.ok) setRelationships(relationshipResult.data.items);
        if (typeResult.ok) setRelationshipTypes(typeResult.data.items);
        if (entityResult.ok) setRelatedEntities(entityResult.data.items);
        setFieldsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [campaign.id, details.entity.entityTypeId, details.entity.id]);

  const valuesByField = new Map(
    details.fieldValues.map((fieldValue) => [fieldValue.fieldDefinitionId, fieldValue.value]),
  );
  const filledFields = fields.filter(
    (field) =>
      field.dataType !== 'entity_reference' &&
      field.dataType !== 'entity_reference_list' &&
      valuesByField.has(field.id),
  );
  const referenceFields = fields
    .filter(
      (field) => field.dataType === 'entity_reference' || field.dataType === 'entity_reference_list',
    )
    .map((field) => ({ field, entityIds: referencedEntityIds(field, details.entity.id, relationships, relationshipTypes) }))
    .filter(({ entityIds }) => entityIds.length > 0);
  const entityType = entityTypes.find((type) => type.id === details.entity.entityTypeId);

  return (
    <section aria-labelledby="entity-details-title" className="mx-auto w-full max-w-4xl">
      <button className={backClass} onClick={onBack} type="button">
        ← Voltar para entidades
      </button>
      <article className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm">
        <header className="flex flex-wrap items-start justify-between gap-5 border-b border-stone-200 bg-stone-50 px-8 py-7">
          <div>
            <p className="text-xs font-bold tracking-[0.2em] text-amber-800 uppercase">
              Detalhes da entidade
            </p>
            <h1
              className="mt-2 text-3xl font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700"
              id="entity-details-title"
              ref={titleRef}
              tabIndex={-1}
            >
              {details.entity.name}
            </h1>
            <p className="mt-2 text-slate-600">
              {entityType?.singularName ?? 'Tipo de entidade não encontrado'}
            </p>
          </div>
          <button className={primaryClass} onClick={onEdit} type="button">
            Editar
          </button>
        </header>

        <div className="space-y-8 px-8 py-8">
          {details.entity.summary === null ? null : (
            <section aria-labelledby="entity-description-title">
              <h2 className={sectionTitleClass} id="entity-description-title">
                Descrição
              </h2>
              <p className="mt-3 whitespace-pre-wrap text-slate-700">{details.entity.summary}</p>
            </section>
          )}

          <section aria-labelledby="entity-metadata-title">
            <h2 className={sectionTitleClass} id="entity-metadata-title">
              Informações narrativas
            </h2>
            <dl className="mt-3 grid gap-4 rounded-2xl border border-stone-200 p-5 sm:grid-cols-2">
              <Detail label="Estado canônico" value={canonStateLabel(details.entity.canonState)} />
              <Detail
                label="Natureza da informação"
                value={knowledgeStateLabel(details.entity.knowledgeState)}
              />
              <Detail label="Visibilidade" value={visibilityLabel(details.entity.visibility)} />
              <Detail label="Origem" value={originKindLabel(details.entity.originKind)} />
            </dl>
          </section>

          {fieldsLoading ? (
            <p className="text-sm text-slate-500">Carregando campos preenchidos…</p>
          ) : filledFields.length === 0 && referenceFields.length === 0 ? null : (
            <section aria-labelledby="entity-fields-title">
              <h2 className={sectionTitleClass} id="entity-fields-title">
                Campos preenchidos
              </h2>
              <dl className="mt-3 grid gap-4 rounded-2xl border border-stone-200 p-5 sm:grid-cols-2">
                {filledFields.map((field) => (
                  <Detail
                    key={field.id}
                    label={field.label}
                    value={formatFieldValue(valuesByField.get(field.id))}
                  />
                ))}
                {referenceFields.map(({ field, entityIds }) => (
                  <Detail
                    key={field.id}
                    label={field.label}
                    value={entityIds
                      .map(
                        (entityId) =>
                          relatedEntities.find((entity) => entity.id === entityId)?.name ??
                          'Entidade vinculada indisponível',
                      )
                      .join(', ')}
                  />
                ))}
              </dl>
            </section>
          )}

          <section aria-labelledby="entity-relationships-title">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className={sectionTitleClass} id="entity-relationships-title">
                Relações
              </h2>
              <button
                className={secondaryClass}
                onClick={() => onOpenRelationships(details.entity)}
                ref={relationshipsButtonRef}
                type="button"
              >
                Ver relações
              </button>
            </div>
            {fieldsLoading ? null : relationships.length === 0 ? (
              <p className="mt-3 text-slate-600">Nenhuma relação ativa foi registrada para esta entidade.</p>
            ) : (
              <ul className="mt-3 grid gap-3" aria-label="Relações da entidade">
                {relationships.map((relationship) => (
                  <li className="rounded-xl border border-stone-200 px-4 py-3 text-slate-700" key={relationship.id}>
                    {relationshipDescription(relationship, details.entity.id, relationshipTypes, relatedEntities)}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="entity-sources-title">
            <h2 className={sectionTitleClass} id="entity-sources-title">
              Fontes
            </h2>
            <p className="mt-3 text-slate-600">
              {details.entity.sourceId === null
                ? 'Nenhuma fonte vinculada a esta entidade.'
                : 'Esta entidade possui uma fonte vinculada. Os detalhes da fonte ainda não estão disponíveis nesta tela.'}
            </p>
          </section>

          <section aria-labelledby="entity-history-title">
            <h2 className={sectionTitleClass} id="entity-history-title">
              Histórico
            </h2>
            <p className="mt-3 text-slate-600">
              O histórico de alterações ainda não está disponível nesta versão.
            </p>
          </section>

          <section aria-labelledby="entity-related-title">
            <h2 className={sectionTitleClass} id="entity-related-title">
              Informações relacionadas
            </h2>
            <div className="mt-3 flex flex-wrap gap-3">
              <button className={secondaryClass} onClick={onOpenAssertions} type="button">
                Afirmações
              </button>
              <button className={secondaryClass} onClick={onOpenNotes} type="button">
                Notas
              </button>
              <button className={secondaryClass} onClick={onOpenTimeline} type="button">
                Linha do tempo
              </button>
            </div>
          </section>
        </div>
      </article>
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div>
      <dt className="text-sm font-semibold text-slate-800">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap text-slate-600">{value}</dd>
    </div>
  );
}

function formatFieldValue(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(formatFieldValue).join(', ');
  return JSON.stringify(value);
}

export function referencedEntityIds(
  field: FieldDefinition,
  entityId: string,
  relationships: Relationship[],
  relationshipTypes: RelationshipType[],
): string[] {
  if (field.referenceRelationshipTypeId === null || field.referenceDirection === null) return [];
  const relationshipType = relationshipTypes.find(
    (type) => type.id === field.referenceRelationshipTypeId,
  );
  return relationships
    .filter((relationship) => relationship.relationshipTypeId === field.referenceRelationshipTypeId)
    .flatMap((relationship) => {
      if (relationshipType?.isSymmetric) {
        if (relationship.sourceEntityId === entityId) return [relationship.targetEntityId];
        if (relationship.targetEntityId === entityId) return [relationship.sourceEntityId];
        return [];
      }
      if (
        field.referenceDirection === 'outgoing' &&
        relationship.sourceEntityId === entityId
      )
        return [relationship.targetEntityId];
      if (
        field.referenceDirection === 'incoming' &&
        relationship.targetEntityId === entityId
      )
        return [relationship.sourceEntityId];
      return [];
    });
}

function relationshipDescription(
  relationship: Relationship,
  entityId: string,
  relationshipTypes: RelationshipType[],
  entities: EntityDetails['entity'][],
): string {
  const type = relationshipTypes.find((item) => item.id === relationship.relationshipTypeId);
  const isSource = relationship.sourceEntityId === entityId;
  const relatedEntityId = isSource ? relationship.targetEntityId : relationship.sourceEntityId;
  const relatedName = entities.find((entity) => entity.id === relatedEntityId)?.name ?? 'Entidade indisponível';
  const label = type === undefined ? 'Relação' : isSource || type.isSymmetric ? type.name : (type.inverseName ?? type.name);
  return `${label}: ${relatedName}${relationship.description === null ? '' : ` — ${relationship.description}`}`;
}

function canonStateLabel(value: EntityDetails['entity']['canonState']): string {
  return { draft: 'Rascunho', accepted: 'Aceito', rejected: 'Rejeitado', archived: 'Arquivado' }[
    value
  ];
}

function knowledgeStateLabel(value: EntityDetails['entity']['knowledgeState']): string {
  return {
    fact: 'Fato',
    rumor: 'Rumor',
    suspicion: 'Suspeita',
    secret: 'Segredo',
    possibility: 'Possibilidade',
    disproved: 'Refutado',
  }[value];
}

function visibilityLabel(value: EntityDetails['entity']['visibility']): string {
  return { gm: 'Somente mestre', players: 'Jogadores', public: 'Público' }[value];
}

function originKindLabel(value: EntityDetails['entity']['originKind']): string {
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

const sectionTitleClass = 'text-lg font-semibold text-slate-900';
const primaryClass =
  'rounded-xl bg-amber-700 px-5 py-3 font-semibold text-white hover:bg-amber-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700';
const secondaryClass =
  'rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700';
const backClass =
  'mb-6 rounded-lg px-2 py-1 text-sm font-semibold text-slate-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700';
