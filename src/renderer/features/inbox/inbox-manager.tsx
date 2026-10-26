import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Campaign } from '../../../core/contracts/campaigns';
import type { ConvertInboxItemToAssertionInput, InboxItem } from '../../../core/contracts/inbox';
import type { Session } from '../../../core/contracts/sessions';
import type { EntityType } from '../../../core/contracts/entity-types';
import type { Entity } from '../../../core/contracts/entities';
import type { RelationshipType } from '../../../core/contracts/relationship-types';
import {
  presentUserFacingError,
  type UserFacingError,
} from '../../../core/errors/user-facing-error';
import { UserFacingErrorNotice } from '../../components/user-facing-error-notice';
import { Button, DialogActions, ToolbarActions } from '../../components/actions';

type Filter = 'pending' | 'dismissed' | 'archived';
type Action = 'beginReview' | 'dismiss' | 'archive' | 'restore';
type AssertionConversionValue = ConvertInboxItemToAssertionInput['destination']['value'];

const statuses: Record<Filter, InboxItem['status'][]> = {
  pending: ['new', 'reviewing'],
  dismissed: ['dismissed'],
  archived: ['archived'],
};

export function InboxManager({
  campaign,
  onBack,
  onManageEntities,
  onManageEntityTypes,
  onManageRelationshipTypes,
}: {
  campaign: Campaign;
  onBack: () => void;
  onManageEntities: () => void;
  onManageEntityTypes: () => void;
  onManageRelationshipTypes: () => void;
}): React.JSX.Element {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [filter, setFilter] = useState<Filter>('pending');
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<UserFacingError | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{
    item: InboxItem;
    action: Extract<Action, 'dismiss' | 'archive'>;
  } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const requestRef = useRef(0);
  const [sessions, setSessions] = useState<Map<string, Session>>(new Map());
  const [entityTypes, setEntityTypes] = useState<EntityType[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [relationshipTypes, setRelationshipTypes] = useState<RelationshipType[]>([]);
  const [conversion, setConversion] = useState<InboxItem | null>(null);
  const [conversionTypeId, setConversionTypeId] = useState('');
  const [conversionName, setConversionName] = useState('');
  const [conversionSummary, setConversionSummary] = useState('');
  const [conversionCanonState, setConversionCanonState] = useState<
    'draft' | 'accepted' | 'rejected' | 'archived'
  >('accepted');
  const [conversionKnowledgeState, setConversionKnowledgeState] = useState<
    'fact' | 'rumor' | 'suspicion' | 'secret' | 'possibility' | 'disproved'
  >('fact');
  const [conversionVisibility, setConversionVisibility] = useState<'gm' | 'players' | 'public'>(
    'gm',
  );
  const [conversionError, setConversionError] = useState<UserFacingError | null>(null);
  const conversionDialogRef = useRef<HTMLFormElement>(null);
  const conversionNameRef = useRef<HTMLInputElement>(null);
  const [assertionConversion, setAssertionConversion] = useState<InboxItem | null>(null);
  const [assertionSubjectEntityId, setAssertionSubjectEntityId] = useState('');
  const [assertionObjectEntityId, setAssertionObjectEntityId] = useState('');
  const [assertionStatement, setAssertionStatement] = useState('');
  const [assertionPredicate, setAssertionPredicate] = useState('');
  const [assertionValue, setAssertionValue] = useState('');
  const [assertionCanonState, setAssertionCanonState] = useState<
    'draft' | 'accepted' | 'rejected' | 'archived'
  >('accepted');
  const [assertionKnowledgeState, setAssertionKnowledgeState] = useState<
    'fact' | 'rumor' | 'suspicion' | 'secret' | 'possibility' | 'disproved'
  >('fact');
  const [assertionVisibility, setAssertionVisibility] = useState<'gm' | 'players' | 'public'>('gm');
  const [assertionError, setAssertionError] = useState<UserFacingError | null>(null);
  const assertionDialogRef = useRef<HTMLFormElement>(null);
  const assertionSubjectRef = useRef<HTMLSelectElement>(null);
  const [noteConversion, setNoteConversion] = useState<InboxItem | null>(null);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const [noteType, setNoteType] = useState<
    'general' | 'idea' | 'scene' | 'clue' | 'secret' | 'preparation' | 'reference'
  >('general');
  const [noteLinkEntityId, setNoteLinkEntityId] = useState('');
  const [noteLinkRole, setNoteLinkRole] = useState('related');
  const [noteVisibility, setNoteVisibility] = useState<'gm' | 'players' | 'public'>('gm');
  const [noteCanonState, setNoteCanonState] = useState<
    'draft' | 'accepted' | 'rejected' | 'archived'
  >('accepted');
  const [noteKnowledgeState, setNoteKnowledgeState] = useState<
    'fact' | 'rumor' | 'suspicion' | 'secret' | 'possibility' | 'disproved'
  >('fact');
  const [noteError, setNoteError] = useState<UserFacingError | null>(null);
  const noteDialogRef = useRef<HTMLFormElement>(null);
  const noteTitleRef = useRef<HTMLInputElement>(null);
  const [eventConversion, setEventConversion] = useState<InboxItem | null>(null);
  const [eventTitle, setEventTitle] = useState('');
  const [eventDescription, setEventDescription] = useState('');
  const [eventSessionId, setEventSessionId] = useState('');
  const [eventOrder, setEventOrder] = useState(0);
  const [eventOccurredAtLabel, setEventOccurredAtLabel] = useState('');
  const [eventLinkEntityId, setEventLinkEntityId] = useState('');
  const [eventLinkRole, setEventLinkRole] = useState<
    | 'participant'
    | 'location'
    | 'cause'
    | 'target'
    | 'witness'
    | 'beneficiary'
    | 'victim'
    | 'related'
  >('related');
  const [eventVisibility, setEventVisibility] = useState<'gm' | 'players' | 'public'>('gm');
  const [eventCanonState, setEventCanonState] = useState<
    'draft' | 'accepted' | 'rejected' | 'archived'
  >('accepted');
  const [eventKnowledgeState, setEventKnowledgeState] = useState<
    'fact' | 'rumor' | 'suspicion' | 'secret' | 'possibility' | 'disproved'
  >('fact');
  const [eventError, setEventError] = useState<UserFacingError | null>(null);
  const eventDialogRef = useRef<HTMLFormElement>(null);
  const eventTitleRef = useRef<HTMLInputElement>(null);
  const announcementRef = useRef<HTMLParagraphElement>(null);
  const [relationshipConversion, setRelationshipConversion] = useState<InboxItem | null>(null);
  const [relationshipTypeId, setRelationshipTypeId] = useState('');
  const [relationshipSourceMode, setRelationshipSourceMode] = useState<'existing' | 'new'>(
    'existing',
  );
  const [relationshipTargetMode, setRelationshipTargetMode] = useState<'existing' | 'new'>(
    'existing',
  );
  const [relationshipSourceEntityId, setRelationshipSourceEntityId] = useState('');
  const [relationshipTargetEntityId, setRelationshipTargetEntityId] = useState('');
  const [relationshipSourceTypeId, setRelationshipSourceTypeId] = useState('');
  const [relationshipTargetTypeId, setRelationshipTargetTypeId] = useState('');
  const [relationshipSourceName, setRelationshipSourceName] = useState('');
  const [relationshipTargetName, setRelationshipTargetName] = useState('');
  const [relationshipDescription, setRelationshipDescription] = useState('');
  const [relationshipCanonState, setRelationshipCanonState] = useState<
    'draft' | 'accepted' | 'rejected' | 'archived'
  >('accepted');
  const [relationshipKnowledgeState, setRelationshipKnowledgeState] = useState<
    'fact' | 'rumor' | 'suspicion' | 'secret' | 'possibility' | 'disproved'
  >('fact');
  const [relationshipVisibility, setRelationshipVisibility] = useState<'gm' | 'players' | 'public'>(
    'gm',
  );
  const [relationshipError, setRelationshipError] = useState<UserFacingError | null>(null);
  const relationshipDialogRef = useRef<HTMLFormElement>(null);
  const relationshipTypeRef = useRef<HTMLSelectElement>(null);
  const selectedRelationshipType = relationshipTypes.find((type) => type.id === relationshipTypeId);
  const compatibleSourceTypes = filterAllowedEntityTypes(
    entityTypes,
    selectedRelationshipType?.allowedSourceTypeIds,
  );
  const compatibleTargetTypes = filterAllowedEntityTypes(
    entityTypes,
    selectedRelationshipType?.allowedTargetTypeIds,
  );
  const compatibleSourceEntities = filterAllowedEntities(
    entities,
    selectedRelationshipType?.allowedSourceTypeIds,
  );
  const compatibleTargetEntities = filterAllowedEntities(
    entities,
    selectedRelationshipType?.allowedTargetTypeIds,
  );
  const canChooseRelationshipSource =
    compatibleSourceEntities.length > 0 || compatibleSourceTypes.length > 0;
  const canChooseRelationshipTarget =
    compatibleTargetEntities.length > 0 || compatibleTargetTypes.length > 0;

  const load = useCallback(
    async (append = false): Promise<void> => {
      const requestId = ++requestRef.current;
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const result = await window.campaignManager.inbox.list({
          campaignId: campaign.id,
          limit: 50,
          ...(append && cursor !== null ? { cursor } : {}),
          filters: { statuses: statuses[filter] },
        });
        if (requestId !== requestRef.current) return;
        if (result.ok) {
          setItems((current) => (append ? [...current, ...result.data.items] : result.data.items));
          setCursor(result.data.nextCursor);
        } else setError(presentUserFacingError(result.error, 'inbox.list'));
      } catch {
        if (requestId !== requestRef.current) return;
        setError(presentUserFacingError(undefined, 'inbox.list'));
      } finally {
        if (requestId === requestRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [campaign.id, cursor, filter],
  );

  useEffect(() => {
    setItems([]);
    setCursor(null);
    void load(false);
  }, [campaign.id, filter]);
  useEffect(() => {
    if (confirming !== null) cancelRef.current?.focus();
  }, [confirming]);
  useEffect(() => {
    if (conversion !== null) conversionNameRef.current?.focus();
  }, [conversion]);
  useEffect(() => {
    if (assertionConversion !== null) assertionSubjectRef.current?.focus();
  }, [assertionConversion]);
  useEffect(() => {
    if (noteConversion !== null) noteTitleRef.current?.focus();
  }, [noteConversion]);
  useEffect(() => {
    if (eventConversion !== null) eventTitleRef.current?.focus();
  }, [eventConversion]);
  useEffect(() => {
    void window.campaignManager.sessions
      .list({
        campaignId: campaign.id,
        limit: 100,
        filters: {},
        sort: 'sequenceNumber',
        order: 'desc',
      })
      .then((result) => {
        if (result.ok)
          setSessions(new Map(result.data.items.map((session) => [session.id, session])));
      });
  }, [campaign.id]);
  useEffect(() => {
    void window.campaignManager.entities
      .list({ campaignId: campaign.id, limit: 100, filters: { archived: false } })
      .then((result) => {
        if (result.ok) setEntities(result.data.items);
      });
    void window.campaignManager.relationshipTypes
      .list({ campaignId: campaign.id, limit: 100, filters: { isArchived: false } })
      .then((result) => {
        if (result.ok) setRelationshipTypes(result.data.items);
      });
  }, [campaign.id]);
  useEffect(() => {
    void window.campaignManager.entityTypes
      .list({ campaignId: campaign.id, limit: 100, filters: { isArchived: false } })
      .then((result) => {
        if (result.ok) setEntityTypes(result.data.items);
      });
  }, [campaign.id]);
  useEffect(() => {
    const root = document.querySelector('#root');
    if (
      (confirming === null &&
        conversion === null &&
        assertionConversion === null &&
        noteConversion === null &&
        eventConversion === null &&
        relationshipConversion === null) ||
      root === null
    )
      return;
    root.setAttribute('inert', '');
    return () => root.removeAttribute('inert');
  }, [
    assertionConversion,
    confirming,
    conversion,
    eventConversion,
    noteConversion,
    relationshipConversion,
  ]);
  useEffect(() => {
    if (relationshipConversion !== null) relationshipTypeRef.current?.focus();
  }, [relationshipConversion]);
  useEffect(() => {
    if (relationshipConversion === null) return;
    if (!compatibleSourceEntities.some((entity) => entity.id === relationshipSourceEntityId))
      setRelationshipSourceEntityId(compatibleSourceEntities[0]?.id ?? '');
    if (!compatibleTargetEntities.some((entity) => entity.id === relationshipTargetEntityId))
      setRelationshipTargetEntityId(compatibleTargetEntities[0]?.id ?? '');
    if (!compatibleSourceTypes.some((type) => type.id === relationshipSourceTypeId))
      setRelationshipSourceTypeId(compatibleSourceTypes[0]?.id ?? '');
    if (!compatibleTargetTypes.some((type) => type.id === relationshipTargetTypeId))
      setRelationshipTargetTypeId(compatibleTargetTypes[0]?.id ?? '');
  }, [
    compatibleSourceEntities,
    compatibleSourceTypes,
    compatibleTargetEntities,
    compatibleTargetTypes,
    relationshipConversion,
    relationshipSourceEntityId,
    relationshipSourceTypeId,
    relationshipTargetEntityId,
    relationshipTargetTypeId,
  ]);

  async function execute(item: InboxItem, action: Action): Promise<void> {
    if (busy !== null) return;
    setBusy(item.id);
    setError(null);
    try {
      const input = { campaignId: campaign.id, id: item.id, revision: item.revision };
      const result =
        action === 'beginReview'
          ? await window.campaignManager.inbox.beginReview(input)
          : action === 'dismiss'
            ? await window.campaignManager.inbox.dismiss(input)
            : action === 'archive'
              ? await window.campaignManager.inbox.archive(input)
              : await window.campaignManager.inbox.restore(input);
      if (result.ok) {
        setConfirming(null);
        requestAnimationFrame(() => triggerRef.current?.focus());
        if (action === 'beginReview' && item.status === 'dismissed') setFilter('pending');
        setAnnouncement(
          action === 'beginReview'
            ? 'Captura marcada como em revisão.'
            : action === 'dismiss'
              ? 'Captura descartada e preservada.'
              : action === 'archive'
                ? 'Captura arquivada.'
                : 'Captura restaurada para novas pendências.',
        );
        await load(false);
      } else setError(presentUserFacingError(result.error, 'inbox.convert'));
    } catch {
      setError(presentUserFacingError(undefined, 'inbox.convert'));
    } finally {
      setBusy(null);
    }
  }

  async function convert(): Promise<void> {
    if (conversion === null || busy !== null) return;
    setBusy(conversion.id);
    setError(null);
    setConversionError(null);
    try {
      const result = await window.campaignManager.inbox.convertToEntity({
        campaignId: campaign.id,
        id: conversion.id,
        revision: conversion.revision,
        destination: {
          entityTypeId: conversionTypeId,
          name: conversionName,
          summary: conversionSummary.trim() === '' ? null : conversionSummary,
          canonState: conversionCanonState,
          knowledgeState: conversionKnowledgeState,
          visibility: conversionVisibility,
        },
      });
      if (result.ok) {
        setConversion(null);
        setAnnouncement(`Entidade “${result.data.entity.name}” criada a partir da captura.`);
        await load(false);
        requestAnimationFrame(() => announcementRef.current?.focus());
      } else setConversionError(presentUserFacingError(result.error, 'inbox.convert'));
    } catch {
      setConversionError(presentUserFacingError(undefined, 'inbox.convert'));
    } finally {
      setBusy(null);
    }
  }

  async function convertRelationship(): Promise<void> {
    if (relationshipConversion === null || busy !== null) return;
    setBusy(relationshipConversion.id);
    setRelationshipError(null);
    const endpoint = (
      mode: 'existing' | 'new',
      entityId: string,
      entityTypeId: string,
      name: string,
    ) => (mode === 'existing' ? { mode, entityId } : { mode, entityTypeId, name, summary: null });
    try {
      const result = await window.campaignManager.inbox.convertToRelationship({
        campaignId: campaign.id,
        id: relationshipConversion.id,
        revision: relationshipConversion.revision,
        destination: {
          relationshipTypeId,
          source: endpoint(
            relationshipSourceMode,
            relationshipSourceEntityId,
            relationshipSourceTypeId,
            relationshipSourceName,
          ),
          target: endpoint(
            relationshipTargetMode,
            relationshipTargetEntityId,
            relationshipTargetTypeId,
            relationshipTargetName,
          ),
          description: relationshipDescription.trim() === '' ? null : relationshipDescription,
          strength: null,
          canonState: relationshipCanonState,
          knowledgeState: relationshipKnowledgeState,
          visibility: relationshipVisibility,
          validFromEventId: null,
          validToEventId: null,
        },
      });
      if (result.ok) {
        setRelationshipConversion(null);
        setAnnouncement(
          result.data.warnings.length === 0
            ? 'Relação criada a partir da captura.'
            : `Relação criada a partir da captura. Atenção: ${result.data.warnings[0]?.message ?? 'há uma possível duplicidade.'}`,
        );
        await load(false);
        requestAnimationFrame(() => announcementRef.current?.focus());
      } else setRelationshipError(presentUserFacingError(result.error, 'inbox.convert'));
    } catch {
      setRelationshipError(presentUserFacingError(undefined, 'inbox.convert'));
    } finally {
      setBusy(null);
    }
  }

  async function convertAssertion(): Promise<void> {
    if (assertionConversion === null || busy !== null) return;
    const statement = assertionStatement.trim();
    const predicate = assertionPredicate.trim();
    let value: AssertionConversionValue = null;
    if (assertionValue.trim() !== '') {
      try {
        value = JSON.parse(assertionValue) as NonNullable<AssertionConversionValue>;
      } catch {
        setAssertionError(presentUserFacingError({ code: 'VALIDATION_ERROR' }, 'inbox.convert'));
        return;
      }
    }
    if (
      statement === '' &&
      (predicate === '' || (assertionObjectEntityId === '' && value === null))
    ) {
      setAssertionError(presentUserFacingError({ code: 'VALIDATION_ERROR' }, 'inbox.convert'));
      return;
    }
    setBusy(assertionConversion.id);
    setAssertionError(null);
    try {
      const result = await window.campaignManager.inbox.convertToAssertion({
        campaignId: campaign.id,
        id: assertionConversion.id,
        revision: assertionConversion.revision,
        destination: {
          subjectEntityId: assertionSubjectEntityId,
          objectEntityId: assertionObjectEntityId === '' ? null : assertionObjectEntityId,
          statement: statement === '' ? null : statement,
          predicate: predicate === '' ? null : predicate,
          value,
          canonState: assertionCanonState,
          knowledgeState: assertionKnowledgeState,
          visibility: assertionVisibility,
        },
      });
      if (result.ok) {
        setAssertionConversion(null);
        setAnnouncement(
          'Afirmação criada a partir da captura; o texto original foi preservado como fonte.',
        );
        await load(false);
        requestAnimationFrame(() => announcementRef.current?.focus());
      } else setAssertionError(presentUserFacingError(result.error, 'inbox.convert'));
    } catch {
      setAssertionError(presentUserFacingError(undefined, 'inbox.convert'));
    } finally {
      setBusy(null);
    }
  }

  async function convertNote(): Promise<void> {
    if (noteConversion === null || busy !== null) return;
    setBusy(noteConversion.id);
    setNoteError(null);
    try {
      const result = await window.campaignManager.inbox.convertToNote({
        campaignId: campaign.id,
        id: noteConversion.id,
        revision: noteConversion.revision,
        destination: {
          title: noteTitle,
          bodyMarkdown: noteBody,
          noteType,
          links:
            noteLinkEntityId === '' ? [] : [{ entityId: noteLinkEntityId, role: noteLinkRole }],
          canonState: noteCanonState,
          knowledgeState: noteKnowledgeState,
          visibility: noteVisibility,
        },
      });
      if (result.ok) {
        setNoteConversion(null);
        setAnnouncement(
          'Nota criada a partir da captura; o texto original foi preservado como fonte.',
        );
        await load(false);
        requestAnimationFrame(() => announcementRef.current?.focus());
      } else setNoteError(presentUserFacingError(result.error, 'inbox.convert'));
    } catch {
      setNoteError(presentUserFacingError(undefined, 'inbox.convert'));
    } finally {
      setBusy(null);
    }
  }

  async function convertEvent(): Promise<void> {
    if (eventConversion === null || busy !== null) return;
    setBusy(eventConversion.id);
    setEventError(null);
    try {
      const result = await window.campaignManager.inbox.convertToEvent({
        campaignId: campaign.id,
        id: eventConversion.id,
        revision: eventConversion.revision,
        destination: {
          title: eventTitle,
          descriptionMarkdown: eventDescription.trim() === '' ? null : eventDescription,
          sessionId: eventSessionId === '' ? null : eventSessionId,
          eventOrder,
          occurredAtLabel: eventOccurredAtLabel.trim() === '' ? null : eventOccurredAtLabel,
          links:
            eventLinkEntityId === ''
              ? []
              : [
                  {
                    entityId: eventLinkEntityId,
                    role: eventLinkRole,
                  },
                ],
          canonState: eventCanonState,
          knowledgeState: eventKnowledgeState,
          visibility: eventVisibility,
        },
      });
      if (result.ok) {
        setEventConversion(null);
        setAnnouncement(
          'Evento criado a partir da captura; o texto original foi preservado como fonte.',
        );
        await load(false);
        requestAnimationFrame(() => announcementRef.current?.focus());
      } else setEventError(presentUserFacingError(result.error, 'inbox.convert'));
    } catch {
      setEventError(presentUserFacingError(undefined, 'inbox.convert'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="inbox-title">
      <Button disabled={busy !== null} onClick={onBack} size="small" variant="ghost">
        ← Voltar para detalhes da campanha
      </Button>
      <header className="mt-6 flex flex-wrap items-end justify-between gap-5 border-b semantic-border pb-6">
        <div>
          <p className="text-xs font-bold tracking-[0.18em] semantic-accent-text uppercase">
            {campaign.name}
          </p>
          <h1 className="mt-2 text-4xl font-semibold" id="inbox-title">
            Caixa de Entrada
          </h1>
          <p className="mt-2 semantic-text-secondary">
            Revise capturas sem alterar seu texto original.
          </p>
        </div>
      </header>
      <ToolbarActions aria-label="Filtrar capturas" className="mt-5 gap-2">
        {(
          [
            ['pending', 'Pendentes'],
            ['dismissed', 'Descartadas'],
            ['archived', 'Arquivadas'],
          ] as const
        ).map(([value, label]) => (
          <Button
            aria-pressed={filter === value}
            className={
              filter === value ? 'semantic-selected-surface semantic-selected-text' : undefined
            }
            disabled={busy !== null || loading}
            key={value}
            onClick={() => {
              setAnnouncement(null);
              setFilter(value);
            }}
          >
            {label}
          </Button>
        ))}
      </ToolbarActions>
      {announcement === null ? null : (
        <p
          aria-live="polite"
          className="mt-5 rounded-xl border semantic-success-border semantic-success-surface p-4 semantic-success-text"
          role="status"
          ref={announcementRef}
          tabIndex={-1}
        >
          {announcement}
        </p>
      )}
      {error === null ? null : (
        <div className="mt-5">
          <UserFacingErrorNotice
            error={error}
            operation="inbox.list"
            onRetry={() => void load(false)}
          />
        </div>
      )}
      {loading ? (
        <div aria-busy="true" aria-label="Carregando capturas" className="mt-8 animate-pulse">
          <div className="h-28 rounded-2xl semantic-skeleton" />
        </div>
      ) : items.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed semantic-border semantic-surface p-10 text-center">
          <h2 className="text-xl font-semibold">{emptyTitle(filter)}</h2>
          <p className="mt-2 semantic-text-secondary">{emptyDescription(filter)}</p>
        </div>
      ) : (
        <ul className="mt-8 grid gap-4" data-testid="inbox-list">
          {items.map((item) => (
            <li
              className="rounded-2xl border semantic-border semantic-surface p-5 shadow-sm"
              key={item.id}
            >
              <article
                aria-busy={busy === item.id}
                aria-label={`Captura ${statusLabel(item.status)}`}
              >
                <p className="break-words whitespace-pre-wrap leading-7 semantic-text-primary">
                  {item.rawText}
                </p>
                <p className="mt-3 text-sm semantic-text-secondary">
                  {statusLabel(item.status)} · {new Date(item.capturedAt).toLocaleString('pt-BR')}
                </p>
                {item.sessionId === null ? null : (
                  <p className="mt-1 text-sm semantic-text-secondary">
                    Sessão: {sessionLabel(sessions.get(item.sessionId))}
                  </p>
                )}
                <ToolbarActions aria-label="Ações da captura" className="mt-4 gap-2">
                  {item.status === 'new' || item.status === 'dismissed' ? (
                    <Button
                      disabled={busy !== null}
                      onClick={(event) => {
                        triggerRef.current = event.currentTarget;
                        void execute(item, 'beginReview');
                      }}
                      variant="primary"
                    >
                      Marcar como em revisão
                    </Button>
                  ) : null}
                  {item.status === 'new' || item.status === 'reviewing' ? (
                    <Button
                      disabled={busy !== null}
                      onClick={(event) => {
                        triggerRef.current = event.currentTarget;
                        setConfirming({ item, action: 'dismiss' });
                      }}
                    >
                      Descartar
                    </Button>
                  ) : null}
                  {item.status === 'reviewing' ? (
                    <>
                      <Button
                        aria-describedby={
                          entityTypes.length === 0
                            ? `inbox-conversion-reason-${item.id}`
                            : undefined
                        }
                        disabled={busy !== null || entityTypes.length === 0}
                        onClick={(event) => {
                          triggerRef.current = event.currentTarget;
                          setConversion(item);
                          setConversionName(item.rawText.slice(0, 200));
                          setConversionSummary('');
                          setConversionTypeId(entityTypes[0]?.id ?? '');
                          setConversionCanonState('accepted');
                          setConversionKnowledgeState('fact');
                          setConversionVisibility('gm');
                        }}
                        variant="primary"
                      >
                        Converter em entidade
                      </Button>
                      {entityTypes.length === 0 ? (
                        <span
                          className="text-sm semantic-accent-text"
                          id={`inbox-conversion-reason-${item.id}`}
                        >
                          Crie um tipo de entidade ativo para converter esta captura.
                          <Button
                            className="ml-2"
                            disabled={busy !== null}
                            onClick={onManageEntityTypes}
                            size="inline"
                            variant="link"
                          >
                            Gerenciar tipos de entidade
                          </Button>
                        </span>
                      ) : null}
                    </>
                  ) : null}
                  {item.status === 'reviewing' ? (
                    <>
                      <Button
                        disabled={busy !== null}
                        onClick={(event) => {
                          triggerRef.current = event.currentTarget;
                          setNoteConversion(item);
                          setNoteTitle(item.rawText.slice(0, 200));
                          setNoteBody(item.rawText);
                          setNoteType('general');
                          setNoteLinkEntityId('');
                          setNoteLinkRole('related');
                          setNoteCanonState('accepted');
                          setNoteKnowledgeState('fact');
                          setNoteVisibility('gm');
                          setNoteError(null);
                        }}
                      >
                        Converter em nota
                      </Button>
                      <Button
                        disabled={busy !== null}
                        onClick={(event) => {
                          triggerRef.current = event.currentTarget;
                          setEventConversion(item);
                          setEventTitle(item.rawText.slice(0, 200));
                          setEventDescription('');
                          setEventSessionId(item.sessionId ?? '');
                          setEventOrder(0);
                          setEventOccurredAtLabel('');
                          setEventLinkEntityId('');
                          setEventLinkRole('related');
                          setEventCanonState('accepted');
                          setEventKnowledgeState('fact');
                          setEventVisibility('gm');
                          setEventError(null);
                        }}
                      >
                        Converter em evento
                      </Button>
                    </>
                  ) : null}
                  {item.status === 'reviewing' ? (
                    <>
                      <Button
                        aria-describedby={
                          entities.length === 0 ? `inbox-assertion-reason-${item.id}` : undefined
                        }
                        disabled={busy !== null || entities.length === 0}
                        onClick={(event) => {
                          triggerRef.current = event.currentTarget;
                          setAssertionConversion(item);
                          setAssertionSubjectEntityId('');
                          setAssertionObjectEntityId('');
                          setAssertionStatement(item.rawText);
                          setAssertionPredicate('');
                          setAssertionValue('');
                          setAssertionCanonState('accepted');
                          setAssertionKnowledgeState('fact');
                          setAssertionVisibility('gm');
                          setAssertionError(null);
                        }}
                      >
                        Converter em afirmação
                      </Button>
                      {entities.length === 0 ? (
                        <span
                          className="text-sm semantic-accent-text"
                          id={`inbox-assertion-reason-${item.id}`}
                        >
                          Crie uma entidade ativa na campanha para definir o sujeito da afirmação.
                          <Button
                            className="ml-2"
                            disabled={busy !== null}
                            onClick={onManageEntities}
                            size="inline"
                            variant="link"
                          >
                            Gerenciar entidades
                          </Button>
                        </span>
                      ) : null}
                    </>
                  ) : null}
                  {item.status === 'reviewing' ? (
                    <>
                      <Button
                        disabled={busy !== null || relationshipTypes.length === 0}
                        aria-describedby={
                          relationshipTypes.length === 0
                            ? `inbox-relationship-reason-${item.id}`
                            : undefined
                        }
                        onClick={(event) => {
                          const initialType = relationshipTypes[0];
                          const initialSourceEntities = filterAllowedEntities(
                            entities,
                            initialType?.allowedSourceTypeIds,
                          );
                          const initialTargetEntities = filterAllowedEntities(
                            entities,
                            initialType?.allowedTargetTypeIds,
                          );
                          const initialSourceTypes = filterAllowedEntityTypes(
                            entityTypes,
                            initialType?.allowedSourceTypeIds,
                          );
                          const initialTargetTypes = filterAllowedEntityTypes(
                            entityTypes,
                            initialType?.allowedTargetTypeIds,
                          );
                          triggerRef.current = event.currentTarget;
                          setRelationshipConversion(item);
                          setRelationshipTypeId(initialType?.id ?? '');
                          setRelationshipSourceMode(
                            initialSourceEntities.length > 0 ? 'existing' : 'new',
                          );
                          setRelationshipTargetMode(
                            initialTargetEntities.length > 0 ? 'existing' : 'new',
                          );
                          setRelationshipSourceEntityId(initialSourceEntities[0]?.id ?? '');
                          setRelationshipTargetEntityId(initialTargetEntities[0]?.id ?? '');
                          setRelationshipSourceTypeId(initialSourceTypes[0]?.id ?? '');
                          setRelationshipTargetTypeId(initialTargetTypes[0]?.id ?? '');
                          setRelationshipSourceName('');
                          setRelationshipTargetName('');
                          setRelationshipDescription('');
                          setRelationshipCanonState('accepted');
                          setRelationshipKnowledgeState('fact');
                          setRelationshipVisibility('gm');
                          setRelationshipError(null);
                        }}
                      >
                        Converter em relação
                      </Button>
                      {relationshipTypes.length === 0 ? (
                        <span
                          className="text-sm semantic-accent-text"
                          id={`inbox-relationship-reason-${item.id}`}
                        >
                          Crie um tipo de relação ativo para converter esta captura.
                          <Button
                            className="ml-2"
                            disabled={busy !== null}
                            onClick={onManageRelationshipTypes}
                            size="inline"
                            variant="link"
                          >
                            Gerenciar tipos de relação
                          </Button>
                        </span>
                      ) : null}
                    </>
                  ) : null}
                  {item.status !== 'archived' && item.status !== 'converted' ? (
                    <Button
                      disabled={busy !== null}
                      onClick={(event) => {
                        triggerRef.current = event.currentTarget;
                        setConfirming({ item, action: 'archive' });
                      }}
                    >
                      Arquivar
                    </Button>
                  ) : null}
                  {item.status === 'archived' ? (
                    <Button
                      disabled={busy !== null}
                      onClick={(event) => {
                        triggerRef.current = event.currentTarget;
                        void execute(item, 'restore');
                      }}
                      variant="primary"
                    >
                      Restaurar
                    </Button>
                  ) : null}
                </ToolbarActions>
              </article>
            </li>
          ))}
        </ul>
      )}
      {cursor === null || loading ? null : (
        <Button
          busy={loadingMore}
          className="mt-5"
          disabled={busy !== null}
          onClick={() => void load(true)}
        >
          {loadingMore ? 'Carregando mais…' : 'Carregar mais'}
        </Button>
      )}
      {confirming === null
        ? null
        : createPortal(
            <div
              aria-describedby="inbox-confirmation-message"
              aria-labelledby="inbox-confirmation-title"
              aria-modal="true"
              className="fixed inset-0 grid place-items-center semantic-overlay p-4"
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  setConfirming(null);
                  requestAnimationFrame(() => triggerRef.current?.focus());
                }
                if (event.key === 'Tab') {
                  const focusable =
                    dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])');
                  if (focusable === undefined || focusable.length === 0) return;
                  const first = focusable[0];
                  const last = focusable[focusable.length - 1];
                  if (first === undefined || last === undefined) return;
                  if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last.focus();
                  } else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first.focus();
                  }
                }
              }}
              role="dialog"
            >
              <div
                className="w-full max-w-md rounded-2xl semantic-surface p-6 shadow-xl"
                ref={dialogRef}
                tabIndex={-1}
              >
                <h2 className="text-xl font-semibold" id="inbox-confirmation-title">
                  Confirmar {confirming.action === 'dismiss' ? 'descarte' : 'arquivamento'}
                </h2>
                <p className="mt-3 semantic-text-secondary" id="inbox-confirmation-message">
                  {confirming.action === 'dismiss'
                    ? 'A captura será marcada como descartada, mas seu texto continuará preservado.'
                    : 'A captura será removida das pendências, mas continuará preservada.'}
                </p>
                <DialogActions className="mt-6">
                  <Button
                    disabled={busy !== null}
                    onClick={() => {
                      setConfirming(null);
                      requestAnimationFrame(() => triggerRef.current?.focus());
                    }}
                    ref={cancelRef}
                  >
                    Cancelar
                  </Button>
                  <Button
                    busy={busy !== null}
                    onClick={() => void execute(confirming.item, confirming.action)}
                    variant="primary"
                  >
                    {confirming.action === 'dismiss'
                      ? 'Confirmar descarte'
                      : 'Confirmar arquivamento'}
                  </Button>
                </DialogActions>
              </div>
            </div>,
            document.body,
          )}
      {conversion === null
        ? null
        : createPortal(
            <div
              aria-labelledby="inbox-conversion-title"
              aria-modal="true"
              className="fixed inset-0 z-40 grid place-items-center overflow-y-auto semantic-overlay p-4"
              onKeyDown={(event) => {
                if (event.key === 'Escape' && busy === null) {
                  setConversion(null);
                  requestAnimationFrame(() => triggerRef.current?.focus());
                }
                if (event.key === 'Tab') trapFocus(event, conversionDialogRef.current);
              }}
              role="dialog"
            >
              <form
                aria-busy={busy === conversion.id}
                className="max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-y-auto rounded-2xl semantic-surface p-6 shadow-xl"
                onSubmit={(event) => {
                  event.preventDefault();
                  void convert();
                }}
                ref={conversionDialogRef}
              >
                <h2 className="text-xl font-semibold" id="inbox-conversion-title">
                  Converter em entidade
                </h2>
                <p className="mt-2 text-sm semantic-text-secondary">
                  O texto original continuará vinculado como fonte desta entidade.
                </p>
                <div
                  aria-labelledby="inbox-source-text-label"
                  className="mt-4 max-h-32 overflow-y-auto rounded-xl semantic-surface-muted p-3"
                >
                  <p className="text-xs font-semibold" id="inbox-source-text-label">
                    Texto original da captura
                  </p>
                  <p className="mt-1 break-words whitespace-pre-wrap text-sm">
                    {conversion.rawText}
                  </p>
                </div>
                {entityTypes.length === 0 ? (
                  <div className="mt-4 rounded-xl semantic-warning-surface p-3 text-sm semantic-accent-text">
                    <p>Crie um tipo de entidade ativo antes de converter.</p>
                    <Button
                      className="mt-2"
                      onClick={() => {
                        setConversion(null);
                        onManageEntityTypes();
                      }}
                      size="small"
                      variant="link"
                    >
                      Gerenciar tipos de entidade
                    </Button>
                  </div>
                ) : null}
                {conversionError === null ? null : (
                  <div className="mt-4">
                    <UserFacingErrorNotice
                      compact
                      error={conversionError}
                      operation="inbox.convert"
                    />
                  </div>
                )}
                <label className="mt-5 block text-sm font-semibold" htmlFor="inbox-entity-type">
                  Tipo de entidade
                </label>
                <select
                  className="mt-2 w-full rounded-xl border semantic-border px-3 py-2"
                  disabled={busy !== null || entityTypes.length === 0}
                  id="inbox-entity-type"
                  onChange={(event) => setConversionTypeId(event.target.value)}
                  required
                  value={conversionTypeId}
                >
                  {entityTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.singularName}
                    </option>
                  ))}
                </select>
                <label className="mt-4 block text-sm font-semibold" htmlFor="inbox-entity-name">
                  Nome
                </label>
                <input
                  className="mt-2 w-full rounded-xl border semantic-border px-3 py-2"
                  disabled={busy !== null}
                  id="inbox-entity-name"
                  maxLength={200}
                  onChange={(event) => setConversionName(event.target.value)}
                  ref={conversionNameRef}
                  required
                  value={conversionName}
                />
                <label className="mt-4 block text-sm font-semibold" htmlFor="inbox-entity-summary">
                  Resumo
                </label>
                <textarea
                  className="mt-2 min-h-24 w-full rounded-xl border semantic-border px-3 py-2"
                  disabled={busy !== null}
                  id="inbox-entity-summary"
                  maxLength={10000}
                  onChange={(event) => setConversionSummary(event.target.value)}
                  value={conversionSummary}
                />
                <fieldset
                  className="mt-5 grid gap-4 rounded-xl border semantic-border p-4"
                  disabled={busy !== null}
                >
                  <legend className="px-1 text-sm font-semibold">Metadados narrativos</legend>
                  <MetadataSelect
                    id="inbox-entity-canon"
                    label="Estado canônico"
                    onChange={(value) =>
                      setConversionCanonState(value as typeof conversionCanonState)
                    }
                    value={conversionCanonState}
                    options={[
                      ['accepted', 'Aceito'],
                      ['draft', 'Rascunho'],
                      ['rejected', 'Rejeitado'],
                      ['archived', 'Arquivado'],
                    ]}
                  />
                  <MetadataSelect
                    id="inbox-entity-knowledge"
                    label="Natureza do conhecimento"
                    onChange={(value) =>
                      setConversionKnowledgeState(value as typeof conversionKnowledgeState)
                    }
                    value={conversionKnowledgeState}
                    options={[
                      ['fact', 'Fato'],
                      ['rumor', 'Rumor'],
                      ['suspicion', 'Suspeita'],
                      ['secret', 'Segredo'],
                      ['possibility', 'Possibilidade'],
                      ['disproved', 'Refutado'],
                    ]}
                  />
                  <MetadataSelect
                    id="inbox-entity-visibility"
                    label="Visibilidade"
                    onChange={(value) =>
                      setConversionVisibility(value as typeof conversionVisibility)
                    }
                    value={conversionVisibility}
                    options={[
                      ['gm', 'Somente mestre'],
                      ['players', 'Jogadores'],
                      ['public', 'Pública'],
                    ]}
                  />
                </fieldset>
                <DialogActions className="mt-6">
                  <Button
                    disabled={busy !== null}
                    onClick={() => {
                      setConversion(null);
                      requestAnimationFrame(() => triggerRef.current?.focus());
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    busy={busy === conversion.id}
                    disabled={busy !== null || entityTypes.length === 0}
                    type="submit"
                    variant="primary"
                  >
                    {busy === conversion.id ? 'Convertendo…' : 'Confirmar conversão'}
                  </Button>
                </DialogActions>
              </form>
            </div>,
            document.body,
          )}
      {assertionConversion === null
        ? null
        : createPortal(
            <div
              aria-describedby="inbox-assertion-source-text inbox-assertion-help"
              aria-labelledby="inbox-assertion-conversion-title"
              aria-modal="true"
              className="fixed inset-0 z-40 grid place-items-center overflow-y-auto semantic-overlay p-4"
              onKeyDown={(event) => {
                if (event.key === 'Escape' && busy === null) {
                  setAssertionConversion(null);
                  requestAnimationFrame(() => triggerRef.current?.focus());
                }
                if (event.key === 'Tab') trapFocus(event, assertionDialogRef.current);
              }}
              role="dialog"
            >
              <form
                aria-busy={busy === assertionConversion.id}
                className="w-full max-w-2xl rounded-2xl semantic-surface p-6 shadow-xl"
                onSubmit={(event) => {
                  event.preventDefault();
                  void convertAssertion();
                }}
                ref={assertionDialogRef}
              >
                <h2 className="text-xl font-semibold" id="inbox-assertion-conversion-title">
                  Converter em afirmação
                </h2>
                <p className="mt-2 text-sm semantic-text-secondary" id="inbox-assertion-help">
                  A captura original será preservada como fonte rastreável da afirmação.
                </p>
                <div
                  aria-labelledby="inbox-assertion-source-label"
                  className="mt-4 max-h-28 overflow-y-auto rounded-xl semantic-surface-muted p-3"
                  id="inbox-assertion-source-text"
                >
                  <p className="text-xs font-semibold" id="inbox-assertion-source-label">
                    Texto original da captura
                  </p>
                  <p className="mt-1 break-words whitespace-pre-wrap text-sm">
                    {assertionConversion.rawText}
                  </p>
                </div>
                {assertionError === null ? null : (
                  <div className="mt-4">
                    <UserFacingErrorNotice
                      compact
                      error={assertionError}
                      operation="inbox.convert"
                    />
                  </div>
                )}
                <label
                  className="mt-5 block text-sm font-semibold"
                  htmlFor="inbox-assertion-subject"
                >
                  Sujeito
                </label>
                <select
                  className="mt-1 w-full rounded-xl border semantic-border px-3 py-2"
                  disabled={busy !== null || entities.length === 0}
                  id="inbox-assertion-subject"
                  onChange={(event) => setAssertionSubjectEntityId(event.target.value)}
                  ref={assertionSubjectRef}
                  required
                  value={assertionSubjectEntityId}
                >
                  <option disabled value="">
                    Sujeito obrigatório
                  </option>
                  {entities.map((entity) => (
                    <option key={entity.id} value={entity.id}>
                      {entity.name}
                    </option>
                  ))}
                </select>
                <label
                  className="mt-4 block text-sm font-semibold"
                  htmlFor="inbox-assertion-object"
                >
                  Objeto (opcional)
                </label>
                <select
                  className="mt-1 w-full rounded-xl border semantic-border px-3 py-2"
                  disabled={busy !== null}
                  id="inbox-assertion-object"
                  onChange={(event) => setAssertionObjectEntityId(event.target.value)}
                  value={assertionObjectEntityId}
                >
                  <option value="">Sem entidade-objeto</option>
                  {entities.map((entity) => (
                    <option key={entity.id} value={entity.id}>
                      {entity.name}
                    </option>
                  ))}
                </select>
                <label
                  className="mt-4 block text-sm font-semibold"
                  htmlFor="inbox-assertion-statement"
                >
                  Declaração
                </label>
                <textarea
                  className="mt-1 min-h-24 w-full rounded-xl border semantic-border px-3 py-2"
                  disabled={busy !== null}
                  id="inbox-assertion-statement"
                  maxLength={10000}
                  onChange={(event) => setAssertionStatement(event.target.value)}
                  value={assertionStatement}
                />
                <p className="mt-1 text-sm semantic-text-secondary">
                  Informe uma declaração ou um predicado acompanhado de objeto ou valor.
                </p>
                <label
                  className="mt-4 block text-sm font-semibold"
                  htmlFor="inbox-assertion-predicate"
                >
                  Predicado
                </label>
                <input
                  className="mt-1 w-full rounded-xl border semantic-border px-3 py-2"
                  disabled={busy !== null}
                  id="inbox-assertion-predicate"
                  maxLength={200}
                  onChange={(event) => setAssertionPredicate(event.target.value)}
                  value={assertionPredicate}
                />
                <label className="mt-4 block text-sm font-semibold" htmlFor="inbox-assertion-value">
                  Valor JSON (opcional)
                </label>
                <textarea
                  className="mt-1 min-h-20 w-full rounded-xl border semantic-border px-3 py-2 font-mono text-sm"
                  disabled={busy !== null}
                  id="inbox-assertion-value"
                  onChange={(event) => setAssertionValue(event.target.value)}
                  value={assertionValue}
                />
                <fieldset
                  className="mt-5 grid gap-4 rounded-xl border semantic-border p-4"
                  disabled={busy !== null}
                >
                  <legend className="px-1 text-sm font-semibold">Metadados narrativos</legend>
                  <MetadataSelect
                    id="inbox-assertion-canon"
                    label="Estado canônico"
                    onChange={(value) =>
                      setAssertionCanonState(value as typeof assertionCanonState)
                    }
                    options={[
                      ['accepted', 'Aceito'],
                      ['draft', 'Rascunho'],
                      ['rejected', 'Rejeitado'],
                      ['archived', 'Arquivado'],
                    ]}
                    value={assertionCanonState}
                  />
                  <MetadataSelect
                    id="inbox-assertion-knowledge"
                    label="Natureza do conhecimento"
                    onChange={(value) =>
                      setAssertionKnowledgeState(value as typeof assertionKnowledgeState)
                    }
                    options={[
                      ['fact', 'Fato'],
                      ['rumor', 'Rumor'],
                      ['suspicion', 'Suspeita'],
                      ['secret', 'Segredo'],
                      ['possibility', 'Possibilidade'],
                      ['disproved', 'Refutado'],
                    ]}
                    value={assertionKnowledgeState}
                  />
                  <MetadataSelect
                    id="inbox-assertion-visibility"
                    label="Visibilidade"
                    onChange={(value) =>
                      setAssertionVisibility(value as typeof assertionVisibility)
                    }
                    options={[
                      ['gm', 'Somente mestre'],
                      ['players', 'Jogadores'],
                      ['public', 'Pública'],
                    ]}
                    value={assertionVisibility}
                  />
                </fieldset>
                <DialogActions className="mt-6">
                  <Button
                    disabled={busy !== null}
                    onClick={() => {
                      setAssertionConversion(null);
                      requestAnimationFrame(() => triggerRef.current?.focus());
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    busy={busy === assertionConversion.id}
                    disabled={
                      busy !== null || entities.length === 0 || assertionSubjectEntityId === ''
                    }
                    type="submit"
                    variant="primary"
                  >
                    {busy === assertionConversion.id ? 'Convertendo…' : 'Confirmar conversão'}
                  </Button>
                </DialogActions>
              </form>
            </div>,
            document.body,
          )}
      {noteConversion === null
        ? null
        : createPortal(
            <div
              aria-labelledby="inbox-note-conversion-title"
              aria-modal="true"
              className="fixed inset-0 z-40 grid place-items-center overflow-y-auto semantic-overlay p-4"
              onKeyDown={(event) => {
                if (event.key === 'Escape' && busy === null) {
                  setNoteConversion(null);
                  requestAnimationFrame(() => triggerRef.current?.focus());
                }
                if (event.key === 'Tab') trapFocus(event, noteDialogRef.current);
              }}
              role="dialog"
            >
              <form
                aria-busy={busy === noteConversion.id}
                className="max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-y-auto rounded-2xl semantic-surface p-6 shadow-xl"
                onSubmit={(event) => {
                  event.preventDefault();
                  void convertNote();
                }}
                ref={noteDialogRef}
              >
                <h2 className="text-xl font-semibold" id="inbox-note-conversion-title">
                  Converter em nota
                </h2>
                <p className="mt-2 text-sm semantic-text-secondary">
                  O texto original será preservado como fonte rastreável.
                </p>
                <p className="mt-4 max-h-28 overflow-y-auto break-words whitespace-pre-wrap rounded-xl semantic-surface-muted p-3 text-sm">
                  {noteConversion.rawText}
                </p>
                {noteError === null ? null : (
                  <div className="mt-4">
                    <UserFacingErrorNotice compact error={noteError} operation="inbox.convert" />
                  </div>
                )}
                <label className="mt-4 block text-sm font-semibold" htmlFor="inbox-note-title">
                  Título
                </label>
                <input
                  className="mt-1 w-full rounded-xl border semantic-border px-3 py-2"
                  disabled={busy !== null}
                  id="inbox-note-title"
                  maxLength={200}
                  onChange={(event) => setNoteTitle(event.target.value)}
                  ref={noteTitleRef}
                  required
                  value={noteTitle}
                />
                <label className="mt-4 block text-sm font-semibold" htmlFor="inbox-note-body">
                  Corpo da nota
                </label>
                <textarea
                  className="mt-1 min-h-32 w-full rounded-xl border semantic-border px-3 py-2"
                  disabled={busy !== null}
                  id="inbox-note-body"
                  maxLength={100000}
                  onChange={(event) => setNoteBody(event.target.value)}
                  required
                  value={noteBody}
                />
                <label className="mt-4 block text-sm font-semibold" htmlFor="inbox-note-type">
                  Tipo de nota
                </label>
                <select
                  className="mt-1 w-full rounded-xl border semantic-border px-3 py-2"
                  disabled={busy !== null}
                  id="inbox-note-type"
                  onChange={(event) => setNoteType(event.target.value as typeof noteType)}
                  value={noteType}
                >
                  {['general', 'idea', 'scene', 'clue', 'secret', 'preparation', 'reference'].map(
                    (value) => (
                      <option key={value} value={value}>
                        {
                          {
                            general: 'Geral',
                            idea: 'Ideia',
                            scene: 'Cena',
                            clue: 'Pista',
                            secret: 'Segredo',
                            preparation: 'Preparação',
                            reference: 'Referência',
                          }[value]
                        }
                      </option>
                    ),
                  )}
                </select>
                <label className="mt-4 block text-sm font-semibold" htmlFor="inbox-note-link">
                  Vincular entidade (opcional)
                </label>
                <select
                  className="mt-1 w-full rounded-xl border semantic-border px-3 py-2"
                  disabled={busy !== null}
                  id="inbox-note-link"
                  onChange={(event) => setNoteLinkEntityId(event.target.value)}
                  value={noteLinkEntityId}
                >
                  <option value="">Sem vínculo</option>
                  {entities.map((entity) => (
                    <option key={entity.id} value={entity.id}>
                      {entity.name}
                    </option>
                  ))}
                </select>
                <label className="mt-4 block text-sm font-semibold" htmlFor="inbox-note-role">
                  Papel do vínculo
                </label>
                <input
                  className="mt-1 w-full rounded-xl border semantic-border px-3 py-2"
                  disabled={busy !== null || noteLinkEntityId === ''}
                  id="inbox-note-role"
                  maxLength={100}
                  onChange={(event) => setNoteLinkRole(event.target.value)}
                  value={noteLinkRole}
                />
                <fieldset
                  className="mt-5 grid gap-4 rounded-xl border semantic-border p-4"
                  disabled={busy !== null}
                >
                  <legend className="px-1 text-sm font-semibold">Metadados narrativos</legend>
                  <MetadataSelect
                    id="inbox-note-canon"
                    label="Estado canônico"
                    value={noteCanonState}
                    onChange={(value) => setNoteCanonState(value as typeof noteCanonState)}
                    options={[
                      ['accepted', 'Aceito'],
                      ['draft', 'Rascunho'],
                      ['rejected', 'Rejeitado'],
                      ['archived', 'Arquivado'],
                    ]}
                  />
                  <MetadataSelect
                    id="inbox-note-knowledge"
                    label="Natureza do conhecimento"
                    value={noteKnowledgeState}
                    onChange={(value) => setNoteKnowledgeState(value as typeof noteKnowledgeState)}
                    options={[
                      ['fact', 'Fato'],
                      ['rumor', 'Rumor'],
                      ['suspicion', 'Suspeita'],
                      ['secret', 'Segredo'],
                      ['possibility', 'Possibilidade'],
                      ['disproved', 'Refutado'],
                    ]}
                  />
                  <MetadataSelect
                    id="inbox-note-visibility"
                    label="Visibilidade"
                    value={noteVisibility}
                    onChange={(value) => setNoteVisibility(value as typeof noteVisibility)}
                    options={[
                      ['gm', 'Somente mestre'],
                      ['players', 'Jogadores'],
                      ['public', 'Pública'],
                    ]}
                  />
                </fieldset>
                <DialogActions className="mt-6">
                  <Button
                    disabled={busy !== null}
                    onClick={() => {
                      setNoteConversion(null);
                      requestAnimationFrame(() => triggerRef.current?.focus());
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    busy={busy === noteConversion.id}
                    disabled={busy !== null}
                    type="submit"
                    variant="primary"
                  >
                    {busy === noteConversion.id ? 'Convertendo…' : 'Confirmar conversão'}
                  </Button>
                </DialogActions>
              </form>
            </div>,
            document.body,
          )}
      {eventConversion === null
        ? null
        : createPortal(
            <div
              aria-labelledby="inbox-event-conversion-title"
              aria-modal="true"
              className="fixed inset-0 z-40 grid place-items-center overflow-y-auto semantic-overlay p-4"
              onKeyDown={(event) => {
                if (event.key === 'Escape' && busy === null) {
                  setEventConversion(null);
                  requestAnimationFrame(() => triggerRef.current?.focus());
                }
                if (event.key === 'Tab') trapFocus(event, eventDialogRef.current);
              }}
              role="dialog"
            >
              <form
                aria-busy={busy === eventConversion.id}
                className="max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-y-auto rounded-2xl semantic-surface p-6 shadow-xl"
                onSubmit={(event) => {
                  event.preventDefault();
                  void convertEvent();
                }}
                ref={eventDialogRef}
              >
                <h2 className="text-xl font-semibold" id="inbox-event-conversion-title">
                  Converter em evento
                </h2>
                <p className="mt-2 text-sm semantic-text-secondary">
                  O texto original será preservado como fonte rastreável.
                </p>
                <p className="mt-4 max-h-28 overflow-y-auto break-words whitespace-pre-wrap rounded-xl semantic-surface-muted p-3 text-sm">
                  {eventConversion.rawText}
                </p>
                {eventError === null ? null : (
                  <div className="mt-4">
                    <UserFacingErrorNotice compact error={eventError} operation="inbox.convert" />
                  </div>
                )}
                <label className="mt-4 block text-sm font-semibold" htmlFor="inbox-event-title">
                  Título
                </label>
                <input
                  className="mt-1 w-full rounded-xl border semantic-border px-3 py-2"
                  disabled={busy !== null}
                  id="inbox-event-title"
                  maxLength={200}
                  onChange={(event) => setEventTitle(event.target.value)}
                  ref={eventTitleRef}
                  required
                  value={eventTitle}
                />
                <label
                  className="mt-4 block text-sm font-semibold"
                  htmlFor="inbox-event-description"
                >
                  Descrição
                </label>
                <textarea
                  className="mt-1 min-h-24 w-full rounded-xl border semantic-border px-3 py-2"
                  disabled={busy !== null}
                  id="inbox-event-description"
                  maxLength={100000}
                  onChange={(event) => setEventDescription(event.target.value)}
                  value={eventDescription}
                />
                <label className="mt-4 block text-sm font-semibold" htmlFor="inbox-event-session">
                  Sessão (opcional)
                </label>
                <select
                  className="mt-1 w-full rounded-xl border semantic-border px-3 py-2"
                  disabled={busy !== null}
                  id="inbox-event-session"
                  onChange={(event) => setEventSessionId(event.target.value)}
                  value={eventSessionId}
                >
                  <option value="">Sem sessão associada</option>
                  {[...sessions.values()].map((session) => (
                    <option key={session.id} value={session.id}>
                      {sessionLabel(session)}
                    </option>
                  ))}
                </select>
                <label className="mt-4 block text-sm font-semibold" htmlFor="inbox-event-order">
                  Ordem narrativa
                </label>
                <input
                  className="mt-1 w-full rounded-xl border semantic-border px-3 py-2"
                  disabled={busy !== null}
                  id="inbox-event-order"
                  min={0}
                  onChange={(event) => setEventOrder(Number(event.target.value))}
                  type="number"
                  value={eventOrder}
                />
                <label className="mt-4 block text-sm font-semibold" htmlFor="inbox-event-occurred">
                  Rótulo temporal
                </label>
                <input
                  className="mt-1 w-full rounded-xl border semantic-border px-3 py-2"
                  disabled={busy !== null}
                  id="inbox-event-occurred"
                  maxLength={200}
                  onChange={(event) => setEventOccurredAtLabel(event.target.value)}
                  value={eventOccurredAtLabel}
                />
                <label className="mt-4 block text-sm font-semibold" htmlFor="inbox-event-link">
                  Vincular entidade (opcional)
                </label>
                <select
                  className="mt-1 w-full rounded-xl border semantic-border px-3 py-2"
                  disabled={busy !== null}
                  id="inbox-event-link"
                  onChange={(event) => setEventLinkEntityId(event.target.value)}
                  value={eventLinkEntityId}
                >
                  <option value="">Sem vínculo</option>
                  {entities.map((entity) => (
                    <option key={entity.id} value={entity.id}>
                      {entity.name}
                    </option>
                  ))}
                </select>
                <label className="mt-4 block text-sm font-semibold" htmlFor="inbox-event-role">
                  Papel do vínculo
                </label>
                <select
                  className="mt-1 w-full rounded-xl border semantic-border px-3 py-2"
                  disabled={busy !== null || eventLinkEntityId === ''}
                  id="inbox-event-role"
                  onChange={(event) => setEventLinkRole(event.target.value as typeof eventLinkRole)}
                  value={eventLinkRole}
                >
                  {[
                    'participant',
                    'location',
                    'cause',
                    'target',
                    'witness',
                    'beneficiary',
                    'victim',
                    'related',
                  ].map((value) => (
                    <option key={value} value={value}>
                      {
                        {
                          participant: 'Participante',
                          location: 'Local',
                          cause: 'Causa',
                          target: 'Alvo',
                          witness: 'Testemunha',
                          beneficiary: 'Beneficiário',
                          victim: 'Vítima',
                          related: 'Relacionado',
                        }[value]
                      }
                    </option>
                  ))}
                </select>
                <fieldset
                  className="mt-5 grid gap-4 rounded-xl border semantic-border p-4"
                  disabled={busy !== null}
                >
                  <legend className="px-1 text-sm font-semibold">Metadados narrativos</legend>
                  <MetadataSelect
                    id="inbox-event-canon"
                    label="Estado canônico"
                    value={eventCanonState}
                    onChange={(value) => setEventCanonState(value as typeof eventCanonState)}
                    options={[
                      ['accepted', 'Aceito'],
                      ['draft', 'Rascunho'],
                      ['rejected', 'Rejeitado'],
                      ['archived', 'Arquivado'],
                    ]}
                  />
                  <MetadataSelect
                    id="inbox-event-knowledge"
                    label="Natureza do conhecimento"
                    value={eventKnowledgeState}
                    onChange={(value) =>
                      setEventKnowledgeState(value as typeof eventKnowledgeState)
                    }
                    options={[
                      ['fact', 'Fato'],
                      ['rumor', 'Rumor'],
                      ['suspicion', 'Suspeita'],
                      ['secret', 'Segredo'],
                      ['possibility', 'Possibilidade'],
                      ['disproved', 'Refutado'],
                    ]}
                  />
                  <MetadataSelect
                    id="inbox-event-visibility"
                    label="Visibilidade"
                    value={eventVisibility}
                    onChange={(value) => setEventVisibility(value as typeof eventVisibility)}
                    options={[
                      ['gm', 'Somente mestre'],
                      ['players', 'Jogadores'],
                      ['public', 'Pública'],
                    ]}
                  />
                </fieldset>
                <DialogActions className="mt-6">
                  <Button
                    disabled={busy !== null}
                    onClick={() => {
                      setEventConversion(null);
                      requestAnimationFrame(() => triggerRef.current?.focus());
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    busy={busy === eventConversion.id}
                    disabled={busy !== null}
                    type="submit"
                    variant="primary"
                  >
                    {busy === eventConversion.id ? 'Convertendo…' : 'Confirmar conversão'}
                  </Button>
                </DialogActions>
              </form>
            </div>,
            document.body,
          )}
      {relationshipConversion === null
        ? null
        : createPortal(
            <div
              aria-labelledby="inbox-relationship-conversion-title"
              aria-modal="true"
              className="fixed inset-0 z-40 grid place-items-center overflow-y-auto semantic-overlay p-4"
              onKeyDown={(event) => {
                if (event.key === 'Escape' && busy === null) {
                  setRelationshipConversion(null);
                  requestAnimationFrame(() => triggerRef.current?.focus());
                }
                if (event.key === 'Tab') trapFocus(event, relationshipDialogRef.current);
              }}
              role="dialog"
            >
              <form
                aria-busy={busy === relationshipConversion.id}
                className="w-full max-w-2xl rounded-2xl semantic-surface p-6 shadow-xl"
                onSubmit={(event) => {
                  event.preventDefault();
                  void convertRelationship();
                }}
                ref={relationshipDialogRef}
              >
                <h2 className="text-xl font-semibold" id="inbox-relationship-conversion-title">
                  Converter em relação
                </h2>
                <p className="mt-2 text-sm semantic-text-secondary">
                  A captura original será preservada como fonte rastreável da relação.
                </p>
                <div
                  aria-labelledby="inbox-relationship-source-text"
                  className="mt-4 max-h-28 overflow-y-auto rounded-xl semantic-surface-muted p-3"
                >
                  <p className="text-xs font-semibold" id="inbox-relationship-source-text">
                    Texto original da captura
                  </p>
                  <p className="mt-1 break-words whitespace-pre-wrap text-sm">
                    {relationshipConversion.rawText}
                  </p>
                </div>
                {relationshipError === null ? null : (
                  <div className="mt-4">
                    <UserFacingErrorNotice
                      compact
                      error={relationshipError}
                      operation="inbox.convert"
                    />
                  </div>
                )}
                {!canChooseRelationshipSource || !canChooseRelationshipTarget ? (
                  <div className="mt-4 rounded-xl semantic-warning-surface p-3 text-sm semantic-accent-text">
                    <p>
                      O tipo selecionado não possui entidades ou tipos de entidade compatíveis para
                      todos os extremos.
                    </p>
                    <Button
                      className="mt-2"
                      disabled={busy !== null}
                      onClick={onManageEntityTypes}
                      size="small"
                      variant="link"
                    >
                      Gerenciar tipos de entidade
                    </Button>
                  </div>
                ) : null}
                <label
                  className="mt-5 block text-sm font-semibold"
                  htmlFor="inbox-relationship-type"
                >
                  Tipo de relação
                </label>
                <select
                  className="mt-1 w-full rounded-xl border semantic-border px-3 py-2"
                  disabled={busy !== null || relationshipTypes.length === 0}
                  id="inbox-relationship-type"
                  onChange={(event) => {
                    setRelationshipTypeId(event.target.value);
                    setRelationshipError(null);
                  }}
                  ref={relationshipTypeRef}
                  required
                  value={relationshipTypeId}
                >
                  {relationshipTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
                <RelationshipEndpointFields
                  entities={compatibleSourceEntities}
                  entityTypes={compatibleSourceTypes}
                  idPrefix="inbox-relationship-source"
                  label="Entidade de origem"
                  mode={relationshipSourceMode}
                  entityId={relationshipSourceEntityId}
                  entityTypeId={relationshipSourceTypeId}
                  name={relationshipSourceName}
                  disabled={busy !== null}
                  onModeChange={setRelationshipSourceMode}
                  onEntityChange={setRelationshipSourceEntityId}
                  onEntityTypeChange={setRelationshipSourceTypeId}
                  onNameChange={setRelationshipSourceName}
                />
                <RelationshipEndpointFields
                  entities={compatibleTargetEntities}
                  entityTypes={compatibleTargetTypes}
                  idPrefix="inbox-relationship-target"
                  label="Entidade de destino"
                  mode={relationshipTargetMode}
                  entityId={relationshipTargetEntityId}
                  entityTypeId={relationshipTargetTypeId}
                  name={relationshipTargetName}
                  disabled={busy !== null}
                  onModeChange={setRelationshipTargetMode}
                  onEntityChange={setRelationshipTargetEntityId}
                  onEntityTypeChange={setRelationshipTargetTypeId}
                  onNameChange={setRelationshipTargetName}
                />
                <label
                  className="mt-5 block text-sm font-semibold"
                  htmlFor="inbox-relationship-description"
                >
                  Descrição da relação
                </label>
                <textarea
                  className="mt-1 min-h-20 w-full rounded-xl border semantic-border px-3 py-2"
                  disabled={busy !== null}
                  id="inbox-relationship-description"
                  maxLength={10000}
                  onChange={(event) => setRelationshipDescription(event.target.value)}
                  value={relationshipDescription}
                />
                <fieldset
                  className="mt-5 grid gap-4 rounded-xl border semantic-border p-4"
                  disabled={busy !== null}
                >
                  <legend className="px-1 text-sm font-semibold">Metadados narrativos</legend>
                  <MetadataSelect
                    id="inbox-relationship-canon"
                    label="Estado canônico"
                    onChange={(value) =>
                      setRelationshipCanonState(value as typeof relationshipCanonState)
                    }
                    value={relationshipCanonState}
                    options={[
                      ['accepted', 'Aceito'],
                      ['draft', 'Rascunho'],
                      ['rejected', 'Rejeitado'],
                      ['archived', 'Arquivado'],
                    ]}
                  />
                  <MetadataSelect
                    id="inbox-relationship-knowledge"
                    label="Natureza do conhecimento"
                    onChange={(value) =>
                      setRelationshipKnowledgeState(value as typeof relationshipKnowledgeState)
                    }
                    value={relationshipKnowledgeState}
                    options={[
                      ['fact', 'Fato'],
                      ['rumor', 'Rumor'],
                      ['suspicion', 'Suspeita'],
                      ['secret', 'Segredo'],
                      ['possibility', 'Possibilidade'],
                      ['disproved', 'Refutado'],
                    ]}
                  />
                  <MetadataSelect
                    id="inbox-relationship-visibility"
                    label="Visibilidade"
                    onChange={(value) =>
                      setRelationshipVisibility(value as typeof relationshipVisibility)
                    }
                    value={relationshipVisibility}
                    options={[
                      ['gm', 'Somente mestre'],
                      ['players', 'Jogadores'],
                      ['public', 'Pública'],
                    ]}
                  />
                </fieldset>
                <DialogActions className="mt-6">
                  <Button
                    disabled={busy !== null}
                    onClick={() => {
                      setRelationshipConversion(null);
                      requestAnimationFrame(() => triggerRef.current?.focus());
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    busy={busy === relationshipConversion.id}
                    disabled={
                      busy !== null ||
                      relationshipTypes.length === 0 ||
                      !canChooseRelationshipSource ||
                      !canChooseRelationshipTarget ||
                      (relationshipSourceMode === 'new' && compatibleSourceTypes.length === 0) ||
                      (relationshipTargetMode === 'new' && compatibleTargetTypes.length === 0)
                    }
                    type="submit"
                    variant="primary"
                  >
                    {busy === relationshipConversion.id ? 'Convertendo…' : 'Confirmar conversão'}
                  </Button>
                </DialogActions>
              </form>
            </div>,
            document.body,
          )}
    </section>
  );
}

function statusLabel(status: InboxItem['status']): string {
  return {
    new: 'Nova',
    reviewing: 'Em revisão',
    converted: 'Convertida',
    dismissed: 'Descartada',
    archived: 'Arquivada',
  }[status];
}

function emptyTitle(filter: Filter): string {
  if (filter === 'pending') return 'Nenhuma captura pendente';
  if (filter === 'dismissed') return 'Nenhuma captura descartada';
  return 'Nenhuma captura arquivada';
}

function emptyDescription(filter: Filter): string {
  if (filter === 'pending') return 'As novas capturas rápidas aparecerão aqui para revisão.';
  if (filter === 'dismissed') return 'Capturas descartadas permanecem preservadas nesta lista.';
  return 'Capturas arquivadas permanecem preservadas nesta lista.';
}

function sessionLabel(session: Session | undefined): string {
  return session === undefined
    ? 'Sessão associada'
    : `Sessão ${String(session.sequenceNumber)} — ${session.title}`;
}

function trapFocus(event: React.KeyboardEvent, container: HTMLElement | null): void {
  const focusable = container?.querySelectorAll<HTMLElement>(
    'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])',
  );
  if (focusable === undefined || focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (first === undefined || last === undefined) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function MetadataSelect({
  id,
  label,
  onChange,
  options,
  value,
}: {
  id: string;
  label: string;
  onChange: (value: string) => void;
  options: [string, string][];
  value: string;
}): React.JSX.Element {
  return (
    <div>
      <label className="block text-sm font-semibold" htmlFor={id}>
        {label}
      </label>
      <select
        className="mt-1 w-full rounded-xl border semantic-border px-3 py-2"
        id={id}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </div>
  );
}

function filterAllowedEntityTypes(
  entityTypes: EntityType[],
  allowedTypeIds: string[] | null | undefined,
): EntityType[] {
  return allowedTypeIds === null || allowedTypeIds === undefined
    ? entityTypes
    : entityTypes.filter((type) => allowedTypeIds.includes(type.id));
}

function filterAllowedEntities(
  entities: Entity[],
  allowedTypeIds: string[] | null | undefined,
): Entity[] {
  return allowedTypeIds === null || allowedTypeIds === undefined
    ? entities
    : entities.filter((entity) => allowedTypeIds.includes(entity.entityTypeId));
}

function RelationshipEndpointFields({
  entities,
  entityTypes,
  idPrefix,
  label,
  mode,
  entityId,
  entityTypeId,
  name,
  disabled,
  onModeChange,
  onEntityChange,
  onEntityTypeChange,
  onNameChange,
}: {
  entities: Entity[];
  entityTypes: EntityType[];
  idPrefix: string;
  label: string;
  mode: 'existing' | 'new';
  entityId: string;
  entityTypeId: string;
  name: string;
  disabled: boolean;
  onModeChange: (value: 'existing' | 'new') => void;
  onEntityChange: (value: string) => void;
  onEntityTypeChange: (value: string) => void;
  onNameChange: (value: string) => void;
}): React.JSX.Element {
  const modeId = `${idPrefix}-mode`;
  return (
    <fieldset className="mt-5 rounded-xl border semantic-border p-4" disabled={disabled}>
      <legend className="px-1 text-sm font-semibold">{label}</legend>
      <label className="block text-sm" htmlFor={modeId}>
        Usar entidade existente ou criar agora
      </label>
      <select
        className="mt-1 w-full rounded-xl border semantic-border px-3 py-2"
        id={modeId}
        onChange={(event) => onModeChange(event.target.value as 'existing' | 'new')}
        value={mode}
      >
        <option disabled={entities.length === 0} value="existing">
          Entidade existente
        </option>
        <option disabled={entityTypes.length === 0} value="new">
          Criar entidade
        </option>
      </select>
      {mode === 'existing' ? (
        <>
          <label className="mt-3 block text-sm" htmlFor={`${idPrefix}-entity`}>
            Entidade
          </label>
          <select
            className="mt-1 w-full rounded-xl border semantic-border px-3 py-2"
            disabled={entities.length === 0}
            id={`${idPrefix}-entity`}
            onChange={(event) => onEntityChange(event.target.value)}
            required
            value={entityId}
          >
            {entities.map((entity) => (
              <option key={entity.id} value={entity.id}>
                {entity.name}
              </option>
            ))}
          </select>
        </>
      ) : (
        <>
          <label className="mt-3 block text-sm" htmlFor={`${idPrefix}-type`}>
            Tipo da nova entidade
          </label>
          <select
            className="mt-1 w-full rounded-xl border semantic-border px-3 py-2"
            disabled={entityTypes.length === 0}
            id={`${idPrefix}-type`}
            onChange={(event) => onEntityTypeChange(event.target.value)}
            required
            value={entityTypeId}
          >
            {entityTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.singularName}
              </option>
            ))}
          </select>
          <label className="mt-3 block text-sm" htmlFor={`${idPrefix}-name`}>
            Nome da nova entidade
          </label>
          <input
            className="mt-1 w-full rounded-xl border semantic-border px-3 py-2"
            id={`${idPrefix}-name`}
            maxLength={200}
            onChange={(event) => onNameChange(event.target.value)}
            required
            value={name}
          />
        </>
      )}
    </fieldset>
  );
}
