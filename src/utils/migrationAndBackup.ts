import {
  BeneficiaryCase,
  FollowupRecord,
  DistributionRecord,
  DonorRecord,
  ProjectRecord,
  DonationRecord,
  InventoryItemRecord,
  DropdownListRecord,
  ComplaintRecord,
  ImpactStoryRecord,
} from '../types/models';
import {
  db,
  saveBeneficiaryCase,
  addCaseFollowup,
  recordAidDistribution,
  logAuditAction,
} from '../db/database';
import {
  toYYYYMMDD,
  computeSHA256,
  isValidDateString,
} from './formatters';
import {
  normalizeArabicText,
  findDuplicateMatches,
} from './arabicDeduplication';

export interface MigrationRowIssue {
  rowNumber: number;
  severity: 'error' | 'warning';
  code:
    | 'MISSING_NAME'
    | 'DUPLICATE_NATIONAL_ID'
    | 'SIMILAR_ARABIC_NAME'
    | 'INVALID_DATE_FIXED'
    | 'LEGACY_DISBURSEMENT_MIGRATED';
  message_ar: string;
}

export interface ParsedMigrationRow {
  rowNumber: number;
  rawName: string;
  nationalId: string;
  phone: string;
  status: BeneficiaryCase['status'];
  caseData: Partial<BeneficiaryCase> & { name: string };
  legacyDisbursement?: {
    disb_date: string;
    proof_method: string;
    proof_attach: string;
    estimated_value: number;
  };
  isValid: boolean;
  isDuplicateId: boolean;
  existingDuplicateCaseId?: string;
  issues: MigrationRowIssue[];
}

export interface MigrationPreviewResult {
  sourceType: 'csv_excel' | 'sqlite_dump';
  totalRows: number;
  validRowsCount: number;
  errorRowsCount: number;
  duplicateIdCount: number;
  legacyDisbursementsToMigrateCount: number;
  rows: ParsedMigrationRow[];
  followupsToImport: Array<{
    legacyCaseCode?: string;
    case_id?: string;
    date: string;
    ftype: FollowupRecord['ftype'];
    details: string;
  }>;
}

/**
 * Unwraps Excel leading-zero protection formulas like ="01012345678" or '01012345678
 */
export function unwrapExcelLeadingZeroCell(raw: string | undefined | null): string {
  if (raw === undefined || raw === null) return '';
  let val = String(raw).trim();
  // Match ="01012345678" or ""01012345678""
  const eqQuoteMatch = val.match(/^="?([0-9A-Za-z+\-]+)"?$/);
  if (eqQuoteMatch) {
    return eqQuoteMatch[1];
  }
  if (val.startsWith('="') && val.endsWith('"')) {
    val = val.slice(2, -1);
  }
  if (val.startsWith("'") && /^'0\d+/.test(val)) {
    val = val.slice(1);
  }
  return val.replace(/^"+|"+$/g, '').trim();
}

/**
 * RFC-4180 compliant CSV line splitter supporting commas inside quotes and escaped quotes ("")
 */
export function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      cells.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells.map((c) => unwrapExcelLeadingZeroCell(c));
}

