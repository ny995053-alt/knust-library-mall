-- KNUST Library Mall
-- Complete Supabase/Postgres schema, security policies, storage and starter catalogue.
-- IMPORTANT: open a NEW Supabase SQL Editor query, paste this raw file, make
-- sure no text is highlighted, and choose Run. Do not run a selected fragment.
-- The script is transactional and safe to rerun after a failed attempt.

begin;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;
-- Do not ALTER existing managed extensions here: the SQL Editor role may not own
-- extensions that Supabase already installed in this schema.

do $$ begin
  create type public.app_role as enum ('student', 'librarian', 'admin', 'super_admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.profile_status as enum ('active', 'suspended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.book_format as enum ('physical', 'digital', 'both');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.copy_status as enum ('available', 'borrowed', 'lost', 'damaged', 'maintenance', 'retired');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.book_condition as enum ('new', 'good', 'fair', 'poor', 'damaged');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.edition_status as enum ('draft', 'published', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.basket_status as enum ('active', 'checked_out', 'abandoned');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.loan_status as enum ('active', 'returned', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.loan_item_status as enum ('active', 'returned', 'lost', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.return_request_status as enum ('pending', 'accepted', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.fulfilment_method as enum ('pickup', 'delivery');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.borrow_request_status as enum ('pending', 'approved', 'rejected', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.student_verification_status as enum ('pending', 'verified', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.student_gender as enum ('female', 'male', 'non-binary', 'prefer-not-to-say');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.residence_type as enum ('on-campus', 'off-campus');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.simulated_payment_method as enum ('card', 'momo');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.simulated_payment_status as enum ('not_required', 'simulated_paid');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  index_number text,
  email text,
  personal_email text,
  student_email text,
  phone text,
  programme text,
  role public.app_role not null default 'student',
  status public.profile_status not null default 'active',
  admin_access_revoked_at timestamptz,
  admin_access_revoked_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_full_name_length check (full_name is null or char_length(trim(full_name)) between 2 and 120),
  constraint profiles_index_length check (index_number is null or char_length(trim(index_number)) between 3 and 50)
);

-- Safe when upgrading an earlier copy of this schema.
alter table public.profiles add column if not exists personal_email text;
alter table public.profiles add column if not exists student_email text;
alter table public.profiles add column if not exists admin_access_revoked_at timestamptz;
alter table public.profiles add column if not exists admin_access_revoked_by uuid references public.profiles(id) on delete set null;

alter table public.profiles drop constraint if exists profiles_auth_email_format;
alter table public.profiles drop constraint if exists profiles_student_email_format;
alter table public.profiles drop constraint if exists profiles_personal_email_format;
alter table public.profiles drop constraint if exists profiles_student_id_format;
drop index if exists public.profiles_student_email_unique;

-- Migrate the short-lived earlier layout where the Auth email was stored as the student email.
update public.profiles
set student_email = lower(trim(email)),
    email = lower(trim(personal_email))
where student_email is null
  and lower(trim(email)) ~ '@st\.knust\.edu\.gh$'
  and personal_email is not null
  and lower(trim(personal_email)) !~ '@st\.knust\.edu\.gh$';

update public.profiles
set personal_email = lower(trim(email))
where personal_email is null and email is not null;

create unique index if not exists profiles_index_number_unique
  on public.profiles (lower(trim(index_number)))
  where index_number is not null and trim(index_number) <> '';
create unique index if not exists profiles_auth_email_unique
  on public.profiles (lower(trim(email)))
  where email is not null and trim(email) <> '';
create unique index if not exists profiles_personal_email_unique
  on public.profiles (lower(trim(personal_email)))
  where personal_email is not null and trim(personal_email) <> '';
create unique index if not exists profiles_student_email_unique
  on public.profiles (lower(trim(student_email)))
  where student_email is not null and trim(student_email) <> '';

do $$ begin
  alter table public.profiles add constraint profiles_auth_email_format check (
    role <> 'student' or email is null or (
      lower(trim(email)) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      and lower(trim(email)) !~ '@st\.knust\.edu\.gh$'
    )
  ) not valid;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.profiles add constraint profiles_personal_email_format check (
    role <> 'student' or personal_email is null or (
      lower(trim(personal_email)) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      and lower(trim(personal_email)) !~ '@st\.knust\.edu\.gh$'
    )
  ) not valid;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.profiles add constraint profiles_student_email_format check (
    role <> 'student' or student_email is null or lower(trim(student_email)) ~ '^[^[:space:]@]+@st\.knust\.edu\.gh$'
  ) not valid;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.profiles add constraint profiles_student_id_format check (
    role <> 'student' or index_number is null or upper(trim(index_number)) ~ '^([0-9]{8,12}|[A-Z]{2,5}/[A-Z]{2,8}/[0-9]{2}/[0-9]{3,6})$'
  ) not valid;
exception when duplicate_object then null; end $$;

create index if not exists profiles_role_status_idx on public.profiles(role, status);
create index if not exists profiles_created_at_idx on public.profiles(created_at desc);

-- Private student intake. A single consented face-presence image may be stored
-- in the private student-ids bucket for administrator review. No biometric
-- template, embedding, or biometric-match result is created.
create table if not exists public.student_private_profiles (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  department text,
  programme text,
  start_year smallint,
  completion_year smallint,
  gender public.student_gender,
  residence_type public.residence_type,
  residence_location text,
  phone text,
  guardian_full_name text,
  guardian_phone text,
  guardian_relationship text,
  student_id_object_path text,
  student_id_status text not null default 'pending_storage',
  student_id_uploaded_at timestamptz,
  student_record_check_status text not null default 'pending',
  facial_scan_status text not null default 'not_started',
  face_snapshot_object_path text,
  face_snapshot_uploaded_at timestamptz,
  identity_verification_mode text,
  identity_verification_completed_at timestamptz,
  identity_consent_at timestamptz,
  identity_consent_scope text,
  privacy_notice_version text,
  verification_status public.student_verification_status not null default 'pending',
  verification_notes text,
  verified_at timestamptz,
  verified_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_private_years_valid check (
    (start_year is null or start_year between 2000 and 2200)
    and (completion_year is null or completion_year between 2000 and 2200)
    and (start_year is null or completion_year is null or completion_year >= start_year)
  ),
  constraint student_private_phone_length check (phone is null or char_length(trim(phone)) between 7 and 30),
  constraint student_private_guardian_phone_length check (guardian_phone is null or char_length(trim(guardian_phone)) between 7 and 30),
  constraint student_private_id_path_owned check (
    student_id_object_path is null or student_id_object_path like profile_id::text || '/%'
  ),
  constraint student_private_id_status_valid check (
    student_id_status in ('pending_storage', 'uploaded_private', 'verified', 'rejected')
  ),
  constraint student_private_id_upload_consistency check (
    (student_id_status = 'pending_storage' and student_id_object_path is null and student_id_uploaded_at is null)
    or (student_id_status in ('uploaded_private', 'rejected') and student_id_object_path is not null and student_id_uploaded_at is not null)
    or (
      student_id_status = 'verified'
      and (
        (student_id_object_path is not null and student_id_uploaded_at is not null)
        or (identity_verification_mode = 'simulation' and student_id_object_path is null and student_id_uploaded_at is null)
      )
    )
  ),
  constraint student_private_record_status_valid check (
    student_record_check_status in ('pending', 'simulated_passed', 'verified', 'failed')
  ),
  constraint student_private_face_status_valid check (
    facial_scan_status in ('not_started', 'simulated_completed_no_biometric_match')
  ),
  constraint student_private_face_snapshot_path_owned check (
    face_snapshot_object_path is null or face_snapshot_object_path like profile_id::text || '/%'
  ),
  constraint student_private_face_snapshot_consistency check (
    (face_snapshot_object_path is null and face_snapshot_uploaded_at is null)
    or (face_snapshot_object_path is not null and face_snapshot_uploaded_at is not null)
  ),
  constraint student_private_verification_mode_valid check (
    identity_verification_mode is null or identity_verification_mode in ('simulation', 'manual')
  ),
  constraint student_private_verification_consistency check (
    (verification_status = 'verified' and verified_at is not null)
    or verification_status <> 'verified'
  )
);

-- Upgrade safety for databases that ran an earlier preview of this schema.
alter table public.student_private_profiles add column if not exists department text;
alter table public.student_private_profiles add column if not exists programme text;
alter table public.student_private_profiles add column if not exists start_year smallint;
alter table public.student_private_profiles add column if not exists completion_year smallint;
alter table public.student_private_profiles add column if not exists gender public.student_gender;
alter table public.student_private_profiles add column if not exists residence_type public.residence_type;
alter table public.student_private_profiles add column if not exists residence_location text;
alter table public.student_private_profiles add column if not exists phone text;
alter table public.student_private_profiles add column if not exists guardian_full_name text;
alter table public.student_private_profiles add column if not exists guardian_phone text;
alter table public.student_private_profiles add column if not exists guardian_relationship text;
alter table public.student_private_profiles add column if not exists student_id_object_path text;
alter table public.student_private_profiles add column if not exists student_id_status text not null default 'pending_storage';
alter table public.student_private_profiles add column if not exists student_id_uploaded_at timestamptz;
alter table public.student_private_profiles add column if not exists student_record_check_status text not null default 'pending';
alter table public.student_private_profiles add column if not exists facial_scan_status text not null default 'not_started';
alter table public.student_private_profiles add column if not exists face_snapshot_object_path text;
alter table public.student_private_profiles add column if not exists face_snapshot_uploaded_at timestamptz;
alter table public.student_private_profiles add column if not exists identity_verification_mode text;
alter table public.student_private_profiles add column if not exists identity_verification_completed_at timestamptz;
alter table public.student_private_profiles add column if not exists identity_consent_at timestamptz;
alter table public.student_private_profiles add column if not exists identity_consent_scope text;
alter table public.student_private_profiles add column if not exists privacy_notice_version text;
alter table public.student_private_profiles add column if not exists verification_status public.student_verification_status not null default 'pending';
alter table public.student_private_profiles add column if not exists verification_notes text;
alter table public.student_private_profiles add column if not exists verified_at timestamptz;
alter table public.student_private_profiles add column if not exists verified_by uuid references public.profiles(id) on delete set null;
alter table public.student_private_profiles add column if not exists created_at timestamptz not null default now();
alter table public.student_private_profiles add column if not exists updated_at timestamptz not null default now();

-- Normalize older preview rows before rebuilding every critical constraint.
update public.student_private_profiles
set start_year = null, completion_year = null
where (start_year is not null and start_year not between 2000 and 2200)
   or (completion_year is not null and completion_year not between 2000 and 2200)
   or (start_year is not null and completion_year is not null and completion_year < start_year);
update public.student_private_profiles set phone = null
where phone is not null and char_length(trim(phone)) not between 7 and 30;
update public.student_private_profiles set guardian_phone = null
where guardian_phone is not null and char_length(trim(guardian_phone)) not between 7 and 30;
update public.student_private_profiles
set student_id_status = 'pending_storage', student_id_object_path = null, student_id_uploaded_at = null
where student_id_status not in ('pending_storage', 'uploaded_private', 'verified', 'rejected');
update public.student_private_profiles set student_record_check_status = 'pending'
where student_record_check_status not in ('pending', 'simulated_passed', 'verified', 'failed');
update public.student_private_profiles set facial_scan_status = 'not_started'
where facial_scan_status not in ('not_started', 'simulated_completed_no_biometric_match');
update public.student_private_profiles
set face_snapshot_object_path = null, face_snapshot_uploaded_at = null
where face_snapshot_object_path is not null
  and face_snapshot_object_path not like profile_id::text || '/%';
update public.student_private_profiles
set face_snapshot_uploaded_at = null
where face_snapshot_object_path is null;
update public.student_private_profiles
set face_snapshot_uploaded_at = coalesce(face_snapshot_uploaded_at, created_at)
where face_snapshot_object_path is not null;
update public.student_private_profiles set identity_verification_mode = null
where identity_verification_mode is not null and identity_verification_mode not in ('simulation', 'manual');
update public.student_private_profiles
set student_id_object_path = null,
    student_id_uploaded_at = null,
    student_id_status = 'pending_storage'
where student_id_object_path is not null
  and student_id_object_path not like profile_id::text || '/%';
update public.student_private_profiles
set student_id_status = 'pending_storage', student_id_uploaded_at = null
where student_id_object_path is null
  and student_id_status in ('uploaded_private', 'rejected');
update public.student_private_profiles
set student_id_status = 'uploaded_private', student_id_uploaded_at = coalesce(student_id_uploaded_at, created_at)
where student_id_object_path is not null and student_id_status = 'pending_storage';
update public.student_private_profiles
set student_id_uploaded_at = coalesce(student_id_uploaded_at, created_at)
where student_id_object_path is not null
  and student_id_status in ('uploaded_private', 'verified', 'rejected');
update public.student_private_profiles
set identity_verification_mode = 'simulation', student_id_uploaded_at = null
where student_id_status = 'verified'
  and student_id_object_path is null
  and (identity_verification_mode is distinct from 'simulation' or student_id_uploaded_at is not null);
update public.student_private_profiles
set verified_at = coalesce(verified_at, updated_at, created_at)
where verification_status = 'verified';

alter table public.student_private_profiles drop constraint if exists student_private_years_valid;
alter table public.student_private_profiles add constraint student_private_years_valid check (
  (start_year is null or start_year between 2000 and 2200)
  and (completion_year is null or completion_year between 2000 and 2200)
  and (start_year is null or completion_year is null or completion_year >= start_year)
);
alter table public.student_private_profiles drop constraint if exists student_private_phone_length;
alter table public.student_private_profiles add constraint student_private_phone_length
  check (phone is null or char_length(trim(phone)) between 7 and 30);
alter table public.student_private_profiles drop constraint if exists student_private_guardian_phone_length;
alter table public.student_private_profiles add constraint student_private_guardian_phone_length
  check (guardian_phone is null or char_length(trim(guardian_phone)) between 7 and 30);
alter table public.student_private_profiles drop constraint if exists student_private_id_path_owned;
alter table public.student_private_profiles add constraint student_private_id_path_owned
  check (student_id_object_path is null or student_id_object_path like profile_id::text || '/%');
alter table public.student_private_profiles drop constraint if exists student_private_id_status_valid;
alter table public.student_private_profiles add constraint student_private_id_status_valid
  check (student_id_status in ('pending_storage', 'uploaded_private', 'verified', 'rejected'));
alter table public.student_private_profiles drop constraint if exists student_private_id_upload_consistency;
alter table public.student_private_profiles add constraint student_private_id_upload_consistency check (
  (student_id_status = 'pending_storage' and student_id_object_path is null and student_id_uploaded_at is null)
  or (student_id_status in ('uploaded_private', 'rejected') and student_id_object_path is not null and student_id_uploaded_at is not null)
  or (
    student_id_status = 'verified'
    and (
      (student_id_object_path is not null and student_id_uploaded_at is not null)
      or (identity_verification_mode = 'simulation' and student_id_object_path is null and student_id_uploaded_at is null)
    )
  )
);
alter table public.student_private_profiles drop constraint if exists student_private_record_status_valid;
alter table public.student_private_profiles add constraint student_private_record_status_valid
  check (student_record_check_status in ('pending', 'simulated_passed', 'verified', 'failed'));
alter table public.student_private_profiles drop constraint if exists student_private_face_status_valid;
alter table public.student_private_profiles add constraint student_private_face_status_valid
  check (facial_scan_status in ('not_started', 'simulated_completed_no_biometric_match'));
alter table public.student_private_profiles drop constraint if exists student_private_face_snapshot_path_owned;
alter table public.student_private_profiles add constraint student_private_face_snapshot_path_owned
  check (face_snapshot_object_path is null or face_snapshot_object_path like profile_id::text || '/%');
alter table public.student_private_profiles drop constraint if exists student_private_face_snapshot_consistency;
alter table public.student_private_profiles add constraint student_private_face_snapshot_consistency check (
  (face_snapshot_object_path is null and face_snapshot_uploaded_at is null)
  or (face_snapshot_object_path is not null and face_snapshot_uploaded_at is not null)
);
alter table public.student_private_profiles drop constraint if exists student_private_verification_mode_valid;
alter table public.student_private_profiles add constraint student_private_verification_mode_valid
  check (identity_verification_mode is null or identity_verification_mode in ('simulation', 'manual'));
alter table public.student_private_profiles drop constraint if exists student_private_verification_consistency;
alter table public.student_private_profiles add constraint student_private_verification_consistency
  check ((verification_status = 'verified' and verified_at is not null) or verification_status <> 'verified');

create index if not exists student_private_verification_idx
  on public.student_private_profiles(verification_status, updated_at desc);

-- Fictional presentation accounts are registered here before their Auth users
-- are provisioned by scripts/seed-presentation-accounts.mjs. Passwords are
-- derived at run time and are never stored in Postgres.
create table if not exists public.presentation_student_registry (
  demo_number smallint primary key,
  full_name text not null,
  index_number text not null unique,
  personal_email text not null unique,
  student_email text not null unique,
  department text not null,
  programme text not null,
  start_year smallint not null,
  completion_year smallint not null,
  gender public.student_gender not null,
  residence_type public.residence_type not null,
  residence_location text not null,
  phone text not null,
  guardian_full_name text not null,
  guardian_phone text not null,
  guardian_relationship text not null,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  provisioned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint presentation_student_number_valid check (demo_number between 1 and 19),
  constraint presentation_student_years_valid check (
    start_year between 2000 and 2200
    and completion_year between start_year and least(2200, start_year + 12)
  ),
  constraint presentation_personal_email_valid check (
    lower(trim(personal_email)) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    and lower(trim(personal_email)) !~ '@st\.knust\.edu\.gh$'
  ),
  constraint presentation_student_email_valid check (
    lower(trim(student_email)) ~ '^[^[:space:]@]+@st\.knust\.edu\.gh$'
  )
);

alter table public.presentation_student_registry add column if not exists phone text;
alter table public.presentation_student_registry add column if not exists guardian_full_name text;
alter table public.presentation_student_registry add column if not exists guardian_phone text;
alter table public.presentation_student_registry add column if not exists guardian_relationship text;

-- Authoritative public-signup allow-list. These records are deliberately
-- separate from the 19 already-provisioned presentation accounts so a valid
-- signup test can create a new Auth user instead of always hitting a duplicate.
-- Browser roles receive no table privileges and no RLS policy; only the Auth
-- trigger may atomically inspect and claim a row.
create table if not exists public.student_signup_allowlist (
  allow_number smallint primary key,
  student_email text not null unique,
  index_number text not null unique,
  is_active boolean not null default true,
  claimed_by uuid unique references auth.users(id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_signup_allow_number_valid check (allow_number between 1 and 19),
  constraint student_signup_allow_email_normalized check (
    student_email = lower(trim(student_email))
    and student_email ~ '^[^[:space:]@]+@st\.knust\.edu\.gh$'
  ),
  constraint student_signup_allow_index_normalized check (
    index_number = upper(regexp_replace(trim(index_number), '\s+', '', 'g'))
    and index_number ~ '^([0-9]{8,12}|[A-Z]{2,5}/[A-Z]{2,8}/[0-9]{2}/[0-9]{3,6})$'
  ),
  constraint student_signup_allow_claim_consistency check (
    (claimed_by is null and claimed_at is null)
    or (claimed_by is not null and claimed_at is not null)
  )
);

-- Move legacy student phone/programme values into the private intake table.
insert into public.student_private_profiles(profile_id, phone, programme)
select p.id, nullif(trim(p.phone), ''), nullif(trim(p.programme), '')
from public.profiles p
where p.role = 'student'
on conflict (profile_id) do update set
  phone = coalesce(public.student_private_profiles.phone, excluded.phone),
  programme = coalesce(public.student_private_profiles.programme, excluded.programme);

update public.profiles
set phone = null, programme = null
where role = 'student' and (phone is not null or programme is not null);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_name_length check (char_length(trim(name)) between 2 and 80)
);

create unique index if not exists categories_name_unique on public.categories(lower(trim(name)));

create table if not exists public.authors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  biography text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint authors_name_length check (char_length(trim(name)) between 2 and 160)
);

create unique index if not exists authors_name_unique on public.authors(lower(trim(name)));

create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  author_id uuid not null references public.authors(id) on delete restrict,
  category_id uuid not null references public.categories(id) on delete restrict,
  isbn text,
  description text not null default '',
  format public.book_format not null default 'physical',
  pages integer,
  published_year integer,
  language text not null default 'English',
  publisher text,
  cover_object_path text,
  cover_url text,
  shelf_hint text,
  featured boolean not null default false,
  borrow_count integer not null default 0,
  is_published boolean not null default false,
  archived_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_vector tsvector generated always as (
    to_tsvector('simple'::regconfig, coalesce(title, '') || ' ' || coalesce(isbn, '') || ' ' || coalesce(description, ''))
  ) stored,
  constraint books_title_length check (char_length(trim(title)) between 1 and 240),
  constraint books_pages_valid check (pages is null or pages > 0),
  constraint books_year_valid check (published_year is null or published_year between 1000 and 2100),
  constraint books_archive_consistency check (archived_at is null or is_published = false)
);

alter table public.books add column if not exists borrow_count integer not null default 0;

drop index if exists public.books_isbn_unique;
create unique index books_isbn_unique
  on public.books ((upper(regexp_replace(isbn, '[^0-9Xx]', '', 'g'))))
  where isbn is not null and trim(isbn) <> '';
create index if not exists books_category_idx on public.books(category_id) where archived_at is null;
create index if not exists books_author_idx on public.books(author_id) where archived_at is null;
create index if not exists books_published_idx on public.books(is_published, created_at desc) where archived_at is null;
create index if not exists books_search_idx on public.books using gin(search_vector);
create index if not exists books_title_trgm_idx on public.books using gin(title extensions.gin_trgm_ops);

create table if not exists public.book_copies (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete restrict,
  accession_number text not null unique,
  barcode text unique,
  shelf_location text,
  status public.copy_status not null default 'available',
  condition public.book_condition not null default 'good',
  acquired_at date not null default current_date,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint book_copies_retired_consistency check (
    (status = 'retired' and retired_at is not null) or (status <> 'retired')
  )
);

create index if not exists book_copies_book_status_idx on public.book_copies(book_id, status);
create index if not exists book_copies_shelf_idx on public.book_copies(shelf_location) where status <> 'retired';

create table if not exists public.inventory_movements (
  id bigint generated by default as identity primary key,
  copy_id uuid not null references public.book_copies(id) on delete restrict,
  from_status public.copy_status,
  to_status public.copy_status not null,
  reason text,
  actor_id uuid references public.profiles(id) on delete set null,
  loan_item_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists inventory_movements_copy_idx on public.inventory_movements(copy_id, created_at desc);

create table if not exists public.digital_editions (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null unique references public.books(id) on delete restrict,
  status public.edition_status not null default 'draft',
  published_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint digital_publication_consistency check (
    (status = 'published' and published_at is not null) or status <> 'published'
  )
);

create table if not exists public.book_chapters (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.digital_editions(id) on delete cascade,
  order_index integer not null,
  title text not null,
  content_text text not null,
  word_count integer not null default 0,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (edition_id, order_index),
  constraint book_chapters_order_valid check (order_index > 0),
  constraint book_chapters_content_required check (char_length(trim(content_text)) > 0)
);

create index if not exists book_chapters_edition_idx on public.book_chapters(edition_id, order_index);

create table if not exists public.borrow_baskets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  status public.basket_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  checked_out_at timestamptz
);

create unique index if not exists one_active_basket_per_user
  on public.borrow_baskets(user_id)
  where status = 'active';

create table if not exists public.basket_items (
  id uuid primary key default gen_random_uuid(),
  basket_id uuid not null references public.borrow_baskets(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete restrict,
  added_at timestamptz not null default now(),
  unique (basket_id, book_id)
);

create index if not exists basket_items_basket_idx on public.basket_items(basket_id, added_at);

create table if not exists public.loans (
  id uuid primary key default gen_random_uuid(),
  borrower_id uuid not null references public.profiles(id) on delete restrict,
  basket_id uuid references public.borrow_baskets(id) on delete set null,
  status public.loan_status not null default 'active',
  loan_days smallint not null,
  checked_out_at timestamptz not null default now(),
  returned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loans_days_valid check (loan_days between 1 and 7),
  constraint loans_return_consistency check (
    (status = 'returned' and returned_at is not null) or status <> 'returned'
  )
);

create index if not exists loans_borrower_idx on public.loans(borrower_id, checked_out_at desc);
create index if not exists loans_status_idx on public.loans(status, checked_out_at desc);

create table if not exists public.loan_items (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loans(id) on delete restrict,
  book_id uuid not null references public.books(id) on delete restrict,
  copy_id uuid not null references public.book_copies(id) on delete restrict,
  title_snapshot text,
  author_snapshot text,
  category_snapshot text,
  slug_snapshot text,
  cover_url_snapshot text,
  status public.loan_item_status not null default 'active',
  loan_days smallint not null,
  borrowed_at timestamptz not null default now(),
  due_at timestamptz not null,
  returned_at timestamptz,
  return_condition public.book_condition,
  fine_rate_pesewas integer not null default 350,
  overdue_periods_at_return integer,
  fine_amount_pesewas integer,
  fine_paid_pesewas integer not null default 0,
  return_accepted_at timestamptz,
  return_accepted_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loan_items_days_valid check (loan_days between 1 and 7),
  constraint loan_items_due_valid check (due_at > borrowed_at),
  constraint loan_items_fine_rate_valid check (fine_rate_pesewas = 350),
  constraint loan_items_fine_values_valid check (
    (overdue_periods_at_return is null or overdue_periods_at_return >= 0)
    and (fine_amount_pesewas is null or fine_amount_pesewas >= 0)
    and fine_paid_pesewas >= 0
    and (fine_amount_pesewas is null or fine_paid_pesewas <= fine_amount_pesewas)
  ),
  constraint loan_items_return_consistency check (
    (status = 'returned' and returned_at is not null) or status <> 'returned'
  )
);

alter table public.loan_items add column if not exists title_snapshot text;
alter table public.loan_items add column if not exists author_snapshot text;
alter table public.loan_items add column if not exists category_snapshot text;
alter table public.loan_items add column if not exists slug_snapshot text;
alter table public.loan_items add column if not exists cover_url_snapshot text;
alter table public.loan_items add column if not exists fine_rate_pesewas integer not null default 350;
alter table public.loan_items add column if not exists overdue_periods_at_return integer;
alter table public.loan_items add column if not exists fine_amount_pesewas integer;
alter table public.loan_items add column if not exists fine_paid_pesewas integer not null default 0;
alter table public.loan_items add column if not exists return_accepted_at timestamptz;
alter table public.loan_items add column if not exists return_accepted_by uuid references public.profiles(id) on delete restrict;

update public.loan_items
set overdue_periods_at_return = greatest(
      0,
      floor(extract(epoch from (returned_at - due_at)) / 86400)::integer
    ),
    fine_amount_pesewas = greatest(
      0,
      floor(extract(epoch from (returned_at - due_at)) / 86400)::integer
    ) * fine_rate_pesewas,
    return_accepted_at = coalesce(return_accepted_at, returned_at)
where status = 'returned'
  and returned_at is not null
  and (overdue_periods_at_return is null or fine_amount_pesewas is null or return_accepted_at is null);

alter table public.loan_items drop constraint if exists loan_items_fine_rate_valid;
alter table public.loan_items add constraint loan_items_fine_rate_valid
  check (fine_rate_pesewas = 350);
alter table public.loan_items drop constraint if exists loan_items_fine_values_valid;
alter table public.loan_items add constraint loan_items_fine_values_valid check (
  (overdue_periods_at_return is null or overdue_periods_at_return >= 0)
  and (fine_amount_pesewas is null or fine_amount_pesewas >= 0)
  and fine_paid_pesewas >= 0
  and (fine_amount_pesewas is null or fine_paid_pesewas <= fine_amount_pesewas)
);

alter table public.inventory_movements
  drop constraint if exists inventory_movements_loan_item_id_fkey;
alter table public.inventory_movements
  add constraint inventory_movements_loan_item_id_fkey
  foreign key (loan_item_id) references public.loan_items(id) on delete set null;

create unique index if not exists one_open_loan_per_copy
  on public.loan_items(copy_id)
  where status in ('active', 'lost');
create index if not exists loan_items_loan_idx on public.loan_items(loan_id);
create index if not exists loan_items_due_idx on public.loan_items(due_at) where status = 'active';
create index if not exists loan_items_book_idx on public.loan_items(book_id, borrowed_at desc);

alter table public.loan_items drop constraint if exists loan_items_copy_matches_book;
-- On reruns, the request-item FK also depends on this composite unique key.
-- Remove every dependent FK before rebuilding the key.
do $$ begin
  if to_regclass('public.borrow_request_items') is not null then
    execute 'alter table public.borrow_request_items drop constraint if exists borrow_request_items_copy_matches_book';
  end if;
end $$;
alter table public.book_copies drop constraint if exists book_copies_id_book_unique;
alter table public.book_copies add constraint book_copies_id_book_unique unique (id, book_id);
alter table public.loan_items add constraint loan_items_copy_matches_book
  foreign key (copy_id, book_id) references public.book_copies(id, book_id) on delete restrict;

-- A submitted request is a frozen basket snapshot. Copies and loans remain null
-- until a staff approval transaction successfully allocates every item.
create table if not exists public.borrow_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete restrict,
  basket_id uuid references public.borrow_baskets(id) on delete set null,
  status public.borrow_request_status not null default 'pending',
  fulfilment_method public.fulfilment_method not null,
  loan_days smallint not null,
  delivery_fee_pesewas integer not null default 0,
  delivery_location text,
  delivery_floor text,
  delivery_room text,
  payment_method public.simulated_payment_method,
  payment_status public.simulated_payment_status not null default 'not_required',
  payment_reference text,
  paid_at timestamptz,
  student_name_snapshot text not null,
  index_number_snapshot text not null,
  student_email_snapshot text not null,
  phone_snapshot text,
  residence_type_snapshot public.residence_type,
  residence_location_snapshot text,
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  dispatched_at timestamptz,
  dispatched_by uuid references public.profiles(id) on delete set null,
  student_received_at timestamptz,
  receipt_confirmed_by uuid references public.profiles(id) on delete set null,
  recalled_at timestamptz,
  recalled_by uuid references public.profiles(id) on delete set null,
  recall_reason text,
  recall_returned_at timestamptz,
  recall_returned_by uuid references public.profiles(id) on delete set null,
  rejection_reason text,
  cancelled_at timestamptz,
  loan_id uuid unique references public.loans(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint borrow_requests_days_valid check (loan_days between 1 and 7),
  constraint borrow_requests_delivery_valid check (
    (
      fulfilment_method = 'pickup'
      and delivery_fee_pesewas = 0
      and delivery_location is null
      and delivery_floor is null
      and delivery_room is null
      and payment_method is null
      and payment_status = 'not_required'
      and payment_reference is null
      and paid_at is null
    ) or (
      fulfilment_method = 'delivery'
      and delivery_fee_pesewas = 500
      and residence_type_snapshot = 'on-campus'
      and delivery_location is not null
      and char_length(trim(delivery_location)) between 2 and 200
      and delivery_floor is not null
      and char_length(trim(delivery_floor)) between 1 and 40
      and delivery_room is not null
      and char_length(trim(delivery_room)) between 1 and 40
      and payment_method is not null
      and payment_status = 'simulated_paid'
      and payment_reference is not null
      and paid_at is not null
    )
  ),
  constraint borrow_requests_state_valid check (
    (
      status = 'pending' and reviewed_at is null and reviewed_by is null
      and dispatched_at is null and dispatched_by is null
      and student_received_at is null and receipt_confirmed_by is null
      and rejection_reason is null and cancelled_at is null and loan_id is null
    ) or (
      status = 'approved' and reviewed_at is not null and reviewed_by is not null
      and rejection_reason is null and cancelled_at is null
      and (
        (
          fulfilment_method = 'pickup' and loan_id is not null
          and dispatched_at is null and dispatched_by is null
          and student_received_at is null and receipt_confirmed_by is null
        ) or (
          fulfilment_method = 'delivery'
          and (
            (
              loan_id is null and student_received_at is null and receipt_confirmed_by is null
              and (
                (dispatched_at is null and dispatched_by is null)
                or (dispatched_at is not null and dispatched_by is not null)
              )
            ) or (
              loan_id is not null and student_received_at is not null and receipt_confirmed_by = student_id
              and dispatched_at is not null and dispatched_by is not null
            )
          )
        )
      )
    ) or (
      status = 'rejected' and reviewed_at is not null and reviewed_by is not null
      and dispatched_at is null and dispatched_by is null
      and student_received_at is null and receipt_confirmed_by is null
      and rejection_reason is not null and cancelled_at is null and loan_id is null
    ) or (
      status = 'cancelled' and reviewed_at is null and reviewed_by is null
      and dispatched_at is null and dispatched_by is null
      and student_received_at is null and receipt_confirmed_by is null
      and rejection_reason is null and cancelled_at is not null and loan_id is null
    )
  )
);

alter table public.borrow_requests add column if not exists delivery_floor text;
alter table public.borrow_requests add column if not exists delivery_room text;
alter table public.borrow_requests add column if not exists payment_method public.simulated_payment_method;
alter table public.borrow_requests add column if not exists payment_status public.simulated_payment_status not null default 'not_required';
alter table public.borrow_requests add column if not exists payment_reference text;
alter table public.borrow_requests add column if not exists paid_at timestamptz;
alter table public.borrow_requests add column if not exists dispatched_at timestamptz;
alter table public.borrow_requests add column if not exists dispatched_by uuid references public.profiles(id) on delete set null;
alter table public.borrow_requests add column if not exists student_received_at timestamptz;
alter table public.borrow_requests add column if not exists receipt_confirmed_by uuid references public.profiles(id) on delete set null;
alter table public.borrow_requests add column if not exists recalled_at timestamptz;
alter table public.borrow_requests add column if not exists recalled_by uuid references public.profiles(id) on delete set null;
alter table public.borrow_requests add column if not exists recall_reason text;
alter table public.borrow_requests add column if not exists recall_returned_at timestamptz;
alter table public.borrow_requests add column if not exists recall_returned_by uuid references public.profiles(id) on delete set null;

-- Preserve any delivery requests created by the earlier preview. Historical
-- loans already started are treated as received; no payment secrets are made up.
update public.borrow_requests
set delivery_floor = coalesce(nullif(trim(delivery_floor), ''), 'Legacy floor'),
    delivery_room = coalesce(nullif(trim(delivery_room), ''), 'Legacy room'),
    payment_method = coalesce(payment_method, 'momo'::public.simulated_payment_method),
    payment_status = 'simulated_paid',
    payment_reference = coalesce(payment_reference, 'SIM-LEGACY-' || replace(id::text, '-', '')),
    paid_at = coalesce(paid_at, requested_at)
where fulfilment_method = 'delivery';

update public.borrow_requests
set dispatched_at = coalesce(dispatched_at, reviewed_at),
    dispatched_by = coalesce(dispatched_by, reviewed_by),
    student_received_at = coalesce(student_received_at, reviewed_at),
    receipt_confirmed_by = coalesce(receipt_confirmed_by, student_id)
where fulfilment_method = 'delivery' and status = 'approved' and loan_id is not null;

alter table public.borrow_requests drop constraint if exists borrow_requests_delivery_valid;
alter table public.borrow_requests add constraint borrow_requests_delivery_valid check (
  (
    fulfilment_method = 'pickup'
    and delivery_fee_pesewas = 0
    and delivery_location is null and delivery_floor is null and delivery_room is null
    and payment_method is null and payment_status = 'not_required'
    and payment_reference is null and paid_at is null
  ) or (
    fulfilment_method = 'delivery'
    and delivery_fee_pesewas = 500
    and residence_type_snapshot = 'on-campus'
    and delivery_location is not null and char_length(trim(delivery_location)) between 2 and 200
    and delivery_floor is not null and char_length(trim(delivery_floor)) between 1 and 40
    and delivery_room is not null and char_length(trim(delivery_room)) between 1 and 40
    and payment_method is not null and payment_status = 'simulated_paid'
    and payment_reference is not null and paid_at is not null
  )
);

alter table public.borrow_requests drop constraint if exists borrow_requests_state_valid;
alter table public.borrow_requests add constraint borrow_requests_state_valid check (
  (
    status = 'pending' and reviewed_at is null and reviewed_by is null
    and dispatched_at is null and dispatched_by is null
    and student_received_at is null and receipt_confirmed_by is null
    and recalled_at is null and recalled_by is null and recall_reason is null
    and recall_returned_at is null and recall_returned_by is null
    and rejection_reason is null and cancelled_at is null and loan_id is null
  ) or (
    status = 'approved' and reviewed_at is not null and reviewed_by is not null
    and rejection_reason is null and cancelled_at is null
    and recalled_at is null and recalled_by is null and recall_reason is null
    and recall_returned_at is null and recall_returned_by is null
    and (
      (
        fulfilment_method = 'pickup' and loan_id is not null
        and dispatched_at is null and dispatched_by is null
        and student_received_at is null and receipt_confirmed_by is null
      ) or (
        fulfilment_method = 'delivery'
        and (
          (
            loan_id is null and student_received_at is null and receipt_confirmed_by is null
            and (
              (dispatched_at is null and dispatched_by is null)
              or (dispatched_at is not null and dispatched_by is not null)
            )
          ) or (
            loan_id is not null and student_received_at is not null and receipt_confirmed_by = student_id
            and dispatched_at is not null and dispatched_by is not null
          )
        )
      )
    )
  ) or (
    status = 'rejected' and reviewed_at is not null and reviewed_by is not null
    and student_received_at is null and receipt_confirmed_by is null
    and rejection_reason is not null and cancelled_at is null and loan_id is null
    and (
      (
        recalled_at is null and recalled_by is null and recall_reason is null
        and recall_returned_at is null and recall_returned_by is null
        and dispatched_at is null and dispatched_by is null
      ) or (
        fulfilment_method = 'delivery'
        and recalled_at is not null and recalled_by is not null
        and recall_reason is not null and char_length(trim(recall_reason)) between 3 and 300
        and (
          (
            dispatched_at is null and dispatched_by is null
            and recall_returned_at is not null and recall_returned_by = recalled_by
          ) or (
            dispatched_at is not null and dispatched_by is not null
            and (
              (recall_returned_at is null and recall_returned_by is null)
              or (recall_returned_at is not null and recall_returned_by is not null)
            )
          )
        )
      )
    )
  ) or (
    status = 'cancelled' and reviewed_at is null and reviewed_by is null
    and dispatched_at is null and dispatched_by is null
    and student_received_at is null and receipt_confirmed_by is null
    and recalled_at is null and recalled_by is null and recall_reason is null
    and recall_returned_at is null and recall_returned_by is null
    and rejection_reason is null and cancelled_at is not null and loan_id is null
  )
);

drop index if exists public.borrow_requests_borrower_idx;
create index if not exists borrow_requests_student_idx
  on public.borrow_requests(student_id, requested_at desc);
create index if not exists borrow_requests_staff_queue_idx
  on public.borrow_requests(status, requested_at);
create unique index if not exists borrow_requests_payment_reference_unique
  on public.borrow_requests(payment_reference) where payment_reference is not null;

create table if not exists public.borrow_request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.borrow_requests(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete restrict,
  title_snapshot text not null,
  author_snapshot text not null,
  category_snapshot text not null,
  slug_snapshot text not null,
  isbn_snapshot text,
  cover_url_snapshot text,
  allocated_copy_id uuid references public.book_copies(id) on delete restrict,
  loan_item_id uuid unique references public.loan_items(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (request_id, book_id),
  constraint borrow_request_item_allocation_consistency check (
    (allocated_copy_id is null) = (loan_item_id is null)
  )
);

create index if not exists borrow_request_items_request_idx
  on public.borrow_request_items(request_id, created_at, id);
create index if not exists borrow_request_items_book_idx
  on public.borrow_request_items(book_id, request_id);

alter table public.borrow_request_items
  drop constraint if exists borrow_request_items_copy_matches_book;
alter table public.borrow_request_items
  add constraint borrow_request_items_copy_matches_book
  foreign key (allocated_copy_id, book_id)
  references public.book_copies(id, book_id) on delete restrict;

alter table public.borrow_request_items drop constraint if exists borrow_request_item_allocation_consistency;
alter table public.borrow_request_items add constraint borrow_request_item_allocation_consistency check (
  loan_item_id is null or allocated_copy_id is not null
);

-- Simulated fine payments are immutable receipts for the exact outstanding
-- balance of one tracked loan item. The client never supplies an amount. A
-- unique authoritative fine total makes retries idempotent while allowing a
-- later payment when another completed 24-hour overdue period accrues.
create table if not exists public.fine_payments (
  id uuid primary key default gen_random_uuid(),
  loan_item_id uuid not null references public.loan_items(id) on delete restrict,
  loan_id uuid not null references public.loans(id) on delete restrict,
  student_id uuid not null references public.profiles(id) on delete restrict,
  fine_total_pesewas integer not null,
  amount_pesewas integer not null,
  balance_before_pesewas integer not null,
  balance_after_pesewas integer not null default 0,
  payment_method public.simulated_payment_method not null,
  status public.simulated_payment_status not null default 'simulated_paid',
  payment_reference text not null unique,
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint fine_payments_amounts_valid check (
    fine_total_pesewas > 0
    and amount_pesewas > 0
    and balance_before_pesewas = amount_pesewas
    and balance_after_pesewas = 0
    and amount_pesewas <= fine_total_pesewas
  ),
  constraint fine_payments_status_valid check (status = 'simulated_paid'),
  constraint fine_payments_reference_valid check (
    payment_reference ~ '^KLM-FINE-[A-F0-9]{20}$'
  ),
  unique (loan_item_id, fine_total_pesewas)
);

create index if not exists fine_payments_student_idx
  on public.fine_payments(student_id, paid_at desc);
create index if not exists fine_payments_loan_idx
  on public.fine_payments(loan_id, paid_at desc);

-- A return is requested by the borrower but only becomes a physical return
-- after an active librarian/admin accepts custody of the exact tracked copy.
-- Fine snapshots use integer pesewas; 350 pesewas = GHS 3.50.
create table if not exists public.return_requests (
  id uuid primary key default gen_random_uuid(),
  loan_item_id uuid not null references public.loan_items(id) on delete restrict,
  loan_id uuid not null references public.loans(id) on delete restrict,
  student_id uuid not null references public.profiles(id) on delete restrict,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  request_source text not null default 'student',
  status public.return_request_status not null default 'pending',
  requested_at timestamptz not null default now(),
  cancelled_at timestamptz,
  accepted_at timestamptz,
  accepted_by uuid references public.profiles(id) on delete restrict,
  return_condition public.book_condition,
  fine_rate_pesewas integer,
  overdue_periods_at_acceptance integer,
  fine_amount_pesewas integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint return_requests_source_valid check (request_source in ('student', 'staff_direct')),
  constraint return_requests_requester_valid check (
    request_source <> 'student' or requested_by = student_id
  ),
  constraint return_requests_rate_valid check (fine_rate_pesewas is null or fine_rate_pesewas = 350),
  constraint return_requests_fine_values_valid check (
    (overdue_periods_at_acceptance is null or overdue_periods_at_acceptance >= 0)
    and (fine_amount_pesewas is null or fine_amount_pesewas >= 0)
  ),
  constraint return_requests_state_valid check (
    (
      status = 'pending'
      and cancelled_at is null and accepted_at is null and accepted_by is null
      and return_condition is null and fine_rate_pesewas is null
      and overdue_periods_at_acceptance is null and fine_amount_pesewas is null
    ) or (
      status = 'accepted'
      and cancelled_at is null and accepted_at is not null and accepted_by is not null
      and return_condition is not null and fine_rate_pesewas = 350
      and overdue_periods_at_acceptance is not null and fine_amount_pesewas is not null
    ) or (
      status = 'cancelled'
      and cancelled_at is not null and accepted_at is null and accepted_by is null
      and return_condition is null and fine_rate_pesewas is null
      and overdue_periods_at_acceptance is null and fine_amount_pesewas is null
    )
  )
);

alter table public.return_requests drop constraint if exists return_requests_requester_valid;
alter table public.return_requests add constraint return_requests_requester_valid check (
  request_source <> 'student' or requested_by = student_id
);

create unique index if not exists one_pending_return_request_per_loan_item
  on public.return_requests(loan_item_id)
  where status = 'pending';
create unique index if not exists one_accepted_return_request_per_loan_item
  on public.return_requests(loan_item_id)
  where status = 'accepted';
create index if not exists return_requests_student_idx
  on public.return_requests(student_id, requested_at desc);
create index if not exists return_requests_staff_queue_idx
  on public.return_requests(status, requested_at, id);

-- Exact financial/custody identity: a receipt or return request cannot combine
-- a valid item, loan, and student that belong to different borrow records.
alter table public.fine_payments drop constraint if exists fine_payments_exact_loan_item_fkey;
alter table public.fine_payments drop constraint if exists fine_payments_exact_borrower_fkey;
alter table public.return_requests drop constraint if exists return_requests_exact_loan_item_fkey;
alter table public.return_requests drop constraint if exists return_requests_exact_borrower_fkey;
alter table public.loan_items drop constraint if exists loan_items_id_loan_unique;
alter table public.loans drop constraint if exists loans_id_borrower_unique;
alter table public.loan_items add constraint loan_items_id_loan_unique unique (id, loan_id);
alter table public.loans add constraint loans_id_borrower_unique unique (id, borrower_id);
alter table public.fine_payments add constraint fine_payments_exact_loan_item_fkey
  foreign key (loan_item_id, loan_id) references public.loan_items(id, loan_id) on delete restrict;
alter table public.fine_payments add constraint fine_payments_exact_borrower_fkey
  foreign key (loan_id, student_id) references public.loans(id, borrower_id) on delete restrict;
alter table public.return_requests add constraint return_requests_exact_loan_item_fkey
  foreign key (loan_item_id, loan_id) references public.loan_items(id, loan_id) on delete restrict;
alter table public.return_requests add constraint return_requests_exact_borrower_fkey
  foreign key (loan_id, student_id) references public.loans(id, borrower_id) on delete restrict;

alter table public.loan_items add column if not exists return_request_id uuid;
alter table public.loan_items drop constraint if exists loan_items_return_request_id_fkey;
alter table public.loan_items add constraint loan_items_return_request_id_fkey
  foreign key (return_request_id) references public.return_requests(id) on delete restrict;
create unique index if not exists loan_items_return_request_unique
  on public.loan_items(return_request_id)
  where return_request_id is not null;

create table if not exists public.favorites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, book_id)
);

create table if not exists public.reading_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  edition_id uuid not null references public.digital_editions(id) on delete cascade,
  chapter_id uuid references public.book_chapters(id) on delete set null,
  progress_percent numeric(5,2) not null default 0,
  last_position jsonb not null default '{}'::jsonb,
  last_read_at timestamptz not null default now(),
  primary key (user_id, edition_id),
  constraint reading_progress_range check (progress_percent between 0 and 100)
);

alter table public.reading_progress drop constraint if exists reading_progress_chapter_matches_edition;
alter table public.book_chapters drop constraint if exists book_chapters_id_edition_unique;
alter table public.book_chapters add constraint book_chapters_id_edition_unique unique (id, edition_id);
alter table public.reading_progress add constraint reading_progress_chapter_matches_edition
  foreign key (chapter_id, edition_id) references public.book_chapters(id, edition_id) on delete no action;

alter table public.book_copies drop constraint if exists book_copies_retired_consistency;
alter table public.book_copies add constraint book_copies_retired_consistency
  check ((status = 'retired') = (retired_at is not null)) not valid;
alter table public.borrow_baskets drop constraint if exists baskets_checkout_consistency;
alter table public.borrow_baskets add constraint baskets_checkout_consistency
  check ((status = 'checked_out') = (checked_out_at is not null)) not valid;
alter table public.loans drop constraint if exists loans_return_consistency;
alter table public.loans add constraint loans_return_consistency
  check ((status = 'returned') = (returned_at is not null)) not valid;
alter table public.loan_items drop constraint if exists loan_items_return_consistency;
alter table public.loan_items add constraint loan_items_return_consistency
  check ((status = 'returned') = (returned_at is not null)) not valid;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  dedupe_key text unique,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_unread_idx
  on public.notifications(user_id, created_at desc)
  where read_at is null;

create table if not exists public.audit_events (
  id bigint generated by default as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_events_created_idx on public.audit_events(created_at desc);
create index if not exists audit_events_entity_idx on public.audit_events(entity_type, entity_id, created_at desc);

-- One-use server credentials bridge Auth user creation to librarian profile
-- finalisation without trusting user-editable metadata. Only the service role
-- can create these short-lived intents; handle_new_user consumes them.
create table if not exists public.librarian_provisioning_intents (
  token_hash text primary key,
  personal_email text not null,
  staff_id text not null,
  provisioned_role public.app_role not null default 'librarian',
  actor_id uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint librarian_intents_token_hash_format check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint librarian_intents_email_normalized check (
    personal_email = lower(trim(personal_email))
    and personal_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  constraint librarian_intents_staff_id_required check (
    staff_id = upper(trim(staff_id)) and char_length(staff_id) between 3 and 50
  ),
  constraint librarian_intents_short_lived check (
    expires_at > created_at and expires_at <= created_at + interval '10 minutes'
  )
);

alter table public.librarian_provisioning_intents
  add column if not exists provisioned_role public.app_role not null default 'librarian';
alter table public.librarian_provisioning_intents
  drop constraint if exists librarian_intents_role_valid;
alter table public.librarian_provisioning_intents
  add constraint librarian_intents_role_valid
  check (provisioned_role in ('librarian', 'admin'));

create index if not exists librarian_provisioning_intents_expiry_idx
  on public.librarian_provisioning_intents(expires_at);

create table if not exists public.library_settings (
  id boolean primary key default true check (id),
  max_active_books smallint not null default 5 check (max_active_books between 1 and 10),
  max_loan_days smallint not null default 7 check (max_loan_days between 1 and 7),
  reminder_hours integer not null default 48 check (reminder_hours between 1 and 168),
  reminders_enabled boolean not null default true,
  signup_locked boolean not null default false,
  library_name text not null default 'KNUST Library Mall',
  desk_location text not null default 'Main Library, Ground Floor',
  support_email text not null default 'library@knust.edu.gh',
  opening_hours text not null default 'Monday–Friday, 8:00 AM–10:00 PM',
  delivery_fee_pesewas integer not null default 500 check (delivery_fee_pesewas = 500),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.library_settings add column if not exists reminders_enabled boolean not null default true;
alter table public.library_settings add column if not exists signup_locked boolean not null default false;
update public.library_settings set signup_locked = false where signup_locked is null;
alter table public.library_settings alter column signup_locked set default false;
alter table public.library_settings alter column signup_locked set not null;
alter table public.library_settings add column if not exists delivery_fee_pesewas integer not null default 500;
alter table public.library_settings drop constraint if exists library_settings_delivery_fee_fixed;
alter table public.library_settings add constraint library_settings_delivery_fee_fixed check (delivery_fee_pesewas = 500);

insert into public.library_settings(id) values (true) on conflict (id) do nothing;

-- Generic maintenance triggers.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Keep the allow-list claim pair consistent when an incomplete Auth account
-- is deleted. The foreign key clears claimed_by; this trigger clears the
-- matching timestamp so the same registered student may retry safely.
create or replace function public.sync_student_signup_claim()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.claimed_by is null then
    new.claimed_at := null;
  elsif old.claimed_by is distinct from new.claimed_by then
    new.claimed_at := now();
  elsif new.claimed_at is null then
    new.claimed_at := coalesce(old.claimed_at, now());
  end if;
  return new;
end;
$$;

create or replace function public.set_chapter_word_count()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.word_count := case
    when trim(new.content_text) = '' then 0
    else array_length(regexp_split_to_array(trim(new.content_text), E'\\s+'), 1)
  end;
  return new;
end;
$$;

create or replace function public.increment_book_borrow_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.books set borrow_count = borrow_count + 1 where id = new.book_id;
  return new;
end;
$$;

create or replace function public.audit_signup_lock_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.signup_locked is distinct from new.signup_locked then
    insert into public.audit_events(actor_id, event_type, entity_type, entity_id, metadata)
    values (
      auth.uid(),
      case when new.signup_locked then 'signup_lock_enabled' else 'signup_lock_disabled' end,
      'library_settings',
      'global',
      jsonb_build_object('previous', old.signup_locked, 'current', new.signup_locked)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists student_private_profiles_set_updated_at on public.student_private_profiles;
create trigger student_private_profiles_set_updated_at before update on public.student_private_profiles for each row execute function public.set_updated_at();
drop trigger if exists presentation_student_registry_set_updated_at on public.presentation_student_registry;
create trigger presentation_student_registry_set_updated_at before update on public.presentation_student_registry for each row execute function public.set_updated_at();
drop trigger if exists student_signup_allowlist_set_updated_at on public.student_signup_allowlist;
create trigger student_signup_allowlist_set_updated_at before update on public.student_signup_allowlist for each row execute function public.set_updated_at();
drop trigger if exists student_signup_allowlist_sync_claim on public.student_signup_allowlist;
create trigger student_signup_allowlist_sync_claim
  before update of claimed_by on public.student_signup_allowlist
  for each row execute function public.sync_student_signup_claim();
drop trigger if exists categories_set_updated_at on public.categories;
create trigger categories_set_updated_at before update on public.categories for each row execute function public.set_updated_at();
drop trigger if exists authors_set_updated_at on public.authors;
create trigger authors_set_updated_at before update on public.authors for each row execute function public.set_updated_at();
drop trigger if exists books_set_updated_at on public.books;
create trigger books_set_updated_at before update on public.books for each row execute function public.set_updated_at();
drop trigger if exists copies_set_updated_at on public.book_copies;
create trigger copies_set_updated_at before update on public.book_copies for each row execute function public.set_updated_at();
drop trigger if exists editions_set_updated_at on public.digital_editions;
create trigger editions_set_updated_at before update on public.digital_editions for each row execute function public.set_updated_at();
drop trigger if exists chapters_set_updated_at on public.book_chapters;
create trigger chapters_set_updated_at before update on public.book_chapters for each row execute function public.set_updated_at();
drop trigger if exists chapters_set_word_count on public.book_chapters;
create trigger chapters_set_word_count before insert or update of content_text on public.book_chapters for each row execute function public.set_chapter_word_count();
drop trigger if exists baskets_set_updated_at on public.borrow_baskets;
create trigger baskets_set_updated_at before update on public.borrow_baskets for each row execute function public.set_updated_at();
drop trigger if exists loans_set_updated_at on public.loans;
create trigger loans_set_updated_at before update on public.loans for each row execute function public.set_updated_at();
drop trigger if exists loan_items_set_updated_at on public.loan_items;
create trigger loan_items_set_updated_at before update on public.loan_items for each row execute function public.set_updated_at();
drop trigger if exists return_requests_set_updated_at on public.return_requests;
create trigger return_requests_set_updated_at before update on public.return_requests for each row execute function public.set_updated_at();
drop trigger if exists borrow_requests_set_updated_at on public.borrow_requests;
create trigger borrow_requests_set_updated_at before update on public.borrow_requests for each row execute function public.set_updated_at();
drop trigger if exists library_settings_set_updated_at on public.library_settings;
create trigger library_settings_set_updated_at before update on public.library_settings for each row execute function public.set_updated_at();
drop trigger if exists library_settings_signup_lock_audit on public.library_settings;
create trigger library_settings_signup_lock_audit
  after update of signup_locked on public.library_settings
  for each row execute function public.audit_signup_lock_change();
drop trigger if exists loan_items_increment_book_borrows on public.loan_items;
create trigger loan_items_increment_book_borrows
  after insert on public.loan_items
  for each row execute function public.increment_book_borrow_count();

update public.books b
set borrow_count = (select count(*)::integer from public.loan_items li where li.book_id = b.id);

update public.loan_items li
set title_snapshot = coalesce(li.title_snapshot, b.title),
    author_snapshot = coalesce(li.author_snapshot, a.name),
    category_snapshot = coalesce(li.category_snapshot, c.name),
    slug_snapshot = coalesce(li.slug_snapshot, b.slug),
    cover_url_snapshot = coalesce(li.cover_url_snapshot, b.cover_url)
from public.books b
join public.authors a on a.id = b.author_id
join public.categories c on c.id = b.category_id
where b.id = li.book_id
  and (li.title_snapshot is null or li.author_snapshot is null or li.category_snapshot is null or li.slug_snapshot is null);

-- Student identity is created only when all institutional credentials are valid.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_full_name text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '');
  v_index_number text := nullif(upper(regexp_replace(trim(coalesce(new.raw_user_meta_data ->> 'index_number', '')), '\s+', '', 'g')), '');
  v_personal_email text := lower(trim(coalesce(new.email, '')));
  v_student_email text := lower(trim(coalesce(new.raw_user_meta_data ->> 'student_email', '')));
  v_start_year smallint := case
    when coalesce(new.raw_user_meta_data ->> 'start_year', '') ~ '^[0-9]{4}$'
      then (new.raw_user_meta_data ->> 'start_year')::smallint
    else null
  end;
  v_completion_year smallint := case
    when coalesce(new.raw_user_meta_data ->> 'completion_year', '') ~ '^[0-9]{4}$'
      then (new.raw_user_meta_data ->> 'completion_year')::smallint
    else null
  end;
  v_gender public.student_gender := case new.raw_user_meta_data ->> 'gender'
    when 'female' then 'female'::public.student_gender
    when 'male' then 'male'::public.student_gender
    when 'non-binary' then 'non-binary'::public.student_gender
    when 'prefer-not-to-say' then 'prefer-not-to-say'::public.student_gender
    else null
  end;
  v_residence public.residence_type := case new.raw_user_meta_data ->> 'residence'
    when 'on-campus' then 'on-campus'::public.residence_type
    when 'off-campus' then 'off-campus'::public.residence_type
    else null
  end;
  v_student_id_status text := case new.raw_user_meta_data ->> 'student_id_status'
    when 'uploaded_private' then 'uploaded_private'
    when 'verified' then 'verified'
    when 'rejected' then 'rejected'
    else 'pending_storage'
  end;
  v_student_id_path text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'student_id_object_path', '')), '');
  v_provisioning_token text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'provisioning_token', '')), '');
  v_provisioning_actor_id uuid;
  v_provisioned_role public.app_role;
  v_signup_locked boolean;
  v_registry_demo_number smallint;
  v_registry_index_number text;
  v_registry_auth_user_id uuid;
  v_presentation_number smallint := case
    when coalesce(new.raw_user_meta_data ->> 'presentation_account', '') = 'true'
      and coalesce(new.raw_user_meta_data ->> 'presentation_number', '') ~ '^[0-9]{1,2}$'
      then (new.raw_user_meta_data ->> 'presentation_number')::smallint
    else null
  end;
  v_allow_number smallint;
  v_allow_index_number text;
  v_allow_claimed_by uuid;
