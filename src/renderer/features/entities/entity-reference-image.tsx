import { useCallback, useEffect, useRef, useState } from 'react';
import type { Entity } from '../../../core/contracts/entities';
import type {
  EntityReferenceImage,
  EntityReferenceImageImportResult,
  EntityReferenceImagePreview as EntityReferenceImagePreviewData,
  ImportEntityReferenceImageBytesInput,
} from '../../../core/contracts/entity-reference-images';
import type { Result } from '../../../core/contracts/result';
import { Button, ButtonGroup, DialogActions } from '../../components/actions';
import {
  ChoiceDialog,
  handleSecondaryDialogKeyDown,
  isEditableTarget,
  managerBackgroundAccessibility,
  trapFocus,
} from '../campaigns/campaign-cover';

type ImportRequest =
  | { kind: 'local'; pendingImportId?: string }
  | {
      kind: 'bytes';
      input: Omit<
        ImportEntityReferenceImageBytesInput,
        'campaignId' | 'entityId' | 'revision' | 'oversizeMode'
      >;
    }
  | { kind: 'url'; url?: string; pendingImportId?: string };

interface PendingConfirmation {
  type: 'replace' | 'remove';
  request?: ImportRequest;
}

export function EntityReferenceImagePreview({
  entity,
  className = '',
  showRetry = false,
}: {
  entity: Entity;
  className?: string;
  showRetry?: boolean;
}): React.JSX.Element {
  const [retryVersion, setRetryVersion] = useState(0);
  const preview = useEntityReferenceImagePreview(entity, retryVersion);
  return (
    <div
      aria-label={preview.loading ? `Carregando imagem de referência de ${entity.name}` : undefined}
      className={`relative overflow-hidden rounded-xl semantic-surface-muted ${className}`}
      role={preview.loading ? 'status' : undefined}
    >
      {preview.url === null ? (
        <EntityReferenceImagePlaceholder entityName={entity.name} />
      ) : (
        <img
          alt={`Imagem de referência de ${entity.name}`}
          className="size-full object-cover"
          src={preview.url}
        />
      )}
      {preview.error && showRetry ? (
        <div className="absolute inset-x-2 bottom-2 rounded-lg semantic-surface p-2 text-center text-xs shadow">
          <p role="alert">Não foi possível carregar a imagem.</p>
          <Button
            className="mt-1"
            onClick={() => setRetryVersion((value) => value + 1)}
            size="small"
          >
            Tentar novamente
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function EntityReferenceImageManager({
  entity,
  onEntityChange,
  defaultOpen = false,
}: {
  entity: Entity;
  onEntityChange: (entity: Entity) => void;
  defaultOpen?: boolean;
}): React.JSX.Element {
  const [reference, setReference] = useState<EntityReferenceImage | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewVersion, setPreviewVersion] = useState(0);
  const [managerOpen, setManagerOpen] = useState(defaultOpen);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [oversizeRequest, setOversizeRequest] = useState<ImportRequest | null>(null);
  const [confirmation, setConfirmation] = useState<PendingConfirmation | null>(null);
  const manageButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstActionRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const secondaryReturnFocusRef = useRef<HTMLElement | null>(null);

  const loadReference = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.campaignManager.images.getEntityReference({
        campaignId: entity.campaignId,
        entityId: entity.id,
      });
      if (result.ok) setReference(result.data);
      else setError(result.error.message);
    } catch {
      setError('Não foi possível carregar a imagem de referência.');
    } finally {
      setLoading(false);
    }
  }, [entity.campaignId, entity.id]);

  useEffect(() => {
    void loadReference();
  }, [loadReference, entity.referenceImageAttachmentId]);

  useEffect(() => {
    if (!managerOpen) return;
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    requestAnimationFrame(() => firstActionRef.current?.focus());
  }, [managerOpen]);

  function closeManager(): void {
    if (busy) return;
    setManagerOpen(false);
    setOversizeRequest(null);
    setConfirmation(null);
    requestAnimationFrame(
      () => returnFocusRef.current?.focus() ?? manageButtonRef.current?.focus(),
    );
  }

  function rememberSecondaryFocus(): void {
    secondaryReturnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : firstActionRef.current;
  }

  function closeSecondaryDialog(): void {
    setOversizeRequest(null);
    setConfirmation(null);
    requestAnimationFrame(
      () => secondaryReturnFocusRef.current?.focus() ?? firstActionRef.current?.focus(),
    );
  }

  async function executeImport(
    request: ImportRequest,
    oversizeMode?: 'resize' | 'crop',
  ): Promise<void> {
    setBusy(true);
    setError(null);
    setFeedback(null);
    const identity = {
      campaignId: entity.campaignId,
      entityId: entity.id,
      revision: entity.revision,
    };
    let result: Result<EntityReferenceImageImportResult>;
    try {
      if (request.kind === 'local') {
        result = await window.campaignManager.images.selectEntityReferenceLocal({
          ...identity,
          ...(oversizeMode === undefined ? {} : { oversizeMode }),
          ...(request.pendingImportId === undefined
            ? {}
            : { pendingImportId: request.pendingImportId }),
        });
      } else if (request.kind === 'bytes') {
        result = await window.campaignManager.images.importEntityReferenceBytes({
          ...identity,
          ...request.input,
          ...(oversizeMode === undefined ? {} : { oversizeMode }),
        });
      } else {
        result = await window.campaignManager.images.importEntityReferenceUrl({
          ...identity,
          ...(request.url === undefined ? {} : { url: request.url }),
          ...(request.pendingImportId === undefined
            ? {}
            : { pendingImportId: request.pendingImportId }),
          ...(oversizeMode === undefined ? {} : { oversizeMode }),
        });
      }
    } catch {
      setBusy(false);
      setError('Não foi possível processar a imagem. Tente novamente.');
      return;
    }
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    if (result.data.status === 'cancelled') {
      setFeedback('Seleção cancelada.');
      return;
    }
    if (result.data.status === 'oversize_choice_required') {
      rememberSecondaryFocus();
      setOversizeRequest(
        result.data.pendingImportId === undefined
          ? request
          : request.kind === 'local'
            ? { kind: 'local', pendingImportId: result.data.pendingImportId }
            : request.kind === 'url'
              ? { kind: 'url', pendingImportId: result.data.pendingImportId }
              : request,
      );
      return;
    }
    setReference({ entity: result.data.entity, attachment: result.data.attachment });
    onEntityChange(result.data.entity);
    setPreviewVersion((current) => current + 1);
    setOversizeRequest(null);
    setFeedback('Imagem de referência atualizada com sucesso.');
    requestAnimationFrame(() => firstActionRef.current?.focus());
  }

  function requestImport(request: ImportRequest): void {
    if (loading) {
      setError('Aguarde enquanto a imagem atual é verificada.');
      return;
    }
    if (
      entity.referenceImageAttachmentId !== null ||
      (reference !== null && reference.attachment !== null)
    ) {
      rememberSecondaryFocus();
      setConfirmation({ type: 'replace', request });
      return;
    }
    void executeImport(request);
  }

  async function importFile(file: File, sourceKind: 'clipboard' | 'drag_drop'): Promise<void> {
    if (!acceptedImageTypes.includes(file.type) || file.size > maximumImageBytes) {
      setError('Use PNG, JPEG ou WebP com no máximo 10 MB.');
      return;
    }
    requestImport({
      kind: 'bytes',
      input: {
        bytes: new Uint8Array(await file.arrayBuffer()),
        metadata: {
          originalFilename: safeFileName(file.name),
          sourceKind,
          declaredMimeType: file.type,
        },
      },
    });
  }

  async function confirmAction(): Promise<void> {
    const pending = confirmation;
    setConfirmation(null);
    if (pending?.type === 'replace' && pending.request !== undefined) {
      await executeImport(pending.request);
      return;
    }
    if (pending?.type !== 'remove') return;
    setBusy(true);
    setError(null);
    try {
      const result = await window.campaignManager.images.removeEntityReference({
        campaignId: entity.campaignId,
        entityId: entity.id,
        revision: entity.revision,
      });
      setBusy(false);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setReference(result.data);
      onEntityChange(result.data.entity);
      setPreviewVersion((current) => current + 1);
      setFeedback('Imagem de referência removida.');
      requestAnimationFrame(() => firstActionRef.current?.focus());
    } catch {
      setBusy(false);
      setError('Não foi possível remover a imagem. Tente novamente.');
    }
  }

  function handleDialogKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (oversizeRequest !== null || confirmation !== null) closeSecondaryDialog();
      else closeManager();
      return;
    }
    trapFocus(event, dialogRef.current);
  }

  return (
    <section aria-labelledby="entity-reference-image-heading">
      <div className="grid gap-5 sm:grid-cols-[16rem_1fr] sm:items-center">
        <EntityReferenceImagePreview
          className="h-48 w-full"
          entity={{ ...entity, revision: entity.revision + previewVersion }}
          showRetry
        />
        <div>
          <h2 className="text-lg font-semibold" id="entity-reference-image-heading">
            Imagem de referência
          </h2>
          <p className="mt-2 text-sm leading-6 semantic-text-secondary">
            PNG, JPEG ou WebP, até 10 MB. Imagens maiores que 1280 × 1024 exigem uma escolha.
          </p>
          {loading ? (
            <p aria-live="polite" className="mt-3 text-sm" role="status">
              Verificando imagem atual…
            </p>
          ) : error !== null && !managerOpen ? (
            <div className="mt-3">
              <p className="semantic-error-text" role="alert">
                {error}
              </p>
              <Button className="mt-2" onClick={() => void loadReference()} size="small">
                Tentar novamente
              </Button>
            </div>
          ) : reference?.attachment === null ? (
            <p className="mt-3 text-sm semantic-text-secondary">Nenhuma imagem adicionada.</p>
          ) : null}
          <Button
            aria-haspopup="dialog"
            className="mt-4"
            disabled={loading}
            onClick={() => setManagerOpen(true)}
            ref={manageButtonRef}
          >
            Gerenciar imagem
          </Button>
        </div>
      </div>

      {managerOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center semantic-overlay p-4">
          <div
            aria-busy={busy}
            aria-labelledby="entity-reference-manager-title"
            aria-modal="true"
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border semantic-border semantic-surface p-6 shadow-2xl"
            onKeyDown={handleDialogKeyDown}
            onPaste={(event) => {
              if (loading || busy || isEditableTarget(event.target)) return;
              const file = [...event.clipboardData.files].find((item) =>
                item.type.startsWith('image/'),
              );
              if (file === undefined) return;
              event.preventDefault();
              void importFile(file, 'clipboard');
            }}
            ref={dialogRef}
            role="dialog"
          >
            <div
              {...managerBackgroundAccessibility(oversizeRequest !== null || confirmation !== null)}
            >
              <h2 className="text-2xl font-semibold" id="entity-reference-manager-title">
                Gerenciar imagem de referência
              </h2>
              <p className="mt-2 text-sm semantic-text-secondary">
                Selecione um arquivo, arraste uma imagem, cole da área de transferência ou informe
                uma URL HTTP ou HTTPS.
              </p>
              <div
                aria-label="Solte uma imagem ou pressione Enter para selecionar"
                className="mt-5 rounded-xl border border-dashed semantic-border p-6 text-center focus-visible:outline-2 focus-visible:outline-offset-2"
                onClick={() =>
                  activateImagePicker('click', undefined, loading || busy, () =>
                    requestImport({ kind: 'local' }),
                  )
                }
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  if (loading || busy) return;
                  const file = event.dataTransfer.files[0];
                  if (file !== undefined) void importFile(file, 'drag_drop');
                }}
                onKeyDown={(event) => {
                  const activated = activateImagePicker(
                    'keyboard',
                    event.key,
                    loading || busy,
                    () => requestImport({ kind: 'local' }),
                  );
                  if (activated) event.preventDefault();
                }}
                role="button"
                tabIndex={loading || busy ? -1 : 0}
              >
                Arraste e solte uma imagem aqui ou cole com Ctrl+V.
              </div>
              <ButtonGroup aria-label="Fontes locais" className="mt-4">
                <Button
                  disabled={loading || busy}
                  onClick={() => requestImport({ kind: 'local' })}
                  ref={firstActionRef}
                >
                  Selecionar arquivo
                </Button>
              </ButtonGroup>
              <form
                className="mt-5"
                onSubmit={(event) => {
                  event.preventDefault();
                  requestImport({ kind: 'url', url });
                }}
              >
                <label className="block text-sm font-semibold" htmlFor="entity-reference-image-url">
                  URL da imagem
                </label>
                <div className="mt-2 flex gap-2">
                  <input
                    className="min-h-11 min-w-0 flex-1 rounded-xl border semantic-border semantic-surface px-3"
                    disabled={loading || busy}
                    id="entity-reference-image-url"
                    onChange={(event) => setUrl(event.target.value)}
                    placeholder="https://exemplo.com/referencia.webp"
                    type="url"
                    value={url}
                  />
                  <Button disabled={loading || busy || url.trim() === ''} type="submit">
                    Importar URL
                  </Button>
                </div>
              </form>
              {busy ? (
                <p aria-live="polite" className="mt-4" role="status">
                  Processando imagem…
                </p>
              ) : null}
              {error === null ? null : (
                <p className="mt-4 semantic-error-text" role="alert">
                  {error}
                </p>
              )}
              <p aria-atomic="true" aria-live="polite" className="mt-4" role="status">
                {feedback}
              </p>
              <DialogActions className="mt-6">
                {reference?.attachment === null || reference === null ? null : (
                  <Button
                    disabled={busy}
                    onClick={() => {
                      rememberSecondaryFocus();
                      setConfirmation({ type: 'remove' });
                    }}
                    variant="danger"
                  >
                    Remover imagem
                  </Button>
                )}
                <Button disabled={busy} onClick={closeManager}>
                  Fechar
                </Button>
              </DialogActions>
            </div>
            {oversizeRequest === null ? null : (
              <ChoiceDialog
                busy={busy}
                onCancel={closeSecondaryDialog}
                onChoose={(mode) => void executeImport(oversizeRequest, mode)}
              />
            )}
            {confirmation === null ? null : (
              <EntityReferenceConfirmationDialog
                busy={busy}
                kind={confirmation.type}
                onCancel={closeSecondaryDialog}
                onConfirm={() => void confirmAction()}
              />
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function EntityReferenceConfirmationDialog({
  busy,
  kind,
  onCancel,
  onConfirm,
}: {
  busy: boolean;
  kind: 'replace' | 'remove';
  onCancel: () => void;
  onConfirm: () => void;
}): React.JSX.Element {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => cancelRef.current?.focus(), []);
  return (
    <div className="fixed inset-0 z-60 grid place-items-center semantic-overlay p-4">
      <div
        aria-labelledby="entity-reference-confirm-title"
        aria-modal="true"
        className="w-full max-w-md rounded-2xl semantic-surface p-6"
        onKeyDown={(event) => handleSecondaryDialogKeyDown(event, dialogRef.current, onCancel)}
        ref={dialogRef}
        role="dialog"
      >
        <h3 className="text-xl font-semibold" id="entity-reference-confirm-title">
          {kind === 'replace'
            ? 'Substituir a imagem de referência?'
            : 'Remover a imagem de referência?'}
        </h3>
        <p className="mt-2 semantic-text-secondary">
          {kind === 'replace'
            ? 'A imagem atual será substituída.'
            : 'A entidade voltará a exibir o marcador sem imagem.'}
        </p>
        <DialogActions className="mt-5">
          <Button disabled={busy} onClick={onCancel} ref={cancelRef}>
            Cancelar
          </Button>
          <Button busy={busy} onClick={onConfirm} variant="danger">
            Confirmar
          </Button>
        </DialogActions>
      </div>
    </div>
  );
}

export function activateImagePicker(
  trigger: 'click' | 'keyboard',
  key: string | undefined,
  unavailable: boolean,
  open: () => void,
): boolean {
  if (unavailable || (trigger === 'keyboard' && key !== 'Enter' && key !== ' ')) return false;
  open();
  return true;
}

function EntityReferenceImagePlaceholder({
  entityName,
}: {
  entityName: string;
}): React.JSX.Element {
  return (
    <div className="grid size-full min-h-24 place-items-center semantic-brand-surface p-3 text-center">
      <span aria-hidden="true" className="text-2xl">
        ◇
      </span>
      <span className="sr-only">{entityName} sem imagem de referência</span>
    </div>
  );
}

function useEntityReferenceImagePreview(
  entity: Entity,
  retryVersion: number,
): { loading: boolean; url: string | null; error: boolean } {
  const [state, setState] = useState<{ loading: boolean; url: string | null; error: boolean }>({
    loading: entity.referenceImageAttachmentId !== null,
    url: null,
    error: false,
  });
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    if (entity.referenceImageAttachmentId === null) {
      setState({ loading: false, url: null, error: false });
      return () => undefined;
    }
    setState({ loading: true, url: null, error: false });
    void window.campaignManager.images
      .getEntityReferencePreview({ campaignId: entity.campaignId, entityId: entity.id })
      .then((result) => {
        if (!active) return;
        if (!result.ok || result.data === null) {
          setState({ loading: false, url: null, error: !result.ok });
          return;
        }
        objectUrl = previewObjectUrl(result.data);
        setState({ loading: false, url: objectUrl, error: false });
      })
      .catch(() => {
        if (active) setState({ loading: false, url: null, error: true });
      });
    return () => {
      active = false;
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl);
    };
  }, [
    entity.campaignId,
    entity.id,
    entity.referenceImageAttachmentId,
    entity.revision,
    retryVersion,
  ]);
  return state;
}

function previewObjectUrl(preview: NonNullable<EntityReferenceImagePreviewData>): string {
  return URL.createObjectURL(
    new Blob([Uint8Array.from(preview.bytes).buffer], { type: preview.mimeType }),
  );
}

function safeFileName(name: string): string {
  const cleaned = name.replace(/[\\/]/gu, '_').trim();
  return cleaned === '' ? 'imagem-colada' : cleaned.slice(0, 255);
}

const maximumImageBytes = 10 * 1024 * 1024;
const acceptedImageTypes = ['image/png', 'image/jpeg', 'image/webp'];
