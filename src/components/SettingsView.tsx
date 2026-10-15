import React, { useState } from 'react';
import {
  Settings,
  ListPlus,
  Database,
  Shield,
  Plus,
  Check,
  Download,
  Upload,
  RefreshCw,
  Lock,
  Users,
  Smartphone,
  ShieldOff,
  RotateCcw,
  KeyRound,
  FileSpreadsheet,
  FileCode2,
  CheckCircle2,
  AlertTriangle,
  UserPlus,
  Edit2,
  Trash2,
  Eye,
  EyeOff,
  X,
  Dices,
} from 'lucide-react';
import {
  AppSettings,
  AuditLogEntry,
  DropdownListRecord,
  SyncOutboxItem,
  TrustedDevice,
  UserAccount,
  UserRoleCode,
} from '../types/models';
import { FIXED_CASE_STATUSES } from '../constants/defaultLists';
import {
  db,
  logAuditAction,
  restoreTrustedDevice,
  revokeTrustedDevice,
} from '../db/database';
import { formatNumerals } from '../utils/formatters';
import {
  parseLegacyCsvOrExcelText,
  parseLegacySqliteDump,
  executeMigrationImport,
  createEncryptedBackup,
  restoreEncryptedBackup,
  MigrationPreviewResult,
  SAMPLE_LEGACY_SQLITE_DUMP,
} from '../utils/migrationAndBackup';

export const ROLE_OPTIONS: Array<{ value: UserRoleCode; label: string; desc: string }> = [
  {
    value: 'admin',
    label: 'مدير النظام',
    desc: 'كامل الصلاحيات، إدارة الإعدادات والموظفين والمزامنة السحابية',
  },
  {
    value: 'case_worker',
    label: 'باحث اجتماعي / مسؤول حالات',
    desc: 'تسجيل وبحث الحالات الميدانية واعتماد الصرف والمتابعات',
  },
  {
    value: 'data_entry',
    label: 'مدخل بيانات',
    desc: 'تسجيل الحالات وتعديل البيانات الأساسية بدون صلاحيات إدارية',
  },
  {
    value: 'internal_auditor',
    label: 'محاسب / مراجع داخلي',
    desc: 'مراجعة الدفاتر والتقارير المالية والتدقيق وسجل العمليات',
  },
  {
    value: 'donor',
    label: 'داعم (Donor)',
    desc: 'اطلاع مجهول الهوية على إحصائيات الأثر وتوزيعات المشاريع',
  },
];

