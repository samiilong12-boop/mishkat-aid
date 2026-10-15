import { BeneficiaryCase, DistributionRecord } from '../types/models';

export const UTF8_BOM = '\uFEFF';

export interface CsvColumnDef {
  key: keyof BeneficiaryCase | 'aid_types_str';
  header_ar: string;
  preserveLeadingZero?: boolean;
}

export const CASE_EXPORT_COLUMNS: CsvColumnDef[] = [
  { key: 'code', header_ar: 'كود الحالة' },
  { key: 'temp_code', header_ar: 'الكود المؤقت (أوفلاين)' },
  { key: 'reg_date', header_ar: 'تاريخ التسجيل' },
  { key: 'name', header_ar: 'اسم المستفيد (رب الأسرة)' },
  { key: 'national_id', header_ar: 'رقم الهوية / الجواز', preserveLeadingZero: true },
  { key: 'nationality', header_ar: 'الجنسية' },
  { key: 'referral', header_ar: 'جهة الإحالة / المصدر' },
  { key: 'referrer_name', header_ar: 'اسم الشخص المُحيل' },
  { key: 'referrer_phone', header_ar: 'رقم هاتف المُحيل', preserveLeadingZero: true },
  { key: 'referrer_org', header_ar: 'الجمعية/المنظمة المُحيلة' },
  { key: 'phone', header_ar: 'الهاتف الأساسي', preserveLeadingZero: true },
  { key: 'phone2', header_ar: 'هاتف إضافي / واتساب', preserveLeadingZero: true },
  { key: 'general_area', header_ar: 'المنطقة العامة' },
  { key: 'address', header_ar: 'العنوان / المنطقة بالتفصيل' },
  { key: 'marital', header_ar: 'الحالة الاجتماعية' },
  { key: 'breadwinner', header_ar: 'اسم المعيل' },
  { key: 'breadwinner_rel', header_ar: 'صلة قرابة المعيل' },
  { key: 'family_count', header_ar: 'عدد أفراد الأسرة' },
  { key: 'family_names', header_ar: 'أسماء أفراد الأسرة' },
  { key: 'health', header_ar: 'الحالة الصحية' },
  { key: 'health_desc', header_ar: 'وصف الحالة الصحية والتشخيص' },
  { key: 'aid_cat', header_ar: 'فئة المساعدة الرئيسية' },
  { key: 'aid_types_str', header_ar: 'نوع المساعدة المحددة' },
  { key: 'need_desc', header_ar: 'وصف حالة الأسرة والاحتياج' },
  { key: 'vulnerability_score', header_ar: 'درجة الاحتياج (0-100)' },
  { key: 'status', header_ar: 'حالة الطلب' },
  { key: 'disb_date', header_ar: 'تاريخ الصرف' },
  { key: 'proof_method', header_ar: 'طريقة إثبات الاستلام' },
  { key: 'notes', header_ar: 'ملاحظات الباحث/مسؤول الحالة' },
];

function escapeCsvCell(value: unknown, preserveLeadingZero = false): string {
  if (value === null || value === undefined) return '""';
  const raw = String(value).replace(/\r?\n/g, ' ').trim();
  if (!raw) return '""';

  // Prevent CSV formula injection (=, +, -, @)
  const sanitized = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;

  // If preserving leading zeros (e.g. national_id or phone starting with 0) for Excel
  if (preserveLeadingZero && /^0\d+$/.test(sanitized)) {
    return `"=""${sanitized}"""`;
  }

  const escaped = sanitized.replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * Generates a UTF-8 with BOM CSV string compatible with Arabic Microsoft Excel (Section 7 & Scenario 7)
 */
export function buildCasesCsvWithBom(cases: BeneficiaryCase[]): string {
  const headerRow = CASE_EXPORT_COLUMNS.map((col) => escapeCsvCell(col.header_ar)).join(',');
  const dataRows = cases.map((c) =>
    CASE_EXPORT_COLUMNS.map((col) => {
      if (col.key === 'aid_types_str') {
        return escapeCsvCell((c.aid_types || []).join(' ؛ '));
      }
      return escapeCsvCell(c[col.key as keyof BeneficiaryCase], col.preserveLeadingZero);
    }).join(',')
  );

  return UTF8_BOM + [headerRow, ...dataRows].join('\r\n');
}

/**
 * Triggers a browser file download for the generated UTF-8 BOM CSV
 */
export function downloadCasesCsv(cases: BeneficiaryCase[], filenamePrefix = 'حالات_سند'): void {
  const csvContent = buildCasesCsvWithBom(cases);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const dateStamp = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.setAttribute('download', `${filenamePrefix}_${dateStamp}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Exports verified aid distributions to a UTF-8 with BOM CSV file
 */
export function exportDistributionsToCSV(
  distributions: DistributionRecord[],
  filenamePrefix = 'صرفيات_سند_الموثقة'
): void {
  const headers = [
    'رقم الإيصال',
    'تاريخ الصرف',
    'كود الحالة',
    'المنطقة العامة',
    'عدد أفراد الأسرة',
    'المشروع / الحملة',
    'فئة المساعدة',
    'تفاصيل المساعدة',
    'الكمية',
    'الوحدة',
    'القيمة المالية',
    'العملة',
    'طريقة الإثبات',
    'بصمة SHA-256',
    'رمز التحقق QR',
  ];

  const rows = distributions.map((d) =>
    [
      escapeCsvCell(d.receipt_number),
      escapeCsvCell(d.disb_date),
      escapeCsvCell(d.case_code),
      escapeCsvCell(d.case_general_area),
      escapeCsvCell(d.case_family_count),
      escapeCsvCell(d.project_name),
      escapeCsvCell(d.aid_cat),
      escapeCsvCell(d.aid_type),
      escapeCsvCell(d.quantity),
      escapeCsvCell(d.unit),
      escapeCsvCell(d.financial_value),
      escapeCsvCell(d.currency),
      escapeCsvCell(d.proof_method),
      escapeCsvCell(d.proof_file_sha256),
      escapeCsvCell(d.qr_verification_token),
    ].join(',')
  );

  const csvContent = UTF8_BOM + [headers.map((h) => escapeCsvCell(h)).join(','), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const dateStamp = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.setAttribute('download', `${filenamePrefix}_${dateStamp}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

