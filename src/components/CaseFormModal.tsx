import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Save,
  AlertTriangle,
  MapPin,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Sparkles,
  FileCheck,
} from 'lucide-react';
import {
  BeneficiaryCase,
  DropdownListRecord,
} from '../types/models';
import {
  EGYPT_SECTORS_HIERARCHY,
  getSubDistrictsForSector,
  detectSectorAndSubDistrict,
} from '../constants/defaultLists';
import { findDuplicateMatches } from '../utils/arabicDeduplication';
import { calculateVulnerabilityScore } from '../utils/vulnerabilityScore';
import { validateCaseInput } from '../utils/caseRules';
import { toInputDateValue, toYYYYMMDD } from '../utils/formatters';
import { AttachmentField } from './ui/AttachmentField';
import { VulnerabilityBadge } from './ui/Badge';

const DRAFT_STORAGE_KEY = 'sanad_case_form_draft_v1';

interface CaseFormModalProps {
  initialCase?: BeneficiaryCase | null;
  existingCases: BeneficiaryCase[];
  dropdownLists: DropdownListRecord[];
  onClose: () => void;
  onSave: (formData: Partial<BeneficiaryCase> & { name: string }, existingId?: string) => Promise<void>;
  onOpenMatchingCase: (matched: BeneficiaryCase) => void;
}

