import { describe, it, expect, beforeEach } from 'vitest';
import {
  db,
  ensureInitialDatabaseSeed,
  resetCloudServerState,
} from '../db/database';
import { buildCasesCsvWithBom } from '../utils/csvExport';
import {
  parseLegacyCsvOrExcelText,
  parseLegacySqliteDump,
  executeMigrationImport,
  createEncryptedBackup,
  restoreEncryptedBackup,
  SAMPLE_LEGACY_SQLITE_DUMP,
} from '../utils/migrationAndBackup';
import { BeneficiaryCase } from '../types/models';

describe('Phase 4: Smart Legacy Migration (Excel/CSV & Python SQLite) & AES-256-GCM Encrypted Backup', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    resetCloudServerState();
    await ensureInitialDatabaseSeed();
  });

  it('1. Scenario 7: Exports 100 Arabic cases with leading-zero National IDs & Phones to UTF-8 BOM CSV and re-imports 100% intact', async () => {
    const generatedCases: BeneficiaryCase[] = [];
    for (let i = 1; i <= 100; i++) {
      const padded = String(i).padStart(4, '0');
      generatedCases.push({
        id: `test-100-${i}`,
        code: `CS-${padded}`,
        reg_date: '2026/10/01',
        name: `مستفيد اختبار رقم ${i} عبد الرحمن`,
        normalized_name: `مستفيد اختبار رقم ${i} عبد الرحمن`,
        national_id: `0298051400${padded}`, // Leading zero National ID
        id_attach: '',
        nationality: 'مصري',
        referral: 'زيارة ميدانية',
        referrer_name: '',
        referrer_phone: `0120000${padded}`,
        referrer_org: '',
        phone: `0101234${padded}`, // Leading zero Phone
        phone2: `0119876${padded}`,
        general_area: 'القطاع الشمالي',
        address: `حي السلام شارع رقم ${i}`,
        marital: 'متزوج',
        breadwinner: `مستفيد ${i}`,
        breadwinner_rel: 'رب الأسرة',
        family_count: (i % 7) + 1,
        family_names: 'أفراد الأسرة',
        health: 'سليم',
        health_desc: '',
        medical_attach: '',
        aid_cat: 'مساعدات شتوية',
        aid_types: ['بطاطين / ألحفة', 'دفايات / مستلزمات تدفئة'],
        need_desc: 'احتياج شتوي',
        status: i <= 10 ? 'تم الصرف' : 'مقبول',
        disb_date: i <= 10 ? '2026/10/05' : '',
        proof_method: i <= 10 ? 'كشف توقيع المستفيد' : '',
        proof_attach: '',
        notes: 'ملاحظة عربية مع رموز خاصة',
        vulnerability_score: 65,
        vulnerability_breakdown: [],
        anonymized_summary: 'أسرة بحاجة لدعم شتوي',
        consent_data_processing: true,
        consent_photo_sharing: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        created_by: 'باحث',
        updated_by: 'باحث',
        version: 1,
        deleted_at: null,
      });
    }

    const csvWithBom = buildCasesCsvWithBom(generatedCases);
    expect(csvWithBom.startsWith('\uFEFF')).toBe(true);

    // Clear cases & distributions to test clean import of all 100 rows
    await db.beneficiary_cases.clear();
    await db.distributions.clear();

    const preview = await parseLegacyCsvOrExcelText(csvWithBom);
    expect(preview.totalRows).toBe(100);
    expect(preview.validRowsCount).toBe(100);
    expect(preview.errorRowsCount).toBe(0);
    // First 10 rows had status = 'تم الصرف' + disb_date -> should flag 10 legacy disbursements to migrate
    expect(preview.legacyDisbursementsToMigrateCount).toBe(10);

    const importResult = await executeMigrationImport(preview, 'import_all');
    expect(importResult.importedCasesCount).toBe(100);
    expect(importResult.migratedDistributionsCount).toBe(10);

    const allImported = await db.beneficiary_cases.toArray();
    expect(allImported).toHaveLength(100);

    const firstCase = allImported.find((c) => c.national_id === '02980514000001');
    expect(firstCase).toBeDefined();
    expect(firstCase!.national_id.startsWith('0')).toBe(true);
    expect(firstCase!.phone).toBe('01012340001');
    expect(firstCase!.phone2).toBe('01198760001');
    expect(firstCase!.aid_types).toContain('بطاطين / ألحفة');

    // Verify 10 legacy disbursements were migrated to `distributions` table
    const migratedDists = await db.distributions.toArray();
    expect(migratedDists).toHaveLength(10);
  });

  it('2. Section 3 (ب): Migrates Legacy Python SQLite dump (cases, followups, and legacy disbursements)', async () => {
    const initialCaseCount = await db.beneficiary_cases.count();
    const initialFollowupCount = await db.followups.count();

    const preview = await parseLegacySqliteDump(SAMPLE_LEGACY_SQLITE_DUMP);
    expect(preview.sourceType).toBe('sqlite_dump');
    expect(preview.totalRows).toBe(2);
    expect(preview.validRowsCount).toBe(2);
    expect(preview.followupsToImport).toHaveLength(1);
    expect(preview.legacyDisbursementsToMigrateCount).toBe(1);

    const result = await executeMigrationImport(preview, 'update_existing');
    expect(result.importedCasesCount).toBe(2);
    expect(result.importedFollowupsCount).toBe(1);
    expect(result.migratedDistributionsCount).toBe(1);

    expect(await db.beneficiary_cases.count()).toBe(initialCaseCount + 2);
    expect(await db.followups.count()).toBe(initialFollowupCount + 1);
  });

  it('3. Handles duplicate National IDs during import according to selected strategy (skip vs update)', async () => {
    const dupCsv = [
      '"اسم المستفيد (رب الأسرة)","رقم الهوية / الجواز","الهاتف الأساسي","عدد أفراد الأسرة","حالة الطلب"',
      '"فاطمة عبد الرحمن (تحديث من إكسل)","=""02980514120045""","=""01012345678""","8","تم الصرف"',
    ].join('\r\n');

    const preview = await parseLegacyCsvOrExcelText(dupCsv);
    expect(preview.duplicateIdCount).toBe(1);

    // Strategy 1: skip_duplicates
    const skipRes = await executeMigrationImport(preview, 'skip_duplicates');
    expect(skipRes.skippedCount).toBe(1);
    expect(skipRes.updatedCasesCount).toBe(0);

    // Strategy 2: update_existing
    const updateRes = await executeMigrationImport(preview, 'update_existing');
    expect(updateRes.updatedCasesCount).toBe(1);

    const updatedCase = (await db.beneficiary_cases.toArray()).find(
      (c) => c.national_id === '02980514120045'
    );
    expect(updatedCase!.family_count).toBe(8);
  });

  it('4. AES-256-GCM Encrypted Backup & Restore: encrypts all tables, rejects wrong password, and restores 100% with valid password', async () => {
    const passphrase = 'SanadStrongPassword#2026';
    const envelope = await createEncryptedBackup(passphrase);

    expect(envelope.format).toBe('SANAD_ENCRYPTED_BACKUP_V1');
    expect(envelope.algorithm).toBe('AES-256-GCM-PBKDF2');
    // Ensure ciphertext does not leak plaintext beneficiary names or IDs
    expect(envelope.ciphertext_base64).not.toContain('فاطمة');
    expect(envelope.ciphertext_base64).not.toContain('02980514120045');

    // 1. Attempting to restore with wrong password must throw
    await expect(
      restoreEncryptedBackup(envelope, 'WrongPassword123')
    ).rejects.toThrow();

    // 2. Wipe database tables completely
    await db.beneficiary_cases.clear();
    await db.distributions.clear();
    await db.followups.clear();
    expect(await db.beneficiary_cases.count()).toBe(0);

    // 3. Restore with valid password
    const restored = await restoreEncryptedBackup(envelope, passphrase);
    expect(restored.restoredCasesCount).toBe(6);
    expect(restored.restoredDistributionsCount).toBeGreaterThanOrEqual(1);
    expect(restored.restoredFollowupsCount).toBeGreaterThanOrEqual(4);
    expect(await db.beneficiary_cases.count()).toBe(6);
  });
});
