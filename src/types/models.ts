/**
 * Domain Data Models for the Hybrid Case & Aid Management System
 * Following Sections 4, 5, 6, 7, 8, and 14 (P1/P2) specifications.
 */

export type CaseStatus = 'قيد الدراسة' | 'مقبول' | 'تم الصرف' | 'مرفوض' | '';

export type WorkflowStage =
  | 'registered'     // تسجيل
  | 'under_review'   // دراسة ميدانية
  | 'approved'       // اعتماد (مبدأ العينين الأربعة)
  | 'disbursed'      // صرف
  | 'documented'     // توثيق مكتمل
  | 'rejected';      // مرفوض

export type UserRoleCode =
  | 'admin'            // مدير النظام
  | 'case_worker'      // مسؤول حالات / باحث اجتماعي
  | 'data_entry'       // مدخل بيانات
  | 'internal_auditor' // مراجع / مشاهد داخلي
  | 'donor';           // داعم (Donor)

export type AidCategory = 'عينية' | 'مساعدات شتوية' | 'مادية' | 'طبية' | '';

export type FollowupType =
  | 'زيارة منزلية'
  | 'زيارة ميدانية'
  | 'اتصال هاتفي'
  | 'مقابلة بالمركز';

export type MaritalStatus =
  | 'أرملة (تعيل أيتام)'
  | 'مطلقة (تعيل أطفال)'
  | 'يتيم / أسرة أيتام'
  | 'متزوج (أسرة مستورة)'
  | 'مهجورة / فاقد العائل'
  | 'أسرة سجين'
  | 'مسن / عاجز بلا معيل'
  | 'أرمل'
  | 'أرملة'
  | 'مطلق'
  | 'مطلقة'
  | 'أعزب'
  | 'غير ذلك'
  | string;

export type HealthStatus = 'سليم' | 'مرض مزمن' | 'إعاقة' | 'احتياج خاص' | '';

export type ProofMethod =
  | 'كشف توقيع المستفيد'
  | 'فاتورة شراء'
  | 'إيصال استلام نقدية'
  | 'صورة استلام'
  | '';

export type HousingType =
  | 'إيجار'
  | 'تمليك متواضع'
  | 'إيواء / غرفة مشتركة'
  | 'سكن غير ملائم / سقف بحاجة لعزل'
  | '';

export type IncomeStatus =
  | 'بلا دخل (منقطع)'
  | 'دخل غير منتظم (يومية)'
  | 'معاش ضعيف'
  | 'دخل ثابت محدود'
  | '';

/**
 * Common synchronization & audit metadata present on mutable records (Section 4.1 & 5.2)
 */
export interface SyncMetadata {
  id: string; // UUID v4 generated locally
  created_at: string; // ISO8601 timestamp
  updated_at: string; // ISO8601 timestamp
  created_by: string; // User name or ID
  updated_by: string; // User name or ID
  version: number; // Increments on every modification
  deleted_at: string | null; // Soft delete timestamp
  field_timestamps?: Record<string, string>; // Per-field Last-Write-Wins timestamp
}

/**
 * Breakdown item for P1.1 Transparent Vulnerability Score
 */
export interface VulnerabilityFactor {
  key: string;
  label_ar: string;
  points: number;
  max_points: number;
  reason_ar: string;
}

/**
 * Section 4.1: Beneficiary Case Record (beneficiary_cases)
 */
export interface BeneficiaryCase extends SyncMetadata {
  code: string; // Official sequential readable code e.g. CS-0001
  temp_code?: string; // Offline device-scoped code e.g. CS-D1-0001 kept permanently as reference
  is_code_finalized?: boolean;
  reg_date: string; // YYYY/MM/DD
  name: string; // Required: Beneficiary / Head of Household full name
  normalized_name: string; // Normalized Arabic name for P1.4 smart deduplication
  national_id: string; // Text preserving leading zeros, indexed for duplicate detection
  id_attach: string; // Attachment ID or external URL for National ID / Passport
  nationality: string;
  referral: string;
  referrer_name: string;
  referrer_phone: string;
  referrer_org: string;
  phone: string; // Preserves leading zero
  phone2: string; // Secondary / WhatsApp
  governorate?: string; // Main sector / Governorate (e.g. مدينة 6 أكتوبر والشيخ زايد, فيصل والجيزة)
  sub_district?: string; // Sub-district / Neighborhood (e.g. الحي الثاني, بيت العيلة, مساكن أبناء الجيزة, شارع العشرين)
  general_area: string; // Generalized region for Donor Portal & Heatmap (privacy-safe, e.g. "6 أكتوبر — الحي الثاني")
  address: string; // Detailed address (sensitive)
  gps_lat?: number | null;
  gps_lng?: number | null;
  marital: MaritalStatus | string;
  breadwinner: string;
  breadwinner_rel: string;
  family_count: number; // Integer 0-99
  family_names: string;
  children_count?: number;
  housing_type?: HousingType | string;
  income_status?: IncomeStatus | string;
  health: HealthStatus | string;
  health_desc: string; // Sensitive medical diagnosis details
  medical_attach: string; // Sensitive medical report attachment ID or URL
  aid_cat: AidCategory | string;
  aid_types: string[]; // Multi-select aid types (Section 4.4)
  need_desc: string;
  status: CaseStatus; // قيد الدراسة | مقبول | تم الصرف | مرفوض
  disb_date: string; // YYYY/MM/DD
  proof_method: ProofMethod | string;
  proof_attach: string;
  notes: string;

