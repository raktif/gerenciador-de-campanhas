CREATE TABLE demands (
  id TEXT PRIMARY KEY NOT NULL,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE RESTRICT,
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 200),
  need TEXT NOT NULL CHECK(length(CAST(trim(need) AS BLOB)) > 0),
  summary TEXT NOT NULL DEFAULT '',
  obstacle TEXT NOT NULL DEFAULT '',
  risks TEXT NOT NULL DEFAULT '',
  urgency TEXT NOT NULL CHECK(urgency IN ('low','medium','high','critical')),
  requester_entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK(status IN ('available','active','resolved','failed','ignored','archived')),
  status_before_archive TEXT CHECK(status_before_archive IN ('available','active','resolved','failed','ignored')),
  parent_id TEXT REFERENCES demands(id) ON DELETE RESTRICT,
  accepted_signal_id TEXT UNIQUE REFERENCES campaign_signals(id) ON DELETE RESTRICT,
  lineage_signal_id TEXT NOT NULL REFERENCES campaign_signals(id) ON DELETE RESTRICT,
  source_entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
  source_field_definition_id TEXT NOT NULL REFERENCES field_definitions(id) ON DELETE RESTRICT,
  source_field_value_id TEXT NOT NULL REFERENCES field_values(id) ON DELETE RESTRICT,
  source_id TEXT NOT NULL UNIQUE REFERENCES sources(id) ON DELETE RESTRICT,
  source_snapshot TEXT NOT NULL CHECK(json_valid(source_snapshot)),
  generated_event_id TEXT UNIQUE REFERENCES events(id) ON DELETE RESTRICT,
  canon_state TEXT NOT NULL DEFAULT 'draft' CHECK(canon_state = 'draft'),
  knowledge_state TEXT NOT NULL DEFAULT 'possibility' CHECK(knowledge_state = 'possibility'),
  visibility TEXT NOT NULL DEFAULT 'gm' CHECK(visibility = 'gm'),
  origin_kind TEXT NOT NULL DEFAULT 'generator' CHECK(origin_kind = 'generator'),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(typeof(revision)='integer' AND revision BETWEEN 1 AND 9007199254740991),
  CHECK((status = 'archived') = (status_before_archive IS NOT NULL)),
  CHECK((status = 'resolved' OR (status = 'archived' AND status_before_archive = 'resolved')) = (generated_event_id IS NOT NULL)),
  CHECK((parent_id IS NULL) = (accepted_signal_id IS NOT NULL))
);
CREATE INDEX demands_campaign_status ON demands(campaign_id,status,created_at,id);
CREATE INDEX demands_parent ON demands(parent_id);
CREATE INDEX demands_need_source ON demands(source_field_value_id);
CREATE TABLE demand_entity_links (
  demand_id TEXT NOT NULL REFERENCES demands(id) ON DELETE RESTRICT,
  entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
  role TEXT NOT NULL CHECK(role IN ('requester','affected','location','opposition','resource','clue','hidden_connection','beneficiary','related')),
  PRIMARY KEY(demand_id,entity_id,role)
);
CREATE TABLE demand_clock_links (
  demand_id TEXT NOT NULL REFERENCES demands(id) ON DELETE RESTRICT,
  clock_id TEXT NOT NULL REFERENCES clocks(id) ON DELETE RESTRICT,
  PRIMARY KEY(demand_id,clock_id)
);
CREATE TABLE demand_session_links (
  demand_id TEXT NOT NULL REFERENCES demands(id) ON DELETE RESTRICT,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE RESTRICT,
  PRIMARY KEY(demand_id,session_id)
);
CREATE TABLE demand_transform_operations (
  id TEXT PRIMARY KEY NOT NULL,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE RESTRICT,
  payload TEXT NOT NULL,
  child_id TEXT NOT NULL UNIQUE REFERENCES demands(id) ON DELETE RESTRICT
);
CREATE TRIGGER demands_insert_guard BEFORE INSERT ON demands BEGIN
  SELECT CASE WHEN EXISTS(SELECT 1 FROM demands WHERE id=NEW.id OR source_id=NEW.source_id OR (accepted_signal_id IS NOT NULL AND accepted_signal_id=NEW.accepted_signal_id))
    THEN RAISE(ABORT,'DEMAND_IMMUTABLE') END;
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM campaigns WHERE id=NEW.campaign_id AND status='active')
    THEN RAISE(ABORT,'INVALID_CAMPAIGN_STATE') END;
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM field_values v JOIN field_definitions f ON f.id=v.field_definition_id
    JOIN entities e ON e.id=v.entity_id JOIN entity_types t ON t.id=e.entity_type_id
    JOIN campaign_signals s ON s.id=NEW.lineage_signal_id
    JOIN sources src ON src.id=NEW.source_id
    WHERE v.id=NEW.source_field_value_id AND v.entity_id=NEW.source_entity_id
    AND v.field_definition_id=NEW.source_field_definition_id AND e.campaign_id=NEW.campaign_id
    AND f.entity_type_id=e.entity_type_id AND f.semantic_role='need'
    AND f.data_type IN ('short_text','long_text') AND src.kind='generator'
    AND s.campaign_id=NEW.campaign_id AND s.signal_type='explicit_need'
    AND (NEW.parent_id IS NOT NULL OR (s.id=NEW.accepted_signal_id AND s.status IN ('new','viewed')
      AND e.archived_at IS NULL AND f.is_archived=0 AND t.is_archived=0))
  ) THEN RAISE(ABORT,'DEMAND_SOURCE_INVALID') END;
  SELECT CASE WHEN NEW.parent_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM demands p WHERE p.id=NEW.parent_id AND p.campaign_id=NEW.campaign_id
    AND p.status IN ('available','active') AND p.lineage_signal_id=NEW.lineage_signal_id
    AND p.source_field_value_id=NEW.source_field_value_id
  ) THEN RAISE(ABORT,'DEMAND_SOURCE_INVALID') END;
  SELECT CASE WHEN NEW.status<>'available' OR NOT EXISTS(
    SELECT 1 FROM entities WHERE id=NEW.requester_entity_id AND campaign_id=NEW.campaign_id AND archived_at IS NULL
  ) THEN RAISE(ABORT,'DEMAND_LINK_INVALID') END;