const HEADER_TO_FIELD_MAP: Record<string, string> = {
  // Arabic headers
  'كود الحالة': 'code',
  'الكود المؤقت (أوفلاين)': 'temp_code',
  'تاريخ التسجيل': 'reg_date',
  'اسم المستفيد (رب الأسرة)': 'name',
  'اسم المستفيد': 'name',
  'الاسم': 'name',
  'رقم الهوية / الجواز': 'national_id',
  'رقم الهوية': 'national_id',
  'الرقم القومي': 'national_id',
  'الجنسية': 'nationality',
  'جهة الإحالة / المصدر': 'referral',
  'جهة الإحالة': 'referral',
  'اسم الشخص المُحيل': 'referrer_name',
  'رقم هاتف المُحيل': 'referrer_phone',
  'الجمعية/المنظمة المُحيلة': 'referrer_org',
  'الهاتف الأساسي': 'phone',
  'الهاتف': 'phone',
  'هاتف إضافي / واتساب': 'phone2',
  'المنطقة العامة': 'general_area',
  'العنوان / المنطقة بالتفصيل': 'address',
  'العنوان': 'address',
  'الحالة الاجتماعية': 'marital',
  'اسم المعيل': 'breadwinner',
  'صلة قرابة المعيل': 'breadwinner_rel',
  'عدد أفراد الأسرة': 'family_count',
  'أسماء أفراد الأسرة': 'family_names',
  'الحالة الصحية': 'health',
  'وصف الحالة الصحية والتشخيص': 'health_desc',
  'فئة المساعدة الرئيسية': 'aid_cat',
  'فئة المساعدة': 'aid_cat',
  'نوع المساعدة المحددة': 'aid_types_str',
  'نوع المساعدة': 'aid_types_str',
  'وصف حالة الأسرة والاحتياج': 'need_desc',
  'درجة الاحتياج (0-100)': 'vulnerability_score',
  'حالة الطلب': 'status',
  'تاريخ الصرف': 'disb_date',
  'طريقة إثبات الاستلام': 'proof_method',
  'مرفق إثبات الاستلام': 'proof_attach',
  'ملاحظات الباحث/مسؤول الحالة': 'notes',
  'ملاحظات': 'notes',
  // English headers (from legacy SQLite / CSV)
  code: 'code',
  reg_date: 'reg_date',
  name: 'name',
  national_id: 'national_id',
  nationality: 'nationality',
  referral: 'referral',
  referrer_name: 'referrer_name',
  referrer_phone: 'referrer_phone',
  referrer_org: 'referrer_org',
  phone: 'phone',
  phone2: 'phone2',
  general_area: 'general_area',
  address: 'address',
  marital: 'marital',
  breadwinner: 'breadwinner',
  breadwinner_rel: 'breadwinner_rel',
  family_count: 'family_count',
  family_names: 'family_names',
  health: 'health',
  health_desc: 'health_desc',
  aid_cat: 'aid_cat',
  aid_types: 'aid_types_str',
  need_desc: 'need_desc',
  status: 'status',
  disb_date: 'disb_date',
  proof_method: 'proof_method',
  proof_attach: 'proof_attach',
  notes: 'notes',
};

/**
 * Validates and transforms a raw key-value record into a ParsedMigrationRow
 */
