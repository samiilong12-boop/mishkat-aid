import React, { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ShieldCheck,
  Eye,
  Lock,
  Globe,
  Presentation,
  Link2,
  Ban,
  Printer,
  CheckCircle2,
  AlertOctagon,
  ArrowLeft,
  Sparkles,
  HeartHandshake,
  Users,
  Wallet,
  PieChart,
  MapPin,
  Eraser,
  Minimize2,
} from 'lucide-react';
import {
  db,
  getSanitizedDonorPortalData,
  SanitizedDonorPortalResponse,
  createDonorShareLink,
  revokeDonorShareLink,
} from '../db/database';
import { formatCurrencyEGP } from '../utils/formatters';

export const DonorPortalView: React.FC<{
  currentUserRole: string;
  linkedDonorId?: string;
}> = ({ currentUserRole, linkedDonorId }) => {
  const donors = useLiveQuery(() => db.donors.toArray(), [], []);
  const shareLinks = useLiveQuery(
    () => db.donor_share_links.reverse().sortBy('created_at'),
    [],
    []
  );
  const allProjects = useLiveQuery(() => db.projects.toArray(), [], []);

  const isStaffOrAdmin = currentUserRole !== 'donor';

  // Active Donor ID or Share Link Token being previewed
  const [selectedDonorId, setSelectedDonorId] = useState<string>(
    linkedDonorId || 'donor-1'
  );
  const [activeShareToken, setActiveShareToken] = useState<string>('');
  const [portalLang, setPortalLang] = useState<'ar' | 'en'>('ar');
  const [isPresentationMode, setIsPresentationMode] = useState<boolean>(false);
  const [portalData, setPortalData] =
    useState<SanitizedDonorPortalResponse | null>(null);
  const [securityTestResult, setSecurityTestResult] = useState<{
    passed: boolean;
    title: string;
    details: string;
  } | null>(null);

  // In-App Photo Redaction / Blur Tool Modal state
  const [showRedactionModal, setShowRedactionModal] = useState(false);
  const [redactionRects, setRedactionRects] = useState<
    Array<{ x: number; y: number; w: number; h: number; label: string }>
  >([
    { x: 35, y: 28, w: 95, h: 42, label: 'طمس الوجه (Face Blur)' },
    { x: 250, y: 85, w: 190, h: 26, label: 'طمس الاسم ورقم الهوية (ID Redacted)' },
  ]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Load sanitized donor portal data whenever donor or shareToken changes
  const refreshPortalData = async () => {
    const res = await getSanitizedDonorPortalData(
      activeShareToken
        ? { shareToken: activeShareToken }
        : { donorId: selectedDonorId }
    );
    setPortalData(res);
  };

  useEffect(() => {
    refreshPortalData();
  }, [selectedDonorId, activeShareToken, shareLinks.length]);

  // Render Redaction Preview Canvas
  useEffect(() => {
    if (!showRedactionModal || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#F8FAFC';
    ctx.fillRect(0, 0, 480, 260);
    ctx.strokeStyle = '#0B4F8A';
    ctx.lineWidth = 3;
    ctx.strokeRect(6, 6, 468, 248);

    ctx.fillStyle = '#0B4F8A';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText('صورة إثبات استلام ميداني — كود الحالة: CS-0001', 110, 32);

    // Simulated person silhouette & ID card
    ctx.fillStyle = '#CBD5E1';
    ctx.beginPath();
    ctx.arc(82, 52, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(48, 80, 68, 70);

    ctx.fillStyle = '#1F2933';
    ctx.font = '13px sans-serif';
    ctx.fillText('بيانات حساسة قبل الطمس: الاسم ورقم الهوية 02980514...', 145, 102);
    ctx.fillStyle = '#2E9E6B';
    ctx.fillText('✓ المساعدة المسلمة: 6 بطاطين شتوية + دفايات + عزل سقف', 140, 145);

    // Draw Redaction / Blur boxes
    for (const r of redactionRects) {
      ctx.fillStyle = '#1F2933';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = '#C88A1E';
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 10px sans-serif';
      ctx.fillText('██ مطموس لحماية الخصوصية ██', r.x + 6, r.y + r.h / 2 + 4);
    }
  }, [showRedactionModal, redactionRects]);

  const handleGenerateShareLink = async () => {
    const link = await createDonorShareLink(selectedDonorId, 14);
    setActiveShareToken(link.token);
  };

  const handleRevokeShareLink = async (token: string) => {
    await revokeDonorShareLink(token);
    if (activeShareToken === token) {
      const updated = await getSanitizedDonorPortalData({ shareToken: token });
      setPortalData(updated);
    }
  };

  // Scenario 5 Automated Live Security & RLS Isolation Test
  const handleRunScenario5SecurityAudit = async () => {
    // 1. Attempt to access an unauthorized project (e.g. donor-1 requesting project-medical-2026 owned by donor-2)
    const unauthorizedProjAttempt = await getSanitizedDonorPortalData({
      donorId: 'donor-1',
      requestedProjectId: 'project-medical-2026',
    });

    // 2. Inspect payload of authorized response to ensure ZERO PII fields exist
    const authorizedResp = await getSanitizedDonorPortalData({ donorId: 'donor-1' });
    const rawJson = JSON.stringify(authorizedResp);
    const forbiddenKeys = [
      'national_id',
      'phone',
      'phone2',
      'address',
      'gps_lat',
      'family_names',
      'health_desc',
      'medical_attach',
      'referrer_name',
      'فاطمة عبد الرحمن',
      '02980514120045',
      '01012345678',
    ];
    const leakedFields = forbiddenKeys.filter((k) => rawJson.includes(k));

    if (!unauthorizedProjAttempt.authorized && leakedFields.length === 0) {
      setSecurityTestResult({
        passed: true,
        title: 'نجاح فحص العزل الأمني لبوابة الداعمين (Scenario 5 — Zero PII & RLS Isolation)',
        details: `تم حجب محاولة وصول الداعم لمشروع لا يخصه (${unauthorizedProjAttempt.error_ar})، وتم فحص كامل استجابة الـ API والتأكد من خلوها بنسبة 100% من الأسماء وأرقام الهوية والهواتف والعناوين والتشخيص الطبي.`,
      });
    } else {
      setSecurityTestResult({
        passed: false,
        title: 'تنبيه أمني أثناء الفحص',
        details: `الحقول المسربة: ${leakedFields.join(', ')}`,
      });
    }
  };

  return (
    <div
      className={`space-y-6 ${
        isPresentationMode
          ? 'fixed inset-0 z-50 bg-background overflow-y-auto p-6 md:p-10'
          : ''
      }`}
    >
      {/* Top Control & Preview Bar (Visible to Admin/Staff or Presentation Toggle) */}
      <div className="card p-4 bg-surface border-r-4 border-r-secondary flex flex-wrap items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-light text-primary flex items-center justify-center font-bold">
            <HeartHandshake className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-text-primary">
                {portalLang === 'ar'
                  ? 'بوابة الداعمين وتقارير الأثر الموثقة (Donor Impact Portal)'
                  : 'Mishkat Verified Donor Impact Portal (Zero-PII)'}
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-status-disbursed-bg text-status-disbursed-text border border-status-disbursed-border flex items-center gap-1">
                <Lock className="w-3 h-3" />
                <span>Zero-PII للقراءة فقط</span>
              </span>
            </div>
            <p className="text-xs text-text-secondary">
              {isPresentationMode
                ? 'وضع العرض التقديمي للاجتماعات (Offline Presentation Mode — سيناريو 6) يعمل بالكامل بدون إنترنت من البيانات المجمّعة محلياً.'
                : 'شفافية مالية وإنسانية كاملة (من التبرع إلى الأثر) مع حماية مطلقة لخصوصية المستفيدين وقاعدة Small-Cell Suppression.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Admin "Preview as Donor X" selector */}
          {isStaffOrAdmin && (
            <div className="flex items-center gap-1.5 bg-background px-2.5 py-1.5 rounded-lg border border-border">
              <Eye className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold text-text-secondary">
                معاينة كبوابة الداعم:
              </span>
              <select
                aria-label="معاينة كبوابة الداعم"
                value={selectedDonorId}
                onChange={(e) => {
                  setActiveShareToken('');
                  setSelectedDonorId(e.target.value);
                }}
                className="text-xs font-bold bg-transparent text-primary focus:outline-none"
              >
                {donors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Bilingual Toggle AR / EN (P1.5) */}
          <button
            type="button"
            onClick={() => setPortalLang((prev) => (prev === 'ar' ? 'en' : 'ar'))}
            className="btn-secondary text-xs py-1.5 px-3"
          >
            <Globe className="w-4 h-4 text-primary" />
            <span>{portalLang === 'ar' ? 'English Report (P1.5)' : 'عرض بالعربية'}</span>
          </button>

          {/* In-App Photo Redaction Tool */}
          {isStaffOrAdmin && (
            <button
              type="button"
              onClick={() => setShowRedactionModal(true)}
              className="btn-secondary text-xs py-1.5 px-3"
            >
              <Eraser className="w-4 h-4 text-secondary" />
              <span>أداة طمس الوجوه والهوية</span>
            </button>
          )}

          {/* Offline Presentation Mode Toggle (Scenario 6) */}
          <button
            type="button"
            onClick={() => setIsPresentationMode((prev) => !prev)}
            className={`text-xs py-1.5 px-3 rounded-lg font-bold flex items-center gap-1.5 border transition-colors ${
              isPresentationMode
                ? 'bg-secondary text-white border-secondary'
                : 'bg-surface text-text-primary border-border hover:bg-background'
            }`}
          >
            {isPresentationMode ? (
              <>
                <Minimize2 className="w-4 h-4" />
                <span>إنهاء وضع الاجتماع</span>
              </>
            ) : (
              <>
                <Presentation className="w-4 h-4 text-secondary" />
                <span>وضع العرض للاجتماعات أوفلاين (سيناريو 6)</span>
              </>
            )}
          </button>

          {/* Print / Export PDF Report */}
          <button
            type="button"
            onClick={() => window.print()}
            className="btn-primary text-xs py-1.5 px-3"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة تقرير الأثر (PDF)</span>
          </button>
        </div>
      </div>

      {/* Admin Controls: Share Links (Scenario 8) & Security Verification (Scenario 5) */}
      {isStaffOrAdmin && !isPresentationMode && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 print:hidden">
          {/* Read-Only Time-Limited Share Links Manager (Scenario 8) */}
          <div className="lg:col-span-7 card p-4 space-y-3 bg-surface">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-text-primary flex items-center gap-1.5">
                  <Link2 className="w-4 h-4 text-primary" />
                  <span>روابط المشاركة المؤقتة للقراءة فقط والقابلة للإلغاء الفوري (سيناريو 8)</span>
                </h2>
                <p className="text-xs text-text-secondary">
                  أنشئ رابط مشاركة مؤقت للداعم، وجرّب إلغاءه فوراً للتأكد من إيقاف الوصول في اللحظة نفسها.
                </p>
              </div>
              <button
                type="button"
                onClick={handleGenerateShareLink}
                className="btn-secondary text-xs py-1.5 px-3"
              >
                <Link2 className="w-3.5 h-3.5 text-primary" />
                <span>توليد رابط مشاركة جديد (14 يوماً)</span>
              </button>
            </div>

            {shareLinks.length > 0 && (
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {shareLinks.map((lnk) => {
                  const isRevoked = Boolean(lnk.revoked_at);
                  const isPreviewingThis = activeShareToken === lnk.token;
                  return (
                    <div
                      key={lnk.id}
                      className={`p-2.5 rounded-lg border text-xs flex flex-wrap items-center justify-between gap-2 ${
                        isRevoked
                          ? 'bg-status-rejected-bg/40 border-status-rejected-border'
                          : isPreviewingThis
                          ? 'bg-primary-light border-primary'
                          : 'bg-background border-border'
                      }`}
                    >
                      <div>
                        <span className="font-bold text-text-primary">
                          {lnk.donor_name}
                        </span>
                        <span className="font-mono text-text-muted mx-2">
                          ?share_token={lnk.token}
                        </span>
                        {isRevoked ? (
                          <span className="px-2 py-0.5 rounded bg-status-rejected-bg text-status-rejected-text font-bold">
                            ملغى وموقوف فوراً
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-status-disbursed-bg text-status-disbursed-text font-bold">
                            فعّال (مرات الفتح: {lnk.access_count})
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setActiveShareToken(lnk.token)}
                          className="text-primary font-bold hover:underline"
                        >
                          معاينة الرابط
                        </button>
                        {!isRevoked && (
                          <button
                            type="button"
                            onClick={() => handleRevokeShareLink(lnk.token)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-danger text-white font-bold hover:opacity-90"
                          >
                            <Ban className="w-3 h-3" />
                            <span>إلغاء فوري للرابط</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Scenario 5 Live Security & Zero-PII Verifier */}
          <div className="lg:col-span-5 card p-4 space-y-3 bg-surface">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-text-primary flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-success" />
                <span>فاحص العزل الأمني وحجب البيانات الشخصية (سيناريو 5)</span>
              </h2>
              <button
                type="button"
                onClick={handleRunScenario5SecurityAudit}
                className="btn-secondary text-xs py-1 px-2.5"
              >
                تشغيل فحص العزل الآن
              </button>
            </div>
            <p className="text-xs text-text-secondary">
              يتحقق برمجياً من أن الداعم لا يستطيع قراءة أي مشروع لا يخصه أو أي حقل شخصي (اسم، هوية، هاتف، عنوان، تشخيص طبي) حتى عبر طلبات الـ API المباشرة.
            </p>
            {securityTestResult && (
              <div
                className={`p-2.5 rounded-lg border text-xs ${
                  securityTestResult.passed
                    ? 'bg-status-disbursed-bg border-status-disbursed-border text-status-disbursed-text'
                    : 'bg-status-rejected-bg border-status-rejected-border text-status-rejected-text'
                }`}
              >
                <div className="font-bold">{securityTestResult.title}</div>
                <div className="mt-0.5">{securityTestResult.details}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* UNAUTHORIZED / REVOKED SHARE LINK SCREEN (Scenario 5 & Scenario 8) */}
      {portalData && !portalData.authorized && (
        <div className="card p-8 border-2 border-danger bg-status-rejected-bg/30 text-center space-y-4">
          <AlertOctagon className="w-12 h-12 text-danger mx-auto" />
          <h2 className="text-xl font-bold text-status-rejected-text">
            تم حجب الوصول لبوابة الداعم
          </h2>
          <p className="text-sm text-text-primary font-semibold max-w-lg mx-auto">
            {portalData.error_ar}
          </p>
          {activeShareToken && (
            <button
              type="button"
              onClick={() => setActiveShareToken('')}
              className="btn-primary text-xs py-2 px-4 mx-auto"
            >
              العودة لمعاينة حساب الداعم النشط
            </button>
          )}
        </div>
      )}

      {/* AUTHORIZED DONOR PORTAL VIEW */}
      {portalData && portalData.authorized && portalData.kpis && portalData.donor && (
        <div
          dir={portalLang === 'en' ? 'ltr' : 'rtl'}
          className="space-y-6"
        >
          {/* Donor Welcome & Impact Summary Header */}
          <div className="card p-6 bg-gradient-to-l from-primary to-primary-hover text-white rounded-2xl shadow-md flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="text-xs font-bold uppercase tracking-wider opacity-90 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" />
                <span>
                  {portalLang === 'ar'
                    ? 'تقرير الأثر الإنساني الموثّق — منظمة مشكاة للعمل الإنساني'
                    : 'Verified Humanitarian Impact Report — Mishkat Platform'}
                </span>
              </div>
              <h2 className="text-2xl font-bold">
                {portalLang === 'ar'
                  ? `مرحباً، ${portalData.donor.name}`
                  : `Welcome, ${portalData.donor.name}`}
              </h2>
              <p className="text-xs opacity-90">
                {portalLang === 'ar'
                  ? 'جميع الأرقام والإيصالات أدناه موثّقة ميدانياً ببصمة SHA-256 ورمز QR مع حماية كاملة لخصوصية وكرامة الأسر المستفيدة.'
                  : 'All figures and receipts below are field-verified with SHA-256 hashes and QR codes while strictly preserving beneficiary privacy.'}
              </p>
            </div>
            <div className="bg-white/10 backdrop-blur px-4 py-3 rounded-xl border border-white/20 text-center">
              <div className="text-xs opacity-85">
                {portalLang === 'ar' ? 'نسبة توجيه التبرع للمستفيدين' : 'Direct Aid Utilization'}
              </div>
              <div className="text-2xl font-mono font-bold">
                {portalData.kpis.total_donated > 0
                  ? `${Math.round(
                      (portalData.kpis.total_spent /
                        portalData.kpis.total_donated) *
                        100
                    )}%`
                  : '100%'}
              </div>
            </div>
          </div>

          {/* 5 Core Donor KPIs (Section 8.1) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="card p-4 border-t-4 border-t-primary">
              <div className="text-xs text-text-secondary flex items-center justify-between">
                <span>
                  {portalLang === 'ar' ? 'إجمالي تبرعاتكم المعتمدة' : 'Total Contributions'}
                </span>
                <Wallet className="w-4 h-4 text-primary" />
              </div>
              <div className="text-xl font-mono font-bold text-text-primary mt-2">
                {formatCurrencyEGP(portalData.kpis.total_donated)}
              </div>
            </div>

            <div className="card p-4 border-t-4 border-t-success">
              <div className="text-xs text-text-secondary flex items-center justify-between">
                <span>
                  {portalLang === 'ar' ? 'إجمالي المنصرف الموثّق' : 'Total Verified Disbursed'}
                </span>
                <CheckCircle2 className="w-4 h-4 text-success" />
              </div>
              <div className="text-xl font-mono font-bold text-success mt-2">
                {formatCurrencyEGP(portalData.kpis.total_spent)}
              </div>
            </div>

            <div className="card p-4 border-t-4 border-t-secondary">
              <div className="text-xs text-text-secondary flex items-center justify-between">
                <span>
                  {portalLang === 'ar' ? 'الرصيد المتبقي قيد التنفيذ' : 'Remaining Balance'}
                </span>
                <PieChart className="w-4 h-4 text-secondary" />
              </div>
              <div className="text-xl font-mono font-bold text-secondary mt-2">
                {formatCurrencyEGP(portalData.kpis.remaining_balance)}{' '}
                <span className="text-xs">({portalData.kpis.remaining_pct}%)</span>
              </div>
            </div>

            <div className="card p-4 border-t-4 border-t-primary">
              <div className="text-xs text-text-secondary flex items-center justify-between">
                <span>
                  {portalLang === 'ar' ? 'عدد الأسر المستفيدة' : 'Families Reached'}
                </span>
                <Users className="w-4 h-4 text-primary" />
              </div>
              <div className="text-2xl font-mono font-bold text-primary mt-2">
                {portalData.kpis.beneficiary_families_count}
              </div>
            </div>

            <div className="card p-4 border-t-4 border-t-success">
              <div className="text-xs text-text-secondary flex items-center justify-between">
                <span>
                  {portalLang === 'ar' ? 'إجمالي الأفراد المستفيدين' : 'Individuals Supported'}
                </span>
                <HeartHandshake className="w-4 h-4 text-success" />
              </div>
              <div className="text-2xl font-mono font-bold text-success mt-2">
                {portalData.kpis.beneficiary_individuals_count}
              </div>
            </div>
          </div>

          {/* "From Donation to Impact" Traceability Chain (من التبرع إلى الأثر) */}
          <div className="card p-5 space-y-4">
            <h3 className="text-base font-bold text-text-primary">
              {portalLang === 'ar'
                ? 'سلسلة تتبع الأثر: التبرع ← المشروع ← الصرفيات ← الأسر المستفيدة'
                : 'Impact Traceability Chain: Donation → Project → Verified Distributions → Families'}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(portalData.projects_flow || []).map((pf) => (
                <div
                  key={pf.project_id}
                  className="p-4 rounded-xl bg-background border border-border flex flex-wrap items-center justify-between gap-3"
                >
                  <div>
                    <span className="text-xs font-mono text-text-muted">
                      {pf.period_label}
                    </span>
                    <h4 className="text-base font-bold text-primary">
                      {pf.project_name}
                    </h4>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                    <span className="px-2.5 py-1 rounded bg-surface border border-border">
                      التبرع: {formatCurrencyEGP(pf.donated_amount)}
                    </span>
                    <ArrowLeft className="w-4 h-4 text-text-muted" />
                    <span className="px-2.5 py-1 rounded bg-status-disbursed-bg text-status-disbursed-text border border-status-disbursed-border">
                      المنصرف: {formatCurrencyEGP(pf.spent_amount)} ({pf.distributions_count}{' '}
                      صرفية)
                    </span>
                    <ArrowLeft className="w-4 h-4 text-text-muted" />
                    <span className="px-2.5 py-1 rounded bg-primary-light text-primary">
                      {pf.families_helped} أسرة مستفيدة
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Category Breakdown & Small-Cell Suppressed Regional Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card p-5 space-y-3">
              <h3 className="text-base font-bold text-text-primary flex items-center gap-2">
                <PieChart className="w-5 h-5 text-primary" />
                <span>
                  {portalLang === 'ar'
                    ? 'توزيع المساعدات حسب الفئة الإنسانية'
                    : 'Aid Distribution by Category'}
                </span>
              </h3>
              <div className="space-y-2.5">
                {(portalData.category_breakdown || []).map((cat) => (
                  <div
                    key={cat.category_label}
                    className="p-3 rounded-lg bg-background border border-border flex items-center justify-between"
                  >
                    <div>
                      <span className="font-bold text-text-primary">
                        {cat.category_label}
                      </span>
                      <span className="text-xs text-text-secondary mx-2">
                        ({cat.distributions_count} عملية صرف)
                      </span>
                    </div>
                    <span className="font-mono font-bold text-primary">
                      {formatCurrencyEGP(cat.amount_spent)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-text-primary flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-secondary" />
                  <span>
                    {portalLang === 'ar'
                      ? 'التوزيع الجغرافي العام (مع تطبيق Small-Cell Suppression)'
                      : 'Regional Distribution (Small-Cell Suppression Active)'}
                  </span>
                </h3>
                <span className="text-[11px] px-2 py-0.5 rounded bg-primary-light text-primary font-bold">
                  حماية الخصوصية &lt; 5 حالات
                </span>
              </div>
              <p className="text-xs text-text-secondary">
                {portalLang === 'ar'
                  ? 'يتم دمج المناطق التي يقل عدد الحالات فيها عن 5 حالات تلقائياً لمنع الاستدلال غير المباشر على هوية الأسر.'
                  : 'Areas with fewer than 5 cases are automatically grouped to prevent indirect re-identification of families.'}
              </p>
              <div className="space-y-2">
                {(portalData.regional_breakdown || []).map((reg) => (
                  <div
                    key={reg.area_label}
                    className={`p-3 rounded-lg border flex items-center justify-between ${
                      reg.is_suppressed_small_cell
                        ? 'bg-status-review-bg/30 border-status-review-border'
                        : 'bg-background border-border'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Lock className="w-4 h-4 text-secondary" />
                      <span className="font-bold text-sm text-text-primary">
                        {reg.area_label}
                      </span>
                    </div>
                    <span className="font-mono font-bold text-primary">
                      {reg.cases_count} {portalLang === 'ar' ? 'أسر' : 'families'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Anonymized Verified Distributions Table (Section 8.1) */}
          <div className="card p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
              <div>
                <h3 className="text-base font-bold text-text-primary">
                  {portalLang === 'ar'
                    ? 'سجل الصرفيات الممولة من تبرعاتكم (مجهول الهوية وموثّق بـ QR و SHA-256)'
                    : 'Verified Anonymized Distributions Funded by Your Contributions'}
                </h3>
                <p className="text-xs text-text-secondary">
                  {portalLang === 'ar'
                    ? 'يعرض كود الحالة فقط وملخص الاحتياج الآمن دون أي بيانات شخصية أو عناوين تفصيلية.'
                    : 'Displays only the Case Code and pre-approved anonymized summary with zero personal data.'}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right">
                <thead className="bg-background text-text-secondary text-xs border-b border-border">
                  <tr>
                    <th className="p-2.5">رقم الإيصال</th>
                    <th className="p-2.5">كود الحالة (بدون اسم)</th>
                    <th className="p-2.5">ملخص الاحتياج الآمن (Zero-PII)</th>
                    <th className="p-2.5">المساعدة المقدمة</th>
                    <th className="p-2.5">القيمة وتاريخ الصرف</th>
                    <th className="p-2.5">حالة التوثيق وصورة الاستلام المطموسة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(portalData.anonymized_distributions || []).map((row) => (
                    <tr key={row.id} className="hover:bg-background/60">
                      <td className="p-2.5 font-mono font-bold text-primary">
                        {row.receipt_number}
                      </td>
                      <td className="p-2.5">
                        <span className="font-mono font-bold px-2.5 py-1 rounded bg-primary-light text-primary">
                          {row.case_code}
                        </span>
                      </td>
                      <td className="p-2.5 text-xs text-text-primary font-semibold max-w-xs">
                        {row.anonymized_summary}
                      </td>
                      <td className="p-2.5">
                        <div className="font-bold text-text-primary">
                          [{row.aid_cat}] {row.aid_type}
                        </div>
                        <div className="text-xs text-text-muted">
                          {row.quantity} {row.unit} — {row.project_name}
                        </div>
                      </td>
                      <td className="p-2.5">
                        <div className="font-mono font-bold text-success">
                          {formatCurrencyEGP(row.financial_value)}
                        </div>
                        <div className="text-xs font-mono text-text-muted">
                          {row.disb_date}
                        </div>
                      </td>
                      <td className="p-2.5 space-y-1">
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-status-disbursed-bg text-status-disbursed-text border border-status-disbursed-border">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>SHA256: {row.sha256_short}</span>
                        </div>
                        {row.can_show_redacted_photo ? (
                          <div className="text-[11px] text-primary font-semibold">
                            ✓ مرفق إيصال مطموس الهوية بموافقة الأسرة
                          </div>
                        ) : (
                          <div className="text-[11px] text-text-muted">
                            الصورة محجوبة لعدم طلب مشاركة الصور (موثق رقمياً)
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bilingual Approved Impact Stories (Section 8.1 & P1.5) */}
          <div className="card p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-bold text-text-primary flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-secondary" />
                <span>
                  {portalLang === 'ar'
                    ? 'قصص الأثر الإنساني المعتمدة والمجهولة الهوية (P1.5)'
                    : 'Verified Anonymized Humanitarian Impact Stories (P1.5)'}
                </span>
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(portalData.approved_stories || []).map((story) => (
                <div
                  key={story.id}
                  className="p-4 rounded-xl bg-background border border-border space-y-2"
                >
                  <div className="flex items-center justify-between text-xs text-text-muted">
                    <span className="font-mono font-bold text-primary">
                      {story.case_code_ref} —{' '}
                      {allProjects.find((p) => p.id === story.project_id)?.name ||
                        story.project_id}
                    </span>
                    <span className="font-mono">{story.published_date}</span>
                  </div>
                  <h4 className="text-base font-bold text-text-primary">
                    {portalLang === 'ar' ? story.title_ar : story.title_en}
                  </h4>
                  <p className="text-sm text-text-secondary leading-relaxed">
                    {portalLang === 'ar' ? story.story_ar : story.story_en}
                  </p>
                  <div className="pt-2 flex items-center justify-between text-[11px] text-success font-bold">
                    <span>✓ معتمد للنشر من: {story.approved_by}</span>
                    <span>✓ خالٍ من البيانات الشخصية (Redacted)</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* IN-APP PHOTO REDACTION / BLUR TOOL MODAL */}
      {showRedactionModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl border border-border max-w-xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="text-lg font-bold text-text-primary flex items-center gap-2">
                  <Eraser className="w-5 h-5 text-secondary" />
                  <span>أداة طمس الوجوه وأرقام الهوية قبل النشر للداعمين</span>
                </h3>
                <p className="text-xs text-text-secondary">
                  لا تُعرض أي صورة في بوابة الداعم إلا بعد تفعيل موافقة المستفيد وتطبيق طبقات الطمس (Redaction) وإقرار المراجع.
                </p>
              </div>
            </div>

            <div className="flex justify-center bg-background p-3 rounded-xl border border-border">
              <canvas
                ref={canvasRef}
                width={480}
                height={260}
                className="max-w-full h-auto rounded"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() =>
                  setRedactionRects((prev) => [
                    ...prev,
                    {
                      x: 130,
                      y: 125,
                      w: 220,
                      h: 30,
                      label: 'طمس إضافي للعنوان أو التوقيع',
                    },
                  ])
                }
                className="btn-secondary text-xs py-1.5 px-3"
              >
                + إضافة منطقة طمس جديدة (Blur Box)
              </button>
              <button
                type="button"
                onClick={() => setShowRedactionModal(false)}
                className="btn-primary text-xs py-2 px-5"
              >
                اعتماد الصورة المطموسة وحفظها
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