  // P1.3 Workflow & Four-Eyes Principle
  workflow_stage?: WorkflowStage;
  approved_by?: string | null;
  approved_at?: string | null;
  estimated_aid_amount?: number;

  // P1.1 Vulnerability Score
  vulnerability_score: number; // 0 - 100
  vulnerability_breakdown: VulnerabilityFactor[];

  // Section 8 & Compliance: Donor Portal Anonymized Summary & Consent
  anonymized_summary: string; // Safe description for Donor Portal (zero PII)
  consent_data_processing: boolean;
  consent_photo_sharing: boolean;
}

/**
 * P2.12: Independent Family Member Record (family_members)
 */
export interface FamilyMember extends SyncMetadata {
  case_id: string;
  name: string;
  relation: string;
  age: number;
  gender: 'ذكر' | 'أنثى';
  education: string;
  health_status: HealthStatus | string;
  has_disability: boolean;
  notes?: string;
}

/**
 * Section 4.2 & P2.11: Follow-up & Field Visit Record (followups)
 */
export interface FollowupRecord extends SyncMetadata {
  case_id: string;
  date: string; // YYYY/MM/DD
  ftype: FollowupType;
  details: string;
  is_scheduled_visit?: boolean;
  scheduled_date?: string;
  visit_status?: 'مجدولة' | 'مكتملة' | 'مؤجلة';
  route_order?: number;
  gps_lat?: number | null;
  gps_lng?: number | null;
}

/**
 * Section 4.3: Real Attachment or Link Record (attachments)
 */
export interface AttachmentRecord extends SyncMetadata {
  entity_type:
    | 'case_id_doc'
    | 'case_medical'
    | 'distribution_proof'
    | 'consent_form'
    | 'other';
  entity_id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  sha256_hash: string; // P1.2 Tamper detection hash
  data_url: string;
  is_external_link: boolean;
  upload_status: 'local' | 'uploading' | 'uploaded' | 'failed';
  consent_to_share: boolean; // Must be true + redacted before showing to Donors
  is_redacted?: boolean; // True after face/ID blur tool is applied
  captured_gps?: string;
  captured_at?: string;
}

/**
 * Section 4.3 & Section 8: Donor Record (donors)
 */
export interface DonorRecord {
  id: string;
  name: string;
  donor_type: 'مؤسسة مانحة' | 'متبرع فردي';
  contact_info: string;
  notes: string;
  visibility_level: 'standard' | 'detailed_anonymized';
  allowed_project_ids: string[]; // Strict server-side & client-side project isolation
  created_at: string;
}

/**
 * Section 4.3 & P2.8: Campaign / Project Record (projects)
 */
export interface ProjectRecord {
  id: string;
  name: string;
  period_label: string; // e.g. 'شتاء 2026 (أكتوبر - فبراير)'
  target_budget: number;
  currency: string;
  target_category: AidCategory | string;
  status: 'نشط' | 'مكتمل' | 'مؤرشف';
  created_at: string;
}

/**
 * Section 4.3 & P2.8: Donation Record (donations)
 */
export interface DonationRecord {
  id: string;
  donor_id: string;
  donor_name: string;
  project_id: string;
  project_name: string;
  amount: number;
  currency: string;
  date: string; // YYYY/MM/DD
  collection_method: 'تحويل بنكي' | 'شيك مصدق' | 'إيداع نقدي بالمركز' | 'بوابة دفع إلكتروني';
  is_restricted: boolean; // مخصص لفئة معينة أم عام
  restricted_category?: string;
  receipt_attach?: string;
  notes?: string;
  created_at: string;
}

