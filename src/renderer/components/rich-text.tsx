import { useEffect, useRef } from 'react';

const allowedTags = new Set([
  'P',
  'BR',
  'STRONG',
  'B',
  'EM',
  'I',
  'U',
  'S',
  'UL',
  'OL',
  'LI',
  'H1',
  'H2',
  'H3',
  'BLOCKQUOTE',
  'PRE',
  'CODE',
  'TABLE',
  'THEAD',
  'TBODY',
  'TR',
  'TH',
  'TD',
  'A',
]);
const dangerousTags = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH']);

export function sanitizeRichText(html: string): string {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const output = document.createElement('div');
  for (const child of Array.from(parsed.body.childNodes)) {
    const safe = sanitizeNode(child);
    if (safe !== null) output.append(safe);
  }
  return output.innerHTML;
}

function sanitizeNode(node: Node): Node | null {
  if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent ?? '');
  if (!(node instanceof Element) || dangerousTags.has(node.tagName)) return null;
  if (!allowedTags.has(node.tagName)) {
    const fragment = document.createDocumentFragment();
    for (const child of Array.from(node.childNodes)) {
      const safe = sanitizeNode(child);
      if (safe !== null) fragment.append(safe);
    }
    return fragment;
  }

  const safeElement = document.createElement(node.tagName.toLowerCase());
  if (node.tagName === 'A') {
    const href = node.getAttribute('href');
    if (href !== null && isSafeLink(href)) {
      safeElement.setAttribute('href', href);
      safeElement.setAttribute('rel', 'noopener noreferrer');
    }
  }
  for (const child of Array.from(node.childNodes)) {
    const safe = sanitizeNode(child);
    if (safe !== null) safeElement.append(safe);
  }
  if (node.tagName === 'A' && !safeElement.hasAttribute('href')) {
    const fragment = document.createDocumentFragment();
    while (safeElement.firstChild !== null) fragment.append(safeElement.firstChild);
    return fragment;
  }
  return safeElement;
}

function isSafeLink(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'mailto:';
  } catch {
    return false;
  }
}

export function RichTextDisplay({ html }: { html: string }): React.JSX.Element {
  return (
    <div
      className="rich-text-content mt-1 semantic-text-secondary"
      dangerouslySetInnerHTML={{ __html: sanitizeRichText(html) }}
    />
  );
}

export function RichTextEditor({
  id,
  label,
  value,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}): React.JSX.Element {
  const editor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = editor.current;
    if (element === null) return;
    const safe = sanitizeRichText(value);
    if (element.innerHTML !== safe) element.innerHTML = safe;
  }, [value]);

  function format(command: string, argument?: string): void {
    const root = editor.current;
    if (root === null) return;
    root.focus();
    const range = getEditorRange(root);
    if (command === 'insertHTML' && argument !== undefined) {
      range.deleteContents();
      const fragment = range.createContextualFragment(argument);
      const lastNode = fragment.lastChild;
      range.insertNode(fragment);
      if (lastNode !== null) placeCaretAfter(lastNode);
    } else {
      const tagName =
        command === 'bold'
          ? 'strong'
          : command === 'italic'
            ? 'em'
            : command === 'underline'
              ? 'u'
              : command === 'insertUnorderedList'
                ? 'ul'
                : null;
      if (tagName === null) return;
      const wrapper = document.createElement(tagName);
      const content = range.extractContents();
      if (content.childNodes.length === 0) {
        const item = command === 'insertUnorderedList' ? document.createElement('li') : wrapper;
        item.append(document.createElement('br'));
        if (item !== wrapper) wrapper.append(item);
      } else if (command === 'insertUnorderedList') {
        const item = document.createElement('li');
        item.append(content);
        wrapper.append(item);
      } else {
        wrapper.append(content);
      }
      range.insertNode(wrapper);
      const selection = document.getSelection();
      const nextRange = document.createRange();
      if (command === 'insertUnorderedList') {
        nextRange.selectNodeContents(wrapper);
      } else if (wrapper.textContent === '') {
        nextRange.selectNodeContents(wrapper);
        nextRange.collapse(false);
      } else {
        nextRange.selectNodeContents(wrapper);
      }
      selection?.removeAllRanges();
      selection?.addRange(nextRange);
    }
    const html = sanitizeRichText(root.innerHTML);
    onChange(html);
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-2" role="toolbar" aria-label="Formatação do texto">
        <button
          className="rounded border semantic-border px-2 py-1"
          disabled={disabled}
          onClick={() => format('bold')}
          type="button"
          aria-label="Negrito"
        >
          <strong>N</strong>
        </button>
        <button
          className="rounded border semantic-border px-2 py-1"
          disabled={disabled}
          onClick={() => format('italic')}
          type="button"
          aria-label="Itálico"
        >
          <em>I</em>
        </button>
        <button
          className="rounded border semantic-border px-2 py-1"
          disabled={disabled}
          onClick={() => format('underline')}
          type="button"
          aria-label="Sublinhado"
        >
          <u>S</u>
        </button>
        <button
          className="rounded border semantic-border px-2 py-1"
          disabled={disabled}
          onClick={() => format('insertUnorderedList')}
          type="button"
        >
          Lista
        </button>
        <button
          className="rounded border semantic-border px-2 py-1"
          disabled={disabled}
          onClick={() =>
            format(
              'insertHTML',
              '<table><tbody><tr><td>&nbsp;</td><td>&nbsp;</td></tr><tr><td>&nbsp;</td><td>&nbsp;</td></tr></tbody></table><p><br></p>',
            )
          }
          type="button"
        >
          Inserir tabela
        </button>
      </div>
      <div
        aria-label={label}
        className="rich-text-editor min-h-36 w-full overflow-auto rounded-xl border semantic-border semantic-surface px-4 py-3 semantic-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 semantic-focus-outline"
        contentEditable={!disabled}
        id={id}
        onInput={(event) => onChange(sanitizeRichText(event.currentTarget.innerHTML))}
        role="textbox"
        aria-multiline="true"
        suppressContentEditableWarning
        ref={editor}
      />
    </div>
  );
}

function getEditorRange(root: HTMLElement): Range {
  const selection = document.getSelection();
  if (
    selection !== null &&
    selection.rangeCount > 0 &&
    root.contains(selection.getRangeAt(0).commonAncestorContainer)
  )
    return selection.getRangeAt(0);
  const range = document.createRange();
  range.selectNodeContents(root);
  range.collapse(false);
  return range;
}

function placeCaretAfter(node: Node): void {
  const selection = document.getSelection();
  const range = document.createRange();
  range.setStartAfter(node);
  range.collapse(true);
  selection?.removeAllRanges();
  selection?.addRange(range);
}
