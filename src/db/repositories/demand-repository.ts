import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import {
  demandDetailsSchema,
  demandSchema,
  type AcceptDemand,
  type Demand,
  type DemandContent,
  type DemandDetails,
  type DemandPage,
  type DemandSuggestion,
  type DemandTargetsRequest,
  type TransformDemand,
  type TransitionDemand,
  type UpdateDemand,
} from '../../core/contracts/demands';
import { detectExplicitNeeds } from '../../core/domain/campaign-signal';
import { AppError } from '../../core/errors/app-error';
import {
  isClosedDemand as closed,
  isPendingDemand as pending,
  planDemandTransition,
} from '../../core/domain/demand';

type Row = Record<string, unknown>;
function fail(code: string, message: string): never {
  throw new AppError(code, message);
}
function parseDemand(row: Row): Demand {
  const mapped = Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key.replace(/_([a-z])/gu, (_, letter: string) => letter.toUpperCase()),
      value,
    ]),
  );
  return demandSchema.parse(mapped);
}
export class DemandRepository {
  public constructor(
    private readonly db: Database.Database,
    private readonly now = () => new Date().toISOString(),
  ) {}

  private transaction<T>(campaignId: string, operation: () => T): T {
    try {
      return this.db
        .transaction(() => {
          this.requireCampaign(campaignId, true);
          return operation();
        })
        .immediate();
    } catch (error) {
      if (
        error instanceof Error &&
        /SQLITE_BUSY|SQLITE_LOCKED/u.test(String((error as Error & { code?: string }).code))
      )
        fail('DATABASE_BUSY', 'O banco está ocupado. Tente novamente.');
      throw error;
    }
  }
  private requireCampaign(id: string, write = false): void {
    const row = this.db.prepare('SELECT status FROM campaigns WHERE id=?').get(id) as
      { status: string } | undefined;
    if (!row) fail('CAMPAIGN_NOT_FOUND', 'Campanha não encontrada.');
    if (write && row.status !== 'active')
      fail('INVALID_CAMPAIGN_STATE', 'Somente campanhas ativas podem alterar Demandas.');
  }
  public get(campaignId: string, id: string): DemandDetails {
    this.requireCampaign(campaignId);
    const row = this.db
      .prepare('SELECT * FROM demands WHERE campaign_id=? AND id=?')
      .get(campaignId, id) as Row | undefined;
    if (!row) fail('DEMAND_NOT_FOUND', 'Demanda não encontrada nesta campanha.');
    const demand = parseDemand(row);
    const entityLinks = this.db
      .prepare(
        `SELECT 'entity' AS targetType,l.entity_id AS targetId,l.role,e.name AS label,
      (e.archived_at IS NOT NULL) AS archived FROM demand_entity_links l JOIN entities e ON e.id=l.entity_id WHERE l.demand_id=? ORDER BY l.entity_id,l.role`,
      )
      .all(id) as Row[];
    const clockLinks = this.db
      .prepare(
        `SELECT 'clock' AS targetType,c.id AS targetId,'related' AS role,c.name AS label,0 AS archived
      FROM demand_clock_links l JOIN clocks c ON c.id=l.clock_id WHERE l.demand_id=? ORDER BY c.id`,
      )
      .all(id) as Row[];
    const sessionLinks = this.db
      .prepare(
        `SELECT 'session' AS targetType,s.id AS targetId,'related' AS role,s.title AS label,0 AS archived
      FROM demand_session_links l JOIN sessions s ON s.id=l.session_id WHERE l.demand_id=? ORDER BY s.id`,
      )
      .all(id) as Row[];
    const children = (
      this.db
        .prepare('SELECT * FROM demands WHERE campaign_id=? AND parent_id=? ORDER BY created_at,id')
        .all(campaignId, id) as Row[]
    ).map(parseDemand);
    return demandDetailsSchema.parse({
      demand,
      links: [...entityLinks, ...clockLinks, ...sessionLinks].map((link) => ({
        ...link,
        archived: link.archived === 1,
      })),
      children,
      canResolve: pending(demand.status) && children.every(closed),
    });
  }
  public list(input: DemandPage) {
    this.requireCampaign(input.campaignId);
    const offset = this.offset(input.cursor, `${input.campaignId}:${input.status ?? ''}`);
    const where = `campaign_id=?${input.status ? ' AND status=?' : ''}`;
    const args = input.status ? [input.campaignId, input.status] : [input.campaignId];
    const rows = this.db
      .prepare(`SELECT * FROM demands WHERE ${where} ORDER BY created_at,id LIMIT ? OFFSET ?`)
      .all(...args, input.limit + 1, offset) as Row[];
    return {
      items: rows.slice(0, input.limit).map(parseDemand),
      total: (
        this.db.prepare(`SELECT count(*) AS total FROM demands WHERE ${where}`).get(...args) as {
          total: number;
        }
      ).total,
      nextCursor:
        rows.length > input.limit
          ? this.cursor(`${input.campaignId}:${input.status ?? ''}`, offset + input.limit)
          : null,
    };
  }
  public targets(input: DemandTargetsRequest) {
    this.requireCampaign(input.campaignId);
    const scope = `${input.campaignId}:${input.targetType}`;
    const offset = this.offset(input.cursor, scope);
    const table = { entity: 'entities', clock: 'clocks', session: 'sessions' }[input.targetType];
    const label = input.targetType === 'session' ? 'title' : 'name';
    const rows = this.db
      .prepare(
        `SELECT id,${label} AS label,0 AS archived FROM ${table} WHERE campaign_id=? ${input.targetType === 'entity' ? 'AND archived_at IS NULL' : ''} ORDER BY ${label},id LIMIT ? OFFSET ?`,
      )
      .all(input.campaignId, input.limit + 1, offset) as {
      id: string;
      label: string;
      archived: number;
    }[];
    return {
      items: rows.slice(0, input.limit).map((r) => ({ ...r, archived: false })),
      nextCursor: rows.length > input.limit ? this.cursor(scope, offset + input.limit) : null,
    };
  }
  private cursor(scope: string, offset: number): string {
    return JSON.stringify({ scope, offset });
  }
  private offset(cursor: string | undefined, scope: string): number {
    if (!cursor) return 0;
    try {
      const value = JSON.parse(cursor) as { scope: unknown; offset: unknown };
      if (
        value.scope !== scope ||
        !Number.isSafeInteger(value.offset) ||
        (value.offset as number) < 0
      )
        throw new Error();
      return value.offset as number;
    } catch {
      return fail('INVALID_CURSOR', 'Paginação inválida para esta consulta.');
    }
  }
  private source(campaignId: string, signalId: string) {
    const rows = this.db
      .prepare(
        `SELECT e.campaign_id AS campaignId,e.id AS entityId,e.name AS entityName,
      f.id AS fieldDefinitionId,f.label AS fieldLabel,v.value_text AS value,v.id AS valueId
      FROM entities e JOIN entity_types t ON t.id=e.entity_type_id AND t.is_archived=0
      JOIN field_definitions f ON f.entity_type_id=e.entity_type_id AND f.is_archived=0
      JOIN field_values v ON v.entity_id=e.id AND v.field_definition_id=f.id
      WHERE e.campaign_id=? AND e.archived_at IS NULL AND f.semantic_role='need'
      AND f.data_type IN ('short_text','long_text') AND v.value_text IS NOT NULL`,
      )
      .all(campaignId) as {
      campaignId: string;
      entityId: string;
      entityName: string;
      fieldDefinitionId: string;
      fieldLabel: string;
      value: string;
      valueId: string;
    }[];
    const source = rows.find((row) => detectExplicitNeeds([row])[0]?.signalId === signalId);
    if (!source)
      fail(
        'DEMAND_SOURCE_CHANGED',
        'A necessidade não está mais disponível. Revise e recalcule os sinais.',
      );
    return source;
  }
  public suggestion(campaignId: string, signalId: string): DemandSuggestion {
    this.requireCampaign(campaignId);
    const signal = this.db
      .prepare('SELECT * FROM campaign_signals WHERE campaign_id=? AND id=?')
      .get(campaignId, signalId) as Row | undefined;
    if (
      signal?.signal_type !== 'explicit_need' ||
      !['new', 'viewed'].includes(String(signal.status))
    )
      fail(
        'DEMAND_SIGNAL_NOT_READY',
        'Revise ou reative um sinal de necessidade atual antes de aceitar.',
      );
    const source = this.source(campaignId, signalId);
    const detection = detectExplicitNeeds([source])[0];
    const evidence = this.db
      .prepare(
        "SELECT role,description FROM signal_evidence WHERE signal_id=? AND object_type='entity' AND object_id=? ORDER BY sort_order,id LIMIT 1",
      )
      .get(signalId, source.entityId) as { role: string; description: string | null } | undefined;
    if (
      !detection ||
      signal.summary !== detection.summary ||
      signal.title !== detection.title ||
      signal.rule_version !== detection.ruleVersion ||
      evidence?.role !== detection.evidenceRole ||
      evidence.description !== detection.evidenceDescription
    )
      fail(
        'DEMAND_SOURCE_CHANGED',
        'A necessidade mudou. Recalcule e revise o sinal antes de aceitar.',
      );
    return {
      signalId,
      signalRevision: Number(signal.revision),
      entityId: source.entityId,
      entityName: source.entityName,
      fieldLabel: source.fieldLabel,
      need: source.value,
      title: `Necessidade de ${source.entityName}`.slice(0, 200),
      rationale: `Regra ${signal.rule_version}: campo “${source.fieldLabel}” com papel Need preenchido. Nenhuma urgência, risco ou obstáculo foi inferido.`,
    };
  }
  public accept(input: AcceptDemand): DemandDetails {
    return this.transaction(input.campaignId, () => {
      const prior = this.db
        .prepare(
          'SELECT id,source_snapshot FROM demands WHERE campaign_id=? AND accepted_signal_id=?',
        )
        .get(input.campaignId, input.signalId) as
        { id: string; source_snapshot: string } | undefined;
      if (prior) {
        if (
          (JSON.parse(prior.source_snapshot) as { acceptedPayload: string }).acceptedPayload !==
          JSON.stringify(input.content)
        )
          fail(
            'DEMAND_OPERATION_CONFLICT',
            'Este sinal já foi aceito com outro conteúdo. Abra a Demanda existente.',
          );
        return this.get(input.campaignId, prior.id);
      }
      const suggestion = this.suggestion(input.campaignId, input.signalId);
      if (suggestion.signalRevision !== input.signalRevision)
        fail('REVISION_CONFLICT', 'O sinal foi alterado. Recarregue antes de aceitar.');
      if (
        input.content.need !== suggestion.need ||
        input.content.requesterEntityId !== suggestion.entityId
      )
        fail(
          'DEMAND_SOURCE_CHANGED',
          'A aceitação deve preservar a necessidade e seu solicitante originais.',
        );
      const source = this.source(input.campaignId, input.signalId);
      const signal = this.db
        .prepare('SELECT * FROM campaign_signals WHERE id=? AND campaign_id=?')
        .get(input.signalId, input.campaignId);
      const evidence = this.db
        .prepare('SELECT * FROM signal_evidence WHERE signal_id=? ORDER BY sort_order,id')
        .all(input.signalId);
      const id = this.insert(input.campaignId, input.content, {
        parentId: null,
        acceptedSignalId: input.signalId,
        lineageSignalId: input.signalId,
        sourceEntityId: source.entityId,
        sourceFieldDefinitionId: source.fieldDefinitionId,
        sourceFieldValueId: source.valueId,
        sourceSnapshot: JSON.stringify({
          signal,
          evidence,
          need: source.value,
          fieldLabel: source.fieldLabel,
          entityName: source.entityName,
          rationale: suggestion.rationale,
          acceptedPayload: JSON.stringify(input.content),
        }),
      });
      this.db
        .prepare(
          "UPDATE campaign_signals SET status='converted',dismissed_until=NULL,updated_at=?,revision=revision+1 WHERE campaign_id=? AND id=? AND revision=?",
        )
        .run(this.now(), input.campaignId, input.signalId, input.signalRevision);
      return this.get(input.campaignId, id);
    });
  }
  private insert(
    campaignId: string,
    content: DemandContent,
    lineage: Pick<
      Demand,
      | 'parentId'
      | 'acceptedSignalId'
      | 'lineageSignalId'
      | 'sourceEntityId'
      | 'sourceFieldDefinitionId'
      | 'sourceFieldValueId'
      | 'sourceSnapshot'
    >,
  ): string {
    const id = randomUUID(),
      sourceId = randomUUID(),
      now = this.now();
    this.db
      .prepare("INSERT INTO sources(id,kind,description,created_at) VALUES(?,'generator',?,?)")
      .run(
        sourceId,
        `Demanda determinística: ${lineage.parentId ? 'subdemanda explícita com linhagem preservada' : 'necessidade explícita aceita após revisão'}.`,
        now,
      );
    this.db
      .prepare(
        `INSERT INTO demands(id,campaign_id,title,need,summary,obstacle,risks,urgency,requester_entity_id,status,
      parent_id,accepted_signal_id,lineage_signal_id,source_entity_id,source_field_definition_id,source_field_value_id,source_id,source_snapshot,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,'available',?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        campaignId,
        content.title,
        content.need,
        content.summary,
        content.obstacle,
        content.risks,
        content.urgency,
        content.requesterEntityId,
        lineage.parentId,
        lineage.acceptedSignalId,
        lineage.lineageSignalId,
        lineage.sourceEntityId,
        lineage.sourceFieldDefinitionId,
        lineage.sourceFieldValueId,
        sourceId,
        lineage.sourceSnapshot,
        now,
        now,
      );
    this.replaceLinks(campaignId, id, content);
    return id;
  }
  private current(input: { campaignId: string; id: string; revision: number }): DemandDetails {
    const details = this.get(input.campaignId, input.id);
    if (details.demand.revision !== input.revision)
      fail('REVISION_CONFLICT', 'A Demanda foi alterada. Recarregue antes de continuar.');
    return details;
  }
  private replaceLinks(campaignId: string, id: string, content: DemandContent): void {
    const wanted = [
      {
        targetType: 'entity' as const,
        targetId: content.requesterEntityId,
        role: 'requester' as const,
      },
      ...content.links,
    ].filter(
      (link, index, all) =>
        all.findIndex(
          (other) =>
            other.targetType === link.targetType &&
            other.targetId === link.targetId &&
            other.role === link.role,
        ) === index,
    );
    if (
      wanted.some(
        (link) => link.role === 'requester' && link.targetId !== content.requesterEntityId,
      )
    )
      fail('DEMAND_LINK_INVALID', 'Escolha apenas um solicitante principal.');
    for (const link of wanted) {
      const table = { entity: 'entities', clock: 'clocks', session: 'sessions' }[link.targetType];
      const target = this.db
        .prepare(`SELECT * FROM ${table} WHERE campaign_id=? AND id=?`)
        .get(campaignId, link.targetId) as Row | undefined;
      if (!target || (link.targetType === 'entity' && target.archived_at !== null))
        fail(
          'DEMAND_LINK_INVALID',
          'O alvo deve pertencer à campanha e a entidade deve estar ativa.',
        );
    }
    this.db
      .prepare(
        "DELETE FROM demand_entity_links WHERE demand_id=? AND NOT (entity_id=? AND role='requester')",
      )
      .run(id, content.requesterEntityId);
    this.db.prepare('DELETE FROM demand_clock_links WHERE demand_id=?').run(id);
    this.db.prepare('DELETE FROM demand_session_links WHERE demand_id=?').run(id);
    for (const link of wanted) {
      if (link.targetType === 'entity') {
        if (link.targetId !== content.requesterEntityId || link.role !== 'requester')
          this.db
            .prepare('INSERT INTO demand_entity_links VALUES(?,?,?)')
            .run(id, link.targetId, link.role);
      } else {
        const table = link.targetType === 'clock' ? 'demand_clock_links' : 'demand_session_links';
        this.db.prepare(`INSERT INTO ${table} VALUES(?,?)`).run(id, link.targetId);
      }
    }
  }
  public update(input: UpdateDemand): DemandDetails {
    return this.transaction(input.campaignId, () => {
      const { demand } = this.current(input);
      if (!pending(demand.status))
        fail('DEMAND_IMMUTABLE', 'Somente Demandas disponíveis ou ativas podem ser editadas.');
      const c = input.content;
      this.db
        .prepare(
          `UPDATE demands SET title=?,need=?,summary=?,obstacle=?,risks=?,urgency=?,requester_entity_id=?,revision=revision+1,updated_at=? WHERE id=? AND campaign_id=?`,
        )
        .run(
          c.title,
          c.need,
          c.summary,
          c.obstacle,
          c.risks,
          c.urgency,
          c.requesterEntityId,
          this.now(),
          input.id,
          input.campaignId,
        );
      this.replaceLinks(input.campaignId, input.id, c);
      return this.get(input.campaignId, input.id);
    });
  }
  public transform(input: TransformDemand): DemandDetails {
    return this.transaction(input.campaignId, () => {
      const payload = JSON.stringify({
        campaignId: input.campaignId,
        id: input.id,
        content: input.content,
      });
      const previous = this.db
        .prepare('SELECT * FROM demand_transform_operations WHERE id=?')
        .get(input.idempotencyKey) as
        { campaign_id: string; payload: string; child_id: string } | undefined;
      if (previous) {
        if (previous.campaign_id !== input.campaignId || previous.payload !== payload)
          fail(
            'DEMAND_OPERATION_CONFLICT',
            'Esta tentativa já foi usada para outra transformação.',
          );
        return this.get(input.campaignId, previous.child_id);
      }
      const { demand } = this.current(input);
      if (!pending(demand.status))
        fail('DEMAND_IMMUTABLE', 'Reabra ou restaure o pai antes de criar subdemanda.');
      const childId = this.insert(input.campaignId, input.content, {
        ...demand,
        parentId: demand.id,
        acceptedSignalId: null,
      });
      this.db
        .prepare(
          "UPDATE demands SET status='archived',status_before_archive=?,revision=revision+1,updated_at=? WHERE id=?",
        )
        .run(demand.status, this.now(), demand.id);
      this.db
        .prepare('INSERT INTO demand_transform_operations VALUES(?,?,?,?)')
        .run(input.idempotencyKey, input.campaignId, payload, childId);
      return this.get(input.campaignId, childId);
    });
  }
  public transition(input: TransitionDemand): DemandDetails {
    return this.transaction(input.campaignId, () => {
      const details = this.get(input.campaignId, input.id),
        d = details.demand;
      // A lost resolve response can be retried without another Event.
      if (input.action === 'resolve' && d.generatedEventId !== null) return details;
      this.current(input);
      const next = planDemandTransition(details, input);
      let eventId = d.generatedEventId;
      if (next === 'resolved' && d.status !== 'archived') {
        eventId = randomUUID();
        const now = this.now();
        this.db
          .prepare(
            `INSERT INTO events(id,campaign_id,title,description_markdown,canon_state,knowledge_state,visibility,origin_kind,source_id,created_at,updated_at)
          VALUES(?,?,?,?,'draft','possibility','gm','generator',?,?,?)`,
          )
          .run(
            eventId,
            input.campaignId,
            d.title,
            `${d.need}\n\n${d.summary}`,
            d.sourceId,
            now,
            now,
          );
        const entities = [
          ...new Set(
            details.links
              .filter((link) => link.targetType === 'entity')
              .map((link) => link.targetId),
          ),
        ];
        entities.forEach((entityId, index) =>
          this.db
            .prepare(
              "INSERT INTO event_entity_links(event_id,entity_id,role,sort_order) VALUES(?,?,'related',?)",
            )
            .run(eventId, entityId, index),
        );
      }
      this.db
        .prepare(
          'UPDATE demands SET status=?,status_before_archive=?,generated_event_id=?,revision=revision+1,updated_at=? WHERE campaign_id=? AND id=?',
        )
        .run(
          next,
          next === 'archived' ? d.status : null,
          eventId,
          this.now(),
          input.campaignId,
          input.id,
        );
      return this.get(input.campaignId, input.id);
    });
  }
  public sourceLocks(campaignId: string, entityId: string): string[] {
    this.requireCampaign(campaignId);
    return (
      this.db
        .prepare(
          'SELECT DISTINCT source_field_definition_id AS id FROM demands WHERE campaign_id=? AND source_entity_id=?',
        )
        .all(campaignId, entityId) as { id: string }[]
    ).map((row) => row.id);
  }
  public assertEntityMutation(
    input: {
      campaignId: string;
      id: string;
      patch?: { entityTypeId?: string | undefined } | undefined;
      fieldValues?: { fieldDefinitionId: string; value: unknown }[] | undefined;
    },
    archive = false,
  ): void {
    const locks = this.sourceLocks(input.campaignId, input.id);
    if (locks.length && input.patch?.entityTypeId !== undefined) {
      const entity = this.db
        .prepare('SELECT entity_type_id FROM entities WHERE campaign_id=? AND id=?')
        .get(input.campaignId, input.id) as { entity_type_id: string } | undefined;
      if (entity && entity.entity_type_id !== input.patch.entityTypeId)
        fail(
          'DEMAND_NEED_LOCKED',
          'Campo usado por Demanda; crie outro campo de Need para nova necessidade.',
        );
    }
    if (input.fieldValues !== undefined) {
      for (const fieldId of locks) {
        const row = this.db
          .prepare(
            'SELECT value_text FROM field_values WHERE entity_id=? AND field_definition_id=?',
          )
          .get(input.id, fieldId) as { value_text: string };
        if (
          input.fieldValues.find((field) => field.fieldDefinitionId === fieldId)?.value !==
          row.value_text
        )
          fail(
            'DEMAND_NEED_LOCKED',
            'Campo usado por Demanda; crie outro campo de Need para nova necessidade.',
          );
      }
    }
    if (
      archive &&
      this.db
        .prepare(
          `SELECT 1 FROM demands d JOIN demand_entity_links l ON l.demand_id=d.id WHERE d.campaign_id=? AND l.entity_id=? AND d.status IN ('available','active') LIMIT 1`,
        )
        .get(input.campaignId, input.id)
    )
      fail(
        'DEMAND_PENDING_ENTITY',
        'Arquive ou encerre as Demandas pendentes antes de arquivar a entidade.',
      );
  }
  public assertDefinitionMutation(
    id: string,
    patch: {
      dataType?: string | undefined;
      semanticRole?: string | null | undefined;
      isArchived?: boolean | undefined;
    },
  ): void {
    const original = this.db
      .prepare(
        `SELECT f.* FROM field_definitions f WHERE f.id=? AND EXISTS(SELECT 1 FROM demands WHERE source_field_definition_id=f.id)`,
      )
      .get(id) as Row | undefined;
    if (
      original &&
      ((patch.dataType !== undefined && patch.dataType !== original.data_type) ||
        (patch.semanticRole !== undefined && patch.semanticRole !== original.semantic_role) ||
        (patch.isArchived !== undefined && Number(patch.isArchived) !== original.is_archived))
    )
      fail(
        'DEMAND_NEED_LOCKED',
        'Definição compartilhada usada por Demanda; crie outro campo de Need.',
      );
  }
  public assertTypeArchive(id: string): void {
    if (
      this.db
        .prepare(
          `SELECT 1 FROM demands d JOIN field_definitions f ON f.id=d.source_field_definition_id WHERE f.entity_type_id=? LIMIT 1`,
        )
        .get(id)
    )
      fail(
        'DEMAND_NEED_LOCKED',
        'O tipo contém campo Need usado por Demanda e não pode ser arquivado.',
      );
  }
}