/**
 * Section 4.3 & P1.2: Aid Distribution Record (distributions)
 * Separates delivered aid from case record so a case can receive multiple distributions,
 * with tamper-evident electronic signature, SHA-256 file hash, GPS stamp, and QR token.
 */
export interface DistributionRecord extends SyncMetadata {
  receipt_number: string; // e.g. RCP-0001
  case_id: string;
  case_code: string;
  case_general_area: string;
  case_family_count: number;
  case_anonymized_summary: string;
  project_id: string;
  project_name: string;
  donation_id?: string;
  donor_id?: string;
  inventory_item_id?: string;
  aid_cat: AidCategory | string;
  aid_type: string;
  quantity: number;
  unit: string;
  financial_value: number;
  currency: string;
  disb_date: string; // YYYY/MM/DD
  proof_method: ProofMethod | string;
  proof_attach: string;
  executed_by: string;
  approved_by: string;

  // P1.2 Tamper-Evident Receipt Proof
  recipient_signature_svg: string;
  proof_timestamp: string;
  proof_gps?: string;
  proof_file_sha256: string;
  qr_verification_token: string;

  // Section 8.1 Donor Sharing Consent & Redaction
  consent_to_share: boolean;
  is_redacted: boolean;
}

/**
 * P2.7: Inventory & Supply Item (inventory_items)
 */
export interface InventoryItemRecord {
  id: string;
  name: string;
  aid_cat: AidCategory | string;
  unit: string;
  qty_in: number;
  qty_out: number;
  qty_available: number;
  min_threshold: number;
  updated_at: string;
}

/**
 * Section 8.2 & Scenario 8: Time-Limited Read-Only Donor Share Link (donor_share_links)
 */
export interface DonorShareLinkRecord {
  id: string;
  token: string;
  donor_id: string;
  donor_name: string;
  expires_at: string; // ISO8601
  revoked_at: string | null; // Immediate revocation stops access (Scenario 8)
  created_by: string;
  created_at: string;
  access_count: number;
}

/**
 * Section 8.2 & P1.5: Approved Anonymized Impact Story (impact_stories)
 */
export interface ImpactStoryRecord {
  id: string;
  project_id: string;
  donor_id: string;
  title_ar: string;
  story_ar: string;
  title_en: string;
  story_en: string;
  case_code_ref: string;
  redacted_image_data_url?: string;
  consent_to_share: boolean;
  is_redacted: boolean;
  approved_by: string;
  published_date: string;
}

/**
 * P1.6: Beneficiary Feedback & Complaints Record (CHS Standard)
 */
export interface ComplaintRecord {
  id: string;
  ticket_code: string; // CMP-0001
  case_code?: string;
  submitted_date: string; // YYYY/MM/DD
  channel: 'هاتف الشكاوى' | 'صندوق المقترحات بالمركز' | 'واتساب' | 'أثناء الزيارة الميدانية';
  category: 'تأخر صرف المساعدة' | 'جودة الأصناف العينية' | 'سلوك ومعاملة الفريق' | 'طلب إعادة دراسة' | 'أخرى';
  priority: 'عادية' | 'عاجلة' | 'حماية وسلامة (Safeguarding)';
  description: string;
  sla_days: number;
  status: 'مفتوحة' | 'قيد المعالجة' | 'تم الحل والإغلاق';
  resolution_notes?: string;
  resolved_at?: string;
}

/**
 * Section 4.3 & Section 6: User Account Record (users)
 */
export interface UserAccount {
  id: string;
  name: string;
  email_or_phone: string;
  role: UserRoleCode;
  role_label_ar: string;
  status: 'active' | 'suspended';
  pin_code: string;
  can_view_sensitive_health: boolean;
  donor_id?: string | null;
  created_at: string;
  last_login_at?: string;
}

/**
 * Section 6 & Scenario 9: Trusted Device Record (trusted_devices)
 */
export interface TrustedDevice {
  id: string;
  device_code: string;
  device_name: string;
  assigned_user_id: string;
  assigned_user_name: string;
  status: 'approved' | 'revoked';
  last_sync_at: string | null;
  revoked_at?: string | null;
  revoked_reason?: string;
}

/**
 * Section 5.2 Rule 5: Field-Level Conflict Record (sync_conflicts)
 */