begin
  -- Provisioning tokens are random, single-use, short-lived, stored only as a
  -- SHA-256 digest, and bound to the exact email and generated staff ID. The
  -- issuing administrator must still be active when Auth consumes the intent.
  delete from public.librarian_provisioning_intents
  where expires_at <= now();

  if v_provisioning_token is not null and char_length(v_provisioning_token) between 32 and 256 then
    delete from public.librarian_provisioning_intents intent
    using public.profiles actor
    where intent.actor_id = actor.id
      and actor.status = 'active'
      and actor.admin_access_revoked_at is null
      and (
        (intent.provisioned_role = 'librarian' and actor.role in ('admin', 'super_admin'))
        or (intent.provisioned_role = 'admin' and actor.role = 'super_admin')
      )
      and intent.token_hash = encode(extensions.digest(v_provisioning_token, 'sha256'), 'hex')
      and intent.personal_email = v_personal_email
      and intent.staff_id = v_index_number
      and intent.expires_at > now()
    returning intent.actor_id, intent.provisioned_role
    into v_provisioning_actor_id, v_provisioned_role;
  end if;

  if v_provisioned_role in ('librarian', 'admin') then
    if v_full_name is null or char_length(v_full_name) < 2 then raise exception 'A valid staff name is required'; end if;
    if v_index_number is null or char_length(v_index_number) < 3 then raise exception 'A valid staff ID is required'; end if;
    if v_personal_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'A valid personal email is required'; end if;

    insert into public.profiles(
      id, full_name, index_number, email, personal_email, student_email, role, status
    ) values (
      new.id, v_full_name, v_index_number, v_personal_email, v_personal_email, null, v_provisioned_role, 'active'
    )
    on conflict (id) do update set
      full_name = excluded.full_name,
      index_number = excluded.index_number,
      email = excluded.email,
      personal_email = excluded.personal_email,
      student_email = null,
      role = v_provisioned_role,
      status = 'active';

    insert into public.audit_events(actor_id, event_type, entity_type, entity_id, metadata)
    values (
      v_provisioning_actor_id,
      case when v_provisioned_role = 'admin' then 'administrator_auth_provisioned' else 'librarian_auth_provisioned' end,
      'profile', new.id::text,
      jsonb_build_object(
        'staff_id', v_index_number,
        'email', v_personal_email,
        'role', v_provisioned_role,
        'source', case when v_provisioning_actor_id is null then 'auth_admin_api' else 'service_provisioning_intent' end
      )
    );
    return new;
  end if;

  -- Public student registration is gated here as the final authority so a
  -- caller cannot bypass the application endpoint by calling Auth directly.
  -- The shared row lock serializes this decision with an administrator
  -- enabling the lock. Trusted librarian provisioning returned above.
  select ls.signup_locked
  into v_signup_locked
  from public.library_settings ls
  where ls.id = true
  for share;

  if v_signup_locked is distinct from false then
    raise exception using errcode = 'P0001', message = 'NEW_SIGNUPS_SUSPENDED';
  end if;

  if v_full_name is null or char_length(v_full_name) < 2 then raise exception 'A valid full name is required'; end if;
  if v_index_number is null or v_index_number !~ '^([0-9]{8,12}|[A-Z]{2,5}/[A-Z]{2,8}/[0-9]{2}/[0-9]{3,6})$' then raise exception 'A valid KNUST student ID is required'; end if;
  if v_personal_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or v_personal_email ~ '@st\.knust\.edu\.gh$' then raise exception 'A separate personal email is required'; end if;
  if v_student_email !~ '^[^[:space:]@]+@st\.knust\.edu\.gh$' then raise exception 'A valid KNUST student email is required'; end if;
  if v_personal_email = v_student_email then raise exception 'Personal and student emails must be different'; end if;

  -- Presentation seeding is the only exception to the fresh-signup allow-list.
  -- Auth triggers execute as Supabase's managed auth database role, so they
  -- cannot infer which HTTP API key called GoTrue. Require the explicit demo
  -- marker and make every identity field match the exact private presentation
  -- record instead. Normal application signups never send this marker and are
  -- always checked against student_signup_allowlist below.
  if v_presentation_number between 1 and 19 then
    select
      registry.demo_number,
      upper(regexp_replace(trim(registry.index_number), '\s+', '', 'g')),
      registry.auth_user_id
    into v_registry_demo_number, v_registry_index_number, v_registry_auth_user_id
    from public.presentation_student_registry registry
    where registry.demo_number = v_presentation_number
      and lower(trim(registry.personal_email)) = v_personal_email
      and lower(trim(registry.student_email)) = v_student_email
      and upper(regexp_replace(trim(registry.index_number), '\s+', '', 'g')) = v_index_number
      and trim(registry.full_name) = v_full_name
    for update;
  end if;

  if v_registry_demo_number is not null then
    if v_registry_auth_user_id is not null and v_registry_auth_user_id is distinct from new.id then
      raise exception using errcode = 'P0001', message = 'PRESENTATION_STUDENT_ALREADY_PROVISIONED';
    end if;
  else
    -- A normal institutional email is an allow-list identity, not merely a
    -- syntactically valid address. Lock the row so concurrent Auth inserts
    -- cannot claim the same student, and bind it to the exact student ID.
    select
      allowed.allow_number,
      upper(regexp_replace(trim(allowed.index_number), '\s+', '', 'g')),
      allowed.claimed_by
    into v_allow_number, v_allow_index_number, v_allow_claimed_by
    from public.student_signup_allowlist allowed
    where allowed.student_email = v_student_email
      and allowed.is_active
    for update;

    if v_allow_number is null then
      raise exception using errcode = 'P0001', message = 'STUDENT_EMAIL_NOT_AUTHORIZED';
    end if;
    if v_allow_index_number is distinct from v_index_number then
      raise exception using errcode = 'P0001', message = 'STUDENT_REGISTRY_ID_MISMATCH';
    end if;
    if v_allow_claimed_by is not null and v_allow_claimed_by is distinct from new.id then
      raise exception using errcode = 'P0001', message = 'STUDENT_REGISTRY_ALREADY_CLAIMED';
    end if;
  end if;

  insert into public.profiles(id, full_name, index_number, email, personal_email, student_email, role)
  values (
    new.id,
    v_full_name,
    v_index_number,
    v_personal_email,
    v_personal_email,
    v_student_email,
    'student'
  )
  on conflict (id) do update set
    email = excluded.email,
    personal_email = excluded.personal_email,
    student_email = excluded.student_email,
    updated_at = now();

  insert into public.student_private_profiles(
    profile_id, department, programme, start_year, completion_year, gender,
    residence_type, residence_location, phone, guardian_full_name, guardian_phone,
    guardian_relationship, student_id_object_path, student_id_status, student_id_uploaded_at,
    student_record_check_status, facial_scan_status, identity_verification_mode,
    identity_verification_completed_at, identity_consent_at, identity_consent_scope,
    privacy_notice_version
  ) values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'department', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'programme', '')), ''),
    v_start_year,
    v_completion_year,
    v_gender,
    v_residence,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'location', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'phone', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'guardian_full_name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'guardian_phone', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'guardian_relationship', '')), ''),
    v_student_id_path,
    v_student_id_status,
    case when v_student_id_path is not null then now() else null end,
    case new.raw_user_meta_data ->> 'student_record_check_status'
      when 'simulated_passed' then 'simulated_passed'
      when 'verified' then 'verified'
      when 'failed' then 'failed'
      else 'pending'
    end,
    case new.raw_user_meta_data ->> 'facial_scan_status'
      when 'simulated_completed_no_biometric_match' then 'simulated_completed_no_biometric_match'
      else 'not_started'
    end,
    case new.raw_user_meta_data ->> 'identity_verification_mode'
      when 'simulation' then 'simulation'
      when 'manual' then 'manual'
      else null
    end,
    case
      when nullif(new.raw_user_meta_data ->> 'identity_verification_completed_at', '') is not null then now()
      else null
    end,
    case
      when nullif(new.raw_user_meta_data ->> 'identity_consent_at', '') is not null then now()
      else null
    end,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'identity_consent_scope', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'privacy_notice_version', '')), '')
  )
  on conflict (profile_id) do update set
    department = coalesce(excluded.department, public.student_private_profiles.department),
    programme = coalesce(excluded.programme, public.student_private_profiles.programme),
    start_year = coalesce(excluded.start_year, public.student_private_profiles.start_year),
    completion_year = coalesce(excluded.completion_year, public.student_private_profiles.completion_year),
    gender = coalesce(excluded.gender, public.student_private_profiles.gender),
    residence_type = coalesce(excluded.residence_type, public.student_private_profiles.residence_type),
    residence_location = coalesce(excluded.residence_location, public.student_private_profiles.residence_location),
    phone = coalesce(excluded.phone, public.student_private_profiles.phone),
    student_id_object_path = coalesce(excluded.student_id_object_path, public.student_private_profiles.student_id_object_path),
    student_id_status = case
      when excluded.student_id_object_path is not null then excluded.student_id_status
      else public.student_private_profiles.student_id_status
    end,
    student_id_uploaded_at = coalesce(excluded.student_id_uploaded_at, public.student_private_profiles.student_id_uploaded_at),
    student_record_check_status = excluded.student_record_check_status,
    facial_scan_status = excluded.facial_scan_status,
    identity_verification_mode = coalesce(excluded.identity_verification_mode, public.student_private_profiles.identity_verification_mode),
    identity_verification_completed_at = coalesce(excluded.identity_verification_completed_at, public.student_private_profiles.identity_verification_completed_at),
    identity_consent_at = coalesce(excluded.identity_consent_at, public.student_private_profiles.identity_consent_at),
    identity_consent_scope = coalesce(excluded.identity_consent_scope, public.student_private_profiles.identity_consent_scope),
    privacy_notice_version = coalesce(excluded.privacy_notice_version, public.student_private_profiles.privacy_notice_version);

  -- Claim the locked source record only after every profile write succeeds.
  -- Any later trigger error rolls this and the Auth user back together.
  if v_registry_demo_number is not null then
    update public.presentation_student_registry
    set auth_user_id = new.id,
        provisioned_at = coalesce(provisioned_at, now())
    where demo_number = v_registry_demo_number;
  else
    update public.student_signup_allowlist
    set claimed_by = new.id,
        claimed_at = coalesce(claimed_at, now())
    where allow_number = v_allow_number;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for auth users that existed before this script.