export const CaseFormModal: React.FC<CaseFormModalProps> = ({
  initialCase,
  existingCases,
  dropdownLists,
  onClose,
  onSave,
  onOpenMatchingCase,
}) => {
  const isEditing = Boolean(initialCase?.id);

  const [form, setForm] = useState<Partial<BeneficiaryCase>>(() => {
    if (initialCase) {
      const detected = detectSectorAndSubDistrict(initialCase.general_area || '');
      const gov = initialCase.governorate || detected.sector;
      const sub = initialCase.sub_district || detected.subDistrict;
      return {
        ...initialCase,
        governorate: gov,
        sub_district: sub,
        general_area: initialCase.general_area || (sub ? `${gov} — ${sub}` : gov),
      };
    }
    try {
      const savedDraft = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (savedDraft) {
        const parsed = JSON.parse(savedDraft);
        const detected = detectSectorAndSubDistrict(parsed.general_area || '');
        const gov = parsed.governorate || detected.sector;
        const sub = parsed.sub_district || detected.subDistrict;
        return {
          ...parsed,
          governorate: gov,
          sub_district: sub,
          general_area: parsed.general_area || (sub ? `${gov} — ${sub}` : gov),
        };
      }
    } catch {
      // Ignore invalid draft
    }
    const defaultSector = EGYPT_SECTORS_HIERARCHY[0].sector; // 'مدينة 6 أكتوبر والشيخ زايد'
    const defaultSub = EGYPT_SECTORS_HIERARCHY[0].subDistricts[1]; // 'الحي الثاني'
    return {
      reg_date: toYYYYMMDD(new Date()),
      name: '',
      national_id: '',
      id_attach: '',
      nationality: 'مصري',
      referral: 'تقديم مباشر',
      referrer_name: '',
      referrer_phone: '',
      referrer_org: '',
      phone: '',
      phone2: '',
      governorate: defaultSector,
      sub_district: defaultSub,
      general_area: `${defaultSector} — ${defaultSub}`,
      address: '',
      gps_lat: null,
      gps_lng: null,
      marital: 'متزوج',
      breadwinner: '',
      breadwinner_rel: 'رب الأسرة',
      family_count: 4,
      children_count: 2,
      family_names: '',
      housing_type: 'إيجار',
      income_status: 'دخل غير منتظم (يومية)',
      health: 'سليم',
      health_desc: '',
      medical_attach: '',
      aid_cat: 'مساعدات شتوية',
      aid_types: [],
      need_desc: '',
      status: 'قيد الدراسة',
      disb_date: '',
      proof_method: '',
      proof_attach: '',
      notes: '',
      anonymized_summary: '',
      consent_data_processing: true,
      consent_photo_sharing: false,
    };
  });

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    basic: true,
    contact: true,
    family: true,
    health: true,
    aid: true,
    statusProof: true,
    privacyConsent: false,
  });

  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [strictProofRule, setStrictProofRule] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<string | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);

  // Auto-save draft when creating a new case (Screen 4 requirement)
  useEffect(() => {
    if (isEditing) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(form));
        setDraftSavedAt(new Date().toLocaleTimeString('ar-EG'));
      } catch {
        // Ignore quota errors
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [form, isEditing]);

  const updateField = <K extends keyof BeneficiaryCase>(key: K, value: BeneficiaryCase[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const toggleSection = (key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const getListItems = (key: string) =>
    dropdownLists.find((l) => l.key === key)?.items.filter((i) => i.active) || [];

  const currentSubDistricts = useMemo(() => {
    const sec = form.governorate || EGYPT_SECTORS_HIERARCHY[0].sector;
    return getSubDistrictsForSector(sec);
  }, [form.governorate]);

  const [isCustomSubDistrict, setIsCustomSubDistrict] = useState(() => {
    if (form.governorate && form.sub_district) {
      const subs = getSubDistrictsForSector(form.governorate);
      return subs.length > 0 && !subs.includes(form.sub_district);
    }
    return false;
  });

  const handleSectorChange = (newSector: string) => {
    const subs = getSubDistrictsForSector(newSector);
    const firstSub = subs[0] || '';
    setIsCustomSubDistrict(false);
    setForm((prev) => ({
      ...prev,
      governorate: newSector,
      sub_district: firstSub,
      general_area: firstSub ? `${newSector} — ${firstSub}` : newSector,
    }));
  };

  const handleSubDistrictChange = (newSub: string) => {
    setForm((prev) => {
      const sec = prev.governorate || EGYPT_SECTORS_HIERARCHY[0].sector;
      return {
        ...prev,
        sub_district: newSub,
        general_area: newSub ? `${sec} — ${newSub}` : sec,
      };
    });
  };

  // Real-time duplicate detection (Section 7 + P1.4 Smart Arabic Deduplication)
  const duplicateMatches = useMemo(() => {
    return findDuplicateMatches(
      {
        id: initialCase?.id,
        name: form.name,
        national_id: form.national_id,
        phone: form.phone,
        phone2: form.phone2,
      },
      existingCases
    );
  }, [form.name, form.national_id, form.phone, form.phone2, initialCase?.id, existingCases]);

  // Real-time P1.1 Transparent Vulnerability Score
  const liveVulnerability = useMemo(() => calculateVulnerabilityScore(form), [form]);

  const toggleAidType = (aidTypeLabel: string) => {
    const current = form.aid_types || [];
    if (current.includes(aidTypeLabel)) {
      updateField(
        'aid_types',
        current.filter((t) => t !== aidTypeLabel)
      );
    } else {
      updateField('aid_types', [...current, aidTypeLabel]);
    }
  };

  const handleCaptureGps = () => {
    if (!navigator.geolocation) {
      setGpsStatus('المتصفح الحالي لا يدعم تحديد الموقع الجغرافي');
      return;
    }
    setGpsStatus('جاري التقاط إحداثيات GPS...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        updateField('gps_lat', Number(pos.coords.latitude.toFixed(6)));
        updateField('gps_lng', Number(pos.coords.longitude.toFixed(6)));
        setGpsStatus('✓ تم التقاط موقع GPS بنجاح');
      },
      () => {
        setGpsStatus('تعذر التقاط الموقع (يمكنك إدخاله يدوياً أو المتابعة بدونه)');
      },
      { enableHighAccuracy: true, timeout: 6000 }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateCaseInput(form, {
      enforceStrictProofOnDisbursed: strictProofRule,
    });

    if (!validation.valid) {
      setValidationErrors(validation.errors);
      return;
    }

    setValidationErrors([]);
    setIsSaving(true);
    try {
      await onSave(form as Partial<BeneficiaryCase> & { name: string }, initialCase?.id);
      if (!isEditing) {
        localStorage.removeItem(DRAFT_STORAGE_KEY);
      }
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const winterAidItems = getListItems('aid_winter');
  const generalAidItems = getListItems('aid_general');

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="ds-card w-full max-w-4xl max-h-[94vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-5 py-4 bg-primary text-white flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">
              {isEditing
                ? `تعديل بطاقة الحالة ${initialCase?.code} — ${initialCase?.name}`
                : 'إضافة حالة مستفيد جديدة (نموذج العمل الميداني)'}
            </h2>
            <p className="text-xs text-white/80 flex items-center gap-2 mt-0.5">
              <span>الحفظ يتم فوراً على القاعدة المحلية (Offline-First)</span>
              {!isEditing && draftSavedAt && (
                <span className="px-2 py-0.5 rounded bg-white/15">
                  ✓ تم حفظ المسودة تلقائياً ({draftSavedAt})
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/15 transition"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Validation Errors Banner */}
          {validationErrors.length > 0 && (
            <div className="p-4 rounded-card bg-danger/10 border border-danger text-danger space-y-1">
              <div className="font-bold text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                <span>يرجى تصحيح الملاحظات التالية قبل الحفظ:</span>
              </div>
              <ul className="list-disc list-inside text-xs space-y-1">
                {validationErrors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Non-blocking Duplicate Detection Warning (Section 7 + P1.4) */}
          {duplicateMatches.length > 0 && (
            <div className="p-4 rounded-card bg-warning/15 border-2 border-warning text-text space-y-2">
              <div className="flex items-center justify-between">
                <div className="font-bold text-sm text-amber-900 dark:text-warning flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 shrink-0" />
                  <span>
                    تنبيه كشف التكرار الذكي (لا يمنع الحفظ — يرجى مراجعة السجل المطابق):
                  </span>
                </div>
              </div>
              <div className="space-y-1.5">
                {duplicateMatches.slice(0, 3).map((m) => (
                  <div
                    key={m.matchedCase.id}
                    className="flex flex-wrap items-center justify-between gap-2 p-2 rounded bg-surface border border-border text-xs"
                  >
                    <span className="font-semibold">{m.reason_ar}</span>
                    <button
                      type="button"
                      onClick={() => onOpenMatchingCase(m.matchedCase)}
                      className="px-2.5 py-1 rounded bg-primary text-white font-bold hover:bg-primary-dark"
                    >
                      فتح بطاقة {m.matchedCase.code}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Live P1.1 Transparent Vulnerability Score Summary Bar */}
          <div className="p-3.5 rounded-card border border-info/30 bg-info/5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-5 h-5 text-primary" />
              <div>
                <div className="text-xs font-bold text-text">
                  درجة الاحتياج الشفافة المحسوبة تلقائياً (P1.1 Vulnerability Score)
                </div>
                <div className="text-[11px] text-text-muted">
                  تُحسب من: حجم الأسرة، وضع الإعالة، الحالة الصحية، الدخل، السكن، وعدد الأطفال
                </div>
              </div>
            </div>
            <VulnerabilityBadge score={liveVulnerability.score} />
          </div>

          {/* SECTION 1: Basic Identification */}
          <div className="border border-border rounded-card overflow-hidden">
            <button
              type="button"
              onClick={() => toggleSection('basic')}
              className="w-full px-4 py-3 bg-background/80 flex items-center justify-between font-bold text-sm text-text"
            >
              <span>1. البيانات الأساسية والهوية (مطلوب)</span>
              {openSections.basic ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {openSections.basic && (
              <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4 bg-surface">
                <div className="md:col-span-2">
                  <label className="ds-label">
                    اسم المستفيد (رب الأسرة) <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={form.name || ''}
                    onChange={(e) => updateField('name', e.target.value)}
                    placeholder="الاسم الرباعي كما في وثيقة الهوية..."
                    className="ds-input"
                  />
                </div>

                <div>
                  <label className="ds-label">تاريخ التسجيل (YYYY/MM/DD)</label>
                  <input
                    type="date"
                    value={toInputDateValue(form.reg_date || '')}
                    onChange={(e) => updateField('reg_date', toYYYYMMDD(e.target.value))}
                    className="ds-input"
                  />
                </div>

                <div>
                  <label className="ds-label">رقم الهوية / الجواز (يحتفظ بالأصفار)</label>
                  <input
                    type="text"
                    dir="ltr"
                    value={form.national_id || ''}
                    onChange={(e) => updateField('national_id', e.target.value)}
                    placeholder="مثال: 02980514120045"
                    className="ds-input font-mono text-left"
                  />
                </div>

                <div>
                  <label className="ds-label">الجنسية</label>
                  <select
                    value={form.nationality || 'مصري'}
                    onChange={(e) => updateField('nationality', e.target.value)}
                    className="ds-input"
                  >
                    {getListItems('nationality').map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label_ar}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="ds-label flex items-center justify-between">
                    <span>الحالة والتصنيف الاجتماعي</span>
                    <span className="text-[10px] text-primary font-normal">أرملة / مطلقة / يتيم...</span>
                  </label>
                  <select
                    value={form.marital || 'أرملة (تعيل أيتام)'}
                    onChange={(e) => updateField('marital', e.target.value)}
                    className="ds-input font-medium"
                  >
                    {getListItems('marital').map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label_ar}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-3">
                  <AttachmentField
                    label="مرفق الهوية / الجواز (id_attach)"
                    value={form.id_attach || ''}
                    onChange={(val) => updateField('id_attach', val)}
                    sensitive
                    helperText="صورة بطاقة الرقم القومي أو جواز السفر (تُضغط محلياً ولا تظهر أبداً في بوابة الداعمين)."
                  />
                </div>
              </div>
            )}
          </div>

          {/* SECTION 2: Referral, Contact & Address */}
          <div className="border border-border rounded-card overflow-hidden">
            <button
              type="button"
              onClick={() => toggleSection('contact')}
              className="w-full px-4 py-3 bg-background/80 flex items-center justify-between font-bold text-sm text-text"
            >
              <span>2. جهة الإحالة، أرقام الهواتف، والعنوان (+ إحداثيات GPS)</span>
              {openSections.contact ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {openSections.contact && (
              <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4 bg-surface">
                <div>
                  <label className="ds-label">الهاتف الأساسي (يحفظ الصفر الأول)</label>
                  <input
                    type="tel"
                    dir="ltr"
                    value={form.phone || ''}
                    onChange={(e) => updateField('phone', e.target.value)}
                    placeholder="01012345678"
                    className="ds-input font-mono text-left"
                  />
                </div>

                <div>
                  <label className="ds-label">هاتف إضافي / واتساب</label>
                  <input
                    type="tel"
                    dir="ltr"
                    value={form.phone2 || ''}
                    onChange={(e) => updateField('phone2', e.target.value)}
                    placeholder="01122334455"
                    className="ds-input font-mono text-left"
                  />
                </div>

                {/* Level 1: القطاع الرئيسي / المحافظة */}
                <div>
                  <label className="ds-label flex items-center justify-between">
                    <span>القطاع الرئيسي / المحافظة</span>
                    <span className="text-[10px] text-primary font-normal">المستوى الأول</span>
                  </label>
                  <select
                    value={form.governorate || EGYPT_SECTORS_HIERARCHY[0].sector}
                    onChange={(e) => handleSectorChange(e.target.value)}
                    className="ds-input font-medium"
                  >
                    {EGYPT_SECTORS_HIERARCHY.map((sec) => (
                      <option key={sec.sector} value={sec.sector}>
                        {sec.sector}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Level 2: الحي / المنطقة الفرعية */}
                <div>
                  <label className="ds-label flex items-center justify-between">
                    <span>الحي / المنطقة الفرعية</span>
                    <span className="text-[10px] text-primary font-normal">المستوى الثاني</span>
                  </label>
                  {!isCustomSubDistrict ? (
                    <select
                      value={form.sub_district || currentSubDistricts[0] || ''}
                      onChange={(e) => {
                        if (e.target.value === '__custom__') {
                          setIsCustomSubDistrict(true);
                        } else {
                          handleSubDistrictChange(e.target.value);
                        }
                      }}
                      className="ds-input"
                    >
                      {currentSubDistricts.map((sub) => (
                        <option key={sub} value={sub}>
                          {sub}
                        </option>
                      ))}
                      <option value="__custom__">➕ حي / شارع غير مدرج (كتابة يدوية)...</option>
                    </select>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={form.sub_district || ''}
                        onChange={(e) => handleSubDistrictChange(e.target.value)}
                        placeholder="اكتب اسم الحي أو الشارع..."
                        className="ds-input flex-1"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setIsCustomSubDistrict(false);
                          if (currentSubDistricts[0]) {
                            handleSubDistrictChange(currentSubDistricts[0]);
                          }
                        }}
                        className="ds-btn ds-btn-secondary px-2 text-xs"
                        title="العودة للقائمة"
                      >
                        إلغاء
                      </button>
                    </div>
                  )}
                </div>

                {/* المنطقة العامة المعروضة لبوابة الداعمين */}
                <div>
                  <label className="ds-label flex items-center justify-between">
                    <span>المنطقة للداعمين (بدون PII)</span>
                    <span className="text-[10px] text-success font-normal">آمن للخصوصية</span>
                  </label>
                  <div className="ds-input bg-background/50 flex items-center gap-2 text-primary font-bold text-xs select-none">
                    <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span className="truncate">{form.general_area || `${form.governorate} — ${form.sub_district}`}</span>
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="ds-label">العنوان / المنطقة بالتفصيل (محجوب عن الداعمين)</label>
                  <textarea
                    rows={2}
                    value={form.address || ''}
                    onChange={(e) => updateField('address', e.target.value)}
                    placeholder="الحي، الشارع، أقرب علامة مميزة، رقم المنزل..."
                    className="ds-input"
                  />
                </div>

                <div className="space-y-2">
                  <label className="ds-label">إحداثيات الموقع الجغرافي (GPS اختياري)</label>
                  <button
                    type="button"
                    onClick={handleCaptureGps}
                    className="ds-btn ds-btn-secondary w-full text-xs"
                  >
                    <MapPin className="w-4 h-4 text-primary" />
                    <span>التقاط موقع الزيارة الحالي (GPS)</span>
                  </button>
                  {(form.gps_lat || form.gps_lng) && (
                    <div className="text-xs font-mono text-success text-center" dir="ltr">
                      {form.gps_lat}, {form.gps_lng}
                    </div>
                  )}
                  {gpsStatus && <div className="text-[11px] text-text-muted">{gpsStatus}</div>}
                </div>

                <div>
                  <label className="ds-label">جهة الإحالة / المصدر</label>
                  <select
                    value={form.referral || 'تقديم مباشر'}
                    onChange={(e) => updateField('referral', e.target.value)}
                    className="ds-input"
                  >
                    {getListItems('referral').map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label_ar}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="ds-label">اسم الشخص المُحيل</label>
                  <input
                    type="text"
                    value={form.referrer_name || ''}
                    onChange={(e) => updateField('referrer_name', e.target.value)}
                    className="ds-input"
                  />
                </div>

                <div>
                  <label className="ds-label">رقم هاتف المُحيل / المنظمة المُحيلة</label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      dir="ltr"
                      value={form.referrer_phone || ''}
                      onChange={(e) => updateField('referrer_phone', e.target.value)}
                      placeholder="هاتف المحيل"
                      className="ds-input text-xs font-mono text-left"
                    />
                    <input
                      type="text"
                      value={form.referrer_org || ''}
                      onChange={(e) => updateField('referrer_org', e.target.value)}
                      placeholder="الجمعية المحيلة"
                      className="ds-input text-xs"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* SECTION 3: Family, Breadwinner, Housing & Income */}
          <div className="border border-border rounded-card overflow-hidden">
            <button
              type="button"
              onClick={() => toggleSection('family')}
              className="w-full px-4 py-3 bg-background/80 flex items-center justify-between font-bold text-sm text-text"
            >
              <span>3. بيانات الأسرة والمعيل والسكن والدخل</span>
              {openSections.family ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {openSections.family && (
              <div className="p-4 grid grid-cols-1 md:grid-cols-4 gap-4 bg-surface">
                <div>
                  <label className="ds-label">عدد أفراد الأسرة (0–99)</label>
                  <input
                    type="number"
                    min={0}
                    max={99}
                    step={1}
                    value={form.family_count ?? 1}
                    onChange={(e) => updateField('family_count', Number(e.target.value))}
                    className="ds-input font-bold"
                  />
                </div>

                <div>
                  <label className="ds-label">عدد الأطفال بالأسرة</label>
                  <input
                    type="number"
                    min={0}
                    max={99}
                    step={1}
                    value={form.children_count ?? 0}
                    onChange={(e) => updateField('children_count', Number(e.target.value))}
                    className="ds-input"
                  />
                </div>

                <div>
                  <label className="ds-label">اسم المعيل</label>
                  <input
                    type="text"
                    value={form.breadwinner || ''}
                    onChange={(e) => updateField('breadwinner', e.target.value)}
                    placeholder="اسم المعيل أو «لا يوجد»"
                    className="ds-input"
                  />
                </div>

                <div>
                  <label className="ds-label">صلة قرابة المعيل</label>
                  <input
                    type="text"
                    value={form.breadwinner_rel || ''}
                    onChange={(e) => updateField('breadwinner_rel', e.target.value)}
                    placeholder="الأب / الأم / الزوج..."
                    className="ds-input"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="ds-label">نوع السكن (مؤشر درجة الاحتياج P1)</label>
                  <select
                    value={form.housing_type || 'إيجار'}
                    onChange={(e) => updateField('housing_type', e.target.value)}
                    className="ds-input"
                  >
                    {getListItems('housing_type').map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label_ar}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="ds-label">حالة الدخل (مؤشر درجة الاحتياج P1)</label>
                  <select
                    value={form.income_status || 'دخل غير منتظم (يومية)'}
                    onChange={(e) => updateField('income_status', e.target.value)}
                    className="ds-input"
                  >
                    {getListItems('income_status').map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label_ar}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-4">
                  <label className="ds-label">أسماء أفراد الأسرة وأعمارهم (محجوب عن الداعمين)</label>
                  <textarea
                    rows={2}
                    value={form.family_names || ''}
                    onChange={(e) => updateField('family_names', e.target.value)}
                    placeholder="مثال: يوسف (14 سنة - طالب)، مريم (11 سنة)، عمر (8 سنوات)..."
                    className="ds-input"
                  />
                </div>
              </div>
            )}
          </div>

          {/* SECTION 4: Health Status (Sensitive) */}
          <div className="border border-border rounded-card overflow-hidden">
            <button
              type="button"
              onClick={() => toggleSection('health')}
              className="w-full px-4 py-3 bg-background/80 flex items-center justify-between font-bold text-sm text-text"
            >
              <span>4. الحالة الصحية والتقارير الطبية (بيانات حساسة)</span>
              {openSections.health ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {openSections.health && (
              <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4 bg-surface">
                <div>
                  <label className="ds-label">الحالة الصحية</label>
                  <select
                    value={form.health || 'سليم'}
                    onChange={(e) => updateField('health', e.target.value)}
                    className="ds-input"
                  >
                    {getListItems('health').map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label_ar}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="ds-label">وصف الحالة الصحية والتشخيص (حساس)</label>
                  <input
                    type="text"
                    value={form.health_desc || ''}
                    onChange={(e) => updateField('health_desc', e.target.value)}
                    placeholder="تفاصيل المرض المزمن أو الإعاقة والأدوية المطلوبة..."
                    className="ds-input"
                  />
                </div>

                <div className="md:col-span-3">
                  <AttachmentField
                    label="مرفق التقارير الطبية (medical_attach)"
                    value={form.medical_attach || ''}
                    onChange={(val) => updateField('medical_attach', val)}
                    sensitive
                    helperText="التقارير والروشتات الطبية سرية للغاية ولا تُعرض إلا للباحثين المختصين."
                  />
                </div>
              </div>
            )}
          </div>

          {/* SECTION 5: Aid Category & Multi-Select Aid Types */}
          <div className="border border-border rounded-card overflow-hidden">
            <button
              type="button"
              onClick={() => toggleSection('aid')}
              className="w-full px-4 py-3 bg-background/80 flex items-center justify-between font-bold text-sm text-text"
            >
              <span>5. فئة ونوع المساعدة المطلوبة (اختيار متعدد - القسم 4.4)</span>
              {openSections.aid ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {openSections.aid && (
              <div className="p-4 space-y-4 bg-surface">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="ds-label">فئة المساعدة الرئيسية (aid_cat)</label>
                    <select
                      value={form.aid_cat || 'مساعدات شتوية'}
                      onChange={(e) => updateField('aid_cat', e.target.value)}
                      className="ds-input font-semibold"
                    >
                      {getListItems('aid_cat').map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label_ar}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="ds-label">الأنواع المختارة حالياً ({(form.aid_types || []).length})</label>
                    <div className="text-xs text-primary font-semibold p-2.5 rounded-btn bg-primary/5 border border-primary/20 min-h-[44px] flex items-center">
                      {(form.aid_types || []).length > 0
                        ? (form.aid_types || []).join(' ، ')
                        : 'اختر نوعاً واحداً أو أكثر من القوائم أدناه'}
                    </div>
                  </div>
                </div>

                {/* Multi-select checkboxes for Winter Aid & General Aid (Section 4.4) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-3 rounded-card border border-border bg-background/40 space-y-2">
                    <div className="text-xs font-bold text-primary">
                      قائمة المساعدات الشتوية (اختيار متعدد):
                    </div>
                    <div className="grid grid-cols-1 gap-1.5">
                      {winterAidItems.map((item) => {
                        const checked = (form.aid_types || []).includes(item.value);
                        return (
                          <label
                            key={item.value}
                            className={`flex items-center gap-2 p-2 rounded cursor-pointer text-xs font-medium border transition ${
                              checked
                                ? 'bg-primary/10 border-primary text-primary font-bold'
                                : 'bg-surface border-border text-text'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleAidType(item.value)}
                              className="w-4 h-4 accent-primary"
                            />
                            <span>{item.label_ar}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="p-3 rounded-card border border-border bg-background/40 space-y-2">
                    <div className="text-xs font-bold text-info">
                      المساعدات العامة والعينية والطبية (اختيار متعدد):
                    </div>
                    <div className="grid grid-cols-1 gap-1.5">
                      {generalAidItems.map((item) => {
                        const checked = (form.aid_types || []).includes(item.value);
                        return (
                          <label
                            key={item.value}
                            className={`flex items-center gap-2 p-2 rounded cursor-pointer text-xs font-medium border transition ${
                              checked
                                ? 'bg-primary/10 border-primary text-primary font-bold'
                                : 'bg-surface border-border text-text'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleAidType(item.value)}
                              className="w-4 h-4 accent-primary"
                            />
                            <span>{item.label_ar}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="ds-label">وصف حالة الأسرة والاحتياج بالتفصيل (need_desc)</label>
                  <textarea
                    rows={3}
                    value={form.need_desc || ''}
                    onChange={(e) => updateField('need_desc', e.target.value)}
                    placeholder="اشرح ظروف الأسرة المعيشية وأسباب الاحتياج وأولوية التدخل..."
                    className="ds-input"
                  />
                </div>
              </div>
            )}
          </div>

          {/* SECTION 6: Request Status, Disbursement & Proof */}
          <div className="border border-border rounded-card overflow-hidden">
            <button
              type="button"
              onClick={() => toggleSection('statusProof')}
              className="w-full px-4 py-3 bg-background/80 flex items-center justify-between font-bold text-sm text-text"
            >
              <span>6. حالة الطلب وتوثيق الصرف وإثبات الاستلام</span>
              {openSections.statusProof ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {openSections.statusProof && (
              <div className="p-4 space-y-4 bg-surface">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="ds-label">حالة الطلب (الأربع الثابتة)</label>
                    <select
                      value={form.status || 'قيد الدراسة'}
                      onChange={(e) =>
                        updateField('status', e.target.value as BeneficiaryCase['status'])
                      }
                      className="ds-input font-bold"
                    >
                      <option value="قيد الدراسة">⏰ قيد الدراسة (أصفر)</option>
                      <option value="مقبول">✓ مقبول (أزرق)</option>
                      <option value="تم الصرف">✓ تم الصرف (أخضر)</option>
                      <option value="مرفوض">✕ مرفوض (أحمر)</option>
                    </select>
                  </div>

                  <div>
                    <label className="ds-label">تاريخ الصرف (YYYY/MM/DD)</label>
                    <input
                      type="date"
                      value={toInputDateValue(form.disb_date || '')}
                      onChange={(e) =>
                        updateField('disb_date', e.target.value ? toYYYYMMDD(e.target.value) : '')
                      }
                      className="ds-input"
                    />
                  </div>

                  <div>
                    <label className="ds-label">طريقة إثبات الاستلام</label>
                    <select
                      value={form.proof_method || ''}
                      onChange={(e) => updateField('proof_method', e.target.value)}
                      className="ds-input"
                    >
                      <option value="">— اختر طريقة الإثبات —</option>
                      {getListItems('proof_method').map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label_ar}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {form.status === 'تم الصرف' && (
                  <div className="p-3 rounded-btn bg-success/10 border border-success/30 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-success flex items-center gap-1.5">
                      <FileCheck className="w-4 h-4" />
                      <span>
                        قاعدة العمل (القسم 7): الصرف لا يُعتمد نهائياً كـ«تم الصرف» إلا بوجود مرفق إثبات استلام وتاريخ صرف.
                      </span>
                    </span>
                    <label className="inline-flex items-center gap-1.5 text-text-muted cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!strictProofRule}
                        onChange={(e) => setStrictProofRule(!e.target.checked)}
                      />
                      <span>السماح بالحفظ المؤقت مع إظهار تنبيه (⚠ بلا مرفق إثبات)</span>
                    </label>
                  </div>
                )}

                <AttachmentField
                  label="مرفق إثبات الاستلام (proof_attach)"
                  value={form.proof_attach || ''}
                  onChange={(val) => updateField('proof_attach', val)}
                  helperText="ارفع صورة كشف التوقيع، فاتورة الشراء، أو إيصال الاستلام النقدي."
                />

                <div>
                  <label className="ds-label">ملاحظات الباحث الاجتماعي / مسؤول الحالة (notes)</label>
                  <textarea
                    rows={2}
                    value={form.notes || ''}
                    onChange={(e) => updateField('notes', e.target.value)}
                    placeholder="أي ملاحظات ميدانية أو توصيات للجنة الاعتماد..."
                    className="ds-input"
                  />
                </div>
              </div>
            )}
          </div>

          {/* SECTION 7: Donor Portal Privacy Summary & Consent */}
          <div className="border border-border rounded-card overflow-hidden">
            <button
              type="button"
              onClick={() => toggleSection('privacyConsent')}
              className="w-full px-4 py-3 bg-background/80 flex items-center justify-between font-bold text-sm text-text"
            >
              <span>7. الخصوصية، موافقة المستفيد (Consent)، والوصف المجهول لبوابة الداعمين</span>
              {openSections.privacyConsent ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>

            {openSections.privacyConsent && (
              <div className="p-4 space-y-3 bg-surface">
                <div>
                  <label className="ds-label">
                    الوصف المجهول المعتمد لبوابة الداعمين (خالٍ تماماً من الأسماء وأرقام الهوية)
                  </label>
                  <input
                    type="text"
                    value={form.anonymized_summary || liveVulnerability.autoAnonymizedSummary}
                    onChange={(e) => updateField('anonymized_summary', e.target.value)}
                    className="ds-input text-sm"
                  />
                </div>

                <div className="flex flex-wrap gap-6 pt-1">
                  <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(form.consent_data_processing)}
                      onChange={(e) => updateField('consent_data_processing', e.target.checked)}
                      className="w-4 h-4 accent-primary"
                    />
                    <span>أقرّ بموافقة المستفيد على حفظ بياناته لأغراض دراسة وتقديم المساعدة</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(form.consent_photo_sharing)}
                      onChange={(e) => updateField('consent_photo_sharing', e.target.checked)}
                      className="w-4 h-4 accent-primary"
                    />
                    <span>موافقة المستفيد على مشاركة صورة الإيصال (بعد طمس الوجه والهوية) للداعمين</span>
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <div className="flex items-center justify-between pt-3 border-t border-border">
            <div className="text-xs text-text-muted flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-success" />
              <span>يُسجَّل التعديل تلقائياً في طابور المزامنة (Outbox) وسجل التدقيق</span>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="ds-btn ds-btn-secondary text-sm"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="ds-btn ds-btn-primary text-sm"
              >
                <Save className="w-4 h-4" />
                <span>{isSaving ? 'جاري الحفظ محلياً...' : isEditing ? 'حفظ التعديلات' : 'حفظ الحالة'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
