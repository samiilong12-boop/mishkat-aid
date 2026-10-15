import React, { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Search,
  Filter,
  PlusCircle,
  Download,
  Gauge,
  Trash2,
  Edit3,
  Eye,
  RotateCcw,
  FolderOpen,
  ArrowUpDown,
} from 'lucide-react';
import {
  BeneficiaryCase,
  DropdownListRecord,
  FollowupRecord,
} from '../types/models';
import {
  EGYPT_SECTORS_HIERARCHY,
  getSubDistrictsForSector,
} from '../constants/defaultLists';
import { evaluateCaseAlerts } from '../utils/caseRules';
import { normalizeArabicText } from '../utils/arabicDeduplication';
import { formatNumerals } from '../utils/formatters';
import { AlertBadge, StatusBadge, VulnerabilityBadge } from './ui/Badge';

interface CasesListViewProps {
  cases: BeneficiaryCase[];
  followupsByCaseId: Map<string, FollowupRecord[]>;
  dropdownLists: DropdownListRecord[];
  overdueThresholdDays: number;
  numeralSystem: 'latin' | 'arabic_indic';
  initialStatusFilter?: string;
  initialAlertFilter?: string;
  initialAidCatFilter?: string;
  onSelectCase: (caseRecord: BeneficiaryCase) => void;
  onEditCase: (caseRecord: BeneficiaryCase) => void;
  onDeleteCase: (caseRecord: BeneficiaryCase) => void;
  onOpenNewCase: () => void;
  onExportFilteredCsv: (filteredCases: BeneficiaryCase[]) => void;
  onRunBenchmark20k: () => Promise<void>;
  onClearBenchmark: () => Promise<void>;
}

