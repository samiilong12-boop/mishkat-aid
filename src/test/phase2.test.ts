import { describe, it, expect, beforeEach } from 'vitest';
import {
  db,
  ensureInitialDatabaseSeed,
  resetCloudServerState,
  getCloudServerState,
  saveCloudServerState,
  saveBeneficiaryCase,
  saveAttachmentRecord,
  synchronizeWithCloud,
  resolveSyncConflict,
  revokeTrustedDevice,
  approveCaseWorkflowStage,
  mergeDuplicateCases,
  addCaseFollowup,
} from '../db/database';

describe('Phase 2: Accounts, Roles, Cloud Sync, Conflict Resolution, Sequential Codes & Four-Eyes Workflow', () => {
  beforeEach(async () => {
    resetCloudServerState();
    await Promise.all(db.tables.map((t) => t.clear()));
    await ensureInitialDatabaseSeed();
  });

  it('Scenario 1: Offline additions (10 cases + attachments) & edits sync cleanly upon reconnection without loss or duplication', async () => {
    // 1. Go offline
    await db.app_settings.update('default', { simulated_network_online: false });

    const offlineSyncAttempt = await synchronizeWithCloud();
    expect(offlineSyncAttempt.success).toBe(false);

    // 2. Add 10 cases with attachments while offline + edit an existing case
    for (let i = 1; i <= 10; i++) {
      const created = await saveBeneficiaryCase({
        name: `حالة أوفلاين للسيناريو الأول رقم ${i}`,
        national_id: `029500000000${String(i).padStart(2, '0')}`,
        phone: `010555500${String(i).padStart(2, '0')}`,
        family_count: 5,
        status: 'قيد الدراسة',
      });
      await saveAttachmentRecord({
        entity_type: 'case_id_doc',
        entity_id: created.id,
        file_name: `offline_id_${i}.jpg`,
        mime_type: 'image/jpeg',
        size_bytes: 2048,
        data_url: `data:image/jpeg;base64,OFFLINE_${i}`,
      });
    }

    const existingCase = (await db.beneficiary_cases.where('code').equals('CS-0001').first())!;
    await saveBeneficiaryCase(
      {
        name: existingCase.name,
        notes: 'تعديل تم أثناء انقطاع الإنترنت بالكامل',
      },
      existingCase.id
    );

    // 3. Reconnect to internet and sync
    await db.app_settings.update('default', { simulated_network_online: true });
    const syncRes = await synchronizeWithCloud();
    expect(syncRes.success).toBe(true);
    expect(syncRes.pushedCount).toBeGreaterThanOrEqual(21); // 10 cases + 10 attachments + 1 edit

    const cloud = getCloudServerState();
    expect(Object.keys(cloud.cloudCases).length).toBe(16); // 6 seed + 10 new
    expect(cloud.cloudCases[existingCase.id].notes).toBe(
      'تعديل تم أثناء انقطاع الإنترنت بالكامل'
    );
  });

  it('Scenario 2: Two devices edit the same case offline (disjoint fields + 1 shared field) -> merges disjoint fields and logs conflict for review', async () => {
    const target = (await db.beneficiary_cases.where('code').equals('CS-0001').first())!;
    const cloud = getCloudServerState();
    const baseCloud = cloud.cloudCases[target.id];

    // Device D2 modifies 'phone2' (disjoint) and 'family_count' (shared = 7) at T1
    const t1 = '2026-10-13T10:00:00.000Z';
    cloud.cloudCases[target.id] = {
      ...baseCloud,
      phone2: '01299998888',
      family_count: 7,
      updated_by: 'سارة عبد العزيز (جهاز D2)',
      updated_at: t1,
      version: baseCloud.version + 1,
      field_timestamps: {
        ...(baseCloud.field_timestamps || {}),
        phone2: t1,
        family_count: t1,
      },
    };
    saveCloudServerState(cloud);

    // Device D1 modifies 'address' (disjoint) and 'family_count' (shared = 9) at T2 > T1
    const t2 = '2026-10-13T10:05:00.000Z';
    await saveBeneficiaryCase(
      {
        name: target.name,
        address: 'عنوان جديد محدّث من الجهاز D1',
        family_count: 9,
      },
      target.id,
      {
        actorName: 'أحمد منصور (جهاز D1)',
        deviceCode: 'D1',
        timestampIso: t2,
      }
    );

    const syncRes = await synchronizeWithCloud();
    expect(syncRes.success).toBe(true);
    expect(syncRes.conflictsDetected).toBe(1);

    // Verify merged record has BOTH disjoint edits ('phone2' from D2 and 'address' from D1) + winning 'family_count' (9)
    const mergedCase = (await db.beneficiary_cases.get(target.id))!;
    expect(mergedCase.phone2).toBe('01299998888');
    expect(mergedCase.address).toBe('عنوان جديد محدّث من الجهاز D1');
    expect(mergedCase.family_count).toBe(9);

    // Verify losing value (7) is saved in sync_conflicts and can be restored by Admin
    const conflicts = await db.sync_conflicts.toArray();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].field_name).toBe('family_count');
    expect(conflicts[0].winner_value).toBe(9);
    expect(conflicts[0].loser_value).toBe(7);

    // Admin restores losing value (7)
    await resolveSyncConflict(conflicts[0].id, 'restore_loser', 'أ. خالد المنشاوي');
    const afterRestore = (await db.beneficiary_cases.get(target.id))!;
    expect(afterRestore.family_count).toBe(7);
  });

  it('Scenario 3: Power loss / interruption during sync resumes cleanly without data loss or duplicate records (Idempotency)', async () => {
    await db.app_settings.update('default', { simulated_network_online: false });
    for (let i = 1; i <= 5; i++) {
      await saveBeneficiaryCase({
        name: `حالة اختبار انقطاع المزامنة ${i}`,
        family_count: 4,
      });
    }

    await db.app_settings.update('default', { simulated_network_online: true });

    // Interrupt after 2 mutations
    const partialRes = await synchronizeWithCloud({ simulateInterruptAfterN: 2 });
    expect(partialRes.success).toBe(false);
    expect(partialRes.pushedCount).toBe(2);

    // Simulate a network retry where one already-processed mutation is still marked 'pending' locally
    const syncedMutations = await db.sync_outbox.where('status').equals('synced').toArray();
    const replayedMutationId = syncedMutations[syncedMutations.length - 1].mutation_id;
    await db.sync_outbox.update(replayedMutationId, { status: 'pending' });

    // Resume sync
    const resumeRes = await synchronizeWithCloud();
    expect(resumeRes.success).toBe(true);
    expect(resumeRes.skippedDuplicateMutations).toBe(1); // Server recognized mutation_id!
    expect(resumeRes.pushedCount).toBe(3); // Remaining 3 mutations pushed

    const allActive = await db.beneficiary_cases.filter((c) => !c.deleted_at).toArray();
    expect(allActive.length).toBe(11); // 6 seed + 5 new (zero duplicates)
  });

  it('Scenario 4: Two devices add cases offline -> assigned collision-free sequential official codes (CS-xxxx) on sync while preserving temp_code', async () => {
    await db.app_settings.update('default', { simulated_network_online: false });

    const caseD1 = await saveBeneficiaryCase(
      {
        code: 'CS-D1-0001',
        temp_code: 'CS-D1-0001',
        name: 'حالة مضافة من الجهاز الأول D1 أوفلاين',
        family_count: 4,
      },
      undefined,
      { deviceCode: 'D1' }
    );

    const caseD2 = await saveBeneficiaryCase(
      {
        code: 'CS-D2-0001',
        temp_code: 'CS-D2-0001',
        name: 'حالة مضافة من الجهاز الثاني D2 أوفلاين',
        family_count: 6,
      },
      undefined,
      { deviceCode: 'D2' }
    );

    await db.app_settings.update('default', { simulated_network_online: true });
    const syncRes = await synchronizeWithCloud();
    expect(syncRes.success).toBe(true);
    expect(syncRes.assignedOfficialCodes.length).toBe(2);

    const syncedD1 = (await db.beneficiary_cases.get(caseD1.id))!;
    const syncedD2 = (await db.beneficiary_cases.get(caseD2.id))!;

    expect(syncedD1.code).toMatch(/^CS-\d{4}$/);
    expect(syncedD2.code).toMatch(/^CS-\d{4}$/);
    expect(syncedD1.code).not.toBe(syncedD2.code);
    expect(syncedD1.temp_code).toBe('CS-D1-0001');
    expect(syncedD2.temp_code).toBe('CS-D2-0001');
  });

  it('Scenario 9: Revoking a lost device immediately blocks it from syncing', async () => {
    await revokeTrustedDevice('D1', 'فقدان التابلت الميداني D1');
    const syncRes = await synchronizeWithCloud();
    expect(syncRes.success).toBe(false);
    expect(syncRes.error_ar).toContain('تم إلغاء اعتماده');
  });

  it('P1.3 & P1.4: Enforces Four-Eyes Principle (creator cannot approve own case) and merges duplicate cases cleanly', async () => {
    const newCase = await saveBeneficiaryCase(
      {
        name: 'حالة اختبار مبدأ العينين الأربعة',
        family_count: 5,
      },
      undefined,
      { actorName: 'أحمد منصور (باحث ميداني أول)' }
    );

    // Same user tries to approve -> blocked by Four-Eyes Principle!
    const selfApprove = await approveCaseWorkflowStage(
      newCase.id,
      'approved',
      'أحمد منصور (باحث ميداني أول)'
    );
    expect(selfApprove.success).toBe(false);
    expect(selfApprove.error_ar).toContain('العينين الأربعة');

    // Different manager approves -> succeeds!
    const managerApprove = await approveCaseWorkflowStage(
      newCase.id,
      'approved',
      'أ. خالد المنشاوي (مدير النظام)'
    );
    expect(managerApprove.success).toBe(true);
    expect(managerApprove.updatedCase?.status).toBe('مقبول');

    // Test merging two duplicate cases
    const dupCase = await saveBeneficiaryCase({
      name: 'حاله اختبار مبدا العينين الاربعه',
      phone2: '01500001111',
      family_count: 6,
    });
    await addCaseFollowup({
      case_id: dupCase.id,
      date: '2026/10/13',
      ftype: 'اتصال هاتفي',
      details: 'متابعة مسجلة على السجل المكرر قبل الدمج',
    });

    const merged = await mergeDuplicateCases(
      newCase.id,
      dupCase.id,
      'أ. خالد المنشاوي (مدير النظام)'
    );
    expect(merged?.phone2).toBe('01500001111');
    expect(merged?.family_count).toBe(6);

    const movedFollowups = await db.followups.where('case_id').equals(newCase.id).toArray();
    expect(movedFollowups.length).toBe(1);
    const softDeletedSecondary = await db.beneficiary_cases.get(dupCase.id);
    expect(softDeletedSecondary?.deleted_at).toBeTruthy();
  });
});
