import { useCallback, useEffect, useRef, useState } from 'react';
import type { FieldDefinition } from '../../../core/contracts/field-definitions';
import type {
  ImageFieldValueDetails,
  ImageFieldValueImportResult,
  ImportImageFieldValueBytesInput,
} from '../../../core/contracts/image-field-values';
import type { Result } from '../../../core/contracts/result';
import { Button, ButtonGroup, DialogActions } from '../../components/actions';
import { ContextualHelp } from '../../components/contextual-help';
import { ImageLightbox } from '../../components/image-lightbox';
import { fieldDefinitionHelpContent } from '../../content/contextual-help';
import { ChoiceDialog, isEditableTarget, trapFocus } from '../campaigns/campaign-cover';

type ImportRequest =
  | { kind: 'local'; pendingImportId?: string }
  | {
      kind: 'bytes';
      input: Omit<
        ImportImageFieldValueBytesInput,
        'campaignId' | 'entityId' | 'fieldDefinitionId' | 'caption' | 'altText' | 'oversizeMode'
      >;
    }
  | { kind: 'url'; url?: string; pendingImportId?: string };

export function ImageFieldGallery({
  campaignId,
  entityId,
  field,
  defaultOpen = false,
}: {
  campaignId: string;
  entityId: string;
  field: FieldDefinition;
  defaultOpen?: boolean;
}): React.JSX.Element {
  const [items, setItems] = useState<ImageFieldValueDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(defaultOpen);
  const [caption, setCaption] = useState('');
  const [altText, setAltText] = useState('');
  const [url, setUrl] = useState('');
  const [oversizeRequest, setOversizeRequest] = useState<ImportRequest | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<ImageFieldValueDetails | null>(null);
  const [conflict, setConflict] = useState(false);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const altTextInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const removeDialogRef = useRef<HTMLDivElement>(null);
  const removeCancelRef = useRef<HTMLButtonElement>(null);
  const removalInvokerRef = useRef<HTMLButtonElement | null>(null);
  const secondaryReturnFocusRef = useRef<HTMLElement | null>(null);

  const identity = { campaignId, entityId, fieldDefinitionId: field.id };
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.campaignManager.imageFieldValues.list({
        campaignId,
        entityId,
        fieldDefinitionId: field.id,
      });
      if (result.ok) {
        setItems(result.data);
        setConflict(false);
      } else setError(result.error.message);
    } catch {
      setError('Não foi possível carregar as imagens deste campo.');
    } finally {
      setLoading(false);
    }
  }, [campaignId, entityId, field.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (dialogOpen) requestAnimationFrame(() => altTextInputRef.current?.focus());
  }, [dialogOpen]);

  useEffect(() => {
    if (pendingRemoval !== null) requestAnimationFrame(() => removeCancelRef.current?.focus());
  }, [pendingRemoval]);

  function handleOperationError(operationError: { code: string; message: string }): void {
    setError(operationError.message);
    if (operationError.code === 'REVISION_CONFLICT') setConflict(true);
  }

  function closeDialog(): void {
    if (busy) return;
    setDialogOpen(false);
    setOversizeRequest(null);
    requestAnimationFrame(() => addButtonRef.current?.focus());
  }

  async function executeImport(
    request: ImportRequest,
    oversizeMode?: 'resize' | 'crop',
  ): Promise<void> {
    if (altText.trim() === '') {
      setError('Descreva a imagem no campo de texto alternativo antes de importar.');
      return;
    }
    setBusy(true);
    setError(null);
    setFeedback(null);
    const metadata = {
      caption: nullableText(caption),
      altText: altText.trim(),
    };
    let result: Result<ImageFieldValueImportResult>;
    try {
      if (request.kind === 'local') {
        result = await window.campaignManager.imageFieldValues.selectLocal({
          ...identity,
          ...metadata,
          ...(request.pendingImportId === undefined
            ? {}
            : { pendingImportId: request.pendingImportId }),
          ...(oversizeMode === undefined ? {} : { oversizeMode }),
        });
      } else if (request.kind === 'bytes') {
        result = await window.campaignManager.imageFieldValues.importBytes({
          ...identity,
          ...metadata,
          ...request.input,
          ...(oversizeMode === undefined ? {} : { oversizeMode }),
        });
      } else {
        result = await window.campaignManager.imageFieldValues.importUrl({
          ...identity,
          ...metadata,
          ...(request.url === undefined ? {} : { url: request.url }),
          ...(request.pendingImportId === undefined
            ? {}
            : { pendingImportId: request.pendingImportId }),
          ...(oversizeMode === undefined ? {} : { oversizeMode }),
        });
      }
    } catch {
      setBusy(false);
      setError('Não foi possível importar a imagem. Tente novamente.');
      return;
    }
    setBusy(false);
    if (!result.ok) {
      handleOperationError(result.error);
      return;
    }
    if (result.data.status === 'cancelled') {
      setFeedback('Seleção cancelada.');
      return;
    }
    if (result.data.status === 'oversize_choice_required') {
      secondaryReturnFocusRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : altTextInputRef.current;
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
    const imported = result.data;
    setItems((current) => [...current, { value: imported.value, attachment: imported.attachment }]);
    setCaption('');
    setAltText('');
    setUrl('');
    setOversizeRequest(null);
    setFeedback('Imagem adicionada.');
    requestAnimationFrame(() => altTextInputRef.current?.focus());
  }

  async function importFile(file: File, sourceKind: 'clipboard' | 'drag_drop'): Promise<void> {
    if (!acceptedImageTypes.includes(file.type) || file.size > maximumImageBytes) {
      setError('Use PNG, JPEG ou WebP com no máximo 10 MB.');
      return;
    }
    await executeImport({
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

  async function move(index: number, direction: -1 | 1): Promise<void> {
    const source = items[index];
    const target = items[index + direction];
    if (source === undefined || target === undefined) return;
    setBusy(true);
    setError(null);
    try {
      const result = await window.campaignManager.imageFieldValues.move({
        ...identity,
        sourceId: source.value.id,
        sourceRevision: source.value.revision,
        targetId: target.value.id,
        targetRevision: target.value.revision,
        placement: direction < 0 ? 'before' : 'after',
      });
      if (result.ok) {
        setItems(result.data);
        setFeedback('Ordem das imagens atualizada.');
      } else handleOperationError(result.error);
    } catch {
      setError('Não foi possível reordenar as imagens.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: ImageFieldValueDetails): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const result = await window.campaignManager.imageFieldValues.remove({
        campaignId,
        id: item.value.id,
        revision: item.value.revision,
      });
      if (result.ok) {
        setItems((current) => current.filter(({ value }) => value.id !== item.value.id));
        setFeedback('Imagem removida.');
        setPendingRemoval(null);
        requestAnimationFrame(() => addButtonRef.current?.focus());
      } else handleOperationError(result.error);
    } catch {
      setError('Não foi possível remover a imagem.');
    } finally {
      setPendingRemoval(null);
      setBusy(false);
      requestAnimationFrame(() => addButtonRef.current?.focus());
    }
  }

  function cancelRemoval(): void {
    setPendingRemoval(null);
    requestAnimationFrame(() => removalInvokerRef.current?.focus());
  }

  function closeOversizeChoice(): void {
    setOversizeRequest(null);
    requestAnimationFrame(() => secondaryReturnFocusRef.current?.focus());
  }

  const occupied = busy || conflict;
  const help = fieldDefinitionHelpContent(field);

  return (
    <section
      aria-busy={occupied}
      aria-labelledby={`image-field-${field.id}`}
      className="rounded-2xl border semantic-border p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-1 font-semibold" id={`image-field-${field.id}`}>
            {field.label}
            {help === null ? null : <ContextualHelp content={help} label={field.label} />}
          </h3>
          {field.description === null ? null : (
            <p className="mt-1 text-sm semantic-text-secondary">{field.description}</p>
          )}
        </div>
        <Button
          aria-haspopup="dialog"
          disabled={loading || occupied}
          onClick={() => setDialogOpen(true)}
          ref={addButtonRef}
          size="small"
        >
          Adicionar imagem
        </Button>
      </div>

      {loading ? (
        <p aria-live="polite" className="mt-4 text-sm" role="status">
          Carregando imagens…
        </p>
      ) : error !== null && items.length === 0 ? (
        <div className="mt-4" role="alert">
          <p className="semantic-error-text">{error}</p>
          <Button className="mt-2" onClick={() => void load()} size="small">
            Tentar novamente
          </Button>
        </div>
      ) : items.length === 0 ? (
        <p className="mt-4 text-sm semantic-text-secondary">Nenhuma imagem adicionada.</p>
      ) : (
        <ul className="mt-4 grid gap-4 sm:grid-cols-2" aria-label={`Imagens de ${field.label}`}>
          {items.map((item, index) => (
            <ImageFieldCard
              busy={occupied}
              campaignId={campaignId}
              fieldLabel={field.label}
              index={index}
              item={item}
              key={item.value.id}
              onChange={(updated) =>
                setItems((current) =>
                  current.map((candidate) =>
                    candidate.value.id === updated.value.id ? updated : candidate,
                  ),
                )
              }
              onError={setError}
              onConflict={() => setConflict(true)}
              onFeedback={setFeedback}
              onMove={(direction) => void move(index, direction)}
              onRemove={(invoker) => {
                removalInvokerRef.current = invoker;
                setPendingRemoval(item);
              }}
              setBusy={setBusy}
              total={items.length}
            />
          ))}
        </ul>
      )}
      {error === null || items.length === 0 ? null : (
        <p className="mt-4 semantic-error-text" role="alert">
          {error}
        </p>
      )}
      {conflict ? (
        <Button className="mt-3" onClick={() => void load()} size="small">
          Recarregar galeria
        </Button>
      ) : null}
      <p aria-atomic="true" aria-live="polite" className="mt-3 text-sm" role="status">
        {feedback}
      </p>

      {dialogOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center semantic-overlay p-4">
          <div
            aria-busy={busy}
            aria-labelledby={`image-field-dialog-${field.id}`}
            aria-modal="true"
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border semantic-border semantic-surface p-6 shadow-2xl"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                closeDialog();
              } else trapFocus(event, dialogRef.current);
            }}
            onPaste={(event) => {
              if (busy || isEditableTarget(event.target)) return;
              const file = [...event.clipboardData.files].find((candidate) =>
                candidate.type.startsWith('image/'),
              );
              if (file === undefined) return;
              event.preventDefault();
              void importFile(file, 'clipboard');
            }}
            ref={dialogRef}
            role="dialog"
          >
            <div
              aria-hidden={oversizeRequest === null ? undefined : true}
              inert={oversizeRequest === null ? undefined : true}
            >
              <h3 className="text-xl font-semibold" id={`image-field-dialog-${field.id}`}>
                Adicionar imagem a {field.label}
              </h3>
              <p className="mt-2 text-sm semantic-text-secondary">
                Selecione, arraste, cole ou informe uma URL. PNG, JPEG ou WebP, até 10 MB.
              </p>
              <div
                aria-label="Solte uma imagem neste campo"
                className="mt-5 rounded-xl border border-dashed semantic-border p-6 text-center"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const file = event.dataTransfer.files[0];
                  if (!busy && file !== undefined) void importFile(file, 'drag_drop');
                }}
              >
                Arraste e solte uma imagem aqui ou cole com Ctrl+V.
              </div>
              <Button
                className="mt-4"
                disabled={busy || altText.trim() === ''}
                onClick={() => void executeImport({ kind: 'local' })}
              >
                Selecionar arquivo
              </Button>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-semibold">
                  Legenda
                  <input
                    className={inputClass}
                    disabled={busy}
                    maxLength={1000}
                    onChange={(event) => setCaption(event.target.value)}
                    value={caption}
                  />
                </label>
                <label className="text-sm font-semibold">
                  Texto alternativo *
                  <input
                    className={inputClass}
                    disabled={busy}
                    maxLength={1000}
                    onChange={(event) => setAltText(event.target.value)}
                    ref={altTextInputRef}
                    required
                    value={altText}
                  />
                </label>
              </div>
              <form
                className="mt-5"
                onSubmit={(event) => {
                  event.preventDefault();
                  void executeImport({ kind: 'url', url });
                }}
              >
                <label className="text-sm font-semibold" htmlFor={`image-field-url-${field.id}`}>
                  URL da imagem
                </label>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <input
                    className="min-h-11 min-w-0 flex-1 rounded-xl border semantic-border semantic-surface px-3"
                    disabled={busy}
                    id={`image-field-url-${field.id}`}
                    onChange={(event) => setUrl(event.target.value)}
                    placeholder="https://exemplo.com/imagem.webp"
                    type="url"
                    value={url}
                  />
                  <Button
                    disabled={busy || url.trim() === '' || altText.trim() === ''}
                    type="submit"
                  >
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
              <DialogActions className="mt-6">
                <Button disabled={busy} onClick={closeDialog}>
                  Fechar
                </Button>
              </DialogActions>
            </div>
            {oversizeRequest === null ? null : (
              <ChoiceDialog
                busy={busy}
                onCancel={closeOversizeChoice}
                onChoose={(mode) => void executeImport(oversizeRequest, mode)}
              />
            )}
          </div>
        </div>
      ) : null}
      {pendingRemoval === null ? null : (
        <div className="fixed inset-0 z-50 grid place-items-center semantic-overlay p-4">
          <div
            aria-labelledby={`remove-image-field-${pendingRemoval.value.id}`}
            aria-modal="true"
            className="w-full max-w-md rounded-2xl semantic-surface p-6 shadow-2xl"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                cancelRemoval();
              } else trapFocus(event, removeDialogRef.current);
            }}
            ref={removeDialogRef}
            role="dialog"
          >
            <h3
              className="text-xl font-semibold"
              id={`remove-image-field-${pendingRemoval.value.id}`}
            >
              Remover imagem de {field.label}?
            </h3>
            <p className="mt-2 semantic-text-secondary">
              A imagem deixará de aparecer neste campo. Esta ação não pode ser desfeita aqui.
            </p>
            <DialogActions className="mt-5">
              <Button disabled={busy} onClick={cancelRemoval} ref={removeCancelRef}>
                Cancelar
              </Button>
              <Button busy={busy} onClick={() => void remove(pendingRemoval)} variant="danger">
                Confirmar remoção
              </Button>
            </DialogActions>
          </div>
        </div>
      )}
    </section>
  );
}

