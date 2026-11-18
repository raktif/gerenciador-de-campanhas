import { useEffect, useRef, useState } from 'react';

const allowedTags = new Set([
  'P',
  'DIV',
  'BR',
  'STRONG',
  'B',
  'EM',
  'I',
  'U',
  'S',
  'SUP',
  'SUB',
  'SPAN',
  'HR',
  'UL',
  'OL',
  'LI',
  'H1',
  'H2',
  'H3',
  'BLOCKQUOTE',
  'PRE',
  'CODE',
  'IMG',
  'TABLE',
  'THEAD',
  'TBODY',
  'TR',
  'TH',
  'TD',
]);
const dangerousTags = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH']);
const alignedTags = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'BLOCKQUOTE']);
const textAlignments = new Set(['left', 'center', 'right', 'justify']);
const allowedFontSizes = new Set(['12px', '14px', '16px', '18px', '24px', '32px']);
const textColors = [
  { label: 'Preto', value: '#000000' },
  { label: 'Branco', value: '#ffffff' },
  { label: 'Vinho', value: '#7f1d1d' },
  { label: 'Vermelho', value: '#b91c1c' },
  { label: 'Laranja', value: '#c2410c' },
  { label: 'Ocre', value: '#a16207' },
  { label: 'Verde', value: '#15803d' },
  { label: 'Turquesa', value: '#0f766e' },
  { label: 'Azul', value: '#1d4ed8' },
  { label: 'Roxo', value: '#6d28d9' },
];
const highlightColors = [
  { label: 'Branco', value: '#ffffff' },
  { label: 'Amarelo', value: '#fef08a' },
  { label: 'Verde', value: '#bbf7d0' },
  { label: 'Azul', value: '#bfdbfe' },
  { label: 'Vermelho', value: '#fecaca' },
];
const allowedTextColors = new Set(
  textColors.flatMap(({ value }) => [value, normalizeHexColor(value)]),
);
const allowedHighlights = new Set(
  highlightColors.flatMap(({ value }) => [value, normalizeHexColor(value)]),
);
const maximumImageBytes = 1024 * 1024;
const maximumImageDataUrlLength = 1_400_000;

interface TableCellLocation {
  tableIndex: number;
  rowIndex: number;
  cellIndex: number;
}

export function sanitizeRichText(html: string): string {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const output = document.createElement('div');
  for (const child of Array.from(parsed.body.childNodes)) {
    const safe = sanitizeNode(child);
    if (safe !== null) output.append(safe);
  }
  return output.innerHTML;
}

function matchingInlineTags(tagName: string): string[] {
  if (tagName === 'strong') return ['strong', 'b'];
  if (tagName === 'em') return ['em', 'i'];
  return [tagName];
}

function normalizeHexColor(value: string): string {
  const channels = [1, 3, 5].map((start) => Number.parseInt(value.slice(start, start + 2), 16));
  return `rgb(${channels.join(', ')})`;
}

function hasAncestorTag(node: Node, tagName: string): boolean {
  const tags = matchingInlineTags(tagName);
  let current = node.parentElement;
  while (current !== null) {
    if (tags.includes(current.tagName.toLowerCase())) return true;
    current = current.parentElement;
  }
  return false;
}

function unwrapTagElements(root: ParentNode, tagName: string): void {
  const selector = matchingInlineTags(tagName).join(',');
  unwrapElements(root, selector);
}

function unwrapFormatting(root: ParentNode): void {
  unwrapElements(root, 'strong,b,em,i,u,s,sup,sub,span,code');
}

function unwrapElements(root: ParentNode, selector: string): void {
  const elements = [
    ...(root instanceof Element && root.matches(selector) ? [root] : []),
    ...Array.from(root.querySelectorAll(selector)),
  ];
  for (const element of elements) {
    const parent = element.parentNode;
    if (parent === null) continue;
    while (element.firstChild !== null) parent.insertBefore(element.firstChild, element);
    element.remove();
  }
}

