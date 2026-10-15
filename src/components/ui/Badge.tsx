import React from 'react';
import { CaseAlert, CaseStatus } from '../../types/models';
import { formatNumerals } from '../../utils/formatters';

interface StatusBadgeProps {
  status: CaseStatus | string;
  size?: 'sm' | 'md';
}

/**
 * Unified Request Status Badge (Section 3 & Section 15.1):
 * - أخضر (#2E9E6B) + ✓ = تم الصرف
 * - أصفر (#F2A900) + ⏰ = قيد الدراسة
 * - أزرق (#3B82C4) + ✓ = مقبول
 * - أحمر (#D64545) + ✕ = مرفوض
 * Always pairs color with an explicit icon so meaning never relies on color alone.
 */
export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  const normalized = (status || '').trim();
  const sizeClasses = size === 'sm' ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-sm';

  switch (normalized) {
    case 'تم الصرف':
      return (
        <span
          className={`inline-flex items-center gap-1.5 font-semibold rounded-full bg-success/15 text-success border border-success/30 ${sizeClasses}`}
        >
          <span aria-hidden="true">✓</span>
          <span>تم الصرف</span>
        </span>
      );
    case 'قيد الدراسة':
      return (
        <span
          className={`inline-flex items-center gap-1.5 font-semibold rounded-full bg-warning/15 text-amber-800 dark:text-warning border border-warning/40 ${sizeClasses}`}
        >
          <span aria-hidden="true">⏰</span>
          <span>قيد الدراسة</span>
        </span>
      );
    case 'مقبول':
      return (
        <span
          className={`inline-flex items-center gap-1.5 font-semibold rounded-full bg-approved/15 text-approved border border-approved/30 ${sizeClasses}`}
        >
          <span aria-hidden="true">✓</span>
          <span>مقبول</span>
        </span>
      );
    case 'مرفوض':
      return (
        <span
          className={`inline-flex items-center gap-1.5 font-semibold rounded-full bg-danger/15 text-danger border border-danger/30 ${sizeClasses}`}
        >
          <span aria-hidden="true">✕</span>
          <span>مرفوض</span>
        </span>
      );
    default:
      return (
        <span
          className={`inline-flex items-center gap-1.5 font-semibold rounded-full bg-warning/20 text-amber-900 dark:text-warning border border-warning/40 ${sizeClasses}`}
        >
          <span aria-hidden="true">⚠</span>
          <span>غير محددة</span>
        </span>
      );
  }
};

interface AlertBadgeProps {
  alert: CaseAlert;
  compact?: boolean;
}

/**
 * Automatic Case Alert Badge (Section 7):
 * - ⚠ Warning (missing status / missing proof / missing disb_date)
 * - ⏰ Overdue study (> 30 days)
 * - ✓ Healthy
 */
export const AlertBadge: React.FC<AlertBadgeProps> = ({ alert, compact = false }) => {
  if (alert.severity === 'healthy') {
    return (
      <span
        title={alert.message_ar}
        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-success/10 text-success border border-success/25"
      >
        <span aria-hidden="true">✓</span>
        <span>{compact ? 'سليمة' : alert.message_ar}</span>
      </span>
    );
  }

  if (alert.severity === 'overdue') {
    return (
      <span
        title={alert.message_ar}
        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-warning/20 text-amber-900 dark:text-warning border border-warning/40"
      >
        <span aria-hidden="true">⏰</span>
        <span>{compact ? 'تأخر متابعة (+30 يوم)' : alert.message_ar}</span>
      </span>
    );
  }

  return (
    <span
      title={alert.message_ar}
      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-danger/15 text-danger border border-danger/30"
    >
      <span aria-hidden="true">⚠</span>
      <span>{compact ? alert.message_ar.replace('حالة «تم الصرف» ', '') : alert.message_ar}</span>
    </span>
  );
};

interface VulnerabilityBadgeProps {
  score: number;
  numeralSystem?: 'latin' | 'arabic_indic';
  showLabel?: boolean;
}

/**
 * P1.1 Transparent Vulnerability Score Badge (0 - 100)
 */
export const VulnerabilityBadge: React.FC<VulnerabilityBadgeProps> = ({
  score,
  numeralSystem = 'latin',
  showLabel = true,
}) => {
  const safeScore = Math.max(0, Math.min(100, Math.round(score || 0)));
  let colorClasses = 'bg-success/15 text-success border-success/30';
  let label = 'منخفض';

  if (safeScore >= 75) {
    colorClasses = 'bg-danger/15 text-danger border-danger/30';
    label = 'أولوية قصوى';
  } else if (safeScore >= 55) {
    colorClasses = 'bg-warning/20 text-amber-900 dark:text-warning border-warning/40';
    label = 'احتياج مرتفع';
  } else if (safeScore >= 35) {
    colorClasses = 'bg-approved/15 text-approved border-approved/30';
    label = 'متوسط';
  }

  return (
    <span
      title={`درجة الاحتياج الشفافة: ${safeScore} من 100 (${label})`}
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border ${colorClasses}`}
    >
      <span>{formatNumerals(safeScore, numeralSystem)}/100</span>
      {showLabel && <span className="font-normal opacity-90">• {label}</span>}
    </span>
  );
};
