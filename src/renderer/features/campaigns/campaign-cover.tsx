import { useCallback, useEffect, useRef, useState } from 'react';
import type { CampaignCover, CampaignCoverPreview } from '../../../core/contracts/campaign-covers';
import type { Campaign } from '../../../core/contracts/campaigns';
import type {
  ImageImportResult,
  ImportImageBytesInput,
} from '../../../core/contracts/image-imports';
import type { Result } from '../../../core/contracts/result';
import { Button, ButtonGroup, DialogActions } from '../../components/actions';

type ImportRequest =
  | { kind: 'local'; pendingImportId?: string }
  | {
      kind: 'bytes';
      input: Omit<ImportImageBytesInput, 'campaignId' | 'revision' | 'oversizeMode'>;
    }
  | { kind: 'url'; url?: string; pendingImportId?: string };

interface PendingConfirmation {
  type: 'replace' | 'remove';
  request?: ImportRequest;
}

export function CampaignCoverPreview({
  campaign,
  className = '',
}: {
  campaign: Campaign;
  className?: string;
}): React.JSX.Element {
  const preview = useCampaignCoverPreview(campaign);
  return (
    <div
      aria-label={preview.loading ? 'Carregando capa' : undefined}
      className={`campaign-cover-frame overflow-hidden rounded-xl semantic-surface-muted ${className}`}
      role={preview.loading ? 'status' : undefined}
    >
      {preview.url === null ? (
        <CampaignCoverPlaceholder campaignName={campaign.name} />
      ) : (
        <img
          alt={`Capa da campanha ${campaign.name}`}
          className="size-full object-cover"
          src={preview.url}
        />
      )}
    </div>
  );
}

