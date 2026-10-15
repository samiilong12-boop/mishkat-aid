import { describe, it, expect, beforeEach } from 'vitest';
import {
  db,
  ensureInitialDatabaseSeed,
  saveBeneficiaryCase,
  recordAidDistribution,
  getSanitizedDonorPortalData,
  createDonorShareLink,
  revokeDonorShareLink,
  resetCloudServerState,
} from '../db/database';

describe('Phase 3: Distributions, Inventory, Projects, Donations & Zero-PII Donor Portal', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    resetCloudServerState();
    await ensureInitialDatabaseSeed();
  });

  it('1. P1.2 & P2.7: Records tamper-evident distribution with SHA-256 + QR token and deducts inventory stock', async () => {
    const initialBlankets = await db.inventory_items.get('inv-blankets');
    expect(initialBlankets).toBeDefined();
    const availableBefore = initialBlankets!.qty_available;

    const targetCase = (await db.beneficiary_cases.toArray()).find(
      (c) => c.code === 'CS-0002'
    )!;
    expect(targetCase.status).toBe('مقبول');

    const dist = await recordAidDistribution({
      case_id: targetCase.id,
      project_id: 'project-winter-2026',
      donor_id: 'donor-1',
      inventory_item_id: 'inv-blankets',
      aid_cat: 'مساعدات شتوية',
      aid_type: 'بطاطين شتوية مزدوجة',
      quantity: 4,
      unit: 'بطانية ثقيلة',
      financial_value: 1800,
      disb_date: '2026/10/12',
      proof_method: 'كشف توقيع المستفيد',
      proof_attach: 'data:image/svg+xml;utf8,<svg></svg>',
      consent_to_share: true,
      is_redacted: true,
    });

    expect(dist.receipt_number).toMatch(/^RCP-\d{4}$/);
    expect(dist.proof_file_sha256).toHaveLength(64);
    expect(dist.qr_verification_token).toContain(`SANAD-VERIFY|${dist.receipt_number}|CS-0002`);

    // Verify automatic stock deduction (P2.7)
    const updatedBlankets = await db.inventory_items.get('inv-blankets');
    expect(updatedBlankets!.qty_available).toBe(availableBefore - 4);

    // Verify parent case status updated to 'تم الصرف'
    const updatedCase = await db.beneficiary_cases.get(targetCase.id);
    expect(updatedCase!.status).toBe('تم الصرف');
    expect(updatedCase!.workflow_stage).toBe('documented');
  });

  it('2. Scenario 5: Enforces strict Zero-PII & RLS Project Isolation in Donor Portal gateway', async () => {
    // 1. Donor-1 tries to access Donor-2's project ('project-medical-2026')
    const crossDonorAttempt = await getSanitizedDonorPortalData({
      donorId: 'donor-1',
      requestedProjectId: 'project-medical-2026',
    });
    expect(crossDonorAttempt.authorized).toBe(false);
    expect(crossDonorAttempt.error_ar).toContain('رفض الوصول');

    // 2. Donor-1 queries their own authorized portal data
    const authorizedPortal = await getSanitizedDonorPortalData({
      donorId: 'donor-1',
    });
    expect(authorizedPortal.authorized).toBe(true);
    expect(authorizedPortal.donor?.id).toBe('donor-1');

    // Verify ZERO Beneficiary PII exists anywhere in the serialized payload
    const serialized = JSON.stringify(authorizedPortal);
    expect(serialized).not.toContain('فاطمة عبد الرحمن');
    expect(serialized).not.toContain('02980514120045');
    expect(serialized).not.toContain('01012345678');
    expect(serialized).not.toContain('حي السلام، شارع المدارس');
    expect(serialized).not.toContain('national_id');
    expect(serialized).not.toContain('family_names');
    expect(serialized).not.toContain('health_desc');

    // Verify only case_code and anonymized_summary are present
    expect(authorizedPortal.anonymized_distributions?.length).toBeGreaterThan(0);
    expect(authorizedPortal.anonymized_distributions![0].case_code).toBe('CS-0001');
  });

  it('3. Section 8.1: Enforces Small-Cell Suppression (< 5 cases per region merged into privacy bucket)', async () => {
    const portal = await getSanitizedDonorPortalData({ donorId: 'donor-1' });
    expect(portal.authorized).toBe(true);
    expect(portal.regional_breakdown).toBeDefined();

    // Since CS-0001 is only 1 case (< 5) in 'القطاع الشمالي', it must be suppressed into the privacy bucket
    const suppressedBucket = portal.regional_breakdown!.find(
      (r) => r.is_suppressed_small_cell
    );
    expect(suppressedBucket).toBeDefined();
    expect(suppressedBucket!.area_label).toContain('مناطق مجمّعة لحماية الخصوصية');
    expect(suppressedBucket!.cases_count).toBe(1);
  });

  it('4. Scenario 6: Offline Presentation Mode numbers match 100% with local system totals without internet', async () => {
    // Switch device offline
    await db.app_settings.update('default', { simulated_network_online: false });

    // Record another distribution while offline for Donor-1
    const case3 = (await db.beneficiary_cases.toArray()).find(
      (c) => c.code === 'CS-0003'
    )!;
    await recordAidDistribution({
      case_id: case3.id,
      project_id: 'project-food-2026',
      donor_id: 'donor-1',
      inventory_item_id: 'inv-food-boxes',
      aid_cat: 'عينية',
      aid_type: 'طرد / سلة مواد غذائية',
      quantity: 2,
      unit: 'طرد غذائي',
      financial_value: 1500,
      disb_date: '2026/10/12',
      proof_method: 'كشف توقيع المستفيد',
      proof_attach: 'link://offline-receipt',
      consent_to_share: false,
      is_redacted: false,
    });

    const offlinePortal = await getSanitizedDonorPortalData({ donorId: 'donor-1' });
    expect(offlinePortal.authorized).toBe(true);

    // Donor-1 has 150,000 + 90,000 = 240,000 EGP in donations
    expect(offlinePortal.kpis!.total_donated).toBe(240000);
    // Donor-1 has 4,500 (seed CS-0001) + 1,500 (new CS-0003) = 6,000 EGP spent
    expect(offlinePortal.kpis!.total_spent).toBe(6000);
    expect(offlinePortal.kpis!.remaining_balance).toBe(234000);
    // 2 families helped: CS-0001 (6 individuals) + CS-0003 (7 individuals) = 13 individuals
    expect(offlinePortal.kpis!.beneficiary_families_count).toBe(2);
    expect(offlinePortal.kpis!.beneficiary_individuals_count).toBe(13);

    // Verify unconsented/unredacted photo for CS-0003 is strictly hidden
    const cs3Row = offlinePortal.anonymized_distributions!.find(
      (r) => r.case_code === 'CS-0003'
    );
    expect(cs3Row!.can_show_redacted_photo).toBe(false);
    expect(cs3Row!.redacted_photo_url).toBeUndefined();
  });

  it('5. Scenario 8: Revoking a Donor Share Link immediately blocks access on the very next request', async () => {
    const shareLink = await createDonorShareLink('donor-1', 14);
    expect(shareLink.token).toMatch(/^shr_donor-1_/);

    // 1. Access via valid token succeeds
    const validAccess = await getSanitizedDonorPortalData({
      shareToken: shareLink.token,
    });
    expect(validAccess.authorized).toBe(true);
    expect(validAccess.donor?.id).toBe('donor-1');

    // 2. Admin revokes the share link immediately
    await revokeDonorShareLink(shareLink.token);

    // 3. Subsequent access with the revoked token is immediately blocked
    const revokedAccess = await getSanitizedDonorPortalData({
      shareToken: shareLink.token,
    });
    expect(revokedAccess.authorized).toBe(false);
    expect(revokedAccess.error_ar).toContain('تم إلغاء صلاحية رابط المشاركة');
  });
});