function isSafeEmbeddedImage(value: string): boolean {
  return (
    value.length <= maximumImageDataUrlLength &&
    /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/u.test(value)
  );
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
  if (node.tagName === 'IMG') {
    const source = node.getAttribute('src');
    if (source === null || !isSafeEmbeddedImage(source)) return null;
    safeElement.setAttribute('src', source);
    safeElement.setAttribute('alt', (node.getAttribute('alt') ?? '').slice(0, 200));
  }
  if (node instanceof HTMLElement && alignedTags.has(node.tagName)) {
    const alignment = node.style.textAlign;
    if (textAlignments.has(alignment)) safeElement.style.textAlign = alignment;
  }
  if (node instanceof HTMLElement && node.tagName === 'SPAN') {
    const color = node.style.color.toLowerCase();
    const backgroundColor = node.style.backgroundColor.toLowerCase();
    const fontSize = node.style.fontSize.toLowerCase();
    if (allowedTextColors.has(color)) safeElement.style.color = color;
    if (allowedHighlights.has(backgroundColor)) safeElement.style.backgroundColor = backgroundColor;
    if (allowedFontSizes.has(fontSize)) safeElement.style.fontSize = fontSize;
  }
  for (const child of Array.from(node.childNodes)) {
    const safe = sanitizeNode(child);
    if (safe !== null) safeElement.append(safe);
  }
  return safeElement;
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
  const imageInput = useRef<HTMLInputElement>(null);
  const savedRange = useRef<Range | null>(null);
  const activeTableCell = useRef<TableCellLocation | null>(null);
  const history = useRef<{ entries: string[]; index: number }>({ entries: [], index: -1 });
  const [tableCellActive, setTableCellActive] = useState(false);
  const [historyPosition, setHistoryPosition] = useState({ canUndo: false, canRedo: false });
  const [textCount, setTextCount] = useState({ words: 0, characters: 0 });
  const [imageError, setImageError] = useState('');

  useEffect(() => {
    const element = editor.current;
    if (element === null) return;
    const safe = sanitizeRichText(value);
    if (element.innerHTML !== safe) element.innerHTML = safe;
    const currentHistory = history.current;
    if (currentHistory.entries[currentHistory.index] !== safe) {
      currentHistory.entries = [safe];
      currentHistory.index = 0;
      setHistoryPosition({ canUndo: false, canRedo: false });
    }
    updateTextCount(element);
  }, [value]);

  function format(tagName: string): void {
    const root = editor.current;
    if (root === null) return;
    root.focus();
    const range = getActiveRange(root);
    if (['strong', 'em', 'u', 's'].includes(tagName)) {
      toggleInlineFormat(root, range, tagName);
      return;
    }
    if (['p', 'h1', 'h2', 'h3', 'blockquote'].includes(tagName)) {
      const start = range.startContainer;
      const block = (start instanceof Element ? start : start.parentElement)?.closest(
        'p, div, h1, h2, h3, blockquote',
      );
      const replacement = document.createElement(tagName);
      if (block instanceof HTMLElement && block !== root && root.contains(block)) {
        replacement.style.textAlign = block.style.textAlign;
        while (block.firstChild !== null) replacement.append(block.firstChild);
        block.replaceWith(replacement);
      } else {
        const content = range.extractContents();
        if (content.childNodes.length === 0) replacement.append(document.createElement('br'));
        else replacement.append(content);
        range.insertNode(replacement);
      }
      commitEditorChange(root);
      return;
    }
    if (tagName === 'table') {
      range.deleteContents();
      const fragment = range.createContextualFragment(
        '<table><tbody><tr><td>&nbsp;</td><td>&nbsp;</td></tr><tr><td>&nbsp;</td><td>&nbsp;</td></tr></tbody></table><p><br></p>',
      );
      const firstCell = fragment.querySelector('td');
      range.insertNode(fragment);
      if (firstCell !== null) {
        placeCaretInTableCell(firstCell);
        updateActiveTableCell(root, firstCell);
      }
    } else if (tagName === 'hr') {
      range.deleteContents();
      const rule = document.createElement('hr');
      range.insertNode(rule);
      placeCaretAfter(rule);
    } else {
      const wrapper = document.createElement(tagName);
      const content = range.extractContents();
      if (content.childNodes.length === 0) {
        const item = tagName === 'ul' || tagName === 'ol' ? document.createElement('li') : wrapper;
        item.append(document.createElement('br'));
        if (item !== wrapper) wrapper.append(item);
      } else if (tagName === 'ul' || tagName === 'ol') {
        const item = document.createElement('li');
        item.append(content);
        wrapper.append(item);
      } else {
        wrapper.append(content);
      }
      range.insertNode(wrapper);
      const selection = document.getSelection();
      const nextRange = document.createRange();
      if (tagName === 'ul' || tagName === 'ol') {
        nextRange.selectNodeContents(wrapper);
      } else if (wrapper.textContent === '') {
        nextRange.selectNodeContents(wrapper);
        nextRange.collapse(false);
      } else {
        nextRange.selectNodeContents(wrapper);
      }
      selection?.removeAllRanges();
      selection?.addRange(nextRange);
      savedRange.current = nextRange.cloneRange();
    }
    commitEditorChange(root);
  }

  function toggleInlineFormat(root: HTMLElement, range: Range, tagName: string): void {
    if (range.collapsed) {
      const wrapper = document.createElement(tagName);
      wrapper.append(document.createElement('br'));
      range.insertNode(wrapper);
      const nextRange = document.createRange();
      nextRange.selectNodeContents(wrapper);
      nextRange.collapse(false);
      setEditorSelection(nextRange);
      savedRange.current = nextRange.cloneRange();
      commitEditorChange(root);
      return;
    }

    const fragment = range.extractContents();
    const textNodes: Text[] = [];
    const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      if (walker.currentNode instanceof Text && walker.currentNode.textContent !== '')
        textNodes.push(walker.currentNode);
    }
    const alreadyFormatted =
      textNodes.length > 0 && textNodes.every((textNode) => hasAncestorTag(textNode, tagName));
    unwrapTagElements(fragment, tagName);
    let inserted: Node = fragment;
    let firstInsertedNode = fragment.firstChild;
    let lastInsertedNode = fragment.lastChild;
    if (!alreadyFormatted) {
      const wrapper = document.createElement(tagName);
      wrapper.append(fragment);
      inserted = wrapper;
      firstInsertedNode = wrapper;
      lastInsertedNode = wrapper;
    }
    if (firstInsertedNode === null || lastInsertedNode === null) return;
    range.insertNode(inserted);
    const nextRange = document.createRange();
    nextRange.setStartBefore(firstInsertedNode);
    nextRange.setEndAfter(lastInsertedNode);
    setEditorSelection(nextRange);
    savedRange.current = nextRange.cloneRange();
    commitEditorChange(root);
  }

  function setEditorSelection(range: Range): void {
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  function commitEditorChange(root: HTMLElement): void {
    const html = sanitizeRichText(root.innerHTML);
    const currentHistory = history.current;
    if (currentHistory.entries[currentHistory.index] !== html) {
      currentHistory.entries = currentHistory.entries.slice(0, currentHistory.index + 1);
      currentHistory.entries.push(html);
      if (currentHistory.entries.length > 100) currentHistory.entries.shift();
      currentHistory.index = currentHistory.entries.length - 1;
      setHistoryPosition({
        canUndo: currentHistory.index > 0,
        canRedo: false,
      });
    }
    updateTextCount(root);
    onChange(html);
  }

  function moveHistory(direction: -1 | 1): void {
    const root = editor.current;
    const nextIndex = history.current.index + direction;
    if (root === null || nextIndex < 0 || nextIndex >= history.current.entries.length) return;
    const nextHtml = history.current.entries[nextIndex];
    if (nextHtml === undefined) return;
    history.current.index = nextIndex;
    root.innerHTML = nextHtml;
    const firstCell = root.querySelector('td, th');
    if (firstCell instanceof HTMLTableCellElement) {
      root.focus();
      placeCaretInTableCell(firstCell);
      updateActiveTableCell(root, firstCell);
    } else {
      placeCaretAtEnd(root);
      updateTableCellContext();
    }
    updateTextCount(root);
    setHistoryPosition({
      canUndo: nextIndex > 0,
      canRedo: nextIndex < history.current.entries.length - 1,
    });
    onChange(nextHtml);
  }

  function updateTextCount(root: HTMLElement): void {
    const text = root.innerText.trim();
    setTextCount({
      words: text === '' ? 0 : text.split(/\s+/u).length,
      characters: Array.from(text).length,
    });
  }

  function addTableRow(): void {
    const root = editor.current;
    if (root === null) return;
    const cell = resolveActiveTableCell(root, activeTableCell.current);
    if (cell === null) return;
    const row = cell.parentElement;
    const table = cell.closest('table');
    if (!(row instanceof HTMLTableRowElement) || !(table instanceof HTMLTableElement)) return;
    const columnCount = Math.max(...Array.from(table.rows, (tableRow) => tableRow.cells.length));
    const newRow = document.createElement('tr');
    for (let column = 0; column < columnCount; column += 1) {
      const newCell = document.createElement(cell.tagName.toLowerCase());
      newCell.append(document.createElement('br'));
      newRow.append(newCell);
    }
    row.parentElement?.insertBefore(newRow, row.nextSibling);
    const firstCell = newRow.cells.item(0);
    if (firstCell !== null) {
      root.focus();
      placeCaretInTableCell(firstCell);
      updateActiveTableCell(root, firstCell);
    }
    commitEditorChange(root);
  }

  function addTableColumn(): void {
    const root = editor.current;
    if (root === null) return;
    const cell = resolveActiveTableCell(root, activeTableCell.current);
    if (cell === null) return;
    const table = cell.closest('table');
    if (!(table instanceof HTMLTableElement)) return;
    const currentRow = cell.parentElement;
    let insertedCell: HTMLTableCellElement | null = null;
    for (const row of Array.from(table.rows)) {
      const newCell = document.createElement(row.cells[0]?.tagName === 'TH' ? 'th' : 'td');
      newCell.append(document.createElement('br'));
      const nextCell = row.cells[cell.cellIndex + 1] ?? null;
      row.insertBefore(newCell, nextCell);
      if (row === currentRow) insertedCell = newCell;
    }
    if (insertedCell === null) return;
    root.focus();
    placeCaretInTableCell(insertedCell);
    updateActiveTableCell(root, insertedCell);
    commitEditorChange(root);
  }

  function applyFontSize(size: string): void {
    if (!allowedFontSizes.has(size)) return;
    const root = editor.current;
    if (root === null) return;
    root.focus();
    const range = getActiveRange(root);
    const span = document.createElement('span');
    span.style.fontSize = size;
    const content = range.extractContents();
    if (content.childNodes.length === 0) span.append(document.createElement('br'));
    else span.append(content);
    range.insertNode(span);
    const nextRange = document.createRange();
    nextRange.selectNodeContents(span);
    setEditorSelection(nextRange);
    savedRange.current = nextRange.cloneRange();
    commitEditorChange(root);
  }

  function updateTableCellContext(): void {
    const root = editor.current;
    const cell = root === null ? null : getCurrentTableCell(root);
    if (root !== null && cell !== null) updateActiveTableCell(root, cell);
    else {
      activeTableCell.current = null;
      setTableCellActive(false);
    }
  }

  function updateActiveTableCell(root: HTMLElement, cell: HTMLTableCellElement): void {
    const location = getTableCellLocation(root, cell);
    activeTableCell.current = location;
    setTableCellActive(location !== null);
  }

  function openImagePicker(): void {
    const root = editor.current;
    if (root === null) return;
    savedRange.current = getEditorRange(root).cloneRange();
    imageInput.current?.click();
  }

  function insertImageFile(file: File): void {
    if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.type)) {
      setImageError('Escolha uma imagem PNG, JPEG, GIF ou WebP.');
      return;
    }
    if (file.size > maximumImageBytes) {
      setImageError('A imagem deve ter no máximo 1 MB.');
      return;
    }
    const reader = new FileReader();
    reader.addEventListener(
      'error',
      () => setImageError('Não foi possível ler o arquivo de imagem.'),
      { once: true },
    );
    reader.addEventListener(
      'load',
      () => {
        const root = editor.current;
        const range = savedRange.current;
        if (
          root === null ||
          range === null ||
          !root.contains(range.commonAncestorContainer) ||
          typeof reader.result !== 'string' ||
          !isSafeEmbeddedImage(reader.result)
        ) {
          setImageError('Não foi possível inserir esta imagem.');
          return;
        }
        const image = document.createElement('img');
        image.src = reader.result;
        image.alt = file.name.slice(0, 200);
        range.deleteContents();
        range.insertNode(image);
        placeCaretAfter(image);
        savedRange.current = null;
        setImageError('');
        commitEditorChange(root);
      },
      { once: true },
    );
    reader.readAsDataURL(file);
  }

  function alignText(alignment: 'left' | 'center' | 'right' | 'justify'): void {
    const root = editor.current;
    if (root === null) return;
    root.focus();
    const range = getActiveRange(root);
    const start = range.startContainer;
    const block = (start instanceof Element ? start : start.parentElement)?.closest(
      'p, div, h1, h2, h3, blockquote',
    );
    if (block instanceof HTMLElement && block !== root && root.contains(block)) {
      block.style.textAlign = alignment;
    } else {
      const paragraph = document.createElement('p');
      paragraph.style.textAlign = alignment;
      const contents = range.extractContents();
      paragraph.append(contents.childNodes.length === 0 ? document.createElement('br') : contents);
      range.insertNode(paragraph);
    }
    commitEditorChange(root);
  }

  function applyColor(property: 'color' | 'backgroundColor', value: string): void {
    const allowed = property === 'color' ? allowedTextColors : allowedHighlights;
    if (!allowed.has(value)) return;
    const root = editor.current;
    if (root === null) return;
    root.focus();
    const range = getActiveRange(root);
    const span = document.createElement('span');
    span.style[property] = value;
    const content = range.extractContents();
    if (content.childNodes.length === 0) span.append(document.createElement('br'));
    else span.append(content);
    range.insertNode(span);
    commitEditorChange(root);
  }

  function clearFormatting(): void {
    const root = editor.current;
    if (root === null) return;
    root.focus();
    const range = getActiveRange(root);
    const fragment = range.extractContents();
    unwrapFormatting(fragment);
    const firstInsertedNode = fragment.firstChild;
    const lastInsertedNode = fragment.lastChild;
    if (firstInsertedNode === null || lastInsertedNode === null) return;
    range.insertNode(fragment);
    const nextRange = document.createRange();
    nextRange.setStartBefore(firstInsertedNode);
    nextRange.setEndAfter(lastInsertedNode);
    setEditorSelection(nextRange);
    savedRange.current = nextRange.cloneRange();
    commitEditorChange(root);
  }

  function alignSelection(alignment: string): void {
    if (
      alignment === 'left' ||
      alignment === 'center' ||
      alignment === 'right' ||
      alignment === 'justify'
    )
      alignText(alignment);
  }

  function saveEditorRange(): void {
    const root = editor.current;
    if (root !== null) savedRange.current = getEditorRange(root).cloneRange();
  }

  function getActiveRange(root: HTMLElement): Range {
    const range = savedRange.current;
    savedRange.current = null;
    return range !== null && root.contains(range.commonAncestorContainer)
      ? range
      : getEditorRange(root);
  }

  return (
    <div className="grid gap-2">
      <div
        className="rich-text-toolbar flex flex-wrap items-center gap-1"
        role="toolbar"
        aria-label="Formatação do texto"
        onMouseDownCapture={saveEditorRange}
      >
        <label className="sr-only" htmlFor={`${id}-block-format`}>
          Estilo do parágrafo
        </label>
        <select
          className="rich-text-toolbar-select"
          disabled={disabled}
          id={`${id}-block-format`}
          title="Escolher estilo do parágrafo"
          onChange={(event) => {
            if (event.target.value !== '') format(event.target.value);
            event.target.value = '';
          }}
          onMouseDown={saveEditorRange}
          defaultValue=""
        >
          <option value="">Estilo</option>
          <option value="p">Parágrafo</option>
          <option value="h1">Título 1</option>
          <option value="h2">Título 2</option>
          <option value="h3">Título 3</option>
          <option value="blockquote">Citação</option>
        </select>
        <ToolbarButton disabled={disabled} onClick={() => format('strong')} label="Negrito">
          <strong>B</strong>
        </ToolbarButton>
        <ToolbarButton disabled={disabled} onClick={() => format('em')} label="Itálico">
          <em>I</em>
        </ToolbarButton>
        <ToolbarButton disabled={disabled} onClick={() => format('u')} label="Sublinhado">
          <u>U</u>
        </ToolbarButton>
        <ToolbarButton disabled={disabled} onClick={() => format('s')} label="Tachado">
          <s>S</s>
        </ToolbarButton>
        <label className="sr-only" htmlFor={`${id}-font-size`}>
          Tamanho da fonte
        </label>
        <select
          className="rich-text-toolbar-select"
          disabled={disabled}
          id={`${id}-font-size`}
          onChange={(event) => {
            applyFontSize(event.target.value);
            event.target.value = '';
          }}
          onMouseDown={saveEditorRange}
          title="Tamanho da fonte"
          defaultValue=""
        >
          <option value="">Tamanho</option>
          {[...allowedFontSizes].map((size) => (
            <option key={size} value={size}>
              {size.replace('px', '')}
            </option>
          ))}
        </select>
        <label className="rich-text-color-control" title="Cor do texto">
          <span aria-hidden="true">A</span>
          <select
            aria-label="Cor do texto"
            disabled={disabled}
            onChange={(event) => {
              applyColor('color', event.target.value);
              event.target.value = '';
            }}
            onMouseDown={saveEditorRange}
            title="Cor do texto"
            defaultValue=""
          >
            <option value="" disabled>
              Cor do texto
            </option>
            {textColors.map(({ label: colorLabel, value: color }) => (
              <option key={color} value={color}>
                {colorLabel}
              </option>
            ))}
          </select>
        </label>
        <label className="rich-text-color-control" title="Cor de destaque">
          <span aria-hidden="true">▰</span>
          <select
            aria-label="Cor de destaque"
            disabled={disabled}
            onChange={(event) => {
              applyColor('backgroundColor', event.target.value);
              event.target.value = '';
            }}
            onMouseDown={saveEditorRange}
            title="Cor de destaque"
            defaultValue=""
          >
            <option value="" disabled>
              Destaque
            </option>
            {highlightColors.map(({ label: colorLabel, value: color }) => (
              <option key={color} value={color}>
                {colorLabel}
              </option>
            ))}
          </select>
        </label>
        <ToolbarButton disabled={disabled} onClick={clearFormatting} label="Limpar formatação">
          Tx
        </ToolbarButton>
        <ToolbarButton disabled={disabled} onClick={() => format('sup')} label="Sobrescrito">
          x²
        </ToolbarButton>
        <ToolbarButton disabled={disabled} onClick={() => format('sub')} label="Subscrito">
          x₂
        </ToolbarButton>
        <label className="sr-only" htmlFor={`${id}-text-align`}>
          Alinhamento do texto
        </label>
        <select
          className="rich-text-toolbar-select"
          disabled={disabled}
          id={`${id}-text-align`}
          title="Alinhamento do texto"
          onChange={(event) => {
            alignSelection(event.target.value);
            event.target.value = '';
          }}
          onMouseDown={saveEditorRange}
          defaultValue=""
        >
          <option value="">Alinhar</option>
          <option value="left">Esquerda</option>
          <option value="center">Centralizar</option>
          <option value="right">Direita</option>
          <option value="justify">Justificar</option>
        </select>
        <ToolbarButton disabled={disabled} onClick={() => format('ol')} label="Lista numerada">
          1.
        </ToolbarButton>
        <ToolbarButton
          disabled={disabled}
          onClick={() => format('ul')}
          label="Lista com marcadores"
        >
          •
        </ToolbarButton>
        <ToolbarButton
          disabled={disabled}
          onClick={openImagePicker}
          onMouseDown={saveEditorRange}
          label="Inserir imagem"
        >
          ▧
        </ToolbarButton>
        <ToolbarButton
          disabled={disabled}
          onClick={() => format('hr')}
          label="Inserir linha horizontal"
        >
          —
        </ToolbarButton>
        <ToolbarButton disabled={disabled} onClick={() => format('table')} label="Inserir tabela">
          ▦
        </ToolbarButton>
        <ToolbarButton
          disabled={disabled || !tableCellActive}
          onClick={addTableRow}
          onMouseDown={saveEditorRange}
          label="Adicionar linha abaixo"
        >
          + Linha
        </ToolbarButton>
        <ToolbarButton
          disabled={disabled || !tableCellActive}
          onClick={addTableColumn}
          onMouseDown={saveEditorRange}
          label="Adicionar coluna à direita"
        >
          + Coluna
        </ToolbarButton>
        <ToolbarButton
          disabled={disabled || !historyPosition.canUndo}
          onClick={() => moveHistory(-1)}
          label="Desfazer"
        >
          ↶
        </ToolbarButton>
        <ToolbarButton
          disabled={disabled || !historyPosition.canRedo}
          onClick={() => moveHistory(1)}
          label="Refazer"
        >
          ↷
        </ToolbarButton>
      </div>
      <div
        aria-label={label}
        className="rich-text-editor min-h-56 w-full overflow-auto rounded-b-xl border semantic-border semantic-surface px-4 py-3 semantic-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 semantic-focus-outline"
        contentEditable={!disabled}
        data-placeholder="Digite seu texto..."
        id={id}
        onClick={updateTableCellContext}
        onMouseUp={saveEditorRange}
        onInput={(event) => commitEditorChange(event.currentTarget)}
        onKeyUp={updateTableCellContext}
        role="textbox"
        aria-multiline="true"
        suppressContentEditableWarning
        ref={editor}
      />
      <input
        accept="image/png,image/jpeg,image/gif,image/webp"
        aria-label="Inserir imagem"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file !== undefined) insertImageFile(file);
        }}
        ref={imageInput}
        type="file"
      />
      {imageError === '' ? null : (
        <p className="text-sm text-red-700" role="alert">
          {imageError}
        </p>
      )}
      <div className="flex justify-end gap-3 text-xs semantic-text-secondary" aria-live="polite">
        <span>Palavras: {textCount.words}</span>
        <span>Caracteres: {textCount.characters}</span>
      </div>
    </div>
  );
}