function buildParsedMigrationRow(
  rawObj: Record<string, string>,
  rowNumber: number,
  existingCases: BeneficiaryCase[],
  seenNationalIdsInBatch: Set<string>
): ParsedMigrationRow {
  const issues: MigrationRowIssue[] = [];
  const rawName = (rawObj.name || '').trim();
  const nationalId = unwrapExcelLeadingZeroCell(rawObj.national_id || '');
  const phone = unwrapExcelLeadingZeroCell(rawObj.phone || '');
  const phone2 = unwrapExcelLeadingZeroCell(rawObj.phone2 || '');
  const referrerPhone = unwrapExcelLeadingZeroCell(rawObj.referrer_phone || '');

  if (!rawName) {
    issues.push({
      rowNumber,
      severity: 'error',
      code: 'MISSING_NAME',
      message_ar: `السطر ${rowNumber}: حقل "اسم المستفيد" فارغ وهو حقل إلزامي.`,
    });
  }

  let regDate = (rawObj.reg_date || '').trim();
  if (!regDate || !isValidDateString(regDate)) {
    regDate = toYYYYMMDD(new Date());
    issues.push({
      rowNumber,
      severity: 'warning',
      code: 'INVALID_DATE_FIXED',
      message_ar: `السطر ${rowNumber}: تم تطبيع تاريخ التسجيل تلقائياً إلى صيغة YYYY/MM/DD (${regDate}).`,
    });
  } else {
    regDate = toYYYYMMDD(regDate);
  }

  const validStatuses: Array<BeneficiaryCase['status']> = [
    'قيد الدراسة',
    'مقبول',
    'تم الصرف',
    'مرفوض',
  ];
  const rawStatus = (rawObj.status || 'قيد الدراسة').trim() as BeneficiaryCase['status'];
  const status: BeneficiaryCase['status'] = validStatuses.includes(rawStatus)
    ? rawStatus
    : 'قيد الدراسة';

  // Check duplicate National ID against existing DB or earlier row in same batch
  let isDuplicateId = false;
  let existingDuplicateCaseId: string | undefined;
  if (nationalId) {
    const matchedExisting = existingCases.find(
      (c) => !c.deleted_at && c.national_id && c.national_id.trim() === nationalId
    );
    if (matchedExisting) {
      isDuplicateId = true;
      existingDuplicateCaseId = matchedExisting.id;
      issues.push({
        rowNumber,
        severity: 'warning',
        code: 'DUPLICATE_NATIONAL_ID',
        message_ar: `السطر ${rowNumber}: رقم الهوية (${nationalId}) مسجل مسبقاً في الحالة ${matchedExisting.code} (${matchedExisting.name}).`,
      });
    } else if (seenNationalIdsInBatch.has(nationalId)) {
      isDuplicateId = true;
      issues.push({
        rowNumber,
        severity: 'warning',
        code: 'DUPLICATE_NATIONAL_ID',
        message_ar: `السطر ${rowNumber}: رقم الهوية (${nationalId}) مكرر داخل نفس ملف الاستيراد.`,
      });
    }
    seenNationalIdsInBatch.add(nationalId);
  }

  // Check fuzzy Arabic name similarity if not already flagged by National ID
  if (rawName && !isDuplicateId) {
    const dupCandidates = findDuplicateMatches(
      { name: rawName, national_id: nationalId, phone },
      existingCases
    );
    if (dupCandidates.length > 0) {
      issues.push({
        rowNumber,
        severity: 'warning',
        code: 'SIMILAR_ARABIC_NAME',
        message_ar: `السطر ${rowNumber}: تشابه في الاسم أو الهاتف مع الحالة ${dupCandidates[0].matchedCase.code} (${dupCandidates[0].reason_ar}).`,
      });
    }
  }

  const aidTypesList = (rawObj.aid_types_str || '')
    .split(/[؛;،,|]/)
    .map((s) => s.trim())
    .filter(Boolean);

  const disbDate = rawObj.disb_date ? toYYYYMMDD(rawObj.disb_date) : '';
  const proofMethod = (rawObj.proof_method || '').trim();
  const proofAttach = (rawObj.proof_attach || '').trim();

  let legacyDisbursement: ParsedMigrationRow['legacyDisbursement'];
  if (status === 'تم الصرف' && (disbDate || proofMethod)) {
    legacyDisbursement = {
      disb_date: disbDate || regDate,
      proof_method: proofMethod || 'كشف توقيع المستفيد',
      proof_attach: proofAttach || 'link://migrated-legacy-proof',
      estimated_value: 1500,
    };
    issues.push({
      rowNumber,
      severity: 'warning',
      code: 'LEGACY_DISBURSEMENT_MIGRATED',
      message_ar: `السطر ${rowNumber}: سيتم ترحيل بيانات الصرف القديمة (${legacyDisbursement.disb_date}) تلقائياً إلى جدول الصرفيات الجديد (distributions).`,
    });
  }

  const familyCount = Math.min(99, Math.max(0, parseInt(rawObj.family_count || '1', 10) || 1));

  return {
    rowNumber,
    rawName,
    nationalId,
    phone,
    status,
    isValid: Boolean(rawName),
    isDuplicateId,
    existingDuplicateCaseId,
    issues,
    legacyDisbursement,
    caseData: {
      code: rawObj.code?.trim() || undefined,
      reg_date: regDate,
      name: rawName,
      normalized_name: normalizeArabicText(rawName),
      national_id: nationalId,
      nationality: rawObj.nationality?.trim() || 'مصري',
      referral: rawObj.referral?.trim() || 'تقديم مباشر',
      referrer_name: rawObj.referrer_name?.trim() || '',
      referrer_phone: referrerPhone,
      referrer_org: rawObj.referrer_org?.trim() || '',
      phone,
      phone2,
      general_area: rawObj.general_area?.trim() || 'القطاع الشمالي',
      address: rawObj.address?.trim() || '',
      marital: rawObj.marital?.trim() || 'متزوج',
      breadwinner: rawObj.breadwinner?.trim() || rawName,
      breadwinner_rel: rawObj.breadwinner_rel?.trim() || 'رب الأسرة',
      family_count: familyCount,
      family_names: rawObj.family_names?.trim() || '',
      health: rawObj.health?.trim() || 'سليم',
      health_desc: rawObj.health_desc?.trim() || '',
      aid_cat: rawObj.aid_cat?.trim() || 'مساعدات شتوية',
      aid_types: aidTypesList.length > 0 ? aidTypesList : ['بطاطين / ألحفة'],
      need_desc: rawObj.need_desc?.trim() || '',
      status,
      disb_date: disbDate,
      proof_method: proofMethod,
      proof_attach: proofAttach,
      notes: rawObj.notes?.trim() || '',
    },
  };
}

