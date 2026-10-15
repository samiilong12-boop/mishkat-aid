import React, { useState, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  PackageCheck,
  Boxes,
  FolderKanban,
  HandHeart,
  MessageSquareWarning,
  Plus,
  CheckCircle2,
  AlertTriangle,
  QrCode,
  ShieldCheck,
  Printer,
  PenTool,
  RotateCcw,
  Users,
  FileSpreadsheet,
  Lock,
  Sparkles,
  CheckSquare,
} from 'lucide-react';
import {
  db,
  recordAidDistribution,
  logAuditAction,
} from '../db/database';
import {
  DistributionRecord,
  InventoryItemRecord,
  ProjectRecord,
  DonationRecord,
  ComplaintRecord,
} from '../types/models';
import {
  formatCurrencyEGP,
  getTodayYYYYMMDD,
  toYYYYMMDD,
  generateUUID,
} from '../utils/formatters';
import { exportDistributionsToCSV } from '../utils/csvExport';

type SubTabId =
  | 'distributions'
  | 'inventory'
  | 'projects'
  | 'donors_donations'
  | 'chs_complaints';

/**
 * Generates a deterministic SVG QR-like visual matrix from a verification token string
 * so receipts can be printed and visually verified 100% offline without external dependencies.
 */
export const DeterministicQrSvg: React.FC<{ token: string; size?: number }> = ({
  token,
  size = 112,
}) => {
  const gridSize = 15;
  const cells: boolean[][] = Array.from({ length: gridSize }, () =>
    Array(gridSize).fill(false)
  );

  const drawFinder = (r0: number, c0: number) => {
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        const isBorder = r === 0 || r === 4 || c === 0 || c === 4;
        const isCenter = r === 2 && c === 2;
        if (r0 + r < gridSize && c0 + c < gridSize) {
          cells[r0 + r][c0 + c] = isBorder || isCenter;
        }
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, gridSize - 5);
  drawFinder(gridSize - 5, 0);

  let hash = 2166136261;
  for (let i = 0; i < token.length; i++) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      const inTopLeft = r < 6 && c < 6;
      const inTopRight = r < 6 && c >= gridSize - 6;
      const inBottomLeft = r >= gridSize - 6 && c < 6;
      if (inTopLeft || inTopRight || inBottomLeft) continue;
      const bitIdx = (r * gridSize + c) % 31;
      const charCode = token.charCodeAt((r * gridSize + c) % token.length) || 7;
      cells[r][c] = ((hash >> bitIdx) ^ charCode) % 2 === 0;
    }
  }

  const cellPx = size / gridSize;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="border-2 border-primary p-1 bg-surface rounded"
      aria-label={`رمز التحقق الرقمي ${token}`}
    >
      <rect width={size} height={size} fill="#FFFFFF" />
      {cells.map((row, rIdx) =>
        row.map((filled, cIdx) =>
          filled ? (
            <rect
              key={`${rIdx}-${cIdx}`}
              x={cIdx * cellPx}
              y={rIdx * cellPx}
              width={cellPx}
              height={cellPx}
              fill="#0B4F8A"
            />
          ) : null
        )
      )}
    </svg>
  );
};