insert into public.profiles(id, full_name, index_number, email, personal_email, student_email)
select
  u.id,
  nullif(trim(coalesce(u.raw_user_meta_data ->> 'full_name', '')), ''),
  nullif(upper(regexp_replace(trim(coalesce(u.raw_user_meta_data ->> 'index_number', '')), '\s+', '', 'g')), ''),
  lower(u.email),
  lower(u.email),
  nullif(lower(trim(coalesce(u.raw_user_meta_data ->> 'student_email', ''))), '')
from auth.users u
on conflict (id) do nothing;

insert into public.student_private_profiles(profile_id)
select p.id
from public.profiles p
where p.role = 'student'
on conflict (profile_id) do nothing;

-- Replay non-role intake metadata for students created by an earlier app
-- version. This never grants borrowing by itself: overall verification stays
-- pending until an administrator reviews the legacy identity or the current
-- signup server finalises a genuinely stored private ID object.
-- Drop the checks temporarily because untrusted legacy metadata must be
-- normalized before the final constraints are installed. The whole script is
-- transactional, so no unconstrained state is externally visible.
alter table public.student_private_profiles drop constraint if exists student_private_years_valid;
alter table public.student_private_profiles drop constraint if exists student_private_phone_length;
alter table public.student_private_profiles drop constraint if exists student_private_guardian_phone_length;
alter table public.student_private_profiles drop constraint if exists student_private_id_path_owned;
alter table public.student_private_profiles drop constraint if exists student_private_id_status_valid;
alter table public.student_private_profiles drop constraint if exists student_private_id_upload_consistency;
alter table public.student_private_profiles drop constraint if exists student_private_record_status_valid;
alter table public.student_private_profiles drop constraint if exists student_private_face_status_valid;
alter table public.student_private_profiles drop constraint if exists student_private_face_snapshot_path_owned;
alter table public.student_private_profiles drop constraint if exists student_private_face_snapshot_consistency;
alter table public.student_private_profiles drop constraint if exists student_private_verification_mode_valid;
alter table public.student_private_profiles drop constraint if exists student_private_verification_consistency;

update public.student_private_profiles spp
set department = coalesce(spp.department, nullif(trim(coalesce(u.raw_user_meta_data ->> 'department', '')), '')),
    programme = coalesce(spp.programme, nullif(trim(coalesce(u.raw_user_meta_data ->> 'programme', '')), '')),
    start_year = coalesce(spp.start_year, case
      when coalesce(u.raw_user_meta_data ->> 'start_year', '') ~ '^[0-9]{4}$'
        then (u.raw_user_meta_data ->> 'start_year')::smallint
      else null
    end),
    completion_year = coalesce(spp.completion_year, case
      when coalesce(u.raw_user_meta_data ->> 'completion_year', '') ~ '^[0-9]{4}$'
        then (u.raw_user_meta_data ->> 'completion_year')::smallint
      else null
    end),
    gender = coalesce(spp.gender, case u.raw_user_meta_data ->> 'gender'
      when 'female' then 'female'::public.student_gender
      when 'male' then 'male'::public.student_gender
      when 'non-binary' then 'non-binary'::public.student_gender
      when 'prefer-not-to-say' then 'prefer-not-to-say'::public.student_gender
      else null
    end),
    residence_type = coalesce(spp.residence_type, case u.raw_user_meta_data ->> 'residence'
      when 'on-campus' then 'on-campus'::public.residence_type
      when 'off-campus' then 'off-campus'::public.residence_type
      else null
    end),
    residence_location = coalesce(spp.residence_location, nullif(trim(coalesce(u.raw_user_meta_data ->> 'location', '')), '')),
    phone = coalesce(spp.phone, nullif(trim(coalesce(u.raw_user_meta_data ->> 'phone', '')), '')),
    guardian_full_name = coalesce(spp.guardian_full_name, nullif(trim(coalesce(u.raw_user_meta_data ->> 'guardian_full_name', '')), '')),
    guardian_phone = coalesce(spp.guardian_phone, nullif(trim(coalesce(u.raw_user_meta_data ->> 'guardian_phone', '')), '')),
    guardian_relationship = coalesce(spp.guardian_relationship, nullif(trim(coalesce(u.raw_user_meta_data ->> 'guardian_relationship', '')), '')),
    student_record_check_status = case
      when spp.student_record_check_status = 'pending'
        and u.raw_user_meta_data ->> 'student_record_check_status' in ('simulated_passed', 'verified')
        then u.raw_user_meta_data ->> 'student_record_check_status'
      else spp.student_record_check_status
    end,
    facial_scan_status = case
      when spp.facial_scan_status = 'not_started'
        and u.raw_user_meta_data ->> 'facial_scan_status' = 'simulated_completed_no_biometric_match'
        then 'simulated_completed_no_biometric_match'
      else spp.facial_scan_status
    end,
    identity_verification_mode = coalesce(spp.identity_verification_mode, case u.raw_user_meta_data ->> 'identity_verification_mode'
      when 'simulation' then 'simulation'
      when 'manual' then 'manual'
      else null
    end),
    identity_verification_completed_at = coalesce(
      spp.identity_verification_completed_at,
      case when nullif(u.raw_user_meta_data ->> 'identity_verification_completed_at', '') is not null then u.created_at else null end
    ),
    identity_consent_at = coalesce(
      spp.identity_consent_at,
      case when nullif(u.raw_user_meta_data ->> 'identity_consent_at', '') is not null then u.created_at else null end
    ),
    identity_consent_scope = coalesce(spp.identity_consent_scope, nullif(trim(coalesce(u.raw_user_meta_data ->> 'identity_consent_scope', '')), '')),
    privacy_notice_version = coalesce(spp.privacy_notice_version, nullif(trim(coalesce(u.raw_user_meta_data ->> 'privacy_notice_version', '')), ''))
from auth.users u
where u.id = spp.profile_id;

-- Final upgrade hardening. Preview databases may contain nullable columns or
-- malformed legacy metadata even when ADD COLUMN IF NOT EXISTS succeeds.
update public.student_private_profiles
set created_at = coalesce(created_at, now()),
    updated_at = coalesce(updated_at, created_at, now()),
    student_id_status = coalesce(student_id_status, 'pending_storage'),
    student_record_check_status = coalesce(student_record_check_status, 'pending'),
    facial_scan_status = coalesce(facial_scan_status, 'not_started'),
    verification_status = coalesce(verification_status, 'pending'::public.student_verification_status);

update public.student_private_profiles
set start_year = null, completion_year = null
where (start_year is not null and start_year not between 2000 and 2200)
   or (completion_year is not null and completion_year not between 2000 and 2200)
   or (start_year is not null and completion_year is not null and completion_year < start_year);
update public.student_private_profiles set phone = null
where phone is not null and char_length(trim(phone)) not between 7 and 30;
update public.student_private_profiles set guardian_phone = null
where guardian_phone is not null and char_length(trim(guardian_phone)) not between 7 and 30;
update public.student_private_profiles
set student_id_status = 'pending_storage', student_id_object_path = null, student_id_uploaded_at = null
where student_id_status not in ('pending_storage', 'uploaded_private', 'verified', 'rejected');
update public.student_private_profiles set student_record_check_status = 'pending'
where student_record_check_status not in ('pending', 'simulated_passed', 'verified', 'failed');
update public.student_private_profiles set facial_scan_status = 'not_started'
where facial_scan_status not in ('not_started', 'simulated_completed_no_biometric_match');
update public.student_private_profiles
set face_snapshot_object_path = null, face_snapshot_uploaded_at = null
where face_snapshot_object_path is not null
  and face_snapshot_object_path not like profile_id::text || '/%';
update public.student_private_profiles
set face_snapshot_uploaded_at = null
where face_snapshot_object_path is null;
update public.student_private_profiles
set face_snapshot_uploaded_at = coalesce(face_snapshot_uploaded_at, created_at)
where face_snapshot_object_path is not null;
update public.student_private_profiles set identity_verification_mode = null
where identity_verification_mode is not null and identity_verification_mode not in ('simulation', 'manual');
update public.student_private_profiles
set student_id_object_path = null,
    student_id_uploaded_at = null,
    student_id_status = 'pending_storage'
where student_id_object_path is not null
  and student_id_object_path not like profile_id::text || '/%';
update public.student_private_profiles
set student_id_status = 'pending_storage', student_id_uploaded_at = null
where student_id_object_path is null
  and student_id_status in ('uploaded_private', 'rejected');
update public.student_private_profiles
set student_id_uploaded_at = null
where student_id_object_path is null and student_id_status = 'pending_storage';
update public.student_private_profiles
set student_id_status = 'uploaded_private', student_id_uploaded_at = coalesce(student_id_uploaded_at, created_at)
where student_id_object_path is not null and student_id_status = 'pending_storage';
update public.student_private_profiles
set student_id_uploaded_at = coalesce(student_id_uploaded_at, created_at)
where student_id_object_path is not null
  and student_id_status in ('uploaded_private', 'verified', 'rejected');
update public.student_private_profiles
set identity_verification_mode = 'simulation', student_id_uploaded_at = null
where student_id_status = 'verified'
  and student_id_object_path is null;
update public.student_private_profiles
set verified_at = coalesce(verified_at, updated_at, created_at)
where verification_status = 'verified';
update public.student_private_profiles
set verified_at = null, verified_by = null
where verification_status <> 'verified';

alter table public.student_private_profiles alter column student_id_status set default 'pending_storage';
alter table public.student_private_profiles alter column student_id_status set not null;
alter table public.student_private_profiles alter column student_record_check_status set default 'pending';
alter table public.student_private_profiles alter column student_record_check_status set not null;
alter table public.student_private_profiles alter column facial_scan_status set default 'not_started';
alter table public.student_private_profiles alter column facial_scan_status set not null;
alter table public.student_private_profiles alter column verification_status set default 'pending'::public.student_verification_status;
alter table public.student_private_profiles alter column verification_status set not null;
alter table public.student_private_profiles alter column created_at set default now();
alter table public.student_private_profiles alter column created_at set not null;
alter table public.student_private_profiles alter column updated_at set default now();
alter table public.student_private_profiles alter column updated_at set not null;

alter table public.student_private_profiles add constraint student_private_years_valid check (
  (start_year is null or start_year between 2000 and 2200)
  and (completion_year is null or completion_year between 2000 and 2200)
  and (start_year is null or completion_year is null or completion_year >= start_year)
);
alter table public.student_private_profiles add constraint student_private_phone_length
  check (phone is null or char_length(trim(phone)) between 7 and 30);
alter table public.student_private_profiles add constraint student_private_guardian_phone_length
  check (guardian_phone is null or char_length(trim(guardian_phone)) between 7 and 30);
alter table public.student_private_profiles add constraint student_private_id_path_owned
  check (student_id_object_path is null or student_id_object_path like profile_id::text || '/%');
alter table public.student_private_profiles add constraint student_private_id_status_valid
  check (student_id_status in ('pending_storage', 'uploaded_private', 'verified', 'rejected'));
alter table public.student_private_profiles add constraint student_private_id_upload_consistency check (
  (student_id_status = 'pending_storage' and student_id_object_path is null and student_id_uploaded_at is null)
  or (student_id_status in ('uploaded_private', 'rejected') and student_id_object_path is not null and student_id_uploaded_at is not null)
  or (
    student_id_status = 'verified'
    and (
      (student_id_object_path is not null and student_id_uploaded_at is not null)
      or (identity_verification_mode = 'simulation' and student_id_object_path is null and student_id_uploaded_at is null)
    )
  )
);
alter table public.student_private_profiles add constraint student_private_record_status_valid
  check (student_record_check_status in ('pending', 'simulated_passed', 'verified', 'failed'));
alter table public.student_private_profiles add constraint student_private_face_status_valid
  check (facial_scan_status in ('not_started', 'simulated_completed_no_biometric_match'));
alter table public.student_private_profiles add constraint student_private_face_snapshot_path_owned
  check (face_snapshot_object_path is null or face_snapshot_object_path like profile_id::text || '/%');
alter table public.student_private_profiles add constraint student_private_face_snapshot_consistency check (
  (face_snapshot_object_path is null and face_snapshot_uploaded_at is null)
  or (face_snapshot_object_path is not null and face_snapshot_uploaded_at is not null)
);
alter table public.student_private_profiles add constraint student_private_verification_mode_valid
  check (identity_verification_mode is null or identity_verification_mode in ('simulation', 'manual'));
alter table public.student_private_profiles add constraint student_private_verification_consistency
  check ((verification_status = 'verified' and verified_at is not null) or verification_status <> 'verified');

create or replace function public.sync_profile_auth_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = lower(trim(new.email)), personal_email = lower(trim(new.email)) where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.sync_profile_auth_email();

-- Security helpers. Role is always read from public.profiles, never user metadata.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('librarian', 'admin', 'super_admin')
      and p.status = 'active'
      and p.admin_access_revoked_at is null
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'super_admin')
      and p.status = 'active'
      and p.admin_access_revoked_at is null
  );
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'super_admin'
      and p.status = 'active'
      and p.admin_access_revoked_at is null
  );
$$;

create or replace function public.admin_set_signup_lock(p_locked boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current boolean;
begin
  if not public.is_super_admin() then raise exception 'Super administrator access required'; end if;
  if p_locked is null then raise exception 'Signup lock state is required'; end if;

  select ls.signup_locked
  into v_current
  from public.library_settings ls
  where ls.id = true
  for update;
  if not found then raise exception 'Library settings are not installed'; end if;

  if v_current is distinct from p_locked then
    update public.library_settings
    set signup_locked = p_locked,
        updated_by = auth.uid()
    where id = true;
  end if;

  return p_locked;
end;
$$;

create or replace function public.is_active_student()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'student'
      and p.status = 'active'
  );
$$;

create or replace function public.can_use_library()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    join public.student_private_profiles spp on spp.profile_id = p.id
    where p.id = auth.uid()
      and p.role = 'student'
      and p.status = 'active'
      and p.full_name is not null
      and trim(p.full_name) <> ''
      and p.index_number is not null
      and trim(p.index_number) <> ''
      and p.email is not null
      and p.personal_email is not null
      and trim(p.personal_email) <> ''
      and p.student_email ~ '^[^[:space:]@]+@st\.knust\.edu\.gh$'
      and spp.student_record_check_status in ('simulated_passed', 'verified')
      and spp.facial_scan_status = 'simulated_completed_no_biometric_match'
      and (
        (
          spp.student_id_status in ('uploaded_private', 'verified')
          and spp.student_id_object_path is not null
          and spp.student_id_uploaded_at is not null
        ) or (
          spp.verification_status = 'verified'
          and spp.identity_verification_mode = 'simulation'
          and spp.student_id_status = 'verified'
        )
      )
      and spp.identity_consent_at is not null
      and spp.verification_status = 'verified'
  );
$$;

