export const maximumTechnicalKeyLength = 100;

export function createTechnicalKeyBase(groupName: string, fieldLabel: string): string {
  const group = normalizeTechnicalKeyPart(groupName, 'grupo');
  const field = normalizeTechnicalKeyPart(fieldLabel, 'campo');
  return joinTechnicalKeyParts(group, field, maximumTechnicalKeyLength);
}

export function createTechnicalKeyCandidate(baseKey: string, ordinal: number): string {
  if (!Number.isSafeInteger(ordinal) || ordinal < 1)
    throw new RangeError('A posicao da chave tecnica deve ser um inteiro positivo.');
  if (ordinal === 1) return trimTechnicalKey(baseKey, maximumTechnicalKeyLength);

  const suffix = `-${String(ordinal)}`;
  const prefix = trimTechnicalKeyPreservingEnds(baseKey, maximumTechnicalKeyLength - suffix.length);
  return `${prefix}${suffix}`;
}

export function normalizeTechnicalKeyPart(value: string, fallback: string): string {
  const normalized = value
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized === '' ? fallback : normalized;
}

function trimTechnicalKey(value: string, maximumLength: number): string {
  const trimmed = value.slice(0, maximumLength).replace(/-+$/g, '');
  return trimmed === '' ? 'chave'.slice(0, maximumLength) : trimmed;
}

function joinTechnicalKeyParts(group: string, field: string, maximumLength: number): string {
  const available = maximumLength - 1;
  if (group.length + field.length <= available) return `${group}-${field}`;

  let groupLength = Math.min(group.length, Math.floor(available / 2));
  let fieldLength = Math.min(field.length, available - groupLength);
  let remaining = available - groupLength - fieldLength;
  const extraGroup = Math.min(group.length - groupLength, remaining);
  groupLength += extraGroup;
  remaining -= extraGroup;
  fieldLength += Math.min(field.length - fieldLength, remaining);
  return `${group.slice(0, groupLength)}-${field.slice(0, fieldLength)}`;
}

function trimTechnicalKeyPreservingEnds(value: string, maximumLength: number): string {
  if (value.length <= maximumLength) return value;

  const available = maximumLength - 1;
  const prefixLength = Math.floor(available / 2);
  const suffixLength = available - prefixLength;
  const prefix = value.slice(0, prefixLength).replace(/-+$/g, '');
  const suffix = value.slice(-suffixLength).replace(/^-+/g, '');
  return trimTechnicalKey(`${prefix}-${suffix}`, maximumLength);
}
