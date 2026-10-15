import React, { useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Palette,
  Type,
  Layers,
  Eye,
  FolderOpen,
} from 'lucide-react';
import { StatusBadge, AlertBadge, VulnerabilityBadge } from './ui/Badge';

/**
 * Helper to compute WCAG relative luminance and contrast ratio (Section 15.1: >= 4.5:1)
 */
export function computeWcagContrast(hexA: string, hexB: string): number {
  const toLuminance = (hex: string) => {
    const clean = hex.replace('#', '');
    const r = parseInt(clean.slice(0, 2), 16) / 255;
    const g = parseInt(clean.slice(2, 4), 16) / 255;
    const b = parseInt(clean.slice(4, 6), 16) / 255;
    const transform = (c: number) =>
      c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    return 0.2126 * transform(r) + 0.7152 * transform(g) + 0.0722 * transform(b);
  };
  const lum1 = toLuminance(hexA);
  const lum2 = toLuminance(hexB);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return Number(((brightest + 0.05) / (darkest + 0.05)).toFixed(2));
}

const DESIGN_COLOR_TOKENS = [
  { role: 'Primary (أساسي)', token: '--color-primary', hex: '#0B4F8A', usage: 'الترويسة، الأزرار الرئيسية، الروابط', contrastAgainst: '#FFFFFF' },
  { role: 'Primary Dark', token: '--color-primary-dark', hex: '#083A66', usage: 'حالات الضغط والتركيز', contrastAgainst: '#FFFFFF' },
  { role: 'Info / Accent', token: '--color-info', hex: '#009EDB', usage: 'العناصر التفاعلية الثانوية والرسوم', contrastAgainst: '#1F2933' },
  { role: 'Success (نجاح / تم الصرف)', token: '--color-success', hex: '#2E9E6B', usage: 'تم الصرف، الاكتمال + أيقونة ✓', contrastAgainst: '#1F2933' },
  { role: 'Warning (تنبيه / قيد الدراسة)', token: '--color-warning', hex: '#F2A900', usage: 'قيد الدراسة، متابعة متأخرة + أيقونة ⏰/⚠', contrastAgainst: '#1F2933' },
  { role: 'Danger (خطر / مرفوض)', token: '--color-danger', hex: '#D64545', usage: 'مرفوض، أخطاء، حذف + أيقونة ✕/⚠', contrastAgainst: '#FFFFFF' },
  { role: 'Approved (مقبول)', token: '--color-approved', hex: '#3B82C4', usage: 'حالة «مقبول» + أيقونة ✓', contrastAgainst: '#FFFFFF' },
  { role: 'Text (النص الأساسي)', token: '--color-text', hex: '#1F2933', usage: 'النصوص الأساسية', contrastAgainst: '#FFFFFF' },
  { role: 'Text Muted (النص الثانوي)', token: '--color-text-muted', hex: '#52606D', usage: 'النصوص الثانوية', contrastAgainst: '#FFFFFF' },
  { role: 'Border (الحدود)', token: '--color-border', hex: '#E4E7EB', usage: 'الحدود والفواصل', contrastAgainst: '#1F2933' },
  { role: 'Background (خلفية الصفحة)', token: '--color-bg', hex: '#F5F7FA', usage: 'خلفية الصفحة الفاتحة', contrastAgainst: '#1F2933' },
  { role: 'Surface (البطاقات)', token: '--color-surface', hex: '#FFFFFF', usage: 'أسطح البطاقات والنوافذ', contrastAgainst: '#1F2933' },
];

