import React, { useState, useEffect } from 'react';
import {
  Smartphone,
  Share,
  PlusSquare,
  CheckCircle2,
  X,
  Download,
  ShieldCheck,
  WifiOff,
  Zap,
} from 'lucide-react';

interface MobileInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MobileInstallModal: React.FC<MobileInstallModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [platform, setPlatform] = useState<'ios' | 'android'>('android');
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Detect OS
    const ua = navigator.userAgent || '';
    if (/iPad|iPhone|iPod/.test(ua)) {
      setPlatform('ios');
    } else {
      setPlatform('android');
    }

    // Check if already in standalone display mode
    if (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true
    ) {
      setIsInstalled(true);
    }

    // Capture PWA install prompt for Android/Chromium
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        setIsInstalled(true);
      }
      setDeferredPrompt(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-surface rounded-t-3xl sm:rounded-2xl border border-primary/20 max-w-lg w-full p-5 sm:p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border pb-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center text-primary">
              <Smartphone className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-text-primary">
                تثبيت تطبيق مشكاة على الهاتف
              </h3>
              <p className="text-xs text-text-secondary">
                يعمل محلياً بالكامل (Offline) على أجهزة آيفون وأندرويد
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-text-secondary hover:text-text-primary transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Platform Selector Tabs */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-800/60 rounded-xl text-xs font-bold">
          <button
            type="button"
            onClick={() => setPlatform('ios')}
            className={`py-2.5 px-3 rounded-lg flex items-center justify-center gap-2 transition ${
              platform === 'ios'
                ? 'bg-surface text-primary shadow-sm'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <span className="text-base"></span>
            <span>أجهزة آيفون (Apple iOS)</span>
          </button>
          <button
            type="button"
            onClick={() => setPlatform('android')}
            className={`py-2.5 px-3 rounded-lg flex items-center justify-center gap-2 transition ${
              platform === 'android'
                ? 'bg-surface text-primary shadow-sm'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <span className="text-base">🤖</span>
            <span>أجهزة أندرويد (Android)</span>
          </button>
        </div>

        {/* Benefits Badges */}
        <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
          <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300">
            <WifiOff className="w-4 h-4 mx-auto mb-1" />
            <span className="font-bold block">بدون إنترنت</span>
            <span className="text-[10px] opacity-80">يعمل في الميدان</span>
          </div>
          <div className="p-2.5 rounded-xl bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 text-sky-800 dark:text-sky-300">
            <Zap className="w-4 h-4 mx-auto mb-1" />
            <span className="font-bold block">سرعة فائقة</span>
            <span className="text-[10px] opacity-80">واجهة أصيلة</span>
          </div>
          <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300">
            <ShieldCheck className="w-4 h-4 mx-auto mb-1" />
            <span className="font-bold block">أمان البيانات</span>
            <span className="text-[10px] opacity-80">حفظ محلي آمن</span>
          </div>
        </div>

        {/* iOS Step-by-Step Instructions */}
        {platform === 'ios' && (
          <div className="space-y-3.5 bg-slate-50 dark:bg-slate-900/40 p-4 rounded-2xl border border-border text-xs">
            <h4 className="font-bold text-sm text-text-primary flex items-center gap-2">
              <span>طريقة تثبيت تطبيق مشكاة على iPhone و iPad:</span>
            </h4>
            <ol className="space-y-3">
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  1
                </span>
                <div>
                  <p className="font-bold text-text-primary">
                    افتح الرابط في متصفح Safari على جهازك
                  </p>
                  <p className="text-text-secondary text-[11px] mt-0.5">
                    (تثبيت تطبيقات PWA على iOS مخصص عبر متصفح سفاري).
                  </p>
                </div>
              </li>

              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  2
                </span>
                <div>
                  <p className="font-bold text-text-primary flex items-center gap-1.5 flex-wrap">
                    <span>اضغط على زر المشاركة</span>
                    <span className="inline-flex items-center gap-1 bg-white dark:bg-slate-800 px-2 py-0.5 rounded border border-border font-sans font-normal text-[11px]">
                      <Share className="w-3.5 h-3.5 text-sky-500" /> Share
                    </span>
                    <span>في أسفل شاشة الآيفون.</span>
                  </p>
                </div>
              </li>

              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  3
                </span>
                <div>
                  <p className="font-bold text-text-primary flex items-center gap-1.5 flex-wrap">
                    <span>اسحب للأعلى واضغط على</span>
                    <span className="inline-flex items-center gap-1 bg-white dark:bg-slate-800 px-2 py-0.5 rounded border border-border font-sans font-normal text-[11px]">
                      <PlusSquare className="w-3.5 h-3.5 text-emerald-500" /> إضافة إلى الشاشة الرئيسية
                    </span>
                  </p>
                  <p className="text-text-secondary text-[11px] mt-0.5">
                    (Add to Home Screen).
                  </p>
                </div>
              </li>

              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  4
                </span>
                <div>
                  <p className="font-bold text-text-primary">
                    اضغط «إضافة» (Add) في أعلى الزاوية.
                  </p>
                  <p className="text-text-secondary text-[11px] mt-0.5">
                    ستظهر أيقونة تطبيق مشكاة فوراً بجانب تطبيقات هاتفك وتعمل بملء الشاشة بدون متصفح.
                  </p>
                </div>
              </li>
            </ol>
          </div>
        )}

        {/* Android Step-by-Step Instructions */}
        {platform === 'android' && (
          <div className="space-y-3.5 bg-slate-50 dark:bg-slate-900/40 p-4 rounded-2xl border border-border text-xs">
            <h4 className="font-bold text-sm text-text-primary flex items-center gap-2">
              <span>طريقة تثبيت تطبيق مشكاة على أجهزة Android:</span>
            </h4>

            {deferredPrompt ? (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 rounded-xl space-y-2">
                <p className="font-bold text-emerald-900 dark:text-emerald-200">
                  متصفحك يدعم التثبيت المباشر بنقرة واحدة!
                </p>
                <button
                  type="button"
                  onClick={handleInstallClick}
                  className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center justify-center gap-2 shadow-md transition"
                >
                  <Download className="w-4 h-4" />
                  <span>تثبيت التطبيق على جهازك الآن</span>
                </button>
              </div>
            ) : (
              <ol className="space-y-3">
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    1
                  </span>
                  <div>
                    <p className="font-bold text-text-primary">
                      افتح الرابط في متصفح Chrome على هاتفك
                    </p>
                  </div>
                </li>

                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    2
                  </span>
                  <div>
                    <p className="font-bold text-text-primary">
                      اضغط على زر القائمة (الثلاث نقاط ⋮) في أعلى يسار الشاشة
                    </p>
                  </div>
                </li>

                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    3
                  </span>
                  <div>
                    <p className="font-bold text-text-primary">
                      اختر «تثبيت التطبيق» (Install App) أو «الإضافة إلى الشاشة الرئيسية»
                    </p>
                    <p className="text-text-secondary text-[11px] mt-0.5">
                      سيتم تنزيل التطبيق وتثبيته كبرنامج مستقل على هاتفك فوراً.
                    </p>
                  </div>
                </li>
              </ol>
            )}
          </div>
        )}

        {/* Footer info & close */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <div className="flex items-center gap-2 text-xs text-text-secondary">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span>نظام مشكاة للعمل الإنساني — إصدار 2026</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary/90 transition"
          >
            حسناً، فهمت
          </button>
        </div>
      </div>
    </div>
  );
};