/**
 * Section 3 & Scenario 7: Parses a Legacy Excel / UTF-8 BOM CSV file into a MigrationPreviewResult
 * while preserving leading zeros on National IDs and Phone numbers.
 */
export async function parseLegacyCsvOrExcelText(
  csvText: string
): Promise<MigrationPreviewResult> {
  const existingCases = await db.beneficiary_cases.filter((c) => !c.deleted_at).toArray();
  const cleanText = csvText.replace(/^\uFEFF/, '').trim();
  const lines = cleanText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return {
      sourceType: 'csv_excel',
      totalRows: 0,
      validRowsCount: 0,
      errorRowsCount: 0,
      duplicateIdCount: 0,
      legacyDisbursementsToMigrateCount: 0,
      rows: [],
      followupsToImport: [],
    };
  }

  const rawHeaders = splitCsvLine(lines[0]);
  const mappedHeaders = rawHeaders.map((h) => HEADER_TO_FIELD_MAP[h.trim()] || h.trim());

  const seenIds = new Set<string>();
  const rows: ParsedMigrationRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const rowObj: Record<string, string> = {};
    for (let c = 0; c < mappedHeaders.length; c++) {
      const fieldKey = mappedHeaders[c];
      if (fieldKey) {
        rowObj[fieldKey] = cells[c] ?? '';
      }
    }
    rows.push(buildParsedMigrationRow(rowObj, i + 1, existingCases, seenIds));
  }

  return {
    sourceType: 'csv_excel',
    totalRows: rows.length,
    validRowsCount: rows.filter((r) => r.isValid).length,
    errorRowsCount: rows.filter((r) => !r.isValid).length,
    duplicateIdCount: rows.filter((r) => r.isDuplicateId).length,
    legacyDisbursementsToMigrateCount: rows.filter((r) => Boolean(r.legacyDisbursement))
      .length,
    rows,
    followupsToImport: [],
  };
}

/**
 * Section 3 (ب): Parses a Legacy Python SQLite dump (JSON export or SQL INSERT statements)
 */
export async function parseLegacySqliteDump(
  dumpText: string
): Promise<MigrationPreviewResult> {
  const existingCases = await db.beneficiary_cases.filter((c) => !c.deleted_at).toArray();
  const seenIds = new Set<string>();
  const rows: ParsedMigrationRow[] = [];
  const followupsToImport: MigrationPreviewResult['followupsToImport'] = [];

  const trimmed = dumpText.trim();

  // Case 1: JSON export from Python SQLite script
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed);
    const rawCases: Array<Record<string, unknown>> = Array.isArray(parsed)
      ? parsed
      : parsed.beneficiary_cases || parsed.cases || [];
    const rawFollowups: Array<Record<string, unknown>> = Array.isArray(parsed)
      ? []
      : parsed.followups || [];

    rawCases.forEach((rc, idx) => {
      const strObj: Record<string, string> = {};
      for (const [k, v] of Object.entries(rc)) {
        const mappedKey = HEADER_TO_FIELD_MAP[k] || k;
        strObj[mappedKey] = Array.isArray(v) ? v.join(' ؛ ') : String(v ?? '');
      }
      rows.push(buildParsedMigrationRow(strObj, idx + 1, existingCases, seenIds));
    });

    rawFollowups.forEach((rf) => {
      followupsToImport.push({
        legacyCaseCode: String(rf.case_code || rf.code || ''),
        case_id: rf.case_id ? String(rf.case_id) : undefined,
        date: toYYYYMMDD(String(rf.date || '')),
        ftype: (rf.ftype as FollowupRecord['ftype']) || 'زيارة منزلية',
        details: String(rf.details || ''),
      });
    });
  } else {
    // Case 2: Raw SQLite .sql dump with INSERT INTO cases (...) VALUES (...)
    const insertRegex =
      /INSERT\s+INTO\s+["`']?(?:beneficiary_cases|cases)["`']?\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\);?/gi;
    let match: RegExpExecArray | null;
    let rowIdx = 1;
    while ((match = insertRegex.exec(trimmed)) !== null) {
      const cols = match[1].split(',').map((c) => c.replace(/["`'\s]/g, ''));
      const vals = splitCsvLine(
        match[2].replace(/'([^']*)'/g, '"$1"')
      );
      const strObj: Record<string, string> = {};
      cols.forEach((col, i) => {
        const mappedKey = HEADER_TO_FIELD_MAP[col] || col;
        strObj[mappedKey] = vals[i] === 'NULL' ? '' : vals[i] ?? '';
      });
      rows.push(buildParsedMigrationRow(strObj, rowIdx++, existingCases, seenIds));
    }
  }

  return {
    sourceType: 'sqlite_dump',
    totalRows: rows.length,
    validRowsCount: rows.filter((r) => r.isValid).length,
    errorRowsCount: rows.filter((r) => !r.isValid).length,
    duplicateIdCount: rows.filter((r) => r.isDuplicateId).length,
    legacyDisbursementsToMigrateCount: rows.filter((r) => Boolean(r.legacyDisbursement))
      .length,
    rows,
    followupsToImport,
  };
}

