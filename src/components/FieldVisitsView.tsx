import React, { useState } from 'react';
import {
  Calendar,
  Clock,
  MapPin,
  PlusCircle,
  CheckCircle2,
  Phone,
} from 'lucide-react';
import { BeneficiaryCase, FollowupRecord, FollowupType } from '../types/models';
import { FOLLOWUP_TYPES } from '../constants/defaultLists';
import { evaluateCaseAlerts } from '../utils/caseRules';
import { formatNumerals, toInputDateValue, toYYYYMMDD } from '../utils/formatters';
import { StatusBadge, VulnerabilityBadge } from './ui/Badge';

interface FieldVisitsViewProps {
  cases: BeneficiaryCase[];
  followups: FollowupRecord[];
  followupsByCaseId: Map<string, FollowupRecord[]>;
  overdueThresholdDays: number;
  numeralSystem: 'latin' | 'arabic_indic';
  onSelectCase: (caseRecord: BeneficiaryCase) => void;
  onAddFollowup: (input: {
    case_id: string;
    date: string;
    ftype: FollowupType;
    details: string;
  }) => Promise<void>;
}

export const FieldVisitsView: React.FC<FieldVisitsViewProps> = ({
  cases,
  followups,
  followupsByCaseId,
  overdueThresholdDays,
  numeralSystem,
  onSelectCase,
  onAddFollowup,
}) => {
  const [selectedCaseId, setSelectedCaseId] = useState(cases[0]?.id || '');
  const [date, setDate] = useState(toYYYYMMDD(new Date()));
  const [ftype, setFtype] = useState<FollowupType>('زيارة منزلية');
  const [details, setDetails] = useState('');

  const fmt = (val: string | number) => formatNumerals(val, numeralSystem);

  const casesMap = new Map(cases.map((c) => [c.id, c]));

  // Overdue cases under study (> 30 days) needing immediate visit/followup
  const overdueCases = cases.filter((c) => {
    const alerts = evaluateCaseAlerts(
      c,
      followupsByCaseId.get(c.id) || [],
      overdueThresholdDays
    );
    return alerts.some((a) => a.code === 'UNDER_STUDY_OVERDUE');
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCaseId || !details.trim()) return;
    await onAddFollowup({
      case_id: selectedCaseId,
      date,
      ftype,
      details,
    });
    setDetails('');
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="ds-card p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-text">
            سجل المتابعات وجدول الزيارات الميدانية اليومي (يعمل أوفلاين)
          </h2>
          <p className="text-xs text-text-muted mt-0.5">
            تسجيل الزيارات المنزلية والميدانية والاتصالات الهاتفية ومتابعة الحالات المتأخرة قيد الدراسة
          </p>
        </div>
        <span className="px-3 py-1.5 rounded-full bg-warning/15 text-amber-900 dark:text-warning text-xs font-bold">
          ⏰ حالات متأخرة تحتاج متابعة عاجلة: {fmt(overdueCases.length)}
        </span>
      </div>

      {/* Quick Add Followup Form */}
      <form onSubmit={handleSubmit} className="ds-card p-5 space-y-4">
        <h3 className="text-sm font-bold text-primary flex items-center gap-2">
          <PlusCircle className="w-4 h-4" />
          <span>تسجيل متابعة أو زيارة ميدانية جديدة</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-4">
            <label className="ds-label text-xs">الحالة المستفيدة</label>
            <select
              value={selectedCaseId}
              onChange={(e) => setSelectedCaseId(e.target.value)}
              className="ds-input text-xs"
            >
              {cases.slice(0, 200).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.name} ({c.general_area})
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="ds-label text-xs">تاريخ المتابعة</label>
            <input
              type="date"
              value={toInputDateValue(date)}
              onChange={(e) => setDate(toYYYYMMDD(e.target.value))}
              className="ds-input text-xs"
            />
          </div>

          <div className="md:col-span-2">
            <label className="ds-label text-xs">نوع المتابعة</label>
            <select
              value={ftype}
              onChange={(e) => setFtype(e.target.value as FollowupType)}
              className="ds-input text-xs"
            >
              {FOLLOWUP_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-3">
            <label className="ds-label text-xs">نتيجة الزيارة / المتابعة</label>
            <input
              type="text"
              required
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="ملخص المعاينة الميدانية أو الاتصال..."
              className="ds-input text-xs"
            />
          </div>

          <div className="md:col-span-1">
            <button type="submit" className="ds-btn ds-btn-primary w-full text-xs">
              حفظ
            </button>
          </div>
        </div>
      </form>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Overdue Study Cases Requiring Field Visit */}
        <div className="ds-card p-5 space-y-3">
          <div className="flex items-center gap-2 border-b border-border pb-3 text-amber-900 dark:text-warning font-bold text-sm">
            <Clock className="w-4 h-4" />
            <span>
              مسار الزيارات المقترح للحالات المتأخرة قيد الدراسة (&gt; {fmt(overdueThresholdDays)} يوماً)
            </span>
          </div>

          {overdueCases.length === 0 ? (
            <div className="p-6 text-center text-xs text-success font-semibold">
              ✓ لا توجد حالات متأخرة قيد الدراسة حالياً.
            </div>
          ) : (
            <div className="space-y-2.5">
              {overdueCases.map((c) => (
                <div
                  key={c.id}
                  className="p-3.5 rounded-card border border-warning/40 bg-warning/5 flex flex-wrap items-center justify-between gap-2"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onSelectCase(c)}
                        className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-primary text-white"
                      >
                        {c.code}
                      </button>
                      <span className="font-bold text-sm text-text">{c.name}</span>
                      <VulnerabilityBadge
                        score={c.vulnerability_score}
                        numeralSystem={numeralSystem}
                        showLabel={false}
                      />
                    </div>
                    <div className="text-xs text-text-muted flex flex-wrap items-center gap-3">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-info" />
                        {c.general_area} — {c.address}
                      </span>
                      <span className="inline-flex items-center gap-1 font-mono" dir="ltr">
                        <Phone className="w-3.5 h-3.5 text-primary" />
                        {fmt(c.phone)}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelectCase(c)}
                    className="ds-btn ds-btn-secondary text-xs py-1.5 min-h-[36px]"
                  >
                    فتح البطاقة وتسجيل زيارة
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Chronological Followups Feed */}
        <div className="ds-card p-5 space-y-3">
          <div className="flex items-center gap-2 border-b border-border pb-3 text-primary font-bold text-sm">
            <Calendar className="w-4 h-4" />
            <span>أحدث المتابعات المسجلة ({fmt(followups.length)})</span>
          </div>

          <div className="space-y-2.5 max-h-[420px] overflow-y-auto">
            {followups.map((f) => {
              const parentCase = casesMap.get(f.case_id);
              return (
                <div
                  key={f.id}
                  className="p-3 rounded-card border border-border bg-background/40 space-y-1.5 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {parentCase && (
                        <button
                          type="button"
                          onClick={() => onSelectCase(parentCase)}
                          className="font-mono font-bold px-2 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary hover:text-white transition"
                        >
                          {parentCase.code}
                        </button>
                      )}
                      <span className="font-bold text-text">
                        {parentCase?.name || 'حالة مسجلة'}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-info/15 text-primary font-semibold">
                        {f.ftype}
                      </span>
                    </div>
                    <span className="font-mono font-bold text-text-muted">{fmt(f.date)}</span>
                  </div>
                  <p className="text-text font-medium">{f.details}</p>
                  <div className="text-[11px] text-text-muted flex items-center justify-between">
                    <span>الباحث: {f.created_by}</span>
                    {parentCase && <StatusBadge status={parentCase.status} size="sm" />}
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
