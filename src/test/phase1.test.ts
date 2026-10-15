import { describe, it, expect, beforeEach } from 'vitest';
import { computeWcagContrast } from '../components/StyleGuideView';
import { evaluateCaseAlerts, validateCaseInput } from '../utils/caseRules';
import {
  normalizeArabicText,
  calculateArabicNameSimilarity,
  findDuplicateMatches,
} from '../utils/arabicDeduplication';
import { calculateVulnerabilityScore } from '../utils/vulnerabilityScore';
import { buildCasesCsvWithBom, UTF8_BOM } from '../utils/csvExport';
import {
  db,
  ensureInitialDatabaseSeed,
  saveBeneficiaryCase,
  softDeleteCase,
  addCaseFollowup,
  saveAttachmentRecord,
} from '../db/database';
import {
  EGYPT_SECTORS_HIERARCHY,
  getSubDistrictsForSector,
  detectSectorAndSubDistrict,
} from '../constants/defaultLists';

describe('Phase 1: Offline Core, Business Rules, Design System & Arabic Deduplication', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    await ensureInitialDatabaseSeed();
  });

  it('Section 15.1: verifies WCAG AA (>= 4.5:1) contrast ratios for Design System tokens', () => {
    // Primary (#0B4F8A) on White (#FFFFFF)
    expect(computeWcagContrast('#0B4F8A', '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    // Primary Dark (#083A66) on White (#FFFFFF)
    expect(computeWcagContrast('#083A66', '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    // Primary Text (#1F2933) on Light Background (#F5F7FA) and Surface (#FFFFFF)
    expect(computeWcagContrast('#1F2933', '#F5F7FA')).toBeGreaterThanOrEqual(4.5);
    expect(computeWcagContrast('#1F2933', '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    // Muted Text (#52606D) on Surface (#FFFFFF)
    expect(computeWcagContrast('#52606D', '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    // Dark Mode Text (#E6EBF0) on Dark Surface (#1A2530) and Dark Background (#0F1720)
    expect(computeWcagContrast('#E6EBF0', '#1A2530')).toBeGreaterThanOrEqual(4.5);
    expect(computeWcagContrast('#E6EBF0', '#0F1720')).toBeGreaterThanOrEqual(4.5);
  });

  it('Section 7: evaluates all 4 automatic case alerts accurately (✓, ⚠, ⏰)', () => {
    const refDate = new Date('2026-10-12T00:00:00Z');

    // 1. Undefined status -> ⚠ STATUS_UNDEFINED
    const alertsUndefined = evaluateCaseAlerts(
      { status: '', disb_date: '', proof_attach: '', proof_method: '', reg_date: '2026/10/01' },
      [],
      30,
      refDate
    );
    expect(alertsUndefined.some((a) => a.code === 'STATUS_UNDEFINED' && a.icon === '⚠')).toBe(
      true
    );

    // 2. Disbursed without proof attachment or date -> ⚠ DISBURSED_MISSING_PROOF / DATE
    const alertsDisbNoProof = evaluateCaseAlerts(
      {
        status: 'تم الصرف',
        disb_date: '',
        proof_attach: '',
        proof_method: 'كشف توقيع المستفيد',
        reg_date: '2026/10/01',
      },
      [],
      30,
      refDate
    );
    expect(alertsDisbNoProof.some((a) => a.code === 'DISBURSED_MISSING_PROOF')).toBe(true);
    expect(alertsDisbNoProof.some((a) => a.code === 'DISBURSED_MISSING_DATE')).toBe(true);

    // 3. Under study > 30 days without recent followup -> ⏰ UNDER_STUDY_OVERDUE
    const alertsOverdue = evaluateCaseAlerts(
      {
        status: 'قيد الدراسة',
        disb_date: '',
        proof_attach: '',
        proof_method: '',
        reg_date: '2026/08/01',
      },
      [{ date: '2026/08/15', deleted_at: null }],
      30,
      refDate
    );
    expect(
      alertsOverdue.some((a) => a.code === 'UNDER_STUDY_OVERDUE' && a.icon === '⏰')
    ).toBe(true);

    // 4. Healthy case -> ✓ HEALTHY
    const alertsHealthy = evaluateCaseAlerts(
      {
        status: 'تم الصرف',
        disb_date: '2026/10/05',
        proof_attach: 'data:image/png;base64,iVBORw0KGgo=',
        proof_method: 'كشف توقيع المستفيد',
        reg_date: '2026/10/01',
      },
      [],
      30,
      refDate
    );
    expect(alertsHealthy).toHaveLength(1);
    expect(alertsHealthy[0].code).toBe('HEALTHY');
    expect(alertsHealthy[0].icon).toBe('✓');
  });

  it('Section 7: enforces strict validation rules (required name, integer family_count, proof required for final disbursed)', () => {
    const missingName = validateCaseInput({ name: '   ', family_count: 4 });
    expect(missingName.valid).toBe(false);

    const invalidFamily = validateCaseInput({ name: 'أحمد محمد', family_count: 150 });
    expect(invalidFamily.valid).toBe(false);

    const disbursedWithoutProof = validateCaseInput(
      {
        name: 'أحمد محمد',
        family_count: 4,
        reg_date: '2026/10/01',
        status: 'تم الصرف',
        disb_date: '2026/10/05',
        proof_attach: '',
      },
      { enforceStrictProofOnDisbursed: true }
    );
    expect(disbursedWithoutProof.valid).toBe(false);
  });

  it('Section 7 & P1.4: normalizes Arabic text and detects exact National ID & fuzzy Arabic name duplicates', async () => {
    expect(normalizeArabicText('أَحْمَدُ عَبْدُ الرَّحْمَنِ فَاطِمَةُ ٠١٠')).toBe(
      'احمد عبدالرحمن فاطمه 010'
    );

    const sim = calculateArabicNameSimilarity(
      'فاطمة عبد الرحمن محمود السيد',
      'فاطمه عبدالرحمن السيد محمود'
    );
    expect(sim).toBeGreaterThanOrEqual(0.85);

    const existing = await db.beneficiary_cases.toArray();
    const idMatches = findDuplicateMatches(
      {
        name: 'اسم مختلف تماماً',
        national_id: '02980514120045', // Preserves leading zero!
      },
      existing
    );
    expect(idMatches.length).toBeGreaterThan(0);
    expect(idMatches[0].matchType).toBe('exact_national_id');
    expect(idMatches[0].matchedCase.code).toBe('CS-0001');
  });

  it('Section 14 P1.1 & Section 8.1: calculates transparent Vulnerability Score (0-100) and generates zero-PII anonymized summary', () => {
    const result = calculateVulnerabilityScore({
      name: 'فاطمة عبد الرحمن محمود السيد',
      national_id: '02980514120045',
      phone: '01012345678',
      address: 'حي السلام، شارع المدارس، عقار 14',
      family_count: 7,
      children_count: 5,
      marital: 'أرمل',
      health: 'إعاقة',
      income_status: 'بلا دخل (منقطع)',
      housing_type: 'سكن غير ملائم / سقف بحاجة لعزل',
      aid_cat: 'مساعدات شتوية',
    });

    expect(result.score).toBeGreaterThanOrEqual(85);
    expect(result.breakdown.length).toBe(6);
    // Anonymized summary MUST NOT contain name, national_id, phone, or detailed address
    expect(result.autoAnonymizedSummary).not.toContain('فاطمة');
    expect(result.autoAnonymizedSummary).not.toContain('02980514120045');
    expect(result.autoAnonymizedSummary).not.toContain('01012345678');
    expect(result.autoAnonymizedSummary).not.toContain('شارع المدارس');
  });

  it('Scenario 1 (Local Offline Part): adds 10 offline cases with attachments & followups, modifies existing cases, and queues idempotent outbox mutations', async () => {
    const initialCount = await db.beneficiary_cases.filter((c) => !c.deleted_at).count();

    for (let i = 1; i <= 10; i++) {
      const created = await saveBeneficiaryCase({
        name: `مستفيد اختبار ميداني رقم ${i}`,
        national_id: `030000000000${String(i).padStart(2, '0')}`,
        phone: `010998877${String(i).padStart(2, '0')}`,
        family_count: 5,
        aid_cat: 'مساعدات شتوية',
        aid_types: ['بطاطين / ألحفة'],
        status: 'قيد الدراسة',
      });

      await saveAttachmentRecord({
        entity_type: 'case_id_doc',
        entity_id: created.id,
        file_name: `id_doc_${i}.jpg`,
        mime_type: 'image/jpeg',
        size_bytes: 1024,
        data_url: `data:image/jpeg;base64,TEST_CONTENT_${i}`,
      });

      await addCaseFollowup({
        case_id: created.id,
        date: '2026/10/12',
        ftype: 'زيارة منزلية',
        details: `متابعة ميدانية للحالة رقم ${i}`,
      });
    }

    const afterAddCount = await db.beneficiary_cases.filter((c) => !c.deleted_at).count();
    expect(afterAddCount).toBe(initialCount + 10);

    // Modify an existing case and verify version increment & field_timestamps
    const firstCase = (await db.beneficiary_cases.toArray())[0];
    const updated = await saveBeneficiaryCase(
      {
        name: firstCase.name,
        family_count: 8,
        notes: 'تحديث بعد زيارة ميدانية ثانية',
      },
      firstCase.id
    );
    expect(updated.version).toBe(firstCase.version + 1);
    expect(updated.field_timestamps?.family_count).toBeDefined();

    // Soft delete a case and verify deleted_at is set and record is retained
    await softDeleteCase(firstCase.id);
    const softDeleted = await db.beneficiary_cases.get(firstCase.id);
    expect(softDeleted?.deleted_at).toBeTruthy();

    // Verify sync_outbox and audit_log recorded all mutations
    const outboxCount = await db.sync_outbox.count();
    const auditCount = await db.audit_log.count();
    expect(outboxCount).toBeGreaterThanOrEqual(30);
    expect(auditCount).toBeGreaterThanOrEqual(30);
  });

  it('Scenario 7: exports CSV/Excel with UTF-8 BOM (\\uFEFF) and preserves leading zeros on National ID and Phone', async () => {
    const cases = await db.beneficiary_cases.toArray();
    const csv = buildCasesCsvWithBom(cases);

    expect(csv.startsWith(UTF8_BOM)).toBe(true);
    expect(csv).toContain('فاطمة عبد الرحمن محمود السيد');
    // Leading zeros wrapped for Excel preservation
    expect(csv).toContain('""02980514120045""');
    expect(csv).toContain('""01012345678""');
  });

  it('Hierarchical Sectors: verifies cascading structure for October, Faisal, and other governorates', async () => {
    // 1. Verify October sector and its sub-districts
    const octDistricts = getSubDistrictsForSector('مدينة 6 أكتوبر والشيخ زايد');
    expect(octDistricts).toContain('الحي الثاني');
    expect(octDistricts).toContain('الحي الثالث');
    expect(octDistricts).toContain('بيت العيلة');
    expect(octDistricts).toContain('مساكن أبناء الجيزة');
    expect(octDistricts).toContain('حدائق أكتوبر');

    // 2. Verify Faisal sector and its sub-districts
    const faisalDistricts = getSubDistrictsForSector('فيصل والجيزة');
    expect(faisalDistricts).toContain('شارع فيصل الرئيسي');
    expect(faisalDistricts).toContain('شارع العشرين');
    expect(faisalDistricts).toContain('الطالبية فيصل');
    expect(faisalDistricts).toContain('بولاق الدكرور');

    // 3. Verify Haram sector
    const haramDistricts = getSubDistrictsForSector('الهرم وحدائق الأهرام');
    expect(haramDistricts).toContain('هضبة الأهرام (حدائق الأهرام - البوابات)');

    // 4. Test detectSectorAndSubDistrict parser
    const parsedOct = detectSectorAndSubDistrict('6 أكتوبر — الحي الثاني');
    expect(parsedOct.subDistrict).toBe('الحي الثاني');

    const parsedFaisal = detectSectorAndSubDistrict('فيصل — شارع العشرين');
    expect(parsedFaisal.subDistrict).toBe('شارع العشرين');

    // 5. Verify seeded database cases have structured governorate and sub_district
    const cs1 = await db.beneficiary_cases.where('code').equals('CS-0001').first();
    expect(cs1?.governorate).toBe('مدينة 6 أكتوبر والشيخ زايد');
    expect(cs1?.sub_district).toBe('الحي الثاني');

    const cs2 = await db.beneficiary_cases.where('code').equals('CS-0002').first();
    expect(cs2?.sub_district).toBe('بيت العيلة');

    const cs3 = await db.beneficiary_cases.where('code').equals('CS-0003').first();
    expect(cs3?.sub_district).toBe('مساكن أبناء الجيزة');

    const cs4 = await db.beneficiary_cases.where('code').equals('CS-0004').first();
    expect(cs4?.governorate).toBe('فيصل والجيزة');
    expect(cs4?.sub_district).toBe('شارع العشرين');
  });
});