export const StyleGuideView: React.FC = () => {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const primaryOnWhiteContrast = computeWcagContrast('#0B4F8A', '#FFFFFF');
  const textOnBgContrast = computeWcagContrast('#1F2933', '#F5F7FA');
  const darkTextOnDarkSurface = computeWcagContrast('#E6EBF0', '#1A2530');

  return (
    <div className="space-y-6 pb-10">
      {/* Header Banner */}
      <div className="ds-card p-6 bg-gradient-to-l from-primary/10 via-surface to-surface">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 text-primary font-semibold text-sm mb-1">
              <Palette className="w-4 h-4" />
              <span>القسم 15 • نظام التصميم البصري الموحد (Design System & Style Guide)</span>
            </div>
            <h2 className="text-2xl font-bold text-text">
              دليل الأنماط والمكونات القياسية — هوية إنسانية موثوقة
            </h2>
            <p className="text-sm text-text-muted mt-1">
              جميع الشاشات مبنية حصرياً على متغيرات <code className="font-mono text-xs bg-background px-1.5 py-0.5 rounded">src/styles/tokens.css</code> دون أي ألوان مكتوبة يدوياً، مع تحقيق معيار التباين العالمي <strong>WCAG AA (&ge; 4.5:1)</strong> وأهداف لمس ميدانية <strong>&ge; 44px</strong>.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="px-3 py-1.5 rounded-full bg-success/15 text-success font-bold border border-success/30">
              ✓ تباين الأساسي/الأبيض: {primaryOnWhiteContrast}:1 (WCAG AAA)
            </span>
            <span className="px-3 py-1.5 rounded-full bg-success/15 text-success font-bold border border-success/30">
              ✓ تباين النص/الخلفية: {textOnBgContrast}:1 (WCAG AAA)
            </span>
            <span className="px-3 py-1.5 rounded-full bg-info/15 text-primary font-bold border border-info/30">
              ✓ تباين الوضع الداكن: {darkTextOnDarkSurface}:1
            </span>
          </div>
        </div>
      </div>

      {/* 1. Design Tokens Swatches */}
      <section className="ds-card p-6 space-y-4">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Palette className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-bold">1. متغيرات الألوان الدلالية (Design Tokens - Section 15.1)</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {DESIGN_COLOR_TOKENS.map((item) => {
            const ratio = computeWcagContrast(item.hex, item.contrastAgainst);
            return (
              <div key={item.token} className="border border-border rounded-card overflow-hidden bg-surface">
                <div
                  className="h-16 flex items-end justify-between px-3 py-2 font-mono text-xs font-bold"
                  style={{ backgroundColor: item.hex, color: item.contrastAgainst }}
                >
                  <span dir="ltr">{item.hex}</span>
                  <span dir="ltr">Contrast {ratio}:1</span>
                </div>
                <div className="p-3 space-y-1">
                  <div className="font-bold text-sm text-text">{item.role}</div>
                  <div className="font-mono text-xs text-primary" dir="ltr">
                    var({item.token})
                  </div>
                  <div className="text-xs text-text-muted">{item.usage}</div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 2. Status Badges, Alerts & Vulnerability Score Badges */}
      <section className="ds-card p-6 space-y-4">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <ShieldCheck className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-bold">
            2. شارات حالة الطلب والتنبيهات ودرجة الاحتياج (الألوان مقترنة برموز أيقونية دائماً)
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-text-muted">حالات الطلب الأربع الثابتة (القسم 3 و 7)</h4>
            <div className="flex flex-wrap gap-2">
              <StatusBadge status="تم الصرف" />
              <StatusBadge status="مقبول" />
              <StatusBadge status="قيد الدراسة" />
              <StatusBadge status="مرفوض" />
              <StatusBadge status="" />
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-text-muted">التنبيهات التلقائية (✓ ⚠ ⏰ - القسم 7)</h4>
            <div className="flex flex-wrap gap-2">
              <AlertBadge
                alert={{ code: 'HEALTHY', severity: 'healthy', icon: '✓', message_ar: 'سليمة' }}
              />
              <AlertBadge
                alert={{
                  code: 'DISBURSED_MISSING_PROOF',
                  severity: 'warning',
                  icon: '⚠',
                  message_ar: 'حالة «تم الصرف» بلا مرفق إثبات استلام',
                }}
              />
              <AlertBadge
                alert={{
                  code: 'UNDER_STUDY_OVERDUE',
                  severity: 'overdue',
                  icon: '⏰',
                  message_ar: 'قيد الدراسة منذ 38 يوماً دون متابعة',
                }}
              />
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-text-muted">درجة الاحتياج الشفافة (P1.1 Vulnerability Score)</h4>
            <div className="flex flex-wrap gap-2">
              <VulnerabilityBadge score={86} />
              <VulnerabilityBadge score={64} />
              <VulnerabilityBadge score={42} />
              <VulnerabilityBadge score={20} />
            </div>
          </div>
        </div>
      </section>

      {/* 3. Typography, Buttons, Inputs & Touch Targets */}
      <section className="ds-card p-6 space-y-6">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Type className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-bold">
            3. الخطوط العربية (IBM Plex Sans Arabic) والأزرار والحقول القياسية (&ge; 44px Touch Target)
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-text-muted">الأزرار القياسية (44px+ ارتفاع للعمل الميداني)</h4>
            <div className="flex flex-wrap gap-3">
              <button type="button" className="ds-btn ds-btn-primary">
                <CheckCircle2 className="w-4 h-4" />
                <span>زر رئيسي (Primary)</span>
              </button>
              <button type="button" className="ds-btn ds-btn-secondary">
                <Eye className="w-4 h-4" />
                <span>زر ثانوي (Secondary)</span>
              </button>
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                className="ds-btn ds-btn-danger"
              >
                <AlertTriangle className="w-4 h-4" />
                <span>تجربة نافذة تأكيد الحذف</span>
              </button>
              <button type="button" disabled className="ds-btn ds-btn-primary">
                <span>زر معطّل</span>
              </button>
            </div>

            <div className="pt-3 space-y-2">
              <h4 className="text-sm font-semibold text-text-muted">لوحة ألوان الرسوم البيانية الـ 6 (صديقة لعمى الألوان)</h4>
              <div className="grid grid-cols-6 gap-2">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <div
                    key={n}
                    className="h-10 rounded-btn flex items-center justify-center text-white font-bold text-xs"
                    style={{ backgroundColor: `var(--chart-${n})` }}
                  >
                    #{n}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-text-muted">حقول الإدخال ورسائل التحقق العربية</h4>
            <div>
              <label className="ds-label">حقل قياسي مع تركيز واضح للوحة المفاتيح</label>
              <input
                type="text"
                readOnly
                value="فاطمة عبد الرحمن محمود السيد"
                className="ds-input"
              />
            </div>
            <div>
              <label className="ds-label text-danger">حقل مع رسالة خطأ واضحة بالعربية</label>
              <input
                type="text"
                readOnly
                value=""
                placeholder="اسم المستفيد مطلوب..."
                className="ds-input border-danger"
              />
              <p className="text-xs text-danger mt-1 font-medium flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>تنبيه: اسم المستفيد (رب الأسرة) مطلوب لحفظ الحالة.</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Skeleton Loader & Empty State Showcase */}
      <section className="ds-card p-6 space-y-4">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Layers className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-bold">4. هياكل التحميل (Skeletons) والحالات الفارغة المصممة (Empty States)</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-4 rounded-card border border-border space-y-3">
            <div className="text-xs font-semibold text-text-muted">هيكل تحميل البطاقة (Skeleton Loader)</div>
            <div className="animate-pulse space-y-3">
              <div className="flex items-center justify-between">
                <div className="h-4 bg-border rounded w-24"></div>
                <div className="h-6 bg-border rounded-full w-20"></div>
              </div>
              <div className="h-5 bg-border rounded w-3/4"></div>
              <div className="h-3 bg-border rounded w-1/2"></div>
            </div>
          </div>

          <div className="p-6 rounded-card border border-dashed border-border text-center space-y-2">
            <FolderOpen className="w-8 h-8 text-text-muted mx-auto" />
            <div className="font-bold text-sm text-text">لا توجد سجلات مطابقة لمعايير البحث</div>
            <p className="text-xs text-text-muted">
              جرّب تغيير الفلاتر أو البحث بكود الحالة (CS-0001) أو رقم الهوية.
            </p>
          </div>
        </div>
      </section>

      {/* Confirmation Dialog Demo */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="ds-card max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3 text-danger">
              <AlertTriangle className="w-6 h-6" />
              <h4 className="text-lg font-bold">تأكيد الحذف المنطقي (Soft Delete)</h4>
            </div>
            <p className="text-sm text-text-muted">
              هل أنت متأكد من نقل هذا السجل إلى المحذوفات؟ وفق قواعد المزامنة (5.2.6)، الحذف منطقي (<code className="font-mono">deleted_at</code>) ولا تضيع البيانات أبداً ويمكن للمدير استعادتها.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="ds-btn ds-btn-secondary"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="ds-btn ds-btn-danger"
              >
                تأكيد الحذف المنطقي
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