-- Safe profile completion. Role, status and an existing student ID stay immutable.
drop function if exists public.update_my_profile(text, text, text);
create or replace function public.update_my_profile(
  p_full_name text,
  p_index_number text,
  p_student_email text,
  p_phone text default null,
  p_programme text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_private public.student_private_profiles%rowtype;
  v_full_name text := trim(coalesce(p_full_name, ''));
  v_index_number text := upper(regexp_replace(trim(coalesce(p_index_number, '')), '\s+', '', 'g'));
  v_student_email text := lower(trim(coalesce(p_student_email, '')));
  v_phone text := nullif(trim(p_phone), '');
  v_programme text := nullif(trim(p_programme), '');
  v_phone_changed boolean := false;
begin
  if not public.is_active_student() then raise exception 'Active student access required'; end if;
  if char_length(v_full_name) not between 2 and 120 then raise exception 'A valid full name is required'; end if;
  if v_index_number !~ '^([0-9]{8,12}|[A-Z]{2,5}/[A-Z]{2,8}/[0-9]{2}/[0-9]{3,6})$' then raise exception 'A valid KNUST student ID is required'; end if;
  if v_student_email !~ '^[^[:space:]@]+@st\.knust\.edu\.gh$' then raise exception 'A valid KNUST student email is required'; end if;
  if v_phone is not null and char_length(v_phone) not between 7 and 30 then raise exception 'A valid phone number is required'; end if;
  if v_programme is not null and char_length(v_programme) > 160 then raise exception 'Programme is too long'; end if;

  select * into v_profile
  from public.profiles
  where id = auth.uid() and role = 'student' and status = 'active'
  for update;
  if v_profile.id is null then raise exception 'Active student profile not found'; end if;

  -- These fields are part of the verified identity and may not be silently
  -- replaced by the student after signup. Corrections require an admin review.
  if v_profile.full_name is not null and trim(v_profile.full_name) <> v_full_name then
    raise exception 'Contact an administrator to correct your verified full name';
  end if;
  if v_profile.index_number is not null and upper(trim(v_profile.index_number)) <> v_index_number then
    raise exception 'Your KNUST student ID cannot be changed here';
  end if;
  if v_profile.student_email is not null and lower(trim(v_profile.student_email)) <> v_student_email then
    raise exception 'Your KNUST student email cannot be changed here';
  end if;

  update public.profiles
  set full_name = coalesce(full_name, v_full_name),
      index_number = coalesce(index_number, v_index_number),
      personal_email = coalesce(personal_email, email),
      student_email = coalesce(student_email, v_student_email)
  where id = auth.uid();

  insert into public.student_private_profiles(profile_id)
  values (auth.uid())
  on conflict (profile_id) do nothing;

  select * into v_private
  from public.student_private_profiles
  where profile_id = auth.uid()
  for update;
  v_phone_changed := v_private.phone is distinct from v_phone;

  update public.student_private_profiles
  set phone = v_phone,
      programme = v_programme,
      verification_status = case
        when v_phone_changed and verification_status = 'verified' then 'pending'::public.student_verification_status
        else verification_status
      end,
      verification_notes = case when v_phone_changed then null else verification_notes end,
      verified_at = case when v_phone_changed then null else verified_at end,
      verified_by = case when v_phone_changed then null else verified_by end
  where profile_id = auth.uid();

  insert into public.audit_events(actor_id, event_type, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    'student_profile_updated',
    'profile',
    auth.uid()::text,
    jsonb_build_object(
      'phone_changed', v_phone_changed,
      'programme_changed', v_private.programme is distinct from v_programme,
      'verification_reset', v_phone_changed and v_private.verification_status = 'verified'
    )
  );
end;
$$;

create or replace function public.update_my_student_intake(
  p_department text,
  p_programme text,
  p_start_year integer,
  p_completion_year integer,
  p_gender public.student_gender,
  p_residence_type public.residence_type,
  p_residence_location text,
  p_phone text default null,
  p_guardian_full_name text default null,
  p_guardian_phone text default null,
  p_guardian_relationship text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_active_student() then raise exception 'Active student access required'; end if;
  if char_length(trim(coalesce(p_department, ''))) < 2 then raise exception 'Department is required'; end if;
  if char_length(trim(coalesce(p_programme, ''))) < 2 then raise exception 'Programme is required'; end if;
  if p_start_year not between 2000 and 2200
     or p_completion_year not between p_start_year and least(2200, p_start_year + 12) then
    raise exception 'Study years are invalid';
  end if;
  if char_length(trim(coalesce(p_residence_location, ''))) < 2 then raise exception 'Residence location is required'; end if;

  insert into public.student_private_profiles(
    profile_id, department, programme, start_year, completion_year, gender,
    residence_type, residence_location, phone, guardian_full_name,
    guardian_phone, guardian_relationship
  ) values (
    auth.uid(), trim(p_department), trim(p_programme), p_start_year, p_completion_year,
    p_gender, p_residence_type, trim(p_residence_location), nullif(trim(p_phone), ''),
    nullif(trim(p_guardian_full_name), ''), nullif(trim(p_guardian_phone), ''),
    nullif(trim(p_guardian_relationship), '')
  )
  on conflict (profile_id) do update set
    department = excluded.department,
    programme = excluded.programme,
    start_year = excluded.start_year,
    completion_year = excluded.completion_year,
    gender = excluded.gender,
    residence_type = excluded.residence_type,
    residence_location = excluded.residence_location,
    phone = excluded.phone,
    guardian_full_name = excluded.guardian_full_name,
    guardian_phone = excluded.guardian_phone,
    guardian_relationship = excluded.guardian_relationship,
    verification_status = 'pending',
    verification_notes = null,
    verified_at = null,
    verified_by = null;
end;
$$;

create or replace function public.admin_set_student_verification(
  p_student_id uuid,
  p_status public.student_verification_status,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if p_status = 'rejected' and char_length(trim(coalesce(p_notes, ''))) < 3 then
    raise exception 'A rejection reason is required';
  end if;

  update public.student_private_profiles spp
  set verification_status = p_status,
      verification_notes = nullif(trim(p_notes), ''),
      verified_at = case when p_status = 'verified' then now() else null end,
      verified_by = case when p_status = 'verified' then auth.uid() else null end,
      -- Explicit admin verification is also the recovery path for legacy
      -- students created before private ID storage existed. It records a
      -- clearly labelled simulation and never invents a face image/template.
      student_record_check_status = case
        when p_status = 'verified' then 'simulated_passed'
        else spp.student_record_check_status
      end,
      facial_scan_status = case
        when p_status = 'verified' then 'simulated_completed_no_biometric_match'
        else spp.facial_scan_status
      end,
      identity_verification_mode = case
        when p_status = 'verified' and spp.student_id_object_path is null then 'simulation'
        when p_status = 'verified' then coalesce(spp.identity_verification_mode, 'manual')
        else spp.identity_verification_mode
      end,
      identity_verification_completed_at = case
        when p_status = 'verified' then coalesce(spp.identity_verification_completed_at, now())
        else spp.identity_verification_completed_at
      end,
      identity_consent_at = case
        when p_status = 'verified' then coalesce(spp.identity_consent_at, now())
        else spp.identity_consent_at
      end,
      identity_consent_scope = case
        when p_status = 'verified' then coalesce(spp.identity_consent_scope, 'admin-approved legacy identity simulation; no biometric data stored')
        else spp.identity_consent_scope
      end,
      privacy_notice_version = case
        when p_status = 'verified' then coalesce(spp.privacy_notice_version, 'legacy-admin-review-2026-07')
        else spp.privacy_notice_version
      end,
      student_id_status = case
        when p_status = 'verified' then 'verified'
        -- Simulated presentation accounts intentionally have no stored ID
        -- object. Keep their ID status constraint-valid while the independent
        -- overall verification state records the rejection.
        when p_status = 'rejected' and spp.student_id_object_path is not null then 'rejected'
        else spp.student_id_status
      end
  from public.profiles p
  where spp.profile_id = p_student_id
    and p.id = spp.profile_id
    and p.role = 'student';
  if not found then raise exception 'Student intake not found'; end if;

  insert into public.audit_events(actor_id, event_type, entity_type, entity_id, metadata)
  values (
    auth.uid(), 'student_verification_changed', 'profile', p_student_id::text,
    jsonb_build_object('status', p_status, 'notes', nullif(trim(p_notes), ''))
  );
end;
$$;

create or replace function public.admin_set_student_status(p_student_id uuid, p_status public.profile_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  update public.profiles
  set status = p_status
  where id = p_student_id and role = 'student';
  if not found then raise exception 'Student not found'; end if;

  insert into public.audit_events(actor_id, event_type, entity_type, entity_id, metadata)
  values (auth.uid(), 'student_status_changed', 'profile', p_student_id::text, jsonb_build_object('status', p_status));
end;
$$;

create or replace function public.admin_find_profile_by_email(p_email text)
returns table (
  id uuid,
  full_name text,
  index_number text,
  email text,
  student_email text,
  role public.app_role,
  status public.profile_status
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if char_length(trim(coalesce(p_email, ''))) < 3 then return; end if;

  return query
  select
    p.id, p.full_name, p.index_number, coalesce(p.personal_email, p.email),
    p.student_email, p.role, p.status
  from public.profiles p
  where lower(trim(coalesce(p.email, ''))) = lower(trim(p_email))
     or lower(trim(coalesce(p.personal_email, ''))) = lower(trim(p_email))
     or lower(trim(coalesce(p.student_email, ''))) = lower(trim(p_email))
  order by p.created_at
  limit 1;
end;
$$;

create or replace function public.admin_promote_librarian(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if exists (
    select 1 from public.loans l join public.loan_items li on li.loan_id = l.id
    where l.borrower_id = p_profile_id and li.status in ('active', 'lost')
  ) or exists (
    select 1 from public.borrow_requests br
    where br.student_id = p_profile_id
      and (br.status = 'pending' or (br.status = 'approved' and br.fulfilment_method = 'delivery' and br.loan_id is null))
  ) then raise exception 'Return active loans and resolve pending requests before promotion'; end if;

  update public.profiles
  set role = 'librarian', status = 'active'
  where id = p_profile_id and role = 'student' and status = 'active';
  if not found then raise exception 'Eligible active student profile not found'; end if;

  insert into public.audit_events(actor_id, event_type, entity_type, entity_id, metadata)
  values (auth.uid(), 'librarian_promoted', 'profile', p_profile_id::text, jsonb_build_object('role', 'librarian'));
end;
$$;

drop function if exists public.admin_set_librarian_status(uuid, public.profile_status);
create or replace function public.admin_set_librarian_status(
  p_profile_id uuid,
  p_status public.profile_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  update public.profiles set status = p_status
  where id = p_profile_id and role = 'librarian';
  if not found then raise exception 'Librarian not found'; end if;

  insert into public.audit_events(actor_id, event_type, entity_type, entity_id, metadata)
  values (auth.uid(), 'librarian_status_changed', 'profile', p_profile_id::text, jsonb_build_object('status', p_status));
end;
$$;

drop function if exists public.admin_remove_librarian(uuid);
create or replace function public.admin_remove_librarian(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resulting_status public.profile_status;
  v_account_source text;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if p_profile_id = auth.uid() then raise exception 'You cannot remove your own role'; end if;

  update public.profiles
  set role = 'student',
      -- A server-generated staff identity has no KNUST student email, so it
      -- must not become an active but incomplete student account. A genuine
      -- student who was promoted can safely return to active student access.
      status = case
        when nullif(trim(student_email), '') is null then 'suspended'::public.profile_status
        else 'active'::public.profile_status
      end
  where id = p_profile_id and role = 'librarian'
  returning status,
    case
      when nullif(trim(student_email), '') is null then 'generated_staff_account'
      else 'promoted_student_account'
    end
  into v_resulting_status, v_account_source;
  if not found then raise exception 'Librarian not found'; end if;

  insert into public.student_private_profiles(profile_id)
  values (p_profile_id)
  on conflict (profile_id) do nothing;
  insert into public.audit_events(actor_id, event_type, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    'librarian_removed',
    'profile',
    p_profile_id::text,
    jsonb_build_object('role', 'student', 'status', v_resulting_status, 'account_source', v_account_source)
  );
end;
$$;

-- Server-only companion for an Admin API createUser call. The Auth account
-- must already exist under the same personal email; passwords remain solely in
-- Supabase Auth and standard recovery therefore works by personal email.
create or replace function public.service_provision_librarian_profile(
  p_auth_user_id uuid,
  p_full_name text,
  p_staff_id text,
  p_personal_email text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_email text;
begin
  if auth.role() <> 'service_role' then raise exception 'Service-role access required'; end if;
  if char_length(trim(coalesce(p_full_name, ''))) < 2 then raise exception 'A valid librarian name is required'; end if;
  if char_length(trim(coalesce(p_staff_id, ''))) < 3 then raise exception 'A valid staff ID is required'; end if;
  if lower(trim(coalesce(p_personal_email, ''))) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'A valid personal email is required';
  end if;

  select lower(trim(u.email)) into v_auth_email from auth.users u where u.id = p_auth_user_id;
  if v_auth_email is null then raise exception 'Auth user not found'; end if;
  if v_auth_email <> lower(trim(p_personal_email)) then raise exception 'Auth and profile emails must match'; end if;
  if exists (
    select 1 from public.profiles
    where id = p_auth_user_id and role in ('admin', 'super_admin')
  ) then raise exception 'An administrator account cannot be reassigned'; end if;

  insert into public.profiles(
    id, full_name, index_number, email, personal_email, student_email, role, status
  ) values (
    p_auth_user_id, trim(p_full_name), upper(trim(p_staff_id)), v_auth_email,
    v_auth_email, null, 'librarian', 'active'
  )
  on conflict (id) do update set
    full_name = excluded.full_name,
    index_number = excluded.index_number,
    email = excluded.email,
    personal_email = excluded.personal_email,
    student_email = null,
    role = 'librarian',
    status = 'active';

  -- Admin provisioning may use a short-lived student-shaped Auth insert so
  -- the existing new-user trigger can complete before trusted app metadata is
  -- applied. Generated librarian accounts must retain no student intake row.
  delete from public.student_private_profiles where profile_id = p_auth_user_id;

  insert into public.audit_events(actor_id, event_type, entity_type, entity_id, metadata)
  values (
    null, 'librarian_profile_provisioned', 'profile', p_auth_user_id::text,
    jsonb_build_object('staff_id', upper(trim(p_staff_id)), 'email', v_auth_email, 'source', 'server_api')
  );
end;
$$;

-- Server-only companion for super-admin generated administrator credentials.
-- The Auth identity must already exist under the same personal email; the
-- temporary password remains exclusively inside Supabase Auth.
drop function if exists public.service_provision_administrator_profile(uuid, text, text, text);
create or replace function public.service_provision_administrator_profile(
  p_actor_id uuid,
  p_auth_user_id uuid,
  p_full_name text,
  p_staff_id text,
  p_personal_email text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_email text;
begin
  if auth.role() <> 'service_role' then raise exception 'Service-role access required'; end if;
  if not exists (
    select 1
    from public.profiles actor
    where actor.id = p_actor_id
      and actor.role = 'super_admin'
      and actor.status = 'active'
      and actor.admin_access_revoked_at is null
  ) then raise exception 'Active super administrator authorization is required'; end if;
  if char_length(trim(coalesce(p_full_name, ''))) < 2 then raise exception 'A valid administrator name is required'; end if;
  if char_length(trim(coalesce(p_staff_id, ''))) < 3 then raise exception 'A valid administrator ID is required'; end if;
  if lower(trim(coalesce(p_personal_email, ''))) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'A valid personal email is required';
  end if;

  select lower(trim(u.email)) into v_auth_email
  from auth.users u
  where u.id = p_auth_user_id;
  if v_auth_email is null then raise exception 'Auth user not found'; end if;
  if v_auth_email <> lower(trim(p_personal_email)) then raise exception 'Auth and profile emails must match'; end if;
  if exists (
    select 1 from public.profiles p
    where p.id = p_auth_user_id and p.role = 'super_admin'
  ) then raise exception 'A super administrator account cannot be reassigned'; end if;

  insert into public.profiles(
    id, full_name, index_number, email, personal_email, student_email,
    role, status, admin_access_revoked_at, admin_access_revoked_by
  ) values (
    p_auth_user_id, trim(p_full_name), upper(trim(p_staff_id)), v_auth_email,
    v_auth_email, null, 'admin', 'active', null, null
  )
  on conflict (id) do update set
    full_name = excluded.full_name,
    index_number = excluded.index_number,
    email = excluded.email,
    personal_email = excluded.personal_email,
    student_email = null,
    role = 'admin',
    status = 'active',
    admin_access_revoked_at = null,
    admin_access_revoked_by = null;

  delete from public.student_private_profiles where profile_id = p_auth_user_id;

  insert into public.audit_events(actor_id, event_type, entity_type, entity_id, metadata)
  values (
    p_actor_id, 'administrator_profile_provisioned', 'profile', p_auth_user_id::text,
    jsonb_build_object('staff_id', upper(trim(p_staff_id)), 'email', v_auth_email, 'role', 'admin', 'source', 'server_api')
  );
end;
$$;

create or replace function public.super_admin_set_administrator_status(
  p_admin_id uuid,
  p_status public.profile_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_super_admin() then raise exception 'Super administrator access required'; end if;
  if p_admin_id = auth.uid() then raise exception 'You cannot change your own administrator status'; end if;
  if p_status is null then raise exception 'Administrator status is required'; end if;

  update public.profiles
  set status = p_status
  where id = p_admin_id
    and role = 'admin'
    and admin_access_revoked_at is null;
  if not found then raise exception 'Manageable administrator not found'; end if;

  insert into public.audit_events(actor_id, event_type, entity_type, entity_id, metadata)
  values (
    auth.uid(), 'administrator_status_changed', 'profile', p_admin_id::text,
    jsonb_build_object('status', p_status)
  );
end;
$$;

create or replace function public.super_admin_remove_administrator(p_admin_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_staff_id text;
begin
  if not public.is_super_admin() then raise exception 'Super administrator access required'; end if;
  if p_admin_id = auth.uid() then raise exception 'You cannot remove your own administrator access'; end if;

  update public.profiles
  set status = 'suspended',
      admin_access_revoked_at = now(),
      admin_access_revoked_by = auth.uid()
  where id = p_admin_id
    and role = 'admin'
    and admin_access_revoked_at is null
  returning coalesce(personal_email, email), index_number into v_email, v_staff_id;
  if not found then raise exception 'Manageable administrator not found'; end if;

  insert into public.audit_events(actor_id, event_type, entity_type, entity_id, metadata)
  values (
    auth.uid(), 'administrator_access_removed', 'profile', p_admin_id::text,
    jsonb_build_object('email', v_email, 'staff_id', v_staff_id, 'account_preserved', true)
  );
end;
$$;

-- Publishing is a lifecycle transition, not a generic row edit. Keeping it in
-- an RPC prevents a direct PostgREST PATCH from silently exposing a half-built
-- title without its required stock or online content.
create or replace function public.publish_book(p_book_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_book public.books%rowtype;
  v_has_stock boolean;
  v_has_online_content boolean;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;

  select * into v_book
  from public.books
  where id = p_book_id
  for update;
  if v_book.id is null then raise exception 'Book not found'; end if;
  if v_book.archived_at is not null then raise exception 'Restore this title before publishing it'; end if;
  if v_book.is_published then return; end if;

  select exists (
    select 1 from public.book_copies bc
    where bc.book_id = p_book_id and bc.status <> 'retired'
  ) into v_has_stock;
  select exists (
    select 1
    from public.digital_editions de
    join public.book_chapters bc on bc.edition_id = de.id
    where de.book_id = p_book_id
      and de.status = 'published'
      and bc.is_published
      and trim(bc.content_text) <> ''
  ) into v_has_online_content;

  if v_book.format in ('physical', 'both') and not v_has_stock then
    raise exception 'Add at least one tracked physical copy before publishing';
  end if;
  if v_book.format in ('digital', 'both') and not v_has_online_content then
    raise exception 'Publish online book text before publishing this title';
  end if;

  update public.books
  set is_published = true, updated_by = auth.uid()
  where id = p_book_id;

  insert into public.audit_events(actor_id, event_type, entity_type, entity_id, metadata)
  values (
    auth.uid(), 'book_published', 'book', p_book_id::text,
    jsonb_build_object('title', v_book.title, 'format', v_book.format)
  );
end;
$$;

create or replace function public.archive_book(p_book_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
  v_cover_object_path text;
  v_archived_at timestamptz := now();
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;

  -- Use the same basket-first lock order as checkout. This prevents an archive
  -- from holding the book row while checkout holds its basket items.
  perform 1
  from public.borrow_baskets bb
  where bb.status = 'active'
    and exists (
      select 1 from public.basket_items bi
      where bi.basket_id = bb.id and bi.book_id = p_book_id
    )
  order by bb.id
  for update;

  update public.books
  set is_published = false, archived_at = v_archived_at, updated_by = auth.uid()
  where id = p_book_id and archived_at is null and is_published
  returning title, cover_object_path into v_title, v_cover_object_path;
  if not found then raise exception 'Book not found, already archived, or not published'; end if;

  update public.digital_editions set status = 'archived' where book_id = p_book_id;
  delete from public.basket_items bi
  using public.borrow_baskets bb
  where bi.basket_id = bb.id and bb.status = 'active' and bi.book_id = p_book_id;

  insert into public.audit_events(actor_id, event_type, entity_type, entity_id, metadata)
  values (
    auth.uid(), 'book_archived', 'book', p_book_id::text,
    jsonb_build_object(
      'title', v_title,
      'archived_at', v_archived_at,
      'cover_object_path', v_cover_object_path
    )
  );
end;
$$;

create or replace function public.unarchive_book(p_book_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_book public.books%rowtype;
  v_has_published_chapters boolean;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;

  select * into v_book
  from public.books
  where id = p_book_id
  for update;
  if v_book.id is null then raise exception 'Book not found'; end if;
  if v_book.archived_at is null then return; end if;

  select exists (
    select 1
    from public.digital_editions de
    join public.book_chapters bc on bc.edition_id = de.id
    where de.book_id = p_book_id
      and v_book.format in ('digital', 'both')
      and bc.is_published
  ) into v_has_published_chapters;

  update public.books
  set archived_at = null, is_published = true, updated_by = auth.uid()
  where id = p_book_id;

  update public.digital_editions
  set status = case
        when v_has_published_chapters then 'published'::public.edition_status
        when v_book.format = 'physical' then 'archived'::public.edition_status
        else 'draft'::public.edition_status
      end,
      published_at = case
        when v_has_published_chapters then coalesce(published_at, now())
        else null
      end
  where book_id = p_book_id;

  insert into public.audit_events(actor_id, event_type, entity_type, entity_id, metadata)
  values (
    auth.uid(), 'book_unarchived', 'book', p_book_id::text,
    jsonb_build_object(
      'title', v_book.title,
      'previously_archived_at', v_book.archived_at,
      'cover_object_path', v_book.cover_object_path,
      'digital_restored', v_has_published_chapters
    )
  );
end;
$$;

-- Archive is intentionally reversible and is the terminal lifecycle state.
-- Remove an older deployed delete RPC so no administrator can erase catalogue,
-- inventory, fine, or custody evidence.
drop function if exists public.permanently_delete_book(uuid);

-- Immutable copy movement audit.
create or replace function public.track_copy_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_loan_item_id uuid;
  v_reason text;
begin
  if old.status is distinct from new.status then
    if old.status = 'borrowed' and new.status in ('available', 'damaged') then
      select li.id into v_loan_item_id
      from public.loan_items li
      where li.copy_id = new.id
        and li.return_accepted_at = now()
        and li.return_accepted_by = auth.uid()
      order by li.returned_at desc
      limit 1;
      if v_loan_item_id is not null then v_reason := 'Return accepted'; end if;
    end if;

    insert into public.inventory_movements(copy_id, from_status, to_status, reason, actor_id, loan_item_id)
    values (new.id, old.status, new.status, v_reason, auth.uid(), v_loan_item_id);
  end if;
  return new;
end;
$$;

drop trigger if exists copy_status_audit on public.book_copies;
create trigger copy_status_audit
  after update of status on public.book_copies
  for each row execute function public.track_copy_status_change();

-- Staff stock controls. Each quantity becomes an individually tracked copy.
create or replace function public.add_book_stock(
  p_book_id uuid,
  p_quantity integer,
  p_shelf_location text default 'Main Stacks'
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  i integer;
  v_copy_id uuid;
  v_accession text;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if p_quantity < 1 or p_quantity > 500 then raise exception 'Quantity must be between 1 and 500'; end if;
  if not exists (select 1 from public.books where id = p_book_id and archived_at is null) then raise exception 'Book not found'; end if;

  for i in 1..p_quantity loop
    v_copy_id := gen_random_uuid();
    v_accession := 'KLM-' || upper(substr(replace(v_copy_id::text, '-', ''), 1, 12));
    insert into public.book_copies(id, book_id, accession_number, shelf_location)
    values (v_copy_id, p_book_id, v_accession, nullif(trim(p_shelf_location), ''));
    insert into public.inventory_movements(copy_id, from_status, to_status, reason, actor_id)
    values (v_copy_id, null, 'available', 'Stock added', auth.uid());
  end loop;

  insert into public.audit_events(actor_id, event_type, entity_type, entity_id, metadata)
  values (auth.uid(), 'stock_added', 'book', p_book_id::text, jsonb_build_object('quantity', p_quantity));
  return p_quantity;
end;
$$;

create or replace function public.adjust_book_stock(
  p_book_id uuid,
  p_target_quantity integer,
  p_shelf_location text default 'Main Stacks'
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current integer;
  v_remove integer;
  v_copy record;
  v_effective_shelf text;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if p_target_quantity < 0 or p_target_quantity > 500 then raise exception 'Target stock must be between 0 and 500'; end if;

  perform 1 from public.books where id = p_book_id and archived_at is null for update;
  if not found then raise exception 'Book not found'; end if;

  select count(*) into v_current
  from public.book_copies
  where book_id = p_book_id and status <> 'retired';

  v_effective_shelf := nullif(trim(p_shelf_location), '');
  if v_effective_shelf is null then
    select shelf_location into v_effective_shelf
    from public.book_copies
    where book_id = p_book_id and status <> 'retired' and shelf_location is not null
    order by created_at
    limit 1;
  end if;

  if p_target_quantity > v_current then
    perform public.add_book_stock(p_book_id, p_target_quantity - v_current, coalesce(v_effective_shelf, 'Main Stacks'));
  elsif p_target_quantity < v_current then
    v_remove := v_current - p_target_quantity;
    if (select count(*) from public.book_copies where book_id = p_book_id and status = 'available') < v_remove then
      raise exception 'Cannot reduce stock while copies are borrowed or unavailable';
    end if;
    for v_copy in
      select id from public.book_copies
      where book_id = p_book_id and status = 'available'
      order by created_at desc
      limit v_remove
      for update
    loop
      update public.book_copies
      set status = 'retired', retired_at = now()
      where id = v_copy.id;
    end loop;
  end if;

  if nullif(trim(p_shelf_location), '') is not null then
    update public.book_copies
    set shelf_location = trim(p_shelf_location)
    where book_id = p_book_id and status <> 'retired';
  end if;
  return p_target_quantity;
end;
$$;

-- Basket controls. Basket items never reserve stock; checkout confirms it atomically.
create or replace function public.add_to_basket(p_book_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_basket_id uuid;
  v_max_books integer;
  v_current integer;
  v_pending integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.can_use_library() then raise exception 'Complete your active student profile before borrowing'; end if;
  if not exists (
    select 1 from public.books b
    where b.id = p_book_id and b.is_published and b.archived_at is null and b.format in ('physical', 'both')
  ) then raise exception 'This book is not available for physical borrowing'; end if;
  if exists (
    select 1 from public.loan_items li
    join public.loans l on l.id = li.loan_id
    where l.borrower_id = auth.uid() and li.book_id = p_book_id and li.status = 'active'
  ) then raise exception 'You already have this title on loan'; end if;
  if exists (
    select 1
    from public.borrow_request_items bri
    join public.borrow_requests br on br.id = bri.request_id
    where br.student_id = auth.uid()
      and (br.status = 'pending' or (br.status = 'approved' and br.fulfilment_method = 'delivery' and br.loan_id is null))
      and bri.book_id = p_book_id
  ) then raise exception 'You already have a pending or dispatched request for this title'; end if;

  select max_active_books into v_max_books from public.library_settings where id = true;
  select count(*) into v_current
  from public.loan_items li
  join public.loans l on l.id = li.loan_id
  where l.borrower_id = auth.uid() and li.status = 'active';
  select count(*) into v_pending
  from public.borrow_request_items bri
  join public.borrow_requests br on br.id = bri.request_id
  where br.student_id = auth.uid()
    and (br.status = 'pending' or (br.status = 'approved' and br.fulfilment_method = 'delivery' and br.loan_id is null));

  insert into public.borrow_baskets(user_id, status)
  values (auth.uid(), 'active')
  on conflict (user_id) where status = 'active'
  do update set updated_at = now()
  returning id into v_basket_id;

  if v_current + v_pending + (select count(*) from public.basket_items where basket_id = v_basket_id) >= v_max_books then
    raise exception 'You can have at most % active books', v_max_books;
  end if;

  insert into public.basket_items(basket_id, book_id)
  values (v_basket_id, p_book_id)
  on conflict (basket_id, book_id) do nothing;
  return v_basket_id;
end;
$$;

-- Submit a basket for review. This snapshots titles, clears the basket, and
-- deliberately does not create a loan, allocate a copy, or start a due date.
drop function if exists public.submit_borrow_request(integer, public.fulfilment_method, text);
create or replace function public.submit_borrow_request(
  p_loan_days integer,
  p_fulfilment_method public.fulfilment_method,
  p_delivery_location text default null,
  p_delivery_floor text default null,
  p_delivery_room text default null,
  p_payment_method public.simulated_payment_method default null,
  p_payment_simulated boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_basket_id uuid;
  v_request_id uuid;
  v_max_days integer;
  v_max_books integer;
  v_delivery_fee integer;
  v_active_count integer;
  v_pending_count integer;
  v_item_count integer;
  v_delivery_location text;
  v_delivery_floor text;
  v_delivery_room text;
  v_payment_reference text;
  v_profile public.profiles%rowtype;
  v_private public.student_private_profiles%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.can_use_library() then raise exception 'Complete and verify your student identity before borrowing'; end if;

  -- Student-first locking serializes submissions with approvals for this account.
  select * into v_profile
  from public.profiles
  where id = auth.uid() and role = 'student' and status = 'active'
  for update;
  if v_profile.id is null then raise exception 'Active student access required'; end if;

  select * into v_private
  from public.student_private_profiles
  where profile_id = auth.uid()
  for update;

  select max_loan_days, max_active_books, delivery_fee_pesewas
  into v_max_days, v_max_books, v_delivery_fee
  from public.library_settings
  where id = true;
  if p_loan_days < 1 or p_loan_days > v_max_days then
    raise exception 'Loan period must be between 1 and % days', v_max_days;
  end if;

  if p_fulfilment_method = 'delivery' then
    if v_private.residence_type <> 'on-campus' then
      raise exception 'Campus delivery is available only to registered on-campus students';
    end if;
    v_delivery_location := nullif(trim(v_private.residence_location), '');
    if v_delivery_location is null or char_length(v_delivery_location) < 2 then
      raise exception 'Save your on-campus hall or hostel before requesting delivery';
    end if;
    if nullif(trim(p_delivery_location), '') is not null
       and lower(trim(p_delivery_location)) <> lower(v_delivery_location) then
      raise exception 'Delivery location must match your saved residence location';
    end if;
    v_delivery_floor := nullif(trim(p_delivery_floor), '');
    v_delivery_room := nullif(trim(p_delivery_room), '');
    if v_delivery_floor is null or char_length(v_delivery_floor) > 40 then
      raise exception 'Enter a valid floor for delivery';
    end if;
    if v_delivery_room is null or char_length(v_delivery_room) > 40 then
      raise exception 'Enter a valid room number for delivery';
    end if;
    if p_payment_method is null or p_payment_simulated is distinct from true then
      raise exception 'Complete the simulated card or mobile-money payment';
    end if;
    v_payment_reference := 'SIM-' || upper(replace(extensions.gen_random_uuid()::text, '-', ''));
  else
    if p_payment_method is not null or p_payment_simulated then
      raise exception 'Payment is not required for circulation-desk pickup';
    end if;
    v_delivery_fee := 0;
    v_delivery_location := null;
    v_delivery_floor := null;
    v_delivery_room := null;
  end if;

  select id into v_basket_id
  from public.borrow_baskets
  where user_id = auth.uid() and status = 'active'
  for update;
  if v_basket_id is null then raise exception 'Your borrow basket is empty'; end if;

  perform 1
  from public.basket_items
  where basket_id = v_basket_id
  order by id
  for update;

  select count(*) into v_item_count
  from public.basket_items
  where basket_id = v_basket_id;
  if v_item_count = 0 then raise exception 'Your borrow basket is empty'; end if;

  if exists (
    select 1
    from public.basket_items bi
    join public.books b on b.id = bi.book_id
    where bi.basket_id = v_basket_id
      and (not b.is_published or b.archived_at is not null or b.format not in ('physical', 'both'))
  ) then raise exception 'A basket title is no longer available for physical borrowing'; end if;

  if exists (
    select 1
    from public.basket_items bi
    where bi.basket_id = v_basket_id
      and not exists (
        select 1 from public.book_copies bc
        where bc.book_id = bi.book_id and bc.status = 'available'
      )
  ) then raise exception 'A basket title currently has no available copy'; end if;

  if exists (
    select 1
    from public.basket_items bi
    join public.loan_items li on li.book_id = bi.book_id and li.status = 'active'
    join public.loans l on l.id = li.loan_id and l.borrower_id = auth.uid()
    where bi.basket_id = v_basket_id
  ) then raise exception 'Your basket contains a title you already have on loan'; end if;

  if exists (
    select 1
    from public.basket_items bi
    join public.borrow_request_items bri on bri.book_id = bi.book_id
    join public.borrow_requests br on br.id = bri.request_id
    where bi.basket_id = v_basket_id
      and br.student_id = auth.uid()
      and (br.status = 'pending' or (br.status = 'approved' and br.fulfilment_method = 'delivery' and br.loan_id is null))
  ) then raise exception 'Your basket contains a title already pending or dispatched'; end if;

  select count(*) into v_active_count
  from public.loan_items li
  join public.loans l on l.id = li.loan_id
  where l.borrower_id = auth.uid() and li.status = 'active';

  select count(*) into v_pending_count
  from public.borrow_request_items bri
  join public.borrow_requests br on br.id = bri.request_id
  where br.student_id = auth.uid()
    and (br.status = 'pending' or (br.status = 'approved' and br.fulfilment_method = 'delivery' and br.loan_id is null));

  if v_active_count + v_pending_count + v_item_count > v_max_books then
    raise exception 'This request would exceed the % book borrowing limit', v_max_books;
  end if;

  insert into public.borrow_requests(
    student_id, basket_id, fulfilment_method, loan_days, delivery_fee_pesewas,
    delivery_location, delivery_floor, delivery_room, payment_method,
    payment_status, payment_reference, paid_at,
    student_name_snapshot, index_number_snapshot,
    student_email_snapshot, phone_snapshot, residence_type_snapshot,
    residence_location_snapshot
  ) values (
    auth.uid(), v_basket_id, p_fulfilment_method, p_loan_days, v_delivery_fee,
    v_delivery_location, v_delivery_floor, v_delivery_room, p_payment_method,
    case when p_fulfilment_method = 'delivery' then 'simulated_paid'::public.simulated_payment_status else 'not_required'::public.simulated_payment_status end,
    v_payment_reference, case when p_fulfilment_method = 'delivery' then now() else null end,
    v_profile.full_name, v_profile.index_number,
    v_profile.student_email, v_private.phone, v_private.residence_type,
    v_private.residence_location
  ) returning id into v_request_id;

  insert into public.borrow_request_items(
    request_id, book_id, title_snapshot, author_snapshot, category_snapshot,
    slug_snapshot, isbn_snapshot, cover_url_snapshot
  )
  select
    v_request_id, b.id, b.title, a.name, c.name, b.slug, b.isbn, b.cover_url
  from public.basket_items bi
  join public.books b on b.id = bi.book_id
  join public.authors a on a.id = b.author_id
  join public.categories c on c.id = b.category_id
  where bi.basket_id = v_basket_id
  order by bi.added_at, bi.id;

  delete from public.basket_items where basket_id = v_basket_id;
  update public.borrow_baskets set updated_at = now() where id = v_basket_id;

  insert into public.notifications(user_id, type, title, body, data, dedupe_key)
  values (
    auth.uid(), 'borrow_request_submitted', 'Borrow request submitted',
    'Your request is awaiting circulation desk approval. The loan period has not started.',
    jsonb_build_object(
      'request_id', v_request_id, 'items', v_item_count, 'fulfilment_method', p_fulfilment_method,
      'delivery_fee_pesewas', v_delivery_fee, 'payment_method', p_payment_method,
      'payment_reference', v_payment_reference
    ),
    'borrow-request-submitted:' || v_request_id::text
  );

  insert into public.audit_events(actor_id, event_type, entity_type, entity_id, metadata)
  values (
    auth.uid(), 'borrow_request_submitted', 'borrow_request', v_request_id::text,
    jsonb_build_object(
      'items', v_item_count, 'loan_days', p_loan_days, 'fulfilment_method', p_fulfilment_method,
      'delivery_fee_pesewas', v_delivery_fee, 'payment_method', p_payment_method,
      'payment_reference', v_payment_reference, 'payment_simulated', p_payment_simulated
    )
  );
  return v_request_id;
end;
$$;

create or replace function public.cancel_borrow_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  update public.borrow_requests
  set status = 'cancelled', cancelled_at = now()
  where id = p_request_id and student_id = auth.uid() and status = 'pending';
  if not found then raise exception 'Pending request not found'; end if;

  insert into public.audit_events(actor_id, event_type, entity_type, entity_id)
  values (auth.uid(), 'borrow_request_cancelled', 'borrow_request', p_request_id::text);
end;
$$;

create or replace function public.cancel_my_borrow_request(p_request_id uuid)
returns void
language sql
set search_path = ''
as $$
  select public.cancel_borrow_request(p_request_id);
$$;

create or replace function public.approve_borrow_request(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.borrow_requests%rowtype;
  v_student public.profiles%rowtype;
  v_private public.student_private_profiles%rowtype;
  v_item record;
  v_item_count integer;
  v_active_count integer;
  v_max_books integer;
  v_copy_id uuid;
  v_loan_id uuid;
  v_loan_item_id uuid;
  v_now timestamptz := now();
begin
  if not public.is_staff() then raise exception 'Circulation staff access required'; end if;

  select * into v_request
  from public.borrow_requests
  where id = p_request_id
  for update;
  if v_request.id is null then raise exception 'Borrow request not found'; end if;
  if v_request.status <> 'pending' then raise exception 'Only pending requests can be approved'; end if;

  -- Request then student then book/copy order is deterministic across approvals.
  select * into v_student
  from public.profiles
  where id = v_request.student_id
  for update;
  if v_student.role <> 'student' or v_student.status <> 'active' then
    raise exception 'The student account is not active';
  end if;

  select * into v_private
  from public.student_private_profiles
  where profile_id = v_request.student_id
  for update;
  if not (
    coalesce(v_private.verification_status::text, 'pending') = 'verified'
    and coalesce(v_private.student_record_check_status, '') in ('simulated_passed', 'verified')
    and coalesce(v_private.facial_scan_status, '') = 'simulated_completed_no_biometric_match'
    and v_private.identity_consent_at is not null
    and (
      (
        v_private.student_id_status in ('uploaded_private', 'verified')
        and v_private.student_id_object_path is not null
        and v_private.student_id_uploaded_at is not null
      ) or (
        v_private.verification_status = 'verified'
        and v_private.identity_verification_mode = 'simulation'
        and v_private.student_id_status = 'verified'
      )
    )
  ) then
    raise exception 'Student identity is not eligible for borrowing';
  end if;

  select count(*) into v_item_count
  from public.borrow_request_items
  where request_id = p_request_id;
  if v_item_count = 0 then raise exception 'Borrow request has no items'; end if;

  select max_active_books into v_max_books
  from public.library_settings where id = true;
  select count(*) into v_active_count
  from public.loan_items li
  join public.loans l on l.id = li.loan_id
  where l.borrower_id = v_request.student_id and li.status = 'active';
  v_active_count := v_active_count + (
    select count(*)::integer
    from public.borrow_request_items bri
    join public.borrow_requests br on br.id = bri.request_id
    where br.student_id = v_request.student_id
      and br.status = 'approved'
      and br.fulfilment_method = 'delivery'
      and br.loan_id is null
  );
  if v_active_count + v_item_count > v_max_books then
    raise exception 'Approval would exceed the student borrowing limit of %', v_max_books;
  end if;

  perform 1
  from public.books b
  join public.borrow_request_items bri on bri.book_id = b.id
  where bri.request_id = p_request_id
  order by b.id
  for update of b;

  if exists (
    select 1
    from public.borrow_request_items bri
    join public.books b on b.id = bri.book_id
    where bri.request_id = p_request_id
      and (not b.is_published or b.archived_at is not null or b.format not in ('physical', 'both'))
  ) then raise exception 'A requested title is no longer available for physical borrowing'; end if;

  if exists (
    select 1
    from public.borrow_request_items bri
    join public.loan_items li on li.book_id = bri.book_id and li.status = 'active'
    join public.loans l on l.id = li.loan_id and l.borrower_id = v_request.student_id
    where bri.request_id = p_request_id
  ) then raise exception 'The student already has one of these titles on loan'; end if;

  -- Pickup loans begin at approval. Delivery copies are allocated and held;
  -- dispatch is a separate staff action and the due clock begins at receipt.
  if v_request.fulfilment_method = 'pickup' then
    insert into public.loans(borrower_id, basket_id, loan_days, checked_out_at)
    values (v_request.student_id, v_request.basket_id, v_request.loan_days, v_now)
    returning id into v_loan_id;
  end if;

  for v_item in
    select *
    from public.borrow_request_items
    where request_id = p_request_id
    order by book_id, id
  loop
    v_copy_id := null;
    select bc.id into v_copy_id
    from public.book_copies bc
    where bc.book_id = v_item.book_id and bc.status = 'available'
    order by bc.created_at, bc.id
    limit 1
    for update skip locked;
    if v_copy_id is null then
      raise exception 'No copy of "%" is currently available. Nothing was approved.', v_item.title_snapshot;
    end if;

    update public.book_copies set status = 'borrowed' where id = v_copy_id;

    if v_request.fulfilment_method = 'pickup' then
      insert into public.loan_items(
        loan_id, book_id, copy_id, title_snapshot, author_snapshot, category_snapshot,
        slug_snapshot, cover_url_snapshot, loan_days, borrowed_at, due_at
      ) values (
        v_loan_id, v_item.book_id, v_copy_id, v_item.title_snapshot,
        v_item.author_snapshot, v_item.category_snapshot, v_item.slug_snapshot,
        v_item.cover_url_snapshot, v_request.loan_days, v_now,
        v_now + make_interval(days => v_request.loan_days)
      ) returning id into v_loan_item_id;

      update public.borrow_request_items
      set allocated_copy_id = v_copy_id, loan_item_id = v_loan_item_id
      where id = v_item.id;
    else
      update public.borrow_request_items
      set allocated_copy_id = v_copy_id
      where id = v_item.id;
    end if;
  end loop;

  update public.borrow_requests
  set status = 'approved', reviewed_at = v_now, reviewed_by = auth.uid(), loan_id = v_loan_id
  where id = p_request_id;

  insert into public.notifications(user_id, type, title, body, data, dedupe_key)
  values (
    v_request.student_id,
    'borrow_request_approved',
    'Borrow request approved',
    case
      when v_request.fulfilment_method = 'delivery'
        then 'Your delivery was approved and is being prepared. We will notify you after staff dispatch it.'
      else 'Your books are approved and ready for pickup. Your return period starts now.'
    end,
    jsonb_build_object(
      'request_id', p_request_id, 'loan_id', v_loan_id,
      'due_at', case when v_request.fulfilment_method = 'pickup' then v_now + make_interval(days => v_request.loan_days) else null end,
      'dispatched_at', null,
      'fulfilment_method', v_request.fulfilment_method,
      'delivery_fee_pesewas', v_request.delivery_fee_pesewas
    ),
    'borrow-request-approved:' || p_request_id::text
  );

  insert into public.audit_events(actor_id, event_type, entity_type, entity_id, metadata)
  values (
    auth.uid(), 'borrow_request_approved', 'borrow_request', p_request_id::text,
    jsonb_build_object('loan_id', v_loan_id, 'student_id', v_request.student_id, 'items', v_item_count)
  );
  return v_loan_id;
end;
$$;

create or replace function public.staff_mark_delivery_dispatched(p_request_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.borrow_requests%rowtype;
  v_now timestamptz := now();
begin
  if not public.is_staff() then raise exception 'Circulation staff access required'; end if;

  select * into v_request
  from public.borrow_requests
  where id = p_request_id
  for update;
  if v_request.id is null then raise exception 'Borrow request not found'; end if;
  if v_request.fulfilment_method <> 'delivery' or v_request.status <> 'approved' then
    raise exception 'Only an approved delivery can be dispatched';
  end if;
  if v_request.student_received_at is not null or v_request.loan_id is not null then
    raise exception 'This delivery has already been received';
  end if;
  if v_request.dispatched_at is not null then return v_request.dispatched_at; end if;
  if v_request.payment_status <> 'simulated_paid' or v_request.paid_at is null then
    raise exception 'Simulated delivery payment is incomplete';
  end if;
  if not exists (select 1 from public.borrow_request_items where request_id = p_request_id)
     or exists (
       select 1 from public.borrow_request_items bri
       left join public.book_copies bc on bc.id = bri.allocated_copy_id
       where bri.request_id = p_request_id
         and (bri.allocated_copy_id is null or bri.loan_item_id is not null or bc.id is null or bc.status <> 'borrowed')
     ) then
    raise exception 'Every delivery item must have a dispatched copy allocation';
  end if;

  update public.borrow_requests
  set dispatched_at = v_now, dispatched_by = auth.uid()
  where id = p_request_id;

  insert into public.notifications(user_id, type, title, body, data, dedupe_key)
  values (
    v_request.student_id, 'delivery_dispatched', 'Books dispatched',
    'Your books are on the way. Confirm receipt after they arrive; your return period has not started yet.',
    jsonb_build_object('request_id', p_request_id, 'dispatched_at', v_now),
    'delivery-dispatched:' || p_request_id::text
  );
  insert into public.audit_events(actor_id, event_type, entity_type, entity_id, metadata)
  values (
    auth.uid(), 'delivery_dispatched', 'borrow_request', p_request_id::text,
    jsonb_build_object('student_id', v_request.student_id, 'approved_by', v_request.reviewed_by, 'approved_at', v_request.reviewed_at)
  );
  return v_now;
end;
$$;

-- Failed or unclaimed deliveries must never strand inventory. A staff recall
-- preserves the original reviewer/dispatcher fields, records a separate actor
-- and reason, releases every held copy atomically, and notifies the student.
create or replace function public.staff_recall_delivery_request(
  p_request_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.borrow_requests%rowtype;
  v_item public.borrow_request_items%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_now timestamptz := now();
begin
  if not public.is_staff() then raise exception 'Circulation staff access required'; end if;
  if v_reason is null or char_length(v_reason) < 3 or char_length(v_reason) > 300 then
    raise exception 'A recall reason between 3 and 300 characters is required';
  end if;

  select * into v_request
  from public.borrow_requests
  where id = p_request_id
  for update;
  if v_request.id is null then raise exception 'Borrow request not found'; end if;
  if v_request.fulfilment_method <> 'delivery' or v_request.status <> 'approved' then
    raise exception 'Only an approved delivery can be recalled';
  end if;
  if v_request.loan_id is not null or v_request.student_received_at is not null then
    raise exception 'A student-confirmed delivery cannot be recalled';
  end if;

  for v_item in
    select * from public.borrow_request_items
    where request_id = p_request_id
    order by book_id, id
    for update
  loop
    if v_item.allocated_copy_id is null or v_item.loan_item_id is not null then
      raise exception 'A delivery item has an invalid recall allocation state';
    end if;

    update public.book_copies
    set status = case
      when v_request.dispatched_at is null then 'available'::public.copy_status
      else 'maintenance'::public.copy_status
    end
    where id = v_item.allocated_copy_id
      and book_id = v_item.book_id
      and status = 'borrowed';
    if not found then raise exception 'A recalled copy is no longer held by this delivery'; end if;

    -- A copy that never left the desk can return to stock immediately. Once a
    -- delivery was dispatched, retain the exact allocation in controlled
    -- maintenance custody until a different staff member confirms its return.
    if v_request.dispatched_at is null then
      update public.borrow_request_items
      set allocated_copy_id = null
      where id = v_item.id;
    end if;
  end loop;
  if not found then raise exception 'Delivery request has no items'; end if;

  update public.borrow_requests
  set status = 'rejected',
      recalled_at = v_now,
      recalled_by = auth.uid(),
      recall_reason = v_reason,
      recall_returned_at = case when v_request.dispatched_at is null then v_now else null end,
      recall_returned_by = case when v_request.dispatched_at is null then auth.uid() else null end,
      rejection_reason = 'Delivery recalled: ' || v_reason
  where id = p_request_id;

  insert into public.notifications(user_id, type, title, body, data, dedupe_key)
  values (
    v_request.student_id,
    'delivery_recalled',
    'Delivery recalled safely',
    case
      when v_request.dispatched_at is null
        then 'The delivery was stopped before dispatch and its copies were returned to inventory. '
      else 'The dispatched delivery was recalled. Its copies remain unavailable until a second staff member confirms their physical return. '
    end || v_reason,
    jsonb_build_object(
      'request_id', p_request_id,
      'recalled_at', v_now,
      'reason', v_reason,
      'reviewed_by', v_request.reviewed_by,
      'dispatched_by', v_request.dispatched_by
    ),
    'delivery-recalled:' || p_request_id::text
  );

  insert into public.audit_events(actor_id, event_type, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    'delivery_recalled',
    'borrow_request',
    p_request_id::text,
    jsonb_build_object(
      'reason', v_reason,
      'student_id', v_request.student_id,
      'approved_by', v_request.reviewed_by,
      'approved_at', v_request.reviewed_at,
      'dispatched_by', v_request.dispatched_by,
      'dispatched_at', v_request.dispatched_at
    )
  );
end;
$$;

-- A dispatched recall uses separation of duties: neither the dispatcher nor
-- the staff member who initiated the recall may certify the physical return.
-- Only after this second-person desk check do the exact copies become
-- available for another student.
create or replace function public.staff_confirm_recalled_delivery_return(p_request_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.borrow_requests%rowtype;
  v_item public.borrow_request_items%rowtype;
  v_now timestamptz := now();
begin
  if not public.is_staff() then raise exception 'Circulation staff access required'; end if;

  select * into v_request
  from public.borrow_requests
  where id = p_request_id
  for update;
  if v_request.id is null then raise exception 'Borrow request not found'; end if;
  if v_request.status <> 'rejected'
     or v_request.fulfilment_method <> 'delivery'
     or v_request.recalled_at is null
     or v_request.dispatched_at is null then
    raise exception 'Only a dispatched recalled delivery can be returned to the desk';
  end if;
  if v_request.recall_returned_at is not null then return v_request.recall_returned_at; end if;
  if auth.uid() = v_request.dispatched_by or auth.uid() = v_request.recalled_by then
    raise exception 'A different active staff member must confirm the physical return';
  end if;

  for v_item in
    select * from public.borrow_request_items
    where request_id = p_request_id
    order by book_id, id
    for update
  loop
    if v_item.allocated_copy_id is null or v_item.loan_item_id is not null then
      raise exception 'A recalled delivery item has an invalid return state';
    end if;

    update public.book_copies
    set status = 'available'
    where id = v_item.allocated_copy_id
      and book_id = v_item.book_id
      and status = 'maintenance';
    if not found then raise exception 'A recalled copy is not in controlled return custody'; end if;

    update public.borrow_request_items
    set allocated_copy_id = null
    where id = v_item.id;
  end loop;
  if not found then raise exception 'Recalled delivery has no items'; end if;

  update public.borrow_requests
  set recall_returned_at = v_now,
      recall_returned_by = auth.uid()
  where id = p_request_id;

  insert into public.notifications(user_id, type, title, body, data, dedupe_key)
  values (
    v_request.student_id,
    'recalled_delivery_returned',
    'Recalled books secured',
    'A second staff member confirmed that every recalled copy is physically back at the library desk.',
    jsonb_build_object(
      'request_id', p_request_id,
      'returned_at', v_now,
      'returned_by', auth.uid()
    ),
    'recalled-delivery-returned:' || p_request_id::text
  );

  insert into public.audit_events(actor_id, event_type, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    'recalled_delivery_return_confirmed',
    'borrow_request',
    p_request_id::text,
    jsonb_build_object(
      'student_id', v_request.student_id,
      'dispatched_by', v_request.dispatched_by,
      'recalled_by', v_request.recalled_by,
      'recalled_at', v_request.recalled_at
    )
  );
  return v_now;
end;
$$;

-- Only the student who owns a dispatched delivery may confirm receipt. The
-- request row lock makes retries idempotent, and this is the sole point where
-- a delivery loan/due date begins.
create or replace function public.student_confirm_delivery_receipt(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.borrow_requests%rowtype;
  v_item public.borrow_request_items%rowtype;
  v_loan_id uuid;
  v_loan_item_id uuid;
  v_now timestamptz := now();
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_request
  from public.borrow_requests
  where id = p_request_id and student_id = auth.uid()
  for update;
  if v_request.id is null then raise exception 'Delivery request not found'; end if;
  if v_request.fulfilment_method <> 'delivery' then raise exception 'Only deliveries require receipt confirmation'; end if;
  if v_request.status <> 'approved' or v_request.dispatched_at is null then
    raise exception 'This delivery has not been dispatched';
  end if;

  if v_request.student_received_at is not null then
    if v_request.loan_id is null then raise exception 'Delivery receipt state is incomplete'; end if;
    return v_request.loan_id;
  end if;
  if v_request.loan_id is not null then raise exception 'Delivery loan already exists without receipt audit'; end if;
  if v_request.payment_status <> 'simulated_paid' or v_request.paid_at is null then
    raise exception 'Simulated delivery payment is incomplete';
  end if;

  insert into public.loans(borrower_id, basket_id, loan_days, checked_out_at)
  values (v_request.student_id, v_request.basket_id, v_request.loan_days, v_now)
  returning id into v_loan_id;

  for v_item in
    select * from public.borrow_request_items
    where request_id = p_request_id
    order by book_id, id
    for update
  loop
    if v_item.allocated_copy_id is null or v_item.loan_item_id is not null then
      raise exception 'A dispatched item has an invalid allocation state';
    end if;

    perform 1 from public.book_copies
    where id = v_item.allocated_copy_id and book_id = v_item.book_id and status = 'borrowed'
    for update;
    if not found then raise exception 'A dispatched copy is no longer available for receipt'; end if;

    insert into public.loan_items(
      loan_id, book_id, copy_id, title_snapshot, author_snapshot, category_snapshot,
      slug_snapshot, cover_url_snapshot, loan_days, borrowed_at, due_at
    ) values (
      v_loan_id, v_item.book_id, v_item.allocated_copy_id, v_item.title_snapshot,
      v_item.author_snapshot, v_item.category_snapshot, v_item.slug_snapshot,
      v_item.cover_url_snapshot, v_request.loan_days, v_now,
      v_now + make_interval(days => v_request.loan_days)
    ) returning id into v_loan_item_id;

    update public.borrow_request_items
    set loan_item_id = v_loan_item_id
    where id = v_item.id;
  end loop;

  if not found then raise exception 'Delivery request has no items'; end if;

  update public.borrow_requests
  set loan_id = v_loan_id,
      student_received_at = v_now,
      receipt_confirmed_by = auth.uid()
  where id = p_request_id;

  insert into public.notifications(user_id, type, title, body, data, dedupe_key)
  values (
    auth.uid(), 'delivery_receipt_confirmed', 'Delivery received',
    'Receipt confirmed. Your return period starts now.',
    jsonb_build_object(
      'request_id', p_request_id,
      'loan_id', v_loan_id,
      'received_at', v_now,
      'due_at', v_now + make_interval(days => v_request.loan_days)
    ),
    'delivery-received:' || p_request_id::text
  );

  insert into public.audit_events(actor_id, event_type, entity_type, entity_id, metadata)
  values (
    auth.uid(), 'delivery_receipt_confirmed', 'borrow_request', p_request_id::text,
    jsonb_build_object('loan_id', v_loan_id, 'dispatched_by', v_request.dispatched_by, 'dispatched_at', v_request.dispatched_at)
  );
  return v_loan_id;
end;
$$;

create or replace function public.confirm_delivery_receipt(p_request_id uuid)
returns uuid
language sql
set search_path = ''
as $$
  select public.student_confirm_delivery_receipt(p_request_id);
$$;

create or replace function public.reject_borrow_request(p_request_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student_id uuid;
begin
  if not public.is_staff() then raise exception 'Circulation staff access required'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'A rejection reason is required'; end if;

  update public.borrow_requests
  set status = 'rejected', reviewed_at = now(), reviewed_by = auth.uid(), rejection_reason = trim(p_reason)
  where id = p_request_id and status = 'pending'
  returning student_id into v_student_id;
  if v_student_id is null then raise exception 'Pending request not found'; end if;

  insert into public.notifications(user_id, type, title, body, data, dedupe_key)
  values (
    v_student_id, 'borrow_request_rejected', 'Borrow request not approved', trim(p_reason),
    jsonb_build_object('request_id', p_request_id, 'reason', trim(p_reason)),
    'borrow-request-rejected:' || p_request_id::text
  );
  insert into public.audit_events(actor_id, event_type, entity_type, entity_id, metadata)
  values (auth.uid(), 'borrow_request_rejected', 'borrow_request', p_request_id::text, jsonb_build_object('reason', trim(p_reason)));
end;
$$;

create or replace function public.librarian_approve_borrow_request(p_request_id uuid)
returns uuid
language sql
set search_path = ''
as $$
  select public.approve_borrow_request(p_request_id);
$$;

create or replace function public.librarian_reject_borrow_request(p_request_id uuid, p_reason text)
returns void
language sql
set search_path = ''
as $$
  select public.reject_borrow_request(p_request_id, p_reason);
$$;

create or replace function public.remove_from_basket(p_book_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_basket_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select id into v_basket_id
  from public.borrow_baskets
  where user_id = auth.uid() and status = 'active'
  for update;
  if v_basket_id is null then return; end if;

  delete from public.basket_items
  where basket_id = v_basket_id and book_id = p_book_id;
end;
$$;

create or replace function public.clean_my_basket()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_basket_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select id into v_basket_id
  from public.borrow_baskets
  where user_id = auth.uid() and status = 'active'
  for update;
  if v_basket_id is null then return 0; end if;

  delete from public.basket_items bi
  using public.books b
  where bi.basket_id = v_basket_id
    and bi.book_id = b.id
    and (not b.is_published or b.archived_at is not null or b.format not in ('physical', 'both'));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Compatibility shield for older clients: "checkout" now creates a pending
-- pickup request. It never allocates a copy, creates a loan, or starts a due
-- date; only approve_borrow_request may do that.
create or replace function public.checkout_basket(p_loan_days integer)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select public.submit_borrow_request(p_loan_days, 'pickup'::public.fulfilment_method, null);
$$;

-- Borrowers may request a return, but they cannot change loan/copy custody.
-- Fine accrual deliberately continues while a request waits in the queue.
create or replace function public.request_loan_item_return(p_loan_item_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
  v_request_id uuid;
  v_overdue_periods integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select
    li.id, li.loan_id, li.book_id, li.copy_id, li.title_snapshot, li.status,
    li.due_at, li.fine_rate_pesewas, l.borrower_id,
    p.full_name as student_name
  into v_item
  from public.loan_items li
  join public.loans l on l.id = li.loan_id
  join public.profiles p on p.id = l.borrower_id
  where li.id = p_loan_item_id
    and l.borrower_id = auth.uid()
    and p.role = 'student'
  for update of li;

  if v_item.id is null then raise exception 'Active loan item not found'; end if;
  if v_item.status <> 'active' then raise exception 'Only an active loan item can be requested for return'; end if;

  select rr.id into v_request_id
  from public.return_requests rr
  where rr.loan_item_id = v_item.id and rr.status = 'pending'
  order by rr.requested_at desc, rr.id desc
  limit 1;
  if v_request_id is not null then return v_request_id; end if;

  insert into public.return_requests(
    loan_item_id, loan_id, student_id, requested_by, request_source
  ) values (
    v_item.id, v_item.loan_id, v_item.borrower_id, auth.uid(), 'student'
  )
  returning id into v_request_id;

  v_overdue_periods := case
    when now() <= v_item.due_at then 0
    else floor(extract(epoch from (now() - v_item.due_at)) / 86400)::integer
  end;

  insert into public.notifications(user_id, type, title, body, data, dedupe_key)
  select
    staff.id,
    'return_requested',
    'Book return requested',
    coalesce(v_item.student_name, 'A student') || ' requested to return ' || coalesce(v_item.title_snapshot, 'a library book') || '.',
    jsonb_build_object(
      'return_request_id', v_request_id,
      'loan_item_id', v_item.id,
      'student_id', v_item.borrower_id,
      'fine_amount_pesewas', v_overdue_periods * v_item.fine_rate_pesewas
    ),
    'return-request:' || v_request_id::text || ':' || staff.id::text
  from public.profiles staff
  where staff.role in ('librarian', 'admin', 'super_admin') and staff.status = 'active'
  on conflict (dedupe_key) do nothing;

  insert into public.audit_events(actor_id, event_type, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    'return_requested',
    'return_request',
    v_request_id::text,
    jsonb_build_object(
      'loan_item_id', v_item.id,
      'loan_id', v_item.loan_id,
      'book_id', v_item.book_id,
      'copy_id', v_item.copy_id,
      'student_id', v_item.borrower_id,
      'due_at', v_item.due_at,
      'fine_amount_pesewas_at_request', v_overdue_periods * v_item.fine_rate_pesewas
    )
  );

  return v_request_id;
end;
$$;

create or replace function public.cancel_return_request(p_return_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.return_requests%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_request
  from public.return_requests
  where id = p_return_request_id and student_id = auth.uid()
  for update;

  if v_request.id is null then raise exception 'Return request not found'; end if;
  if v_request.status = 'cancelled' then return; end if;
  if v_request.status = 'accepted' then raise exception 'An accepted physical return cannot be cancelled'; end if;

  update public.return_requests
  set status = 'cancelled', cancelled_at = now()
  where id = v_request.id;

  insert into public.audit_events(actor_id, event_type, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    'return_request_cancelled',
    'return_request',
    v_request.id::text,
    jsonb_build_object('loan_item_id', v_request.loan_item_id, 'loan_id', v_request.loan_id)
  );
end;
$$;

-- This is the authoritative custody transition. The request, exact copy,
-- parent loan, final fine snapshot, student notification, and immutable audit
-- event are committed together or not at all.
create or replace function public.accept_return_request(
  p_return_request_id uuid,
  p_condition public.book_condition
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.return_requests%rowtype;
  v_item public.loan_items%rowtype;
  v_copy_status public.copy_status;
  v_now timestamptz := now();
  v_overdue_periods integer;
  v_fine_amount integer;
  v_student_id uuid;
  v_title text;
  v_accession_number text;
begin
  if not public.is_staff() then raise exception 'Staff access required'; end if;
  if p_condition is null then raise exception 'Return condition is required'; end if;

  select * into v_request
  from public.return_requests
  where id = p_return_request_id
  for update;
  if v_request.id is null then raise exception 'Return request not found'; end if;
  if v_request.status = 'accepted' then return v_request.id; end if;
  if v_request.status <> 'pending' then raise exception 'Only a pending return request can be accepted'; end if;

  select * into v_item
  from public.loan_items
  where id = v_request.loan_item_id
  for update;
  if v_item.id is null then raise exception 'Loan item not found'; end if;
  if v_item.status <> 'active' then raise exception 'This item is no longer an active loan'; end if;
  if v_item.loan_id <> v_request.loan_id then raise exception 'Return request loan does not match the tracked item'; end if;

  select l.borrower_id into v_student_id
  from public.loans l
  where l.id = v_item.loan_id
  for update;
  if v_student_id is distinct from v_request.student_id then
    raise exception 'Return request borrower does not match the tracked loan';
  end if;

  select bc.accession_number into v_accession_number
  from public.book_copies bc
  where bc.id = v_item.copy_id and bc.book_id = v_item.book_id and bc.status = 'borrowed'
  for update;
  if not found then raise exception 'The exact borrowed copy is not available for return processing'; end if;

  v_overdue_periods := case
    when v_now <= v_item.due_at then 0
    else floor(extract(epoch from (v_now - v_item.due_at)) / 86400)::integer
  end;
  v_fine_amount := v_overdue_periods * v_item.fine_rate_pesewas;
  v_copy_status := case
    when p_condition = 'damaged' then 'damaged'::public.copy_status
    else 'available'::public.copy_status
  end;

  update public.return_requests
  set status = 'accepted',
      accepted_at = v_now,
      accepted_by = auth.uid(),
      return_condition = p_condition,
      fine_rate_pesewas = v_item.fine_rate_pesewas,
      overdue_periods_at_acceptance = v_overdue_periods,
      fine_amount_pesewas = v_fine_amount
  where id = v_request.id;

  update public.loan_items
  set status = 'returned',
      returned_at = v_now,
      return_condition = p_condition,
      overdue_periods_at_return = v_overdue_periods,
      fine_amount_pesewas = v_fine_amount,
      return_accepted_at = v_now,
      return_accepted_by = auth.uid(),
      return_request_id = v_request.id
  where id = v_item.id;

  update public.book_copies
  set status = v_copy_status, condition = p_condition
  where id = v_item.copy_id;

  update public.loans l
  set status = 'returned', returned_at = v_now
  where l.id = v_item.loan_id
    and not exists (
      select 1 from public.loan_items other
      where other.loan_id = l.id and other.id <> v_item.id and other.status in ('active', 'lost')
    );

  select b.title into v_title from public.books b where b.id = v_item.book_id;

  insert into public.notifications(user_id, type, title, body, data, dedupe_key)
  values (
    v_student_id,
    'return_accepted',
    'Book return accepted',
    coalesce(v_title, v_item.title_snapshot, 'Your book') || ' was received by the library.' ||
      case
        when v_fine_amount > 0 then ' Your final overdue fine is GHS ' || to_char(v_fine_amount / 100.0, 'FM999999990.00') || '.'
        else ' No overdue fine was charged.'
      end,
    jsonb_build_object(
      'return_request_id', v_request.id,
      'loan_item_id', v_item.id,
      'book_id', v_item.book_id,
      'copy_id', v_item.copy_id,
      'accepted_at', v_now,
      'accepted_by', auth.uid(),
      'condition', p_condition,
      'overdue_periods', v_overdue_periods,
      'fine_rate_pesewas', v_item.fine_rate_pesewas,
      'fine_amount_pesewas', v_fine_amount
    ),
    'return-accepted:' || v_request.id::text
  )
  on conflict (dedupe_key) do nothing;

  insert into public.audit_events(actor_id, event_type, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    'return_accepted',
    'return_request',
    v_request.id::text,
    jsonb_build_object(
      'loan_item_id', v_item.id,
      'loan_id', v_item.loan_id,
      'book_id', v_item.book_id,
      'copy_id', v_item.copy_id,
      'accession_number', v_accession_number,
      'student_id', v_student_id,
      'accepted_at', v_now,
      'condition', p_condition,
      'overdue_periods', v_overdue_periods,
      'fine_rate_pesewas', v_item.fine_rate_pesewas,
      'fine_amount_pesewas', v_fine_amount,
      'copy_status_after_return', v_copy_status
    )
  );

  return v_request.id;
end;
$$;

-- Backward-compatible staff endpoint. Older librarian clients may return an
-- item directly, but this wrapper creates the same custody request/audit record
-- and then runs the authoritative acceptance transaction. Students still fail
-- the staff check and can never mark an item returned.
create or replace function public.return_loan_item(
  p_loan_item_id uuid,
  p_condition public.book_condition default 'good'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
  v_request_id uuid;
begin
  if not public.is_staff() then raise exception 'Staff access required'; end if;
  if p_condition is null then raise exception 'Return condition is required'; end if;

  select li.id, li.loan_id, li.status, l.borrower_id
  into v_item
  from public.loan_items li
  join public.loans l on l.id = li.loan_id
  where li.id = p_loan_item_id
  for update of li;
  if v_item.id is null then raise exception 'Loan item not found'; end if;
  if v_item.status = 'returned' then return; end if;
  if v_item.status <> 'active' then raise exception 'This item is not an active loan'; end if;

  select rr.id into v_request_id
  from public.return_requests rr
  where rr.loan_item_id = v_item.id and rr.status = 'pending'
  order by rr.requested_at desc, rr.id desc
  limit 1
  for update;

  if v_request_id is null then
    insert into public.return_requests(
      loan_item_id, loan_id, student_id, requested_by, request_source
    ) values (
      v_item.id, v_item.loan_id, v_item.borrower_id, auth.uid(), 'staff_direct'
    )
    returning id into v_request_id;

    insert into public.audit_events(actor_id, event_type, entity_type, entity_id, metadata)
    values (
      auth.uid(),
      'return_request_created_by_staff',
      'return_request',
      v_request_id::text,
      jsonb_build_object('loan_item_id', v_item.id, 'loan_id', v_item.loan_id, 'student_id', v_item.borrower_id)
    );
  end if;

  perform public.accept_return_request(v_request_id, p_condition);
end;
$$;

-- Settle the full authoritative outstanding fine for one specific loan item.
-- No amount is accepted from the client. For active overdue items a new
-- payment can only be created when a later completed 24-hour period increases
-- the authoritative total; a retry at the same total returns the same receipt.
create or replace function public.pay_loan_item_fine(
  p_loan_item_id uuid,
  p_payment_method public.simulated_payment_method
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.loan_items%rowtype;
  v_borrower_id uuid := auth.uid();
  v_fine_total integer;
  v_outstanding integer;
  v_payment_id uuid;
  v_payment_reference text;
  v_title text;
  v_now timestamptz := now();
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_payment_method is null then raise exception 'Choose card or mobile money'; end if;

  -- The loan-item lock serializes payment retries with return acceptance, so
  -- the fine total, receipt, paid balance, notification, and audit event agree.
  select li.*
  into v_item
  from public.loan_items li
  join public.loans l on l.id = li.loan_id
  where li.id = p_loan_item_id
    and l.borrower_id = v_borrower_id
  for update of li;

  if v_item.id is null then raise exception 'Loan item not found'; end if;
  if v_item.status not in ('active', 'lost', 'returned') then
    raise exception 'This loan item cannot receive a fine payment';
  end if;

  v_fine_total := case
    when v_item.status = 'returned' and v_item.fine_amount_pesewas is not null
      then v_item.fine_amount_pesewas
    when v_item.status = 'returned' and v_item.returned_at > v_item.due_at
      then floor(extract(epoch from (v_item.returned_at - v_item.due_at)) / 86400)::integer * v_item.fine_rate_pesewas
    when v_item.status in ('active', 'lost') and v_now > v_item.due_at
      then floor(extract(epoch from (v_now - v_item.due_at)) / 86400)::integer * v_item.fine_rate_pesewas
    else 0
  end;

  -- This is the idempotent retry path. The method on the original receipt is
  -- retained because a retry must never fabricate a second financial event.
  select fp.id into v_payment_id
  from public.fine_payments fp
  where fp.loan_item_id = v_item.id
    and fp.fine_total_pesewas = v_fine_total
    and fp.student_id = v_borrower_id
    and fp.status = 'simulated_paid'
  order by fp.paid_at desc, fp.id desc
  limit 1;
  if v_payment_id is not null then return v_payment_id; end if;

  v_outstanding := greatest(v_fine_total - v_item.fine_paid_pesewas, 0);
  if v_outstanding = 0 then raise exception 'This loan item has no outstanding fine'; end if;

  v_payment_id := gen_random_uuid();
  v_payment_reference := 'KLM-FINE-' || upper(substr(replace(v_payment_id::text, '-', ''), 1, 20));

  insert into public.fine_payments(
    id, loan_item_id, loan_id, student_id, fine_total_pesewas,
    amount_pesewas, balance_before_pesewas, balance_after_pesewas,
    payment_method, status, payment_reference, paid_at
  ) values (
    v_payment_id, v_item.id, v_item.loan_id, v_borrower_id, v_fine_total,
    v_outstanding, v_outstanding, 0,
    p_payment_method, 'simulated_paid', v_payment_reference, v_now
  );

  update public.loan_items
  set fine_paid_pesewas = fine_paid_pesewas + v_outstanding
  where id = v_item.id;

  select b.title into v_title from public.books b where b.id = v_item.book_id;

  insert into public.notifications(user_id, type, title, body, data, dedupe_key)
  values (
    v_borrower_id,
    'fine_payment_received',
    'Fine payment successful',
    'Your simulated payment of GHS ' || to_char(v_outstanding / 100.0, 'FM999999990.00') ||
      ' for ' || coalesce(v_title, v_item.title_snapshot, 'your borrowed book') || ' was successful.',
    jsonb_build_object(
      'payment_id', v_payment_id,
      'payment_reference', v_payment_reference,
      'loan_item_id', v_item.id,
      'loan_id', v_item.loan_id,
      'book_id', v_item.book_id,
      'payment_method', p_payment_method,
      'amount_pesewas', v_outstanding,
      'fine_total_pesewas', v_fine_total,
      'balance_after_pesewas', 0,
      'paid_at', v_now
    ),
    'fine-payment:' || v_payment_id::text
  )
  on conflict (dedupe_key) do nothing;

  insert into public.audit_events(actor_id, event_type, entity_type, entity_id, metadata)
  values (
    v_borrower_id,
    'fine_payment_completed',
    'fine_payment',
    v_payment_id::text,
    jsonb_build_object(
      'payment_reference', v_payment_reference,
      'loan_item_id', v_item.id,
      'loan_id', v_item.loan_id,
      'student_id', v_borrower_id,
      'payment_method', p_payment_method,
      'amount_pesewas', v_outstanding,
      'fine_total_pesewas', v_fine_total,
      'balance_after_pesewas', 0,
      'paid_at', v_now
    )
  );

  return v_payment_id;
end;
$$;

create or replace function public.mark_notification_read(p_notification_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications
  set read_at = coalesce(read_at, now())
  where id = p_notification_id and user_id = auth.uid();
$$;

-- Idempotent worker. Schedule run_due_notification_worker() from trusted Supabase Cron.
create or replace function public.run_due_notification_worker()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_due_count integer;
  v_critical_count integer;
begin
  insert into public.notifications(user_id, type, title, body, data, dedupe_key)
  select
    l.borrower_id,
    case when li.due_at < now() then 'overdue' else 'due_soon' end,
    case when li.due_at < now() then 'Book overdue' else 'Return date approaching' end,
    b.title || case
      when li.due_at < now() then
        ' is overdue. Your current fine is GHS ' ||
        to_char(
          greatest(
            floor(extract(epoch from (now() - li.due_at)) / 86400)::integer * li.fine_rate_pesewas - li.fine_paid_pesewas,
            0
          ) / 100.0,
          'FM999999990.00'
        ) || '.'
      else ' is due soon.'
    end,
    jsonb_build_object(
      'loan_item_id', li.id,
      'book_id', b.id,
      'due_at', li.due_at,
      'overdue_periods', case
        when now() > li.due_at then floor(extract(epoch from (now() - li.due_at)) / 86400)::integer
        else 0
      end,
      'fine_rate_pesewas', li.fine_rate_pesewas,
      'fine_amount_pesewas', case
        when now() > li.due_at
          then floor(extract(epoch from (now() - li.due_at)) / 86400)::integer * li.fine_rate_pesewas
        else 0
      end,
      'fine_paid_pesewas', li.fine_paid_pesewas,
      'fine_outstanding_pesewas', case
        when now() > li.due_at then greatest(
          floor(extract(epoch from (now() - li.due_at)) / 86400)::integer * li.fine_rate_pesewas - li.fine_paid_pesewas,
          0
        )
        else 0
      end
    ),
    case when li.due_at < now() then 'overdue:' else 'due-soon:' end || li.id::text || ':' || current_date::text
  from public.loan_items li
  join public.loans l on l.id = li.loan_id
  join public.books b on b.id = li.book_id
  join public.library_settings s on s.id = true
  where li.status = 'active'
    and s.reminders_enabled
    and li.due_at <= now() + make_interval(hours => s.reminder_hours)
  on conflict (dedupe_key) do nothing;

  get diagnostics v_due_count = row_count;

  -- One threshold notification per loan item. Critical means at least two
  -- completed overdue periods (48 hours) with money still outstanding. A
  -- returned item remains critical from its immutable fine snapshot until the
  -- borrower settles it.
  insert into public.notifications(user_id, type, title, body, data, dedupe_key)
  select
    l.borrower_id,
    'critical_fine_48h',
    'Critical overdue fine',
    coalesce(b.title, li.title_snapshot, 'Your borrowed book') ||
      ' has reached at least 48 hours overdue. Your outstanding fine is GHS ' ||
      to_char(outstanding.fine_outstanding_pesewas / 100.0, 'FM999999990.00') || '.',
    jsonb_build_object(
      'loan_item_id', li.id,
      'loan_id', li.loan_id,
      'book_id', li.book_id,
      'due_at', li.due_at,
      'returned_at', li.returned_at,
      'overdue_periods', fine.overdue_periods,
      'fine_rate_pesewas', li.fine_rate_pesewas,
      'fine_amount_pesewas', amount.fine_amount_pesewas,
      'fine_paid_pesewas', li.fine_paid_pesewas,
      'fine_outstanding_pesewas', outstanding.fine_outstanding_pesewas,
      'critical_since', li.due_at + interval '2 days'
    ),
    'critical-fine-48h:' || li.id::text
  from public.loan_items li
  join public.loans l on l.id = li.loan_id
  left join public.books b on b.id = li.book_id
  cross join lateral (
    select case
      when li.status = 'returned' and li.overdue_periods_at_return is not null
        then li.overdue_periods_at_return
      when li.status = 'returned' and li.returned_at > li.due_at
        then floor(extract(epoch from (li.returned_at - li.due_at)) / 86400)::integer
      when li.status in ('active', 'lost') and now() > li.due_at
        then floor(extract(epoch from (now() - li.due_at)) / 86400)::integer
      else 0
    end as overdue_periods
  ) fine
  cross join lateral (
    select case
      when li.status = 'returned' and li.fine_amount_pesewas is not null
        then li.fine_amount_pesewas
      else fine.overdue_periods * li.fine_rate_pesewas
    end as fine_amount_pesewas
  ) amount
  cross join lateral (
    select greatest(amount.fine_amount_pesewas - li.fine_paid_pesewas, 0) as fine_outstanding_pesewas
  ) outstanding
  where li.status in ('active', 'lost', 'returned')
    and fine.overdue_periods >= 2
    and outstanding.fine_outstanding_pesewas > 0
  on conflict (dedupe_key) do nothing;

  get diagnostics v_critical_count = row_count;
  return v_due_count + v_critical_count;
end;
$$;

create or replace function public.generate_due_notifications()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then raise exception 'Staff access required'; end if;
  return public.run_due_notification_worker();
end;
$$;

-- Views expose exactly what each application surface needs.
-- Drop in dependency order so this file can replace older view column layouts.
drop function if exists public.get_public_catalog();
drop view if exists public.super_admin_administrators;
drop view if exists public.admin_dashboard_stats;
drop view if exists public.admin_critical_fines;
drop view if exists public.staff_critical_fines;
drop view if exists public.admin_return_requests;
drop view if exists public.staff_return_requests;
drop view if exists public.my_return_requests;
drop view if exists public.my_fine_payments;
drop view if exists public.admin_catalog_books;
drop view if exists public.librarian_borrow_requests;
drop view if exists public.admin_borrow_requests;
drop view if exists public.staff_borrow_requests;
drop view if exists public.my_borrow_requests;
drop view if exists public.admin_students;
drop view if exists public.admin_student_profiles;
drop view if exists public.admin_librarian_performance;
drop view if exists public.admin_librarians;
drop view if exists public.my_student_profile;
drop view if exists public.admin_daily_circulation;
drop view if exists public.admin_circulation;
drop view if exists public.published_book_chapters;
drop view if exists public.my_loans;
drop view if exists public.my_basket;
drop view if exists public.catalog_books;
drop view if exists public.inventory_summary;

create or replace view public.super_admin_administrators
with (security_barrier = true)
as
select
  p.id,
  p.full_name,
  p.index_number,
  coalesce(p.personal_email, p.email) as email,
  p.status,
  p.created_at,
  p.updated_at
from public.profiles p
where p.role = 'admin'
  and p.admin_access_revoked_at is null
  and public.is_super_admin();

create or replace view public.inventory_summary
with (security_invoker = true)
as
select
  b.id as book_id,
  count(c.id) filter (where c.status <> 'retired')::integer as total_copies,
  count(c.id) filter (where c.status = 'available')::integer as available_copies,
  count(c.id) filter (where c.status = 'borrowed')::integer as borrowed_copies,
  count(c.id) filter (where c.status = 'lost')::integer as lost_copies,
  count(c.id) filter (where c.status = 'damaged')::integer as damaged_copies,
  min(c.shelf_location) filter (where c.status <> 'retired') as shelf_location
from public.books b
left join public.book_copies c on c.book_id = b.id
group by b.id;

create or replace view public.catalog_books
with (security_invoker = true)
as
select
  b.id,
  b.slug,
  b.title,
  b.isbn,
  b.description,
  b.format,
  b.pages,
  b.published_year,
  b.language,
  b.cover_url,
  b.featured,
  (b.created_at >= now() - interval '60 days') as new_arrival,
  a.name as author,
  c.name as category,
  coalesce(i.total_copies, 0) as total_copies,
  coalesce(i.available_copies, 0) as available_copies,
  b.borrow_count,
  i.shelf_location,
  case when b.pages is null then null else greatest(1, round(b.pages::numeric / 55))::text || ' hr read' end as read_time,
  exists (
    select 1
    from public.digital_editions de
    join public.book_chapters bc on bc.edition_id = de.id
    where de.book_id = b.id and de.status = 'published' and bc.is_published
  ) as online_available,
  b.created_at,
  b.updated_at
from public.books b
join public.authors a on a.id = b.author_id
join public.categories c on c.id = b.category_id
left join public.inventory_summary i on i.book_id = b.id
where b.is_published = true and b.archived_at is null;

-- Admin catalogue includes both live and archived titles. It is deliberately
-- separate from the public catalogue so archive metadata and object paths are
-- never exposed to anonymous/student surfaces.
create or replace view public.admin_catalog_books
with (security_barrier = true)
as
select
  b.id,
  b.slug,
  b.title,
  b.isbn,
  b.description,
  b.format,
  b.pages,
  b.published_year,
  b.language,
  b.publisher,
  b.cover_object_path,
  b.cover_url,
  b.shelf_hint,
  b.featured,
  b.borrow_count,
  b.is_published,
  b.archived_at,
  b.author_id,
  a.name as author,
  b.category_id,
  c.name as category,
  coalesce(i.total_copies, 0) as total_copies,
  coalesce(i.available_copies, 0) as available_copies,
  coalesce(i.borrowed_copies, 0) as borrowed_copies,
  coalesce(i.lost_copies, 0) as lost_copies,
  coalesce(i.damaged_copies, 0) as damaged_copies,
  i.shelf_location,
  de.id as digital_edition_id,
  de.status as digital_edition_status,
  exists (
    select 1 from public.book_chapters chapter
    where chapter.edition_id = de.id and chapter.is_published
  ) as online_available,
  b.created_by,
  b.updated_by,
  b.created_at,
  b.updated_at
from public.books b
join public.authors a on a.id = b.author_id
join public.categories c on c.id = b.category_id
left join public.inventory_summary i on i.book_id = b.id
left join public.digital_editions de on de.book_id = b.id
where public.is_admin();

create or replace view public.my_basket
with (security_invoker = true)
as
select bb.id as basket_id, bi.id as basket_item_id, bi.book_id, bi.added_at
from public.borrow_baskets bb
join public.basket_items bi on bi.basket_id = bb.id
where bb.user_id = auth.uid() and bb.status = 'active';

create or replace view public.my_loans
with (security_invoker = true)
as
select
  li.id as loan_item_id,
  l.id as loan_id,
  li.book_id,
  li.copy_id,
  li.title_snapshot as title,
  li.author_snapshot as author,
  li.category_snapshot as category,
  li.slug_snapshot as slug,
  li.cover_url_snapshot as cover_url,
  li.borrowed_at,
  li.due_at,
  li.returned_at,
  li.status,
  fine.overdue_periods,
  li.fine_rate_pesewas,
  amount.fine_amount_pesewas,
  outstanding.fine_outstanding_pesewas,
  li.fine_paid_pesewas,
  case
    when amount.fine_amount_pesewas = 0 then 'not_due'
    when outstanding.fine_outstanding_pesewas = 0 then 'paid'
    when li.fine_paid_pesewas > 0 then 'partially_paid'
    else 'unpaid'
  end as fine_payment_status,
  latest_payment.payment_reference as fine_payment_reference,
  latest_payment.paid_at as fine_paid_at,
  latest_payment.payment_method as fine_payment_method,
  latest_payment.amount_pesewas as last_fine_payment_amount_pesewas,
  (select count(*)::integer from public.fine_payments fp_count where fp_count.loan_item_id = li.id) as fine_payment_count,
  (fine.overdue_periods >= 2 and outstanding.fine_outstanding_pesewas > 0) as is_critical_fine,
  rr.id as return_request_id,
  rr.status as return_request_status,
  rr.requested_at as return_requested_at,
  rr.accepted_at as return_accepted_at,
  rr.accepted_by as return_accepted_by,
  acceptor.full_name as return_acceptor_name,
  li.return_condition,
  case
    when li.status = 'returned' then 'returned'
    when li.due_at < now() then 'overdue'
    when li.due_at <= now() + make_interval(hours => s.reminder_hours) then 'due-soon'
    else 'active'
  end as display_status
from public.loans l
join public.loan_items li on li.loan_id = l.id
cross join public.library_settings s
cross join lateral (
  select case
    when li.status = 'returned' and li.overdue_periods_at_return is not null then li.overdue_periods_at_return
    when li.status in ('active', 'lost') and now() > li.due_at
      then floor(extract(epoch from (now() - li.due_at)) / 86400)::integer
    when li.status = 'returned' and li.returned_at > li.due_at
      then floor(extract(epoch from (li.returned_at - li.due_at)) / 86400)::integer
    else 0
  end as overdue_periods
) fine
cross join lateral (
  select case
    when li.status = 'returned' and li.fine_amount_pesewas is not null then li.fine_amount_pesewas
    else fine.overdue_periods * li.fine_rate_pesewas
  end as fine_amount_pesewas
) amount
cross join lateral (
  select greatest(amount.fine_amount_pesewas - li.fine_paid_pesewas, 0) as fine_outstanding_pesewas
) outstanding
left join lateral (
  select fp.payment_reference, fp.paid_at, fp.payment_method, fp.amount_pesewas
  from public.fine_payments fp
  where fp.loan_item_id = li.id and fp.status = 'simulated_paid'
  order by fp.paid_at desc, fp.id desc
  limit 1
) latest_payment on true
left join lateral (
  select candidate.*
  from public.return_requests candidate
  where candidate.loan_item_id = li.id
  order by candidate.requested_at desc, candidate.id desc
  limit 1
) rr on true
left join public.profiles acceptor on acceptor.id = rr.accepted_by
where l.borrower_id = auth.uid();

create or replace view public.my_fine_payments
with (security_barrier = true)
as
select
  fp.id,
  fp.loan_item_id,
  fp.loan_id,
  li.book_id,
  li.title_snapshot as book_title,
  fp.fine_total_pesewas,
  fp.amount_pesewas,
  fp.balance_before_pesewas,
  fp.balance_after_pesewas,
  fp.payment_method,
  fp.status,
  fp.payment_reference,
  fp.paid_at,
  fp.created_at
from public.fine_payments fp
join public.loan_items li on li.id = fp.loan_item_id and li.loan_id = fp.loan_id
where fp.student_id = auth.uid();

create or replace view public.my_return_requests
with (security_barrier = true)
as
select
  rr.id,
  rr.loan_item_id,
  rr.loan_id,
  rr.status,
  rr.request_source,
  rr.requested_at,
  rr.cancelled_at,
  rr.accepted_at,
  rr.accepted_by,
  acceptor.full_name as acceptor_name,
  rr.return_condition,
  li.book_id,
  li.copy_id,
  li.title_snapshot as title,
  li.author_snapshot as author,
  li.category_snapshot as category,
  li.slug_snapshot as slug,
  li.cover_url_snapshot as cover_url,
  bc.accession_number,
  li.borrowed_at,
  li.due_at,
  li.returned_at,
  li.status as loan_item_status,
  fine.overdue_periods,
  li.fine_rate_pesewas,
  amount.fine_amount_pesewas,
  outstanding.fine_outstanding_pesewas,
  li.fine_paid_pesewas,
  case
    when amount.fine_amount_pesewas = 0 then 'not_due'
    when outstanding.fine_outstanding_pesewas = 0 then 'paid'
    when li.fine_paid_pesewas > 0 then 'partially_paid'
    else 'unpaid'
  end as fine_payment_status,
  latest_payment.payment_reference as fine_payment_reference,
  latest_payment.paid_at as fine_paid_at,
  latest_payment.payment_method as fine_payment_method,
  (fine.overdue_periods >= 2 and outstanding.fine_outstanding_pesewas > 0) as is_critical_fine
from public.return_requests rr
join public.loan_items li on li.id = rr.loan_item_id and li.loan_id = rr.loan_id
join public.book_copies bc on bc.id = li.copy_id
left join public.profiles acceptor on acceptor.id = rr.accepted_by
cross join lateral (
  select case
    when rr.status = 'accepted' then coalesce(rr.overdue_periods_at_acceptance, 0)
    when li.status in ('active', 'lost') and now() > li.due_at
      then floor(extract(epoch from (now() - li.due_at)) / 86400)::integer
    else 0
  end as overdue_periods
) fine
cross join lateral (
  select case
    when rr.status = 'accepted' then coalesce(rr.fine_amount_pesewas, 0)
    else fine.overdue_periods * li.fine_rate_pesewas
  end as fine_amount_pesewas
) amount
cross join lateral (
  select greatest(amount.fine_amount_pesewas - li.fine_paid_pesewas, 0) as fine_outstanding_pesewas
) outstanding
left join lateral (
  select fp.payment_reference, fp.paid_at, fp.payment_method
  from public.fine_payments fp
  where fp.loan_item_id = li.id and fp.status = 'simulated_paid'
  order by fp.paid_at desc, fp.id desc
  limit 1
) latest_payment on true
where rr.student_id = auth.uid();

-- Librarians receive only operational identity/custody fields needed to verify
-- and accept a physical handover. Guardian, private intake, and personal email
-- details remain absent from this surface.
create or replace view public.staff_return_requests
with (security_barrier = true)
as
select
  rr.id,
  rr.loan_item_id,
  rr.loan_id,
  rr.student_id,
  student.full_name as student_name,
  student.index_number,
  student.student_email,
  rr.requested_by,
  requester.full_name as requester_name,
  rr.request_source,
  rr.status,
  rr.requested_at,
  rr.cancelled_at,
  rr.accepted_at,
  rr.accepted_by,
  acceptor.full_name as acceptor_name,
  coalesce(acceptor.personal_email, acceptor.email) as acceptor_email,
  rr.return_condition,
  li.book_id,
  li.copy_id,
  li.title_snapshot as book_title,
  li.author_snapshot as author,
  b.isbn,
  bc.accession_number,
  bc.shelf_location,
  li.borrowed_at,
  li.due_at,
  li.returned_at,
  li.status as loan_item_status,
  fine.overdue_periods,
  li.fine_rate_pesewas,
  amount.fine_amount_pesewas,
  outstanding.fine_outstanding_pesewas,
  li.fine_paid_pesewas,
  case
    when amount.fine_amount_pesewas = 0 then 'not_due'
    when outstanding.fine_outstanding_pesewas = 0 then 'paid'
    when li.fine_paid_pesewas > 0 then 'partially_paid'
    else 'unpaid'
  end as fine_payment_status,
  latest_payment.payment_reference as fine_payment_reference,
  latest_payment.paid_at as fine_paid_at,
  latest_payment.payment_method as fine_payment_method,
  latest_payment.amount_pesewas as last_fine_payment_amount_pesewas,
  (fine.overdue_periods >= 2 and outstanding.fine_outstanding_pesewas > 0) as is_critical_fine
from public.return_requests rr
join public.loan_items li on li.id = rr.loan_item_id and li.loan_id = rr.loan_id
join public.books b on b.id = li.book_id
join public.book_copies bc on bc.id = li.copy_id
join public.profiles student on student.id = rr.student_id
join public.profiles requester on requester.id = rr.requested_by
left join public.profiles acceptor on acceptor.id = rr.accepted_by
cross join lateral (
  select case
    when rr.status = 'accepted' then coalesce(rr.overdue_periods_at_acceptance, 0)
    when li.status in ('active', 'lost') and now() > li.due_at
      then floor(extract(epoch from (now() - li.due_at)) / 86400)::integer
    else 0
  end as overdue_periods
) fine
cross join lateral (
  select case
    when rr.status = 'accepted' then coalesce(rr.fine_amount_pesewas, 0)
    else fine.overdue_periods * li.fine_rate_pesewas
  end as fine_amount_pesewas
) amount
cross join lateral (
  select greatest(amount.fine_amount_pesewas - li.fine_paid_pesewas, 0) as fine_outstanding_pesewas
) outstanding
left join lateral (
  select fp.payment_reference, fp.paid_at, fp.payment_method, fp.amount_pesewas
  from public.fine_payments fp
  where fp.loan_item_id = li.id and fp.status = 'simulated_paid'
  order by fp.paid_at desc, fp.id desc
  limit 1
) latest_payment on true
where public.is_staff();

create or replace view public.admin_return_requests
with (security_barrier = true)
as
select
  operations.*,
  coalesce(student.personal_email, student.email) as student_personal_email,
  spp.phone as student_phone,
  spp.department,
  spp.programme,
  spp.residence_type,
  spp.residence_location,
  spp.verification_status
from public.staff_return_requests operations
join public.profiles student on student.id = operations.student_id
left join public.student_private_profiles spp on spp.profile_id = operations.student_id
where public.is_admin();

-- Operational and settled-payment ledger for active/lost loans and returned
-- books whose fine reached at least two completed overdue periods. Keeping the
-- settled rows lets staff verify the exact payment receipt after the balance
-- closes; application counters still count only rows with an outstanding
-- balance. Librarians receive contact, academic, and residence details needed
-- for follow-up, but never guardian evidence, ID-card paths, face-scan status,
-- or other identity-verification evidence.
create or replace view public.staff_critical_fines
with (security_barrier = true)
as
select
  li.id as loan_item_id,
  li.loan_id,
  l.borrower_id as student_id,
  student.full_name as student_name,
  student.index_number,
  student.student_email,
  coalesce(student.personal_email, student.email) as student_personal_email,
  student.role as student_role,
  student.status as student_status,
  student.created_at as student_registered_at,
  student.updated_at as student_profile_updated_at,
  spp.phone as student_phone,
  spp.department,
  spp.programme,
  spp.start_year,
  spp.completion_year,
  spp.gender,
  spp.residence_type,
  spp.residence_location,
  spp.verification_status,
  li.book_id,
  coalesce(li.title_snapshot, b.title) as book_title,
  li.author_snapshot as author,
  b.isbn,
  li.copy_id,
  bc.accession_number,
  bc.shelf_location,
  li.status as loan_item_status,
  li.borrowed_at,
  li.due_at,
  li.returned_at,
  fine.overdue_periods,
  li.fine_rate_pesewas,
  amount.fine_amount_pesewas,
  li.fine_paid_pesewas,
  outstanding.fine_outstanding_pesewas,
  case
    when outstanding.fine_outstanding_pesewas = 0 then 'paid'
    when li.fine_paid_pesewas > 0 then 'partially_paid'
    else 'unpaid'
  end as fine_payment_status,
  li.due_at + interval '2 days' as critical_since,
  greatest(0, floor(extract(epoch from (now() - (li.due_at + interval '2 days'))) / 86400)::integer) as completed_days_critical,
  latest_payment.payment_reference as fine_payment_reference,
  latest_payment.paid_at as fine_paid_at,
  latest_payment.payment_method as fine_payment_method,
  latest_payment.amount_pesewas as last_fine_payment_amount_pesewas,
  (select count(*)::integer from public.fine_payments fp_count where fp_count.loan_item_id = li.id) as fine_payment_count,
  rr.id as return_request_id,
  rr.status as return_request_status,
  rr.requested_at as return_requested_at,
  rr.accepted_at as return_accepted_at
from public.loan_items li
join public.loans l on l.id = li.loan_id
join public.profiles student on student.id = l.borrower_id
left join public.student_private_profiles spp on spp.profile_id = student.id
left join public.books b on b.id = li.book_id
left join public.book_copies bc on bc.id = li.copy_id
cross join lateral (
  select case
    when li.status = 'returned' and li.overdue_periods_at_return is not null
      then li.overdue_periods_at_return
    when li.status = 'returned' and li.returned_at > li.due_at
      then floor(extract(epoch from (li.returned_at - li.due_at)) / 86400)::integer
    when li.status in ('active', 'lost') and now() > li.due_at
      then floor(extract(epoch from (now() - li.due_at)) / 86400)::integer
    else 0
  end as overdue_periods
) fine
cross join lateral (
  select case
    when li.status = 'returned' and li.fine_amount_pesewas is not null
      then li.fine_amount_pesewas
    else fine.overdue_periods * li.fine_rate_pesewas
  end as fine_amount_pesewas
) amount
cross join lateral (
  select greatest(amount.fine_amount_pesewas - li.fine_paid_pesewas, 0) as fine_outstanding_pesewas
) outstanding
left join lateral (
  select fp.payment_reference, fp.paid_at, fp.payment_method, fp.amount_pesewas
  from public.fine_payments fp
  where fp.loan_item_id = li.id and fp.status = 'simulated_paid'
  order by fp.paid_at desc, fp.id desc
  limit 1
) latest_payment on true
left join lateral (
  select candidate.id, candidate.status, candidate.requested_at, candidate.accepted_at
  from public.return_requests candidate
  where candidate.loan_item_id = li.id
  order by candidate.requested_at desc, candidate.id desc
  limit 1
) rr on true
where public.is_staff()
  and li.status in ('active', 'lost', 'returned')
  and fine.overdue_periods >= 2;

-- Admins receive the same critical recovery queue plus the private intake and
-- identity-verification evidence they are authorized to review. A private
-- face-presence image path may be exposed to admins for short-lived signed-link
-- generation; no biometric template or automated match result is stored.
create or replace view public.admin_critical_fines
with (security_barrier = true)
as
select
  operations.*,
  spp.guardian_full_name,
  spp.guardian_phone,
  spp.guardian_relationship,
  spp.student_id_object_path,
  spp.student_id_status,
  spp.student_id_uploaded_at,
  spp.student_record_check_status,
  spp.facial_scan_status,
  spp.face_snapshot_object_path,
  spp.face_snapshot_uploaded_at,
  spp.identity_verification_mode,
  spp.identity_verification_completed_at,
  spp.identity_consent_at,
  spp.identity_consent_scope,
  spp.privacy_notice_version,
  spp.verification_notes,
  spp.verified_at,
  spp.verified_by,
  spp.created_at as private_profile_created_at,
  spp.updated_at as private_profile_updated_at
from public.staff_critical_fines operations
left join public.student_private_profiles spp on spp.profile_id = operations.student_id
where public.is_admin();

-- These narrowly filtered owner/admin views intentionally execute with the
-- view owner's read rights. Their security-barrier predicates are mandatory;
-- callers do not receive direct access to private profile columns.
create or replace view public.my_student_profile
with (security_barrier = true)
as
select
  p.id,
  p.full_name,
  p.index_number,
  coalesce(p.personal_email, p.email) as personal_email,
  p.student_email,
  spp.phone,
  spp.department,
  spp.programme,
  spp.start_year,
  spp.completion_year,
  spp.gender,
  spp.residence_type,
  spp.residence_location,
  spp.guardian_full_name,
  spp.guardian_phone,
  spp.guardian_relationship,
  spp.student_id_status,
  spp.student_id_uploaded_at,
  spp.student_record_check_status,
  spp.facial_scan_status,
  (spp.face_snapshot_object_path is not null) as face_snapshot_uploaded,
  spp.identity_verification_mode,
  spp.identity_verification_completed_at,
  spp.identity_consent_at,
  spp.identity_consent_scope,
  spp.privacy_notice_version,
  spp.verification_status,
  spp.verification_notes,
  spp.verified_at,
  (spp.verification_status = 'verified') as is_verified,
  (spp.student_id_object_path is not null and spp.student_id_status in ('uploaded_private', 'verified')) as student_id_uploaded,
  p.status,
  p.created_at,
  greatest(p.updated_at, spp.updated_at) as updated_at
from public.profiles p
join public.student_private_profiles spp on spp.profile_id = p.id
where p.id = auth.uid();

create or replace view public.my_borrow_requests
with (security_barrier = true)
as
select
  br.id,
  br.status,
  br.fulfilment_method,
  br.loan_days,
  br.delivery_fee_pesewas,
  br.delivery_location,
  br.delivery_floor,
  br.delivery_room,
  br.payment_method,
  br.payment_status,
  br.payment_reference,
  br.paid_at,
  br.paid_at as payment_paid_at,
  br.requested_at,
  br.reviewed_at,
  br.reviewed_by as reviewer_id,
  reviewer.full_name as reviewer_name,
  br.dispatched_at,
  br.dispatched_by as dispatcher_id,
  dispatcher.full_name as dispatcher_name,
  br.student_received_at,
  br.student_received_at as delivery_received_at,
  br.receipt_confirmed_by,
  br.recalled_at,
  br.recalled_by as recaller_id,
  recaller.full_name as recaller_name,
  br.recall_reason,
  br.recall_returned_at,
  br.recall_returned_by as recall_returner_id,
  recall_returner.full_name as recall_returner_name,
  br.rejection_reason,
  br.cancelled_at,
  br.loan_id,
  coalesce(item_rows.items, '[]'::jsonb) as items
from public.borrow_requests br
left join public.profiles reviewer on reviewer.id = br.reviewed_by
left join public.profiles dispatcher on dispatcher.id = br.dispatched_by
left join public.profiles recaller on recaller.id = br.recalled_by
left join public.profiles recall_returner on recall_returner.id = br.recall_returned_by
left join lateral (
  select jsonb_agg(
    jsonb_build_object(
      'request_item_id', bri.id,
      'book_id', bri.book_id,
      'title', bri.title_snapshot,
      'author', bri.author_snapshot,
      'category', bri.category_snapshot,
      'slug', bri.slug_snapshot,
      'isbn', bri.isbn_snapshot,
      'cover_url', bri.cover_url_snapshot,
      'allocated_copy_id', bri.allocated_copy_id,
      'accession_number', bc.accession_number,
      'loan_item_id', bri.loan_item_id,
      'due_at', li.due_at,
      'item_status', coalesce(li.status::text, br.status::text)
    ) order by bri.created_at, bri.id
  ) as items
  from public.borrow_request_items bri
  left join public.book_copies bc on bc.id = bri.allocated_copy_id
  left join public.loan_items li on li.id = bri.loan_item_id
  where bri.request_id = br.id
) item_rows on true
where br.student_id = auth.uid();

create or replace view public.staff_borrow_requests
with (security_barrier = true)
as
select
  br.id,
  br.status,
  br.fulfilment_method,
  br.loan_days,
  br.delivery_fee_pesewas,
  br.delivery_location,
  br.delivery_floor,
  br.delivery_room,
  br.payment_method,
  br.payment_status,
  br.payment_reference,
  br.paid_at,
  br.paid_at as payment_paid_at,
  br.requested_at,
  br.reviewed_at,
  br.dispatched_at,
  br.student_received_at,
  br.student_received_at as delivery_received_at,
  br.receipt_confirmed_by,
  br.recalled_at,
  br.recalled_by,
  br.recalled_by as recaller_id,
  recaller.full_name as recaller_name,
  coalesce(recaller.personal_email, recaller.email) as recaller_email,
  br.recall_reason,
  br.recall_returned_at,
  br.recall_returned_by,
  br.recall_returned_by as recall_returner_id,
  recall_returner.full_name as recall_returner_name,
  coalesce(recall_returner.personal_email, recall_returner.email) as recall_returner_email,
  br.rejection_reason,
  br.cancelled_at,
  br.loan_id,
  br.student_id,
  br.student_name_snapshot as student_name,
  br.index_number_snapshot as index_number,
  br.student_email_snapshot as student_email,
  br.phone_snapshot as phone,
  br.residence_type_snapshot as residence_type,
  br.residence_location_snapshot as residence_location,
  br.reviewed_by,
  br.reviewed_by as reviewer_id,
  reviewer.full_name as reviewer_name,
  coalesce(reviewer.personal_email, reviewer.email) as reviewer_email,
  br.dispatched_by,
  br.dispatched_by as dispatcher_id,
  dispatcher.full_name as dispatcher_name,
  coalesce(dispatcher.personal_email, dispatcher.email) as dispatcher_email,
  coalesce(item_rows.items, '[]'::jsonb) as items
from public.borrow_requests br
left join public.profiles reviewer on reviewer.id = br.reviewed_by
left join public.profiles dispatcher on dispatcher.id = br.dispatched_by
left join public.profiles recaller on recaller.id = br.recalled_by
left join public.profiles recall_returner on recall_returner.id = br.recall_returned_by
left join lateral (
  select jsonb_agg(
    jsonb_build_object(
      'request_item_id', bri.id,
      'book_id', bri.book_id,
      'title', bri.title_snapshot,
      'author', bri.author_snapshot,
      'category', bri.category_snapshot,
      'slug', bri.slug_snapshot,
      'isbn', bri.isbn_snapshot,
      'cover_url', bri.cover_url_snapshot,
      'total_copies', coalesce(inv.total_copies, 0),
      'available_copies', coalesce(inv.available_copies, 0),
      'shelf_location', inv.shelf_location,
      'allocated_copy_id', bri.allocated_copy_id,
      'accession_number', bc.accession_number,
      'loan_item_id', bri.loan_item_id,
      'due_at', li.due_at,
      'item_status', coalesce(li.status::text, br.status::text)
    ) order by bri.created_at, bri.id
  ) as items
  from public.borrow_request_items bri
  left join public.inventory_summary inv on inv.book_id = bri.book_id
  left join public.book_copies bc on bc.id = bri.allocated_copy_id
  left join public.loan_items li on li.id = bri.loan_item_id
  where bri.request_id = br.id
) item_rows on true
where public.is_staff();

create or replace view public.librarian_borrow_requests
with (security_barrier = true)
as
select * from public.staff_borrow_requests;

create or replace view public.admin_borrow_requests
with (security_barrier = true)
as
select
  s.*,
  coalesce(p.personal_email, p.email) as personal_email,
  spp.department,
  spp.programme,
  spp.verification_status
from public.staff_borrow_requests s
join public.profiles p on p.id = s.student_id
left join public.student_private_profiles spp on spp.profile_id = s.student_id
where public.is_admin();

create or replace view public.published_book_chapters
with (security_invoker = true)
as
select
  de.book_id,
  de.id as edition_id,
  bc.id,
  bc.title,
  bc.content_text,
  bc.word_count,
  bc.order_index
from public.digital_editions de
join public.book_chapters bc on bc.edition_id = de.id
join public.books b on b.id = de.book_id
where de.status = 'published' and bc.is_published = true and b.is_published and b.archived_at is null;

create or replace view public.admin_student_profiles
with (security_barrier = true)
as
select
  p.id,
  p.full_name,
  p.index_number,
  coalesce(p.personal_email, p.email) as personal_email,
  p.student_email,
  spp.phone,
  spp.department,
  spp.programme,
  spp.start_year,
  spp.completion_year,
  spp.gender,
  spp.residence_type,
  spp.residence_location,
  spp.guardian_full_name,
  spp.guardian_phone,
  spp.guardian_relationship,
  spp.student_id_object_path,
  spp.student_id_status,
  spp.student_id_uploaded_at,
  spp.student_record_check_status,
  spp.facial_scan_status,
  spp.face_snapshot_object_path,
  spp.face_snapshot_uploaded_at,
  spp.identity_verification_mode,
  spp.identity_verification_completed_at,
  spp.identity_consent_at,
  spp.identity_consent_scope,
  spp.privacy_notice_version,
  spp.verification_status,
  spp.verification_notes,
  spp.verified_at,
  spp.verified_by,
  verifier.full_name as verifier_name,
  p.status,
  (
    select count(*)::integer
    from public.loans l
    join public.loan_items li on li.loan_id = l.id
    where l.borrower_id = p.id and li.status = 'active'
  ) as active_loans,
  p.created_at,
  greatest(p.updated_at, spp.updated_at) as updated_at
from public.profiles p
join public.student_private_profiles spp on spp.profile_id = p.id
left join public.profiles verifier on verifier.id = spp.verified_by
where p.role = 'student' and public.is_admin();

create or replace view public.admin_librarians
with (security_barrier = true)
as
select
  p.id,
  p.full_name,
  p.index_number,
  coalesce(p.personal_email, p.email) as email,
  p.student_email,
  p.status,
  p.created_at,
  p.updated_at
from public.profiles p
where p.role = 'librarian' and public.is_admin();

create or replace view public.admin_librarian_performance
with (security_barrier = true)
as
with metrics as (
  select
    p.id as librarian_id,
    p.full_name as librarian_name,
    coalesce(p.personal_email, p.email) as librarian_email,
    p.status,
    count(distinct br.id) filter (where br.reviewed_by = p.id and br.status = 'approved')::integer as total_approvals,
    count(distinct br.id) filter (
      where br.dispatched_by = p.id and br.fulfilment_method = 'delivery' and br.dispatched_at is not null
    )::integer as delivery_dispatches,
    count(distinct br.id) filter (
      where br.dispatched_by = p.id
        and br.fulfilment_method = 'delivery'
        and br.dispatched_at is not null
        and br.student_received_at is not null
        and br.receipt_confirmed_by = br.student_id
    )::integer as completed_dual_confirmed_deliveries,
    (
      select count(*)::integer
      from public.return_requests rr
      where rr.accepted_by = p.id and rr.status = 'accepted'
    ) as accepted_returns,
    max(br.reviewed_at) filter (where br.reviewed_by = p.id) as last_approval_at,
    max(br.dispatched_at) filter (where br.dispatched_by = p.id) as last_dispatch_at,
    (
      select max(rr.accepted_at)
      from public.return_requests rr
      where rr.accepted_by = p.id and rr.status = 'accepted'
    ) as last_return_acceptance_at
  from public.profiles p
  left join public.borrow_requests br on br.reviewed_by = p.id or br.dispatched_by = p.id
  where p.role = 'librarian'
  group by p.id, p.full_name, p.personal_email, p.email, p.status
)
select
  dense_rank() over (
    order by m.completed_dual_confirmed_deliveries desc, m.total_approvals desc, m.accepted_returns desc, m.delivery_dispatches desc, m.librarian_name
  )::integer as rank,
  m.librarian_id,
  m.librarian_name as full_name,
  m.librarian_email as email,
  m.total_approvals as approved_requests,
  m.delivery_dispatches as dispatched_deliveries,
  m.completed_dual_confirmed_deliveries as student_confirmed_deliveries,
  m.accepted_returns,
  case
    when m.delivery_dispatches = 0 then 0::numeric
    else round((m.completed_dual_confirmed_deliveries::numeric / m.delivery_dispatches::numeric) * 100, 1)
  end as safe_confirmation_rate,
  greatest(m.last_approval_at, m.last_dispatch_at, m.last_return_acceptance_at) as last_activity_at,
  m.status,
  m.last_approval_at,
  m.last_dispatch_at,
  m.last_return_acceptance_at
from metrics m
where public.is_admin();

create or replace view public.admin_students
with (security_barrier = true)
as
select
  asp.id,
  asp.full_name,
  asp.index_number,
  asp.personal_email as email,
  asp.student_email,
  asp.programme,
  asp.status,
  asp.created_at,
  asp.active_loans
from public.admin_student_profiles asp;

create or replace view public.admin_circulation
with (security_barrier = true)
as
select
  li.id as loan_item_id,
  l.id as loan_id,
  p.id as student_id,
  p.full_name as student_name,
  p.index_number,
  p.student_email,
  b.id as book_id,
  b.title as book_title,
  b.isbn,
  bc.accession_number,
  li.borrowed_at,
  li.due_at,
  li.returned_at,
  li.status,
  fine.overdue_periods,
  li.fine_rate_pesewas,
  amount.fine_amount_pesewas,
  outstanding.fine_outstanding_pesewas,
  li.fine_paid_pesewas,
  case
    when amount.fine_amount_pesewas = 0 then 'not_due'
    when outstanding.fine_outstanding_pesewas = 0 then 'paid'
    when li.fine_paid_pesewas > 0 then 'partially_paid'
    else 'unpaid'
  end as fine_payment_status,
  latest_payment.payment_reference as fine_payment_reference,
  latest_payment.paid_at as fine_paid_at,
  latest_payment.payment_method as fine_payment_method,
  latest_payment.amount_pesewas as last_fine_payment_amount_pesewas,
  (select count(*)::integer from public.fine_payments fp_count where fp_count.loan_item_id = li.id) as fine_payment_count,
  (fine.overdue_periods >= 2 and outstanding.fine_outstanding_pesewas > 0) as is_critical_fine,
  rr.id as return_request_id,
  rr.status as return_request_status,
  rr.requested_at as return_requested_at,
  rr.accepted_at as return_accepted_at,
  rr.accepted_by as return_accepted_by,
  acceptor.full_name as return_acceptor_name,
  coalesce(acceptor.personal_email, acceptor.email) as return_acceptor_email,
  li.return_condition,
  case
    when li.status = 'returned' then 'returned'
    when li.due_at < now() then 'overdue'
    when li.due_at <= now() + make_interval(hours => s.reminder_hours) then 'due-soon'
    else 'active'
  end as display_status
from public.loan_items li
join public.loans l on l.id = li.loan_id
join public.profiles p on p.id = l.borrower_id
join public.books b on b.id = li.book_id
join public.book_copies bc on bc.id = li.copy_id
cross join public.library_settings s
cross join lateral (
  select case
    when li.status = 'returned' and li.overdue_periods_at_return is not null then li.overdue_periods_at_return
    when li.status in ('active', 'lost') and now() > li.due_at
      then floor(extract(epoch from (now() - li.due_at)) / 86400)::integer
    when li.status = 'returned' and li.returned_at > li.due_at
      then floor(extract(epoch from (li.returned_at - li.due_at)) / 86400)::integer
    else 0
  end as overdue_periods
) fine
cross join lateral (
  select case
    when li.status = 'returned' and li.fine_amount_pesewas is not null then li.fine_amount_pesewas
    else fine.overdue_periods * li.fine_rate_pesewas
  end as fine_amount_pesewas
) amount
cross join lateral (
  select greatest(amount.fine_amount_pesewas - li.fine_paid_pesewas, 0) as fine_outstanding_pesewas
) outstanding
left join lateral (
  select fp.payment_reference, fp.paid_at, fp.payment_method, fp.amount_pesewas
  from public.fine_payments fp
  where fp.loan_item_id = li.id and fp.status = 'simulated_paid'
  order by fp.paid_at desc, fp.id desc
  limit 1
) latest_payment on true
left join lateral (
  select candidate.*
  from public.return_requests candidate
  where candidate.loan_item_id = li.id
  order by candidate.requested_at desc, candidate.id desc
  limit 1
) rr on true
left join public.profiles acceptor on acceptor.id = rr.accepted_by
where public.is_admin();

create or replace view public.admin_dashboard_stats
with (security_barrier = true)
as
select
  (select count(*) from public.books where is_published and archived_at is null)::integer as total_titles,
  (select count(*) from public.book_copies where status <> 'retired')::integer as total_copies,
  (select count(*) from public.book_copies where status = 'available')::integer as available_copies,
  (select count(*) from public.loan_items where status = 'active')::integer as active_loans,
  (select count(*) from public.loan_items where status = 'active' and due_at < now())::integer as overdue_loans,
  (select count(*) from public.profiles where role = 'student')::integer as total_students,
  (select count(*) from public.digital_editions de join public.books b on b.id = de.book_id where de.status = 'published' and b.is_published and b.archived_at is null)::integer as digital_titles,
  (select count(*) from public.borrow_requests where status = 'pending')::integer as pending_requests,
  (select count(*) from public.borrow_requests where status = 'pending' and fulfilment_method = 'delivery')::integer as pending_delivery_requests,
  (select count(*) from public.borrow_requests where status = 'approved' and fulfilment_method = 'delivery' and dispatched_at is null)::integer as approved_deliveries_awaiting_dispatch,
  (select count(*) from public.borrow_requests where status = 'approved' and fulfilment_method = 'delivery' and dispatched_at is not null and student_received_at is null)::integer as dispatched_deliveries_awaiting_receipt,
  (select coalesce(sum(delivery_fee_pesewas), 0) from public.borrow_requests where fulfilment_method = 'delivery' and payment_status = 'simulated_paid')::integer as simulated_delivery_revenue_pesewas,
  (select count(*) from public.return_requests where status = 'pending')::integer as pending_return_requests,
  (
    select coalesce(sum(
      greatest(
        case
          when li.status in ('active', 'lost') and now() > li.due_at
            then floor(extract(epoch from (now() - li.due_at)) / 86400)::integer * li.fine_rate_pesewas
          when li.status = 'returned' then coalesce(li.fine_amount_pesewas, 0)
          else 0
        end - li.fine_paid_pesewas,
        0
      )
    ), 0)::bigint
    from public.loan_items li
  ) as outstanding_fines_pesewas,
  (
    select count(*)::integer
    from public.staff_critical_fines
    where fine_outstanding_pesewas > 0
  ) as critical_fines,
  (
    select coalesce(sum(fp.amount_pesewas), 0)::bigint
    from public.fine_payments fp
    where fp.status = 'simulated_paid'
  ) as simulated_fine_payments_pesewas,
  (
    select coalesce(sum(li.fine_amount_pesewas), 0)::bigint
    from public.loan_items li
    where li.status = 'returned'
  ) as finalized_fines_pesewas,
  (
    select count(*)::integer
    from public.return_requests rr
    where rr.status = 'accepted' and rr.accepted_at >= current_date
  ) as returns_accepted_today
where public.is_admin();

create or replace view public.admin_daily_circulation
with (security_barrier = true)
as
select
  d.activity_date,
  to_char(d.activity_date, 'Dy') as day_label,
  (select count(*)::integer from public.loan_items li where li.borrowed_at >= d.activity_date and li.borrowed_at < d.activity_date + interval '1 day') as borrowed_count,
  (select count(*)::integer from public.loan_items li where li.returned_at >= d.activity_date and li.returned_at < d.activity_date + interval '1 day') as returned_count
from generate_series(current_date - 6, current_date, interval '1 day') as d(activity_date)
where public.is_admin()
order by d.activity_date;

-- Narrow anonymous catalogue boundary. Anonymous callers receive only these
-- published-book fields and never receive direct access to the backing views,
-- inventory rows, profiles, loans, or digital chapter content.
create or replace function public.get_public_catalog()
returns table (
  id uuid,
  slug text,
  title text,
  isbn text,
  description text,
  format text,
  pages integer,
  published_year integer,
  language text,
  cover_url text,
  featured boolean,
  new_arrival boolean,
  author text,
  category text,
  total_copies integer,
  available_copies integer,
  borrow_count integer,
  shelf_location text,
  read_time text,
  online_available boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    cb.id,
    cb.slug,
    cb.title,
    cb.isbn,
    cb.description,
    cb.format::text,
    cb.pages,
    cb.published_year,
    cb.language,
    cb.cover_url,
    cb.featured,
    cb.new_arrival,
    cb.author,
    cb.category,
    cb.total_copies,
    cb.available_copies,
    cb.borrow_count,
    cb.shelf_location,
    cb.read_time,
    cb.online_available
  from public.catalog_books cb
  order by cb.featured desc, cb.borrow_count desc, cb.title;
$$;

create or replace function public.get_public_categories()
returns table (
  name text,
  slug text,
  published_title_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.name,
    c.slug,
    count(b.id)::integer as published_title_count
  from public.categories c
  left join public.books b
    on b.category_id = c.id and b.is_published and b.archived_at is null
  where c.is_active
  group by c.id, c.name, c.slug
  order by c.name;
$$;

-- Anonymous registration surfaces receive only this one fail-closed boolean;
-- the rest of library_settings remains unavailable to anonymous callers.
create or replace function public.get_public_signup_status()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select ls.signup_locked
    from public.library_settings ls
    where ls.id = true
  ), true);
$$;

-- Exactly 19 obviously fictional records for repeatable presentations. Run
-- scripts/seed-presentation-accounts.mjs after this SQL to provision Auth.
-- PRESENTATION LOGINS (fictional; Admin API seeder uses these exact values):
-- 01 | presentation.student01@example.com | KNUSTDemo#012026!
-- 02 | presentation.student02@example.com | KNUSTDemo#022026!
-- 03 | presentation.student03@example.com | KNUSTDemo#032026!
-- 04 | presentation.student04@example.com | KNUSTDemo#042026!
-- 05 | presentation.student05@example.com | KNUSTDemo#052026!
-- 06 | presentation.student06@example.com | KNUSTDemo#062026!
-- 07 | presentation.student07@example.com | KNUSTDemo#072026!
-- 08 | presentation.student08@example.com | KNUSTDemo#082026!
-- 09 | presentation.student09@example.com | KNUSTDemo#092026!
-- 10 | presentation.student10@example.com | KNUSTDemo#102026!
-- 11 | presentation.student11@example.com | KNUSTDemo#112026!
-- 12 | presentation.student12@example.com | KNUSTDemo#122026!
-- 13 | presentation.student13@example.com | KNUSTDemo#132026!
-- 14 | presentation.student14@example.com | KNUSTDemo#142026!
-- 15 | presentation.student15@example.com | KNUSTDemo#152026!
-- 16 | presentation.student16@example.com | KNUSTDemo#162026!
-- 17 | presentation.student17@example.com | KNUSTDemo#172026!
-- 18 | presentation.student18@example.com | KNUSTDemo#182026!
-- 19 | presentation.student19@example.com | KNUSTDemo#192026!
insert into public.presentation_student_registry(
  demo_number, full_name, index_number, personal_email, student_email,
  department, programme, start_year, completion_year, gender,
  residence_type, residence_location, phone, guardian_full_name,
  guardian_phone, guardian_relationship
) values
  (1,  'Akosua Demo Mensah',  'PS/CSC/23/0001', 'presentation.student01@example.com', 'presentation01@st.knust.edu.gh', 'Computer Science',        'BSc Computer Science',            2023, 2027, 'female',            'on-campus',  'Unity Hall',              '+233500000001', 'Demo Guardian 01', '+233590000001', 'Parent'),
  (2,  'Kwame Demo Asare',    'PS/ENG/23/0002', 'presentation.student02@example.com', 'presentation02@st.knust.edu.gh', 'Mechanical Engineering',  'BSc Mechanical Engineering',      2023, 2027, 'male',              'on-campus',  'Republic Hall',           '+233500000002', 'Demo Guardian 02', '+233590000002', 'Parent'),
  (3,  'Abena Demo Ofori',    'PS/NUR/22/0003', 'presentation.student03@example.com', 'presentation03@st.knust.edu.gh', 'Nursing',                 'BSc Nursing',                     2022, 2026, 'female',            'off-campus', 'Ayeduase',                '+233500000003', 'Demo Guardian 03', '+233590000003', 'Guardian'),
  (4,  'Kojo Demo Bediako',   'PS/ARC/23/0004', 'presentation.student04@example.com', 'presentation04@st.knust.edu.gh', 'Architecture',            'BSc Architecture',                2023, 2027, 'male',              'on-campus',  'University Hall',        '+233500000004', 'Demo Guardian 04', '+233590000004', 'Parent'),
  (5,  'Adwoa Demo Nyarko',   'PS/BUS/24/0005', 'presentation.student05@example.com', 'presentation05@st.knust.edu.gh', 'Accounting and Finance',  'BSc Business Administration',     2024, 2028, 'female',            'off-campus', 'Kotei',                   '+233500000005', 'Demo Guardian 05', '+233590000005', 'Guardian'),
  (6,  'Yaw Demo Frimpong',   'PS/CHE/22/0006', 'presentation.student06@example.com', 'presentation06@st.knust.edu.gh', 'Chemistry',                'BSc Chemistry',                   2022, 2026, 'male',              'on-campus',  'Independence Hall',      '+233500000006', 'Demo Guardian 06', '+233590000006', 'Parent'),
  (7,  'Efua Demo Boateng',   'PS/PHM/23/0007', 'presentation.student07@example.com', 'presentation07@st.knust.edu.gh', 'Pharmacy Practice',       'Doctor of Pharmacy',              2023, 2029, 'female',            'on-campus',  'Africa Hall',            '+233500000007', 'Demo Guardian 07', '+233590000007', 'Parent'),
  (8,  'Kofi Demo Antwi',     'PS/CIV/21/0008', 'presentation.student08@example.com', 'presentation08@st.knust.edu.gh', 'Civil Engineering',       'BSc Civil Engineering',           2021, 2025, 'male',              'off-campus', 'Bomso',                   '+233500000008', 'Demo Guardian 08', '+233590000008', 'Guardian'),
  (9,  'Nana Demo Owusu',     'PS/ECO/24/0009', 'presentation.student09@example.com', 'presentation09@st.knust.edu.gh', 'Economics',                'BA Economics',                    2024, 2028, 'non-binary',        'on-campus',  'Queen Elizabeth II Hall', '+233500000009', 'Demo Guardian 09', '+233590000009', 'Parent'),
  (10, 'Ama Demo Addo',       'PS/LAW/22/0010', 'presentation.student10@example.com', 'presentation10@st.knust.edu.gh', 'Law',                      'LLB',                             2022, 2026, 'female',            'off-campus', 'Kentinkrono',             '+233500000010', 'Demo Guardian 10', '+233590000010', 'Guardian'),
  (11, 'Nii Demo Quaye',      'PS/MAT/23/0011', 'presentation.student11@example.com', 'presentation11@st.knust.edu.gh', 'Mathematics',              'BSc Mathematics',                 2023, 2027, 'male',              'on-campus',  'Unity Hall',              '+233500000011', 'Demo Guardian 11', '+233590000011', 'Parent'),
  (12, 'Esi Demo Agyeman',    'PS/EDU/24/0012', 'presentation.student12@example.com', 'presentation12@st.knust.edu.gh', 'Educational Innovations', 'BEd Educational Studies',         2024, 2028, 'female',            'off-campus', 'Oduom',                   '+233500000012', 'Demo Guardian 12', '+233590000012', 'Guardian'),
  (13, 'Kwaku Demo Opoku',    'PS/PHY/22/0013', 'presentation.student13@example.com', 'presentation13@st.knust.edu.gh', 'Physics',                  'BSc Physics',                     2022, 2026, 'male',              'on-campus',  'Republic Hall',           '+233500000013', 'Demo Guardian 13', '+233590000013', 'Parent'),
  (14, 'Araba Demo Essien',   'PS/AGR/23/0014', 'presentation.student14@example.com', 'presentation14@st.knust.edu.gh', 'Agricultural Economics',  'BSc Agricultural Economics',      2023, 2027, 'female',            'off-campus', 'Atonsu',                  '+233500000014', 'Demo Guardian 14', '+233590000014', 'Guardian'),
  (15, 'Fiifi Demo Acquah',   'PS/MED/21/0015', 'presentation.student15@example.com', 'presentation15@st.knust.edu.gh', 'Medicine',                 'MBChB',                           2021, 2027, 'male',              'on-campus',  'University Hall',        '+233500000015', 'Demo Guardian 15', '+233590000015', 'Parent'),
  (16, 'Yaa Demo Danso',      'PS/ART/24/0016', 'presentation.student16@example.com', 'presentation16@st.knust.edu.gh', 'Communication Design',    'BFA Communication Design',        2024, 2028, 'female',            'off-campus', 'Ayigya',                  '+233500000016', 'Demo Guardian 16', '+233590000016', 'Guardian'),
  (17, 'Selasi Demo Tetteh',  'PS/STA/23/0017', 'presentation.student17@example.com', 'presentation17@st.knust.edu.gh', 'Statistics',               'BSc Statistics',                  2023, 2027, 'prefer-not-to-say', 'on-campus',  'Independence Hall',      '+233500000017', 'Demo Guardian 17', '+233590000017', 'Parent'),
  (18, 'Mansa Demo Amoako',   'PS/BIO/22/0018', 'presentation.student18@example.com', 'presentation18@st.knust.edu.gh', 'Biological Sciences',     'BSc Biological Science',          2022, 2026, 'female',            'off-campus', 'Boadi',                   '+233500000018', 'Demo Guardian 18', '+233590000018', 'Guardian'),
  (19, 'Kobina Demo Sarpong', 'PS/GEO/24/0019', 'presentation.student19@example.com', 'presentation19@st.knust.edu.gh', 'Geomatic Engineering',    'BSc Geomatic Engineering',        2024, 2028, 'male',              'on-campus',  'Unity Hall',              '+233500000019', 'Demo Guardian 19', '+233590000019', 'Parent')
on conflict (demo_number) do update set
  full_name = excluded.full_name,
  index_number = excluded.index_number,
  personal_email = excluded.personal_email,
  student_email = excluded.student_email,
  department = excluded.department,
  programme = excluded.programme,
  start_year = excluded.start_year,
  completion_year = excluded.completion_year,
  gender = excluded.gender,
  residence_type = excluded.residence_type,
  residence_location = excluded.residence_location,
  phone = excluded.phone,
  guardian_full_name = excluded.guardian_full_name,
  guardian_phone = excluded.guardian_phone,
  guardian_relationship = excluded.guardian_relationship;

-- Exactly 19 fresh fictional institutional identities for demonstrating the
-- real student-registration gate. These are intentionally different from the
-- already-provisioned presentation login accounts above. Confirmation still
-- goes to the personal email entered on the signup form.
-- SIGNUP ALLOW-LIST (student email | matching student ID):
-- 01 | 21135353@st.knust.edu.gh | 21135353
-- 02 | 20144323@st.knust.edu.gh | 20144323
-- 03 | 22140003@st.knust.edu.gh | 22140003
-- 04 | 21230004@st.knust.edu.gh | 21230004
-- 05 | 20240005@st.knust.edu.gh | 20240005
-- 06 | 23150006@st.knust.edu.gh | 23150006
-- 07 | 21360007@st.knust.edu.gh | 21360007
-- 08 | 20350008@st.knust.edu.gh | 20350008
-- 09 | 22280009@st.knust.edu.gh | 22280009
-- 10 | 21420010@st.knust.edu.gh | 21420010
-- 11 | 20470011@st.knust.edu.gh | 20470011
-- 12 | 23240012@st.knust.edu.gh | 23240012
-- 13 | 21560013@st.knust.edu.gh | 21560013
-- 14 | 20530014@st.knust.edu.gh | 20530014
-- 15 | 22310015@st.knust.edu.gh | 22310015
-- 16 | 21640016@st.knust.edu.gh | 21640016
-- 17 | 20680017@st.knust.edu.gh | 20680017
-- 18 | 22450018@st.knust.edu.gh | 22450018
-- 19 | 21730019@st.knust.edu.gh | 21730019
insert into public.student_signup_allowlist(
  allow_number, student_email, index_number, is_active
) values
  (1,  '21135353@st.knust.edu.gh', '21135353', true),
  (2,  '20144323@st.knust.edu.gh', '20144323', true),
  (3,  '22140003@st.knust.edu.gh', '22140003', true),
  (4,  '21230004@st.knust.edu.gh', '21230004', true),
  (5,  '20240005@st.knust.edu.gh', '20240005', true),
  (6,  '23150006@st.knust.edu.gh', '23150006', true),
  (7,  '21360007@st.knust.edu.gh', '21360007', true),
  (8,  '20350008@st.knust.edu.gh', '20350008', true),
  (9,  '22280009@st.knust.edu.gh', '22280009', true),
  (10, '21420010@st.knust.edu.gh', '21420010', true),
  (11, '20470011@st.knust.edu.gh', '20470011', true),
  (12, '23240012@st.knust.edu.gh', '23240012', true),
  (13, '21560013@st.knust.edu.gh', '21560013', true),
  (14, '20530014@st.knust.edu.gh', '20530014', true),
  (15, '22310015@st.knust.edu.gh', '22310015', true),
  (16, '21640016@st.knust.edu.gh', '21640016', true),
  (17, '20680017@st.knust.edu.gh', '20680017', true),
  (18, '22450018@st.knust.edu.gh', '22450018', true),
  (19, '21730019@st.knust.edu.gh', '21730019', true)
on conflict (allow_number) do update set
  student_email = excluded.student_email,
  index_number = excluded.index_number,
  is_active = excluded.is_active
where public.student_signup_allowlist.claimed_by is null;

-- Link existing valid presentation students back to their presentation
-- registry records. Accounts outside this registry are preserved and may
-- still sign in, but no new unregistered student Auth user can be created.
-- A row is linked only when both institutional email and student ID agree.
update public.presentation_student_registry registry
set auth_user_id = p.id,
    provisioned_at = coalesce(registry.provisioned_at, p.created_at, now())
from public.profiles p
where registry.auth_user_id is null
  and p.role = 'student'
  and lower(trim(p.student_email)) = lower(trim(registry.student_email))
  and upper(regexp_replace(trim(p.index_number), '\s+', '', 'g')) =
      upper(regexp_replace(trim(registry.index_number), '\s+', '', 'g'));

alter table public.presentation_student_registry alter column phone set not null;
alter table public.presentation_student_registry alter column guardian_full_name set not null;
alter table public.presentation_student_registry alter column guardian_phone set not null;
alter table public.presentation_student_registry alter column guardian_relationship set not null;

-- Row-level security.
alter table public.profiles enable row level security;
alter table public.student_private_profiles enable row level security;
alter table public.presentation_student_registry enable row level security;
alter table public.student_signup_allowlist enable row level security;
alter table public.librarian_provisioning_intents enable row level security;
alter table public.categories enable row level security;
alter table public.authors enable row level security;
alter table public.books enable row level security;
alter table public.book_copies enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.digital_editions enable row level security;
alter table public.book_chapters enable row level security;
alter table public.borrow_baskets enable row level security;
alter table public.basket_items enable row level security;
alter table public.loans enable row level security;
alter table public.loan_items enable row level security;
alter table public.fine_payments enable row level security;
alter table public.return_requests enable row level security;
alter table public.borrow_requests enable row level security;
alter table public.borrow_request_items enable row level security;
alter table public.favorites enable row level security;
alter table public.reading_progress enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_events enable row level security;
alter table public.library_settings enable row level security;

drop policy if exists "profiles_read_own_or_staff" on public.profiles;
drop policy if exists "profiles_read_own_or_admin" on public.profiles;
create policy "profiles_read_own_or_admin" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists "student_private_read_own_or_admin" on public.student_private_profiles;
create policy "student_private_read_own_or_admin" on public.student_private_profiles for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());

drop policy if exists "presentation_registry_admin_read" on public.presentation_student_registry;
create policy "presentation_registry_admin_read" on public.presentation_student_registry for select to authenticated
  using (public.is_admin());

drop policy if exists "categories_read_active" on public.categories;
create policy "categories_read_active" on public.categories for select to authenticated
  using (is_active or public.is_staff());
drop policy if exists "categories_staff_insert" on public.categories;
create policy "categories_staff_insert" on public.categories for insert to authenticated
  with check (public.is_admin());
drop policy if exists "categories_staff_update" on public.categories;
create policy "categories_staff_update" on public.categories for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "categories_staff_delete" on public.categories;
create policy "categories_staff_delete" on public.categories for delete to authenticated
  using (public.is_admin());

drop policy if exists "authors_read" on public.authors;
create policy "authors_read" on public.authors for select to authenticated using (true);
drop policy if exists "authors_staff_insert" on public.authors;
create policy "authors_staff_insert" on public.authors for insert to authenticated with check (public.is_admin());
drop policy if exists "authors_staff_update" on public.authors;
create policy "authors_staff_update" on public.authors for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "authors_staff_delete" on public.authors;
create policy "authors_staff_delete" on public.authors for delete to authenticated using (public.is_admin());

drop policy if exists "books_read_published_or_staff" on public.books;
create policy "books_read_published_or_staff" on public.books for select to authenticated
  using ((is_published and archived_at is null and public.can_use_library()) or public.is_staff());
drop policy if exists "books_staff_insert" on public.books;
create policy "books_staff_insert" on public.books for insert to authenticated with check (public.is_admin());
drop policy if exists "books_staff_update" on public.books;
create policy "books_staff_update" on public.books for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "books_staff_delete" on public.books;
drop policy if exists "books_admin_delete" on public.books;

drop policy if exists "copies_read_authenticated" on public.book_copies;
create policy "copies_read_authenticated" on public.book_copies for select to authenticated
  using (public.can_use_library() or public.is_staff());
drop policy if exists "copies_staff_insert" on public.book_copies;
create policy "copies_staff_insert" on public.book_copies for insert to authenticated with check (public.is_admin());
drop policy if exists "copies_staff_update" on public.book_copies;
create policy "copies_staff_update" on public.book_copies for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "movements_staff_read" on public.inventory_movements;
create policy "movements_staff_read" on public.inventory_movements for select to authenticated using (public.is_staff());

drop policy if exists "editions_read_published_or_staff" on public.digital_editions;
create policy "editions_read_published_or_staff" on public.digital_editions for select to authenticated
  using ((
    status = 'published'
    and public.can_use_library()
    and exists (
      select 1 from public.books b
      where b.id = digital_editions.book_id and b.is_published and b.archived_at is null
    )
  ) or public.is_admin());
drop policy if exists "editions_staff_insert" on public.digital_editions;
create policy "editions_staff_insert" on public.digital_editions for insert to authenticated with check (public.is_admin());
drop policy if exists "editions_staff_update" on public.digital_editions;
create policy "editions_staff_update" on public.digital_editions for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "chapters_read_published_or_staff" on public.book_chapters;
create policy "chapters_read_published_or_staff" on public.book_chapters for select to authenticated
  using ((
    is_published
    and public.can_use_library()
    and exists (
      select 1
      from public.digital_editions de
      join public.books b on b.id = de.book_id
      where de.id = book_chapters.edition_id
        and de.status = 'published'
        and b.is_published
        and b.archived_at is null
    )
  ) or public.is_admin());
drop policy if exists "chapters_staff_insert" on public.book_chapters;
create policy "chapters_staff_insert" on public.book_chapters for insert to authenticated with check (public.is_admin());
drop policy if exists "chapters_staff_update" on public.book_chapters;
create policy "chapters_staff_update" on public.book_chapters for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "chapters_staff_delete" on public.book_chapters;
create policy "chapters_staff_delete" on public.book_chapters for delete to authenticated using (public.is_admin());

drop policy if exists "baskets_read_own_or_staff" on public.borrow_baskets;
create policy "baskets_read_own_or_staff" on public.borrow_baskets for select to authenticated
  using (user_id = auth.uid() or public.is_staff());
drop policy if exists "basket_items_read_own_or_staff" on public.basket_items;
create policy "basket_items_read_own_or_staff" on public.basket_items for select to authenticated
  using (exists (select 1 from public.borrow_baskets bb where bb.id = basket_id and (bb.user_id = auth.uid() or public.is_staff())));

drop policy if exists "loans_read_own_or_staff" on public.loans;
create policy "loans_read_own_or_staff" on public.loans for select to authenticated
  using (borrower_id = auth.uid() or public.is_staff());
drop policy if exists "loan_items_read_own_or_staff" on public.loan_items;
create policy "loan_items_read_own_or_staff" on public.loan_items for select to authenticated
  using (exists (select 1 from public.loans l where l.id = loan_id and (l.borrower_id = auth.uid() or public.is_staff())));

drop policy if exists "fine_payments_read_own_or_staff" on public.fine_payments;
create policy "fine_payments_read_own_or_staff" on public.fine_payments for select to authenticated
  using (student_id = auth.uid() or public.is_staff());

drop policy if exists "return_requests_read_own_or_staff" on public.return_requests;
create policy "return_requests_read_own_or_staff" on public.return_requests for select to authenticated
  using (student_id = auth.uid() or public.is_staff());

drop policy if exists "borrow_requests_read_own_or_staff" on public.borrow_requests;
create policy "borrow_requests_read_own_or_staff" on public.borrow_requests for select to authenticated
  using (student_id = auth.uid() or public.is_staff());
drop policy if exists "borrow_request_items_read_own_or_staff" on public.borrow_request_items;
create policy "borrow_request_items_read_own_or_staff" on public.borrow_request_items for select to authenticated
  using (exists (
    select 1 from public.borrow_requests br
    where br.id = request_id and (br.student_id = auth.uid() or public.is_staff())
  ));

drop policy if exists "favorites_own_select" on public.favorites;
create policy "favorites_own_select" on public.favorites for select to authenticated using (user_id = auth.uid());
drop policy if exists "favorites_own_insert" on public.favorites;
create policy "favorites_own_insert" on public.favorites for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "favorites_own_delete" on public.favorites;
create policy "favorites_own_delete" on public.favorites for delete to authenticated using (user_id = auth.uid());

drop policy if exists "progress_own_select" on public.reading_progress;
create policy "progress_own_select" on public.reading_progress for select to authenticated using (user_id = auth.uid());
drop policy if exists "progress_own_insert" on public.reading_progress;
create policy "progress_own_insert" on public.reading_progress for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "progress_own_update" on public.reading_progress;
create policy "progress_own_update" on public.reading_progress for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "notifications_read_own" on public.notifications;
create policy "notifications_read_own" on public.notifications for select to authenticated using (user_id = auth.uid());

drop policy if exists "audit_staff_read" on public.audit_events;
drop policy if exists "audit_admin_read" on public.audit_events;
create policy "audit_admin_read" on public.audit_events for select to authenticated using (public.is_admin());

drop policy if exists "settings_authenticated_read" on public.library_settings;
create policy "settings_authenticated_read" on public.library_settings for select to authenticated using (true);
drop policy if exists "settings_admin_update" on public.library_settings;
create policy "settings_admin_update" on public.library_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Table and view privileges. RLS remains the authorization boundary.
grant usage on schema public to anon, authenticated, service_role;
-- Remove any legacy grants inherited through PostgreSQL's PUBLIC role before
-- adding the deliberately narrow role grants below.
revoke all privileges on
  public.library_settings,
  public.librarian_provisioning_intents,
  public.student_signup_allowlist,
  public.fine_payments,
  public.return_requests,
  public.my_fine_payments,
  public.my_return_requests,
  public.staff_return_requests,
  public.admin_return_requests,
  public.staff_critical_fines,
  public.admin_critical_fines,
  public.super_admin_administrators,
  public.admin_catalog_books
from public;
-- The public catalogue RPC below is the only anonymous database surface.
-- Revoke any Supabase/project default grants without changing the RLS policies.
revoke all privileges on
  public.profiles,
  public.student_private_profiles,
  public.presentation_student_registry,
  public.student_signup_allowlist,
  public.librarian_provisioning_intents,
  public.categories,
  public.authors,
  public.books,
  public.book_copies,
  public.inventory_movements,
  public.digital_editions,
  public.book_chapters,
  public.borrow_baskets,
  public.basket_items,
  public.loans,
  public.loan_items,
  public.fine_payments,
  public.return_requests,
  public.borrow_requests,
  public.borrow_request_items,
  public.favorites,
  public.reading_progress,
  public.notifications,
  public.audit_events,
  public.library_settings,
  public.inventory_summary,
  public.catalog_books,
  public.admin_catalog_books,
  public.my_basket,
  public.my_loans,
  public.my_fine_payments,
  public.my_return_requests,
  public.staff_return_requests,
  public.admin_return_requests,
  public.staff_critical_fines,
  public.admin_critical_fines,
  public.super_admin_administrators,
  public.my_student_profile,
  public.my_borrow_requests,
  public.staff_borrow_requests,
  public.librarian_borrow_requests,
  public.admin_borrow_requests,
  public.published_book_chapters,
  public.admin_student_profiles,
  public.admin_librarians,
  public.admin_librarian_performance,
  public.admin_students,
  public.admin_circulation,
  public.admin_dashboard_stats,
  public.admin_daily_circulation
from anon;

-- Clear project-default authenticated grants first, then add the narrow set
-- below. RLS remains a second, independent boundary.
revoke all privileges on
  public.profiles,
  public.student_private_profiles,
  public.presentation_student_registry,
  public.student_signup_allowlist,
  public.librarian_provisioning_intents,
  public.library_settings,
  public.books,
  public.book_copies,
  public.fine_payments,
  public.return_requests,
  public.borrow_requests,
  public.borrow_request_items,
  public.audit_events
from authenticated;

-- Profiles remain own-or-admin. Private student intake is intentionally not
-- granted directly: students use the narrow my_student_profile view, while
-- administrator views alone receive private evidence object paths.
grant select on public.profiles to authenticated;
grant select on public.presentation_student_registry to authenticated;
grant select on public.student_signup_allowlist to service_role;
grant select, insert, update, delete on public.profiles, public.student_private_profiles
  to service_role;
grant select, update on public.presentation_student_registry to service_role;
grant select, insert, update, delete on public.librarian_provisioning_intents to service_role;
grant select on public.fine_payments to service_role;
grant select, insert, update, delete on public.return_requests to service_role;
grant select on public.library_settings to service_role;
grant select, insert, update, delete on public.categories, public.authors to authenticated;
grant select on public.books to authenticated;
grant insert (
  id, title, slug, author_id, category_id, isbn, description, format, pages,
  published_year, language, publisher, cover_object_path, cover_url, shelf_hint,
  featured, created_by, updated_by
) on public.books to authenticated;
grant update (
  title, slug, author_id, category_id, isbn, description, format, pages,
  published_year, language, publisher, cover_object_path, cover_url, shelf_hint,
  featured, updated_by
) on public.books to authenticated;
grant select, insert, update on public.book_copies to authenticated;
grant select on public.inventory_movements to authenticated;
grant select, insert, update, delete on public.digital_editions, public.book_chapters to authenticated;
grant select on public.borrow_baskets, public.basket_items, public.loans, public.loan_items to authenticated;
grant select on public.fine_payments to authenticated;
grant select on public.return_requests to authenticated;
grant select on public.borrow_requests, public.borrow_request_items to authenticated;
grant select, insert, delete on public.favorites to authenticated;
grant select, insert, update on public.reading_progress to authenticated;
grant select on public.notifications, public.audit_events to authenticated;
grant select (
  id,
  max_active_books,
  max_loan_days,
  reminder_hours,
  reminders_enabled,
  signup_locked,
  library_name,
  desk_location,
  support_email,
  opening_hours,
  delivery_fee_pesewas
) on public.library_settings to authenticated;
grant update (
  max_active_books,
  max_loan_days,
  reminder_hours,
  reminders_enabled,
  library_name,
  desk_location,
  support_email,
  opening_hours,
  updated_by
) on public.library_settings to authenticated;
grant select on public.inventory_summary, public.catalog_books, public.admin_catalog_books, public.my_basket, public.my_loans,
  public.my_fine_payments, public.my_return_requests, public.staff_return_requests, public.admin_return_requests,
  public.staff_critical_fines, public.admin_critical_fines, public.super_admin_administrators,
  public.my_student_profile, public.my_borrow_requests, public.staff_borrow_requests,
  public.librarian_borrow_requests, public.admin_borrow_requests, public.published_book_chapters,
  public.admin_student_profiles, public.admin_librarians, public.admin_students,
  public.admin_librarian_performance, public.admin_circulation, public.admin_dashboard_stats, public.admin_daily_circulation
to authenticated;

revoke execute on function public.is_staff() from public, anon, authenticated, service_role;
revoke execute on function public.is_admin() from public, anon, authenticated, service_role;
revoke execute on function public.is_super_admin() from public, anon, authenticated, service_role;
revoke execute on function public.audit_signup_lock_change() from public, anon, authenticated, service_role;
revoke execute on function public.sync_student_signup_claim() from public, anon, authenticated, service_role;
revoke execute on function public.admin_set_signup_lock(boolean) from public, anon, authenticated, service_role;
revoke execute on function public.is_active_student() from public, anon, authenticated, service_role;
revoke execute on function public.can_use_library() from public, anon, authenticated, service_role;
revoke execute on function public.update_my_profile(text, text, text, text, text) from public, anon, authenticated, service_role;
revoke execute on function public.update_my_student_intake(text, text, integer, integer, public.student_gender, public.residence_type, text, text, text, text, text) from public, anon, authenticated, service_role;
revoke execute on function public.admin_set_student_verification(uuid, public.student_verification_status, text) from public, anon, authenticated, service_role;
revoke execute on function public.admin_set_student_status(uuid, public.profile_status) from public, anon, authenticated, service_role;
revoke execute on function public.admin_find_profile_by_email(text) from public, anon, authenticated, service_role;
revoke execute on function public.admin_promote_librarian(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.admin_set_librarian_status(uuid, public.profile_status) from public, anon, authenticated, service_role;
revoke execute on function public.admin_remove_librarian(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.service_provision_librarian_profile(uuid, text, text, text) from public, anon, authenticated, service_role;
revoke execute on function public.service_provision_administrator_profile(uuid, uuid, text, text, text) from public, anon, authenticated, service_role;
revoke execute on function public.super_admin_set_administrator_status(uuid, public.profile_status) from public, anon, authenticated, service_role;
revoke execute on function public.super_admin_remove_administrator(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.publish_book(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.archive_book(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.unarchive_book(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.add_book_stock(uuid, integer, text) from public, anon, authenticated, service_role;
revoke execute on function public.adjust_book_stock(uuid, integer, text) from public, anon, authenticated, service_role;
revoke execute on function public.add_to_basket(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.remove_from_basket(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.clean_my_basket() from public, anon, authenticated, service_role;
revoke execute on function public.submit_borrow_request(integer, public.fulfilment_method, text, text, text, public.simulated_payment_method, boolean) from public, anon, authenticated, service_role;
revoke execute on function public.cancel_borrow_request(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.cancel_my_borrow_request(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.approve_borrow_request(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.reject_borrow_request(uuid, text) from public, anon, authenticated, service_role;
revoke execute on function public.librarian_approve_borrow_request(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.librarian_reject_borrow_request(uuid, text) from public, anon, authenticated, service_role;
revoke execute on function public.staff_mark_delivery_dispatched(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.staff_recall_delivery_request(uuid, text) from public, anon, authenticated, service_role;
revoke execute on function public.staff_confirm_recalled_delivery_return(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.student_confirm_delivery_receipt(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.confirm_delivery_receipt(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.checkout_basket(integer) from public, anon, authenticated, service_role;
revoke execute on function public.request_loan_item_return(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.cancel_return_request(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.accept_return_request(uuid, public.book_condition) from public, anon, authenticated, service_role;
revoke execute on function public.return_loan_item(uuid, public.book_condition) from public, anon, authenticated, service_role;
revoke execute on function public.pay_loan_item_fine(uuid, public.simulated_payment_method) from public, anon, authenticated, service_role;
revoke execute on function public.mark_notification_read(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.generate_due_notifications() from public, anon, authenticated, service_role;
revoke execute on function public.run_due_notification_worker() from public, anon, authenticated, service_role;
revoke execute on function public.get_public_catalog() from public, anon, authenticated, service_role;
revoke execute on function public.get_public_categories() from public, anon, authenticated, service_role;
revoke execute on function public.get_public_signup_status() from public, anon, authenticated, service_role;

grant execute on function public.is_staff(), public.is_admin(), public.is_super_admin(), public.is_active_student(), public.can_use_library() to authenticated;
grant execute on function public.admin_set_signup_lock(boolean) to authenticated;
grant execute on function public.update_my_profile(text, text, text, text, text) to authenticated;
grant execute on function public.update_my_student_intake(text, text, integer, integer, public.student_gender, public.residence_type, text, text, text, text, text) to authenticated;
grant execute on function public.admin_set_student_verification(uuid, public.student_verification_status, text), public.admin_set_student_status(uuid, public.profile_status) to authenticated;
grant execute on function public.admin_find_profile_by_email(text), public.admin_promote_librarian(uuid), public.admin_set_librarian_status(uuid, public.profile_status), public.admin_remove_librarian(uuid) to authenticated;
grant execute on function public.service_provision_librarian_profile(uuid, text, text, text) to service_role;
grant execute on function public.service_provision_administrator_profile(uuid, uuid, text, text, text) to service_role;
grant execute on function public.super_admin_set_administrator_status(uuid, public.profile_status), public.super_admin_remove_administrator(uuid) to authenticated;
grant execute on function public.publish_book(uuid) to authenticated;
grant execute on function public.archive_book(uuid), public.unarchive_book(uuid) to authenticated;
grant execute on function public.add_book_stock(uuid, integer, text), public.adjust_book_stock(uuid, integer, text) to authenticated;
grant execute on function public.add_to_basket(uuid), public.remove_from_basket(uuid), public.clean_my_basket() to authenticated;
grant execute on function public.submit_borrow_request(integer, public.fulfilment_method, text, text, text, public.simulated_payment_method, boolean), public.cancel_borrow_request(uuid), public.cancel_my_borrow_request(uuid) to authenticated;
grant execute on function public.approve_borrow_request(uuid), public.reject_borrow_request(uuid, text), public.librarian_approve_borrow_request(uuid), public.librarian_reject_borrow_request(uuid, text) to authenticated;
grant execute on function public.staff_mark_delivery_dispatched(uuid), public.student_confirm_delivery_receipt(uuid), public.confirm_delivery_receipt(uuid) to authenticated;
grant execute on function public.staff_recall_delivery_request(uuid, text) to authenticated;
grant execute on function public.staff_confirm_recalled_delivery_return(uuid) to authenticated;
grant execute on function public.request_loan_item_return(uuid), public.cancel_return_request(uuid), public.accept_return_request(uuid, public.book_condition) to authenticated;
grant execute on function public.pay_loan_item_fine(uuid, public.simulated_payment_method) to authenticated;
grant execute on function public.return_loan_item(uuid, public.book_condition), public.mark_notification_read(uuid), public.generate_due_notifications() to authenticated;
grant execute on function public.get_public_catalog() to anon;
grant execute on function public.get_public_categories() to anon;
grant execute on function public.get_public_signup_status() to anon, authenticated;

-- Realtime is optional in self-hosted Postgres and already exists in Supabase.
-- Add each table only once so rerunning this file remains safe.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
    ) then
      alter publication supabase_realtime add table public.notifications;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'borrow_requests'
    ) then
      alter publication supabase_realtime add table public.borrow_requests;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'return_requests'
    ) then
      alter publication supabase_realtime add table public.return_requests;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'loan_items'
    ) then
      alter publication supabase_realtime add table public.loan_items;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'fine_payments'
    ) then
      alter publication supabase_realtime add table public.fine_payments;
    end if;
  end if;
end $$;

-- Storage: public optimized cover images, admin writes only.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'book-covers',
  'book-covers',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'student-ids',
  'student-ids',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "book_covers_public_read" on storage.objects;
create policy "book_covers_public_read" on storage.objects for select to public
  using (bucket_id = 'book-covers');
drop policy if exists "book_covers_staff_insert" on storage.objects;
drop policy if exists "book_covers_admin_insert" on storage.objects;
create policy "book_covers_admin_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'book-covers' and public.is_admin());
drop policy if exists "book_covers_staff_update" on storage.objects;
drop policy if exists "book_covers_admin_update" on storage.objects;
create policy "book_covers_admin_update" on storage.objects for update to authenticated
  using (bucket_id = 'book-covers' and public.is_admin())
  with check (bucket_id = 'book-covers' and public.is_admin());
drop policy if exists "book_covers_staff_delete" on storage.objects;
drop policy if exists "book_covers_admin_delete" on storage.objects;
create policy "book_covers_admin_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'book-covers' and public.is_admin());

drop policy if exists "student_ids_owner_read" on storage.objects;
drop policy if exists "student_ids_owner_insert" on storage.objects;
drop policy if exists "student_ids_owner_update" on storage.objects;
drop policy if exists "student_ids_admin_read" on storage.objects;
create policy "student_ids_admin_read" on storage.objects for select to authenticated
  using (bucket_id = 'student-ids' and public.is_admin());

-- Starter catalogue. Covers are intentionally null; the interface provides branded fallbacks.
insert into public.categories(id, name, slug, description) values
  ('10000000-0000-0000-0000-000000000001', 'History', 'history', 'African, Ghanaian and world history'),
  ('10000000-0000-0000-0000-000000000002', 'Engineering', 'engineering', 'Engineering and applied technology'),
  ('10000000-0000-0000-0000-000000000003', 'Literature', 'literature', 'Literature, language and criticism'),
  ('10000000-0000-0000-0000-000000000004', 'Computing', 'computing', 'Computer science and information technology'),
  ('10000000-0000-0000-0000-000000000005', 'Science', 'science', 'Natural and physical sciences'),
  ('10000000-0000-0000-0000-000000000006', 'Health Sciences', 'health-sciences', 'Medicine, pharmacy and public health'),
  ('10000000-0000-0000-0000-000000000007', 'Business', 'business', 'Economics, management and entrepreneurship'),
  ('10000000-0000-0000-0000-000000000008', 'Research', 'research', 'Academic research and study skills')
on conflict (id) do nothing;

insert into public.authors(id, name) values
  ('20000000-0000-0000-0000-000000000001', 'Ama Serwaa Mensah'),
  ('20000000-0000-0000-0000-000000000002', 'Kwabena Osei Boateng'),
  ('20000000-0000-0000-0000-000000000003', 'Nana Akua Adom'),
  ('20000000-0000-0000-0000-000000000004', 'Kofi Asare'),
  ('20000000-0000-0000-0000-000000000005', 'Dr. Efua K. Nyarko'),
  ('20000000-0000-0000-0000-000000000006', 'Abena Frimpong'),
  ('20000000-0000-0000-0000-000000000007', 'Yaw Nkrumah'),
  ('20000000-0000-0000-0000-000000000008', 'Akosua Bediako')
on conflict (id) do nothing;

insert into public.books(id, title, slug, author_id, category_id, isbn, description, format, pages, published_year, language, featured, is_published) values
  ('30000000-0000-0000-0000-000000000001', 'Foundations of African History', 'foundations-of-african-history', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '978-9988-1-1042-3', 'A clear, rigorous introduction to the people, ideas, trade routes, and institutions that shaped the African continent.', 'both', 328, 2024, 'English', true, true),
  ('30000000-0000-0000-0000-000000000002', 'Engineering Mathematics', 'engineering-mathematics', '20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '978-9988-2-0814-4', 'Applied calculus, vectors, differential equations, and numerical methods explained through practical engineering problems.', 'physical', 512, 2023, 'English', true, true),
  ('30000000-0000-0000-0000-000000000003', 'Modern Ghanaian Literature', 'modern-ghanaian-literature', '20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', '978-9988-3-0201-9', 'Essays and readings that explore voice, memory, identity, and social change in modern Ghanaian writing.', 'both', 284, 2025, 'English', true, true),
  ('30000000-0000-0000-0000-000000000004', 'Data Structures Made Clear', 'data-structures-made-clear', '20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000004', '978-9988-4-4420-7', 'A visual and practical guide to arrays, trees, graphs, hashing, complexity, and good software decisions.', 'digital', 396, 2025, 'English', false, true),
  ('30000000-0000-0000-0000-000000000005', 'Essential Organic Chemistry', 'essential-organic-chemistry', '20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000005', '978-9988-5-1187-2', 'Reaction mechanisms and molecular structure taught with concise explanations and worked examples.', 'physical', 448, 2022, 'English', false, true),
  ('30000000-0000-0000-0000-000000000006', $knust_seed$Public Health in Practice$knust_seed$, $knust_seed$public-health-in-practice$knust_seed$, '20000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000006', '978-9988-6-0914-9', 'Community-centred approaches to epidemiology, prevention, communication, and resilient care systems.', 'both', 352, 2024, 'English', false, true),
  ('30000000-0000-0000-0000-000000000007', 'Principles of Economics', 'principles-of-economics', '20000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000007', '978-9988-7-7714-6', 'An accessible study of markets, policy, incentives, growth, and choices facing emerging economies.', 'physical', 472, 2021, 'English', false, true),
  ('30000000-0000-0000-0000-000000000008', 'Research Methods Field Guide', 'research-methods-field-guide', '20000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000008', '978-9988-8-2019-4', 'From a strong research question to responsible data collection, analysis, citation, and communication.', 'digital', 246, 2026, 'English', false, true)
on conflict (id) do nothing;

insert into public.book_copies(book_id, accession_number, shelf_location)
select '30000000-0000-0000-0000-000000000001', 'KLM-HIS-' || lpad(n::text, 3, '0'), 'History A-01' from generate_series(1, 14) n
on conflict (accession_number) do nothing;
insert into public.book_copies(book_id, accession_number, shelf_location)
select '30000000-0000-0000-0000-000000000002', 'KLM-ENG-' || lpad(n::text, 3, '0'), 'Engineering B-04' from generate_series(1, 10) n
on conflict (accession_number) do nothing;
insert into public.book_copies(book_id, accession_number, shelf_location)
select '30000000-0000-0000-0000-000000000003', 'KLM-LIT-' || lpad(n::text, 3, '0'), 'Literature C-02' from generate_series(1, 9) n
on conflict (accession_number) do nothing;
insert into public.book_copies(book_id, accession_number, shelf_location)
select '30000000-0000-0000-0000-000000000005', 'KLM-SCI-' || lpad(n::text, 3, '0'), 'Science D-09' from generate_series(1, 16) n
on conflict (accession_number) do nothing;
insert into public.book_copies(book_id, accession_number, shelf_location)
select '30000000-0000-0000-0000-000000000006', 'KLM-HSC-' || lpad(n::text, 3, '0'), 'Health Sciences E-03' from generate_series(1, 8) n
on conflict (accession_number) do nothing;
insert into public.book_copies(book_id, accession_number, shelf_location)
select '30000000-0000-0000-0000-000000000007', 'KLM-BUS-' || lpad(n::text, 3, '0'), 'Business F-06' from generate_series(1, 12) n
on conflict (accession_number) do nothing;

insert into public.digital_editions(id, book_id, status, published_at) values
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'published', now()),
  ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000003', 'published', now()),
  ('40000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000004', 'published', now()),
  ('40000000-0000-0000-0000-000000000006', '30000000-0000-0000-0000-000000000006', 'published', now()),
  ('40000000-0000-0000-0000-000000000008', '30000000-0000-0000-0000-000000000008', 'published', now())
on conflict (id) do nothing;

insert into public.book_chapters(edition_id, order_index, title, content_text, is_published)
select de.id, 1, 'Introduction',
  $knust_chapter$
Knowledge becomes useful when it moves beyond memory and into practice. A library gives that movement a home: one student discovers an idea, another tests it, and a community learns from what follows.

At a university, reading is not a quiet retreat from the world. It is preparation for entering the world with sharper questions. The best readers pause at a claim, trace its assumptions, and ask what evidence would change their mind.

A strong study habit begins with attention. Choose one clear question before opening a chapter. Write what you already believe, then note what the author adds, contradicts, or leaves unresolved. This turns pages into a conversation rather than a task.

Across disciplines, useful ideas often meet at the edges. A principle from economics may illuminate public health; a method from engineering may strengthen agriculture. Curiosity creates those bridges, and careful reading makes them safe to cross.

The purpose of scholarship is not to collect impressive words. It is to make understanding more accurate, more generous, and more available to others.
$knust_chapter$,
  true
from public.digital_editions de
where de.id in (
  '40000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000003',
  '40000000-0000-0000-0000-000000000004',
  '40000000-0000-0000-0000-000000000006',
  '40000000-0000-0000-0000-000000000008'
)
on conflict (edition_id, order_index) do nothing;

commit;

-- AFTER YOU RUN THIS FILE
-- 1. Sign up normally in the application with the personal email that should own the admin portal.
-- 2. Replace the email below and run the single UPDATE separately:
--
-- update public.profiles
-- set role = 'super_admin'
-- where lower(email) = lower('your-personal-email@example.com');
--
-- 3. Add these variables to .env.local:
-- NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
-- NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
-- SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
--
-- 4. Provision the 19 fictional presentation logins (server-side Admin API):
-- node --env-file=.env.local scripts/seed-presentation-accounts.mjs
--
-- Optional daily reminders: enable Supabase Cron and schedule
-- select public.run_due_notification_worker(); from its trusted postgres context.