export function CampaignCoverManager({
  campaign,
  onCampaignChange,
  defaultOpen = false,
}: {
  campaign: Campaign;
  onCampaignChange: (campaign: Campaign) => void;
  defaultOpen?: boolean;
}): React.JSX.Element {
  const [cover, setCover] = useState<CampaignCover | null>(null);
  const [coverLoading, setCoverLoading] = useState(true);
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

  const loadCover = useCallback(async () => {
    setCoverLoading(true);
    try {
      const result = await window.campaignManager.images.getCover({ campaignId: campaign.id });
      if (result.ok) setCover(result.data);
      else setError(result.error.message);
    } catch {
      setError('Não foi possível carregar a capa da campanha.');
    } finally {
      setCoverLoading(false);
    }
  }, [campaign.id]);

  useEffect(() => {
    void loadCover();
  }, [loadCover, campaign.coverAttachmentId]);

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
    let result: Result<ImageImportResult>;
    try {
      if (request.kind === 'local') {
        result = await window.campaignManager.images.selectLocal({
          campaignId: campaign.id,
          revision: campaign.revision,
          ...(oversizeMode === undefined ? {} : { oversizeMode }),
          ...(request.pendingImportId === undefined
            ? {}
            : { pendingImportId: request.pendingImportId }),
        });
      } else if (request.kind === 'bytes') {
        result = await window.campaignManager.images.importBytes({
          campaignId: campaign.id,
          revision: campaign.revision,
          ...request.input,
          ...(oversizeMode === undefined ? {} : { oversizeMode }),
        });
      } else {
        result = await window.campaignManager.images.importUrl({
          campaignId: campaign.id,
          revision: campaign.revision,
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
    setCover({ campaign: result.data.campaign, attachment: result.data.attachment });
    onCampaignChange(result.data.campaign);
    setPreviewVersion((current) => current + 1);
    setOversizeRequest(null);
    setFeedback('Capa atualizada com sucesso.');
    requestAnimationFrame(() => firstActionRef.current?.focus());
  }

  function requestImport(request: ImportRequest): void {
    const decision = replacementDecision(campaign, cover, coverLoading);
    if (decision === 'wait') {
      setError('Aguarde enquanto a capa atual é verificada.');
      return;
    }
    if (decision === 'confirm') {
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
    if (pending?.type === 'remove') {
      setBusy(true);
      let result;
      try {
        result = await window.campaignManager.images.removeCover({
          campaignId: campaign.id,
          revision: campaign.revision,
        });
      } catch {
        setBusy(false);
        setError('Não foi possível remover a capa. Tente novamente.');
        return;
      }
      setBusy(false);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setCover(result.data);
      onCampaignChange(result.data.campaign);
      setPreviewVersion((current) => current + 1);
      setFeedback('Capa removida.');
      requestAnimationFrame(() => firstActionRef.current?.focus());
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
    <section
      aria-labelledby="campaign-cover-heading"
      className="border-b semantic-border px-8 py-7 sm:px-10"
    >
      <div className="grid gap-5 sm:grid-cols-[12rem_1fr] sm:items-center">
        <CampaignCoverPreview
          campaign={{ ...campaign, revision: campaign.revision + previewVersion }}
        />
        <div>
          <h2 className="text-lg font-semibold" id="campaign-cover-heading">
            Imagem da campanha
          </h2>
          <p className="mt-2 text-sm leading-6 semantic-text-secondary">
            PNG, JPEG ou WebP, até 10 MB. Imagens maiores que 1280 × 1024 exigem uma escolha.
          </p>
          <Button
            aria-haspopup="dialog"
            className="mt-4"
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
            aria-labelledby="cover-manager-title"
            aria-modal="true"
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border semantic-border semantic-surface p-6 shadow-2xl"
            onKeyDown={handleDialogKeyDown}
            onPaste={(event) => {
              if (coverLoading || busy || isEditableTarget(event.target)) return;
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
              <h2 className="text-2xl font-semibold" id="cover-manager-title">
                Gerenciar imagem da campanha
              </h2>
              <p className="mt-2 text-sm semantic-text-secondary">
                Selecione um arquivo, arraste uma imagem, cole da área de transferência ou informe
                uma URL HTTPS.
              </p>

              <div
                aria-label="Solte uma imagem ou pressione Enter para selecionar"
                className="mt-5 rounded-xl border border-dashed semantic-border p-6 text-center focus-visible:outline-2 focus-visible:outline-offset-2"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  if (coverLoading || busy) return;
                  const file = event.dataTransfer.files[0];
                  if (file !== undefined) void importFile(file, 'drag_drop');
                }}
                onKeyDown={(event) => {
                  if (coverLoading || busy) return;
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    requestImport({ kind: 'local' });
                  }
                }}
                role="button"
                tabIndex={coverLoading || busy ? -1 : 0}
              >
                Arraste e solte uma imagem aqui ou cole com Ctrl+V.
              </div>

              <ButtonGroup aria-label="Fontes locais" className="mt-4">
                <Button
                  disabled={coverLoading || busy}
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
                <label className="block text-sm font-semibold" htmlFor="campaign-cover-url">
                  URL da imagem
                </label>
                <div className="mt-2 flex gap-2">
                  <input
                    className="min-h-11 min-w-0 flex-1 rounded-xl border semantic-border semantic-surface px-3"
                    id="campaign-cover-url"
                    onChange={(event) => setUrl(event.target.value)}
                    placeholder="https://exemplo.com/capa.webp"
                    type="url"
                    value={url}
                  />
                  <Button disabled={coverLoading || busy || url.trim() === ''} type="submit">
                    Importar URL
                  </Button>
                </div>
              </form>

              {busy ? (
                <p aria-live="polite" className="mt-4" role="status">
                  Processando imagem…
                </p>
              ) : null}
              {coverLoading ? (
                <p aria-live="polite" className="mt-4" role="status">
                  Verificando capa atual…
                </p>
              ) : null}
              {error === null ? null : (
                <p className="mt-4 semantic-error-text" role="alert">
                  {error}
                </p>
              )}
              {feedback === null ? null : (
                <p aria-live="polite" className="mt-4" role="status">
                  {feedback}
                </p>
              )}

              <DialogActions className="mt-6">
                {cover?.attachment === null || cover === null ? null : (
                  <Button
                    onClick={() => {
                      rememberSecondaryFocus();
                      setConfirmation({ type: 'remove' });
                    }}
                    variant="danger"
                  >
                    Remover capa
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
              <ConfirmationDialog
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

export function ChoiceDialog({
  busy,
  onCancel,
  onChoose,
}: {
  busy: boolean;
  onCancel: () => void;
  onChoose: (mode: 'resize' | 'crop') => void;
}): React.JSX.Element {
  const resizeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => resizeRef.current?.focus(), []);
  return (
    <div className="fixed inset-0 z-60 grid place-items-center semantic-overlay p-4">
      <div
        aria-labelledby="oversize-title"
        aria-modal="true"
        className="w-full max-w-lg rounded-2xl semantic-surface p-6"
        onKeyDown={(event) => handleSecondaryDialogKeyDown(event, dialogRef.current, onCancel)}
        ref={dialogRef}
        role="dialog"
      >
        <h3 className="text-xl font-semibold" id="oversize-title">
          Como ajustar a imagem?
        </h3>
        <p className="mt-2 semantic-text-secondary">A imagem ultrapassa 1280 × 1024.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Button disabled={busy} onClick={() => onChoose('resize')} ref={resizeRef}>
            <span>
              <strong>Redimensionar</strong>
              <br />
              <span className="text-xs">Preserva a imagem inteira, sem cortes.</span>
            </span>
          </Button>
          <Button disabled={busy} onClick={() => onChoose('crop')}>
            <span>
              <strong>Cortar</strong>
              <br />
              <span className="text-xs">Preenche o quadro e corta as bordas.</span>
            </span>
          </Button>
        </div>
        <DialogActions className="mt-5">
          <Button disabled={busy} onClick={onCancel}>
            Cancelar
          </Button>
        </DialogActions>
      </div>
    </div>
  );
}

export function ConfirmationDialog({
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
        aria-labelledby="cover-confirm-title"
        aria-modal="true"
        className="w-full max-w-md rounded-2xl semantic-surface p-6"
        onKeyDown={(event) => handleSecondaryDialogKeyDown(event, dialogRef.current, onCancel)}
        ref={dialogRef}
        role="dialog"
      >
        <h3 className="text-xl font-semibold" id="cover-confirm-title">
          {kind === 'replace' ? 'Substituir a capa?' : 'Remover a capa?'}
        </h3>
        <p className="mt-2 semantic-text-secondary">
          {kind === 'replace'
            ? 'A imagem atual deixará de ser a capa.'
            : 'A campanha voltará a exibir o placeholder.'}
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

function CampaignCoverPlaceholder({ campaignName }: { campaignName: string }): React.JSX.Element {
  return (
    <div className="grid size-full min-h-24 place-items-center semantic-brand-surface p-4 text-center">
      <span aria-hidden="true" className="text-2xl">
        ✦
      </span>
      <span className="sr-only">Campanha {campaignName} sem imagem de capa</span>
    </div>
  );
}

function useCampaignCoverPreview(campaign: Campaign): { loading: boolean; url: string | null } {
  const [state, setState] = useState<{ loading: boolean; url: string | null }>({
    loading: true,
    url: null,
  });
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    void window.campaignManager.images
      .getCoverPreview({ campaignId: campaign.id })
      .then((result) => {
        if (!active) return;
        objectUrl = result.ok && result.data !== null ? previewObjectUrl(result.data) : null;
        setState({ loading: false, url: objectUrl });
      })
      .catch(() => {
        if (active) setState({ loading: false, url: null });
      });
    return () => {
      active = false;
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl);
    };
  }, [campaign.id, campaign.coverAttachmentId, campaign.revision]);
  return state;
}

function previewObjectUrl(preview: NonNullable<CampaignCoverPreview>): string {
  return URL.createObjectURL(
    new Blob([Uint8Array.from(preview.bytes).buffer], { type: preview.mimeType }),
  );
}

export function trapFocus(
  event: Pick<React.KeyboardEvent<HTMLElement>, 'key' | 'shiftKey' | 'preventDefault'>,
  container: Pick<HTMLElement, 'querySelectorAll'> | null,
  activeElement: Element | null = document.activeElement,
): void {
  if (event.key !== 'Tab' || container === null) return;
  const focusable = container.querySelectorAll<HTMLElement>(
    'button:not([disabled]), input:not([disabled]), [tabindex="0"]',
  );
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (first === undefined || last === undefined) return;
  if (event.shiftKey && activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function handleSecondaryDialogKeyDown(
  event: React.KeyboardEvent<HTMLDivElement>,
  container: HTMLElement | null,
  onCancel: () => void,
): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    onCancel();
    return;
  }
  if (event.key === 'Tab') event.stopPropagation();
  trapFocus(event, container);
}

export function managerBackgroundAccessibility(active: boolean): {
  'aria-hidden'?: true;
  inert?: true;
} {
  return active ? { 'aria-hidden': true, inert: true } : {};
}

export function replacementDecision(
  campaign: Campaign,
  cover: CampaignCover | null,
  loading: boolean,
): 'wait' | 'confirm' | 'import' {
  if (loading) return 'wait';
  return campaign.coverAttachmentId !== null || (cover !== null && cover.attachment !== null)
    ? 'confirm'
    : 'import';
}

export function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.matches('input, textarea, select'))
  );
}

function safeFileName(name: string): string {
  const cleaned = name.replace(/[\\/]/gu, '_').trim();
  return cleaned === '' ? 'imagem-colada' : cleaned.slice(0, 255);
}

const maximumImageBytes = 10 * 1024 * 1024;
const acceptedImageTypes = ['image/png', 'image/jpeg', 'image/webp'];