END;
CREATE TRIGGER demands_requester_insert AFTER INSERT ON demands BEGIN
  INSERT INTO demand_entity_links VALUES(NEW.id,NEW.requester_entity_id,'requester');
END;
CREATE TRIGGER demands_requester_update AFTER UPDATE OF requester_entity_id ON demands
WHEN NEW.requester_entity_id<>OLD.requester_entity_id BEGIN
  DELETE FROM demand_entity_links WHERE demand_id=NEW.id AND entity_id=OLD.requester_entity_id AND role='requester';
  INSERT INTO demand_entity_links VALUES(NEW.id,NEW.requester_entity_id,'requester');
END;
CREATE TRIGGER demands_no_delete BEFORE DELETE ON demands BEGIN SELECT RAISE(ABORT,'DEMAND_IMMUTABLE'); END;
CREATE TRIGGER demands_update_guard BEFORE UPDATE ON demands BEGIN
  SELECT CASE WHEN NEW.id<>OLD.id OR NEW.campaign_id<>OLD.campaign_id
    OR NEW.parent_id IS NOT OLD.parent_id OR NEW.accepted_signal_id IS NOT OLD.accepted_signal_id
    OR NEW.lineage_signal_id<>OLD.lineage_signal_id OR NEW.source_entity_id<>OLD.source_entity_id
    OR NEW.source_field_definition_id<>OLD.source_field_definition_id
    OR NEW.source_field_value_id<>OLD.source_field_value_id OR NEW.source_id<>OLD.source_id
    OR NEW.source_snapshot<>OLD.source_snapshot OR NEW.created_at<>OLD.created_at
    OR (OLD.generated_event_id IS NOT NULL AND NEW.generated_event_id IS NOT OLD.generated_event_id)
    THEN RAISE(ABORT,'DEMAND_IMMUTABLE') END;
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM campaigns WHERE id=OLD.campaign_id AND status='active')
    THEN RAISE(ABORT,'INVALID_CAMPAIGN_STATE') END;
  SELECT CASE WHEN OLD.status NOT IN ('available','active') AND (
    NEW.title<>OLD.title OR NEW.need<>OLD.need OR NEW.summary<>OLD.summary OR NEW.obstacle<>OLD.obstacle
    OR NEW.risks<>OLD.risks OR NEW.urgency<>OLD.urgency OR NEW.requester_entity_id<>OLD.requester_entity_id
  ) THEN RAISE(ABORT,'DEMAND_IMMUTABLE') END;
  SELECT CASE WHEN NOT (
    (OLD.status IN ('available','active') AND NEW.status IN (OLD.status,'active','resolved','failed','ignored','archived'))
    OR (OLD.status IN ('failed','ignored') AND NEW.status IN ('available','archived'))
    OR (OLD.status='resolved' AND NEW.status='archived')
    OR (OLD.status='archived' AND NEW.status=OLD.status_before_archive)
  ) THEN RAISE(ABORT,'DEMAND_TRANSITION_INVALID') END;
  SELECT CASE WHEN NEW.status='archived' AND NEW.status_before_archive<>OLD.status
    THEN RAISE(ABORT,'DEMAND_TRANSITION_INVALID') END;
  SELECT CASE WHEN NEW.status IN ('available','active') AND (
    EXISTS(SELECT 1 FROM demand_entity_links l JOIN entities e ON e.id=l.entity_id WHERE l.demand_id=OLD.id AND e.archived_at IS NOT NULL)
    OR NOT EXISTS(SELECT 1 FROM entities e WHERE e.id=NEW.requester_entity_id AND e.archived_at IS NULL AND e.campaign_id=NEW.campaign_id)
  ) THEN RAISE(ABORT,'DEMAND_ENTITY_ARCHIVED') END;
  SELECT CASE WHEN NEW.status='resolved' AND OLD.status<>'resolved' AND EXISTS(
    SELECT 1 FROM demands c WHERE c.parent_id=OLD.id AND NOT (
      c.status IN ('resolved','failed','ignored') OR
      (c.status='archived' AND c.status_before_archive IN ('resolved','failed','ignored'))
    )
  ) THEN RAISE(ABORT,'DEMAND_CHILDREN_PENDING') END;
  SELECT CASE WHEN NEW.generated_event_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM events e WHERE e.id=NEW.generated_event_id AND e.campaign_id=NEW.campaign_id
  ) THEN RAISE(ABORT,'DEMAND_LINK_INVALID') END;
