import Dexie, { Table } from 'dexie';
import {
  BeneficiaryCase,
  FamilyMember,
  FollowupRecord,
  AttachmentRecord,
  DropdownListRecord,
  AuditLogEntry,
  SyncOutboxItem,
  AppSettings,
  UserAccount,
  TrustedDevice,
  SyncConflictRecord,
  WorkflowStage,
  DonorRecord,
  ProjectRecord,
  DonationRecord,
  DistributionRecord,
  InventoryItemRecord,
  DonorShareLinkRecord,
  ImpactStoryRecord,
  ComplaintRecord,
} from '../types/models';
import {
  CASE_FIELD_LABELS_AR,
  DEFAULT_APP_SETTINGS,
  DEFAULT_COMPLAINTS,
  DEFAULT_DONATIONS,
  DEFAULT_DONORS,
  DEFAULT_DROPDOWN_LISTS,
  DEFAULT_IMPACT_STORIES,
  DEFAULT_INVENTORY_ITEMS,
  DEFAULT_PROJECTS,
  DEFAULT_TRUSTED_DEVICES,
  DEFAULT_USERS,
} from '../constants/defaultLists';
import {
  formatCaseCode,
  formatTempCaseCode,
  generateUUID,
  toYYYYMMDD,
  computeSHA256,
} from '../utils/formatters';
import { normalizeArabicText } from '../utils/arabicDeduplication';
import { calculateVulnerabilityScore } from '../utils/vulnerabilityScore';

export class SanadOfflineDatabase extends Dexie {
  beneficiary_cases!: Table<BeneficiaryCase, string>;
  family_members!: Table<FamilyMember, string>;
  followups!: Table<FollowupRecord, string>;
  attachments!: Table<AttachmentRecord, string>;
  dropdown_lists!: Table<DropdownListRecord, string>;
  audit_log!: Table<AuditLogEntry, string>;
  sync_outbox!: Table<SyncOutboxItem, string>;
  app_settings!: Table<AppSettings, string>;
  users!: Table<UserAccount, string>;
  trusted_devices!: Table<TrustedDevice, string>;
  sync_conflicts!: Table<SyncConflictRecord, string>;
  donors!: Table<DonorRecord, string>;
  projects!: Table<ProjectRecord, string>;
  donations!: Table<DonationRecord, string>;
  distributions!: Table<DistributionRecord, string>;
  inventory_items!: Table<InventoryItemRecord, string>;
  donor_share_links!: Table<DonorShareLinkRecord, string>;
  impact_stories!: Table<ImpactStoryRecord, string>;
  complaints_feedback!: Table<ComplaintRecord, string>;

  constructor() {
    super('SanadOfflineAidDB');

    this.version(3).stores({
      beneficiary_cases:
        'id, code, temp_code, reg_date, name, normalized_name, national_id, nationality, referral, phone, general_area, status, aid_cat, vulnerability_score, updated_at, deleted_at',
      family_members: 'id, case_id, relation, gender, has_disability, deleted_at',
      followups: 'id, case_id, date, ftype, scheduled_date, visit_status, deleted_at',
      attachments: 'id, entity_type, entity_id, upload_status, consent_to_share, deleted_at',
      dropdown_lists: 'key',
      audit_log: 'id, timestamp, action, entity_type, entity_id',
      sync_outbox: 'mutation_id, entity_table, entity_id, status, created_at',
      app_settings: 'id',
      users: 'id, email_or_phone, role, status',
      trusted_devices: 'id, device_code, assigned_user_id, status',
      sync_conflicts: 'id, entity_id, case_code, field_name, status, detected_at',
      donors: 'id, name, donor_type',
      projects: 'id, name, target_category, status',
      donations: 'id, donor_id, project_id, date',
      distributions: 'id, receipt_number, case_id, case_code, project_id, donor_id, disb_date, deleted_at',
      inventory_items: 'id, name, aid_cat',
      donor_share_links: 'id, token, donor_id, revoked_at',
      impact_stories: 'id, project_id, donor_id, published_date',
      complaints_feedback: 'id, ticket_code, case_code, status, priority',
    });
  }
}

export const db = new SanadOfflineDatabase();

interface CloudServerState {
  nextOfficialCodeSeq: number;
  processedMutationIds: Record<string, string>;
  cloudCases: Record<string, BeneficiaryCase>;
  cloudFollowups: Record<string, FollowupRecord>;
  cloudDistributions: Record<string, DistributionRecord>;
  revokedDeviceCodes: Record<string, string>;
}

const CLOUD_STORAGE_KEY = 'sanad_cloud_server_state_v3';

let inMemoryCloudState: CloudServerState = {
  nextOfficialCodeSeq: 7,
  processedMutationIds: {},
  cloudCases: {},
  cloudFollowups: {},
  cloudDistributions: {},
  revokedDeviceCodes: {},
};

export function getCloudServerState(): CloudServerState {
  try {
    const raw = localStorage.getItem(CLOUD_STORAGE_KEY);
    if (raw) {
      inMemoryCloudState = JSON.parse(raw);
    }
  } catch {
    // Fallback to in-memory
  }
  return inMemoryCloudState;
}