function ImageFieldCard({
  campaignId,
  fieldLabel,
  item,
  index,
  total,
  busy,
  onChange,
  onMove,
  onRemove,
  onError,
  onConflict,
  onFeedback,
  setBusy,
}: {
  campaignId: string;
  fieldLabel: string;
  item: ImageFieldValueDetails;
  index: number;
  total: number;
  busy: boolean;
  onChange: (item: ImageFieldValueDetails) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: (invoker: HTMLButtonElement) => void;
  onError: (message: string | null) => void;
  onConflict: () => void;
  onFeedback: (message: string | null) => void;
  setBusy: (busy: boolean) => void;
}): React.JSX.Element {
  const [caption, setCaption] = useState(item.value.caption ?? '');
  const [altText, setAltText] = useState(item.value.altText ?? '');
  const [preview, setPreview] = useState<{ loading: boolean; url: string | null; error: boolean }>({
    loading: true,
    url: null,
    error: false,
  });
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const lightboxTriggerRef = useRef<HTMLButtonElement>(null);
  const metadataDraftKey = imageMetadataDraftKey(item);

  useEffect(() => {
    setCaption(item.value.caption ?? '');
    setAltText(item.value.altText);
  }, [metadataDraftKey]);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setPreview({ loading: true, url: null, error: false });
    void window.campaignManager.imageFieldValues
      .getPreview({ campaignId, id: item.value.id })
      .then((result) => {
        if (!active) return;
        if (!result.ok || result.data === null) {
          setPreview({ loading: false, url: null, error: true });
          return;
        }
        objectUrl = URL.createObjectURL(
          new Blob([Uint8Array.from(result.data.bytes).buffer], { type: result.data.mimeType }),
        );
        setPreview({ loading: false, url: objectUrl, error: false });
      })
      .catch(() => {
        if (active) setPreview({ loading: false, url: null, error: true });
      });
    return () => {
      active = false;
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl);
    };
  }, [campaignId, item.value.id, item.value.revision, previewAttempt]);

  async function saveMetadata(): Promise<void> {
    if (altText.trim() === '') {
      onError('O texto alternativo é obrigatório e deve descrever a imagem.');
      return;
    }
    setBusy(true);
    onError(null);
    try {
      const result = await window.campaignManager.imageFieldValues.update({
        campaignId,
        id: item.value.id,
        revision: item.value.revision,
        patch: { caption: nullableText(caption), altText: altText.trim() },
      });
      if (result.ok) {
        onChange(result.data);
        onFeedback('Metadados da imagem atualizados.');
      } else {
        onError(result.error.message);
        if (result.error.code === 'REVISION_CONFLICT') onConflict();
      }
    } catch {
      onError('Não foi possível atualizar os metadados.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <li
      aria-labelledby={`image-card-${item.value.id}`}
      className="rounded-xl border semantic-border semantic-surface-muted p-3"
    >
      <h4 className="mb-2 text-sm font-semibold" id={`image-card-${item.value.id}`}>
        Imagem {index + 1} de {fieldLabel}
      </h4>
      <div className="relative aspect-video overflow-hidden rounded-lg semantic-surface">
        {preview.url === null ? (
          <div className="grid size-full place-items-center p-3 text-center text-sm semantic-text-secondary">
            {preview.loading ? 'Carregando miniatura…' : 'Miniatura indisponível'}
          </div>
        ) : (
          <button
            aria-label={`Ampliar imagem ${index + 1} de ${fieldLabel}`}
            className="size-full cursor-zoom-in"
            onClick={() => setLightboxOpen(true)}
            ref={lightboxTriggerRef}
            type="button"
          >
            <img alt={item.value.altText} className="size-full object-cover" src={preview.url} />
          </button>
        )}
      </div>
      {preview.error ? (
        <Button
          className="mt-2"
          onClick={() => setPreviewAttempt((value) => value + 1)}
          size="small"
        >
          Tentar miniatura novamente
        </Button>
      ) : null}
      <div className="mt-3 grid gap-3">
        <label className="text-sm font-semibold">
          Legenda da imagem {index + 1} de {fieldLabel}
          <input
            className={inputClass}
            disabled={busy}
            maxLength={1000}
            onChange={(event) => setCaption(event.target.value)}
            value={caption}
          />
        </label>
        <label className="text-sm font-semibold">
          Texto alternativo da imagem {index + 1} de {fieldLabel} *
          <input
            className={inputClass}
            disabled={busy}
            maxLength={1000}
            onChange={(event) => setAltText(event.target.value)}
            required
            value={altText}
          />
        </label>
        <Button disabled={busy} onClick={() => void saveMetadata()} size="small">
          Salvar metadados da imagem {index + 1}
        </Button>
        <ButtonGroup aria-label={`Ordenar imagem ${index + 1}`}>
          <Button disabled={busy || index === 0} onClick={() => onMove(-1)} size="small">
            Mover imagem {index + 1} acima
          </Button>
          <Button disabled={busy || index === total - 1} onClick={() => onMove(1)} size="small">
            Mover imagem {index + 1} abaixo
          </Button>
          <Button
            disabled={busy}
            onClick={(event) => onRemove(event.currentTarget)}
            size="small"
            variant="danger"
          >
            Remover imagem {index + 1}
          </Button>
        </ButtonGroup>
      </div>
      {lightboxOpen ? (
        <ImageLightbox
          alt={item.value.altText}
          load={() =>
            window.campaignManager.imageFieldValues.getDisplay({
              campaignId,
              id: item.value.id,
            })
          }
          onClose={() => {
            setLightboxOpen(false);
            requestAnimationFrame(() => lightboxTriggerRef.current?.focus());
          }}
        />
      ) : null}
    </li>
  );
}

export function imageMetadataDraftKey(item: ImageFieldValueDetails): string {
  return JSON.stringify([item.value.caption, item.value.altText]);
}

function nullableText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function safeFileName(name: string): string {
  const cleaned = name.replace(/[\\/]/gu, '_').trim();
  return cleaned === '' ? 'imagem-colada' : cleaned.slice(0, 255);
}

const inputClass =
  'mt-2 w-full rounded-xl border semantic-border semantic-surface px-3 py-2 semantic-text-primary';
const maximumImageBytes = 10 * 1024 * 1024;
const acceptedImageTypes = ['image/png', 'image/jpeg', 'image/webp'];