END;
CREATE TRIGGER demand_entity_insert BEFORE INSERT ON demand_entity_links BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM demands d JOIN entities e ON e.id=NEW.entity_id
    JOIN campaigns c ON c.id=d.campaign_id
    WHERE d.id=NEW.demand_id AND d.campaign_id=e.campaign_id AND e.archived_at IS NULL
    AND d.status IN ('available','active') AND c.status='active'
    AND (NEW.role<>'requester' OR d.requester_entity_id=NEW.entity_id))
    THEN RAISE(ABORT,'DEMAND_LINK_INVALID') END;
END;
CREATE TRIGGER demand_entity_no_update BEFORE UPDATE ON demand_entity_links BEGIN SELECT RAISE(ABORT,'DEMAND_IMMUTABLE'); END;
CREATE TRIGGER demand_entity_delete BEFORE DELETE ON demand_entity_links
WHEN EXISTS(SELECT 1 FROM demands d WHERE d.id=OLD.demand_id AND (
  d.status NOT IN ('available','active') OR (OLD.role='requester' AND d.requester_entity_id=OLD.entity_id)
  OR NOT EXISTS(SELECT 1 FROM campaigns WHERE id=d.campaign_id AND status='active')
)) BEGIN SELECT RAISE(ABORT,'DEMAND_IMMUTABLE'); END;
CREATE TRIGGER demand_clock_insert BEFORE INSERT ON demand_clock_links
WHEN NOT EXISTS(SELECT 1 FROM demands d JOIN clocks c ON c.id=NEW.clock_id
  JOIN campaigns p ON p.id=d.campaign_id WHERE d.id=NEW.demand_id AND d.campaign_id=c.campaign_id
  AND d.status IN ('available','active') AND p.status='active')
