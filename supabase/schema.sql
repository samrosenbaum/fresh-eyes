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
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Import batches group one intake action across many uploaded files
create table if not exists import_batches (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references cases on delete cascade not null,
  uploaded_by uuid references auth.users,
  label text,
  status text default 'pending', -- 'pending' | 'processing' | 'complete' | 'failed'
  file_count int default 0,
  page_count int default 0,
  low_confidence_page_count int default 0,
  duplicate_page_count int default 0,
  missing_reference_count int default 0,
  error text,
  created_at timestamptz default now(),
  completed_at timestamptz
);

-- Uploaded files
create table if not exists case_files (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references cases on delete cascade not null,
  import_batch_id uuid references import_batches on delete set null,
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

-- Page-level processing records for source traceability and intake QA
create table if not exists document_pages (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references cases on delete cascade not null,
  file_id uuid references case_files on delete cascade not null,
  import_batch_id uuid references import_batches on delete set null,
  page_number int not null,
  ocr_text text,
  ocr_confidence float,
  ocr_method text,
  page_fingerprint text,
  duplicate_of_page_id uuid references document_pages,
  processing_status text default 'pending',
  review_status text default 'none', -- 'none' | 'needs_review' | 'reviewed'
  created_at timestamptz default now(),
  unique(file_id, page_number)
);

-- Logical documents detected inside an uploaded file: one scanned box often
-- contains many reports, statements, and tips in a single PDF
create table if not exists case_documents (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references cases on delete cascade not null,
  file_id uuid references case_files on delete cascade not null,
  import_batch_id uuid references import_batches on delete set null,
  title text not null,
  document_type text default 'other', -- 'police_report' | 'witness_statement' | 'interview' | 'autopsy' | 'evidence_log' | 'lab_report' | 'tip' | 'photo' | 'other'
  start_page int not null,
  end_page int not null,
  confidence float default 0.5,
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
  source_page_id uuid references document_pages,
  context_text text,
  source_quote text,
  source_verification text default 'unverified',
  confidence float default 1.0,
  review_status text default 'pending',
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
  source_page_id uuid references document_pages,
  source_quote text,
  source_verification text default 'unverified',
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
  source_page_id uuid references document_pages,
  source_quote text,
  source_verification text default 'unverified',
  confidence float default 1.0,
  review_status text default 'pending',
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
  source_page_id uuid references document_pages,
  source_quote text,
  source_verification text default 'unverified',
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
alter table import_batches enable row level security;
alter table case_files enable row level security;
alter table document_pages enable row level security;
alter table case_documents enable row level security;
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
create policy "import_batches access" on import_batches
  for all using (case_id in (select id from cases where created_by = auth.uid()));

create policy "case_files access" on case_files
  for all using (case_id in (select id from cases where created_by = auth.uid()));

create policy "document_pages access" on document_pages
  for all using (case_id in (select id from cases where created_by = auth.uid()));

create policy "case_documents access" on case_documents
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


-- Additive migrations for existing FreshEyes v2 databases
alter table cases add column if not exists updated_at timestamptz default now();
alter table case_files add column if not exists import_batch_id uuid references import_batches on delete set null;
alter table entity_mentions add column if not exists source_quote text;
alter table entity_mentions add column if not exists confidence float default 1.0;
alter table entity_mentions add column if not exists review_status text default 'pending';
alter table relationships add column if not exists source_page_id uuid references document_pages;
alter table relationships add column if not exists source_quote text;
alter table statements add column if not exists source_page_id uuid references document_pages;
alter table statements add column if not exists source_quote text;
alter table statements add column if not exists confidence float default 1.0;
alter table statements add column if not exists review_status text default 'pending';
alter table timeline_events add column if not exists source_page_id uuid references document_pages;
alter table timeline_events add column if not exists source_quote text;

-- Case Intake Foundation migrations
alter table entity_mentions add column if not exists source_page_id uuid references document_pages;
alter table import_batches add column if not exists error text;

-- Source verification: 'verified' (quote found on cited page),
-- 'relocated' (found on a different page), 'unverified' (not found — needs review)
alter table entity_mentions add column if not exists source_verification text default 'unverified';
alter table relationships add column if not exists source_verification text default 'unverified';
alter table statements add column if not exists source_verification text default 'unverified';
alter table timeline_events add column if not exists source_verification text default 'unverified';

create index if not exists document_pages_fingerprint_idx on document_pages (case_id, page_fingerprint);
create index if not exists document_pages_import_batch_idx on document_pages (import_batch_id);
create index if not exists case_files_import_batch_idx on case_files (import_batch_id);

-- Intake at scale migrations (document segmentation + review queue)
alter table document_pages add column if not exists review_status text default 'none';
create index if not exists document_pages_review_idx on document_pages (case_id, review_status);

create table if not exists case_documents (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references cases on delete cascade not null,
  file_id uuid references case_files on delete cascade not null,
  import_batch_id uuid references import_batches on delete set null,
  title text not null,
  document_type text default 'other',
  start_page int not null,
  end_page int not null,
  confidence float default 0.5,
  created_at timestamptz default now()
);
alter table case_documents enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'case_documents' and policyname = 'case_documents access') then
    create policy "case_documents access" on case_documents
      for all using (case_id in (select id from cases where created_by = auth.uid()));
  end if;
end $$;
create index if not exists case_documents_file_idx on case_documents (file_id);
