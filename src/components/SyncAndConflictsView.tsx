import React, { useMemo, useState } from 'react';
import {
  RefreshCw,
  Wifi,
  WifiOff,
  GitMerge,
  AlertTriangle,
  CheckCircle2,
  Smartphone,
  Laptop,
  ArrowLeftRight,
  CopyCheck,
  ShieldAlert,
  RotateCcw,
} from 'lucide-react';
import {
  AppSettings,
  BeneficiaryCase,
  SyncConflictRecord,
  SyncOutboxItem,
} from '../types/models';
import {
  getCloudServerState,
  mergeDuplicateCases,
  resolveSyncConflict,
  saveBeneficiaryCase,
  saveCloudServerState,
  synchronizeWithCloud,
} from '../db/database';
import { findDuplicateMatches } from '../utils/arabicDeduplication';
import { formatNumerals } from '../utils/formatters';

interface SyncAndConflictsViewProps {
  settings: AppSettings;
  cases: BeneficiaryCase[];
  conflicts: SyncConflictRecord[];
  outboxItems: SyncOutboxItem[];
  onUpdateSettings: (partial: Partial<AppSettings>) => Promise<void>;
  onSelectCase: (caseRecord: BeneficiaryCase) => void;
}

export const SyncAndConflictsView: React.FC<SyncAndConflictsViewProps> = ({
  settings,
  cases,
  conflicts,
  outboxItems,
  onUpdateSettings,
  onSelectCase,
}) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncReport, setSyncReport] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const fmt = (val: string | number) => formatNumerals(val, settings.numeral_system);
  const pendingOutbox = outboxItems.filter((i) => i.status === 'pending');
  const pendingConflicts = conflicts.filter((c) => c.status === 'pending_review');

  // Scan active cases for duplicate candidates (National ID, Phone, or Fuzzy Arabic Name >= 85%)
  const duplicatePairs = useMemo(() => {
    const pairs: Array<{
      key: string;
      primary: BeneficiaryCase;
      secondary: BeneficiaryCase;
      reason_ar: string;
      similarity: number;
    }> = [];
    const seenKeys = new Set<string>();

    const sampleCases = cases.slice(0, 300);
    for (const c of sampleCases) {
      const matches = findDuplicateMatches(
        {
          id: c.id,
          name: c.name,
          national_id: c.national_id,
          phone: c.phone,
          phone2: c.phone2,
        },
        sampleCases
      );

      for (const m of matches) {
        const pairIds = [c.id, m.matchedCase.id].sort();
        const key = `${pairIds[0]}__${pairIds[1]}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);

        pairs.push({
          key,
          primary: c.code <= m.matchedCase.code ? c : m.matchedCase,
          secondary: c.code <= m.matchedCase.code ? m.matchedCase : c,
          reason_ar: m.reason_ar,
          similarity: m.similarity,
        });
      }
    }
    return pairs;
  }, [cases]);

  const handleRunSyncNow = async () => {
    setIsSyncing(true);
    setSyncError(null);
    setSyncReport(null);
    try {
      const res = await synchronizeWithCloud();
      if (!res.success) {
        setSyncError(res.error_ar || 'حدث خطأ أثناء المزامنة.');
      } else {
        const codeNotes =
          res.assignedOfficialCodes.length > 0
            ? ` • تخصيص أكواد رسمية: (${res.assignedOfficialCodes
                .map((c) => `${c.tempCode} ← ${c.officialCode}`)
                .join(' ، ')})`
            : '';
        setSyncReport(
          `✓ اكتملت المزامنة بنجاح: تم رفع ${res.pushedCount} عملية، ورصد ${res.conflictsDetected} تعارض حقول${codeNotes}.`
        );
      }
    } finally {
      setIsSyncing(false);
    }
  };

  /**
   * Interactive Simulator for Acceptance Scenario 2:
   * Two devices modify the exact same case offline (disjoint fields + 1 shared field)
   */
  const handleSimulateScenario2Conflict = async () => {
    setSyncError(null);
    const targetCase = cases.find((c) => c.code === 'CS-0001') || cases[0];
    if (!targetCase) return;

    // 1. Ensure targetCase is synced in Cloud first
    await synchronizeWithCloud();
    const cloud = getCloudServerState();
    const baseCloudCase = cloud.cloudCases[targetCase.id] || targetCase;

    // 2. Simulate Device D2 (الباحثة سارة) editing 'phone2' (disjoint) AND 'family_count' (shared) on Cloud at T1
    const t1 = new Date(Date.now() - 5000).toISOString();
    cloud.cloudCases[targetCase.id] = {
      ...baseCloudCase,
      phone2: '01288889999', // Disjoint field edit by D2
      family_count: 7, // Shared field edit by D2
      updated_by: 'سارة عبد العزيز (جهاز D2)',
      updated_at: t1,
      version: baseCloudCase.version + 1,
      field_timestamps: {
        ...(baseCloudCase.field_timestamps || {}),
        phone2: t1,
        family_count: t1,
      },
    };
    saveCloudServerState(cloud);

    // 3. Simulate Device D1 (الباحث أحمد) editing 'address' (disjoint) AND 'family_count' (shared) locally at T2 > T1
    const t2 = new Date().toISOString();
    await saveBeneficiaryCase(
      {
        name: targetCase.name,
        address: `${targetCase.address} (تم التحديث ميدانياً بواسطة D1)`,
        family_count: 8,
      },
      targetCase.id,
      {
        actorName: 'أحمد منصور (جهاز D1)',
        deviceCode: 'D1',
        timestampIso: t2,
      }
    );

    // 4. Run Sync to trigger Field-Level Merge + Conflict Log
    const res = await synchronizeWithCloud();
    setSyncReport(
      `✓ تجربة سيناريو 2: تم دمج الحقول المختلفة (الهاتف الإضافي من D2 + العنوان من D1) تلقائياً، وتسجيل تعارض الحقل المشترك (عدد الأفراد: 8 مقابل 7) في قائمة التعارضات أدناه للمراجعة! (رُصد ${res.conflictsDetected} تعارض).`
    );
  };

  /**
   * Interactive Simulator for Acceptance Scenario 4:
   * Two devices add cases while offline -> zero code collision after sync
   */
  const handleSimulateScenario4OfflineCodes = async () => {
    setSyncError(null);
    // 1. Simulate Device D2 having pushed a new case offline with temp code CS-D2-0001
    const cloud = getCloudServerState();
    const d2Id = `sim-d2-${Date.now()}`;
    const officialForD2 = `CS-${String(cloud.nextOfficialCodeSeq).padStart(4, '0')}`;
    cloud.nextOfficialCodeSeq++;

    cloud.cloudCases[d2Id] = {
      ...(cases[0] || {}),
      id: d2Id,
      code: officialForD2,
      temp_code: 'CS-D2-0001',
      is_code_finalized: true,
      reg_date: '2026/10/12',
      name: 'حسن عبد السلام الشامي (مضاف من الجهاز D2 أوفلاين)',
      normalized_name: 'حسن عبدالسلام الشامي',
      national_id: `0299${String(Date.now()).slice(-10)}`,
      phone: '01144556677',
      status: 'قيد الدراسة',
      family_count: 5,
      aid_cat: 'مساعدات شتوية',
      aid_types: ['بطاطين / ألحفة'],
      vulnerability_score: 68,
      vulnerability_breakdown: [],
      anonymized_summary: 'أسرة من 5 أفراد بحاجة لدعم شتوي',
      consent_data_processing: true,
      consent_photo_sharing: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: 'سارة عبد العزيز (جهاز D2)',
      updated_by: 'سارة عبد العزيز (جهاز D2)',
      version: 1,
      deleted_at: null,
    };
    saveCloudServerState(cloud);

    // 2. Device D1 creates a case locally with temporary code CS-D1-xxxx
    const d1Created = await saveBeneficiaryCase(
      {
        code: 'CS-D1-0099',
        temp_code: 'CS-D1-0099',
        name: 'عائشة محمود السيد (مضافة من الجهاز D1 أوفلاين)',
        national_id: `0298${String(Date.now()).slice(-10)}`,
        phone: '01033445566',
        family_count: 6,
        status: 'قيد الدراسة',
      },
      undefined,
      { actorName: 'أحمد منصور (جهاز D1)', deviceCode: 'D1' }
    );

    // 3. Synchronize so D1's CS-D1-0099 gets official sequential code and pulls D2's case
    const res = await synchronizeWithCloud();
    const assigned = res.assignedOfficialCodes[0];
    setSyncReport(
      `✓ تجربة سيناريو 4: أضاف الجهاز D2 حالة (${officialForD2} / مرجع CS-D2-0001) وأضاف الجهاز D1 حالة بمؤقت (${
        d1Created.temp_code
      }) وحصلت بعد المزامنة على الكود الرسمي المتسلسل (${
        assigned?.officialCode || 'CS-xxxx'
      }) بلا أي تصادم، مع بقاء الكودين المؤقتين قابلين للبحث!`
    );
  };

  return (
    <div className="space-y-6 pb-10">
      {/* 1. Sync Status & Connection Control Header (Screen 11) */}
      <section className="ds-card p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-12 h-12 rounded-card flex items-center justify-center ${
                !settings.simulated_network_online
                  ? 'bg-warning/20 text-amber-800 dark:text-warning'
                  : pendingOutbox.length > 0
                  ? 'bg-info/15 text-primary'
                  : 'bg-success/15 text-success'
              }`}
            >
              {settings.simulated_network_online ? (
                <Wifi className="w-6 h-6" />
              ) : (
                <WifiOff className="w-6 h-6" />
              )}
            </div>
            <div>
              <h2 className="text-lg font-bold text-text">
                حالة المزامنة السحابية وطابور العمليات (Outbox & Delta Sync)
              </h2>
              <p className="text-xs text-text-muted mt-0.5">
                الجهاز الحالي: <strong className="font-mono">{settings.device_code}</strong> •{' '}
                {settings.simulated_network_online
                  ? pendingOutbox.length === 0
                    ? 'متصل ومتزامن بالكامل مع السحابة ✓'
                    : `متصل • يوجد ${fmt(pendingOutbox.length)} تغيير بانتظار المزامنة`
                  : `يعمل دون اتصال (Offline Mode) • ${fmt(pendingOutbox.length)} تغيير محفوظ في الطابور المحلي`}
                {settings.last_synced_at &&
                  ` • آخر مزامنة: ${new Date(settings.last_synced_at).toLocaleTimeString('ar-EG')}`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Toggle Network Online / Offline to test Scenario 1 */}
            <button
              type="button"
              onClick={() =>
                onUpdateSettings({
                  simulated_network_online: !settings.simulated_network_online,
                })
              }
              className={`ds-btn text-xs ${
                settings.simulated_network_online
                  ? 'ds-btn-secondary'
                  : 'bg-warning text-slate-900 font-bold'
              }`}
            >
              {settings.simulated_network_online ? (
                <>
                  <WifiOff className="w-4 h-4 text-warning" />
                  <span>محاكاة قطع الإنترنت (Offline)</span>
                </>
              ) : (
                <>
                  <Wifi className="w-4 h-4 text-slate-900" />
                  <span>إعادة الاتصال بالإنترنت (Online)</span>
                </>
              )}
            </button>

            <button
              type="button"
              disabled={isSyncing}
              onClick={handleRunSyncNow}
              className="ds-btn ds-btn-primary text-xs font-bold"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'جاري المزامنة...' : 'زامن الآن (Sync Now)'}</span>
            </button>
          </div>
        </div>

        {syncReport && (
          <div className="p-3.5 rounded-card bg-success/10 border border-success/30 text-success text-xs font-bold flex items-center justify-between gap-2">
            <span>{syncReport}</span>
            <button
              type="button"
              onClick={() => setSyncReport(null)}
              className="underline shrink-0"
            >
              إغلاق
            </button>
          </div>
        )}

        {syncError && (
          <div className="p-3.5 rounded-card bg-danger/10 border border-danger text-danger text-xs font-bold flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 shrink-0" />
            <span>{syncError}</span>
          </div>
        )}

        {/* Interactive Multi-Device Scenarios Lab */}
        <div className="p-4 rounded-card bg-background border border-border space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-primary">
            <ArrowLeftRight className="w-4 h-4" />
            <span>
              مختبر محاكاة تعدد الأجهزة (الجهاز D1 ↔ السحابة ↔ الجهاز D2) — اختبر سيناريوهات القبول بضغطة زر:
            </span>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={handleSimulateScenario2Conflict}
              className="ds-btn ds-btn-secondary text-xs"
            >
              <Laptop className="w-4 h-4 text-primary" />
              <span>
                تجربة سيناريو 2: جهازان يعدّلان نفس الحالة أوفلاين (دمج الحقول + رصد تعارض)
              </span>
            </button>

            <button
              type="button"
              onClick={handleSimulateScenario4OfflineCodes}
              className="ds-btn ds-btn-secondary text-xs"
            >
              <Smartphone className="w-4 h-4 text-info" />
              <span>
                تجربة سيناريو 4: جهازان يضيفان حالات أوفلاين (تخصيص أكواد CS-xxxx متسلسلة بلا تصادم)
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* 2. Field-Level Sync Conflicts Resolution (Screen 9 - التعارضات) */}
      <section className="ds-card p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <GitMerge className="w-5 h-5 text-warning" />
            <h3 className="text-lg font-bold">
              سجل تعارضات المزامنة على مستوى الحقل (Field-Level Conflict Resolution)
            </h3>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-warning/15 text-amber-900 dark:text-warning">
            بانتظار مراجعة المدير: {fmt(pendingConflicts.length)}
          </span>
        </div>

        <p className="text-xs text-text-muted">
          وفق القاعدة (5.2.5): عند تعديل السجل نفسه على جهازين أوفلاين، تُدمج الحقول المختلفة تلقائياً، أما إذا عُدِّل <strong>الحقل نفسه</strong> فتُطبَّق قاعدة «الأحدث يفوز» مع حفظ النسخة الأخرى هنا لمراجعة المدير دون ضياع أي معلومة.
        </p>

        {conflicts.length === 0 ? (
          <div className="p-8 text-center border border-dashed border-border rounded-card text-xs text-text-muted">
            ✓ لا توجد تعارضات مسجلة حالياً. يمكنك الضغط على زر «تجربة سيناريو 2» أعلاه لمشاهدة كيفية عمل الدمج وحل التعارض.
          </div>
        ) : (
          <div className="space-y-3">
            {conflicts.map((conf) => (
              <div
                key={conf.id}
                className={`p-4 rounded-card border ${
                  conf.status === 'pending_review'
                    ? 'border-warning bg-warning/5'
                    : 'border-border bg-background/40 opacity-80'
                } space-y-3`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-xs px-2.5 py-1 rounded bg-primary text-white">
                      {conf.case_code}
                    </span>
                    <span className="font-bold text-sm text-text">{conf.case_name}</span>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-danger/15 text-danger font-bold">
                      حقل التعارض: {conf.field_label_ar}
                    </span>
                  </div>

                  <span className="text-xs font-semibold text-text-muted">
                    {conf.status === 'pending_review'
                      ? '⚠ بانتظار اعتماد المدير'
                      : conf.status === 'resolved_keep_winner'
                      ? `✓ تم اعتماد القيمة الأحدث بواسطة ${conf.resolved_by}`
                      : `↺ تم استرجاع القيمة السابقة بواسطة ${conf.resolved_by}`}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-btn border border-success/40 bg-success/5 space-y-1">
                    <div className="font-bold text-success flex items-center justify-between">
                      <span>✓ القيمة الفائزة تلقائياً (الأحدث):</span>
                      <span className="font-mono">{conf.winner_device}</span>
                    </div>
                    <div className="text-sm font-bold text-text">
                      {String(conf.winner_value)}
                    </div>
                    <div className="text-[11px] text-text-muted">
                      بواسطة: {conf.winner_user}
                    </div>
                  </div>

                  <div className="p-3 rounded-btn border border-warning/40 bg-surface space-y-1">
                    <div className="font-bold text-amber-800 dark:text-warning flex items-center justify-between">
                      <span>النسخة المحفوظة للمراجعة (الأقدم):</span>
                      <span className="font-mono">{conf.loser_device}</span>
                    </div>
                    <div className="text-sm font-bold text-text">
                      {String(conf.loser_value)}
                    </div>
                    <div className="text-[11px] text-text-muted">
                      بواسطة: {conf.loser_user}
                    </div>
                  </div>
                </div>

                {conf.status === 'pending_review' && (
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() =>
                        resolveSyncConflict(
                          conf.id,
                          'restore_loser',
                          settings.current_user_name
                        )
                      }
                      className="ds-btn ds-btn-secondary text-xs py-1.5 min-h-[36px]"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-warning" />
                      <span>استرجاع القيمة الأخرى ({String(conf.loser_value)})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        resolveSyncConflict(
                          conf.id,
                          'keep_winner',
                          settings.current_user_name
                        )
                      }
                      className="ds-btn ds-btn-primary text-xs py-1.5 min-h-[36px]"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>اعتماد القيمة الحالية ({String(conf.winner_value)})</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 3. Smart Duplicate Candidates & One-Click Merger (Screen 9 - المكررات) */}
      <section className="ds-card p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <CopyCheck className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-bold">
              كشف السجلات المكررة واقتراح الدمج الذكي (رقم الهوية، الهاتف، وتطابق الاسم العربي P1.4)
            </h3>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-info/15 text-primary">
            حالات متشابهة مرصودة: {fmt(duplicatePairs.length)}
          </span>
        </div>

        {duplicatePairs.length === 0 ? (
          <div className="p-6 text-center border border-dashed border-border rounded-card text-xs text-text-muted">
            ✓ لا توجد سجلات مكررة حالياً بين الحالات النشطة. عند إضافة حالة بنفس رقم الهوية أو باسم عربي مشابه ستظهر هنا مع خيار الدمج المباشر.
          </div>
        ) : (
          <div className="space-y-3">
            {duplicatePairs.map((pair) => (
              <div
                key={pair.key}
                className="p-4 rounded-card border border-warning/40 bg-warning/5 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="space-y-1 text-xs">
                  <div className="font-bold text-amber-900 dark:text-warning flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" />
                    <span>{pair.reason_ar}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-text">
                    <span>
                      السجل الأساسي:{' '}
                      <button
                        type="button"
                        onClick={() => onSelectCase(pair.primary)}
                        className="font-mono font-bold text-primary underline"
                      >
                        {pair.primary.code}
                      </button>{' '}
                      ({pair.primary.name})
                    </span>
                    <span>↔</span>
                    <span>
                      السجل المكرر:{' '}
                      <button
                        type="button"
                        onClick={() => onSelectCase(pair.secondary)}
                        className="font-mono font-bold text-primary underline"
                      >
                        {pair.secondary.code}
                      </button>{' '}
                      ({pair.secondary.name})
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    mergeDuplicateCases(
                      pair.primary.id,
                      pair.secondary.id,
                      settings.current_user_name
                    )
                  }
                  className="ds-btn ds-btn-primary text-xs py-2"
                >
                  <GitMerge className="w-4 h-4" />
                  <span>دمج السجلين في ({pair.primary.code}) ونقل المتابعات</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
