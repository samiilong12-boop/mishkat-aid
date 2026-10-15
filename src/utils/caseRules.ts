import { BeneficiaryCase, CaseAlert, FollowupRecord } from '../types/models';
import { daysSinceDate, isValidDateString } from './formatters';

export interface CaseValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Evaluates automatic Case Alerts according to Section 7 Business Rules:
 * - ⚠ حالة الطلب غير محددة.
 * - ⚠ حالة «تم الصرف» بلا مرفق إثبات استلام، أو بلا تاريخ صرف.
 * - ⏰ حالة «قيد الدراسة» مضى على آخر متابعة (أو التسجيل إن لم توجد متابعة) أكثر من 30 يوماً (قابل للضبط).
 * - ✓ سليمة.
 */
export function evaluateCaseAlerts(
  caseRecord: Pick<
    BeneficiaryCase,
    'status' | 'disb_date' | 'proof_attach' | 'proof_method' | 'reg_date'
  >,
  caseFollowups: Array<Pick<FollowupRecord, 'date' | 'deleted_at'>> = [],
  overdueThresholdDays = 30,
  referenceDate: Date = new Date()
): CaseAlert[] {
  const alerts: CaseAlert[] = [];
  const status = (caseRecord.status || '').trim();

  // Rule 1: Request status is undefined or invalid
  const validStatuses = ['قيد الدراسة', 'مقبول', 'تم الصرف', 'مرفوض'];
  if (!status || !validStatuses.includes(status)) {
    alerts.push({
      code: 'STATUS_UNDEFINED',
      severity: 'warning',
      icon: '⚠',
      message_ar: 'حالة الطلب غير محددة',
    });
  }

  // Rule 2: Status is "تم الصرف" without proof attachment or without disbursement date
  if (status === 'تم الصرف') {
    const hasProofAttach = Boolean((caseRecord.proof_attach || '').trim());
    const hasDisbDate = Boolean((caseRecord.disb_date || '').trim());

    if (!hasProofAttach) {
      alerts.push({
        code: 'DISBURSED_MISSING_PROOF',
        severity: 'warning',
        icon: '⚠',
        message_ar: 'حالة «تم الصرف» بلا مرفق إثبات استلام',
      });
    }
    if (!hasDisbDate) {
      alerts.push({
        code: 'DISBURSED_MISSING_DATE',
        severity: 'warning',
        icon: '⚠',
        message_ar: 'حالة «تم الصرف» بلا تاريخ صرف',
      });
    }
  }

  // Rule 3: Status is "قيد الدراسة" and > overdueThresholdDays since last followup (or reg_date)
  if (status === 'قيد الدراسة') {
    const activeFollowups = caseFollowups
      .filter((f) => !f.deleted_at && f.date)
      .sort((a, b) => b.date.localeCompare(a.date));

    const lastAnchorDate =
      activeFollowups.length > 0 ? activeFollowups[0].date : caseRecord.reg_date;

    const elapsedDays = daysSinceDate(lastAnchorDate, referenceDate);
    if (elapsedDays > overdueThresholdDays) {
      alerts.push({
        code: 'UNDER_STUDY_OVERDUE',
        severity: 'overdue',
        icon: '⏰',
        message_ar: `قيد الدراسة منذ ${elapsedDays} يوماً دون متابعة حديثة (الحد ${overdueThresholdDays} يوماً)`,
      });
    }
  }

  // Rule 4: Healthy if no alerts triggered
  if (alerts.length === 0) {
    alerts.push({
      code: 'HEALTHY',
      severity: 'healthy',
      icon: '✓',
      message_ar: 'سليمة',
    });
  }

  return alerts;
}

/**
 * Validates a BeneficiaryCase before saving according to Section 7 Business Rules:
 * - الاسم مطلوب لحفظ الحالة.
 * - عدد الأفراد رقم صحيح (0-99).
 * - التواريخ صحيحة.
 * - الصرف لا يُعتمد كـ«تم الصرف» نهائياً إلا بوجود إثبات استلام (عند التفعيل الصارم).
 */
export function validateCaseInput(
  input: Partial<BeneficiaryCase>,
  options: { enforceStrictProofOnDisbursed?: boolean } = { enforceStrictProofOnDisbursed: true }
): CaseValidationResult {
  const errors: string[] = [];

  if (!input.name || !input.name.trim()) {
    errors.push('اسم المستفيد (رب الأسرة) مطلوب لحفظ الحالة.');
  }

  if (input.family_count !== undefined && input.family_count !== null) {
    const count = Number(input.family_count);
    if (!Number.isInteger(count) || count < 0 || count > 99) {
      errors.push('عدد أفراد الأسرة يجب أن يكون رقماً صحيحاً بين 0 و 99.');
    }
  }

  if (input.reg_date && !isValidDateString(input.reg_date)) {
    errors.push('تاريخ التسجيل غير صحيح (يجب أن يكون بصيغة YYYY/MM/DD).');
  }

  if (input.disb_date && input.disb_date.trim() !== '' && !isValidDateString(input.disb_date)) {
    errors.push('تاريخ الصرف غير صحيح (يجب أن يكون بصيغة YYYY/MM/DD).');
  }

  if (
    options.enforceStrictProofOnDisbursed &&
    input.status === 'تم الصرف'
  ) {
    if (!input.proof_attach || !input.proof_attach.trim()) {
      errors.push(
        'قواعد العمل: لا يُعتمد الطلب كـ«تم الصرف» نهائياً إلا بوجود مرفق أو رابط إثبات استلام.'
      );
    }
    if (!input.disb_date || !input.disb_date.trim()) {
      errors.push('قواعد العمل: يرجى تحديد تاريخ الصرف عند اختيار حالة «تم الصرف».');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