function ToolbarButton({
  children,
  disabled,
  label,
  onClick,
  onMouseDown,
}: {
  children: React.ReactNode;
  disabled: boolean;
  label: string;
  onClick: () => void;
  onMouseDown?: () => void;
}): React.JSX.Element {
  return (
    <button
      aria-label={label}
      className="rich-text-toolbar-button"
      disabled={disabled}
      onClick={onClick}
      onMouseDown={(event) => {
        event.preventDefault();
        onMouseDown?.();
      }}
      title={label}
      type="button"
    >
      {children}
    </button>
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

function placeCaretAtEnd(root: HTMLElement): void {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.collapse(false);
  const selection = document.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function getCurrentTableCell(root: HTMLElement): HTMLTableCellElement | null {
  const selection = document.getSelection();
  if (selection === null || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;
  const container =
    range.startContainer instanceof Element
      ? range.startContainer
      : range.startContainer.parentElement;
  const cell = container?.closest('td, th');
  return cell instanceof HTMLTableCellElement && root.contains(cell) ? cell : null;
}

function getTableCellLocation(
  root: HTMLElement,
  cell: HTMLTableCellElement,
): TableCellLocation | null {
  const table = cell.closest('table');
  const row = cell.parentElement;
  if (!(table instanceof HTMLTableElement) || !(row instanceof HTMLTableRowElement)) return null;
  const tableIndex = Array.from(root.querySelectorAll('table')).indexOf(table);
  const rowIndex = Array.from(table.rows).indexOf(row);
  if (tableIndex < 0 || rowIndex < 0) return null;
  return { tableIndex, rowIndex, cellIndex: cell.cellIndex };
}

function resolveActiveTableCell(
  root: HTMLElement,
  location: TableCellLocation | null,
): HTMLTableCellElement | null {
  if (location === null) return null;
  const table = Array.from(root.querySelectorAll('table'))[location.tableIndex];
  const row = table === undefined ? undefined : Array.from(table.rows)[location.rowIndex];
  return row?.cells[location.cellIndex] ?? null;
}

function placeCaretInTableCell(cell: HTMLTableCellElement): void {
  const range = document.createRange();
  range.selectNodeContents(cell);
  range.collapse(true);
  const selection = document.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}
