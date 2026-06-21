-- FreshEyes v2 Schema
-- Run this in Supabase SQL editor to set up the database

-- Cases
create table if not exists cases (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  incident_date date,
  incident_location text,
  status text default 'active',
  created_by uuid references auth.users,
  created_at timestamptz default now()
);

-- Uploaded files
create table if not exists case_files (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references cases on delete cascade not null,
  filename text not null,
  storage_path text not null,
  file_type text,                           -- 'pdf' | 'image' | 'audio'
  file_size bigint,
  document_type text default 'other',       -- 'police_report' | 'witness_statement' | 'autopsy' | 'evidence_log' | 'photo' | 'other'
  document_date date,
  ocr_text text,
  ocr_method text,                          -- 'claude-vision' | 'pdf-text'
  page_count int,
  processing_status text default 'pending', -- 'pending' | 'processing' | 'complete' | 'failed'
  processing_error text,
  processed_at timestamptz,
  created_at timestamptz default now()
);

-- Entities: people, locations, organizations, vehicles, evidence items
create table if not exists entities (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references cases on delete cascade not null,
  type text not null,            -- 'person' | 'location' | 'organization' | 'vehicle' | 'evidence_item'
  canonical_name text not null,
  aliases text[] default '{}',
  role text default 'mentioned', -- 'victim' | 'suspect' | 'witness' | 'investigator' | 'mentioned'
  attributes jsonb default '{}', -- {age, gender, occupation, address, plate_number, etc.}
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Every mention of an entity in a document
create table if not exists entity_mentions (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid references entities on delete cascade not null,
  file_id uuid references case_files on delete cascade not null,
  page_number int,
  context_text text,
  created_at timestamptz default now()
);

-- Relationships between entities
create table if not exists relationships (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references cases on delete cascade not null,
  from_entity_id uuid references entities not null,
  to_entity_id uuid references entities not null,
  relationship_type text,  -- 'knows' | 'was_with' | 'alibi_for' | 'married_to' | 'employed_by' | 'witnessed' | 'owns'
  description text,
  source_file_id uuid references case_files,
  confidence float default 1.0,
  created_at timestamptz default now()
);

-- Statements attributed to people
create table if not exists statements (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references cases on delete cascade not null,
  speaker_entity_id uuid references entities,
  source_file_id uuid references case_files,
  statement_date date,
  statement_time time,
  content text not null,
  about_entity_ids uuid[] default '{}',
  created_at timestamptz default now()
);

-- Timeline events
create table if not exists timeline_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references cases on delete cascade not null,
  event_date date,
  event_time time,
  time_precision text default 'exact', -- 'exact' | 'approximate' | 'unknown'
  description text not null,
  involved_entity_ids uuid[] default '{}',
  source_file_id uuid references case_files,
  confidence float default 1.0,
  created_at timestamptz default now()
);

-- Detected contradictions and anomalies
create table if not exists contradictions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references cases on delete cascade not null,
  type text,      -- 'alibi_conflict' | 'timeline_conflict' | 'statement_conflict' | 'uninterviewed_person' | 'missing_followup' | 'physical_impossibility' | 'suspicious_omission'
  severity text default 'medium',  -- 'low' | 'medium' | 'high' | 'critical'
  title text not null,
  description text not null,
  evidence jsonb default '{}',     -- {quotes: [], file_ids: [], entity_ids: []}
  involved_entity_ids uuid[] default '{}',
  involved_file_ids uuid[] default '{}',
  status text default 'open',      -- 'open' | 'investigating' | 'resolved' | 'false_positive'
  resolution_notes text,
  created_at timestamptz default now()
);

-- Generated investigation reports
create table if not exists case_reports (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references cases on delete cascade not null,
  report_type text default 'full_analysis',
  content text not null,
  model_used text,
  files_analyzed int,
  entities_found int,
  contradictions_found int,
  created_at timestamptz default now()
);

-- RLS
alter table cases enable row level security;
alter table case_files enable row level security;
alter table entities enable row level security;
alter table entity_mentions enable row level security;
alter table relationships enable row level security;
alter table statements enable row level security;
alter table timeline_events enable row level security;
alter table contradictions enable row level security;
alter table case_reports enable row level security;

-- Case ownership
create policy "users own cases" on cases
  for all using (created_by = auth.uid());

-- All case data is accessible if you own the case
create policy "case_files access" on case_files
  for all using (case_id in (select id from cases where created_by = auth.uid()));

create policy "entities access" on entities
  for all using (case_id in (select id from cases where created_by = auth.uid()));

create policy "entity_mentions access" on entity_mentions
  for all using (entity_id in (select id from entities where case_id in (select id from cases where created_by = auth.uid())));

create policy "relationships access" on relationships
  for all using (case_id in (select id from cases where created_by = auth.uid()));

create policy "statements access" on statements
  for all using (case_id in (select id from cases where created_by = auth.uid()));

create policy "timeline_events access" on timeline_events
  for all using (case_id in (select id from cases where created_by = auth.uid()));

create policy "contradictions access" on contradictions
  for all using (case_id in (select id from cases where created_by = auth.uid()));

create policy "case_reports access" on case_reports
  for all using (case_id in (select id from cases where created_by = auth.uid()));

-- Storage bucket (run separately if needed)
-- insert into storage.buckets (id, name, public) values ('case-files', 'case-files', false);
-- create policy "case file uploads" on storage.objects for all using (bucket_id = 'case-files' and auth.uid() is not null);
