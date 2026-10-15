import React, { useMemo } from 'react';
import {
  Users,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  ShieldAlert,
  PlusCircle,
  Download,
  RefreshCw,
  ArrowLeft,
  Flame,
  BarChart3,
  MapPin,
} from 'lucide-react';
import { BeneficiaryCase, CaseAlert, FollowupRecord } from '../types/models';
import { evaluateCaseAlerts } from '../utils/caseRules';
import { formatNumerals } from '../utils/formatters';
import { StatusBadge, VulnerabilityBadge } from './ui/Badge';

interface DashboardViewProps {
  cases: BeneficiaryCase[];
  followupsByCaseId: Map<string, FollowupRecord[]>;
  overdueThresholdDays: number;
  numeralSystem: 'latin' | 'arabic_indic';
  pendingOutboxCount: number;
  onOpenNewCase: () => void;
  onSelectCase: (caseRecord: BeneficiaryCase) => void;
  onNavigateToCasesWithFilter: (filterPreset: {
    status?: string;
    alertFilter?: string;
    aidCat?: string;
  }) => void;
  onExportCsv: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  cases,
  followupsByCaseId,
  overdueThresholdDays,
  numeralSystem,
  pendingOutboxCount,
  onOpenNewCase,
  onSelectCase,
  onNavigateToCasesWithFilter,
  onExportCsv,
}) => {
  const fmt = (val: string | number) => formatNumerals(val, numeralSystem);

  const stats = useMemo(() => {
    let disbursed = 0;
    let approved = 0;
    let underStudy = 0;
    let rejected = 0;
    let totalFamilyMembers = 0;
    let criticalPriority = 0;

    let missingProofCount = 0;
    let overdueStudyCount = 0;
    let undefinedStatusCount = 0;
    let healthyCount = 0;

    const byCategory: Record<string, number> = {};
    const byArea: Record<string, number> = {};
    const byNationality: Record<string, number> = {};
    const casesWithAlerts: Array<{ caseRecord: BeneficiaryCase; alerts: CaseAlert[] }> = [];

    for (const c of cases) {
      totalFamilyMembers += Number(c.family_count) || 0;
      if ((c.vulnerability_score || 0) >= 75) criticalPriority++;

      if (c.status === 'تم الصرف') disbursed++;
      else if (c.status === 'مقبول') approved++;
      else if (c.status === 'قيد الدراسة') underStudy++;
      else if (c.status === 'مرفوض') rejected++;

      const cat = c.aid_cat || 'غير محدد';
      byCategory[cat] = (byCategory[cat] || 0) + 1;

      const area = c.general_area || 'غير محدد';
      byArea[area] = (byArea[area] || 0) + 1;

      const nat = c.nationality || 'غير محدد';
      byNationality[nat] = (byNationality[nat] || 0) + 1;

      const fups = followupsByCaseId.get(c.id) || [];
      const alerts = evaluateCaseAlerts(c, fups, overdueThresholdDays);
      const isHealthy = alerts.length === 1 && alerts[0].code === 'HEALTHY';

      if (isHealthy) {
        healthyCount++;
      } else {
        if (casesWithAlerts.length < 8) {
          casesWithAlerts.push({ caseRecord: c, alerts });
        }
        for (const a of alerts) {
          if (a.code === 'DISBURSED_MISSING_PROOF' || a.code === 'DISBURSED_MISSING_DATE') {
            missingProofCount++;
          } else if (a.code === 'UNDER_STUDY_OVERDUE') {
            overdueStudyCount++;
          } else if (a.code === 'STATUS_UNDEFINED') {
            undefinedStatusCount++;
          }
        }
      }
    }

    return {
      totalCases: cases.length,
      totalFamilyMembers,
      disbursed,
      approved,
      underStudy,
      rejected,
      criticalPriority,
      missingProofCount,
      overdueStudyCount,
      undefinedStatusCount,
      healthyCount,
      totalAlerts: missingProofCount + overdueStudyCount + undefinedStatusCount,
      byCategory: Object.entries(byCategory).sort((a, b) => b[1] - a[1]),
      byArea: Object.entries(byArea).sort((a, b) => b[1] - a[1]),
      byNationality: Object.entries(byNationality).sort((a, b) => b[1] - a[1]),
      casesWithAlerts,
    };
  }, [cases, followupsByCaseId, overdueThresholdDays]);

  return (
    <div className="space-y-6 pb-8">
      {/* Top Action & Sync Status Banner */}
      <div className="ds-card p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-text">لوحة المؤشرات والتنبيهات التشغيلية</h2>
          <p className="text-sm text-text-muted mt-0.5">
            قراءة فورية من القاعدة المحلية (Offline-First) • إجمالي المستفيدين المشمولين بالأسر:{' '}
            <strong className="text-primary">{fmt(stats.totalFamilyMembers)} فرداً</strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="px-3 py-2 rounded-btn bg-info/10 border border-info/30 text-xs font-semibold text-primary flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-info" />
            <span>
              يعمل دون اتصال (محلي) • {fmt(pendingOutboxCount)} عملية في طابور المزامنة (Outbox)
            </span>
          </div>

          <button
            type="button"
            onClick={onExportCsv}
            className="ds-btn ds-btn-secondary text-sm"
          >
            <Download className="w-4 h-4 text-primary" />
            <span>تصدير Excel/CSV (UTF-8 BOM)</span>
          </button>

          <button
            type="button"
            onClick={onOpenNewCase}
            className="ds-btn ds-btn-primary text-sm"
          >
            <PlusCircle className="w-4 h-4" />
            <span>إضافة حالة جديدة</span>
          </button>
        </div>
      </div>

      {/* Primary KPIs Grid (Status colors + icons per Section 3 & 15) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        <button
          type="button"
          onClick={() => onNavigateToCasesWithFilter({})}
          className="ds-card p-4 text-right hover:border-primary transition group"
        >
          <div className="flex items-center justify-between text-text-muted text-xs font-medium">
            <span>إجمالي الحالات</span>
            <Users className="w-5 h-5 text-primary" />
          </div>
          <div className="text-3xl font-bold text-text mt-2">{fmt(stats.totalCases)}</div>
          <div className="text-xs text-text-muted mt-1">
            تضم {fmt(stats.totalFamilyMembers)} فرداً مستفيداً
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigateToCasesWithFilter({ status: 'تم الصرف' })}
          className="ds-card p-4 text-right border-r-4 border-r-success hover:border-success transition"
        >
          <div className="flex items-center justify-between text-success text-xs font-bold">
            <span>✓ تم الصرف</span>
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div className="text-3xl font-bold text-success mt-2">{fmt(stats.disbursed)}</div>
          <div className="text-xs text-text-muted mt-1">
            {stats.totalCases > 0
              ? `${fmt(Math.round((stats.disbursed / stats.totalCases) * 100))}% من الإجمالي`
              : '0%'}
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigateToCasesWithFilter({ status: 'مقبول' })}
          className="ds-card p-4 text-right border-r-4 border-r-approved hover:border-approved transition"
        >
          <div className="flex items-center justify-between text-approved text-xs font-bold">
            <span>✓ مقبول (بانتظار الصرف)</span>
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div className="text-3xl font-bold text-approved mt-2">{fmt(stats.approved)}</div>
          <div className="text-xs text-text-muted mt-1">معتمد وجاهز للتسليم</div>
        </button>

        <button
          type="button"
          onClick={() => onNavigateToCasesWithFilter({ status: 'قيد الدراسة' })}
          className="ds-card p-4 text-right border-r-4 border-r-warning hover:border-warning transition"
        >
          <div className="flex items-center justify-between text-amber-800 dark:text-warning text-xs font-bold">
            <span>⏰ قيد الدراسة</span>
            <Clock className="w-5 h-5" />
          </div>
          <div className="text-3xl font-bold text-amber-800 dark:text-warning mt-2">
            {fmt(stats.underStudy)}
          </div>
          <div className="text-xs text-text-muted mt-1">تحت البحث الميداني</div>
        </button>

        <button
          type="button"
          onClick={() => onNavigateToCasesWithFilter({ status: 'مرفوض' })}
          className="ds-card p-4 text-right border-r-4 border-r-danger hover:border-danger transition"
        >
          <div className="flex items-center justify-between text-danger text-xs font-bold">
            <span>✕ مرفوض</span>
            <XCircle className="w-5 h-5" />
          </div>
          <div className="text-3xl font-bold text-danger mt-2">{fmt(stats.rejected)}</div>
          <div className="text-xs text-text-muted mt-1">غير مستوفٍ للشروط</div>
        </button>

        <button
          type="button"
          onClick={() => onNavigateToCasesWithFilter({ alertFilter: 'has_alerts' })}
          className="ds-card p-4 text-right border-r-4 border-r-primary hover:border-primary transition"
        >
          <div className="flex items-center justify-between text-primary text-xs font-bold">
            <span>أولوية قصوى (P1 &ge; 75)</span>
            <Flame className="w-5 h-5 text-danger" />
          </div>
          <div className="text-3xl font-bold text-text mt-2">{fmt(stats.criticalPriority)}</div>
          <div className="text-xs text-text-muted mt-1">حسب درجة الاحتياج الشفافة</div>
        </button>
      </div>

      {/* Automatic Case Alerts Center (Section 7 Mandatory Rules) */}
      <div className="ds-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-warning" />
            <h3 className="text-lg font-bold">
              التنبيهات التلقائية وفحص جودة البيانات (القسم 7)
            </h3>
          </div>
          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-warning/15 text-amber-900 dark:text-warning">
            إجمالي التنبيهات النشطة: {fmt(stats.totalAlerts)}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            type="button"
            onClick={() => onNavigateToCasesWithFilter({ alertFilter: 'missing_proof' })}
            className="p-3.5 rounded-card border border-danger/30 bg-danger/5 hover:bg-danger/10 text-right transition flex items-start justify-between"
          >
            <div>
              <div className="text-xs font-bold text-danger flex items-center gap-1">
                <span>⚠</span>
                <span>«تم الصرف» بلا إثبات أو تاريخ</span>
              </div>
              <div className="text-2xl font-bold text-text mt-1">
                {fmt(stats.missingProofCount)}
              </div>
              <div className="text-[11px] text-text-muted mt-0.5">
                يتطلب رفع إيصال أو توقيع المستفيد
              </div>
            </div>
            <ArrowLeft className="w-4 h-4 text-danger mt-1" />
          </button>

          <button
            type="button"
            onClick={() => onNavigateToCasesWithFilter({ alertFilter: 'overdue_followup' })}
            className="p-3.5 rounded-card border border-warning/40 bg-warning/10 hover:bg-warning/20 text-right transition flex items-start justify-between"
          >
            <div>
              <div className="text-xs font-bold text-amber-900 dark:text-warning flex items-center gap-1">
                <span>⏰</span>
                <span>قيد الدراسة لأكثر من {fmt(overdueThresholdDays)} يوماً</span>
              </div>
              <div className="text-2xl font-bold text-text mt-1">
                {fmt(stats.overdueStudyCount)}
              </div>
              <div className="text-[11px] text-text-muted mt-0.5">
                مضى عليها الحد الأقصى دون متابعة
              </div>
            </div>
            <ArrowLeft className="w-4 h-4 text-amber-800 mt-1" />
          </button>

          <button
            type="button"
            onClick={() => onNavigateToCasesWithFilter({ alertFilter: 'undefined_status' })}
            className="p-3.5 rounded-card border border-border bg-background/60 hover:border-primary text-right transition flex items-start justify-between"
          >
            <div>
              <div className="text-xs font-bold text-text flex items-center gap-1">
                <span>⚠</span>
                <span>حالة الطلب غير محددة</span>
              </div>
              <div className="text-2xl font-bold text-text mt-1">
                {fmt(stats.undefinedStatusCount)}
              </div>
              <div className="text-[11px] text-text-muted mt-0.5">
                سجلات تحتاج تحديد حالة الطلب
              </div>
            </div>
            <ArrowLeft className="w-4 h-4 text-text-muted mt-1" />
          </button>

          <button
            type="button"
            onClick={() => onNavigateToCasesWithFilter({ alertFilter: 'healthy' })}
            className="p-3.5 rounded-card border border-success/30 bg-success/5 hover:bg-success/10 text-right transition flex items-start justify-between"
          >
            <div>
              <div className="text-xs font-bold text-success flex items-center gap-1">
                <span>✓</span>
                <span>حالات سليمة ومكتملة التوثيق</span>
              </div>
              <div className="text-2xl font-bold text-success mt-1">
                {fmt(stats.healthyCount)}
              </div>
              <div className="text-[11px] text-text-muted mt-0.5">
                مستوفية لجميع قواعد العمل
              </div>
            </div>
            <ArrowLeft className="w-4 h-4 text-success mt-1" />
          </button>
        </div>

        {/* Immediate Actionable Alert Cases */}
        {stats.casesWithAlerts.length > 0 && (
          <div className="pt-2">
            <h4 className="text-xs font-bold text-text-muted mb-2">
              حالات تتطلب تدخلاً سريعاً (اضغط على الكود لفتح بطاقة الحالة):
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {stats.casesWithAlerts.map(({ caseRecord, alerts }) => (
                <div
                  key={caseRecord.id}
                  className="p-3 rounded-btn border border-border bg-background/40 flex flex-wrap items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onSelectCase(caseRecord)}
                      className="font-mono font-bold text-xs px-2.5 py-1 rounded bg-primary text-white hover:bg-primary-dark transition"
                    >
                      {caseRecord.code}
                    </button>
                    <div>
                      <div className="text-sm font-bold text-text">{caseRecord.name}</div>
                      <div className="text-xs text-danger font-medium">
                        {alerts.map((a) => `${a.icon} ${a.message_ar}`).join(' • ')}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <VulnerabilityBadge
                      score={caseRecord.vulnerability_score}
                      numeralSystem={numeralSystem}
                      showLabel={false}
                    />
                    <StatusBadge status={caseRecord.status} size="sm" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Charts & Breakdowns (6-Color Colorblind-Safe Palette) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Aid Category Breakdown */}
        <div className="ds-card p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <BarChart3 className="w-5 h-5 text-primary" />
            <h3 className="text-base font-bold">توزيع الحالات حسب فئة المساعدة الرئيسية</h3>
          </div>
          <div className="space-y-3">
            {stats.byCategory.map(([cat, count], idx) => {
              const pct = stats.totalCases > 0 ? Math.round((count / stats.totalCases) * 100) : 0;
              const chartColor = `var(--chart-${(idx % 6) + 1})`;
              return (
                <div key={cat} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <button
                      type="button"
                      onClick={() => onNavigateToCasesWithFilter({ aidCat: cat })}
                      className="font-semibold text-text hover:text-primary transition"
                    >
                      {cat}
                    </button>
                    <span className="text-xs font-bold text-text-muted">
                      {fmt(count)} حالة ({fmt(pct)}%)
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-background rounded-full overflow-hidden border border-border">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${Math.max(4, pct)}%`, backgroundColor: chartColor }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Regional Heatmap / Distribution (General Area) */}
        <div className="ds-card p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <MapPin className="w-5 h-5 text-info" />
            <h3 className="text-base font-bold">
              توزيع الاحتياج حسب المنطقة العامة (آمن للعرض المجمّع)
            </h3>
          </div>
          <div className="space-y-3">
            {stats.byArea.slice(0, 6).map(([area, count], idx) => {
              const pct = stats.totalCases > 0 ? Math.round((count / stats.totalCases) * 100) : 0;
              const chartColor = `var(--chart-${((idx + 1) % 6) + 1})`;
              return (
                <div key={area} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-text">{area}</span>
                    <span className="text-xs font-bold text-text-muted">
                      {fmt(count)} أسرة ({fmt(pct)}%)
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-background rounded-full overflow-hidden border border-border">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${Math.max(4, pct)}%`, backgroundColor: chartColor }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