BEGIN SELECT RAISE(ABORT,'DEMAND_LINK_INVALID'); END;
CREATE TRIGGER demand_clock_no_update BEFORE UPDATE ON demand_clock_links BEGIN SELECT RAISE(ABORT,'DEMAND_IMMUTABLE'); END;
CREATE TRIGGER demand_clock_delete BEFORE DELETE ON demand_clock_links
WHEN NOT EXISTS(SELECT 1 FROM demands d JOIN campaigns p ON p.id=d.campaign_id WHERE d.id=OLD.demand_id AND d.status IN ('available','active') AND p.status='active')
BEGIN SELECT RAISE(ABORT,'DEMAND_IMMUTABLE'); END;
CREATE TRIGGER demand_session_insert BEFORE INSERT ON demand_session_links
WHEN NOT EXISTS(SELECT 1 FROM demands d JOIN sessions s ON s.id=NEW.session_id
  JOIN campaigns p ON p.id=d.campaign_id WHERE d.id=NEW.demand_id AND d.campaign_id=s.campaign_id
  AND d.status IN ('available','active') AND p.status='active')
BEGIN SELECT RAISE(ABORT,'DEMAND_LINK_INVALID'); END;
CREATE TRIGGER demand_session_no_update BEFORE UPDATE ON demand_session_links BEGIN SELECT RAISE(ABORT,'DEMAND_IMMUTABLE'); END;
CREATE TRIGGER demand_session_delete BEFORE DELETE ON demand_session_links
WHEN NOT EXISTS(SELECT 1 FROM demands d JOIN campaigns p ON p.id=d.campaign_id WHERE d.id=OLD.demand_id AND d.status IN ('available','active') AND p.status='active')
BEGIN SELECT RAISE(ABORT,'DEMAND_IMMUTABLE'); END;
CREATE TRIGGER demand_entity_archive_guard BEFORE UPDATE OF archived_at ON entities
WHEN NEW.archived_at IS NOT NULL AND EXISTS(
  SELECT 1 FROM demand_entity_links l JOIN demands d ON d.id=l.demand_id
  WHERE l.entity_id=OLD.id AND d.status IN ('available','active')
) BEGIN SELECT RAISE(ABORT,'DEMAND_PENDING_ENTITY'); END;
CREATE TRIGGER demand_need_value_update BEFORE UPDATE ON field_values
WHEN EXISTS(SELECT 1 FROM demands WHERE source_field_value_id=OLD.id) AND (
  NEW.id<>OLD.id OR NEW.entity_id<>OLD.entity_id OR NEW.field_definition_id<>OLD.field_definition_id
  OR NEW.value_text IS NOT OLD.value_text OR NEW.value_number IS NOT OLD.value_number
  OR NEW.value_boolean IS NOT OLD.value_boolean OR NEW.value_date IS NOT OLD.value_date OR NEW.value_json IS NOT OLD.value_json
) BEGIN SELECT RAISE(ABORT,'DEMAND_NEED_LOCKED'); END;
CREATE TRIGGER demand_need_value_insert BEFORE INSERT ON field_values
WHEN EXISTS(SELECT 1 FROM demands d JOIN field_values v ON v.id=d.source_field_value_id
  WHERE v.id=NEW.id OR (v.entity_id=NEW.entity_id AND v.field_definition_id=NEW.field_definition_id))
AND NOT EXISTS(SELECT 1 FROM field_values v WHERE v.entity_id=NEW.entity_id AND v.field_definition_id=NEW.field_definition_id
  AND v.value_text IS NEW.value_text AND v.value_number IS NEW.value_number
  AND v.value_boolean IS NEW.value_boolean AND v.value_date IS NEW.value_date AND v.value_json IS NEW.value_json)