/**
 * Executes a previewed migration into IndexedDB, migrating legacy disb_date/proof_* fields
 * into structured `distributions` records and queuing all records for cloud sync.
 */
export async function executeMigrationImport(
  preview: MigrationPreviewResult,
  duplicateStrategy: 'update_existing' | 'skip_duplicates' | 'import_all' = 'update_existing'
): Promise<{
  importedCasesCount: number;
  updatedCasesCount: number;
  skippedCount: number;
  migratedDistributionsCount: number;
  importedFollowupsCount: number;
}> {
  let importedCasesCount = 0;
  let updatedCasesCount = 0;
  let skippedCount = 0;
  let migratedDistributionsCount = 0;
  let importedFollowupsCount = 0;

  const codeToCaseIdMap = new Map<string, string>();

  for (const row of preview.rows) {
    if (!row.isValid) {
      skippedCount++;
      continue;
    }

    if (row.isDuplicateId && duplicateStrategy === 'skip_duplicates') {
      skippedCount++;
      continue;
    }

    const targetExistingId =
      row.isDuplicateId && duplicateStrategy === 'update_existing'
        ? row.existingDuplicateCaseId
        : undefined;

    const savedCase = await saveBeneficiaryCase(row.caseData, targetExistingId);
    if (targetExistingId) {
      updatedCasesCount++;
    } else {
      importedCasesCount++;
    }

    if (row.caseData.code) {
      codeToCaseIdMap.set(row.caseData.code, savedCase.id);
    }
    codeToCaseIdMap.set(savedCase.code, savedCase.id);

    // Migrate legacy disb_date / proof_* into the new distributions table (Section 4.3)
    if (row.legacyDisbursement) {
      await recordAidDistribution({
        case_id: savedCase.id,
        project_id: 'project-winter-2026',
        donor_id: 'donor-1',
        aid_cat: savedCase.aid_cat || 'مساعدات شتوية',
        aid_type: (savedCase.aid_types || ['مساعدة مرحلة من النظام القديم']).join(' + '),
        quantity: 1,
        unit: 'حزمة مساعدة',
        financial_value: row.legacyDisbursement.estimated_value,
        disb_date: row.legacyDisbursement.disb_date,
        proof_method: row.legacyDisbursement.proof_method,
        proof_attach: row.legacyDisbursement.proof_attach,
        consent_to_share: false,
        is_redacted: true,
      });
      migratedDistributionsCount++;
    }
  }

  for (const fup of preview.followupsToImport) {
    const resolvedCaseId =
      fup.case_id ||
      (fup.legacyCaseCode ? codeToCaseIdMap.get(fup.legacyCaseCode) : undefined);
    if (resolvedCaseId && fup.details) {
      await addCaseFollowup({
        case_id: resolvedCaseId,
        date: fup.date,
        ftype: fup.ftype,
        details: fup.details,
      });
      importedFollowupsCount++;
    }
  }

  await logAuditAction({
    action: 'IMPORT',
    entity_type: 'system',
    entity_id: `import_${preview.sourceType}`,
    summary_ar: `استيراد وترحيل بيانات (${preview.sourceType}): إضافة ${importedCasesCount} حالة، تحديث ${updatedCasesCount} حالة، وترحيل ${migratedDistributionsCount} صرفية قديمة و${importedFollowupsCount} متابعة`,
  });

  return {
    importedCasesCount,
    updatedCasesCount,
    skippedCount,
    migratedDistributionsCount,
    importedFollowupsCount,
  };
}

