export const phaseZeroChannels = {
  getStatus: 'app:get-status',
  writeTest: 'phase-zero:write-test',
  readTest: 'phase-zero:read-test',
  openDataDirectory: 'storage:open-data-directory',
} as const;

export const appearanceChannels = {
  getTheme: 'appearance:get-theme',
  setTheme: 'appearance:set-theme',
  themeChanged: 'appearance:theme-changed',
} as const;

export const diagnosticsChannels = {
  copyStartupDiagnostic: 'diagnostics:copy-startup',
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

export const imageImportChannels = {
  selectLocal: 'images:select',
  importBytes: 'images:import-bytes',
  importUrl: 'images:import-url',
  getCover: 'images:get-cover',
  getCoverPreview: 'images:get-cover-preview',
  setCover: 'images:set-cover',
  removeCover: 'images:remove-cover',
  deleteAttachment: 'images:delete-attachment',
  selectEntityReferenceLocal: 'images:select-entity-reference',
  importEntityReferenceBytes: 'images:import-entity-reference-bytes',
  importEntityReferenceUrl: 'images:import-entity-reference-url',
  getEntityReference: 'images:get-entity-reference',
  getEntityReferencePreview: 'images:get-entity-reference-preview',
  getEntityReferenceDisplay: 'images:get-entity-reference-display',
  setEntityReference: 'images:set-entity-reference',
  removeEntityReference: 'images:remove-entity-reference',
} as const;

export const imageFieldValueChannels = {
  selectLocal: 'image-field-values:select-local',
  importBytes: 'image-field-values:import-bytes',
  importUrl: 'image-field-values:import-url',
  list: 'image-field-values:list',
  getPreview: 'image-field-values:get-preview',
  getDisplay: 'image-field-values:get-display',
  update: 'image-field-values:update',
  remove: 'image-field-values:remove',
  move: 'image-field-values:move',
} as const;

export const entityTypeChannels = {
  create: 'entity-types:create',
  get: 'entity-types:get',
  list: 'entity-types:list',
  update: 'entity-types:update',
  archive: 'entity-types:archive',
  restore: 'entity-types:restore',
  move: 'entity-types:move',
} as const;

export const relationshipTypeChannels = {
  create: 'relationship-types:create',
  get: 'relationship-types:get',
  list: 'relationship-types:list',
  update: 'relationship-types:update',
  archive: 'relationship-types:archive',
  restore: 'relationship-types:restore',
  move: 'relationship-types:move',
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

export const relationshipViewChannels = {
  get: 'relationship-views:get',
  saveNodePosition: 'relationship-views:save-node-position',
  saveViewport: 'relationship-views:save-viewport',
  autoLayout: 'relationship-views:auto-layout',
  resetLayout: 'relationship-views:reset-layout',
} as const;

export const fieldDefinitionChannels = {
  create: 'field-definitions:create',
  get: 'field-definitions:get',
  list: 'field-definitions:list',
  update: 'field-definitions:update',
  archive: 'field-definitions:archive',
  restore: 'field-definitions:restore',
  move: 'field-definitions:move',
} as const;

export const entityChannels = {
  create: 'entities:create',
  get: 'entities:get',
  list: 'entities:list',
  update: 'entities:update',
  archive: 'entities:archive',
  restore: 'entities:restore',
} as const;

export const assertionChannels = {
  create: 'assertions:create',
  get: 'assertions:get',
  list: 'assertions:list',
  update: 'assertions:update',
  archive: 'assertions:archive',
  restore: 'assertions:restore',
} as const;

export const noteChannels = {
  create: 'notes:create',
  get: 'notes:get',
  list: 'notes:list',
  update: 'notes:update',
  archive: 'notes:archive',
  restore: 'notes:restore',
} as const;

export const inboxChannels = {
  capture: 'inbox:capture',
  get: 'inbox:get',
  list: 'inbox:list',
  beginReview: 'inbox:begin-review',
  dismiss: 'inbox:dismiss',
  archive: 'inbox:archive',
  restore: 'inbox:restore',
  convertToEntity: 'inbox:convert-to-entity',
  convertToRelationship: 'inbox:convert-to-relationship',
  convertToAssertion: 'inbox:convert-to-assertion',
  convertToNote: 'inbox:convert-to-note',
  convertToEvent: 'inbox:convert-to-event',
} as const;

export const eventChannels = {
  create: 'events:create',
  get: 'events:get',
  list: 'events:list',
  update: 'events:update',
  archive: 'events:archive',
  restore: 'events:restore',
} as const;

export const timelineChannels = {
  listCampaign: 'timeline:list-campaign',
  listEntity: 'timeline:list-entity',
} as const;

export const sessionChannels = {
  create: 'sessions:create',
  get: 'sessions:get',
  list: 'sessions:list',
  update: 'sessions:update',
} as const;

export const sessionParticipantChannels = {
  list: 'session-participants:list',
  replace: 'session-participants:replace',
} as const;

export const sessionIntentionChannels = {
  create: 'session-intentions:create',
  get: 'session-intentions:get',
  list: 'session-intentions:list',
  update: 'session-intentions:update',
} as const;