BEGIN SELECT RAISE(ABORT,'DEMAND_NEED_LOCKED'); END;
CREATE TRIGGER demand_need_value_delete BEFORE DELETE ON field_values
WHEN EXISTS(SELECT 1 FROM demands WHERE source_field_value_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'DEMAND_NEED_LOCKED'); END;
CREATE TRIGGER demand_need_definition_update BEFORE UPDATE ON field_definitions
WHEN EXISTS(SELECT 1 FROM demands WHERE source_field_definition_id=OLD.id) AND (
  NEW.id<>OLD.id OR NEW.entity_type_id<>OLD.entity_type_id OR NEW.semantic_role IS NOT OLD.semantic_role
  OR NEW.data_type<>OLD.data_type OR NEW.is_archived<>OLD.is_archived
) BEGIN SELECT RAISE(ABORT,'DEMAND_NEED_LOCKED'); END;
CREATE TRIGGER demand_need_definition_replace BEFORE INSERT ON field_definitions
WHEN EXISTS(SELECT 1 FROM demands d JOIN field_definitions f ON f.id=d.source_field_definition_id
  WHERE f.id=NEW.id OR (f.entity_type_id=NEW.entity_type_id AND f.key=NEW.key))
BEGIN SELECT RAISE(ABORT,'DEMAND_NEED_LOCKED'); END;
CREATE TRIGGER demand_need_definition_delete BEFORE DELETE ON field_definitions
WHEN EXISTS(SELECT 1 FROM demands WHERE source_field_definition_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'DEMAND_NEED_LOCKED'); END;
CREATE TRIGGER demand_need_entity_type_guard BEFORE UPDATE ON entities
WHEN EXISTS(SELECT 1 FROM demands WHERE source_entity_id=OLD.id)
AND (NEW.id<>OLD.id OR NEW.campaign_id<>OLD.campaign_id OR NEW.entity_type_id<>OLD.entity_type_id)
BEGIN SELECT RAISE(ABORT,'DEMAND_NEED_LOCKED'); END;
CREATE TRIGGER demand_need_type_guard BEFORE UPDATE ON entity_types
WHEN EXISTS(SELECT 1 FROM demands d JOIN field_definitions f ON f.id=d.source_field_definition_id WHERE f.entity_type_id=OLD.id)
AND (NEW.id<>OLD.id OR NEW.campaign_id<>OLD.campaign_id OR NEW.is_archived<>OLD.is_archived)
BEGIN SELECT RAISE(ABORT,'DEMAND_NEED_LOCKED'); END;
CREATE TRIGGER demand_need_type_replace BEFORE INSERT ON entity_types
WHEN EXISTS(SELECT 1 FROM demands d JOIN field_definitions f ON f.id=d.source_field_definition_id JOIN entity_types t ON t.id=f.entity_type_id
  WHERE t.id=NEW.id OR (t.campaign_id=NEW.campaign_id AND t.slug=NEW.slug))