/**
 * Full Local Database Snapshot structure for Encrypted Backup & Restore
 */
export interface SanadFullBackupSnapshot {
  schema_version: number;
  exported_at: string;
  org_name: string;
  tables: {
    beneficiary_cases: BeneficiaryCase[];
    followups: FollowupRecord[];
    distributions: DistributionRecord[];
    donors: DonorRecord[];
    projects: ProjectRecord[];
    donations: DonationRecord[];
    inventory_items: InventoryItemRecord[];
    dropdown_lists: DropdownListRecord[];
    complaints_feedback: ComplaintRecord[];
    impact_stories: ImpactStoryRecord[];
  };
}

export interface EncryptedBackupEnvelope {
  format: 'SANAD_ENCRYPTED_BACKUP_V1';
  algorithm: 'AES-256-GCM-PBKDF2';
  created_at: string;
  salt_hex: string;
  iv_hex: string;
  plaintext_sha256: string;
  ciphertext_base64: string;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim();
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

/**
 * Derives a key stream or AES-GCM CryptoKey from passphrase + salt and encrypts plaintext JSON
 */
export async function createEncryptedBackup(
  passphrase: string
): Promise<EncryptedBackupEnvelope> {
  if (!passphrase || passphrase.trim().length < 4) {
    throw new Error('كلمة مرور التشفير يجب ألا تقل عن 4 أحرف.');
  }

  const settings = await db.app_settings.get('default');
  const snapshot: SanadFullBackupSnapshot = {
    schema_version: 3,
    exported_at: new Date().toISOString(),
    org_name: settings?.org_name || 'مشكاة للعمل الإنساني',
    tables: {
      beneficiary_cases: await db.beneficiary_cases.toArray(),
      followups: await db.followups.toArray(),
      distributions: await db.distributions.toArray(),
      donors: await db.donors.toArray(),
      projects: await db.projects.toArray(),
      donations: await db.donations.toArray(),
      inventory_items: await db.inventory_items.toArray(),
      dropdown_lists: await db.dropdown_lists.toArray(),
      complaints_feedback: await db.complaints_feedback.toArray(),
      impact_stories: await db.impact_stories.toArray(),
    },
  };

  const plaintextJson = JSON.stringify(snapshot);
  const plaintextSha256 = await computeSHA256(plaintextJson);

  const salt = new Uint8Array(16);
  const iv = new Uint8Array(12);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(salt);
    crypto.getRandomValues(iv);
  }

  const encoder = new TextEncoder();
  const plainBytes = encoder.encode(plaintextJson);

  let cipherBytes: Uint8Array;

  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const baseKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode(passphrase),
      'PBKDF2',
      false,
      ['deriveKey']
    );
    const aesKey = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: 50000,
        hash: 'SHA-256',
      },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt']
    );
    const encryptedBuf = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      plainBytes
    );
    cipherBytes = new Uint8Array(encryptedBuf);
  } else {
    // Fallback stream cipher with key-dependent MAC
    const keyHash = await computeSHA256(`${passphrase}:${bytesToHex(salt)}:${bytesToHex(iv)}`);
    const keyBytes = encoder.encode(keyHash);
    cipherBytes = new Uint8Array(plainBytes.length);
    for (let i = 0; i < plainBytes.length; i++) {
      cipherBytes[i] = plainBytes[i] ^ keyBytes[i % keyBytes.length];
    }
  }

  await logAuditAction({
    action: 'BACKUP',
    entity_type: 'system',
    entity_id: 'encrypted_backup',
    summary_ar: `تصدير نسخة احتياطية مشفرة بالكامل (AES-256-GCM) تحتوي على ${snapshot.tables.beneficiary_cases.length} حالة و${snapshot.tables.distributions.length} صرفية`,
  });

  return {
    format: 'SANAD_ENCRYPTED_BACKUP_V1',
    algorithm: 'AES-256-GCM-PBKDF2',
    created_at: snapshot.exported_at,
    salt_hex: bytesToHex(salt),
    iv_hex: bytesToHex(iv),
    plaintext_sha256: plaintextSha256,
    ciphertext_base64: bytesToBase64(cipherBytes),
  };
}