interface SettingsViewProps {
  settings: AppSettings;
  dropdownLists: DropdownListRecord[];
  users: UserAccount[];
  devices: TrustedDevice[];
  auditLogs: AuditLogEntry[];
  outboxItems: SyncOutboxItem[];
  onUpdateSettings: (partial: Partial<AppSettings>) => Promise<void>;
  onExportCsv: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  dropdownLists,
  users,
  devices,
  auditLogs,
  outboxItems,
  onUpdateSettings,
  onExportCsv,
}) => {
  const [selectedListKey, setSelectedListKey] = useState(
    dropdownLists[0]?.key || 'nationality'
  );
  const [newItemText, setNewItemText] = useState('');
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [backupPassphrase, setBackupPassphrase] = useState('Mishkat@2026');
  const [migrationPreview, setMigrationPreview] =
    useState<MigrationPreviewResult | null>(null);
  const [duplicateStrategy, setDuplicateStrategy] = useState<
    'update_existing' | 'skip_duplicates' | 'import_all'
  >('update_existing');

  const fmt = (val: string | number) => formatNumerals(val, settings.numeral_system);
  const activeList = dropdownLists.find((l) => l.key === selectedListKey) || dropdownLists[0];

  const handleAddListItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newItemText.trim();
    if (!trimmed || !activeList) return;
    if (activeList.items.some((i) => i.value === trimmed)) {
      setNewItemText('');
      return;
    }

    const updatedItems = [
      ...activeList.items,
      {
        value: trimmed,
        label_ar: trimmed,
        active: true,
        sort_order: activeList.items.length + 1,
      },
    ];

    await db.dropdown_lists.put({
      ...activeList,
      items: updatedItems,
      updated_at: new Date().toISOString(),
    });
    await logAuditAction({
      action: 'SETTINGS_CHANGE',
      entity_type: 'dropdown_list',
      entity_id: activeList.key,
      summary_ar: `إضافة خيار «${trimmed}» إلى قائمة (${activeList.title_ar})`,
    });
    setNewItemText('');
  };

  const handleToggleItemActive = async (itemValue: string) => {
    if (!activeList) return;
    const updatedItems = activeList.items.map((item) =>
      item.value === itemValue ? { ...item, active: !item.active } : item
    );
    await db.dropdown_lists.put({
      ...activeList,
      items: updatedItems,
      updated_at: new Date().toISOString(),
    });
  };

  // User Management State
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [userFormData, setUserFormData] = useState<{
    name: string;
    email_or_phone: string;
    role: UserRoleCode;
    pin_code: string;
    can_view_sensitive_health: boolean;
    status: 'active' | 'suspended';
  }>({
    name: '',
    email_or_phone: '',
    role: 'case_worker',
    pin_code: '',
    can_view_sensitive_health: true,
    status: 'active',
  });
  const [showPinInForm, setShowPinInForm] = useState(true);
  const [userFormError, setUserFormError] = useState<string | null>(null);
  const [revealedPins, setRevealedPins] = useState<Record<string, boolean>>({});

  // Quick Change PIN Modal State
  const [quickPinUser, setQuickPinUser] = useState<UserAccount | null>(null);
  const [newQuickPin, setNewQuickPin] = useState('');
  const [showQuickPin, setShowQuickPin] = useState(true);
  const [quickPinError, setQuickPinError] = useState<string | null>(null);

  // Delete User Confirmation State
  const [userToDelete, setUserToDelete] = useState<UserAccount | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleOpenAddUser = () => {
    setEditingUser(null);
    setUserFormData({
      name: '',
      email_or_phone: '',
      role: 'case_worker',
      pin_code: Math.floor(1000 + Math.random() * 9000).toString(),
      can_view_sensitive_health: true,
      status: 'active',
    });
    setUserFormError(null);
    setShowPinInForm(true);
    setIsUserModalOpen(true);
  };

  const handleOpenEditUser = (u: UserAccount) => {
    setEditingUser(u);
    setUserFormData({
      name: u.name,
      email_or_phone: u.email_or_phone,
      role: u.role,
      pin_code: u.pin_code,
      can_view_sensitive_health: u.can_view_sensitive_health,
      status: u.status,
    });
    setUserFormError(null);
    setShowPinInForm(true);
    setIsUserModalOpen(true);
  };

  const handleGenerateRandomPin = () => {
    const randomPin = Math.floor(1000 + Math.random() * 9000).toString();
    setUserFormData((prev) => ({ ...prev, pin_code: randomPin }));
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserFormError(null);

    const name = userFormData.name.trim();
    const contact = userFormData.email_or_phone.trim();
    const pin = userFormData.pin_code.trim();

    if (!name) {
      setUserFormError('يرجى إدخال اسم الموظف بالكامل.');
      return;
    }
    if (!contact) {
      setUserFormError('يرجى إدخال رقم الهاتف أو البريد الإلكتروني للموظف.');
      return;
    }
    if (!pin || pin.length < 3) {
      setUserFormError('كلمة السر / رمز المرور يجب ألا يقل عن 3 خانات أو أرقام.');
      return;
    }

    const roleMeta = ROLE_OPTIONS.find((r) => r.value === userFormData.role);
    const roleLabel = roleMeta ? roleMeta.label : 'موظف';

    if (editingUser) {
      if (editingUser.id === settings.current_user_id && userFormData.status === 'suspended') {
        setUserFormError('لا يمكنك تجميد الحساب الحالي الذي تسجل دخولك به حالياً.');
        return;
      }

      const updated: UserAccount = {
        ...editingUser,
        name,
        email_or_phone: contact,
        role: userFormData.role,
        role_label_ar: roleLabel,
        status: userFormData.status,
        pin_code: pin,
        can_view_sensitive_health: userFormData.can_view_sensitive_health,
      };

      await db.users.put(updated);
      await logAuditAction({
        action: 'UPDATE',
        entity_type: 'user',
        entity_id: updated.id,
        summary_ar: `تعديل بيانات وكلمة سر الموظف (${updated.name}) [${roleLabel}] وتحديث PIN محلياً`,
      });
    } else {
      const newId = `user-${Date.now()}`;
      const newUser: UserAccount = {
        id: newId,
        name,
        email_or_phone: contact,
        role: userFormData.role,
        role_label_ar: roleLabel,
        status: userFormData.status,
        pin_code: pin,
        can_view_sensitive_health: userFormData.can_view_sensitive_health,
        created_at: new Date().toISOString(),
      };

      await db.users.put(newUser);
      await logAuditAction({
        action: 'CREATE',
        entity_type: 'user',
        entity_id: newUser.id,
        summary_ar: `إضافة موظف جديد (${newUser.name}) بدور [${roleLabel}] وتعيين كلمة سر محلية`,
      });
    }

    setIsUserModalOpen(false);
  };

  const handleOpenQuickPin = (u: UserAccount) => {
    setQuickPinUser(u);
    setNewQuickPin(u.pin_code);
    setShowQuickPin(true);
    setQuickPinError(null);
  };

  const handleGenerateRandomQuickPin = () => {
    setNewQuickPin(Math.floor(1000 + Math.random() * 9000).toString());
  };

  const handleSaveQuickPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickPinUser) return;
    const pin = newQuickPin.trim();
    if (!pin || pin.length < 3) {
      setQuickPinError('يجب أن تكون كلمة السر / PIN من 3 خانات أو أرقام على الأقل.');
      return;
    }

    await db.users.update(quickPinUser.id, { pin_code: pin });
    await logAuditAction({
      action: 'SETTINGS_CHANGE',
      entity_type: 'user',
      entity_id: quickPinUser.id,
      summary_ar: `تغيير كلمة السر / رمز المرور المحلي للموظف (${quickPinUser.name}) إلى رمز جديد`,
    });
    setQuickPinUser(null);
  };

  const handleOpenDeleteUser = (u: UserAccount) => {
    setDeleteError(null);
    setUserToDelete(u);
  };

  const handleConfirmDeleteUser = async () => {
    if (!userToDelete) return;

    if (userToDelete.id === settings.current_user_id) {
      setDeleteError('لا يمكن حذف الحساب الحالي المستخدم لتسجيل الدخول في الجلسة النشطة!');
      return;
    }

    const adminCount = users.filter((u) => u.role === 'admin' && u.status === 'active').length;
    if (userToDelete.role === 'admin' && adminCount <= 1) {
      setDeleteError('لا يمكن حذف آخر مدير نظام مفعل لحماية النظام من إغلاق الصلاحيات الإدارية!');
      return;
    }

    await db.users.delete(userToDelete.id);
    await logAuditAction({
      action: 'SOFT_DELETE',
      entity_type: 'user',
      entity_id: userToDelete.id,
      summary_ar: `حذف حساب الموظف (${userToDelete.name}) نهائياً من قاعدة البيانات المحلية`,
    });
    setUserToDelete(null);
  };

  const handleToggleRevealPin = (userId: string) => {
    setRevealedPins((prev) => ({
      ...prev,
      [userId]: !prev[userId],
    }));
  };

  const handleToggleUserStatus = async (u: UserAccount) => {
    if (u.id === settings.current_user_id && u.status === 'active') {
      alert('لا يمكنك إيقاف حسابك الحالي الذي تستخدمه لتسجيل الدخول تفادياً لقفل النظام.');
      return;
    }
    const nextStatus = u.status === 'active' ? 'suspended' : 'active';
    await db.users.update(u.id, { status: nextStatus });
    await logAuditAction({
      action: 'SETTINGS_CHANGE',
      entity_type: 'user',
      entity_id: u.id,
      summary_ar: `${nextStatus === 'active' ? 'تفعيل' : 'إيقاف'} حساب المستخدم (${u.name})`,
    });
  };

  const handleToggleUserSensitiveHealth = async (u: UserAccount) => {
    await db.users.update(u.id, {
      can_view_sensitive_health: !u.can_view_sensitive_health,
    });
  };

  const handleCreateFullBackup = async () => {
    const [cases, followups, attachments, lists, currentSettings] = await Promise.all([
      db.beneficiary_cases.toArray(),
      db.followups.toArray(),
      db.attachments.toArray(),
      db.dropdown_lists.toArray(),
      db.app_settings.get('default'),
    ]);

    const backupBundle = {
      schema_version: 3,
      exported_at: new Date().toISOString(),
      org_name: settings.org_name,
      beneficiary_cases: cases,
      followups,
      attachments,
      dropdown_lists: lists,
      app_settings: currentSettings,
    };

    const blob = new Blob([JSON.stringify(backupBundle, null, 2)], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `نسخة_احتياطية_مشكاة_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    await logAuditAction({
      action: 'BACKUP',
      entity_type: 'system',
      entity_id: 'full_backup',
      summary_ar: `تصدير نسخة احتياطية كاملة (${cases.length} حالة، ${followups.length} متابعة)`,
    });
    setBackupMessage('✓ تم تصدير النسخة الاحتياطية الكاملة بنجاح.');
  };

  const handleCreateEncryptedBackup = async () => {
    try {
      const envelope = await createEncryptedBackup(backupPassphrase);
      const blob = new Blob([JSON.stringify(envelope, null, 2)], {
        type: 'application/json;charset=utf-8;',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `نسخة_مشفرة_مشكاة_${new Date().toISOString().slice(0, 10)}.mishkat.enc.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setBackupMessage(
        `✓ تم تشفير وتصدير النسخة الاحتياطية بنجاح بخوارزمية (AES-256-GCM + PBKDF2) وبصمة SHA-256: ${envelope.plaintext_sha256.slice(0, 12)}...`
      );
    } catch (err) {
      setBackupMessage(
        `⚠ فشل تصدير النسخة المشفرة: ${err instanceof Error ? err.message : 'خطأ غير معروف'}`
      );
    }
  };

  const handleRestoreEncryptedFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const res = await restoreEncryptedBackup(text, backupPassphrase);
      setBackupMessage(
        `✓ تمت استعادة النسخة الاحتياطية المشفرة بنجاح (${res.restoredCasesCount} حالة، ${res.restoredDistributionsCount} صرفية، ${res.restoredFollowupsCount} متابعة).`
      );
    } catch (err) {
      setBackupMessage(
        `⚠ ${err instanceof Error ? err.message : 'فشل فك تشفير النسخة الاحتياطية.'}`
      );
    }
  };

  const handleRestoreBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (parsed.format === 'SANAD_ENCRYPTED_BACKUP_V1') {
        const res = await restoreEncryptedBackup(parsed, backupPassphrase);
        setBackupMessage(
          `✓ تم فك تشفير واستعادة النسخة بنجاح (${res.restoredCasesCount} حالة).`
        );
        return;
      }
      if (!Array.isArray(parsed.beneficiary_cases)) {
        setBackupMessage('⚠ ملف النسخة الاحتياطية غير صالح.');
        return;
      }
      await db.transaction(
        'rw',
        [db.beneficiary_cases, db.followups, db.attachments, db.dropdown_lists],
        async () => {
          await db.beneficiary_cases.bulkPut(parsed.beneficiary_cases);
          if (Array.isArray(parsed.followups)) {
            await db.followups.bulkPut(parsed.followups);
          }
          if (Array.isArray(parsed.attachments)) {
            await db.attachments.bulkPut(parsed.attachments);
          }
          if (Array.isArray(parsed.dropdown_lists)) {
            await db.dropdown_lists.bulkPut(parsed.dropdown_lists);
          }
        }
      );
      await logAuditAction({
        action: 'IMPORT',
        entity_type: 'system',
        entity_id: 'restore_backup',
        summary_ar: `استعادة نسخة احتياطية تحتوي على ${parsed.beneficiary_cases.length} حالة`,
      });
      setBackupMessage(
        `✓ تمت استعادة النسخة الاحتياطية بنجاح (${parsed.beneficiary_cases.length} حالة).`
      );
    } catch {
      setBackupMessage('⚠ حدث خطأ أثناء قراءة ملف النسخة الاحتياطية.');
    }
  };

  const handleMigrationFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    if (file.name.endsWith('.json') || file.name.endsWith('.sql')) {
      const preview = await parseLegacySqliteDump(text);
      setMigrationPreview(preview);
    } else {
      const preview = await parseLegacyCsvOrExcelText(text);
      setMigrationPreview(preview);
    }
  };

  const handlePreviewSampleExcel = async () => {
    const sampleExcelCsv = [
      '"كود الحالة","تاريخ التسجيل","اسم المستفيد (رب الأسرة)","رقم الهوية / الجواز","الجنسية","الهاتف الأساسي","المنطقة العامة","العنوان / المنطقة بالتفصيل","الحالة الاجتماعية","عدد أفراد الأسرة","الحالة الصحية","فئة المساعدة الرئيسية","نوع المساعدة المحددة","حالة الطلب","تاريخ الصرف","طريقة إثبات الاستلام","ملاحظات الباحث/مسؤول الحالة"',
      '"CS-0085","2026/09/12","زينب مصطفى عبد الحميد الشرقاوي","=""02940815003321""","مصري","=""01009988776""","القطاع الشمالي","حي السلام، حارة الزهور، منزل 5","أرمل","5","مرض مزمن","مساعدات شتوية","بطاطين / ألحفة ؛ دفايات / مستلزمات تدفئة","تم الصرف","2026/09/29","كشف توقيع المستفيد","حالة مستوردة من ملف Excel القديم مع الحفاظ على الصفر الأول"',
      '"CS-0086","2026/09/18","فاطمة عبد الرحمن محمود السيد","=""02980514120045""","مصري","=""01012345678""","القطاع الشمالي","حي السلام، شارع المدارس، منزل 14","أرمل","6","مرض مزمن","مساعدات شتوية","بطاطين / ألحفة","تم الصرف","2026/09/25","كشف توقيع المستفيد","اختبار كشف تكرار رقم الهوية أثناء الاستيراد"',
    ].join('\r\n');
    const preview = await parseLegacyCsvOrExcelText(sampleExcelCsv);
    setMigrationPreview(preview);
  };

  const handlePreviewSampleSqlite = async () => {
    const preview = await parseLegacySqliteDump(SAMPLE_LEGACY_SQLITE_DUMP);
    setMigrationPreview(preview);
  };

  const handleExecuteMigration = async () => {
    if (!migrationPreview) return;
    const res = await executeMigrationImport(migrationPreview, duplicateStrategy);
    setBackupMessage(
      `✓ اكتمل الاستيراد والترحيل بنجاح: إضافة (${res.importedCasesCount}) حالة جديدة، تحديث (${res.updatedCasesCount}) حالة، ترحيل (${res.migratedDistributionsCount}) صرفية قديمة إلى جدول الصرفيات الجديد، واستيراد (${res.importedFollowupsCount}) متابعة.`
    );
    setMigrationPreview(null);
  };

  return (
    <div className="space-y-6 pb-10">
      {/* 1. General System & Rules Settings */}
      <section className="ds-card p-6 space-y-4">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Settings className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold">
            1. إعدادات الجمعية، قواعد العمل، وحدود التنبيهات التلقائية
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="ds-label">اسم الجمعية / المبادرة (يظهر في الترويسة والطباعة)</label>
            <input
              type="text"
              value={settings.org_name}
              onChange={(e) => onUpdateSettings({ org_name: e.target.value })}
              className="ds-input text-sm"
            />
          </div>

          <div>
            <label className="ds-label">
              حد تنبيه تأخر دراسة الحالة بالأيام (القسم 7 - افتراضياً 30 يوماً)
            </label>
            <input
              type="number"
              min={1}
              max={365}
              value={settings.overdue_study_days}
              onChange={(e) =>
                onUpdateSettings({
                  overdue_study_days: Math.max(1, Number(e.target.value) || 30),
                })
              }
              className="ds-input font-bold text-sm"
            />
          </div>

          <div>
            <label className="ds-label">رمز الجهاز المحلي للأكواد المؤقتة (CS-D1-0001)</label>
            <select
              value={settings.device_code}
              onChange={(e) => onUpdateSettings({ device_code: e.target.value })}
              className="ds-input font-mono text-sm"
            >
              {devices.map((d) => (
                <option key={d.device_code} value={d.device_code}>
                  {d.device_code} — {d.device_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="ds-label">قفل الجلسة التلقائي بعد خمول (بالدقائق - القسم 6)</label>
            <input
              type="number"
              min={1}
              max={120}
              value={settings.session_timeout_minutes}
              onChange={(e) =>
                onUpdateSettings({
                  session_timeout_minutes: Math.max(1, Number(e.target.value) || 15),
                })
              }
              className="ds-input text-sm"
            />
          </div>

          <div>
            <label className="ds-label">نظام عرض الأرقام (القسم 15.2)</label>
            <select
              value={settings.numeral_system}
              onChange={(e) =>
                onUpdateSettings({
                  numeral_system: e.target.value as AppSettings['numeral_system'],
                })
              }
              className="ds-input text-sm"
            >
              <option value="latin">الأرقام الإنجليزية القياسية (0-9) — افتراضي</option>
              <option value="arabic_indic">الأرقام الهندية المشرقية (٠-٩)</option>
            </select>
          </div>

          <div>
            <label className="ds-label">حد الاعتماد المالي لمبدأ العينين الأربعة (P1.3)</label>
            <input
              type="number"
              min={100}
              value={settings.financial_approval_limit}
              onChange={(e) =>
                onUpdateSettings({
                  financial_approval_limit: Number(e.target.value) || 5000,
                })
              }
              className="ds-input text-sm font-mono"
            />
          </div>
        </div>
      </section>

      {/* 2. Users & Roles Management + Trusted Devices & Revocation (Section 6 & Scenario 9) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Users & Roles */}
        <section className="ds-card p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between border-b border-border pb-3 gap-2">
            <div>
              <div className="flex items-center gap-2 font-bold text-base text-primary">
                <Users className="w-5 h-5" />
                <span>إدارة الموظفين وكلمات السر والأدوار (users - القسم 6)</span>
              </div>
              <p className="text-xs text-text-muted mt-0.5">
                إضافة وتعديل وحذف الموظفين، وتعيين كلمات السر / PIN محلياً دون الحاجة للإنترنت
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-primary/10 text-primary">
                {fmt(users.length)} موظفين
              </span>
              <button
                type="button"
                onClick={handleOpenAddUser}
                className="ds-btn ds-btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5 shadow-sm"
              >
                <UserPlus className="w-4 h-4" />
                <span>إضافة موظف جديد +</span>
              </button>
            </div>
          </div>

          <div className="space-y-2.5">
            {users.map((u) => {
              const isCurrent = u.id === settings.current_user_id;
              const isPinRevealed = !!revealedPins[u.id];

              return (
                <div
                  key={u.id}
                  className={`p-3.5 rounded-card border transition-all ${
                    isCurrent
                      ? 'border-primary/50 bg-primary/[0.04]'
                      : u.status === 'suspended'
                      ? 'border-danger/30 bg-danger/[0.02] opacity-80'
                      : 'border-border bg-background/50 hover:border-primary/30'
                  } flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs`}
                >
                  <div className="space-y-1">
                    <div className="font-bold text-text flex flex-wrap items-center gap-2">
                      <span className="text-sm font-extrabold">{u.name}</span>
                      <span className="px-2 py-0.5 rounded bg-primary/10 text-primary font-semibold text-[11px]">
                        {u.role_label_ar}
                      </span>
                      {isCurrent && (
                        <span className="px-2 py-0.5 rounded-full bg-info/20 text-info font-bold text-[10px]">
                          أنت (الحساب الحالي)
                        </span>
                      )}
                      {u.status === 'suspended' && (
                        <span className="px-2 py-0.5 rounded-full bg-danger/15 text-danger font-bold text-[10px]">
                          مجمّد ✕
                        </span>
                      )}
                    </div>

                    <div className="text-text-muted flex flex-wrap items-center gap-2.5 text-[11px]">
                      <span className="font-mono" dir="ltr">
                        {u.email_or_phone}
                      </span>
                      <span>•</span>
                      {/* PIN display & quick change */}
                      <div className="inline-flex items-center gap-1.5 bg-background px-2 py-0.5 rounded border border-border">
                        <KeyRound className="w-3 h-3 text-primary shrink-0" />
                        <span className="font-medium text-text-muted">كلمة السر / PIN:</span>
                        <span className="font-mono font-bold text-text" dir="ltr">
                          {isPinRevealed ? u.pin_code : '••••'}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleToggleRevealPin(u.id)}
                          className="text-text-muted hover:text-text p-0.5 rounded"
                          title={isPinRevealed ? 'إخفاء رمز المرور' : 'إظهار رمز المرور'}
                        >
                          {isPinRevealed ? (
                            <EyeOff className="w-3.5 h-3.5" />
                          ) : (
                            <Eye className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenQuickPin(u)}
                          className="text-[10px] text-primary hover:underline font-bold mr-1"
                          title="تغيير كلمة السر محلياً"
                        >
                          تغيير 🔑
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    {u.role === 'data_entry' && (
                      <button
                        type="button"
                        onClick={() => handleToggleUserSensitiveHealth(u)}
                        className={`px-2 py-1 rounded text-[11px] font-bold border transition ${
                          u.can_view_sensitive_health
                            ? 'bg-info/15 text-primary border-info/30'
                            : 'bg-warning/15 text-amber-900 dark:text-warning border-warning/30'
                        }`}
                        title="تبديل صلاحية رؤية الحقول الطبية الحساسة"
                      >
                        {u.can_view_sensitive_health
                          ? 'الصحة: مسموحة'
                          : 'الصحة: محجوبة 🔒'}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleToggleUserStatus(u)}
                      disabled={isCurrent}
                      className={`px-2.5 py-1 rounded text-[11px] font-bold transition ${
                        u.status === 'active'
                          ? 'bg-success/15 text-success hover:bg-success/25'
                          : 'bg-danger/15 text-danger hover:bg-danger/25'
                      } ${isCurrent ? 'opacity-50 cursor-not-allowed' : ''}`}
                      title={isCurrent ? 'لا يمكن تجميد حسابك النشط الحالي' : 'تبديل حالة الحساب'}
                    >
                      {u.status === 'active' ? 'مفعّل ✓' : 'موقوف ✕'}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenEditUser(u)}
                      className="p-1.5 rounded border border-border bg-background hover:bg-primary/10 text-primary transition"
                      title="تعديل بيانات وصلاحيات الموظف"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenDeleteUser(u)}
                      disabled={isCurrent}
                      className={`p-1.5 rounded border border-border bg-background hover:bg-danger/10 text-danger transition ${
                        isCurrent ? 'opacity-30 cursor-not-allowed' : ''
                      }`}
                      title={isCurrent ? 'لا يمكن حذف الحساب النشط الحالي' : 'حذف حساب الموظف نهائياً'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Trusted Devices & Scenario 9 Revocation */}
        <section className="ds-card p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <div className="flex items-center gap-2 font-bold text-base text-primary">
              <Smartphone className="w-5 h-5" />
              <span>الأجهزة المعتمدة وإبطال الجهاز المفقود (سيناريو 9)</span>
            </div>
          </div>
          <p className="text-xs text-text-muted">
            في حال فقدان لابتوب أو هاتف باحث ميداني، اضغط <strong>«إلغاء اعتماد الجهاز وإبطال جلساته»</strong> لمنع الدخول أو المزامنة منه فوراً.
          </p>

          <div className="space-y-2.5">
            {devices.map((d) => (
              <div
                key={d.device_code}
                className={`p-3.5 rounded-card border flex flex-wrap items-center justify-between gap-2 text-xs ${
                  d.status === 'revoked'
                    ? 'border-danger bg-danger/5'
                    : 'border-border bg-background/40'
                }`}
              >
                <div className="space-y-0.5">
                  <div className="font-bold text-text flex items-center gap-2">
                    <span className="font-mono px-2 py-0.5 rounded bg-primary text-white">
                      {d.device_code}
                    </span>
                    <span>{d.device_name}</span>
                  </div>
                  <div className="text-text-muted">
                    المسؤول: {d.assigned_user_name} • الحالة:{' '}
                    {d.status === 'approved' ? (
                      <strong className="text-success">معتمد ✓</strong>
                    ) : (
                      <strong className="text-danger">
                        ملغى اعتماده 🚫 ({d.revoked_reason})
                      </strong>
                    )}
                  </div>
                </div>

                {d.status === 'approved' ? (
                  <button
                    type="button"
                    onClick={() => revokeTrustedDevice(d.device_code)}
                    className="ds-btn ds-btn-danger text-xs py-1.5 min-h-[36px]"
                  >
                    <ShieldOff className="w-3.5 h-3.5" />
                    <span>إلغاء اعتماد الجهاز (فقدان)</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => restoreTrustedDevice(d.device_code)}
                    className="ds-btn ds-btn-secondary text-xs py-1.5 min-h-[36px]"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-success" />
                    <span>إعادة اعتماد الجهاز</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* 3. Editable Dropdown Lists Manager (Section 3, 4.3, 4.4, 7) */}
      <section className="ds-card p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <ListPlus className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-bold">
              3. إدارة القوائم المنسدلة القابلة للتعديل (dropdown_lists)
            </h3>
          </div>
          <span className="text-xs text-text-muted flex items-center gap-1">
            <Lock className="w-3.5 h-3.5 text-warning" />
            <span>حالات الطلب الأربع ثابتة وفق القسم 7 لاعتماد التنبيهات والألوان عليها</span>
          </span>
        </div>

        <div className="p-3 rounded-card bg-background border border-border flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-semibold text-text">
            حالات الطلب الأربع الثابتة (غير قابلة للحذف):
          </span>
          <div className="flex flex-wrap gap-2">
            {FIXED_CASE_STATUSES.map((st) => (
              <span
                key={st.value}
                className="px-2.5 py-1 rounded-full font-bold text-white"
                style={{ backgroundColor: st.hex }}
              >
                {st.icon} {st.label_ar}
              </span>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          <div className="md:col-span-4 space-y-1.5">
            <label className="ds-label text-xs">اختر القائمة المنسدلة لتعديل عناصرها:</label>
            <div className="space-y-1">
              {dropdownLists.map((list) => (
                <button
                  key={list.key}
                  type="button"
                  onClick={() => setSelectedListKey(list.key)}
                  className={`w-full text-right px-3.5 py-2.5 rounded-btn text-xs font-semibold flex items-center justify-between transition ${
                    list.key === selectedListKey
                      ? 'bg-primary text-white'
                      : 'bg-background hover:bg-primary/10 text-text'
                  }`}
                >
                  <span>{list.title_ar}</span>
                  <span className="px-2 py-0.5 rounded-full bg-black/15 text-[11px]">
                    {fmt(list.items.filter((i) => i.active).length)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="md:col-span-8 space-y-4">
            {activeList && (
              <>
                <form onSubmit={handleAddListItem} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newItemText}
                    onChange={(e) => setNewItemText(e.target.value)}
                    placeholder={`إضافة عنصر جديد إلى «${activeList.title_ar}»...`}
                    className="ds-input text-sm flex-1"
                  />
                  <button type="submit" className="ds-btn ds-btn-primary text-xs shrink-0">
                    <Plus className="w-4 h-4" />
                    <span>إضافة للقائمة</span>
                  </button>
                </form>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto p-1">
                  {activeList.items.map((item) => (
                    <div
                      key={item.value}
                      className={`p-2.5 rounded-btn border flex items-center justify-between text-xs ${
                        item.active
                          ? 'bg-surface border-border text-text font-semibold'
                          : 'bg-background/50 border-border/50 text-text-muted line-through'
                      }`}
                    >
                      <span>{item.label_ar}</span>
                      <button
                        type="button"
                        onClick={() => handleToggleItemActive(item.value)}
                        className={`px-2 py-1 rounded text-[11px] font-bold ${
                          item.active
                            ? 'bg-success/15 text-success'
                            : 'bg-border text-text-muted'
                        }`}
                      >
                        {item.active ? 'مفعّل ✓' : 'موقوف'}
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {/* 4. Encrypted Backup (AES-256-GCM) & Smart Legacy Migration (Excel / SQLite) */}
      <section className="ds-card p-6 space-y-5">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Database className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-bold">
            4. مركز النسخ الاحتياطي المشفر (AES-256-GCM) والهجرة الذكية من Excel وSQLite (المرحلة 4)
          </h3>
        </div>

        {/* 4A. Encrypted & Standard Backup Controls */}
        <div className="p-4 rounded-xl bg-background border border-border space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-bold text-primary">
              <KeyRound className="w-4 h-4" />
              <span>النسخ الاحتياطي المحلي المشفّر بكلمة مرور (AES-256-GCM + PBKDF2)</span>
            </div>
            <span className="text-xs text-text-muted">
              يحمي بيانات المستفيدين الحساسة عند حفظ النسخة على فلاشة خارجية أو قرص محلي
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-text" htmlFor="enc-passphrase">
                كلمة مرور التشفير:
              </label>
              <input
                id="enc-passphrase"
                type="password"
                value={backupPassphrase}
                onChange={(e) => setBackupPassphrase(e.target.value)}
                placeholder="كلمة مرور التشفير..."
                className="ds-input text-xs font-mono py-1.5 w-44"
              />
            </div>

            <button
              type="button"
              onClick={handleCreateEncryptedBackup}
              className="ds-btn ds-btn-primary text-xs"
            >
              <Lock className="w-4 h-4" />
              <span>تنزيل نسخة احتياطية مشفرة (.sanad.enc.json)</span>
            </button>

            <label className="ds-btn ds-btn-secondary text-xs cursor-pointer">
              <Upload className="w-4 h-4 text-primary" />
              <span>استعادة من نسخة مشفرة (.sanad.enc.json)</span>
              <input
                type="file"
                accept=".json,application/json"
                onChange={handleRestoreEncryptedFile}
                className="hidden"
              />
            </label>

            <button
              type="button"
              onClick={handleCreateFullBackup}
              className="ds-btn ds-btn-secondary text-xs"
            >
              <Download className="w-4 h-4" />
              <span>نسخة JSON قياسية</span>
            </button>

            <label className="ds-btn ds-btn-secondary text-xs cursor-pointer">
              <Upload className="w-4 h-4 text-info" />
              <span>استعادة JSON</span>
              <input
                type="file"
                accept="application/json,.json"
                onChange={handleRestoreBackup}
                className="hidden"
              />
            </label>

            <button
              type="button"
              onClick={onExportCsv}
              className="ds-btn ds-btn-secondary text-xs"
            >
              <Check className="w-4 h-4 text-success" />
              <span>تصدير Excel/CSV (UTF-8 BOM)</span>
            </button>
          </div>
        </div>

        {/* 4B. Smart Migration & Import from Legacy Excel & Python SQLite */}
        <div className="p-4 rounded-xl bg-background border border-border space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-bold text-text flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-success" />
                <span>
                  أداة الهجرة والاستيراد الذكي من النسختين السابقتين: (أ) ملف Excel/CSV و(ب) قاعدة SQLite لبرنامج Python القديم
                </span>
              </h4>
              <p className="text-xs text-text-muted mt-0.5">
                يحافظ تلقائياً على الصفر الأول في أرقام الهوية والهواتف (سيناريو 7)، ويكشف التكرارات، ويرحّل حقول الصرف القديمة (`disb_date/proof_*`) إلى جدول `distributions` الجديد.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="ds-btn ds-btn-primary text-xs cursor-pointer">
              <Upload className="w-4 h-4" />
              <span>رفع ملف استيراد (.csv / .json / .sql)</span>
              <input
                type="file"
                accept=".csv,.txt,.json,.sql"
                onChange={handleMigrationFileUpload}
                className="hidden"
              />
            </label>

            <button
              type="button"
              onClick={handlePreviewSampleExcel}
              className="ds-btn ds-btn-secondary text-xs"
            >
              <FileSpreadsheet className="w-4 h-4 text-success" />
              <span>معاينة استيراد تجريبي من ملف Excel القديم (سيناريو 7)</span>
            </button>

            <button
              type="button"
              onClick={handlePreviewSampleSqlite}
              className="ds-btn ds-btn-secondary text-xs"
            >
              <FileCode2 className="w-4 h-4 text-primary" />
              <span>معاينة ترحيل تجريبي من قاعدة SQLite لبرنامج Python القديم</span>
            </button>
          </div>

          {/* Interactive Pre-Import Preview & Validation Table */}
          {migrationPreview && (
            <div className="p-4 rounded-xl bg-surface border-2 border-primary space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
                <div>
                  <span className="text-xs font-bold px-2 py-0.5 rounded bg-primary-light text-primary">
                    {migrationPreview.sourceType === 'csv_excel'
                      ? 'مصدر البيانات: ملف Excel / CSV (UTF-8)'
                      : 'مصدر البيانات: قاعدة SQLite لبرنامج Python القديم'}
                  </span>
                  <h5 className="text-sm font-bold text-text mt-1">
                    تقرير المعاينة والفحص قبل الاستيراد: إجمالي ({migrationPreview.totalRows}) سجل — صالح ({migrationPreview.validRowsCount}) — تكرار هوية ({migrationPreview.duplicateIdCount}) — صرفيات قديمة للترحيل ({migrationPreview.legacyDisbursementsToMigrateCount})
                  </h5>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    aria-label="سياسة التعامل مع السجلات المكررة"
                    value={duplicateStrategy}
                    onChange={(e) =>
                      setDuplicateStrategy(
                        e.target.value as
                          | 'update_existing'
                          | 'skip_duplicates'
                          | 'import_all'
                      )
                    }
                    className="ds-input text-xs py-1.5"
                  >
                    <option value="update_existing">
                      عند تكرار رقم الهوية: تحديث ودمج السجل الموجود
                    </option>
                    <option value="skip_duplicates">
                      عند تكرار رقم الهوية: تخطي السجل المكرر
                    </option>
                    <option value="import_all">استيراد جميع السجلات كحالات جديدة</option>
                  </select>

                  <button
                    type="button"
                    onClick={handleExecuteMigration}
                    className="ds-btn ds-btn-primary text-xs py-1.5 px-4"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>اعتماد وتنفيذ الترحيل الآن</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMigrationPreview(null)}
                    className="ds-btn ds-btn-secondary text-xs py-1.5 px-3"
                  >
                    إلغاء
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto max-h-60">
                <table className="w-full text-xs text-right">
                  <thead className="bg-background text-text-muted border-b border-border">
                    <tr>
                      <th className="p-2">#</th>
                      <th className="p-2">اسم المستفيد</th>
                      <th className="p-2">رقم الهوية (مع الصفر الأول)</th>
                      <th className="p-2">الهاتف (مع الصفر الأول)</th>
                      <th className="p-2">الحالة</th>
                      <th className="p-2">نتيجة الفحص والتنبيهات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {migrationPreview.rows.map((r) => (
                      <tr key={r.rowNumber}>
                        <td className="p-2 font-mono">{r.rowNumber}</td>
                        <td className="p-2 font-bold text-text">{r.rawName || '—'}</td>
                        <td className="p-2 font-mono text-primary font-bold">
                          {r.nationalId || '—'}
                        </td>
                        <td className="p-2 font-mono">{r.phone || '—'}</td>
                        <td className="p-2 font-bold">{r.status}</td>
                        <td className="p-2 space-y-1">
                          {r.issues.length === 0 ? (
                            <span className="text-success font-bold">
                              ✓ جاهز للاستيراد المباشر
                            </span>
                          ) : (
                            r.issues.map((iss, idx) => (
                              <div
                                key={idx}
                                className={`flex items-center gap-1 font-semibold ${
                                  iss.severity === 'error'
                                    ? 'text-danger'
                                    : 'text-amber-700 dark:text-warning'
                                }`}
                              >
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                <span>{iss.message_ar}</span>
                              </div>
                            ))
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {backupMessage && (
          <div className="p-3 rounded-btn bg-info/10 border border-info/30 text-xs font-bold text-primary">
            {backupMessage}
          </div>
        )}
      </section>

      {/* 5. Local Outbox Queue & Immutable Audit Log */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="ds-card p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <div className="flex items-center gap-2 font-bold text-sm text-primary">
              <RefreshCw className="w-4 h-4" />
              <span>طابور التغييرات المحلية بانتظار المزامنة (sync_outbox)</span>
            </div>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-info/15 text-primary">
              {fmt(outboxItems.length)} عملية
            </span>
          </div>
          <div className="space-y-1.5 max-h-60 overflow-y-auto text-xs">
            {outboxItems.slice(0, 25).map((item) => (
              <div
                key={item.mutation_id}
                className="p-2 rounded border border-border bg-background/40 flex items-center justify-between"
              >
                <div>
                  <span className="font-mono font-bold text-primary ml-2">
                    [{item.operation}]
                  </span>
                  <span className="text-text font-medium">{item.entity_table}</span>
                </div>
                <span className="font-mono text-[11px] text-text-muted" dir="ltr">
                  id: {item.mutation_id.slice(0, 8)}...
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="ds-card p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <div className="flex items-center gap-2 font-bold text-sm text-primary">
              <Shield className="w-4 h-4" />
              <span>سجل التدقيق غير القابل للتعديل (audit_log - للقراءة فقط)</span>
            </div>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-success/15 text-success">
              {fmt(auditLogs.length)} سجل
            </span>
          </div>
          <div className="space-y-1.5 max-h-64 overflow-y-auto text-xs">
            {auditLogs.slice(0, 30).map((log) => (
              <div
                key={log.id}
                className="p-2 rounded border border-border bg-background/40 space-y-0.5"
              >
                <div className="flex items-center justify-between font-bold text-text">
                  <span>
                    [{log.action}] {log.summary_ar}
                  </span>
                  <span className="font-mono text-[10px] text-text-muted" dir="ltr">
                    {new Date(log.timestamp).toLocaleTimeString('ar-EG')}
                  </span>
                </div>
                <div className="text-[11px] text-text-muted">
                  بواسطة: {log.actor_name} ({log.actor_role})
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Modal 1: Add or Edit Employee */}
      {isUserModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="ds-card max-w-lg w-full overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 bg-primary text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                <h3 className="font-bold text-base">
                  {editingUser ? 'تعديل بيانات الموظف وكلمة السر' : 'إضافة موظف جديد للمنظومة'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsUserModalOpen(false)}
                className="text-white/80 hover:text-white p-1 rounded hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="p-6 space-y-4 text-xs">
              {userFormError && (
                <div className="p-3 rounded-card bg-danger/10 border border-danger/30 text-danger font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{userFormError}</span>
                </div>
              )}

              {/* Employee Name */}
              <div className="space-y-1">
                <label className="ds-label font-bold">اسم الموظف الكامل *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: محمد إبراهيم حسن"
                  value={userFormData.name}
                  onChange={(e) =>
                    setUserFormData((prev) => ({ ...prev, name: e.target.value }))
                  }
                  className="ds-input text-sm"
                />
              </div>

              {/* Email or Phone */}
              <div className="space-y-1">
                <label className="ds-label font-bold">
                  رقم الهاتف أو البريد الإلكتروني للموظف *
                </label>
                <input
                  type="text"
                  required
                  placeholder="مثال: 01012345678 أو mohamed@mishkat-aid.org"
                  value={userFormData.email_or_phone}
                  onChange={(e) =>
                    setUserFormData((prev) => ({ ...prev, email_or_phone: e.target.value }))
                  }
                  className="ds-input text-sm"
                  dir="ltr"
                />
              </div>

              {/* Role */}
              <div className="space-y-1">
                <label className="ds-label font-bold">الدور الوظيفي والصلاحيات *</label>
                <select
                  value={userFormData.role}
                  onChange={(e) =>
                    setUserFormData((prev) => ({
                      ...prev,
                      role: e.target.value as UserRoleCode,
                    }))
                  }
                  className="ds-input text-sm"
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label} — {r.desc}
                    </option>
                  ))}
                </select>
              </div>

              {/* Local PIN Code */}
              <div className="space-y-1 p-3.5 rounded-card bg-primary/5 border border-primary/20">
                <div className="flex items-center justify-between">
                  <label className="ds-label font-bold text-primary flex items-center gap-1.5 mb-0">
                    <KeyRound className="w-4 h-4" />
                    <span>كلمة السر / رمز المرور المحلي (PIN) *</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleGenerateRandomPin}
                    className="text-[11px] text-primary hover:underline font-bold flex items-center gap-1"
                  >
                    <Dices className="w-3.5 h-3.5" />
                    <span>توليد رمز تلقائي</span>
                  </button>
                </div>

                <div className="relative mt-1.5">
                  <input
                    type={showPinInForm ? 'text' : 'password'}
                    required
                    placeholder="مثال: 1234 أو كود مرور"
                    value={userFormData.pin_code}
                    onChange={(e) =>
                      setUserFormData((prev) => ({ ...prev, pin_code: e.target.value }))
                    }
                    className="ds-input text-sm font-mono pl-10 tracking-wider"
                    dir="ltr"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPinInForm(!showPinInForm)}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text p-1"
                    title={showPinInForm ? 'إخفاء الرمز' : 'إظهار الرمز'}
                  >
                    {showPinInForm ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                <p className="text-[11px] text-text-muted mt-1">
                  كلمة السر هذه تُمنح للموظف محلياً لتسجيل دخوله على أجهزة المنظمة دون الحاجة للإنترنت.
                </p>
              </div>

              {/* Sensitive Health Checkbox */}
              <div className="p-3 rounded-card border border-border bg-background flex items-center gap-2.5">
                <input
                  type="checkbox"
                  id="user_sensitive_health"
                  checked={userFormData.can_view_sensitive_health}
                  onChange={(e) =>
                    setUserFormData((prev) => ({
                      ...prev,
                      can_view_sensitive_health: e.target.checked,
                    }))
                  }
                  className="rounded border-border text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                />
                <label
                  htmlFor="user_sensitive_health"
                  className="font-medium text-text cursor-pointer select-none"
                >
                  السماح بالاطلاع على الحقول والتقارير الطبية والصحية الحساسة للحالات
                </label>
              </div>

              {/* Status */}
              <div className="space-y-1">
                <label className="ds-label font-bold">حالة الحساب *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setUserFormData((prev) => ({ ...prev, status: 'active' }))}
                    className={`p-2.5 rounded border text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                      userFormData.status === 'active'
                        ? 'bg-success/15 border-success text-success'
                        : 'border-border bg-background text-text-muted'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>نشط ومصرّح بالدخول</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setUserFormData((prev) => ({ ...prev, status: 'suspended' }))}
                    className={`p-2.5 rounded border text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                      userFormData.status === 'suspended'
                        ? 'bg-danger/15 border-danger text-danger'
                        : 'border-border bg-background text-text-muted'
                    }`}
                  >
                    <Lock className="w-4 h-4" />
                    <span>مجمّد مؤقتاً</span>
                  </button>
                </div>
              </div>

              {/* Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsUserModalOpen(false)}
                  className="ds-btn ds-btn-secondary text-xs"
                >
                  إلغاء
                </button>
                <button type="submit" className="ds-btn ds-btn-primary text-xs">
                  {editingUser ? 'حفظ التعديلات' : 'إضافة الموظف الآن'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Quick Change Employee PIN */}
      {quickPinUser && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="ds-card max-w-md w-full overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 bg-primary text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <KeyRound className="w-5 h-5" />
                <h3 className="font-bold text-base">تغيير كلمة السر / رمز المرور المحلي</h3>
              </div>
              <button
                type="button"
                onClick={() => setQuickPinUser(null)}
                className="text-white/80 hover:text-white p-1 rounded hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveQuickPin} className="p-6 space-y-4 text-xs">
              <div className="p-3 rounded-card bg-background border border-border">
                <div className="font-bold text-text text-sm">{quickPinUser.name}</div>
                <div className="text-text-muted mt-0.5">
                  الدور: <span className="text-primary font-bold">{quickPinUser.role_label_ar}</span> • {quickPinUser.email_or_phone}
                </div>
              </div>

              {quickPinError && (
                <div className="p-3 rounded-card bg-danger/10 border border-danger/30 text-danger font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{quickPinError}</span>
                </div>
              )}

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="ds-label font-bold mb-0">كلمة السر الجديدة (PIN) *</label>
                  <button
                    type="button"
                    onClick={handleGenerateRandomQuickPin}
                    className="text-[11px] text-primary hover:underline font-bold flex items-center gap-1"
                  >
                    <Dices className="w-3.5 h-3.5" />
                    <span>توليد رمز تلقائي</span>
                  </button>
                </div>

                <div className="relative mt-1.5">
                  <input
                    type={showQuickPin ? 'text' : 'password'}
                    required
                    placeholder="أدخل رمز المرور الجديد"
                    value={newQuickPin}
                    onChange={(e) => setNewQuickPin(e.target.value)}
                    className="ds-input text-base font-mono pl-10 font-bold tracking-widest text-center"
                    dir="ltr"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowQuickPin(!showQuickPin)}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text p-1"
                    title={showQuickPin ? 'إخفاء الرمز' : 'إظهار الرمز'}
                  >
                    {showQuickPin ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                <p className="text-[11px] text-text-muted mt-1">
                  سيكون هذا الرمز هو كلمة السر الجديدة التي يسجل بها الموظف دخوله محلياً.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setQuickPinUser(null)}
                  className="ds-btn ds-btn-secondary text-xs"
                >
                  إلغاء
                </button>
                <button type="submit" className="ds-btn ds-btn-primary text-xs">
                  حفظ كلمة السر الجديدة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 3: Delete Employee Confirmation */}
      {userToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="ds-card max-w-md w-full overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 bg-danger text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trash2 className="w-5 h-5" />
                <h3 className="font-bold text-base">تأكيد حذف حساب الموظف</h3>
              </div>
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                className="text-white/80 hover:text-white p-1 rounded hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              {deleteError && (
                <div className="p-3 rounded-card bg-danger/10 border border-danger/30 text-danger font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{deleteError}</span>
                </div>
              )}

              <p className="text-sm font-semibold text-text leading-relaxed">
                هل أنت متأكد من رغبتك في حذف حساب الموظف التالي نهائياً من قاعدة البيانات المحلية؟
              </p>

              <div className="p-3 rounded-card bg-background border border-border space-y-1">
                <div className="font-bold text-text text-sm">{userToDelete.name}</div>
                <div className="text-text-muted">
                  الدور: <span className="font-bold text-primary">{userToDelete.role_label_ar}</span> • {userToDelete.email_or_phone}
                </div>
                <div className="text-[11px] text-text-muted font-mono" dir="ltr">
                  PIN: {userToDelete.pin_code}
                </div>
              </div>

              <div className="p-3 rounded-card bg-warning/10 border border-warning/30 text-amber-900 dark:text-warning text-[11px] leading-relaxed">
                ⚠️ تنبيه: سيتم حذف بيانات هذا المستخدم نهائياً من هذا الجهاز ولن يتمكن من الدخول مجدداً. ستظل سجلات التدقيق والمتابعات التاريخية مسجلة باسمه لحفظ النزاهة.
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setUserToDelete(null)}
                  className="ds-btn ds-btn-secondary text-xs"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteUser}
                  disabled={userToDelete.id === settings.current_user_id}
                  className="ds-btn ds-btn-danger text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  نعم، حذف الحساب نهائياً
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
