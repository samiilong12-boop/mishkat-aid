import React, { useState } from 'react';
import {
  X,
  Printer,
  Edit3,
  Phone,
  MapPin,
  Users,
  HeartPulse,
  PackageCheck,
  Calendar,
  PlusCircle,
  History,
  FileText,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import {
  AuditLogEntry,
  BeneficiaryCase,
  FollowupRecord,
  FollowupType,
  WorkflowStage,
} from '../types/models';
import { FOLLOWUP_TYPES } from '../constants/defaultLists';
import { evaluateCaseAlerts } from '../utils/caseRules';
import { formatNumerals, toInputDateValue, toYYYYMMDD } from '../utils/formatters';
import { calculateVulnerabilityScore } from '../utils/vulnerabilityScore';
import { approveCaseWorkflowStage } from '../db/database';
import { AlertBadge, StatusBadge, VulnerabilityBadge } from './ui/Badge';

interface CaseDetailModalProps {
  caseRecord: BeneficiaryCase;
  followups: FollowupRecord[];
  auditLogs: AuditLogEntry[];
  overdueThresholdDays: number;
  numeralSystem: 'latin' | 'arabic_indic';
  orgName: string;
  currentUserName: string;
  canViewSensitiveHealth?: boolean;
  readOnlyRole?: boolean;
  onClose: () => void;
  onEdit: (caseRecord: BeneficiaryCase) => void;
  onAddFollowup: (input: {
    case_id: string;
    date: string;
    ftype: FollowupType;
    details: string;
  }) => Promise<void>;
}

const WORKFLOW_STEPS: Array<{ key: WorkflowStage; label_ar: string }> = [
  { key: 'registered', label_ar: '1. تسجيل' },
  { key: 'under_review', label_ar: '2. دراسة ميدانية' },
  { key: 'approved', label_ar: '3. اعتماد (العينين الأربعة)' },
  { key: 'disbursed', label_ar: '4. صرف' },
  { key: 'documented', label_ar: '5. توثيق مكتمل' },
];

export const CaseDetailModal: React.FC<CaseDetailModalProps> = ({
  caseRecord,
  followups,
  auditLogs,
  overdueThresholdDays,
  numeralSystem,
  orgName,
  currentUserName,
  canViewSensitiveHealth = true,
  readOnlyRole = false,
  onClose,
  onEdit,
  onAddFollowup,
}) => {
  const [fDate, setFDate] = useState(toYYYYMMDD(new Date()));
  const [fType, setFType] = useState<FollowupType>('زيارة منزلية');
  const [fDetails, setFDetails] = useState('');
  const [isAddingFollowup, setIsAddingFollowup] = useState(false);
  const [workflowFeedback, setWorkflowFeedback] = useState<{
    type: 'error' | 'success';
    msg: string;
  } | null>(null);

  const fmt = (val: string | number | undefined | null) =>
    formatNumerals(val, numeralSystem);

  const alerts = evaluateCaseAlerts(caseRecord, followups, overdueThresholdDays);
  const vulnDetails = calculateVulnerabilityScore(caseRecord);

  const handleWorkflowTransition = async (stage: WorkflowStage) => {
    setWorkflowFeedback(null);
    const res = await approveCaseWorkflowStage(caseRecord.id, stage, currentUserName);
    if (!res.success) {
      setWorkflowFeedback({ type: 'error', msg: res.error_ar || 'تعذر تحديث المرحلة' });
    } else {
      setWorkflowFeedback({
        type: 'success',
        msg: `✓ تم انتقال سير العمل إلى مرحلة (${stage}) بنجاح.`,
      });
    }
  };

  const handleFollowupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fDetails.trim()) return;
    setIsAddingFollowup(true);
    try {
      await onAddFollowup({
        case_id: caseRecord.id,
        date: fDate,
        ftype: fType,
        details: fDetails,
      });
      setFDetails('');
    } finally {
      setIsAddingFollowup(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="ds-card w-full max-w-5xl max-h-[94vh] flex flex-col overflow-hidden print:max-h-none print:border-none">
        {/* Top Action Bar (Hidden in Print) */}
        <div className="no-print px-5 py-4 bg-primary text-white flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="font-mono font-bold text-base px-3 py-1 rounded bg-white text-primary">
              {caseRecord.code}
            </span>
            <div>
              <h2 className="text-lg font-bold">{caseRecord.name}</h2>
              <p className="text-xs text-white/80">
                تاريخ التسجيل: {fmt(caseRecord.reg_date)}
                {caseRecord.temp_code && ` • المرجع المحلي: ${caseRecord.temp_code}`}
                {` • النسخة (v${fmt(caseRecord.version)}) • أُنشئت بواسطة: ${caseRecord.created_by}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="ds-btn bg-white/15 hover:bg-white/25 text-white text-xs py-2"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة البطاقة / حفظ PDF</span>
            </button>

            {!readOnlyRole && (
              <button
                type="button"
                onClick={() => onEdit(caseRecord)}
                className="ds-btn bg-white text-primary hover:bg-white/90 text-xs py-2 font-bold"
              >
                <Edit3 className="w-4 h-4" />
                <span>تعديل البيانات</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-full hover:bg-white/15 transition"
              aria-label="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Case Card Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Print-Only Official Header */}
          <div className="hidden print:flex items-center justify-between border-b-2 border-primary pb-4 mb-4">
            <div>
              <h1 className="text-xl font-bold text-primary">{orgName}</h1>
              <p className="text-xs text-text-muted">بطاقة حالة مستفيد رسمية ومعتمدة</p>
            </div>
            <div className="text-left">
              <div className="font-mono text-lg font-bold">كود الحالة: {caseRecord.code}</div>
              <div className="text-xs">تاريخ الطباعة: {toYYYYMMDD(new Date())}</div>
            </div>
          </div>

          {/* Status, Alerts, and Vulnerability Score Summary Banner */}
          <div className="p-4 rounded-card border border-border bg-background/60 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={caseRecord.status} />
                {alerts.map((a) => (
                  <AlertBadge key={a.code} alert={a} />
                ))}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-text-muted">درجة الاحتياج (P1):</span>
                <VulnerabilityBadge
                  score={caseRecord.vulnerability_score}
                  numeralSystem={numeralSystem}
                />
              </div>
            </div>

            {/* P1.3 Workflow & Four-Eyes Approval Stepper */}
            <div className="no-print pt-3 border-t border-border space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-bold text-primary">
                  سير العمل والاعتماد بمبدأ «العينين الأربعة» (P1.3 — من يُدخل لا يعتمد):
                </span>
                <span className="text-text-muted">
                  المُدخل: <strong>{caseRecord.created_by}</strong>
                  {caseRecord.approved_by && (
                    <>
                      {' '}
                      • المُعتمد: <strong className="text-success">{caseRecord.approved_by}</strong>
                    </>
                  )}
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {WORKFLOW_STEPS.map((step) => {
                  const isCurrent = (caseRecord.workflow_stage || 'registered') === step.key;
                  return (
                    <button
                      key={step.key}
                      type="button"
                      disabled={readOnlyRole}
                      onClick={() => handleWorkflowTransition(step.key)}
                      className={`px-3 py-1.5 rounded-btn text-xs font-bold border transition ${
                        isCurrent
                          ? 'bg-primary text-white border-primary'
                          : 'bg-surface text-text-muted border-border hover:border-primary'
                      }`}
                    >
                      {step.label_ar}
                    </button>
                  );
                })}
              </div>

              {workflowFeedback && (
                <div
                  className={`p-2.5 rounded text-xs font-bold ${
                    workflowFeedback.type === 'error'
                      ? 'bg-danger/10 text-danger border border-danger/30'
                      : 'bg-success/10 text-success border border-success/30'
                  }`}
                >
                  {workflowFeedback.msg}
                </div>
              )}
            </div>
          </div>

          {/* Main 2-Column Case Details Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* 1. Identification & Contact */}
            <div className="ds-card p-4 space-y-3">
              <div className="flex items-center gap-2 border-b border-border pb-2 text-primary font-bold text-sm">
                <Phone className="w-4 h-4" />
                <span>البيانات الشخصية والتواصل والإحالة</span>
              </div>
              <dl className="grid grid-cols-2 gap-y-2.5 gap-x-4 text-xs">
                <div>
                  <dt className="text-text-muted">الاسم الكامل (رب الأسرة):</dt>
                  <dd className="font-bold text-sm text-text">{caseRecord.name}</dd>
                </div>
                <div>
                  <dt className="text-text-muted">رقم الهوية / الجواز:</dt>
                  <dd className="font-mono font-bold text-sm text-text" dir="ltr">
                    {caseRecord.national_id ? fmt(caseRecord.national_id) : 'غير مسجل'}
                  </dd>
                </div>
                <div>
                  <dt className="text-text-muted">الجنسية / الحالة الاجتماعية:</dt>
                  <dd className="font-semibold text-text">
                    {caseRecord.nationality} • {caseRecord.marital || '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-text-muted">أرقام الهاتف:</dt>
                  <dd className="font-mono font-bold text-text" dir="ltr">
                    {fmt(caseRecord.phone)}
                    {caseRecord.phone2 ? ` / ${fmt(caseRecord.phone2)}` : ''}
                  </dd>
                </div>
                <div>
                  <dt className="text-text-muted">جهة الإحالة / المصدر:</dt>
                  <dd className="font-semibold text-text">{caseRecord.referral || '—'}</dd>
                </div>
                <div>
                  <dt className="text-text-muted">بيانات المُحيل:</dt>
                  <dd className="font-semibold text-text">
                    {[caseRecord.referrer_name, caseRecord.referrer_org, caseRecord.referrer_phone]
                      .filter(Boolean)
                      .join(' - ') || '—'}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-text-muted flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-info" />
                    <span>المنطقة العامة والعنوان التفصيلي:</span>
                  </dt>
                  <dd className="font-semibold text-text mt-0.5 flex flex-wrap items-center gap-1.5">
                    <span className="px-2.5 py-0.5 rounded bg-primary/10 text-primary font-bold text-xs">
                      {caseRecord.governorate && caseRecord.sub_district
                        ? `${caseRecord.governorate} — ${caseRecord.sub_district}`
                        : caseRecord.general_area}
                    </span>
                    <span>{caseRecord.address || 'لم يُسجّل عنوان تفصيلي'}</span>
                    {caseRecord.gps_lat && caseRecord.gps_lng && (
                      <span className="font-mono text-[11px] text-text-muted mr-1" dir="ltr">
                        (GPS: {caseRecord.gps_lat}, {caseRecord.gps_lng})
                      </span>
                    )}
                  </dd>
                </div>
              </dl>
            </div>

            {/* 2. Family, Health & Need */}
            <div className="ds-card p-4 space-y-3">
              <div className="flex items-center gap-2 border-b border-border pb-2 text-primary font-bold text-sm">
                <Users className="w-4 h-4" />
                <span>بيانات الأسرة، الحالة الصحية، والسكن</span>
              </div>
              <dl className="grid grid-cols-2 gap-y-2.5 gap-x-4 text-xs">
                <div>
                  <dt className="text-text-muted">عدد أفراد الأسرة:</dt>
                  <dd className="font-bold text-sm text-primary">
                    {fmt(caseRecord.family_count)} أفراد
                  </dd>
                </div>
                <div>
                  <dt className="text-text-muted">المعيل وصلة القرابة:</dt>
                  <dd className="font-semibold text-text">
                    {caseRecord.breadwinner || '—'} ({caseRecord.breadwinner_rel || '—'})
                  </dd>
                </div>
                <div>
                  <dt className="text-text-muted">نوع السكن / الدخل:</dt>
                  <dd className="font-semibold text-text">
                    {caseRecord.housing_type || '—'} • {caseRecord.income_status || '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-text-muted flex items-center gap-1">
                    <HeartPulse className="w-3.5 h-3.5 text-danger" />
                    <span>الحالة الصحية:</span>
                  </dt>
                  <dd className="font-bold text-text">{caseRecord.health || 'سليم'}</dd>
                </div>
                {caseRecord.health_desc && (
                  <div className="col-span-2">
                    <dt className="text-text-muted">وصف الحالة الصحية والتشخيص (حساس):</dt>
                    <dd className="font-semibold text-danger bg-danger/5 p-2 rounded mt-0.5">
                      {canViewSensitiveHealth
                        ? caseRecord.health_desc
                        : '🔒 [بيانات طبية حساسة محجوبة لهذا الدور الوظيفي]'}
                    </dd>
                  </div>
                )}
                <div className="col-span-2">
                  <dt className="text-text-muted">أسماء وتفاصيل أفراد الأسرة:</dt>
                  <dd className="font-medium text-text bg-background/60 p-2 rounded mt-0.5">
                    {caseRecord.family_names || 'لم تُسجّل أسماء تفصيلية'}
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          {/* 3. Aid Details & Disbursement Proof */}
          <div className="ds-card p-4 space-y-3">
            <div className="flex items-center gap-2 border-b border-border pb-2 text-primary font-bold text-sm">
              <PackageCheck className="w-4 h-4" />
              <span>تفاصيل الاحتياج والمساعدات وإثبات الصرف</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div>
                <span className="text-text-muted block">فئة المساعدة الرئيسية:</span>
                <span className="font-bold text-sm text-primary">{caseRecord.aid_cat || '—'}</span>
              </div>
              <div className="md:col-span-2">
                <span className="text-text-muted block mb-1">أنواع المساعدة المحددة:</span>
                <div className="flex flex-wrap gap-1.5">
                  {(caseRecord.aid_types || []).length > 0 ? (
                    caseRecord.aid_types.map((t) => (
                      <span
                        key={t}
                        className="px-2.5 py-1 rounded-full bg-primary/10 text-primary font-semibold"
                      >
                        {t}
                      </span>
                    ))
                  ) : (
                    <span className="text-text-muted">لم تحدد أنواع فرعية</span>
                  )}
                </div>
              </div>

              <div className="md:col-span-3">
                <span className="text-text-muted block">وصف حالة الأسرة والاحتياج:</span>
                <p className="font-medium text-text bg-background/60 p-2.5 rounded mt-1 leading-relaxed">
                  {caseRecord.need_desc || '—'}
                </p>
              </div>

              <div>
                <span className="text-text-muted block">تاريخ الصرف:</span>
                <span className="font-bold text-text">
                  {caseRecord.disb_date ? fmt(caseRecord.disb_date) : 'لم يُصرف بعد'}
                </span>
              </div>
              <div>
                <span className="text-text-muted block">طريقة إثبات الاستلام:</span>
                <span className="font-bold text-text">{caseRecord.proof_method || '—'}</span>
              </div>
              <div>
                <span className="text-text-muted block">ملاحظات الباحث الاجتماعي:</span>
                <span className="font-medium text-text">{caseRecord.notes || '—'}</span>
              </div>
            </div>

            {/* Attachments Preview Row */}
            {(caseRecord.id_attach || caseRecord.medical_attach || caseRecord.proof_attach) && (
              <div className="pt-3 border-t border-border space-y-2">
                <h4 className="text-xs font-bold text-text flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-primary" />
                  <span>المرفقات والوثائق المحفوظة مع البطاقة:</span>
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {[
                    { title: 'مرفق الهوية (حساس)', val: caseRecord.id_attach },
                    { title: 'مرفق التقارير الطبية (حساس)', val: caseRecord.medical_attach },
                    { title: 'مرفق إثبات الاستلام', val: caseRecord.proof_attach },
                  ]
                    .filter((item) => Boolean(item.val))
                    .map((item) => (
                      <div
                        key={item.title}
                        className="p-2.5 rounded-btn border border-border bg-background/50 space-y-1.5"
                      >
                        <div className="text-xs font-bold text-text flex items-center justify-between">
                          <span>{item.title}</span>
                          <ShieldCheck className="w-4 h-4 text-success" />
                        </div>
                        {item.val.startsWith('data:image/') ? (
                          <img
                            src={item.val}
                            alt={item.title}
                            className="max-h-36 mx-auto rounded border border-border object-contain bg-white"
                          />
                        ) : (
                          <div className="text-xs text-primary truncate" dir="ltr">
                            {item.val}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>

          {/* 4. Transparent Vulnerability Score Breakdown (Section 14 P1.1) */}
          <div className="ds-card p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <div className="flex items-center gap-2 text-primary font-bold text-sm">
                <Sparkles className="w-4 h-4" />
                <span>تفسير درجة الاحتياج الشفافة (P1.1 Vulnerability Breakdown)</span>
              </div>
              <span className="text-xs font-bold text-text">
                المجموع: {fmt(vulnDetails.score)} / {fmt(100)} ({vulnDetails.level_ar})
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 text-xs">
              {vulnDetails.breakdown.map((b) => (
                <div
                  key={b.key}
                  className="p-2.5 rounded-btn border border-border bg-background/40 space-y-1"
                >
                  <div className="flex items-center justify-between font-bold text-text">
                    <span>{b.label_ar}</span>
                    <span className="text-primary">
                      {fmt(b.points)}/{fmt(b.max_points)}
                    </span>
                  </div>
                  <div className="text-[11px] text-text-muted">{b.reason_ar}</div>
                </div>
              ))}
            </div>
            <div className="text-xs text-text-muted pt-1">
              <strong>الوصف المجهول المعتمد لبوابة الداعمين (Zero-PII):</strong>{' '}
              <span className="text-text font-medium">{caseRecord.anonymized_summary}</span>
            </div>
          </div>

          {/* 5. Followups Log & Add Followup Form (Section 4.2) */}
          <div className="ds-card p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <div className="flex items-center gap-2 text-primary font-bold text-sm">
                <Calendar className="w-4 h-4" />
                <span>سجل المتابعات الميدانية للحالة ({fmt(followups.length)})</span>
              </div>
            </div>

            {/* Add Followup Form (Hidden in Print) */}
            <form
              onSubmit={handleFollowupSubmit}
              className="no-print p-3 rounded-card border border-border bg-background/50 grid grid-cols-1 md:grid-cols-12 gap-2.5 items-end"
            >
              <div className="md:col-span-3">
                <label className="ds-label text-xs">تاريخ المتابعة</label>
                <input
                  type="date"
                  value={toInputDateValue(fDate)}
                  onChange={(e) => setFDate(toYYYYMMDD(e.target.value))}
                  className="ds-input text-xs py-1.5 min-h-[38px]"
                />
              </div>

              <div className="md:col-span-3">
                <label className="ds-label text-xs">نوع المتابعة</label>
                <select
                  value={fType}
                  onChange={(e) => setFType(e.target.value as FollowupType)}
                  className="ds-input text-xs py-1.5 min-h-[38px]"
                >
                  {FOLLOWUP_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-4">
                <label className="ds-label text-xs">تفاصيل وملاحظات المتابعة</label>
                <input
                  type="text"
                  required
                  value={fDetails}
                  onChange={(e) => setFDetails(e.target.value)}
                  placeholder="اكتب نتائج الزيارة المنزلية أو الاتصال..."
                  className="ds-input text-xs py-1.5 min-h-[38px]"
                />
              </div>

              <div className="md:col-span-2">
                <button
                  type="submit"
                  disabled={isAddingFollowup}
                  className="ds-btn ds-btn-primary w-full text-xs py-1.5 min-h-[38px]"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>إضافة متابعة</span>
                </button>
              </div>
            </form>

            {/* Followups List */}
            {followups.length === 0 ? (
              <p className="text-xs text-text-muted py-2">
                لا توجد متابعات مسجلة لهذه الحالة حتى الآن.
              </p>
            ) : (
              <div className="space-y-2">
                {followups.map((f) => (
                  <div
                    key={f.id}
                    className="p-3 rounded-btn border border-border bg-surface flex flex-wrap items-start justify-between gap-2 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-primary/10 text-primary font-bold">
                          {f.ftype}
                        </span>
                        <span className="font-mono font-bold text-text">{fmt(f.date)}</span>
                        <span className="text-text-muted">• بواسطة: {f.created_by}</span>
                      </div>
                      <p className="text-text font-medium">{f.details}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 6. Audit Log Timeline for this Case (Screen 5 Requirement) */}
          <div className="no-print ds-card p-4 space-y-3">
            <div className="flex items-center gap-2 border-b border-border pb-2 text-text-muted font-bold text-xs">
              <History className="w-4 h-4" />
              <span>السجل الزمني للتعديلات والتدقيق (Audit Timeline)</span>
            </div>
            <div className="space-y-1.5 max-h-36 overflow-y-auto text-xs">
              {auditLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex flex-wrap items-center justify-between py-1 border-b border-border/50 text-text-muted"
                >
                  <span>
                    <strong className="text-text">{log.actor_name}:</strong> {log.summary_ar}
                  </span>
                  <span className="font-mono text-[11px]" dir="ltr">
                    {new Date(log.timestamp).toLocaleString('ar-EG')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