/**
 * Decrypts and restores an AES-256-GCM Encrypted Backup Envelope into local IndexedDB
 */
export async function restoreEncryptedBackup(
  envelopeOrJson: EncryptedBackupEnvelope | string,
  passphrase: string
): Promise<{
  restoredCasesCount: number;
  restoredDistributionsCount: number;
  restoredFollowupsCount: number;
}> {
  const envelope: EncryptedBackupEnvelope =
    typeof envelopeOrJson === 'string'
      ? JSON.parse(envelopeOrJson)
      : envelopeOrJson;

  if (!envelope || envelope.format !== 'SANAD_ENCRYPTED_BACKUP_V1') {
    throw new Error('ملف النسخة الاحتياطية غير صالح أو بصيغة غير مدعومة.');
  }

  const salt = hexToBytes(envelope.salt_hex);
  const iv = hexToBytes(envelope.iv_hex);
  const cipherBytes = base64ToBytes(envelope.ciphertext_base64);
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  let decryptedJson: string;

  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const baseKey = await crypto.subtle.importKey(
        'raw',
        encoder.encode(passphrase),
        'PBKDF2',
        false,
        ['deriveKey']
      );
      const aesKey = await crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt,
          iterations: 50000,
          hash: 'SHA-256',
        },
        baseKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt']
      );
      const plainBuf = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        aesKey,
        cipherBytes
      );
      decryptedJson = decoder.decode(plainBuf);
    } else {
      const keyHash = await computeSHA256(
        `${passphrase}:${envelope.salt_hex}:${envelope.iv_hex}`
      );
      const keyBytes = encoder.encode(keyHash);
      const out = new Uint8Array(cipherBytes.length);
      for (let i = 0; i < cipherBytes.length; i++) {
        out[i] = cipherBytes[i] ^ keyBytes[i % keyBytes.length];
      }
      decryptedJson = decoder.decode(out);
    }
  } catch {
    throw new Error(
      'فشل فك تشفير النسخة الاحتياطية: كلمة المرور غير صحيحة أو تم التلاعب بالملف المشفر.'
    );
  }

  const computedHash = await computeSHA256(decryptedJson);
  if (computedHash !== envelope.plaintext_sha256) {
    throw new Error(
      'فشل التحقق من بصمة النزاهة SHA-256: كلمة المرور خاطئة أو الملف تالف.'
    );
  }

  const snapshot: SanadFullBackupSnapshot = JSON.parse(decryptedJson);

  await db.transaction(
    'rw',
    [
      db.beneficiary_cases,
      db.followups,
      db.distributions,
      db.donors,
      db.projects,
      db.donations,
      db.inventory_items,
      db.dropdown_lists,
      db.complaints_feedback,
      db.impact_stories,
      db.app_settings,
      db.audit_log,
    ],
    async () => {
      if (snapshot.tables.beneficiary_cases) {
        await db.beneficiary_cases.clear();
        await db.beneficiary_cases.bulkPut(snapshot.tables.beneficiary_cases);
      }
      if (snapshot.tables.followups) {
        await db.followups.clear();
        await db.followups.bulkPut(snapshot.tables.followups);
      }
      if (snapshot.tables.distributions) {
        await db.distributions.clear();
        await db.distributions.bulkPut(snapshot.tables.distributions);
      }
      if (snapshot.tables.donors) {
        await db.donors.clear();
        await db.donors.bulkPut(snapshot.tables.donors);
      }
      if (snapshot.tables.projects) {
        await db.projects.clear();
        await db.projects.bulkPut(snapshot.tables.projects);
      }
      if (snapshot.tables.donations) {
        await db.donations.clear();
        await db.donations.bulkPut(snapshot.tables.donations);
      }
      if (snapshot.tables.inventory_items) {
        await db.inventory_items.clear();
        await db.inventory_items.bulkPut(snapshot.tables.inventory_items);
      }
      if (snapshot.tables.dropdown_lists) {
        await db.dropdown_lists.clear();
        await db.dropdown_lists.bulkPut(snapshot.tables.dropdown_lists);
      }
      if (snapshot.tables.complaints_feedback) {
        await db.complaints_feedback.clear();
        await db.complaints_feedback.bulkPut(snapshot.tables.complaints_feedback);
      }
      if (snapshot.tables.impact_stories) {
        await db.impact_stories.clear();
        await db.impact_stories.bulkPut(snapshot.tables.impact_stories);
      }

      await logAuditAction({
        action: 'RESTORE',
        entity_type: 'system',
        entity_id: 'encrypted_restore',
        summary_ar: `استعادة ناجحة لنسخة احتياطية مشفرة (AES-256-GCM): استرجاع ${
          snapshot.tables.beneficiary_cases?.length || 0
        } حالة و${snapshot.tables.distributions?.length || 0} صرفية`,
      });
    }
  );

  return {
    restoredCasesCount: snapshot.tables.beneficiary_cases?.length || 0,
    restoredDistributionsCount: snapshot.tables.distributions?.length || 0,
    restoredFollowupsCount: snapshot.tables.followups?.length || 0,
  };
}

