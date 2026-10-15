import React, { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  LayoutDashboard,
  Users,
  CalendarCheck,
  Settings,
  Palette,
  PlusCircle,
  Moon,
  Sun,
  Wifi,
  WifiOff,
  Hash,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  GitMerge,
  Lock,
  PackageCheck,
  HeartHandshake,
  Smartphone,
  X,
} from 'lucide-react';
import { MobileBottomNav } from './components/MobileBottomNav';
import { MobileInstallModal } from './components/MobileInstallModal';
import {
  db,
  ensureInitialDatabaseSeed,
  saveBeneficiaryCase,
  softDeleteCase,
  addCaseFollowup,
  generateBulkBenchmarkCases,
  clearBenchmarkCases,
  logAuditAction,
  synchronizeWithCloud,
} from './db/database';
import {
  DEFAULT_APP_SETTINGS,
  DEFAULT_DROPDOWN_LISTS,
  DEFAULT_TRUSTED_DEVICES,
  DEFAULT_USERS,
} from './constants/defaultLists';
import {
  AppSettings,
  BeneficiaryCase,
  FollowupRecord,
  FollowupType,
  UserAccount,
} from './types/models';
import { downloadCasesCsv } from './utils/csvExport';
import { formatNumerals } from './utils/formatters';
import { DashboardView } from './components/DashboardView';
import { CasesListView } from './components/CasesListView';
import { CaseFormModal } from './components/CaseFormModal';
import { CaseDetailModal } from './components/CaseDetailModal';
import { FieldVisitsView } from './components/FieldVisitsView';
import { DistributionsAndProjectsView } from './components/DistributionsAndProjectsView';
import { DonorPortalView } from './components/DonorPortalView';
import { SyncAndConflictsView } from './components/SyncAndConflictsView';
import { SettingsView } from './components/SettingsView';
import { StyleGuideView } from './components/StyleGuideView';
import { AuthLockModal } from './components/AuthLockModal';

