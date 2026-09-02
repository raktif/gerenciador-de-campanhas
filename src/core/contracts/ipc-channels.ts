export const phaseZeroChannels = {
  getStatus: 'app:get-status',
  writeTest: 'phase-zero:write-test',
  readTest: 'phase-zero:read-test',
  openDataDirectory: 'storage:open-data-directory',
} as const;

export const campaignChannels = {
  create: 'campaigns:create',
  get: 'campaigns:get',
  list: 'campaigns:list',
  update: 'campaigns:update',
  archive: 'campaigns:archive',
  restore: 'campaigns:restore',
  moveToTrash: 'campaigns:move-to-trash',
} as const;

export const entityTypeChannels = {
  create: 'entity-types:create',
  get: 'entity-types:get',
  list: 'entity-types:list',
  update: 'entity-types:update',
  archive: 'entity-types:archive',
  restore: 'entity-types:restore',
} as const;

export const relationshipTypeChannels = {
  create: 'relationship-types:create',
  get: 'relationship-types:get',
  list: 'relationship-types:list',
  update: 'relationship-types:update',
  archive: 'relationship-types:archive',
  restore: 'relationship-types:restore',
} as const;

export const relationshipChannels = {
  create: 'relationships:create',
  get: 'relationships:get',
  list: 'relationships:list',
  update: 'relationships:update',
  archive: 'relationships:archive',
  restore: 'relationships:restore',
  neighborhood: 'relationships:neighborhood',
} as const;

export const fieldDefinitionChannels = {
  create: 'field-definitions:create',
  get: 'field-definitions:get',
  list: 'field-definitions:list',
  update: 'field-definitions:update',
  archive: 'field-definitions:archive',
  restore: 'field-definitions:restore',
} as const;

export const entityChannels = {
  create: 'entities:create',
  get: 'entities:get',
  list: 'entities:list',
  update: 'entities:update',
  archive: 'entities:archive',
  restore: 'entities:restore',
} as const;