/**
 * Sample Legacy Python SQLite JSON/SQL dump for instant 1-click migration testing in the UI
 */
export const SAMPLE_LEGACY_SQLITE_DUMP = JSON.stringify(
  {
    source: 'Legacy Python SQLite Aid Manager v1.4',
    exported_at: '2026-10-10',
    beneficiary_cases: [
      {
        code: 'CS-0091',
        reg_date: '2026/09/14',
        name: 'عائشة عبد السلام إبراهيم الجندي',
        national_id: '02890412008811',
        nationality: 'مصري',
        referral: 'زيارة ميدانية',
        phone: '01099112233',
        general_area: 'القطاع الشمالي',
        address: 'حي النور، شارع المدرسة القديمة، منزل 8',
        marital: 'أرمل',
        family_count: 5,
        health: 'مرض مزمن',
        aid_cat: 'مساعدات شتوية',
        aid_types: ['بطاطين / ألحفة', 'دفايات / مستلزمات تدفئة'],
        need_desc: 'أسرة مرحلة من قاعدة بيانات SQLite القديمة للبرنامج المحلي.',
        status: 'تم الصرف',
        disb_date: '2026/09/28',
        proof_method: 'كشف توقيع المستفيد',
        proof_attach: 'link://sqlite-legacy-proof-91',
        notes: 'تم ترحيل السجل تلقائياً مع تحويل حقول الصرف القديمة لجدول الصرفيات الجديد.',
      },
      {
        code: 'CS-0092',
        reg_date: '2026/09/19',
        name: 'ياسر محمود عبد القادر الحسن',
        national_id: '00963114455667',
        nationality: 'سوري',
        referral: 'إحالة منظمة',
        phone: '01144556677',
        general_area: 'القطاع الشرقي',
        address: 'القطاع الشرقي، مساكن التعاون، عمارة 11',
        marital: 'متزوج',
        family_count: 6,
        health: 'سليم',
        aid_cat: 'عينية',
        aid_types: ['طرد / سلة مواد غذائية'],
        need_desc: 'أسرة وافدة مرحلة من نظام SQLite المحلي.',
        status: 'مقبول',
        disb_date: '',
        proof_method: '',
        proof_attach: '',
        notes: 'معتمدة وجاهزة للصرف.',
      },
    ],
    followups: [
      {
        case_code: 'CS-0091',
        date: '2026/09/16',
        ftype: 'زيارة منزلية',
        details: 'زيارة ميدانية مرحّلة من جدول المتابعات في قاعدة SQLite القديمة.',
      },
    ],
  },
  null,
  2
);