type ActiveTab =
  | 'dashboard'
  | 'cases'
  | 'followups'
  | 'distributions_projects'
  | 'donor_portal'
  | 'sync_conflicts'
  | 'settings'
  | 'style_guide';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [editingCase, setEditingCase] = useState<BeneficiaryCase | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [caseToDelete, setCaseToDelete] = useState<BeneficiaryCase | null>(null);
  const [isSessionLocked, setIsSessionLocked] = useState(false);
  const [isSyncingHeader, setIsSyncingHeader] = useState(false);
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobileSimulator, setIsMobileSimulator] = useState(false);

  const [presetFilters, setPresetFilters] = useState<{
    status?: string;
    alertFilter?: string;
    aidCat?: string;
  }>({});

  useEffect(() => {
    ensureInitialDatabaseSeed();
  }, []);

  const settings =
    useLiveQuery(() => db.app_settings.get('default'), [], DEFAULT_APP_SETTINGS) ||
    DEFAULT_APP_SETTINGS;

  const activeCases =
    useLiveQuery(
      () => db.beneficiary_cases.filter((c) => !c.deleted_at).toArray(),
      [],
      []
    ) || [];

  const activeFollowups =
    useLiveQuery(
      () =>
        db.followups
          .filter((f) => !f.deleted_at)
          .reverse()
          .sortBy('date'),
      [],
      []
    ) || [];

  const dropdownLists =
    useLiveQuery(() => db.dropdown_lists.toArray(), [], DEFAULT_DROPDOWN_LISTS) ||
    DEFAULT_DROPDOWN_LISTS;

  const users =
    useLiveQuery(() => db.users.toArray(), [], DEFAULT_USERS) || DEFAULT_USERS;

  const devices =
    useLiveQuery(() => db.trusted_devices.toArray(), [], DEFAULT_TRUSTED_DEVICES) ||
    DEFAULT_TRUSTED_DEVICES;

  const syncConflicts =
    useLiveQuery(
      () => db.sync_conflicts.orderBy('detected_at').reverse().toArray(),
      [],
      []
    ) || [];

  const auditLogs =
    useLiveQuery(
      () => db.audit_log.orderBy('timestamp').reverse().limit(100).toArray(),
      [],
      []
    ) || [];

  const pendingOutbox =
    useLiveQuery(
      () => db.sync_outbox.where('status').equals('pending').reverse().toArray(),
      [],
      []
    ) || [];

  const currentUserRecord = useMemo(
    () =>
      users.find((u) => u.id === settings.current_user_id) ||
      users[0] ||
      DEFAULT_USERS[0],
    [users, settings.current_user_id]
  );

  const currentDeviceRecord = useMemo(
    () => devices.find((d) => d.device_code === settings.device_code),
    [devices, settings.device_code]
  );

  // Immediately lock session if active device is revoked (Scenario 9)
  useEffect(() => {
    if (currentDeviceRecord?.status === 'revoked') {
      setIsSessionLocked(true);
    }
  }, [currentDeviceRecord?.status]);

  // Auto-lock session after inactivity timeout (Section 6)
  useEffect(() => {
    const timeoutMs = (settings.session_timeout_minutes || 15) * 60 * 1000;
    let timer: ReturnType<typeof setTimeout>;
    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        setIsSessionLocked(true);
      }, timeoutMs);
    };
    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('keydown', resetTimer);
    resetTimer();
    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('keydown', resetTimer);
    };
  }, [settings.session_timeout_minutes]);

  // Apply Dark Mode class to <html>
  useEffect(() => {
    const root = document.documentElement;
    if (settings.dark_mode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [settings.dark_mode]);

  const followupsByCaseId = useMemo(() => {
    const map = new Map<string, FollowupRecord[]>();
    for (const f of activeFollowups) {
      const list = map.get(f.case_id) || [];
      list.push(f);
      map.set(f.case_id, list);
    }
    return map;
  }, [activeFollowups]);

  const selectedCase = useMemo(
    () => activeCases.find((c) => c.id === selectedCaseId) || null,
    [activeCases, selectedCaseId]
  );

  const handleUpdateSettings = async (partial: Partial<AppSettings>) => {
    await db.app_settings.put({
      ...settings,
      ...partial,
      id: 'default',
    });
  };

  const handleUnlockAndSwitchUser = async (user: UserAccount, deviceCode: string) => {
    await handleUpdateSettings({
      current_user_id: user.id,
      current_user_name: user.name,
      current_user_role_code: user.role,
      current_user_role: user.role_label_ar as AppSettings['current_user_role'],
      device_code: deviceCode,
    });
    setIsSessionLocked(false);
  };

  // Automatically activate restricted Donor Portal mode if accessed via ?view=donor or ?role=donor or ?token=
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const view = params.get('view');
      const roleParam = params.get('role');
      const donor = params.get('donor');
      const token = params.get('token');

      if (view === 'donor' || roleParam === 'donor' || donor || token) {
        const donorUser =
          users.find((u) => u.role === 'donor') ||
          DEFAULT_USERS.find((u) => u.role === 'donor');
        if (donorUser && settings.current_user_role_code !== 'donor') {
          handleUnlockAndSwitchUser(donorUser, settings.device_code || 'D1');
        }
        setActiveTab('donor_portal');
      }
    } catch {
      // Ignore
    }
  }, [users, settings.current_user_role_code]);

  const handleHeaderQuickSync = async () => {
    setIsSyncingHeader(true);
    try {
      await synchronizeWithCloud();
    } finally {
      setIsSyncingHeader(false);
    }
  };

  const isReadOnlyRole =
    currentUserRecord.role === 'internal_auditor' ||
    currentUserRecord.role === 'donor';
  const canDeleteOrExport =
    currentUserRecord.role === 'admin' ||
    currentUserRecord.role === 'case_worker';

  const handleExportCsv = async (subset?: BeneficiaryCase[]) => {
    if (!canDeleteOrExport) return;
    const target = subset || activeCases;
    downloadCasesCsv(target);
    await logAuditAction({
      action: 'EXPORT',
      entity_type: 'system',
      entity_id: 'csv_export',
      summary_ar: `تصدير ${target.length} حالة إلى ملف Excel/CSV بترميز UTF-8 مع BOM`,
    });
  };

  const handleSaveCase = async (
    formData: Partial<BeneficiaryCase> & { name: string },
    existingId?: string
  ) => {
    const saved = await saveBeneficiaryCase(formData, existingId);
    setSelectedCaseId(saved.id);
  };

  const handleAddFollowup = async (input: {
    case_id: string;
    date: string;
    ftype: FollowupType;
    details: string;
  }) => {
    await addCaseFollowup(input);
  };

  const fmt = (val: string | number) => formatNumerals(val, settings.numeral_system);
  const pendingConflictsCount = syncConflicts.filter(
    (c) => c.status === 'pending_review'
  ).length;

  return (
    <div className="min-h-screen flex flex-col bg-background text-text">
      {/* Persistent Top Header */}
      <header className="no-print sticky top-0 z-30 bg-primary text-white shadow-sm border-b border-primary-dark">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          {/* Brand Identity & Current Active User / Device */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-card bg-white/15 flex items-center justify-center border border-white/25">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold leading-tight">
                {settings.org_name}
              </h1>
              <p className="text-xs text-white/80 flex flex-wrap items-center gap-1.5">
                <span>
                  المستخدم: <strong>{settings.current_user_name}</strong> ({settings.current_user_role})
                </span>
                <span>•</span>
                <span className="font-mono bg-white/15 px-1.5 py-0.2 rounded">
                  الجهاز: {settings.device_code}
                </span>
              </p>
            </div>
          </div>

          {/* Sync Status Indicator + Sync Now + Session Lock + Utility Toggles */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Sync Status Pill & Quick Sync Now Button (Rule 5.2.8) */}
            <div className="inline-flex items-center rounded-full bg-white/15 border border-white/20 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('sync_conflicts')}
                className="px-2.5 py-1 flex items-center gap-1.5 font-medium"
                title="فتح صفحة تفاصيل المزامنة والتعارضات"
              >
                {settings.simulated_network_online ? (
                  <Wifi className="w-3.5 h-3.5 text-emerald-300" />
                ) : (
                  <WifiOff className="w-3.5 h-3.5 text-warning" />
                )}
                <span>
                  {!settings.simulated_network_online
                    ? 'يعمل دون اتصال'
                    : pendingOutbox.length === 0
                    ? 'متصل ومتزامن ✓'
                    : `${fmt(pendingOutbox.length)} بانتظار المزامنة`}
                </span>
              </button>
              <button
                type="button"
                onClick={handleHeaderQuickSync}
                disabled={isSyncingHeader || !settings.simulated_network_online}
                className="px-2.5 py-1 rounded-full bg-white text-primary font-bold hover:bg-white/90 disabled:opacity-50 flex items-center gap-1 transition"
                title="زامن الآن مع السحابة"
              >
                <RefreshCw
                  className={`w-3 h-3 ${isSyncingHeader ? 'animate-spin' : ''}`}
                />
                <span>زامن الآن</span>
              </button>
            </div>

            {/* Lock Session / Switch User Button (Section 6) */}
            <button
              type="button"
              onClick={() => setIsSessionLocked(true)}
              className="px-2.5 py-2 rounded-btn bg-white/10 hover:bg-white/20 text-xs font-bold flex items-center gap-1 transition"
              title="قفل الجلسة أو تبديل المستخدم / الجهاز"
            >
              <Lock className="w-3.5 h-3.5 text-warning" />
              <span className="hidden md:inline">قفل / تبديل الحساب</span>
            </button>

            {/* Install Mobile App Button (iOS & Android) */}
            <button
              type="button"
              onClick={() => setIsInstallModalOpen(true)}
              className="px-2.5 py-2 rounded-btn bg-white/15 hover:bg-white/25 text-xs font-bold flex items-center gap-1.5 transition text-emerald-200 hover:text-white"
              title="تثبيت تطبيق مشكاة على الهاتف (آيفون وأندرويد)"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">تطبيق الجوال 📱</span>
            </button>

            {/* Mobile Simulator Mode Toggle */}
            <button
              type="button"
              onClick={() => setIsMobileSimulator(!isMobileSimulator)}
              className={`px-2.5 py-2 rounded-btn text-xs font-bold flex items-center gap-1 transition ${
                isMobileSimulator
                  ? 'bg-amber-400 text-slate-900 shadow-md'
                  : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
              title="محاكاة مظهر التطبيق على شاشة الجوال (آيفون/أندرويد)"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">{isMobileSimulator ? 'عرض الكمبيوتر' : 'معاينة الجوال'}</span>
            </button>

            {/* Numeral Toggle (0-9 vs ٠-٩ per Section 15.2) */}
            <button
              type="button"
              onClick={() =>
                handleUpdateSettings({
                  numeral_system:
                    settings.numeral_system === 'latin' ? 'arabic_indic' : 'latin',
                })
              }
              className="px-2.5 py-2 rounded-btn bg-white/10 hover:bg-white/20 text-xs font-bold flex items-center gap-1 transition"
              title="تبديل عرض الأرقام (0-9 / ٠-٩)"
            >
              <Hash className="w-3.5 h-3.5" />
              <span>{settings.numeral_system === 'latin' ? '0-9' : '٠-٩'}</span>
            </button>

            {/* Dark Mode Toggle */}
            <button
              type="button"
              onClick={() => handleUpdateSettings({ dark_mode: !settings.dark_mode })}
              className="p-2 rounded-btn bg-white/10 hover:bg-white/20 transition"
              title={settings.dark_mode ? 'التبديل للوضع الفاتح' : 'التبديل للوضع الداكن'}
              aria-label="تبديل الوضع الداكن"
            >
              {settings.dark_mode ? (
                <Sun className="w-4 h-4 text-warning" />
              ) : (
                <Moon className="w-4 h-4 text-white" />
              )}
            </button>

            {/* Quick Add Case Button */}
            {!isReadOnlyRole && (
              <button
                type="button"
                onClick={() => {
                  setEditingCase(null);
                  setIsFormOpen(true);
                }}
                className="ds-btn bg-success hover:brightness-95 text-white text-xs py-2 px-3.5 font-bold"
              >
                <PlusCircle className="w-4 h-4" />
                <span>حالة جديدة</span>
              </button>
            )}
          </div>
        </div>

        {/* Navigation Tabs Bar */}
        {currentUserRecord.role !== 'donor' && (
          <nav
            aria-label="التنقل الرئيسي"
            className="bg-primary-dark/60 border-t border-white/10"
          >
            <div className="max-w-7xl mx-auto px-4 flex items-center gap-1 overflow-x-auto">
              {[
                {
                  id: 'dashboard' as ActiveTab,
                  label: 'لوحة المؤشرات والتنبيهات',
                  icon: LayoutDashboard,
                },
                {
                  id: 'cases' as ActiveTab,
                  label: `قائمة الحالات (${fmt(activeCases.length)})`,
                  icon: Users,
                },
                {
                  id: 'followups' as ActiveTab,
                  label: `المتابعات والزيارات (${fmt(activeFollowups.length)})`,
                  icon: CalendarCheck,
                },
                {
                  id: 'distributions_projects' as ActiveTab,
                  label: 'الصرفيات والمشاريع والمخزون',
                  icon: PackageCheck,
                },
                {
                  id: 'donor_portal' as ActiveTab,
                  label: 'بوابة الداعمين والأثر',
                  icon: HeartHandshake,
                },
                {
                  id: 'sync_conflicts' as ActiveTab,
                  label: `المزامنة والتعارضات (${fmt(pendingConflictsCount)})`,
                  icon: GitMerge,
                },
                {
                  id: 'settings' as ActiveTab,
                  label: 'الإعدادات والحسابات والتدقيق',
                  icon: Settings,
                },
                {
                  id: 'style_guide' as ActiveTab,
                  label: 'دليل الأنماط (Style Guide)',
                  icon: Palette,
                },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 whitespace-nowrap transition min-h-[44px] ${
                      isActive
                        ? 'border-info bg-white/10 text-white'
                        : 'border-transparent text-white/75 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </nav>
        )}
      </header>

      {/* Main Content Area */}
      <main
        className={`flex-1 w-full mx-auto px-2 sm:px-4 pt-4 sm:pt-6 pb-24 md:pb-12 transition-all ${
          isMobileSimulator
            ? 'max-w-[420px] my-6 p-4 rounded-[44px] border-[10px] border-slate-900 shadow-2xl bg-surface relative'
            : 'max-w-7xl'
        }`}
      >
        {isMobileSimulator && (
          <div className="w-36 h-5 bg-slate-900 rounded-b-2xl mx-auto -mt-4 mb-3 flex items-center justify-center gap-2">
            <span className="w-2 h-2 rounded-full bg-slate-950 border border-slate-700"></span>
            <span className="w-2.5 h-1 rounded-full bg-slate-800"></span>
          </div>
        )}
        {currentUserRecord.role === 'donor' ? (
          <DonorPortalView
            currentUserRole={currentUserRecord.role}
            linkedDonorId={currentUserRecord.donor_id || 'donor-1'}
          />
        ) : (
          <>
            {activeTab === 'dashboard' && (
              <DashboardView
                cases={activeCases}
                followupsByCaseId={followupsByCaseId}
                overdueThresholdDays={settings.overdue_study_days}
                numeralSystem={settings.numeral_system}
                pendingOutboxCount={pendingOutbox.length}
                onOpenNewCase={() => {
                  setEditingCase(null);
                  setIsFormOpen(true);
                }}
                onSelectCase={(c) => setSelectedCaseId(c.id)}
                onNavigateToCasesWithFilter={(preset) => {
                  setPresetFilters(preset);
                  setActiveTab('cases');
                }}
                onExportCsv={() => handleExportCsv()}
              />
            )}

            {activeTab === 'cases' && (
              <CasesListView
                cases={activeCases}
                followupsByCaseId={followupsByCaseId}
                dropdownLists={dropdownLists}
                overdueThresholdDays={settings.overdue_study_days}
                numeralSystem={settings.numeral_system}
                initialStatusFilter={presetFilters.status}
                initialAlertFilter={presetFilters.alertFilter}
                initialAidCatFilter={presetFilters.aidCat}
                onSelectCase={(c) => setSelectedCaseId(c.id)}
                onEditCase={(c) => {
                  if (isReadOnlyRole) return;
                  setEditingCase(c);
                  setIsFormOpen(true);
                }}
                onDeleteCase={(c) => {
                  if (!canDeleteOrExport) return;
                  setCaseToDelete(c);
                }}
                onOpenNewCase={() => {
                  if (isReadOnlyRole) return;
                  setEditingCase(null);
                  setIsFormOpen(true);
                }}
                onExportFilteredCsv={(rows) => handleExportCsv(rows)}
                onRunBenchmark20k={async () => {
                  await generateBulkBenchmarkCases(20000);
                }}
                onClearBenchmark={async () => {
                  await clearBenchmarkCases();
                }}
              />
            )}

            {activeTab === 'followups' && (
              <FieldVisitsView
                cases={activeCases}
                followups={activeFollowups}
                followupsByCaseId={followupsByCaseId}
                overdueThresholdDays={settings.overdue_study_days}
                numeralSystem={settings.numeral_system}
                onSelectCase={(c) => setSelectedCaseId(c.id)}
                onAddFollowup={handleAddFollowup}
              />
            )}

            {activeTab === 'distributions_projects' && (
              <DistributionsAndProjectsView
                onOpenCaseDetail={(caseId) => setSelectedCaseId(caseId)}
              />
            )}

            {activeTab === 'donor_portal' && (
              <DonorPortalView
                currentUserRole={currentUserRecord.role}
                linkedDonorId={currentUserRecord.donor_id || undefined}
              />
            )}

            {activeTab === 'sync_conflicts' && (
              <SyncAndConflictsView
                settings={settings}
                cases={activeCases}
                conflicts={syncConflicts}
                outboxItems={pendingOutbox}
                onUpdateSettings={handleUpdateSettings}
                onSelectCase={(c) => setSelectedCaseId(c.id)}
              />
            )}

            {activeTab === 'settings' && (
              <SettingsView
                settings={settings}
                dropdownLists={dropdownLists}
                users={users}
                devices={devices}
                auditLogs={auditLogs}
                outboxItems={pendingOutbox}
                onUpdateSettings={handleUpdateSettings}
                onExportCsv={() => handleExportCsv()}
              />
            )}

            {activeTab === 'style_guide' && <StyleGuideView />}
          </>
        )}
      </main>

      {/* Case Form Modal (Add / Edit) */}
      {isFormOpen && (
        <CaseFormModal
          initialCase={editingCase}
          existingCases={activeCases}
          dropdownLists={dropdownLists}
          onClose={() => {
            setIsFormOpen(false);
            setEditingCase(null);
          }}
          onSave={handleSaveCase}
          onOpenMatchingCase={(matched) => {
            setIsFormOpen(false);
            setEditingCase(null);
            setSelectedCaseId(matched.id);
          }}
        />
      )}

      {/* Printable Case Card Detail Modal */}
      {selectedCase && !isFormOpen && (
        <CaseDetailModal
          caseRecord={selectedCase}
          followups={followupsByCaseId.get(selectedCase.id) || []}
          auditLogs={auditLogs.filter(
            (l) => l.entity_id === selectedCase.id || l.entity_code === selectedCase.code
          )}
          overdueThresholdDays={settings.overdue_study_days}
          numeralSystem={settings.numeral_system}
          orgName={settings.org_name}
          currentUserName={settings.current_user_name}
          canViewSensitiveHealth={currentUserRecord.can_view_sensitive_health}
          readOnlyRole={isReadOnlyRole}
          onClose={() => setSelectedCaseId(null)}
          onEdit={(c) => {
            setEditingCase(c);
            setIsFormOpen(true);
          }}
          onAddFollowup={handleAddFollowup}
        />
      )}

      {/* Soft Delete Confirmation Modal */}
      {caseToDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="ds-card max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-2 text-danger font-bold text-lg">
              <AlertTriangle className="w-6 h-6" />
              <span>تأكيد حذف الحالة منطقياً</span>
            </div>
            <p className="text-sm text-text-muted">
              هل تريد حذف الحالة{' '}
              <strong className="text-text">
                {caseToDelete.code} ({caseToDelete.name})
              </strong>
              ؟ يتم الحذف منطقياً (<code className="font-mono">deleted_at</code>) ويُسجَّل في طابور المزامنة وسجل التدقيق دون ضياع البيانات.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCaseToDelete(null)}
                className="ds-btn ds-btn-secondary text-xs"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={async () => {
                  await softDeleteCase(caseToDelete.id);
                  if (selectedCaseId === caseToDelete.id) {
                    setSelectedCaseId(null);
                  }
                  setCaseToDelete(null);
                }}
                className="ds-btn ds-btn-danger text-xs"
              >
                تأكيد الحذف المنطقي
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auth / Session Lock Modal (Screen 1) */}
      <AuthLockModal
        users={users}
        devices={devices}
        settings={settings}
        isLocked={isSessionLocked}
        onUnlockAndSwitchUser={handleUnlockAndSwitchUser}
      />

      {/* Mobile Bottom Navigation Bar (md:hidden or in mobile simulator) */}
      {currentUserRecord.role !== 'donor' && (
        <div className={isMobileSimulator ? 'block' : 'md:hidden'}>
          <MobileBottomNav
            activeTab={activeTab}
            onSelectTab={setActiveTab}
            onOpenNewCase={() => {
              setEditingCase(null);
              setIsFormOpen(true);
            }}
            casesCount={activeCases.length}
            followupsCount={activeFollowups.length}
            isReadOnlyRole={isReadOnlyRole}
            onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
          />
        </div>
      )}

      {/* Mobile More Drawer Modal */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end justify-center p-0 animate-in fade-in">
          <div className="bg-surface rounded-t-3xl max-w-md w-full p-5 space-y-4 shadow-2xl border-t border-primary/20 pb-[max(env(safe-area-inset-bottom),1.5rem)]">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold">
                  م
                </div>
                <div>
                  <h4 className="font-bold text-sm text-text-primary">
                    مشكاة للعمل الإنساني
                  </h4>
                  <p className="text-[11px] text-text-secondary">القائمة والميزات الإضافية</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-1 rounded-full text-text-secondary hover:text-text-primary hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-semibold">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('donor_portal');
                  setIsMobileMenuOpen(false);
                }}
                className="p-3 rounded-xl border border-border bg-slate-50 dark:bg-slate-900/40 hover:bg-primary/10 flex flex-col items-center gap-2 text-center transition"
              >
                <HeartHandshake className="w-5 h-5 text-primary" />
                <span>بوابة الداعمين والأثر</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab('sync_conflicts');
                  setIsMobileMenuOpen(false);
                }}
                className="p-3 rounded-xl border border-border bg-slate-50 dark:bg-slate-900/40 hover:bg-primary/10 flex flex-col items-center gap-2 text-center transition"
              >
                <GitMerge className="w-5 h-5 text-warning" />
                <span>المزامنة والتعارضات</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab('settings');
                  setIsMobileMenuOpen(false);
                }}
                className="p-3 rounded-xl border border-border bg-slate-50 dark:bg-slate-900/40 hover:bg-primary/10 flex flex-col items-center gap-2 text-center transition"
              >
                <Settings className="w-5 h-5 text-text-secondary" />
                <span>الإعدادات والنسخ</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab('style_guide');
                  setIsMobileMenuOpen(false);
                }}
                className="p-3 rounded-xl border border-border bg-slate-50 dark:bg-slate-900/40 hover:bg-primary/10 flex flex-col items-center gap-2 text-center transition"
              >
                <Palette className="w-5 h-5 text-accent" />
                <span>دليل الأنماط</span>
              </button>
            </div>

            <div className="pt-2 border-t border-border space-y-2">
              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  setIsInstallModalOpen(true);
                }}
                className="w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 transition shadow-sm"
              >
                <Smartphone className="w-4 h-4" />
                <span>تثبيت التطبيق على الهاتف (آيفون وأندرويد)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  setIsSessionLocked(true);
                }}
                className="w-full py-2 px-3 rounded-xl border border-border bg-white dark:bg-slate-800 text-text-secondary hover:text-text-primary text-xs font-semibold flex items-center justify-center gap-2 transition"
              >
                <Lock className="w-3.5 h-3.5 text-warning" />
                <span>قفل الجلسة وتبديل الحساب</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Install Instructions Modal */}
      <MobileInstallModal
        isOpen={isInstallModalOpen}
        onClose={() => setIsInstallModalOpen(false)}
      />
    </div>
  );
};
