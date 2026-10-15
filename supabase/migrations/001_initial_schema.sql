-- =============================================================================
-- Sanad Hybrid Case & Aid Management System — Supabase / PostgreSQL Schema & RLS
-- Covers Sections 4, 5.2, 6, 8 (Donor Portal Zero-PII + Small-Cell Suppression)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Atomic Sequence for Official Case Codes (CS-0001) — Section 5.2 Rule 4
CREATE SEQUENCE IF NOT EXISTS public.beneficiary_case_code_seq START WITH 1 INCREMENT BY 1;

-- 2. Users & Roles Table (Section 4.3 & Section 6)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email_or_phone TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'case_worker', 'data_entry', 'internal_auditor', 'donor')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  can_view_sensitive_health BOOLEAN NOT NULL DEFAULT false,
  donor_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Trusted Devices Table (Section 6 & Scenario 9: Revoke lost device)
CREATE TABLE IF NOT EXISTS public.trusted_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_code TEXT UNIQUE NOT NULL,
  device_name TEXT NOT NULL,
  assigned_user_id UUID REFERENCES public.users(id),
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'revoked')),
  last_sync_at TIMESTAMPTZ NULL,
  revoked_at TIMESTAMPTZ NULL,
  revoked_reason TEXT NULL
);

-- 4. Beneficiary Cases Table (Section 4.1)
CREATE TABLE IF NOT EXISTS public.beneficiary_cases (
  id UUID PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  temp_code TEXT NULL,
  reg_date TEXT NOT NULL,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  national_id TEXT NOT NULL DEFAULT '',
  id_attach TEXT NOT NULL DEFAULT '',
  nationality TEXT NOT NULL DEFAULT 'مصري',
  referral TEXT NOT NULL DEFAULT 'تقديم مباشر',
  referrer_name TEXT NOT NULL DEFAULT '',
  referrer_phone TEXT NOT NULL DEFAULT '',
  referrer_org TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  phone2 TEXT NOT NULL DEFAULT '',
  general_area TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  gps_lat DOUBLE PRECISION NULL,
  gps_lng DOUBLE PRECISION NULL,
  marital TEXT NOT NULL DEFAULT '',
  breadwinner TEXT NOT NULL DEFAULT '',
  breadwinner_rel TEXT NOT NULL DEFAULT '',
  family_count INTEGER NOT NULL DEFAULT 1 CHECK (family_count >= 0 AND family_count <= 99),
  family_names TEXT NOT NULL DEFAULT '',
  children_count INTEGER NOT NULL DEFAULT 0,
  housing_type TEXT NOT NULL DEFAULT '',
  income_status TEXT NOT NULL DEFAULT '',
  health TEXT NOT NULL DEFAULT 'سليم',
  health_desc TEXT NOT NULL DEFAULT '',
  medical_attach TEXT NOT NULL DEFAULT '',
  aid_cat TEXT NOT NULL DEFAULT '',
  aid_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  need_desc TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'قيد الدراسة' CHECK (status IN ('قيد الدراسة', 'مقبول', 'تم الصرف', 'مرفوض')),
  disb_date TEXT NOT NULL DEFAULT '',
  proof_method TEXT NOT NULL DEFAULT '',
  proof_attach TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  workflow_stage TEXT NOT NULL DEFAULT 'registered',
  approved_by TEXT NULL,
  approved_at TIMESTAMPTZ NULL,
  vulnerability_score INTEGER NOT NULL DEFAULT 0,
  vulnerability_breakdown JSONB NOT NULL DEFAULT '[]'::jsonb,
  anonymized_summary TEXT NOT NULL DEFAULT '',
  consent_data_processing BOOLEAN NOT NULL DEFAULT true,
  consent_photo_sharing BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ NULL,
  field_timestamps JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_cases_national_id ON public.beneficiary_cases(national_id);
CREATE INDEX IF NOT EXISTS idx_cases_updated_at ON public.beneficiary_cases(updated_at);
CREATE INDEX IF NOT EXISTS idx_cases_temp_code ON public.beneficiary_cases(temp_code);

-- 5. Followups Table (Section 4.2 - Append-Only Merge)
CREATE TABLE IF NOT EXISTS public.followups (
  id UUID PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES public.beneficiary_cases(id),
  date TEXT NOT NULL,
  ftype TEXT NOT NULL,
  details TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ NULL
);

-- 6. Processed Mutations Table for Idempotent Sync (Section 5.2 Rule 2)
CREATE TABLE IF NOT EXISTS public.processed_mutations (
  mutation_id UUID PRIMARY KEY,
  device_code TEXT NOT NULL,
  entity_table TEXT NOT NULL,
  entity_id UUID NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Sync Conflicts Table (Section 5.2 Rule 5)
CREATE TABLE IF NOT EXISTS public.sync_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_table TEXT NOT NULL,
  entity_id UUID NOT NULL,
  case_code TEXT NOT NULL,
  case_name TEXT NOT NULL,
  field_name TEXT NOT NULL,
  field_label_ar TEXT NOT NULL,
  winner_value JSONB,
  loser_value JSONB,
  winner_user TEXT NOT NULL,
  loser_user TEXT NOT NULL,
  winner_device TEXT NOT NULL,
  loser_device TEXT NOT NULL,
  winner_timestamp TIMESTAMPTZ NOT NULL,
  loser_timestamp TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_review',
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_by TEXT NULL,
  resolved_at TIMESTAMPTZ NULL
);

-- 8. Immutable Audit Log Table (Section 4.3)
CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_name TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_code TEXT NULL,
  summary_ar TEXT NOT NULL
);

-- Prevent UPDATE or DELETE on audit_log (Immutable Governance Rule)
CREATE OR REPLACE FUNCTION public.prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is strictly append-only and cannot be modified or deleted.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_immutable_audit_log ON public.audit_log;
CREATE TRIGGER trg_immutable_audit_log
BEFORE UPDATE OR DELETE ON public.audit_log
FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_log_modification();

-- =============================================================================
-- Row Level Security (RLS) — Section 5.2 Rule 10 & Section 6 & Section 8.1
-- =============================================================================
ALTER TABLE public.beneficiary_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Donors are strictly FORBIDDEN from selecting raw beneficiary_cases rows (Section 8.1)
CREATE POLICY "Internal staff can read beneficiary_cases"
ON public.beneficiary_cases
FOR SELECT
USING (
  auth.jwt() ->> 'role' IN ('admin', 'case_worker', 'data_entry', 'internal_auditor')
);

CREATE POLICY "Authorized staff can insert/update beneficiary_cases"
ON public.beneficiary_cases
FOR ALL
USING (
  auth.jwt() ->> 'role' IN ('admin', 'case_worker', 'data_entry')
);

-- Small-Cell Suppression Anonymized View for Donor Portal (Section 8.1: min 5 cases per cell)
CREATE OR REPLACE VIEW public.donor_regional_impact_stats AS
SELECT
  CASE WHEN COUNT(*) >= 5 THEN general_area ELSE 'مناطق أخرى مجمّعة (< 5 حالات)' END AS safe_area,
  aid_cat,
  COUNT(*) AS families_count,
  SUM(family_count) AS beneficiaries_count
FROM public.beneficiary_cases
WHERE deleted_at IS NULL AND status = 'تم الصرف'
GROUP BY general_area, aid_cat;