BEGIN SELECT RAISE(ABORT,'DEMAND_NEED_LOCKED'); END;
CREATE TRIGGER demand_event_update BEFORE UPDATE ON events
WHEN EXISTS(SELECT 1 FROM demands WHERE generated_event_id=OLD.id) AND (
  NEW.id<>OLD.id OR NEW.campaign_id<>OLD.campaign_id OR NEW.title<>OLD.title
  OR NEW.description_markdown IS NOT OLD.description_markdown OR NEW.session_id IS NOT OLD.session_id
  OR NEW.event_order<>OLD.event_order OR NEW.occurred_at_label IS NOT OLD.occurred_at_label
  OR NEW.origin_kind<>OLD.origin_kind OR NEW.source_id IS NOT OLD.source_id
  OR NEW.visibility<>OLD.visibility OR NEW.created_at<>OLD.created_at
  OR NOT ((NEW.canon_state=OLD.canon_state AND NEW.knowledge_state=OLD.knowledge_state)
    OR (OLD.canon_state='draft' AND OLD.knowledge_state='possibility' AND NEW.canon_state='accepted' AND NEW.knowledge_state='fact'))
) BEGIN SELECT RAISE(ABORT,'DEMAND_EVENT_IMMUTABLE'); END;
CREATE TRIGGER demand_event_replace BEFORE INSERT ON events
WHEN EXISTS(SELECT 1 FROM demands WHERE generated_event_id=NEW.id)
BEGIN SELECT RAISE(ABORT,'DEMAND_EVENT_IMMUTABLE'); END;
CREATE TRIGGER demand_event_link_insert BEFORE INSERT ON event_entity_links
WHEN EXISTS(SELECT 1 FROM demands WHERE generated_event_id=NEW.event_id)
BEGIN SELECT RAISE(ABORT,'DEMAND_EVENT_IMMUTABLE'); END;
CREATE TRIGGER demand_event_link_update BEFORE UPDATE ON event_entity_links
WHEN EXISTS(SELECT 1 FROM demands WHERE generated_event_id IN (OLD.event_id,NEW.event_id))
BEGIN SELECT RAISE(ABORT,'DEMAND_EVENT_IMMUTABLE'); END;
CREATE TRIGGER demand_event_link_delete BEFORE DELETE ON event_entity_links
WHEN EXISTS(SELECT 1 FROM demands WHERE generated_event_id=OLD.event_id)
BEGIN SELECT RAISE(ABORT,'DEMAND_EVENT_IMMUTABLE'); END;
CREATE TRIGGER demand_event_active_campaign BEFORE UPDATE ON events
WHEN EXISTS(SELECT 1 FROM demands d JOIN campaigns c ON c.id=d.campaign_id
  WHERE d.generated_event_id=OLD.id AND c.status<>'active')