export function saveCloudServerState(state: CloudServerState): void {
  inMemoryCloudState = state;
  try {
    localStorage.setItem(CLOUD_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota
  }
}

export function resetCloudServerState(): void {
  inMemoryCloudState = {
    nextOfficialCodeSeq: 7,
    processedMutationIds: {},
    cloudCases: {},
    cloudFollowups: {},
    cloudDistributions: {},
    revokedDeviceCodes: {},
  };
  try {
    localStorage.removeItem(CLOUD_STORAGE_KEY);
  } catch {
    // Ignore
  }
}

export async function logAuditAction(
  entry: Omit<AuditLogEntry, 'id' | 'timestamp' | 'actor_name' | 'actor_role'>
): Promise<void> {
  const settings = (await db.app_settings.get('default')) || DEFAULT_APP_SETTINGS;
  const record: AuditLogEntry = {
    id: generateUUID(),
    timestamp: new Date().toISOString(),
    actor_name: settings.current_user_name,
    actor_role: settings.current_user_role,
    ...entry,
  };
  await db.audit_log.put(record);
}

async function enqueueOutboxMutation(
  entity_table: SyncOutboxItem['entity_table'],
  entity_id: string,
  operation: SyncOutboxItem['operation'],
  payload: Record<string, unknown>,
  field_timestamps: Record<string, string>,
  base_version: number,
  device_code = 'D1'
): Promise<SyncOutboxItem> {
  const item: SyncOutboxItem = {
    mutation_id: generateUUID(),
    entity_table,
    entity_id,
    operation,
    payload,
    field_timestamps,
    base_version,
    device_code,
    created_at: new Date().toISOString(),
    retry_count: 0,
    next_retry_at: null,
    status: 'pending',
  };
  await db.sync_outbox.put(item);
  return item;
}

export async function saveBeneficiaryCase(
  input: Partial<BeneficiaryCase> & { name: string },
  existingId?: string,
  options?: { actorName?: string; deviceCode?: string; timestampIso?: string }
): Promise<BeneficiaryCase> {
  const nowIso = options?.timestampIso || new Date().toISOString();
  const settings = (await db.app_settings.get('default')) || DEFAULT_APP_SETTINGS;
  const actorName = options?.actorName || settings.current_user_name;
  const deviceCode = options?.deviceCode || settings.device_code || 'D1';
  const vuln = calculateVulnerabilityScore(input);

  return db.transaction(
    'rw',
    [db.beneficiary_cases, db.app_settings, db.sync_outbox, db.audit_log],
    async () => {
      let existing: BeneficiaryCase | undefined;
      if (existingId) {
        existing = await db.beneficiary_cases.get(existingId);
      }

      if (existing) {
        const nextVersion = (existing.version || 1) + 1;
        const fieldTimestamps: Record<string, string> = {
          ...(existing.field_timestamps || {}),
        };
        const changedFields: string[] = [];

        const updatedRecord: BeneficiaryCase = {
          ...existing,
          ...input,
          id: existing.id,
          code: existing.code,
          temp_code: existing.temp_code,
          reg_date: toYYYYMMDD(input.reg_date || existing.reg_date),
          name: input.name.trim(),
          normalized_name: normalizeArabicText(input.name),
          national_id: (input.national_id ?? existing.national_id ?? '').trim(),
          phone: (input.phone ?? existing.phone ?? '').trim(),
          phone2: (input.phone2 ?? existing.phone2 ?? '').trim(),
          family_count: Number(input.family_count ?? existing.family_count ?? 0),
          aid_types: input.aid_types ?? existing.aid_types ?? [],
          vulnerability_score: vuln.score,
          vulnerability_breakdown: vuln.breakdown,
          anonymized_summary:
            (input.anonymized_summary || '').trim() || vuln.autoAnonymizedSummary,
          updated_at: nowIso,
          updated_by: actorName,
          version: nextVersion,
        };

        const deltaFields: Record<string, unknown> = {};
        for (const key of Object.keys(input) as Array<keyof BeneficiaryCase>) {
          if (JSON.stringify(existing[key]) !== JSON.stringify(updatedRecord[key])) {
            fieldTimestamps[key] = nowIso;
            changedFields.push(key);
            deltaFields[key] = updatedRecord[key];
          }
        }
        updatedRecord.field_timestamps = fieldTimestamps;

        await db.beneficiary_cases.put(updatedRecord);
        await enqueueOutboxMutation(
          'beneficiary_cases',
          updatedRecord.id,
          'UPDATE',
          { ...updatedRecord, _changed_fields: deltaFields },
          fieldTimestamps,
          existing.version,
          deviceCode
        );
        await logAuditAction({
          action: 'UPDATE',
          entity_type: 'case',
          entity_id: updatedRecord.id,
          entity_code: updatedRecord.code,
          summary_ar: `تعديل بيانات الحالة ${updatedRecord.code} (${updatedRecord.name})`,
          changed_fields: changedFields,
        });

        return updatedRecord;
      } else {
        const seq = settings.next_case_seq || 1;
        const id = input.id || generateUUID();
        const tempCode = input.temp_code || formatTempCaseCode(deviceCode, seq);
        const isOffline = !settings.simulated_network_online;
        const initialCode =
          input.code || (isOffline ? tempCode : formatCaseCode(seq));

        await db.app_settings.put({
          ...settings,
          next_case_seq: seq + 1,
        });

        const fieldTimestamps: Record<string, string> = {
          name: nowIso,
          status: nowIso,
          family_count: nowIso,
        };

        const newRecord: BeneficiaryCase = {
          id,
          code: initialCode,
          temp_code: tempCode,
          is_code_finalized: Boolean(input.code && !input.code.includes(`-${deviceCode}-`)),
          reg_date: toYYYYMMDD(input.reg_date),
          name: input.name.trim(),
          normalized_name: normalizeArabicText(input.name),
          national_id: (input.national_id || '').trim(),
          id_attach: input.id_attach || '',
          nationality: input.nationality || 'مصري',
          referral: input.referral || 'تقديم مباشر',
          referrer_name: input.referrer_name || '',
          referrer_phone: input.referrer_phone || '',
          referrer_org: input.referrer_org || '',
          phone: (input.phone || '').trim(),
          phone2: (input.phone2 || '').trim(),
          governorate: input.governorate,
          sub_district: input.sub_district,
          general_area:
            input.general_area ||
            (input.governorate && input.sub_district
              ? `${input.governorate} — ${input.sub_district}`
              : '6 أكتوبر — الحي الثاني'),
          address: input.address || '',
          gps_lat: input.gps_lat ?? null,
          gps_lng: input.gps_lng ?? null,
          marital: input.marital || 'متزوج',
          breadwinner: input.breadwinner || input.name.trim(),
          breadwinner_rel: input.breadwinner_rel || 'نفسه (رب الأسرة)',
          family_count: Number(input.family_count ?? 1),
          family_names: input.family_names || '',
          children_count: Number(input.children_count ?? 0),
          housing_type: input.housing_type || 'إيجار',
          income_status: input.income_status || 'دخل غير منتظم (يومية)',
          health: input.health || 'سليم',
          health_desc: input.health_desc || '',
          medical_attach: input.medical_attach || '',
          aid_cat: input.aid_cat || 'مساعدات شتوية',
          aid_types: input.aid_types || [],
          need_desc: input.need_desc || '',
          status: input.status || 'قيد الدراسة',
          disb_date: input.disb_date ? toYYYYMMDD(input.disb_date) : '',
          proof_method: input.proof_method || '',
          proof_attach: input.proof_attach || '',
          notes: input.notes || '',
          workflow_stage: input.workflow_stage || 'registered',
          approved_by: input.approved_by ?? null,
          approved_at: input.approved_at ?? null,
          vulnerability_score: vuln.score,
          vulnerability_breakdown: vuln.breakdown,
          anonymized_summary:
            (input.anonymized_summary || '').trim() || vuln.autoAnonymizedSummary,
          consent_data_processing: input.consent_data_processing ?? true,
          consent_photo_sharing: input.consent_photo_sharing ?? false,
          created_at: nowIso,
          updated_at: nowIso,
          created_by: actorName,
          updated_by: actorName,
          version: 1,
          deleted_at: null,
          field_timestamps: fieldTimestamps,
        };

        await db.beneficiary_cases.put(newRecord);
        await enqueueOutboxMutation(
          'beneficiary_cases',
          newRecord.id,
          'INSERT',
          newRecord as unknown as Record<string, unknown>,
          fieldTimestamps,
          0,
          deviceCode
        );
        await logAuditAction({
          action: 'CREATE',
          entity_type: 'case',
          entity_id: newRecord.id,
          entity_code: newRecord.code,
          summary_ar: `إضافة حالة جديدة ${newRecord.code} (${newRecord.name})`,
        });

        return newRecord;
      }
    }
  );
}

export async function softDeleteCase(caseId: string): Promise<void> {
  const nowIso = new Date().toISOString();
  const settings = (await db.app_settings.get('default')) || DEFAULT_APP_SETTINGS;

  await db.transaction(
    'rw',
    [db.beneficiary_cases, db.app_settings, db.sync_outbox, db.audit_log],
    async () => {
      const existing = await db.beneficiary_cases.get(caseId);
      if (!existing) return;
      const updated: BeneficiaryCase = {
        ...existing,
        deleted_at: nowIso,
        updated_at: nowIso,
        updated_by: settings.current_user_name,
        version: existing.version + 1,
      };
      await db.beneficiary_cases.put(updated);
      await enqueueOutboxMutation(
        'beneficiary_cases',
        caseId,
        'SOFT_DELETE',
        { deleted_at: nowIso },
        { deleted_at: nowIso },
        existing.version,
        settings.device_code
      );
      await logAuditAction({
        action: 'SOFT_DELETE',
        entity_type: 'case',
        entity_id: caseId,
        entity_code: existing.code,
        summary_ar: `نقل الحالة ${existing.code} (${existing.name}) إلى سلة المحذوفات المنطقية`,
      });
    }
  );
}

export async function addCaseFollowup(input: {
  case_id: string;
  date: string;
  ftype: FollowupRecord['ftype'];
  details: string;
  is_scheduled_visit?: boolean;
  scheduled_date?: string;
  visit_status?: FollowupRecord['visit_status'];
  gps_lat?: number | null;
  gps_lng?: number | null;
}): Promise<FollowupRecord> {
  const nowIso = new Date().toISOString();
  const settings = (await db.app_settings.get('default')) || DEFAULT_APP_SETTINGS;
  const record: FollowupRecord = {
    id: generateUUID(),
    case_id: input.case_id,
    date: toYYYYMMDD(input.date),
    ftype: input.ftype,
    details: input.details.trim(),
    is_scheduled_visit: input.is_scheduled_visit ?? false,
    scheduled_date: input.scheduled_date ? toYYYYMMDD(input.scheduled_date) : undefined,
    visit_status: input.visit_status || 'مكتملة',
    gps_lat: input.gps_lat ?? null,
    gps_lng: input.gps_lng ?? null,
    created_at: nowIso,
    updated_at: nowIso,
    created_by: settings.current_user_name,
    updated_by: settings.current_user_name,
    version: 1,
    deleted_at: null,
  };

  await db.transaction(
    'rw',
    [db.followups, db.app_settings, db.sync_outbox, db.audit_log],
    async () => {
      await db.followups.put(record);
      await enqueueOutboxMutation(
        'followups',
        record.id,
        'INSERT',
        record as unknown as Record<string, unknown>,
        { created_at: nowIso },
        0,
        settings.device_code
      );
      await logAuditAction({
        action: 'CREATE',
        entity_type: 'followup',
        entity_id: record.id,
        summary_ar: `إضافة متابعة (${record.ftype}) بتاريخ ${record.date}`,
      });
    }
  );

  return record;
}

export async function saveAttachmentRecord(input: {
  entity_type: AttachmentRecord['entity_type'];
  entity_id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  data_url: string;
  is_external_link?: boolean;
  consent_to_share?: boolean;
  is_redacted?: boolean;
  captured_gps?: string;
}): Promise<AttachmentRecord> {
  const nowIso = new Date().toISOString();
  const settings = (await db.app_settings.get('default')) || DEFAULT_APP_SETTINGS;
  const sha256_hash = await computeSHA256(input.data_url);

  const record: AttachmentRecord = {
    id: generateUUID(),
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    file_name: input.file_name,
    mime_type: input.mime_type,
    size_bytes: input.size_bytes,
    sha256_hash,
    data_url: input.data_url,
    is_external_link: input.is_external_link ?? false,
    upload_status: 'local',
    consent_to_share: input.consent_to_share ?? false,
    is_redacted: input.is_redacted ?? false,
    captured_gps: input.captured_gps,
    captured_at: nowIso,
    created_at: nowIso,
    updated_at: nowIso,
    created_by: settings.current_user_name,
    updated_by: settings.current_user_name,
    version: 1,
    deleted_at: null,
  };

  await db.transaction(
    'rw',
    [db.attachments, db.app_settings, db.sync_outbox, db.audit_log],
    async () => {
      await db.attachments.put(record);
      await enqueueOutboxMutation(
        'attachments',
        record.id,
        'INSERT',
        { ...record, data_url: '[LOCAL_BLOB_QUEUED]' },
        { created_at: nowIso },
        0,
        settings.device_code
      );
      await logAuditAction({
        action: 'CREATE',
        entity_type: 'attachment',
        entity_id: record.id,
        summary_ar: `إرفاق ملف (${record.file_name}) ببصمة SHA256: ${sha256_hash.slice(0, 10)}...`,
      });
    }
  );

  return record;
}

/**
 * Phase 3: Record an Individual or Bulk Aid Distribution (Section 4.3, Screen 6, P1.2, P2.7)
 * Generates tamper-evident SHA-256 hash, electronic signature SVG, QR verification token,
 * updates Inventory stock automatically, and syncs status='تم الصرف' back to the Case.
 */
export async function recordAidDistribution(input: {
  case_id: string;
  project_id: string;
  donor_id?: string;
  inventory_item_id?: string;
  aid_cat: string;
  aid_type: string;
  quantity: number;
  unit: string;
  financial_value: number;
  disb_date: string;
  proof_method: string;
  proof_attach: string;
  recipient_signature_svg?: string;
  proof_gps?: string;
  consent_to_share?: boolean;
  is_redacted?: boolean;
}): Promise<DistributionRecord> {
  const nowIso = new Date().toISOString();
  const settings = (await db.app_settings.get('default')) || DEFAULT_APP_SETTINGS;
  const targetCase = await db.beneficiary_cases.get(input.case_id);
  if (!targetCase) {
    throw new Error('الحالة المستفيدة غير موجودة');
  }

  const project =
    (await db.projects.get(input.project_id)) || DEFAULT_PROJECTS[0];
  const existingCount = await db.distributions.count();
  const receiptNumber = `RCP-${String(existingCount + 1).padStart(4, '0')}`;

  const defaultSignatureSvg =
    input.recipient_signature_svg ||
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 70"><path d="M20 48 Q 65 15, 110 45 T 195 32" stroke="#0B4F8A" stroke-width="3" fill="none"/></svg>`;

  const hashPayload = `${receiptNumber}|${targetCase.code}|${input.disb_date}|${input.financial_value}|${defaultSignatureSvg}|${input.proof_attach}`;
  const sha256 = await computeSHA256(hashPayload);
  const qrToken = `SANAD-VERIFY|${receiptNumber}|${targetCase.code}|${toYYYYMMDD(
    input.disb_date
  )}|SHA256:${sha256.slice(0, 12).toUpperCase()}`;

  // Resolve donor_id from project donations if not explicitly provided
  let resolvedDonorId = input.donor_id;
  if (!resolvedDonorId) {
    const projectDonation = await db.donations
      .where('project_id')
      .equals(project.id)
      .first();
    resolvedDonorId = projectDonation?.donor_id || 'donor-1';
  }

  const distRecord: DistributionRecord = {
    id: generateUUID(),
    receipt_number: receiptNumber,
    case_id: targetCase.id,
    case_code: targetCase.code,
    case_general_area: targetCase.general_area || 'القطاع الشمالي',
    case_family_count: targetCase.family_count || 1,
    case_anonymized_summary:
      targetCase.anonymized_summary ||
      `أسرة من ${targetCase.family_count} أفراد بحاجة لدعم (${input.aid_cat})`,
    project_id: project.id,
    project_name: project.name,
    donor_id: resolvedDonorId,
    inventory_item_id: input.inventory_item_id,
    aid_cat: input.aid_cat || project.target_category,
    aid_type: input.aid_type,
    quantity: Number(input.quantity) || 1,
    unit: input.unit || 'حزمة',
    financial_value: Number(input.financial_value) || 0,
    currency: settings.default_currency || 'EGP',
    disb_date: toYYYYMMDD(input.disb_date),
    proof_method: input.proof_method || 'كشف توقيع المستفيد',
    proof_attach: input.proof_attach || `signature://${receiptNumber}`,
    executed_by: settings.current_user_name,
    approved_by: targetCase.approved_by || 'أ. خالد المنشاوي (مدير النظام)',
    recipient_signature_svg: defaultSignatureSvg,
    proof_timestamp: nowIso,
    proof_gps: input.proof_gps,
    proof_file_sha256: sha256,
    qr_verification_token: qrToken,
    consent_to_share: input.consent_to_share ?? targetCase.consent_photo_sharing ?? false,
    is_redacted: input.is_redacted ?? true,
    created_at: nowIso,
    updated_at: nowIso,
    created_by: settings.current_user_name,
    updated_by: settings.current_user_name,
    version: 1,
    deleted_at: null,
  };

  await db.transaction(
    'rw',
    [
      db.distributions,
      db.beneficiary_cases,
      db.inventory_items,
      db.app_settings,
      db.sync_outbox,
      db.audit_log,
    ],
    async () => {
      await db.distributions.put(distRecord);

      // Update inventory stock if linked (P2.7)
      if (input.inventory_item_id) {
        const inv = await db.inventory_items.get(input.inventory_item_id);
        if (inv) {
          const qty = Number(input.quantity) || 1;
          await db.inventory_items.put({
            ...inv,
            qty_out: inv.qty_out + qty,
            qty_available: Math.max(0, inv.qty_available - qty),
            updated_at: nowIso,
          });
        }
      }

      // Sync latest disbursement info back to BeneficiaryCase for legacy compatibility
      await db.beneficiary_cases.update(targetCase.id, {
        status: 'تم الصرف',
        workflow_stage: 'documented',
        disb_date: distRecord.disb_date,
        proof_method: distRecord.proof_method,
        proof_attach: distRecord.proof_attach,
        updated_at: nowIso,
        version: (targetCase.version || 1) + 1,
      });

      await enqueueOutboxMutation(
        'distributions',
        distRecord.id,
        'INSERT',
        distRecord as unknown as Record<string, unknown>,
        { created_at: nowIso },
        0,
        settings.device_code
      );

      await logAuditAction({
        action: 'DISTRIBUTION_CREATED',
        entity_type: 'distribution',
        entity_id: distRecord.id,
        entity_code: distRecord.receipt_number,
        summary_ar: `تسجيل صرفية موثقة (${distRecord.receipt_number}) للحالة ${targetCase.code} بقيمة ${distRecord.financial_value} ${distRecord.currency}`,
      });
    }
  );

  return distRecord;
}

/**
 * Generates a read-only time-limited Donor Share Link (Section 8.2)
 */
export async function createDonorShareLink(
  donorId: string,
  validDays = 14
): Promise<DonorShareLinkRecord> {
  const settings = (await db.app_settings.get('default')) || DEFAULT_APP_SETTINGS;
  const donor = (await db.donors.get(donorId)) || DEFAULT_DONORS[0];
  const now = new Date();
  const expires = new Date(now.getTime() + validDays * 24 * 60 * 60 * 1000);
  const token = `shr_${donorId}_${generateUUID().replace(/-/g, '').slice(0, 16)}`;

  const link: DonorShareLinkRecord = {
    id: generateUUID(),
    token,
    donor_id: donor.id,
    donor_name: donor.name,
    expires_at: expires.toISOString(),
    revoked_at: null,
    created_by: settings.current_user_name,
    created_at: now.toISOString(),
    access_count: 0,
  };

  await db.donor_share_links.put(link);
  await logAuditAction({
    action: 'CREATE',
    entity_type: 'share_link',
    entity_id: link.id,
    summary_ar: `توليد رابط مشاركة للقراءة فقط للداعم (${donor.name}) صالح لمدة ${validDays} يوماً`,
  });
  return link;
}

/**
 * Scenario 8: Immediately revokes a Donor Share Link so any subsequent access is blocked
 */
export async function revokeDonorShareLink(tokenOrId: string): Promise<void> {
  const nowIso = new Date().toISOString();
  const byId = await db.donor_share_links.get(tokenOrId);
  const byToken =
    byId || (await db.donor_share_links.where('token').equals(tokenOrId).first());

  if (byToken) {
    await db.donor_share_links.update(byToken.id, { revoked_at: nowIso });
    await logAuditAction({
      action: 'SHARE_LINK_REVOKED',
      entity_type: 'share_link',
      entity_id: byToken.id,
      summary_ar: `إلغاء فوري لرابط المشاركة الخاص بالداعم (${byToken.donor_name}) وإيقاف الوصول`,
    });
  }
}

/**
 * Section 8.1, 8.2 & Scenarios 5, 6, 8:
 * Server-Equivalent Zero-PII Donor Portal Data Gateway with:
 * 1. Strict Donor/Project Isolation (Scenario 5: Donor A can NEVER see Donor B's projects or any Beneficiary PII)
 * 2. Immediate Share Link Revocation Check (Scenario 8)
 * 3. Small-Cell Suppression (< 5 cases grouped into 'فئات/مناطق أخرى مجمّعة لحماية الخصوصية (< 5 حالات)')
 * 4. Offline Presentation Mode snapshot compatibility (Scenario 6)
 */
export interface SanitizedDonorDistributionRow {
  id: string;
  receipt_number: string;
  disb_date: string;
  project_name: string;
  aid_cat: string;
  aid_type: string;
  quantity: number;
  unit: string;
  financial_value: number;
  currency: string;
  case_code: string; // Code ONLY, zero name/ID/phone/address!
  anonymized_summary: string; // Pre-approved safe summary
  verification_badge: string;
  qr_verification_token: string;
  sha256_short: string;
  can_show_redacted_photo: boolean;
  redacted_photo_url?: string;
}

export interface SanitizedDonorPortalResponse {
  authorized: boolean;
  error_ar?: string;
  donor?: {
    id: string;
    name: string;
    donor_type: string;
  };
  kpis?: {
    total_donated: number;
    total_spent: number;
    remaining_balance: number;
    remaining_pct: number;
    beneficiary_families_count: number;
    beneficiary_individuals_count: number;
    currency: string;
  };
  projects_flow?: Array<{
    project_id: string;
    project_name: string;
    period_label: string;
    donated_amount: number;
    spent_amount: number;
    distributions_count: number;
    families_helped: number;
  }>;
  regional_breakdown?: Array<{
    area_label: string;
    cases_count: number;
    is_suppressed_small_cell: boolean;
  }>;
  category_breakdown?: Array<{
    category_label: string;
    amount_spent: number;
    distributions_count: number;
  }>;
  anonymized_distributions?: SanitizedDonorDistributionRow[];
  approved_stories?: ImpactStoryRecord[];
}

export async function getSanitizedDonorPortalData(params: {
  donorId?: string;
  shareToken?: string;
  requestedProjectId?: string;
}): Promise<SanitizedDonorPortalResponse> {
  const settings = (await db.app_settings.get('default')) || DEFAULT_APP_SETTINGS;
  const minCell = settings.small_cell_suppression_min || 5;

  let targetDonorId = params.donorId;

  // 1. If accessed via a read-only Share Link Token, validate expiration & revocation (Scenario 8)
  if (params.shareToken) {
    const link = await db.donor_share_links
      .where('token')
      .equals(params.shareToken)
      .first();

    if (!link) {
      return {
        authorized: false,
        error_ar: 'رابط المشاركة غير صالح أو غير موجود.',
      };
    }
    if (link.revoked_at) {
      return {
        authorized: false,
        error_ar:
          'تم إلغاء صلاحية رابط المشاركة من قِبل إدارة الجمعية وتوقف الوصول فوراً (سيناريو 8).',
      };
    }
    if (new Date(link.expires_at).getTime() <= Date.now()) {
      return {
        authorized: false,
        error_ar: 'انتهت الصلاحية الزمنية لرابط المشاركة.',
      };
    }

    await db.donor_share_links.update(link.id, {
      access_count: (link.access_count || 0) + 1,
    });
    targetDonorId = link.donor_id;

    await logAuditAction({
      action: 'SHARE_LINK_ACCESS',
      entity_type: 'share_link',
      entity_id: link.id,
      summary_ar: `دخول لبوابة الداعمين عبر رابط المشاركة المؤقت للداعم (${link.donor_name})`,
    });
  }

  if (!targetDonorId) {
    return { authorized: false, error_ar: 'لم يتم تحديد حساب الداعم.' };
  }

  const donor = await db.donors.get(targetDonorId);
  if (!donor) {
    return { authorized: false, error_ar: 'بيانات الداعم غير موجودة.' };
  }

  // 2. Enforce strict server-side Project Isolation (Scenario 5: Donor cannot access unauthorized project)
  if (
    params.requestedProjectId &&
    !donor.allowed_project_ids.includes(params.requestedProjectId)
  ) {
    return {
      authorized: false,
      error_ar:
        'رفض الوصول (RLS Isolation): هذا المشروع لا يخص تبرعات حسابكم ولا تملكون صلاحية عرضه.',
    };
  }

  const allDonations = await db.donations
    .where('donor_id')
    .equals(donor.id)
    .toArray();

  const allowedProjectIds = new Set(donor.allowed_project_ids);
  const allProjects = (await db.projects.toArray()).filter((p) =>
    allowedProjectIds.has(p.id)
  );

  const donorDistributions = (
    await db.distributions.filter((d) => !d.deleted_at).toArray()
  ).filter(
    (d) =>
      d.donor_id === donor.id ||
      (allowedProjectIds.has(d.project_id) && (!d.donor_id || d.donor_id === donor.id))
  );

  // Compute KPIs
  const totalDonated = allDonations.reduce((s, d) => s + (Number(d.amount) || 0), 0);
  const totalSpent = donorDistributions.reduce(
    (s, d) => s + (Number(d.financial_value) || 0),
    0
  );
  const remainingBalance = Math.max(0, totalDonated - totalSpent);
  const remainingPct =
    totalDonated > 0 ? Math.round((remainingBalance / totalDonated) * 100) : 0;

  // Unique families & individuals helped
  const uniqueCaseMap = new Map<string, { area: string; familyCount: number }>();
  for (const dist of donorDistributions) {
    if (!uniqueCaseMap.has(dist.case_id)) {
      uniqueCaseMap.set(dist.case_id, {
        area: dist.case_general_area || 'منطقة عامة',
        familyCount: dist.case_family_count || 1,
      });
    }
  }

  const beneficiaryFamiliesCount = uniqueCaseMap.size;
  let beneficiaryIndividualsCount = 0;
  const rawAreaCounts: Record<string, number> = {};

  for (const info of uniqueCaseMap.values()) {
    beneficiaryIndividualsCount += info.familyCount;
    rawAreaCounts[info.area] = (rawAreaCounts[info.area] || 0) + 1;
  }

  // 3. Apply Small-Cell Suppression (< minCell cases merged into privacy-safe bucket)
  const regionalBreakdown: NonNullable<
    SanitizedDonorPortalResponse['regional_breakdown']
  > = [];
  let suppressedTotal = 0;

  for (const [area, count] of Object.entries(rawAreaCounts)) {
    if (count >= minCell) {
      regionalBreakdown.push({
        area_label: area,
        cases_count: count,
        is_suppressed_small_cell: false,
      });
    } else {
      suppressedTotal += count;
    }
  }
  if (suppressedTotal > 0) {
    regionalBreakdown.push({
      area_label: `مناطق مجمّعة لحماية الخصوصية (< ${minCell} حالات بالمنطقة)`,
      cases_count: suppressedTotal,
      is_suppressed_small_cell: true,
    });
  }

  // Category Breakdown
  const catMap = new Map<string, { amount: number; count: number }>();
  for (const d of donorDistributions) {
    const prev = catMap.get(d.aid_cat) || { amount: 0, count: 0 };
    prev.amount += d.financial_value;
    prev.count += 1;
    catMap.set(d.aid_cat, prev);
  }
  const categoryBreakdown = Array.from(catMap.entries()).map(([cat, v]) => ({
    category_label: cat,
    amount_spent: v.amount,
    distributions_count: v.count,
  }));

  // Projects Trace Flow: Donation -> Project -> Distributions -> Beneficiaries
  const projectsFlow = allProjects.map((p) => {
    const pDonations = allDonations
      .filter((d) => d.project_id === p.id)
      .reduce((s, d) => s + d.amount, 0);
    const pDists = donorDistributions.filter((d) => d.project_id === p.id);
    const pSpent = pDists.reduce((s, d) => s + d.financial_value, 0);
    const pFamilies = new Set(pDists.map((d) => d.case_id)).size;

    return {
      project_id: p.id,
      project_name: p.name,
      period_label: p.period_label,
      donated_amount: pDonations,
      spent_amount: pSpent,
      distributions_count: pDists.length,
      families_helped: pFamilies,
    };
  });

  // 4. Strictly Sanitized Anonymized Distributions Table (Zero PII!)
  const anonymizedDistributions: SanitizedDonorDistributionRow[] =
    donorDistributions.map((d) => {
      const canShowPhoto = Boolean(d.consent_to_share && d.is_redacted);
      return {
        id: d.id,
        receipt_number: d.receipt_number,
        disb_date: d.disb_date,
        project_name: d.project_name,
        aid_cat: d.aid_cat,
        aid_type: d.aid_type,
        quantity: d.quantity,
        unit: d.unit,
        financial_value: d.financial_value,
        currency: d.currency,
        case_code: d.case_code,
        anonymized_summary: d.case_anonymized_summary,
        verification_badge: 'موثق بتوقيع إلكتروني + بصمة SHA-256 + رمز QR',
        qr_verification_token: d.qr_verification_token,
        sha256_short: d.proof_file_sha256.slice(0, 12),
        can_show_redacted_photo: canShowPhoto,
        redacted_photo_url: canShowPhoto ? d.proof_attach : undefined,
      };
    });

  const approvedStories = (await db.impact_stories.toArray()).filter(
    (s) => s.donor_id === donor.id && s.consent_to_share && s.is_redacted
  );

  await logAuditAction({
    action: 'DONOR_PORTAL_VIEW',
    entity_type: 'donor',
    entity_id: donor.id,
    summary_ar: `عرض لوحة أثر الداعم المجهولة (${donor.name}) مع تطبيق حماية الخصوصية Small-Cell Suppression`,
  });

  return {
    authorized: true,
    donor: {
      id: donor.id,
      name: donor.name,
      donor_type: donor.donor_type,
    },
    kpis: {
      total_donated: totalDonated,
      total_spent: totalSpent,
      remaining_balance: remainingBalance,
      remaining_pct: remainingPct,
      beneficiary_families_count: beneficiaryFamiliesCount,
      beneficiary_individuals_count: beneficiaryIndividualsCount,
      currency: settings.default_currency || 'EGP',
    },
    projects_flow: projectsFlow,
    regional_breakdown: regionalBreakdown,
    category_breakdown: categoryBreakdown,
    anonymized_distributions: anonymizedDistributions,
    approved_stories: approvedStories,
  };
}

export async function approveCaseWorkflowStage(
  caseId: string,
  targetStage: WorkflowStage,
  approverUserName: string
): Promise<{ success: boolean; error_ar?: string; updatedCase?: BeneficiaryCase }> {
  const existing = await db.beneficiary_cases.get(caseId);
  if (!existing) {
    return { success: false, error_ar: 'الحالة غير موجودة.' };
  }

  if (
    targetStage === 'approved' &&
    existing.created_by.trim() === approverUserName.trim()
  ) {
    return {
      success: false,
      error_ar:
        'مبدأ العينين الأربعة (P1.3): لا يحق لمُدخل الحالة اعتمادها بنفسه؛ يجب أن يعتمدها مسؤول حالات آخر أو مدير النظام.',
    };
  }

  const mappedStatus: BeneficiaryCase['status'] =
    targetStage === 'approved'
      ? 'مقبول'
      : targetStage === 'disbursed' || targetStage === 'documented'
      ? 'تم الصرف'
      : targetStage === 'rejected'
      ? 'مرفوض'
      : 'قيد الدراسة';

  const nowIso = new Date().toISOString();
  const updated = await saveBeneficiaryCase(
    {
      name: existing.name,
      workflow_stage: targetStage,
      status: mappedStatus,
      approved_by: targetStage === 'approved' ? approverUserName : existing.approved_by,
      approved_at: targetStage === 'approved' ? nowIso : existing.approved_at,
    },
    caseId,
    { actorName: approverUserName }
  );

  await logAuditAction({
    action: 'WORKFLOW_APPROVAL',
    entity_type: 'case',
    entity_id: caseId,
    entity_code: existing.code,
    summary_ar: `انتقال سير العمل للحالة ${existing.code} إلى مرحلة (${targetStage}) بواسطة ${approverUserName}`,
  });

  return { success: true, updatedCase: updated };
}

export async function revokeTrustedDevice(
  deviceCode: string,
  reason = 'فقدان الجهاز — إبطال الجلسات والمزامنة من الإدارة'
): Promise<void> {
  const nowIso = new Date().toISOString();
  const device = await db.trusted_devices.where('device_code').equals(deviceCode).first();
  if (device) {
    await db.trusted_devices.put({
      ...device,
      status: 'revoked',
      revoked_at: nowIso,
      revoked_reason: reason,
    });
  }

  const cloud = getCloudServerState();
  cloud.revokedDeviceCodes[deviceCode] = reason;
  saveCloudServerState(cloud);

  await logAuditAction({
    action: 'DEVICE_REVOKED',
    entity_type: 'device',
    entity_id: deviceCode,
    summary_ar: `إلغاء اعتماد الجهاز (${deviceCode}) وإبطال جلساته: ${reason}`,
  });
}

export async function restoreTrustedDevice(deviceCode: string): Promise<void> {
  const device = await db.trusted_devices.where('device_code').equals(deviceCode).first();
  if (device) {
    await db.trusted_devices.put({
      ...device,
      status: 'approved',
      revoked_at: null,
      revoked_reason: undefined,
    });
  }
  const cloud = getCloudServerState();
  delete cloud.revokedDeviceCodes[deviceCode];
  saveCloudServerState(cloud);
}

export interface SyncRunResult {
  success: boolean;
  pushedCount: number;
  skippedDuplicateMutations: number;
  conflictsDetected: number;
  assignedOfficialCodes: Array<{ tempCode: string; officialCode: string }>;
  error_ar?: string;
}

export async function synchronizeWithCloud(options?: {
  simulateInterruptAfterN?: number;
}): Promise<SyncRunResult> {
  const settings = (await db.app_settings.get('default')) || DEFAULT_APP_SETTINGS;
  const cloud = getCloudServerState();

  const localDevice = await db.trusted_devices
    .where('device_code')
    .equals(settings.device_code)
    .first();

  if (
    localDevice?.status === 'revoked' ||
    cloud.revokedDeviceCodes[settings.device_code]
  ) {
    return {
      success: false,
      pushedCount: 0,
      skippedDuplicateMutations: 0,
      conflictsDetected: 0,
      assignedOfficialCodes: [],
      error_ar: `تم رفض المزامنة: الجهاز (${settings.device_code}) تم إلغاء اعتماده من الإدارة لدواعي الأمان.`,
    };
  }

  if (!settings.simulated_network_online) {
    return {
      success: false,
      pushedCount: 0,
      skippedDuplicateMutations: 0,
      conflictsDetected: 0,
      assignedOfficialCodes: [],
      error_ar: 'الجهاز يعمل حالياً في وضع عدم الاتصال (Offline).',
    };
  }

  const pendingItems = await db.sync_outbox
    .where('status')
    .anyOf(['pending', 'failed', 'in_flight'])
    .sortBy('created_at');

  let pushedCount = 0;
  let skippedDuplicateMutations = 0;
  let conflictsDetected = 0;
  const assignedOfficialCodes: Array<{ tempCode: string; officialCode: string }> = [];

  for (let idx = 0; idx < pendingItems.length; idx++) {
    if (
      options?.simulateInterruptAfterN !== undefined &&
      idx >= options.simulateInterruptAfterN
    ) {
      saveCloudServerState(cloud);
      return {
        success: false,
        pushedCount,
        skippedDuplicateMutations,
        conflictsDetected,
        assignedOfficialCodes,
        error_ar: 'انقطع الاتصال أو الطاقة أثناء المزامنة (سيتم الاستئناف تلقائياً بلا تكرار).',
      };
    }

    const item = pendingItems[idx];

    if (cloud.processedMutationIds[item.mutation_id]) {
      skippedDuplicateMutations++;
      await db.sync_outbox.update(item.mutation_id, { status: 'synced' });
      continue;
    }

    if (item.entity_table === 'beneficiary_cases') {
      const localCase = await db.beneficiary_cases.get(item.entity_id);
      const payloadCase = localCase || (item.payload as unknown as BeneficiaryCase);

      if (item.operation === 'INSERT' && payloadCase) {
        let finalCode = payloadCase.code;
        const tempCode = payloadCase.temp_code || payloadCase.code;

        const codeAlreadyTakenByOther = Object.values(cloud.cloudCases).some(
          (c) => c.id !== payloadCase.id && c.code === finalCode
        );
        const isTempFormat = /^CS-[A-Z0-9]+-\d+$/.test(finalCode);

        if (isTempFormat || codeAlreadyTakenByOther) {
          while (
            Object.values(cloud.cloudCases).some(
              (c) => c.code === formatCaseCode(cloud.nextOfficialCodeSeq)
            )
          ) {
            cloud.nextOfficialCodeSeq++;
          }
          finalCode = formatCaseCode(cloud.nextOfficialCodeSeq);
          cloud.nextOfficialCodeSeq++;
          assignedOfficialCodes.push({ tempCode, officialCode: finalCode });
        }

        const syncedCase: BeneficiaryCase = {
          ...payloadCase,
          code: finalCode,
          temp_code: tempCode,
          is_code_finalized: true,
        };

        cloud.cloudCases[syncedCase.id] = syncedCase;
        await db.beneficiary_cases.put(syncedCase);
      } else if (item.operation === 'UPDATE' && payloadCase) {
        const cloudExisting = cloud.cloudCases[item.entity_id];
        if (!cloudExisting) {
          cloud.cloudCases[item.entity_id] = payloadCase;
        } else {
          const merged: BeneficiaryCase = { ...cloudExisting };
          const incomingChanged =
            ((item.payload as Record<string, unknown>)._changed_fields as Record<
              string,
              unknown
            >) || {};
          const incomingTsMap = item.field_timestamps || {};
          const cloudTsMap = { ...(cloudExisting.field_timestamps || {}) };

          for (const field of Object.keys(incomingChanged)) {
            const incomingVal = incomingChanged[field];
            const cloudVal = (cloudExisting as unknown as Record<string, unknown>)[field];
            const incomingTs = incomingTsMap[field] || item.created_at;
            const cloudTs = cloudTsMap[field];

            if (JSON.stringify(incomingVal) === JSON.stringify(cloudVal)) {
              continue;
            }

            const cloudModifiedSameField =
              cloudExisting.version > item.base_version && Boolean(cloudTs);

            if (!cloudModifiedSameField) {
              (merged as unknown as Record<string, unknown>)[field] = incomingVal;
              cloudTsMap[field] = incomingTs;
            } else {
              const incomingWins = incomingTs >= (cloudTs || '');
              const winnerVal = incomingWins ? incomingVal : cloudVal;
              const loserVal = incomingWins ? cloudVal : incomingVal;

              (merged as unknown as Record<string, unknown>)[field] = winnerVal;
              cloudTsMap[field] = incomingWins ? incomingTs : cloudTs;

              const conflict: SyncConflictRecord = {
                id: generateUUID(),
                entity_table: 'beneficiary_cases',
                entity_id: merged.id,
                case_code: merged.code,
                case_name: merged.name,
                field_name: field,
                field_label_ar: CASE_FIELD_LABELS_AR[field] || field,
                winner_value: winnerVal,
                loser_value: loserVal,
                winner_user: incomingWins ? payloadCase.updated_by : cloudExisting.updated_by,
                loser_user: incomingWins ? cloudExisting.updated_by : payloadCase.updated_by,
                winner_device: incomingWins ? item.device_code || 'D1' : 'D2',
                loser_device: incomingWins ? 'D2' : item.device_code || 'D1',
                winner_timestamp: incomingWins ? incomingTs : cloudTs,
                loser_timestamp: incomingWins ? cloudTs : incomingTs,
                status: 'pending_review',
                detected_at: new Date().toISOString(),
              };
              await db.sync_conflicts.put(conflict);
              conflictsDetected++;
            }
          }

          merged.field_timestamps = cloudTsMap;
          merged.version = Math.max(cloudExisting.version, payloadCase.version) + 1;
          merged.updated_at = new Date().toISOString();
          cloud.cloudCases[merged.id] = merged;
          await db.beneficiary_cases.put(merged);
        }
      } else if (item.operation === 'SOFT_DELETE') {
        const cloudExisting = cloud.cloudCases[item.entity_id];
        if (cloudExisting) {
          cloudExisting.deleted_at =
            (item.payload.deleted_at as string) || new Date().toISOString();
          await db.beneficiary_cases.put(cloudExisting);
        }
      }
    } else if (item.entity_table === 'followups') {
      const fup = item.payload as unknown as FollowupRecord;
      cloud.cloudFollowups[fup.id] = fup;
    } else if (item.entity_table === 'distributions') {
      const dist = item.payload as unknown as DistributionRecord;
      cloud.cloudDistributions[dist.id] = dist;
    } else if (item.entity_table === 'attachments') {
      await db.attachments.update(item.entity_id, { upload_status: 'uploaded' });
    }

    cloud.processedMutationIds[item.mutation_id] = new Date().toISOString();
    await db.sync_outbox.update(item.mutation_id, {
      status: 'synced',
      last_error: undefined,
    });
    pushedCount++;
  }

  for (const remoteCase of Object.values(cloud.cloudCases)) {
    const local = await db.beneficiary_cases.get(remoteCase.id);
    if (!local || remoteCase.version > local.version) {
      await db.beneficiary_cases.put(remoteCase);
    }
  }
  for (const remoteFup of Object.values(cloud.cloudFollowups)) {
    const localFup = await db.followups.get(remoteFup.id);
    if (!localFup) {
      await db.followups.put(remoteFup);
    }
  }
  for (const remoteDist of Object.values(cloud.cloudDistributions)) {
    const localDist = await db.distributions.get(remoteDist.id);
    if (!localDist) {
      await db.distributions.put(remoteDist);
    }
  }

  saveCloudServerState(cloud);

  const nowIso = new Date().toISOString();
  await db.app_settings.update('default', { last_synced_at: nowIso });
  await db.trusted_devices
    .where('device_code')
    .equals(settings.device_code)
    .modify({ last_sync_at: nowIso });

  if (pushedCount > 0 || conflictsDetected > 0) {
    await logAuditAction({
      action: 'SYNC',
      entity_type: 'system',
      entity_id: 'cloud_sync',
      summary_ar: `مزامنة سحابية ناجحة: إرسال ${pushedCount} عملية، تخصيص ${assignedOfficialCodes.length} كود رسمي، ورصد ${conflictsDetected} تعارض حقول`,
    });
  }

  return {
    success: true,
    pushedCount,
    skippedDuplicateMutations,
    conflictsDetected,
    assignedOfficialCodes,
  };
}

export async function resolveSyncConflict(
  conflictId: string,
  resolution: 'keep_winner' | 'restore_loser',
  adminName: string
): Promise<void> {
  const conflict = await db.sync_conflicts.get(conflictId);
  if (!conflict) return;

  const caseRecord = await db.beneficiary_cases.get(conflict.entity_id);
  if (caseRecord && resolution === 'restore_loser') {
    await saveBeneficiaryCase(
      {
        name: caseRecord.name,
        [conflict.field_name]: conflict.loser_value,
      },
      caseRecord.id,
      { actorName: adminName }
    );
  }

  await db.sync_conflicts.update(conflictId, {
    status:
      resolution === 'keep_winner'
        ? 'resolved_keep_winner'
        : 'resolved_restore_loser',
    resolved_by: adminName,
    resolved_at: new Date().toISOString(),
  });

  await logAuditAction({
    action: 'CONFLICT_RESOLVED',
    entity_type: 'conflict',
    entity_id: conflictId,
    entity_code: conflict.case_code,
    summary_ar: `حل تعارض الحقل (${conflict.field_label_ar}) للحالة ${conflict.case_code}: ${
      resolution === 'keep_winner' ? 'اعتماد القيمة الأحدث' : 'استرجاع القيمة السابقة'
    }`,
  });
}

export async function mergeDuplicateCases(
  primaryCaseId: string,
  secondaryCaseId: string,
  adminName: string
): Promise<BeneficiaryCase | null> {
  const primary = await db.beneficiary_cases.get(primaryCaseId);
  const secondary = await db.beneficiary_cases.get(secondaryCaseId);
  if (!primary || !secondary) return null;

  const mergedAidTypes = Array.from(
    new Set([...(primary.aid_types || []), ...(secondary.aid_types || [])])
  );

  const updatedPrimary = await saveBeneficiaryCase(
    {
      name: primary.name,
      national_id: primary.national_id || secondary.national_id,
      phone: primary.phone || secondary.phone,
      phone2: primary.phone2 || secondary.phone2 || secondary.phone,
      address: primary.address || secondary.address,
      family_count: Math.max(primary.family_count, secondary.family_count),
      aid_types: mergedAidTypes,
      notes: [primary.notes, `[مدمج من ${secondary.code}]: ${secondary.notes}`]
        .filter(Boolean)
        .join(' | '),
    },
    primary.id,
    { actorName: adminName }
  );

  await db.followups
    .where('case_id')
    .equals(secondary.id)
    .modify({ case_id: primary.id });
  await db.attachments
    .where('entity_id')
    .equals(secondary.id)
    .modify({ entity_id: primary.id });

  await softDeleteCase(secondary.id);

  await logAuditAction({
    action: 'DUPLICATE_MERGED',
    entity_type: 'case',
    entity_id: primary.id,
    entity_code: primary.code,
    summary_ar: `دمج السجل المكرر (${secondary.code}) داخل البطاقة المعتمدة (${primary.code}) ونقل المتابعات`,
  });

  return updatedPrimary;
}

export async function ensureInitialDatabaseSeed(): Promise<void> {
  const existingSettings = await db.app_settings.get('default');
  if (!existingSettings) {
    await db.app_settings.put(DEFAULT_APP_SETTINGS);
  }

  if ((await db.dropdown_lists.count()) === 0) {
    await db.dropdown_lists.bulkPut(DEFAULT_DROPDOWN_LISTS);
  }
  if ((await db.users.count()) === 0) {
    await db.users.bulkPut(DEFAULT_USERS);
  } else {
    for (const u of DEFAULT_USERS) {
      const exists = await db.users.get(u.id);
      if (!exists) {
        await db.users.put(u);
      }
    }
  }
  if ((await db.trusted_devices.count()) === 0) {
    await db.trusted_devices.bulkPut(DEFAULT_TRUSTED_DEVICES);
  }
  if ((await db.donors.count()) === 0) {
    await db.donors.bulkPut(DEFAULT_DONORS);
  }
  if ((await db.projects.count()) === 0) {
    await db.projects.bulkPut(DEFAULT_PROJECTS);
  }
  if ((await db.donations.count()) === 0) {
    await db.donations.bulkPut(DEFAULT_DONATIONS);
  }
  if ((await db.inventory_items.count()) === 0) {
    await db.inventory_items.bulkPut(DEFAULT_INVENTORY_ITEMS);
  }
  if ((await db.impact_stories.count()) === 0) {
    await db.impact_stories.bulkPut(DEFAULT_IMPACT_STORIES);
  }
  if ((await db.complaints_feedback.count()) === 0) {
    await db.complaints_feedback.bulkPut(DEFAULT_COMPLAINTS);
  }

  const caseCount = await db.beneficiary_cases.count();
  if (caseCount > 0) return;

  resetCloudServerState();

  const sampleReceiptSvg =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="320" viewBox="0 0 500 320">
        <rect width="500" height="320" fill="#F8FAFC" stroke="#0B4F8A" stroke-width="4" rx="12"/>
        <text x="250" y="45" text-anchor="middle" font-family="sans-serif" font-size="20" font-weight="bold" fill="#0B4F8A">إيصال استلام مساعدات إنسانية — منظمة مشكاة للعمل الإنساني</text>
        <line x1="40" y1="65" x2="460" y2="65" stroke="#CBD5E1" stroke-width="2"/>
        <text x="450" y="105" text-anchor="end" font-family="sans-serif" font-size="16" fill="#1F2933">كود الحالة: CS-0001 | التاريخ: 2026/09/25</text>
        <text x="450" y="140" text-anchor="end" font-family="sans-serif" font-size="16" fill="#1F2933">نوع المساعدة: بطاطين / ألحفة + دفايات + سلة غذائية</text>
        <text x="450" y="175" text-anchor="end" font-family="sans-serif" font-size="16" fill="#2E9E6B">طريقة الإثبات: كشف توقيع المستفيد (موثق + مطموس الهوية)</text>
        <rect x="50" y="210" width="180" height="70" fill="#FFFFFF" stroke="#94A3B8" rx="6"/>
        <path d="M70 255 Q 110 220, 140 255 T 210 240" stroke="#0B4F8A" stroke-width="3" fill="none"/>
        <text x="140" y="298" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#52606D">توقيع المستفيد الإلكتروني</text>
      </svg>`
    );

  const seedCases: Array<Partial<BeneficiaryCase> & { name: string }> = [
    {
      code: 'CS-0001',
      temp_code: 'CS-D1-0001',
      reg_date: '2026/09/10',
      name: 'فاطمة عبد الرحمن محمود السيد',
      national_id: '02980514120045',
      nationality: 'مصري',
      referral: 'زيارة ميدانية',
      referrer_name: 'فريق المسح الميداني - القطاع الشمالي',
      referrer_phone: '01098765432',
      referrer_org: 'منظمة مشكاة للعمل الإنساني',
      phone: '01012345678',
      phone2: '01122334455',
      governorate: 'مدينة 6 أكتوبر والشيخ زايد',
      sub_district: 'الحي الثاني',
      general_area: '6 أكتوبر — الحي الثاني',
      address: 'مدينة 6 أكتوبر، الحي الثاني، المجاورة الرابعة، عمارة 12، شقة 3',
      gps_lat: 29.9723,
      gps_lng: 30.9419,
      marital: 'أرملة (تعيل أيتام)',
      breadwinner: 'فاطمة عبد الرحمن محمود',
      breadwinner_rel: 'الأم (أرملة)',
      family_count: 6,
      children_count: 4,
      family_names:
        'فاطمة عبد الرحمن (الأم 38 سنة)، يوسف (14 سنة)، مريم (11 سنة)، عمر (8 سنوات)، سلمى (5 سنوات)، الجدة أمينة (69 سنة)',
      housing_type: 'سكن غير ملائم / سقف بحاجة لعزل',
      income_status: 'معاش ضعيف',
      health: 'مرض مزمن',
      health_desc:
        'الجدة تعاني من سكري وضغط مزمن والطفل الأصغر يعاني من حساسية صدرية شديدة في الشتاء',
      aid_cat: 'مساعدات شتوية',
      aid_types: [
        'بطاطين / ألحفة',
        'فرش ومفارش (مراتب / جرايات)',
        'ملابس شتوية (أطفال / كبار)',
        'عزل سقف / مشمعات حماية من الأمطار',
      ],
      need_desc:
        'أسرة أرملة تعيل 4 أطفال أيتام وجدة مسنة، سقف المنزل الخشبي يسرب مياه الأمطار وبحاجة ماسة لعزل وبطاطين وملابس شتوية للأطفال.',
      status: 'تم الصرف',
      workflow_stage: 'documented',
      approved_by: 'أ. خالد المنشاوي (مدير النظام)',
      disb_date: '2026/09/25',
      proof_method: 'كشف توقيع المستفيد',
      proof_attach: sampleReceiptSvg,
      notes:
        'تمت الزيارة الميدانية والتحقق من الأوراق الثبوتية وتسليم حزمة الشتاء كاملة وتوقيع الإيصال.',
      consent_data_processing: true,
      consent_photo_sharing: true,
    },
    {
      code: 'CS-0002',
      temp_code: 'CS-D1-0002',
      reg_date: '2026/09/18',
      name: 'محمود أحمد حسن الكيلاني',
      national_id: '00974110234891',
      nationality: 'سوري',
      referral: 'إحالة منظمة',
      referrer_name: 'أ. سامر الخطيب',
      referrer_phone: '01234567890',
      referrer_org: 'جمعية التكافل الاجتماعي',
      phone: '01554433221',
      phone2: '01554433229',
      governorate: 'مدينة 6 أكتوبر والشيخ زايد',
      sub_district: 'بيت العيلة',
      general_area: '6 أكتوبر — بيت العيلة',
      address: 'مدينة 6 أكتوبر، مساكن بيت العيلة، عمارة 25، شقة 1',
      gps_lat: 29.9654,
      gps_lng: 30.9312,
      marital: 'متزوج',
      breadwinner: 'محمود أحمد حسن الكيلاني',
      breadwinner_rel: 'رب الأسرة (عاجز عن العمل لإصابة)',
      family_count: 5,
      children_count: 3,
      family_names:
        'محمود الكيلاني (44 سنة)، آمنة (39 سنة)، خالد (13 سنة)، لينا (9 سنوات)، ريان (4 سنوات)',
      housing_type: 'إيجار',
      income_status: 'بلا دخل (منقطع)',
      health: 'إعاقة',
      health_desc:
        'إصابة بالعمود الفقري تمنع رب الأسرة من العمل وبحاجة لجهاز تعويضي وعلاج شهري',
      aid_cat: 'طبية',
      aid_types: [
        'أدوية وعلاج طبي شهري',
        'أجهزة تعويضية / مستلزمات إعاقة',
        'مساعدات مادية',
      ],
      need_desc:
        'توقف رب الأسرة عن العمل بسبب الإصابة، وتراكم إيجار السكن لمدة شهرين مع الحاجة لعلاج شهري.',
      status: 'مقبول',
      workflow_stage: 'approved',
      approved_by: 'أ. خالد المنشاوي (مدير النظام)',
      disb_date: '',
      proof_method: '',
      proof_attach: '',
      notes: 'تم اعتماد الحالة من لجنة الحالات وجاري تجهيز الدفعة المالية والأدوية للصرف هذا الأسبوع.',
      consent_data_processing: true,
      consent_photo_sharing: false,
    },
    {
      code: 'CS-0003',
      temp_code: 'CS-D1-0003',
      reg_date: '2026/08/01',
      name: 'إبراهيم عبد الله عثمان النور',
      national_id: '04881209553120',
      nationality: 'سوداني',
      referral: 'تقديم مباشر',
      referrer_name: '',
      referrer_phone: '',
      referrer_org: '',
      phone: '01199887766',
      phone2: '',
      governorate: 'مدينة 6 أكتوبر والشيخ زايد',
      sub_district: 'مساكن أبناء الجيزة',
      general_area: '6 أكتوبر — مساكن أبناء الجيزة',
      address: 'مدينة 6 أكتوبر، مساكن أبناء الجيزة، المرحلة الأولى، بلوك 8، عقار 7',
      marital: 'يتيم / أسرة أيتام',
      breadwinner: 'إبراهيم عبد الله عثمان',
      breadwinner_rel: 'العم (وصي على أيتام)',
      family_count: 7,
      children_count: 5,
      family_names: 'إبراهيم (47 سنة)، حليمة (41 سنة)، 5 أيتام قُصّر في مراحل التعليم الأساسي',
      housing_type: 'إيواء / غرفة مشتركة',
      income_status: 'دخل غير منتظم (يومية)',
      health: 'سليم',
      health_desc: '',
      aid_cat: 'عينية',
      aid_types: ['طرد / سلة مواد غذائية', 'بطاطين / ألحفة', 'أحذية شتوية / جزم'],
      need_desc:
        'أسرة وافدة كبيرة العدد ترعى أيتاماً قُصّر، تقيم في سكن مشترك وتحتاج سلة غذائية شهرية ومستلزمات شتاء للأبناء.',
      status: 'قيد الدراسة',
      workflow_stage: 'under_review',
      disb_date: '',
      proof_method: '',
      proof_attach: '',
      notes: 'بانتظار استكمال الزيارة الميدانية لتأكيد عنوان السكن الحالي.',
      consent_data_processing: true,
      consent_photo_sharing: false,
    },
    {
      code: 'CS-0004',
      temp_code: 'CS-D1-0004',
      reg_date: '2026/09/28',
      name: 'سعاد محمد علي الشناوي',
      national_id: '02910305112233',
      nationality: 'مصري',
      referral: 'مبادرة مجتمعية',
      referrer_name: 'الحاج مصطفى عبد الفتاح',
      referrer_phone: '01005556677',
      referrer_org: 'لجنة زكاة القرية',
      phone: '01066778899',
      phone2: '',
      governorate: 'فيصل والجيزة',
      sub_district: 'شارع العشرين',
      general_area: 'فيصل — شارع العشرين',
      address: 'شارع فيصل الرئيسي، متفرع من شارع العشرين، حارة السلام، منزل 15',
      marital: 'مطلقة (تعيل أطفال)',
      breadwinner: 'سعاد محمد علي',
      breadwinner_rel: 'الأم',
      family_count: 4,
      children_count: 3,
      family_names: 'سعاد (35 سنة)، جنى (10 سنوات)، زياد (7 سنوات)، آدم (4 سنوات)',
      housing_type: 'تمليك متواضع',
      income_status: 'دخل غير منتظم (يومية)',
      health: 'احتياج خاص',
      health_desc: 'الطفل الأوسط يحتاج جلسات تخاطب وتأهيل',
      aid_cat: 'مساعدات شتوية',
      aid_types: ['دفايات / مستلزمات تدفئة', 'ملابس شتوية (أطفال / كبار)', 'طرد / سلة مواد غذائية'],
      need_desc:
        'تم صرف المساعدة الشتوية ولكن لم يرفق الباحث إيصال الاستلام بعد (لتجربة تنبيه نقص الإثبات).',
      status: 'تم الصرف',
      workflow_stage: 'disbursed',
      disb_date: '2026/10/04',
      proof_method: 'صورة استلام',
      proof_attach: '',
      notes: 'تم التسليم الفعلي بالميدان ويتبقى رفع صورة كشف التوقيع من هاتف الباحث.',
      consent_data_processing: true,
      consent_photo_sharing: true,
    },
    {
      code: 'CS-0005',
      temp_code: 'CS-D1-0005',
      reg_date: '2026/10/02',
      name: 'خليل إبراهيم خليل أبو شمالة',
      national_id: '05901122334455',
      nationality: 'فلسطيني',
      referral: 'إحالة منظمة',
      referrer_name: 'د. ناهد منصور',
      referrer_phone: '01033221100',
      referrer_org: 'مؤسسة الإغاثة الطبية',
      phone: '01077889900',
      phone2: '01077889901',
      governorate: 'فيصل والجيزة',
      sub_district: 'الطالبية فيصل',
      general_area: 'فيصل — الطالبية فيصل',
      address: 'فيصل، الطالبية، شارع حسن محمد، عقار 19، شقة 5',
      marital: 'متزوج',
      breadwinner: 'خليل إبراهيم أبو شمالة',
      breadwinner_rel: 'رب الأسرة',
      family_count: 6,
      children_count: 4,
      family_names: 'خليل (45 سنة)، هدى (40 سنة)، 4 أطفال',
      housing_type: 'إيجار',
      income_status: 'بلا دخل (منقطع)',
      health: 'مرض مزمن',
      health_desc: 'الزوجة تتلقى علاجاً دورياً للأورام',
      aid_cat: 'مادية',
      aid_types: ['مساعدات مادية', 'سهم جاهز', 'أدوية وعلاج طبي شهري'],
      need_desc:
        'أسرة نازحة بدون معيل أو دخل حالي وتحتاج كفالة علاجية ومساعدة نقدية للإيجار.',
      status: 'قيد الدراسة',
      workflow_stage: 'under_review',
      disb_date: '',
      proof_method: '',
      proof_attach: '',
      notes: 'تم فحص الأوراق الطبية وجاري العرض على لجنة الاعتماد المالي.',
      consent_data_processing: true,
      consent_photo_sharing: false,
    },
    {
      code: 'CS-0006',
      temp_code: 'CS-D1-0006',
      reg_date: '2026/09/20',
      name: 'سمير جلال عبد المقصود',
      national_id: '02850101998877',
      nationality: 'مصري',
      referral: 'تقديم مباشر',
      referrer_name: '',
      referrer_phone: '',
      referrer_org: '',
      phone: '01200112233',
      phone2: '',
      governorate: 'الهرم وحدائق الأهرام',
      sub_district: 'هضبة الأهرام (حدائق الأهرام - البوابات)',
      general_area: 'الهرم — هضبة الأهرام',
      address: 'حدائق الأهرام، البوابة الثانية (خوفو)، شارع الجيش، عمارة 40',
      marital: 'أعزب',
      breadwinner: 'سمير جلال',
      breadwinner_rel: 'نفسه',
      family_count: 1,
      children_count: 0,
      family_names: 'سمير جلال (32 سنة)',
      housing_type: 'تمليك متواضع',
      income_status: 'دخل ثابت محدود',
      health: 'سليم',
      health_desc: '',
      aid_cat: 'مادية',
      aid_types: ['مساعدات مادية'],
      need_desc:
        'طلب مساعدة مالية غير مستوفٍ لمعايير الاستحقاق لوجود دخل تأميني ثابت يتجاوز الحد.',
      status: 'مرفوض',
      workflow_stage: 'rejected',
      disb_date: '',
      proof_method: '',
      proof_attach: '',
      notes: 'تم الاعتذار للمتقدم لعدم انطباق شروط الأولوية.',
      consent_data_processing: true,
      consent_photo_sharing: false,
    },
  ];

  for (const sc of seedCases) {
    const saved = await saveBeneficiaryCase(sc, undefined, {
      actorName: 'أحمد منصور (باحث ميداني أول)',
      deviceCode: 'D1',
    });
    if (saved.code === 'CS-0001') {
      await addCaseFollowup({
        case_id: saved.id,
        date: '2026/09/15',
        ftype: 'زيارة منزلية',
        details:
          'تمت الزيارة المنزلية ومعاينة سقف المنزل والتأكد من وجود 4 أطفال أيتام وجدة مسنة.',
        visit_status: 'مكتملة',
      });
      await addCaseFollowup({
        case_id: saved.id,
        date: '2026/09/25',
        ftype: 'زيارة ميدانية',
        details:
          'تم تسليم البطاطين والدفايات ومشمعات العزل وتوقيع المستفيدة على كشف الاستلام.',
        visit_status: 'مكتملة',
      });
      // Seed initial verified distributions for CS-0001
      await recordAidDistribution({
        case_id: saved.id,
        project_id: 'project-winter-2026',
        donor_id: 'donor-1',
        inventory_item_id: 'inv-blankets',
        aid_cat: 'مساعدات شتوية',
        aid_type: 'بطاطين / ألحفة + عزل سقف + ملابس شتوية',
        quantity: 6,
        unit: 'حزمة شتوية',
        financial_value: 4500,
        disb_date: '2026/09/25',
        proof_method: 'كشف توقيع المستفيد',
        proof_attach: sampleReceiptSvg,
        consent_to_share: true,
        is_redacted: true,
      });
    } else if (saved.code === 'CS-0002') {
      await addCaseFollowup({
        case_id: saved.id,
        date: '2026/09/22',
        ftype: 'مقابلة بالمركز',
        details: 'مراجعة التقارير الطبية الأصلية واعتماد الحالة ضمن أولويات الصرف الطبي.',
        visit_status: 'مكتملة',
      });
    } else if (saved.code === 'CS-0003') {
      await addCaseFollowup({
        case_id: saved.id,
        date: '2026/08/10',
        ftype: 'اتصال هاتفي',
        details: 'تم الاتصال لتحديد موعد زيارة منزلية ولكن الهاتف كان خارج التغطية حينها.',
        visit_status: 'مكتملة',
      });
    }
  }

  await synchronizeWithCloud();
}

export async function generateBulkBenchmarkCases(targetCount = 20000): Promise<number> {
  const firstNames = [
    'محمد',
    'أحمد',
    'محمود',
    'فاطمة',
    'عائشة',
    'زينب',
    'إبراهيم',
    'مصطفى',
    'حسن',
    'خديجة',
    'مريم',
    'يوسف',
    'عمر',
    'سعاد',
    'آمنة',
  ];
  const middleNames = [
    'عبد الرحمن',
    'عبد الله',
    'علي',
    'حسين',
    'سعيد',
    'إسماعيل',
    'عثمان',
    'سليمان',
    'خليل',
    'منصور',
  ];
  const lastNames = [
    'السيد',
    'الكيلاني',
    'النور',
    'الشناوي',
    'الشامي',
    'المصري',
    'الخطيب',
    'عبد المقصود',
    'أبو زيد',
    'النجار',
  ];
  const nationalities = ['مصري', 'سوري', 'سوداني', 'فلسطيني', 'يمني'];
  const areas = [
    'القطاع الشمالي',
    'القطاع الجنوبي',
    'القطاع الشرقي',
    'القطاع الغربي',
    'منطقة المركز والقرى المجاورة',
    'القرى والأطراف النائية',
  ];
  const categories = ['مساعدات شتوية', 'عينية', 'مادية', 'طبية'];
  const statuses: Array<BeneficiaryCase['status']> = [
    'تم الصرف',
    'مقبول',
    'قيد الدراسة',
    'مرفوض',
  ];
  const referrals = ['زيارة ميدانية', 'تقديم مباشر', 'إحالة منظمة', 'مبادرة مجتمعية'];

  const settings = (await db.app_settings.get('default')) || DEFAULT_APP_SETTINGS;
  let seq = settings.next_case_seq || 7;
  const nowIso = new Date().toISOString();

  const batchSize = 2500;
  let inserted = 0;

  while (inserted < targetCount) {
    const chunkCount = Math.min(batchSize, targetCount - inserted);
    const chunk: BeneficiaryCase[] = [];

    for (let i = 0; i < chunkCount; i++) {
      const idx = seq + i;
      const fn = firstNames[idx % firstNames.length];
      const mn = middleNames[(idx * 3) % middleNames.length];
      const ln = lastNames[(idx * 7) % lastNames.length];
      const fullName = `${fn} ${mn} ${ln}`;
      const status = statuses[idx % statuses.length];
      const familyCount = (idx % 8) + 1;
      const score = 30 + ((idx * 17) % 68);
      const code = formatCaseCode(idx);

      chunk.push({
        id: `bench-${idx}`,
        code,
        temp_code: formatTempCaseCode(settings.device_code, idx),
        reg_date: `2026/0${(idx % 9) + 1}/${String((idx % 28) + 1).padStart(2, '0')}`,
        name: fullName,
        normalized_name: normalizeArabicText(fullName),
        national_id: `029${String(10000000000 + idx)}`,
        id_attach: '',
        nationality: nationalities[idx % nationalities.length],
        referral: referrals[idx % referrals.length],
        referrer_name: '',
        referrer_phone: '',
        referrer_org: '',
        phone: `010${String(10000000 + (idx % 89999999))}`,
        phone2: '',
        general_area: areas[idx % areas.length],
        address: `${areas[idx % areas.length]} - شارع رقم ${(idx % 50) + 1}`,
        gps_lat: null,
        gps_lng: null,
        marital: idx % 4 === 0 ? 'أرمل' : 'متزوج',
        breadwinner: fullName,
        breadwinner_rel: 'رب الأسرة',
        family_count: familyCount,
        family_names: `أسرة مكونة من ${familyCount} أفراد`,
        children_count: Math.max(0, familyCount - 2),
        housing_type: idx % 3 === 0 ? 'إيجار' : 'تمليك متواضع',
        income_status: 'دخل غير منتظم (يومية)',
        health: idx % 5 === 0 ? 'مرض مزمن' : 'سليم',
        health_desc: '',
        medical_attach: '',
        aid_cat: categories[idx % categories.length],
        aid_types: ['بطاطين / ألحفة', 'طرد / سلة مواد غذائية'],
        need_desc: 'حالة مسجلة ضمن اختبار الأداء القياسي لـ 20,000 سجل محلي.',
        status,
        disb_date: status === 'تم الصرف' ? '2026/09/25' : '',
        proof_method: status === 'تم الصرف' ? 'كشف توقيع المستفيد' : '',
        proof_attach: status === 'تم الصرف' ? 'link://verified-receipt' : '',
        notes: '',
        vulnerability_score: score,
        vulnerability_breakdown: [],
        anonymized_summary: `أسرة من ${familyCount} أفراد بحاجة لدعم (${categories[idx % categories.length]})`,
        consent_data_processing: true,
        consent_photo_sharing: false,
        created_at: nowIso,
        updated_at: nowIso,
        created_by: settings.current_user_name,
        updated_by: settings.current_user_name,
        version: 1,
        deleted_at: null,
      });
    }

    await db.beneficiary_cases.bulkPut(chunk);
    seq += chunkCount;
    inserted += chunkCount;
  }

  await db.app_settings.update('default', { next_case_seq: seq });
  return inserted;
}

export async function clearBenchmarkCases(): Promise<void> {
  const benchKeys = await db.beneficiary_cases
    .where('id')
    .startsWith('bench-')
    .primaryKeys();
  await db.beneficiary_cases.bulkDelete(benchKeys);
}