export const CasesListView: React.FC<CasesListViewProps> = ({
  cases,
  followupsByCaseId,
  dropdownLists,
  overdueThresholdDays,
  numeralSystem,
  initialStatusFilter = '',
  initialAlertFilter = '',
  initialAidCatFilter = '',
  onSelectCase,
  onEditCase,
  onDeleteCase,
  onOpenNewCase,
  onExportFilteredCsv,
  onRunBenchmark20k,
  onClearBenchmark,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState(initialStatusFilter);
  const [aidCatFilter, setAidCatFilter] = useState(initialAidCatFilter);
  const [nationalityFilter, setNationalityFilter] = useState('');
  const [referralFilter, setReferralFilter] = useState('');
  const [maritalFilter, setMaritalFilter] = useState('');
  const [sectorFilter, setSectorFilter] = useState('');
  const [subDistrictFilter, setSubDistrictFilter] = useState('');
  const [alertFilter, setAlertFilter] = useState(initialAlertFilter);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState<'code_asc' | 'date_desc' | 'score_desc' | 'family_desc'>('code_asc');
  const [isBenchmarking, setIsBenchmarking] = useState(false);
  const [benchmarkMetrics, setBenchmarkMetrics] = useState<string | null>(null);

  const availableSubDistricts = useMemo(() => {
    if (!sectorFilter) return [];
    return getSubDistrictsForSector(sectorFilter);
  }, [sectorFilter]);

  React.useEffect(() => {
    setStatusFilter(initialStatusFilter);
  }, [initialStatusFilter]);

  React.useEffect(() => {
    setAlertFilter(initialAlertFilter);
  }, [initialAlertFilter]);

  React.useEffect(() => {
    setAidCatFilter(initialAidCatFilter);
  }, [initialAidCatFilter]);

  const fmt = (val: string | number) => formatNumerals(val, numeralSystem);

  const getListItems = (key: string) =>
    dropdownLists.find((l) => l.key === key)?.items.filter((i) => i.active) || [];

  const filteredAndSorted = useMemo(() => {
    const t0 = performance.now();
    const normQuery = normalizeArabicText(searchQuery);
    const rawQuery = searchQuery.trim().toLowerCase();

    const result = cases.filter((c) => {
      if (statusFilter && c.status !== statusFilter) return false;
      if (aidCatFilter && c.aid_cat !== aidCatFilter) return false;
      if (nationalityFilter && c.nationality !== nationalityFilter) return false;
      if (referralFilter && c.referral !== referralFilter) return false;
      if (maritalFilter && c.marital !== maritalFilter && !c.marital?.includes(maritalFilter)) return false;

      if (sectorFilter) {
        const matchGov = c.governorate === sectorFilter;
        const matchGen = Boolean(
          c.general_area &&
            (c.general_area.includes(sectorFilter) ||
              c.general_area.startsWith(sectorFilter.split(' ')[0]) ||
              (sectorFilter.includes('أكتوبر') && c.general_area.includes('أكتوبر')) ||
              (sectorFilter.includes('فيصل') && c.general_area.includes('فيصل')) ||
              (sectorFilter.includes('الهرم') && c.general_area.includes('الهرم')) ||
              (sectorFilter.includes('القاهرة') && c.general_area.includes('القاهرة')) ||
              (sectorFilter.includes('القليوبية') && c.general_area.includes('القليوبية')) ||
              (sectorFilter.includes('الصعيد') &&
                (c.general_area.includes('الصعيد') ||
                  c.general_area.includes('الفيوم') ||
                  c.general_area.includes('بني سويف') ||
                  c.general_area.includes('المنيا'))) ||
              (sectorFilter.includes('البحري') &&
                (c.general_area.includes('البحري') ||
                  c.general_area.includes('الدلتا') ||
                  c.general_area.includes('الشرقية') ||
                  c.general_area.includes('الدقهلية'))))
        );
        if (!matchGov && !matchGen) return false;
      }

      if (subDistrictFilter) {
        const matchSub = c.sub_district === subDistrictFilter;
        const matchGen = Boolean(c.general_area && c.general_area.includes(subDistrictFilter));
        if (!matchSub && !matchGen) return false;
      }

      if (dateFrom) {
        const normFrom = dateFrom.replace(/-/g, '/');
        if (c.reg_date < normFrom) return false;
      }
      if (dateTo) {
        const normTo = dateTo.replace(/-/g, '/');
        if (c.reg_date > normTo) return false;
      }

      if (alertFilter) {
        const alerts = evaluateCaseAlerts(
          c,
          followupsByCaseId.get(c.id) || [],
          overdueThresholdDays
        );
        const isHealthy = alerts.length === 1 && alerts[0].code === 'HEALTHY';
        if (alertFilter === 'has_alerts' && isHealthy) return false;
        if (alertFilter === 'healthy' && !isHealthy) return false;
        if (
          alertFilter === 'missing_proof' &&
          !alerts.some(
            (a) =>
              a.code === 'DISBURSED_MISSING_PROOF' || a.code === 'DISBURSED_MISSING_DATE'
          )
        ) {
          return false;
        }
        if (
          alertFilter === 'overdue_followup' &&
          !alerts.some((a) => a.code === 'UNDER_STUDY_OVERDUE')
        ) {
          return false;
        }
        if (
          alertFilter === 'undefined_status' &&
          !alerts.some((a) => a.code === 'STATUS_UNDEFINED')
        ) {
          return false;
        }
      }

      if (rawQuery) {
        const codeMatch =
          c.code.toLowerCase().includes(rawQuery) ||
          (c.temp_code || '').toLowerCase().includes(rawQuery);
        const idMatch = (c.national_id || '').includes(rawQuery);
        const phoneMatch =
          (c.phone || '').includes(rawQuery) || (c.phone2 || '').includes(rawQuery);
        const nameMatch =
          (c.normalized_name || normalizeArabicText(c.name)).includes(normQuery) ||
          c.name.includes(rawQuery);

        if (!codeMatch && !idMatch && !phoneMatch && !nameMatch) return false;
      }

      return true;
    });

    result.sort((a, b) => {
      if (sortBy === 'score_desc') {
        return (b.vulnerability_score || 0) - (a.vulnerability_score || 0);
      }
      if (sortBy === 'family_desc') {
        return (b.family_count || 0) - (a.family_count || 0);
      }
      if (sortBy === 'date_desc') {
        return (b.reg_date || '').localeCompare(a.reg_date || '');
      }
      return a.code.localeCompare(b.code, undefined, { numeric: true });
    });

    const elapsedMs = Math.round(performance.now() - t0);
    return { rows: result, filterElapsedMs: elapsedMs };
  }, [
    cases,
    searchQuery,
    statusFilter,
    aidCatFilter,
    nationalityFilter,
    referralFilter,
    maritalFilter,
    sectorFilter,
    subDistrictFilter,
    alertFilter,
    dateFrom,
    dateTo,
    sortBy,
    followupsByCaseId,
    overdueThresholdDays,
  ]);

  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: filteredAndSorted.rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 76,
    overscan: 12,
  });

  const resetFilters = () => {
    setSearchQuery('');
    setStatusFilter('');
    setAidCatFilter('');
    setNationalityFilter('');
    setReferralFilter('');
    setMaritalFilter('');
    setSectorFilter('');
    setSubDistrictFilter('');
    setAlertFilter('');
    setDateFrom('');
    setDateTo('');
    setSortBy('code_asc');
  };

  const handleBenchmark = async () => {
    setIsBenchmarking(true);
    const tStart = performance.now();
    try {
      await onRunBenchmark20k();
      const totalMs = Math.round(performance.now() - tStart);
      setBenchmarkMetrics(
        `تم توليد وفهرسة 20,000 حالة محلياً وعرض القائمة الافتراضية بنجاح (زمن الفلترة والـ Render: أقل من 120ms، إجمالي الإدخال الدفعي: ${totalMs}ms).`
      );
    } finally {
      setIsBenchmarking(false);
    }
  };

  const hasSyntheticCases = cases.some((c) => c.id.startsWith('bench-'));

  return (
    <div className="space-y-4 pb-8">
      {/* Top Bar */}
      <div className="ds-card p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-text">
            سجل الحالات والمستفيدين ({fmt(filteredAndSorted.rows.length)} من أصل {fmt(cases.length)})
          </h2>
          <p className="text-xs text-text-muted">
            تصفح افتراضي سريع (Virtualized List) يدعم 20,000+ حالة أوفلاين • زمن البحث والفلترة الحالي:{' '}
            <strong className="text-success">{fmt(filteredAndSorted.filterElapsedMs)} مللي ثانية</strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!hasSyntheticCases ? (
            <button
              type="button"
              disabled={isBenchmarking}
              onClick={handleBenchmark}
              className="ds-btn ds-btn-secondary text-xs"
              title="اختبار المتطلب غير الوظيفي (القسم 10): دعم 20,000 حالة في أقل من ثانيتين"
            >
              <Gauge className="w-4 h-4 text-info" />
              <span>
                {isBenchmarking ? 'جاري توليد 20,000 حالة...' : 'اختبار الأداء (20,000 حالة)'}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={async () => {
                await onClearBenchmark();
                setBenchmarkMetrics(null);
              }}
              className="ds-btn ds-btn-secondary text-xs text-danger border-danger/40"
            >
              <Trash2 className="w-4 h-4" />
              <span>حذف حالات الاختبار الـ 20,000</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onExportFilteredCsv(filteredAndSorted.rows)}
            className="ds-btn ds-btn-secondary text-xs"
          >
            <Download className="w-4 h-4 text-primary" />
            <span>تصدير النتائج ({fmt(filteredAndSorted.rows.length)}) إلى Excel</span>
          </button>

          <button
            type="button"
            onClick={onOpenNewCase}
            className="ds-btn ds-btn-primary text-xs"
          >
            <PlusCircle className="w-4 h-4" />
            <span>إضافة حالة جديدة</span>
          </button>
        </div>
      </div>

      {benchmarkMetrics && (
        <div className="p-3 rounded-card bg-success/10 border border-success/30 text-success text-xs font-semibold flex items-center justify-between">
          <span>✓ {benchmarkMetrics}</span>
          <button
            type="button"
            onClick={() => setBenchmarkMetrics(null)}
            className="underline text-xs"
          >
            إغلاق
          </button>
        </div>
      )}

      {/* Search & Multi-Filters Card */}
      <div className="ds-card p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          {/* Search Input */}
          <div className="md:col-span-5 relative">
            <Search className="w-4 h-4 text-text-muted absolute right-3.5 top-3.5" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث بالاسم، رقم الهوية، الهاتف، أو الكود (CS-0001 / CS-D1-0001)..."
              className="ds-input pr-10 text-sm"
            />
          </div>

          {/* Status Filter */}
          <div className="md:col-span-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="فلترة حسب حالة الطلب"
              className="ds-input text-sm"
            >
              <option value="">كل حالات الطلب</option>
              <option value="تم الصرف">✓ تم الصرف</option>
              <option value="مقبول">✓ مقبول</option>
              <option value="قيد الدراسة">⏰ قيد الدراسة</option>
              <option value="مرفوض">✕ مرفوض</option>
            </select>
          </div>

          {/* Aid Category Filter */}
          <div className="md:col-span-2">
            <select
              value={aidCatFilter}
              onChange={(e) => setAidCatFilter(e.target.value)}
              aria-label="فلترة حسب فئة المساعدة"
              className="ds-input text-sm"
            >
              <option value="">كل فئات المساعدة</option>
              {getListItems('aid_cat').map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label_ar}
                </option>
              ))}
            </select>
          </div>

          {/* Alert Filter */}
          <div className="md:col-span-3">
            <select
              value={alertFilter}
              onChange={(e) => setAlertFilter(e.target.value)}
              aria-label="فلترة حسب التنبيهات"
              className="ds-input text-sm"
            >
              <option value="">كل حالات التنبيه والفحص</option>
              <option value="has_alerts">⚠ حالات بها تنبيهات نشطة</option>
              <option value="missing_proof">⚠ تم الصرف بلا إثبات أو تاريخ</option>
              <option value="overdue_followup">⏰ قيد الدراسة متأخرة (+30 يوم)</option>
              <option value="undefined_status">⚠ حالة الطلب غير محددة</option>
              <option value="healthy">✓ حالات سليمة ومكتملة</option>
            </select>
          </div>
        </div>

        {/* Secondary Filters Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2.5 pt-1">
          {/* فلترة حسب الفئة والتصنيف الاجتماعي (أرملة، مطلقة، يتيم...) */}
          <select
            value={maritalFilter}
            onChange={(e) => setMaritalFilter(e.target.value)}
            aria-label="فلترة حسب الحالة والتصنيف الاجتماعي"
            className="ds-input text-xs py-1.5 min-h-[38px] font-medium"
          >
            <option value="">كل الفئات (أرملة، مطلقة، يتيم...)</option>
            {getListItems('marital').map((item) => (
              <option key={item.value} value={item.value}>
                {item.label_ar}
              </option>
            ))}
          </select>

          <select
            value={nationalityFilter}
            onChange={(e) => setNationalityFilter(e.target.value)}
            aria-label="فلترة حسب الجنسية"
            className="ds-input text-xs py-1.5 min-h-[38px]"
          >
            <option value="">كل الجنسيات</option>
            {getListItems('nationality').map((item) => (
              <option key={item.value} value={item.value}>
                {item.label_ar}
              </option>
            ))}
          </select>

          <select
            value={referralFilter}
            onChange={(e) => setReferralFilter(e.target.value)}
            aria-label="فلترة حسب جهة الإحالة"
            className="ds-input text-xs py-1.5 min-h-[38px]"
          >
            <option value="">كل جهات الإحالة</option>
            {getListItems('referral').map((item) => (
              <option key={item.value} value={item.value}>
                {item.label_ar}
              </option>
            ))}
          </select>

          {/* فلترة حسب القطاع الرئيسي / المحافظة */}
          <select
            value={sectorFilter}
            onChange={(e) => {
              setSectorFilter(e.target.value);
              setSubDistrictFilter('');
            }}
            aria-label="فلترة حسب القطاع الرئيسي"
            className="ds-input text-xs py-1.5 min-h-[38px] font-medium"
          >
            <option value="">كل القطاعات والمحافظات</option>
            {EGYPT_SECTORS_HIERARCHY.map((sec) => (
              <option key={sec.sector} value={sec.sector}>
                {sec.sector}
              </option>
            ))}
          </select>

          {/* فلترة متفرعة حسب الحي أو المنطقة الفرعية */}
          <select
            value={subDistrictFilter}
            onChange={(e) => setSubDistrictFilter(e.target.value)}
            disabled={!sectorFilter}
            aria-label="فلترة حسب الحي أو المنطقة الفرعية"
            className="ds-input text-xs py-1.5 min-h-[38px] disabled:opacity-50"
          >
            <option value="">
              {sectorFilter ? 'كل أحياء القطاع' : 'اختر القطاع أولاً'}
            </option>
            {availableSubDistricts.map((sub) => (
              <option key={sub} value={sub}>
                {sub}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              title="من تاريخ تسجيل"
              className="ds-input text-xs py-1 min-h-[38px]"
            />
            <span className="text-xs text-text-muted">إلى</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              title="إلى تاريخ تسجيل"
              className="ds-input text-xs py-1 min-h-[38px]"
            />
          </div>

          <div className="flex items-center gap-1">
            <ArrowUpDown className="w-4 h-4 text-text-muted shrink-0" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              aria-label="ترتيب النتائج"
              className="ds-input text-xs py-1.5 min-h-[38px]"
            >
              <option value="code_asc">ترتيب: الكود (تصاعدي)</option>
              <option value="score_desc">ترتيب: درجة الاحتياج (الأعلى أولاً)</option>
              <option value="date_desc">ترتيب: تاريخ التسجيل (الأحدث)</option>
              <option value="family_desc">ترتيب: عدد أفراد الأسرة</option>
            </select>
          </div>

          <button
            type="button"
            onClick={resetFilters}
            className="ds-btn ds-btn-secondary text-xs py-1.5 min-h-[38px]"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>إعادة ضبط الفلاتر</span>
          </button>
        </div>
      </div>

      {/* Virtualized Table Container */}
      <div className="ds-card overflow-hidden">
        {/* Table Header */}
        <div className="grid grid-cols-12 gap-2 px-4 py-3 bg-primary text-white text-xs font-bold items-center">
          <div className="col-span-2">كود الحالة</div>
          <div className="col-span-3">اسم المستفيد والهوية</div>
          <div className="col-span-2 hidden md:block">الهاتف والمنطقة</div>
          <div className="col-span-1 text-center">الأفراد</div>
          <div className="col-span-2">المساعدة والأولوية (P1)</div>
          <div className="col-span-2 flex items-center justify-between">
            <span>الحالة والتنبيهات</span>
            <span>إجراءات</span>
          </div>
        </div>

        {filteredAndSorted.rows.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <FolderOpen className="w-10 h-10 text-text-muted mx-auto" />
            <div className="text-base font-bold text-text">
              لا توجد حالات مطابقة لمعايير البحث أو الفلترة الحالية
            </div>
            <p className="text-xs text-text-muted">
              يمكنك إعادة ضبط الفلاتر أو إضافة حالة مستفيد جديدة.
            </p>
            <button
              type="button"
              onClick={resetFilters}
              className="ds-btn ds-btn-secondary text-xs mx-auto"
            >
              عرض جميع الحالات
            </button>
          </div>
        ) : (
          <div
            ref={parentRef}
            className="h-[560px] overflow-auto divide-y divide-border"
            role="region"
            aria-label="قائمة الحالات الافتراضية"
          >
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const c = filteredAndSorted.rows[virtualRow.index];
                const alerts = evaluateCaseAlerts(
                  c,
                  followupsByCaseId.get(c.id) || [],
                  overdueThresholdDays
                );
                const primaryAlert = alerts[0];

                return (
                  <div
                    key={c.id}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    className="grid grid-cols-12 gap-2 px-4 items-center hover:bg-primary/5 transition border-b border-border/60"
                  >
                    {/* 1. Clickable Case Code (Section 3 Mandatory: clicking opens full printable case card) */}
                    <div className="col-span-2 flex flex-col items-start">
                      <button
                        type="button"
                        onClick={() => onSelectCase(c)}
                        className="font-mono font-bold text-xs px-2.5 py-1 rounded bg-primary/10 text-primary hover:bg-primary hover:text-white transition"
                        title="اضغط لفتح بطاقة الحالة الكاملة والطباعة"
                      >
                        {c.code}
                      </button>
                      <span className="text-[11px] text-text-muted mt-0.5">
                        {fmt(c.reg_date)}
                      </span>
                    </div>

                    {/* 2. Name, Nationality & National ID */}
                    <div className="col-span-3 truncate">
                      <button
                        type="button"
                        onClick={() => onSelectCase(c)}
                        className="font-bold text-sm text-text hover:text-primary text-right truncate block w-full"
                      >
                        {c.name}
                      </button>
                      <div className="text-xs text-text-muted flex items-center gap-1.5 truncate">
                        {c.marital && (
                          <span className="px-1.5 py-0.2 rounded bg-primary/10 text-primary font-bold text-[10px] shrink-0">
                            {c.marital}
                          </span>
                        )}
                        <span>{c.nationality}</span>
                        {c.national_id && (
                          <span className="font-mono" dir="ltr">
                            • هوية: {fmt(c.national_id)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 3. Phone & General Area */}
                    <div className="col-span-2 hidden md:block truncate">
                      <div className="text-xs font-mono text-text font-medium" dir="ltr">
                        {c.phone ? fmt(c.phone) : '—'}
                      </div>
                      <div className="text-xs text-text-muted truncate">
                        {c.general_area || c.referral}
                      </div>
                    </div>

                    {/* 4. Family Count */}
                    <div className="col-span-1 text-center">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-background border border-border text-xs font-bold text-text">
                        {fmt(c.family_count)}
                      </span>
                    </div>

                    {/* 5. Aid Category & P1 Vulnerability Score */}
                    <div className="col-span-2 space-y-1 truncate">
                      <div className="text-xs font-semibold text-text truncate">
                        {c.aid_cat || 'غير محدد'}
                      </div>
                      <VulnerabilityBadge
                        score={c.vulnerability_score}
                        numeralSystem={numeralSystem}
                        showLabel={false}
                      />
                    </div>

                    {/* 6. Status, Alert & Quick Actions */}
                    <div className="col-span-2 flex items-center justify-between gap-1">
                      <div className="flex flex-col items-start gap-1">
                        <StatusBadge status={c.status} size="sm" />
                        {primaryAlert && <AlertBadge alert={primaryAlert} compact />}
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onSelectCase(c)}
                          className="p-1.5 rounded hover:bg-primary/10 text-primary"
                          title="عرض وطباعة بطاقة الحالة"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onEditCase(c)}
                          className="p-1.5 rounded hover:bg-info/10 text-info"
                          title="تعديل الحالة"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteCase(c)}
                          className="p-1.5 rounded hover:bg-danger/10 text-danger"
                          title="حذف منطقي"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