BEGIN SELECT RAISE(ABORT,'INVALID_CAMPAIGN_STATE'); END;
CREATE TRIGGER demand_source_update BEFORE UPDATE ON sources
WHEN EXISTS(SELECT 1 FROM demands WHERE source_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'DEMAND_IMMUTABLE'); END;
CREATE TRIGGER demand_source_replace BEFORE INSERT ON sources
WHEN EXISTS(SELECT 1 FROM demands WHERE source_id=NEW.id)
BEGIN SELECT RAISE(ABORT,'DEMAND_IMMUTABLE'); END;
CREATE TRIGGER demand_transform_update BEFORE UPDATE ON demand_transform_operations
BEGIN SELECT RAISE(ABORT,'DEMAND_IMMUTABLE'); END;
CREATE TRIGGER demand_transform_delete BEFORE DELETE ON demand_transform_operations
BEGIN SELECT RAISE(ABORT,'DEMAND_IMMUTABLE'); END;
CREATE TRIGGER demand_transform_replace BEFORE INSERT ON demand_transform_operations
WHEN EXISTS(SELECT 1 FROM demand_transform_operations WHERE id=NEW.id OR child_id=NEW.child_id)
BEGIN SELECT RAISE(ABORT,'DEMAND_IMMUTABLE'); END;
CREATE TRIGGER demand_linked_entity_identity BEFORE UPDATE OF id,campaign_id ON entities
WHEN (NEW.id<>OLD.id OR NEW.campaign_id<>OLD.campaign_id)
AND EXISTS(SELECT 1 FROM demand_entity_links WHERE entity_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'DEMAND_LINK_INVALID'); END;
CREATE TRIGGER demand_linked_session_identity BEFORE UPDATE OF id,campaign_id ON sessions
WHEN (NEW.id<>OLD.id OR NEW.campaign_id<>OLD.campaign_id)
AND EXISTS(SELECT 1 FROM demand_session_links WHERE session_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'DEMAND_LINK_INVALID'); END;
CREATE TRIGGER demand_linked_clock_identity BEFORE UPDATE OF id,campaign_id ON clocks
WHEN (NEW.id<>OLD.id OR NEW.campaign_id<>OLD.campaign_id)
AND EXISTS(SELECT 1 FROM demand_clock_links WHERE clock_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'DEMAND_LINK_INVALID'); END;
CREATE TRIGGER demand_event_source_scope_insert BEFORE INSERT ON events
WHEN EXISTS(SELECT 1 FROM demands WHERE source_id=NEW.source_id AND campaign_id<>NEW.campaign_id)
BEGIN SELECT RAISE(ABORT,'DEMAND_SOURCE_INVALID'); END;
CREATE TRIGGER demand_event_source_scope_update BEFORE UPDATE OF source_id,campaign_id ON events
WHEN EXISTS(SELECT 1 FROM demands WHERE source_id=NEW.source_id AND campaign_id<>NEW.campaign_id)
BEGIN SELECT RAISE(ABORT,'DEMAND_SOURCE_INVALID'); END;
CREATE TRIGGER demand_entity_source_scope_insert BEFORE INSERT ON entities
WHEN EXISTS(SELECT 1 FROM demands WHERE source_id=NEW.source_id AND campaign_id<>NEW.campaign_id)
BEGIN SELECT RAISE(ABORT,'DEMAND_SOURCE_INVALID'); END;
CREATE TRIGGER demand_entity_source_scope_update BEFORE UPDATE OF source_id,campaign_id ON entities
WHEN EXISTS(SELECT 1 FROM demands WHERE source_id=NEW.source_id AND campaign_id<>NEW.campaign_id)
BEGIN SELECT RAISE(ABORT,'DEMAND_SOURCE_INVALID'); END;
CREATE TRIGGER demand_assertion_source_scope_insert BEFORE INSERT ON assertions
WHEN EXISTS(SELECT 1 FROM demands WHERE source_id=NEW.source_id AND campaign_id<>NEW.campaign_id)
BEGIN SELECT RAISE(ABORT,'DEMAND_SOURCE_INVALID'); END;
CREATE TRIGGER demand_assertion_source_scope_update BEFORE UPDATE OF source_id,campaign_id ON assertions
WHEN EXISTS(SELECT 1 FROM demands WHERE source_id=NEW.source_id AND campaign_id<>NEW.campaign_id)
BEGIN SELECT RAISE(ABORT,'DEMAND_SOURCE_INVALID'); END;
CREATE TRIGGER demand_note_source_scope_insert BEFORE INSERT ON notes
WHEN EXISTS(SELECT 1 FROM demands WHERE source_id=NEW.source_id AND campaign_id<>NEW.campaign_id)
BEGIN SELECT RAISE(ABORT,'DEMAND_SOURCE_INVALID'); END;
CREATE TRIGGER demand_note_source_scope_update BEFORE UPDATE OF source_id,campaign_id ON notes
WHEN EXISTS(SELECT 1 FROM demands WHERE source_id=NEW.source_id AND campaign_id<>NEW.campaign_id)
BEGIN SELECT RAISE(ABORT,'DEMAND_SOURCE_INVALID'); END;
CREATE TRIGGER demand_relationship_source_scope_insert BEFORE INSERT ON relationships
WHEN EXISTS(SELECT 1 FROM demands WHERE source_id=NEW.source_id AND campaign_id<>NEW.campaign_id)
BEGIN SELECT RAISE(ABORT,'DEMAND_SOURCE_INVALID'); END;
CREATE TRIGGER demand_relationship_source_scope_update BEFORE UPDATE OF source_id,campaign_id ON relationships
WHEN EXISTS(SELECT 1 FROM demands WHERE source_id=NEW.source_id AND campaign_id<>NEW.campaign_id)
BEGIN SELECT RAISE(ABORT,'DEMAND_SOURCE_INVALID'); END;
CREATE TRIGGER demand_clock_source_scope_insert BEFORE INSERT ON clocks
WHEN EXISTS(SELECT 1 FROM demands WHERE source_id=NEW.source_id AND campaign_id<>NEW.campaign_id)
BEGIN SELECT RAISE(ABORT,'DEMAND_SOURCE_INVALID'); END;
CREATE TRIGGER demand_clock_source_scope_update BEFORE UPDATE OF source_id,campaign_id ON clocks
WHEN EXISTS(SELECT 1 FROM demands WHERE source_id=NEW.source_id AND campaign_id<>NEW.campaign_id)
BEGIN SELECT RAISE(ABORT,'DEMAND_SOURCE_INVALID'); END;