export interface SyncConflictRecord {
  id: string;
  entity_table: 'beneficiary_cases';
  entity_id: string;
  case_code: string;
  case_name: string;
  field_name: keyof BeneficiaryCase | string;
  field_label_ar: string;
  winner_value: unknown;
  loser_value: unknown;
  winner_user: string;
  loser_user: string;
  winner_device: string;
  loser_device: string;
  winner_timestamp: string;
  loser_timestamp: string;
  status: 'pending_review' | 'resolved_keep_winner' | 'resolved_restore_loser';
  detected_at: string;
  resolved_by?: string;
  resolved_at?: string;
}

/**
 * Section 4.3: Editable Dropdown List (dropdown_lists)
 */
export interface DropdownListItem {
  value: string;
  label_ar: string;
  active: boolean;
  sort_order: number;
}

export interface DropdownListRecord {
  key: string;
  title_ar: string;
  editable: boolean;
  items: DropdownListItem[];
  updated_at: string;
}

/**
 * Section 4.3: Read-Only Immutable Audit Log (audit_log)
 */
export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actor_name: string;
  actor_role: string;
  action:
    | 'CREATE'
    | 'UPDATE'
    | 'SOFT_DELETE'
    | 'RESTORE'
    | 'EXPORT'
    | 'BACKUP'
    | 'IMPORT'
    | 'SETTINGS_CHANGE'
    | 'LOGIN'
    | 'SESSION_LOCK'
    | 'SYNC'
    | 'CONFLICT_RESOLVED'
    | 'DUPLICATE_MERGED'
    | 'WORKFLOW_APPROVAL'
    | 'DEVICE_REVOKED'
    | 'DISTRIBUTION_CREATED'
    | 'DONOR_PORTAL_VIEW'
    | 'DONOR_REPORT_EXPORT'
    | 'SHARE_LINK_ACCESS'
    | 'SHARE_LINK_REVOKED';
  entity_type:
    | 'case'
    | 'followup'
    | 'attachment'
    | 'family_member'
    | 'dropdown_list'
    | 'user'
    | 'device'
    | 'conflict'
    | 'distribution'
    | 'donor'
    | 'project'
    | 'donation'
    | 'share_link'
    | 'complaint'
    | 'system';
  entity_id: string;
  entity_code?: string;
  summary_ar: string;
  changed_fields?: string[];
}

/**
 * Section 4.3 & 5.2: Local Outbox Queue for Idempotent Background Sync (sync_outbox)
 */
export interface SyncOutboxItem {
  mutation_id: string;
  entity_table:
    | 'beneficiary_cases'
    | 'followups'
    | 'attachments'
    | 'family_members'
    | 'distributions';
  entity_id: string;
  operation: 'INSERT' | 'UPDATE' | 'SOFT_DELETE';
  payload: Record<string, unknown>;
  field_timestamps: Record<string, string>;
  base_version: number;
  device_code?: string;
  created_at: string;
  retry_count: number;
  next_retry_at?: string | null;
  status: 'pending' | 'in_flight' | 'synced' | 'failed';
  last_error?: string;
}

/**
 * Section 7: Automatic Case Alert Types
 */
export type AlertCode =
  | 'STATUS_UNDEFINED'
  | 'DISBURSED_MISSING_PROOF'
  | 'DISBURSED_MISSING_DATE'
  | 'UNDER_STUDY_OVERDUE'
  | 'HEALTHY';

export interface CaseAlert {
  code: AlertCode;
  severity: 'warning' | 'overdue' | 'healthy';
  icon: '⚠' | '⏰' | '✓';
  message_ar: string;
}

export type SyncConnectionState =
  | 'online_synced'
  | 'offline'
  | 'pending_changes'
  | 'syncing'
  | 'sync_error';

/**
 * Application & Business Rule Settings
 */
export interface AppSettings {
  id: string; // 'default'
  org_name: string;
  org_subtitle: string;
  device_code: string;
  next_case_seq: number;
  overdue_study_days: number;
  numeral_system: 'latin' | 'arabic_indic';
  dark_mode: boolean;
  default_currency: string;
  current_user_id: string;
  current_user_name: string;
  current_user_role_code: UserRoleCode;
  current_user_role:
    | 'مدير النظام'
    | 'باحث اجتماعي / مسؤول حالات'
    | 'مدخل بيانات'
    | 'مراجع داخلي'
    | 'داعم (Donor)';
  session_timeout_minutes: number;
  simulated_network_online: boolean;
  last_synced_at: string | null;
  financial_approval_limit: number;
  small_cell_suppression_min: number; // Default 5 cases minimum for Donor Portal (Section 8.1)
}