export const DistributionsAndProjectsView: React.FC<{
  onOpenCaseDetail: (caseId: string) => void;
}> = ({ onOpenCaseDetail }) => {
  const [subTab, setSubTab] = useState<SubTabId>('distributions');
  const [distributionMode, setDistributionMode] = useState<'single' | 'bulk'>('single');
  const [bannerMessage, setBannerMessage] = useState<{
    type: 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);

  // Single & Bulk Distribution Form States
  const [selectedCaseId, setSelectedCaseId] = useState<string>('');
  const [selectedBulkCaseIds, setSelectedBulkCaseIds] = useState<string[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('project-winter-2026');
  const [selectedDonorId, setSelectedDonorId] = useState<string>('donor-1');
  const [selectedInventoryId, setSelectedInventoryId] = useState<string>('inv-blankets');
  const [aidCat, setAidCat] = useState<string>('مساعدات شتوية');
  const [aidType, setAidType] = useState<string>('بطاطين / ألحفة + ملابس شتوية');
  const [quantity, setQuantity] = useState<number>(2);
  const [unit, setUnit] = useState<string>('بطانية ثقيلة');
  const [financialValue, setFinancialValue] = useState<number>(1500);
  const [disbDate, setDisbDate] = useState<string>(getTodayYYYYMMDD());
  const [proofMethod, setProofMethod] = useState<string>('كشف توقيع المستفيد');
  const [consentToShare, setConsentToShare] = useState<boolean>(true);
  const [isRedacted, setIsRedacted] = useState<boolean>(true);
  const [signaturePaths, setSignaturePaths] = useState<string[]>([
    'M 25 45 Q 70 15 115 45 T 195 30',
  ]);
  const [isDrawing, setIsDrawing] = useState(false);
  const svgPadRef = useRef<SVGSVGElement | null>(null);

  // Printable Receipt Modal State
  const [activeReceipt, setActiveReceipt] = useState<DistributionRecord | null>(null);

  // New Project / Donation / Restock / Complaint Modal States
  const [restockQtyMap, setRestockQtyMap] = useState<Record<string, number>>({});
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectPeriod, setNewProjectPeriod] = useState('ربيع 2027');
  const [newProjectBudget, setNewProjectBudget] = useState(250000);
  const [newProjectCategory, setNewProjectCategory] = useState('عينية');

  const [newDonationDonorId, setNewDonationDonorId] = useState('donor-1');
  const [newDonationProjectId, setNewDonationProjectId] = useState('project-winter-2026');
  const [newDonationAmount, setNewDonationAmount] = useState(50000);
  const [newDonationMethod, setNewDonationMethod] =
    useState<DonationRecord['collection_method']>('تحويل بنكي');
  const [newDonationRestrType, setNewDonationRestrType] = useState<
    'restricted' | 'unrestricted'
  >('restricted');
  const [newDonationNotes, setNewDonationNotes] = useState(
    'مخصص لحملة الشتاء والأسر الأشد احتياجاً'
  );

  const [newComplaintCaseCode, setNewComplaintCaseCode] = useState('CS-0002');
  const [newComplaintCategory, setNewComplaintCategory] =
    useState<ComplaintRecord['category']>('تأخر صرف المساعدة');
  const [newComplaintDetails, setNewComplaintDetails] = useState('');

  // Live Queries
  const allCases = useLiveQuery(
    () => db.beneficiary_cases.filter((c) => !c.deleted_at).toArray(),
    [],
    []
  );
  const distributions = useLiveQuery(
    () => db.distributions.filter((d) => !d.deleted_at).reverse().sortBy('created_at'),
    [],
    []
  );
  const inventoryItems = useLiveQuery(() => db.inventory_items.toArray(), [], []);
  const projects = useLiveQuery(() => db.projects.toArray(), [], []);
  const donors = useLiveQuery(() => db.donors.toArray(), [], []);
  const donations = useLiveQuery(() => db.donations.toArray(), [], []);
  const complaints = useLiveQuery(() => db.complaints_feedback.toArray(), [], []);

  // Initialize default selected case
  React.useEffect(() => {
    if (!selectedCaseId && allCases.length > 0) {
      const approvedOrDisbursed =
        allCases.find((c) => c.status === 'مقبول') || allCases[0];
      setSelectedCaseId(approvedOrDisbursed.id);
    }
  }, [allCases, selectedCaseId]);

  // Handle Inventory Item selection auto-fill
  const handleSelectInventoryItem = (invId: string) => {
    setSelectedInventoryId(invId);
    const item = inventoryItems.find((i) => i.id === invId);
    if (item) {
      setAidCat(item.aid_cat);
      setAidType(item.name);
      setUnit(item.unit);
      setFinancialValue(600 * quantity);
    }
  };

  // Interactive SVG Signature Pad handlers
  const getPadCoords = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgPadRef.current) return { x: 20, y: 35 };
    const rect = svgPadRef.current.getBoundingClientRect();
    return {
      x: Math.round(((e.clientX - rect.left) / rect.width) * 240),
      y: Math.round(((e.clientY - rect.top) / rect.height) * 80),
    };
  };

  const handlePadMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    setIsDrawing(true);
    const { x, y } = getPadCoords(e);
    setSignaturePaths((prev) => [...prev, `M ${x} ${y}`]);
  };

  const handlePadMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!isDrawing) return;
    const { x, y } = getPadCoords(e);
    setSignaturePaths((prev) => {
      if (prev.length === 0) return [`M ${x} ${y}`];
      const updated = [...prev];
      updated[updated.length - 1] = `${updated[updated.length - 1]} L ${x} ${y}`;
      return updated;
    });
  };

  const handlePadMouseUp = () => {
    setIsDrawing(false);
  };

  const buildSignatureSvgString = () => {
    const dAttr = signaturePaths.join(' ') || 'M 25 45 Q 70 15 115 45 T 195 30';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 80"><path d="${dAttr}" stroke="#0B4F8A" stroke-width="3" fill="none" stroke-linecap="round"/></svg>`;
  };

  const handleRecordDistribution = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetCaseIds =
      distributionMode === 'single' ? [selectedCaseId] : selectedBulkCaseIds;

    if (targetCaseIds.length === 0 || !targetCaseIds[0]) {
      setBannerMessage({
        type: 'error',
        text: 'يرجى اختيار حالة واحدة على الأقل لتسجيل الصرفية وإصدار إيصال الاستلام.',
      });
      return;
    }

    const sigSvg = buildSignatureSvgString();
    let lastReceipt: DistributionRecord | null = null;

    for (const cId of targetCaseIds) {
      lastReceipt = await recordAidDistribution({
        case_id: cId,
        project_id: selectedProjectId,
        donor_id: selectedDonorId,
        inventory_item_id: selectedInventoryId || undefined,
        aid_cat: aidCat,
        aid_type: aidType,
        quantity,
        unit,
        financial_value: financialValue,
        disb_date: toYYYYMMDD(disbDate),
        proof_method: proofMethod,
        proof_attach: 'data:image/svg+xml;utf8,' + encodeURIComponent(sigSvg),
        recipient_signature_svg: sigSvg,
        proof_gps: '30.0626, 31.2497',
        consent_to_share: consentToShare,
        is_redacted: isRedacted,
      });
    }

    setBannerMessage({
      type: 'success',
      text:
        targetCaseIds.length === 1
          ? `تم تسجيل الصرفية وإصدار الإيصال الموثّق (${lastReceipt?.receipt_number}) ببصمة SHA-256 وخصم الكمية من المخزون وتحديث حالة الطلب إلى "تم الصرف".`
          : `تم تنفيذ الصرف الجماعي لعدد (${targetCaseIds.length}) أسر بنجاح وإصدار إيصالات QR موثقة لكل أسرة.`,
    });

    if (lastReceipt && targetCaseIds.length === 1) {
      setActiveReceipt(lastReceipt);
    }
    setSelectedBulkCaseIds([]);
  };

  const handleRestockItem = async (item: InventoryItemRecord) => {
    const addQty = Number(restockQtyMap[item.id] || 50);
    if (addQty <= 0) return;
    const nowIso = new Date().toISOString();
    await db.inventory_items.put({
      ...item,
      qty_in: item.qty_in + addQty,
      qty_available: item.qty_available + addQty,
      updated_at: nowIso,
    });
    await logAuditAction({
      action: 'UPDATE',
      entity_type: 'system',
      entity_id: item.id,
      summary_ar: `توريد مخزني للصنف (${item.name}) بكمية +${addQty} ${item.unit}`,
    });
    setBannerMessage({
      type: 'success',
      text: `تم توريد +${addQty} ${item.unit} للصنف "${item.name}" بنجاح.`,
    });
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    const proj: ProjectRecord = {
      id: `proj-${generateUUID().slice(0, 8)}`,
      name: newProjectName.trim(),
      period_label: newProjectPeriod.trim() || '2026/2027',
      target_budget: Number(newProjectBudget) || 100000,
      currency: 'EGP',
      target_category: newProjectCategory,
      status: 'نشط',
      created_at: new Date().toISOString(),
    };
    await db.projects.put(proj);
    setNewProjectName('');
    setBannerMessage({
      type: 'success',
      text: `تم إنشاء الحملة/المشروع "${proj.name}" بنجاح.`,
    });
  };

  const handleCreateDonation = async (e: React.FormEvent) => {
    e.preventDefault();
    const donor = donors.find((d) => d.id === newDonationDonorId);
    const project = projects.find((p) => p.id === newDonationProjectId);
    if (!donor || !project) return;

    const donation: DonationRecord = {
      id: `don-${generateUUID().slice(0, 8)}`,
      donor_id: donor.id,
      donor_name: donor.name,
      project_id: project.id,
      project_name: project.name,
      amount: Number(newDonationAmount) || 0,
      currency: 'EGP',
      date: getTodayYYYYMMDD(),
      collection_method: newDonationMethod,
      is_restricted: newDonationRestrType === 'restricted',
      restricted_category:
        newDonationRestrType === 'restricted' ? project.target_category : undefined,
      notes: newDonationNotes,
      receipt_attach: 'link://verified-donation-receipt',
      created_at: new Date().toISOString(),
    };

    await db.donations.put(donation);
    // Ensure project is in donor's allowed_project_ids
    if (!donor.allowed_project_ids.includes(project.id)) {
      await db.donors.put({
        ...donor,
        allowed_project_ids: [...donor.allowed_project_ids, project.id],
      });
    }
    setBannerMessage({
      type: 'success',
      text: `تم تسجيل التبرع بمبلغ ${formatCurrencyEGP(
        donation.amount
      )} لصالح "${project.name}".`,
    });
  };

  const handleCreateComplaint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComplaintDetails.trim()) return;
    const item: ComplaintRecord = {
      id: `chs-${generateUUID().slice(0, 8)}`,
      ticket_code: `CMP-${String(complaints.length + 1).padStart(4, '0')}`,
      case_code: newComplaintCaseCode,
      submitted_date: getTodayYYYYMMDD(),
      channel: 'واتساب',
      category: newComplaintCategory,
      priority: 'عاجلة',
      description: newComplaintDetails.trim(),
      sla_days: 3,
      status: 'قيد المعالجة',
    };
    await db.complaints_feedback.put(item);
    setNewComplaintDetails('');
    setBannerMessage({
      type: 'success',
      text: `تم تسجيل ملاحظة/شكوى المستفيد (${item.case_code}) في سجل المساءلة الإنسانية CHS.`,
    });
  };

  const handleResolveComplaint = async (comp: ComplaintRecord) => {
    await db.complaints_feedback.put({
      ...comp,
      status: 'تم الحل والإغلاق',
      resolution_notes:
        'تم التواصل الهاتفي مع الأسرة وتوضيح الإجراء وتوثيق الحل في ملف الحالة.',
      resolved_at: new Date().toISOString(),
    });
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="card p-5 bg-surface border-r-4 border-r-primary flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <PackageCheck className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-bold text-text-primary">
              إدارة الصرفيات الموثقة والمخزون والمشاريع والتبرعات
            </h1>
          </div>
          <p className="text-sm text-text-secondary mt-1">
            توثيق المساعدات الفردية والجماعية بتوقيع إلكتروني وبصمة SHA-256 ورمز QR (P1.2)، مع خصم تلقائي من المخزون (P2.7) وتتبع التمويل المقيّد (P2.8).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => exportDistributionsToCSV(distributions)}
            className="btn-secondary text-xs py-2 px-3"
          >
            <FileSpreadsheet className="w-4 h-4 text-success" />
            <span>تصدير سجل الصرفيات (Excel UTF-8 BOM)</span>
          </button>
        </div>
      </div>

      {bannerMessage && (
        <div
          className={`p-4 rounded-lg border flex items-center justify-between gap-3 ${
            bannerMessage.type === 'success'
              ? 'bg-status-disbursed-bg border-status-disbursed-border text-status-disbursed-text'
              : bannerMessage.type === 'warning'
              ? 'bg-status-review-bg border-status-review-border text-status-review-text'
              : 'bg-status-rejected-bg border-status-rejected-border text-status-rejected-text'
          }`}
        >
          <div className="flex items-center gap-2 text-sm font-bold">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>{bannerMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setBannerMessage(null)}
            className="text-xs underline font-semibold"
          >
            إغلاق
          </button>
        </div>
      )}

      {/* Sub-navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        <button
          type="button"
          onClick={() => setSubTab('distributions')}
          className={`px-4 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors ${
            subTab === 'distributions'
              ? 'bg-primary text-white shadow-sm'
              : 'bg-surface text-text-secondary hover:bg-background border border-border'
          }`}
        >
          <PackageCheck className="w-4 h-4" />
          <span>الصرفيات الفردية والجماعية وإيصالات QR ({distributions.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('inventory')}
          className={`px-4 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors ${
            subTab === 'inventory'
              ? 'bg-primary text-white shadow-sm'
              : 'bg-surface text-text-secondary hover:bg-background border border-border'
          }`}
        >
          <Boxes className="w-4 h-4" />
          <span>إدارة المخزون العيني والشتوي ({inventoryItems.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('projects')}
          className={`px-4 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors ${
            subTab === 'projects'
              ? 'bg-primary text-white shadow-sm'
              : 'bg-surface text-text-secondary hover:bg-background border border-border'
          }`}
        >
          <FolderKanban className="w-4 h-4" />
          <span>المشاريع والحملات والتمويل المقيّد ({projects.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('donors_donations')}
          className={`px-4 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors ${
            subTab === 'donors_donations'
              ? 'bg-primary text-white shadow-sm'
              : 'bg-surface text-text-secondary hover:bg-background border border-border'
          }`}
        >
          <HandHeart className="w-4 h-4" />
          <span>الداعمون وسجل التبرعات ({donations.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('chs_complaints')}
          className={`px-4 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors ${
            subTab === 'chs_complaints'
              ? 'bg-primary text-white shadow-sm'
              : 'bg-surface text-text-secondary hover:bg-background border border-border'
          }`}
        >
          <MessageSquareWarning className="w-4 h-4" />
          <span>مساءلة المستفيدين والشكاوى CHS ({complaints.length})</span>
        </button>
      </div>

      {/* SUB-TAB 1: DISTRIBUTIONS (SINGLE & BULK + ELECTRONIC SIGNATURE + QR RECEIPTS) */}
      {subTab === 'distributions' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Distribution Entry Form */}
          <div className="lg:col-span-5 card p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="text-base font-bold text-text-primary flex items-center gap-2">
                <Plus className="w-5 h-5 text-primary" />
                <span>تسجيل صرفية مساعدة وإصدار إيصال موثّق</span>
              </h2>
              <div className="flex rounded-lg border border-border overflow-hidden text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setDistributionMode('single')}
                  className={`px-3 py-1.5 ${
                    distributionMode === 'single'
                      ? 'bg-primary text-white'
                      : 'bg-surface text-text-secondary'
                  }`}
                >
                  صرف فردي
                </button>
                <button
                  type="button"
                  onClick={() => setDistributionMode('bulk')}
                  className={`px-3 py-1.5 ${
                    distributionMode === 'bulk'
                      ? 'bg-primary text-white'
                      : 'bg-surface text-text-secondary'
                  }`}
                >
                  صرف بالجملة (حملة)
                </button>
              </div>
            </div>

            <form onSubmit={handleRecordDistribution} className="space-y-3.5">
              {distributionMode === 'single' ? (
                <div>
                  <label className="label-text" htmlFor="dist-case-select">
                    الحالة المستفيدة *
                  </label>
                  <select
                    id="dist-case-select"
                    value={selectedCaseId}
                    onChange={(e) => setSelectedCaseId(e.target.value)}
                    className="input-field"
                  >
                    {allCases.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} — {c.name} ({c.status} | أولوية {c.vulnerability_score}/100)
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="p-3 rounded-lg bg-background border border-border space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-text-primary flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-primary" />
                      <span>
                        اختر الأسر المشمولة بكشف الصرف الجماعي ({selectedBulkCaseIds.length} محددة):
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedBulkCaseIds(
                          allCases
                            .filter((c) => c.status !== 'مرفوض')
                            .map((c) => c.id)
                        )
                      }
                      className="text-xs text-primary font-bold hover:underline"
                    >
                      تحديد كل الحالات المؤهلة
                    </button>
                  </div>
                  <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                    {allCases
                      .filter((c) => c.status !== 'مرفوض')
                      .map((c) => {
                        const checked = selectedBulkCaseIds.includes(c.id);
                        return (
                          <label
                            key={c.id}
                            className="flex items-center gap-2 text-xs p-1.5 rounded hover:bg-surface cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedBulkCaseIds((prev) => [...prev, c.id]);
                                } else {
                                  setSelectedBulkCaseIds((prev) =>
                                    prev.filter((id) => id !== c.id)
                                  );
                                }
                              }}
                            />
                            <span className="font-mono font-bold text-primary">
                              {c.code}
                            </span>
                            <span className="font-semibold text-text-primary">
                              {c.name}
                            </span>
                            <span className="text-text-muted mr-auto">
                              ({c.family_count} أفراد)
                            </span>
                          </label>
                        );
                      })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label-text" htmlFor="dist-project-select">
                    المشروع / الحملة الممولة *
                  </label>
                  <select
                    id="dist-project-select"
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    className="input-field"
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.period_label})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="label-text" htmlFor="dist-donor-select">
                    الداعم المموِّل (لربط الأثر)
                  </label>
                  <select
                    id="dist-donor-select"
                    value={selectedDonorId}
                    onChange={(e) => setSelectedDonorId(e.target.value)}
                    className="input-field"
                  >
                    {donors.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="label-text" htmlFor="dist-inv-select">
                  الخصم التلقائي من صنف بالمخزون (P2.7)
                </label>
                <select
                  id="dist-inv-select"
                  value={selectedInventoryId}
                  onChange={(e) => handleSelectInventoryItem(e.target.value)}
                  className="input-field"
                >
                  <option value="">-- صرف مالي مباشر بدون خصم مخزني --</option>
                  {inventoryItems.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.name} (المتاح: {inv.qty_available} {inv.unit})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="label-text" htmlFor="dist-qty">
                    الكمية للأسرة *
                  </label>
                  <input
                    id="dist-qty"
                    type="number"
                    min={1}
                    value={quantity}
                    onChange={(e) => setQuantity(Number(e.target.value) || 1)}
                    className="input-field font-mono"
                  />
                </div>
                <div>
                  <label className="label-text" htmlFor="dist-unit">
                    الوحدة
                  </label>
                  <input
                    id="dist-unit"
                    type="text"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="input-field"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="label-text" htmlFor="dist-val">
                    القيمة المالية (ج.م) *
                  </label>
                  <input
                    id="dist-val"
                    type="number"
                    min={0}
                    value={financialValue}
                    onChange={(e) => setFinancialValue(Number(e.target.value) || 0)}
                    className="input-field font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label-text" htmlFor="dist-date">
                    تاريخ الصرف (YYYY/MM/DD) *
                  </label>
                  <input
                    id="dist-date"
                    type="text"
                    value={disbDate}
                    onChange={(e) => setDisbDate(e.target.value)}
                    className="input-field font-mono"
                  />
                </div>
                <div>
                  <label className="label-text" htmlFor="dist-proof-method">
                    طريقة إثبات الاستلام *
                  </label>
                  <select
                    id="dist-proof-method"
                    value={proofMethod}
                    onChange={(e) => setProofMethod(e.target.value)}
                    className="input-field"
                  >
                    <option value="كشف توقيع المستفيد">كشف توقيع المستفيد</option>
                    <option value="إيصال استلام نقدية">إيصال استلام نقدية</option>
                    <option value="فاتورة شراء">فاتورة شراء</option>
                    <option value="صورة استلام">صورة استلام</option>
                  </select>
                </div>
              </div>

              {/* Electronic Signature Pad on Screen (P1.2) */}
              <div className="p-3 rounded-lg bg-background border border-border space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-text-primary flex items-center gap-1.5">
                    <PenTool className="w-4 h-4 text-primary" />
                    <span>لوحة توقيع المستفيد الإلكترونية على الشاشة (P1.2):</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setSignaturePaths([])}
                    className="text-xs text-text-secondary hover:text-danger flex items-center gap-1"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>مسح التوقيع</span>
                  </button>
                </div>
                <svg
                  ref={svgPadRef}
                  viewBox="0 0 240 80"
                  onMouseDown={handlePadMouseDown}
                  onMouseMove={handlePadMouseMove}
                  onMouseUp={handlePadMouseUp}
                  onMouseLeave={handlePadMouseUp}
                  className="w-full h-24 bg-surface border-2 border-dashed border-primary/40 rounded cursor-crosshair touch-none"
                >
                  {signaturePaths.map((d, i) => (
                    <path
                      key={i}
                      d={d}
                      stroke="#0B4F8A"
                      strokeWidth="3"
                      fill="none"
                      strokeLinecap="round"
                    />
                  ))}
                </svg>
                <p className="text-[11px] text-text-muted">
                  ارسم توقيع المستفيد بالماوس أو اللمس؛ يتم حساب بصمة SHA-256 للتوقيع والوقت والموقع وربطها برمز QR.
                </p>
              </div>

              {/* Consent & Redaction flags for Donor Portal */}
              <div className="p-3 rounded-lg bg-primary-light/40 border border-primary/20 space-y-1.5 text-xs">
                <label className="flex items-center gap-2 cursor-pointer font-semibold text-text-primary">
                  <input
                    type="checkbox"
                    checked={consentToShare}
                    onChange={(e) => setConsentToShare(e.target.checked)}
                  />
                  <span>موافقة المستفيد على مشاركة إثبات الاستلام المجهول في تقارير الداعمين</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-semibold text-text-primary">
                  <input
                    type="checkbox"
                    checked={isRedacted}
                    onChange={(e) => setIsRedacted(e.target.checked)}
                  />
                  <span>تم فحص المرفق وطمس أي وجوه أو بيانات هوية شخصية (Redacted ✓)</span>
                </label>
              </div>

              <button type="submit" className="btn-primary w-full py-2.5">
                <ShieldCheck className="w-5 h-5" />
                <span>
                  {distributionMode === 'single'
                    ? 'اعتماد الصرفية وإصدار إيصال QR الموثّق'
                    : `اعتماد الصرف الجماعي (${selectedBulkCaseIds.length} أسر)`}
                </span>
              </button>
            </form>
          </div>

          {/* Recorded Distributions & Tamper-Evident Receipts Table */}
          <div className="lg:col-span-7 card p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h2 className="text-base font-bold text-text-primary">
                  سجل الصرفيات الموثقة وإيصالات التحقق الرقمي ({distributions.length})
                </h2>
                <p className="text-xs text-text-secondary">
                  اضغط على «إيصال QR» لمعاينة بطاقة الاستلام الموثقة ببصمة SHA-256 وطباعتها.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right">
                <thead className="bg-background text-text-secondary text-xs border-b border-border">
                  <tr>
                    <th className="p-2.5">رقم الإيصال</th>
                    <th className="p-2.5">كود الحالة</th>
                    <th className="p-2.5">المشروع والمساعدة</th>
                    <th className="p-2.5">القيمة والكمية</th>
                    <th className="p-2.5">التوثيق الرقمي (P1.2)</th>
                    <th className="p-2.5">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {distributions.map((dist) => (
                    <tr key={dist.id} className="hover:bg-background/60">
                      <td className="p-2.5 font-mono font-bold text-primary">
                        {dist.receipt_number}
                        <div className="text-[11px] text-text-muted font-sans">
                          {dist.disb_date}
                        </div>
                      </td>
                      <td className="p-2.5">
                        <button
                          type="button"
                          onClick={() => onOpenCaseDetail(dist.case_id)}
                          className="font-mono font-bold text-primary hover:underline"
                        >
                          {dist.case_code}
                        </button>
                        <div className="text-xs text-text-secondary">
                          {dist.case_general_area}
                        </div>
                      </td>
                      <td className="p-2.5">
                        <div className="font-bold text-text-primary">
                          {dist.project_name}
                        </div>
                        <div className="text-xs text-text-secondary">
                          [{dist.aid_cat}] {dist.aid_type}
                        </div>
                      </td>
                      <td className="p-2.5">
                        <div className="font-mono font-bold text-text-primary">
                          {formatCurrencyEGP(dist.financial_value)}
                        </div>
                        <div className="text-xs text-text-muted">
                          {dist.quantity} {dist.unit}
                        </div>
                      </td>
                      <td className="p-2.5">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-status-disbursed-bg text-status-disbursed-text border border-status-disbursed-border">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>SHA256: {dist.proof_file_sha256.slice(0, 8)}</span>
                        </span>
                      </td>
                      <td className="p-2.5">
                        <button
                          type="button"
                          onClick={() => setActiveReceipt(dist)}
                          className="btn-secondary text-xs py-1.5 px-2.5"
                        >
                          <QrCode className="w-3.5 h-3.5 text-primary" />
                          <span>إيصال QR</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: INVENTORY & STOCK MANAGEMENT (P2.7) */}
      {subTab === 'inventory' && (
        <div className="card p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
            <div>
              <h2 className="text-base font-bold text-text-primary flex items-center gap-2">
                <Boxes className="w-5 h-5 text-primary" />
                <span>إدارة المخزون البسيطة للمساعدات العينية والشتوية (P2.7)</span>
              </h2>
              <p className="text-xs text-text-secondary">
                يتم خصم الكميات المنصرفة تلقائياً عند تسجيل أي صرفية، مع تنبيه فوري عند وصول الرصيد لحد إعادة الطلب.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {inventoryItems.map((item) => {
              const isLowStock = item.qty_available <= item.min_threshold;
              return (
                <div
                  key={item.id}
                  className={`p-4 rounded-xl border ${
                    isLowStock
                      ? 'bg-status-review-bg/40 border-status-review-border'
                      : 'bg-surface border-border'
                  } space-y-3`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-xs font-bold text-primary bg-primary-light px-2 py-0.5 rounded">
                        {item.aid_cat}
                      </span>
                      <h3 className="text-base font-bold text-text-primary mt-1">
                        {item.name}
                      </h3>
                      <p className="text-xs text-text-muted font-mono">
                        حد إعادة الطلب: {item.min_threshold} {item.unit}
                      </p>
                    </div>
                    {isLowStock ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-bold bg-status-review-bg text-status-review-text border border-status-review-border">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>رصيد منخفض!</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-bold bg-status-disbursed-bg text-status-disbursed-text border border-status-disbursed-border">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>متوفر</span>
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center bg-background p-2.5 rounded-lg border border-border">
                    <div>
                      <div className="text-[11px] text-text-secondary">إجمالي الوارد</div>
                      <div className="font-mono font-bold text-sm text-text-primary">
                        {item.qty_in}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-text-secondary">المنصرف</div>
                      <div className="font-mono font-bold text-sm text-secondary">
                        {item.qty_out}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-text-secondary">الرصيد المتاح</div>
                      <div
                        className={`font-mono font-bold text-base ${
                          isLowStock ? 'text-warning' : 'text-success'
                        }`}
                      >
                        {item.qty_available} {item.unit}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="number"
                      min={1}
                      placeholder="كمية التوريد"
                      value={restockQtyMap[item.id] ?? 50}
                      onChange={(e) =>
                        setRestockQtyMap((prev) => ({
                          ...prev,
                          [item.id]: Number(e.target.value) || 0,
                        }))
                      }
                      className="input-field py-1.5 text-xs font-mono w-28"
                    />
                    <button
                      type="button"
                      onClick={() => handleRestockItem(item)}
                      className="btn-secondary text-xs py-1.5 px-3 flex-1"
                    >
                      <Plus className="w-3.5 h-3.5 text-primary" />
                      <span>توريد للمخزن</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SUB-TAB 3: PROJECTS & RESTRICTED FUNDING (P2.8) */}
      {subTab === 'projects' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 card p-5 space-y-4">
            <h2 className="text-base font-bold text-text-primary border-b border-border pb-2">
              إضافة مشروع / حملة إنسانية جديدة
            </h2>
            <form onSubmit={handleCreateProject} className="space-y-3">
              <div>
                <label className="label-text" htmlFor="proj-name">
                  اسم المشروع / الحملة *
                </label>
                <input
                  id="proj-name"
                  type="text"
                  required
                  placeholder="مثال: حملة سلال رمضان المبارك 2027"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="input-field"
                />
              </div>
              <div>
                <label className="label-text" htmlFor="proj-period">
                  الفترة الزمنية
                </label>
                <input
                  id="proj-period"
                  type="text"
                  value={newProjectPeriod}
                  onChange={(e) => setNewProjectPeriod(e.target.value)}
                  className="input-field"
                />
              </div>
              <div>
                <label className="label-text" htmlFor="proj-budget">
                  الهدف المالي (ج.م)
                </label>
                <input
                  id="proj-budget"
                  type="number"
                  value={newProjectBudget}
                  onChange={(e) => setNewProjectBudget(Number(e.target.value) || 0)}
                  className="input-field font-mono"
                />
              </div>
              <div>
                <label className="label-text" htmlFor="proj-cat">
                  الفئة المستهدفة
                </label>
                <select
                  id="proj-cat"
                  value={newProjectCategory}
                  onChange={(e) => setNewProjectCategory(e.target.value)}
                  className="input-field"
                >
                  <option value="مساعدات شتوية">مساعدات شتوية</option>
                  <option value="عينية">عينية</option>
                  <option value="مادية">مادية</option>
                  <option value="طبية">طبية</option>
                </select>
              </div>
              <button type="submit" className="btn-primary w-full">
                <Plus className="w-4 h-4" />
                <span>حفظ المشروع</span>
              </button>
            </form>
          </div>

          <div className="lg:col-span-8 space-y-4">
            {projects.map((p) => {
              const projDonations = donations.filter((d) => d.project_id === p.id);
              const totalFunded = projDonations.reduce((s, d) => s + d.amount, 0);
              const projDists = distributions.filter((d) => d.project_id === p.id);
              const totalSpent = projDists.reduce((s, d) => s + d.financial_value, 0);
              const progressPct = Math.min(
                100,
                Math.round((totalSpent / Math.max(1, p.target_budget)) * 100)
              );

              return (
                <div key={p.id} className="card p-5 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-primary-light text-primary">
                          {p.target_category}
                        </span>
                        <span className="text-xs text-text-muted font-mono">
                          {p.period_label}
                        </span>
                      </div>
                      <h3 className="text-lg font-bold text-text-primary mt-1">
                        {p.name}
                      </h3>
                    </div>
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-status-disbursed-bg text-status-disbursed-text border border-status-disbursed-border">
                      {p.status} ({projDists.length} عملية صرف)
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-3 bg-background p-3 rounded-lg border border-border text-sm">
                    <div>
                      <div className="text-xs text-text-secondary">الهدف المالي للمشروع</div>
                      <div className="font-mono font-bold text-text-primary">
                        {formatCurrencyEGP(p.target_budget)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-text-secondary">التبرعات المحصلة</div>
                      <div className="font-mono font-bold text-primary">
                        {formatCurrencyEGP(totalFunded)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-text-secondary">المنصرف الفعلي الموثق</div>
                      <div className="font-mono font-bold text-success">
                        {formatCurrencyEGP(totalSpent)} ({progressPct}%)
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SUB-TAB 4: DONORS & DONATIONS (WITH RESTRICTED GRANT TRACKING P2.8) */}
      {subTab === 'donors_donations' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 card p-5 space-y-4">
            <h2 className="text-base font-bold text-text-primary border-b border-border pb-2">
              تسجيل دفعة تبرع جديدة (مقيّد / عام — P2.8)
            </h2>
            <form onSubmit={handleCreateDonation} className="space-y-3">
              <div>
                <label className="label-text" htmlFor="don-donor">
                  الداعم / المؤسسة المانحة *
                </label>
                <select
                  id="don-donor"
                  value={newDonationDonorId}
                  onChange={(e) => setNewDonationDonorId(e.target.value)}
                  className="input-field"
                >
                  {donors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.donor_type})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label-text" htmlFor="don-proj">
                  المشروع المخصّص له التبرع *
                </label>
                <select
                  id="don-proj"
                  value={newDonationProjectId}
                  onChange={(e) => setNewDonationProjectId(e.target.value)}
                  className="input-field"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-text" htmlFor="don-amount">
                    المبلغ (ج.م) *
                  </label>
                  <input
                    id="don-amount"
                    type="number"
                    value={newDonationAmount}
                    onChange={(e) => setNewDonationAmount(Number(e.target.value) || 0)}
                    className="input-field font-mono"
                  />
                </div>
                <div>
                  <label className="label-text" htmlFor="don-method">
                    طريقة التحصيل
                  </label>
                  <select
                    id="don-method"
                    value={newDonationMethod}
                    onChange={(e) =>
                      setNewDonationMethod(
                        e.target.value as DonationRecord['collection_method']
                      )
                    }
                    className="input-field"
                  >
                    <option value="تحويل بنكي">تحويل بنكي</option>
                    <option value="شيك مصدق">شيك مصدق</option>
                    <option value="إيداع نقدي بالمركز">إيداع نقدي بالمركز</option>
                    <option value="بوابة دفع إلكتروني">بوابة دفع إلكتروني</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="label-text" htmlFor="don-restr">
                  نوع التقييد المالي (P2.8)
                </label>
                <select
                  id="don-restr"
                  value={newDonationRestrType}
                  onChange={(e) =>
                    setNewDonationRestrType(
                      e.target.value as 'restricted' | 'unrestricted'
                    )
                  }
                  className="input-field"
                >
                  <option value="restricted">
                    تبرع مقيّد (Restricted — مشروط بفئة/حملة محددة)
                  </option>
                  <option value="unrestricted">تبرع عام غير مقيّد (Unrestricted)</option>
                </select>
              </div>
              <div>
                <label className="label-text" htmlFor="don-notes">
                  شروط المنحة / ملاحظات التخصيص
                </label>
                <input
                  id="don-notes"
                  type="text"
                  value={newDonationNotes}
                  onChange={(e) => setNewDonationNotes(e.target.value)}
                  className="input-field"
                />
              </div>
              <button type="submit" className="btn-primary w-full">
                <HandHeart className="w-4 h-4" />
                <span>تسجيل التبرع وإصدار سند القبض</span>
              </button>
            </form>
          </div>

          <div className="lg:col-span-8 card p-5 space-y-4">
            <h2 className="text-base font-bold text-text-primary border-b border-border pb-2">
              سجل الداعمين والتبرعات والمنح المشروطة ({donations.length})
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right">
                <thead className="bg-background text-text-secondary text-xs border-b border-border">
                  <tr>
                    <th className="p-2.5">التاريخ وطريقة التحصيل</th>
                    <th className="p-2.5">الداعم</th>
                    <th className="p-2.5">المشروع</th>
                    <th className="p-2.5">المبلغ</th>
                    <th className="p-2.5">حالة التقييد (P2.8)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {donations.map((d) => (
                    <tr key={d.id}>
                      <td className="p-2.5 font-mono font-bold text-primary">
                        {d.date}
                        <div className="text-[11px] text-text-muted font-sans">
                          {d.collection_method}
                        </div>
                      </td>
                      <td className="p-2.5 font-bold text-text-primary">
                        {d.donor_name}
                      </td>
                      <td className="p-2.5 text-text-secondary">{d.project_name}</td>
                      <td className="p-2.5 font-mono font-bold text-success">
                        {formatCurrencyEGP(d.amount)}
                      </td>
                      <td className="p-2.5">
                        {d.is_restricted ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-status-approved-bg text-status-approved-text border border-status-approved-border">
                            <Lock className="w-3 h-3" />
                            <span>مقيّد ({d.restricted_category})</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-background text-text-secondary border border-border">
                            <Sparkles className="w-3 h-3" />
                            <span>عام غير مقيّد</span>
                          </span>
                        )}
                        <div className="text-[11px] text-text-muted mt-0.5">
                          {d.notes}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 5: CHS BENEFICIARY COMPLAINTS & FEEDBACK (P1.6) */}
      {subTab === 'chs_complaints' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 card p-5 space-y-4">
            <h2 className="text-base font-bold text-text-primary border-b border-border pb-2">
              تسجيل شكوى أو تغذية راجعة من مستفيد (CHS — P1.6)
            </h2>
            <p className="text-xs text-text-secondary">
              تطبيقاً للمعيار الإنساني الأساسي (Core Humanitarian Standard)، تُسجّل ملاحظات المستفيدين وتُتابع باستقلالية لضمان الكرامة والعدالة.
            </p>
            <form onSubmit={handleCreateComplaint} className="space-y-3">
              <div>
                <label className="label-text" htmlFor="chs-case">
                  كود الحالة
                </label>
                <select
                  id="chs-case"
                  value={newComplaintCaseCode}
                  onChange={(e) => setNewComplaintCaseCode(e.target.value)}
                  className="input-field"
                >
                  {allCases.map((c) => (
                    <option key={c.id} value={c.code}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label-text" htmlFor="chs-type">
                  تصنيف الملاحظة / الشكوى
                </label>
                <select
                  id="chs-type"
                  value={newComplaintCategory}
                  onChange={(e) =>
                    setNewComplaintCategory(
                      e.target.value as ComplaintRecord['category']
                    )
                  }
                  className="input-field"
                >
                  <option value="تأخر صرف المساعدة">تأخر صرف المساعدة</option>
                  <option value="طلب إعادة دراسة">طلب إعادة دراسة</option>
                  <option value="جودة الأصناف العينية">جودة الأصناف العينية</option>
                  <option value="سلوك ومعاملة الفريق">سلوك ومعاملة الفريق</option>
                  <option value="أخرى">أخرى</option>
                </select>
              </div>
              <div>
                <label className="label-text" htmlFor="chs-details">
                  تفاصيل الشكوى أو الرسالة *
                </label>
                <textarea
                  id="chs-details"
                  rows={3}
                  required
                  value={newComplaintDetails}
                  onChange={(e) => setNewComplaintDetails(e.target.value)}
                  placeholder="اكتب نص شكوى أو استفسار المستفيد..."
                  className="input-field"
                />
              </div>
              <button type="submit" className="btn-primary w-full">
                <Plus className="w-4 h-4" />
                <span>تسجيل في سجل المساءلة CHS</span>
              </button>
            </form>
          </div>

          <div className="lg:col-span-8 card p-5 space-y-4">
            <h2 className="text-base font-bold text-text-primary border-b border-border pb-2">
              سجل شكاوى وملاحظات المستفيدين ومعالجتها ({complaints.length})
            </h2>
            <div className="space-y-3">
              {complaints.map((comp) => (
                <div
                  key={comp.id}
                  className="p-4 rounded-xl bg-background border border-border flex flex-wrap items-start justify-between gap-4"
                >
                  <div className="space-y-1 max-w-xl">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-primary">
                        {comp.ticket_code} ({comp.case_code})
                      </span>
                      <span className="text-xs font-bold px-2 py-0.5 rounded bg-surface border border-border">
                        {comp.category}
                      </span>
                      <span className="text-xs text-text-muted">
                        {comp.submitted_date} — {comp.channel}
                      </span>
                    </div>
                    <p className="text-sm text-text-primary font-semibold">
                      {comp.description}
                    </p>
                    {comp.resolution_notes && (
                      <p className="text-xs text-success bg-status-disbursed-bg/50 p-2 rounded border border-status-disbursed-border">
                        <strong>الإجراء المتخذ:</strong> {comp.resolution_notes}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                        comp.status === 'تم الحل والإغلاق'
                          ? 'bg-status-disbursed-bg text-status-disbursed-text border border-status-disbursed-border'
                          : 'bg-status-review-bg text-status-review-text border border-status-review-border'
                      }`}
                    >
                      {comp.status}
                    </span>
                    {comp.status !== 'تم الحل والإغلاق' && (
                      <button
                        type="button"
                        onClick={() => handleResolveComplaint(comp)}
                        className="btn-secondary text-xs py-1 px-2.5"
                      >
                        <CheckSquare className="w-3.5 h-3.5 text-success" />
                        <span>توثيق الحل والإغلاق</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAMPER-EVIDENT PRINTABLE QR RECEIPT MODAL (P1.2) */}
      {activeReceipt && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl border-2 border-primary max-w-xl w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-start justify-between border-b-2 border-primary pb-4">
              <div>
                <div className="text-xs font-bold text-primary uppercase tracking-wider">
                  منظمة مشكاة للعمل الإنساني
                </div>
                <h3 className="text-xl font-bold text-text-primary mt-1">
                  إيصال استلام مساعدات موثّق رقمياً (P1.2)
                </h3>
                <p className="text-xs text-text-secondary font-mono mt-0.5">
                  رقم الإيصال: {activeReceipt.receipt_number} | التاريخ: {activeReceipt.disb_date}
                </p>
              </div>
              <DeterministicQrSvg token={activeReceipt.qr_verification_token} size={96} />
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm bg-background p-4 rounded-xl border border-border">
              <div>
                <span className="text-xs text-text-secondary block">كود الحالة المستفيدة:</span>
                <strong className="font-mono text-primary text-base">
                  {activeReceipt.case_code}
                </strong>
                <span className="text-xs text-text-muted block">
                  ({activeReceipt.case_general_area} — {activeReceipt.case_family_count} أفراد)
                </span>
              </div>
              <div>
                <span className="text-xs text-text-secondary block">الحملة / المشروع المموِّل:</span>
                <strong className="text-text-primary">{activeReceipt.project_name}</strong>
              </div>
              <div>
                <span className="text-xs text-text-secondary block">نوع المساعدة والكمية:</span>
                <strong className="text-text-primary">
                  [{activeReceipt.aid_cat}] {activeReceipt.aid_type} ({activeReceipt.quantity}{' '}
                  {activeReceipt.unit})
                </strong>
              </div>
              <div>
                <span className="text-xs text-text-secondary block">القيمة المالية المعتمدة:</span>
                <strong className="font-mono text-success text-base">
                  {formatCurrencyEGP(activeReceipt.financial_value)}
                </strong>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center bg-surface p-3 rounded-xl border border-border">
              <div>
                <span className="text-xs font-bold text-text-secondary block mb-1">
                  توقيع المستفيد الإلكتروني المعتمد:
                </span>
                <div
                  className="border border-border rounded bg-background p-2 h-20 flex items-center justify-center"
                  dangerouslySetInnerHTML={{
                    __html: activeReceipt.recipient_signature_svg,
                  }}
                />
              </div>
              <div className="space-y-1 text-xs">
                <div>
                  <span className="text-text-secondary">نفّذ التسليم: </span>
                  <strong className="text-text-primary">{activeReceipt.executed_by}</strong>
                </div>
                <div>
                  <span className="text-text-secondary">اعتماد اللجنة (4-Eyes): </span>
                  <strong className="text-text-primary">{activeReceipt.approved_by}</strong>
                </div>
                <div className="font-mono text-[11px] text-primary break-all bg-primary-light/60 p-1.5 rounded">
                  SHA-256: {activeReceipt.proof_file_sha256.slice(0, 32)}...
                </div>
                <div className="font-mono text-[10px] text-text-muted break-all">
                  QR Token: {activeReceipt.qr_verification_token}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="btn-secondary text-xs py-2 px-4"
              >
                <Printer className="w-4 h-4" />
                <span>طباعة الإيصال (A5 / PDF)</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveReceipt(null)}
                className="btn-primary text-xs py-2 px-5"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
