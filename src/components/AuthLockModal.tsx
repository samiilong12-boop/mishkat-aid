import React, { useState } from 'react';
import {
  Lock,
  ShieldAlert,
  KeyRound,
  UserCheck,
  WifiOff,
  CheckCircle2,
} from 'lucide-react';
import { AppSettings, TrustedDevice, UserAccount } from '../types/models';
import { logAuditAction } from '../db/database';

interface AuthLockModalProps {
  users: UserAccount[];
  devices: TrustedDevice[];
  settings: AppSettings;
  isLocked: boolean;
  onUnlockAndSwitchUser: (user: UserAccount, deviceCode: string) => Promise<void>;
}

export const AuthLockModal: React.FC<AuthLockModalProps> = ({
  users,
  devices,
  settings,
  isLocked,
  onUnlockAndSwitchUser,
}) => {
  const [selectedUserId, setSelectedUserId] = useState(settings.current_user_id);
  const [selectedDeviceCode, setSelectedDeviceCode] = useState(settings.device_code || 'D1');
  const [pinInput, setPinInput] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isLocked) return null;

  const selectedUser = users.find((u) => u.id === selectedUserId) || users[0];
  const selectedDevice = devices.find((d) => d.device_code === selectedDeviceCode);
  const isDeviceRevoked = selectedDevice?.status === 'revoked';

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (isDeviceRevoked) {
      setErrorMsg(
        `الجهاز (${selectedDeviceCode}) تم إلغاء اعتماده وإبطال جلساته من الإدارة (${
          selectedDevice?.revoked_reason || 'جهاز مفقود'
        }). لا يمكن تسجيل الدخول من هذا الجهاز.`
      );
      return;
    }

    if (!selectedUser || selectedUser.status === 'suspended') {
      setErrorMsg('هذا الحساب موقوف حالياً من قِبل مدير النظام.');
      return;
    }

    if (pinInput.trim() && pinInput.trim() !== selectedUser.pin_code) {
      setErrorMsg(
        `رمز المرور المحلي غير صحيح (للتجربة استخدم الرمز: ${selectedUser.pin_code} أو اترك الحقل فارغاً للتبديل السريع).`
      );
      return;
    }

    await onUnlockAndSwitchUser(selectedUser, selectedDeviceCode);
    await logAuditAction({
      action: 'LOGIN',
      entity_type: 'user',
      entity_id: selectedUser.id,
      summary_ar: `تسجيل دخول (${selectedUser.name}) بدور [${selectedUser.role_label_ar}] من الجهاز المعتَمَد (${selectedDeviceCode})`,
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="ds-card max-w-lg w-full overflow-hidden">
        <div className="p-6 bg-primary text-white space-y-1">
          <div className="flex items-center justify-between">
            <div className="inline-flex items-center gap-2 text-xs bg-white/15 px-3 py-1 rounded-full">
              <Lock className="w-3.5 h-3.5" />
              <span>قفل الجلسة الآمن والمصادقة الهجينة (أونلاين / أوفلاين)</span>
            </div>
            {!settings.simulated_network_online && (
              <span className="inline-flex items-center gap-1 text-xs bg-warning text-slate-900 font-bold px-2.5 py-0.5 rounded-full">
                <WifiOff className="w-3 h-3" />
                دخول أوفلاين لجهاز معتمد
              </span>
            )}
          </div>
          <h2 className="text-xl font-bold pt-1">{settings.org_name}</h2>
          <p className="text-xs text-white/80">
            اختر الحساب والجهاز الميداني لتسجيل الدخول أو فتح قفل الجلسة بعد الخمول
          </p>
        </div>

        <form onSubmit={handleLogin} className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3.5 rounded-card bg-danger/10 border border-danger text-danger text-xs font-bold flex items-start gap-2">
              <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <label className="ds-label">1. اختر حساب المستخدم والدور الوظيفي (القسم 6)</label>
            <select
              value={selectedUserId}
              onChange={(e) => {
                setSelectedUserId(e.target.value);
                setErrorMsg(null);
              }}
              className="ds-input font-semibold text-sm"
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} — [{u.role_label_ar}] {u.status === 'suspended' ? '(موقوف)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="ds-label">
              2. الجهاز الميداني الحالي (لاختبار تعدد الأجهزة وإبطال جهاز مفقود)
            </label>
            <select
              value={selectedDeviceCode}
              onChange={(e) => {
                setSelectedDeviceCode(e.target.value);
                setErrorMsg(null);
              }}
              className="ds-input font-semibold text-sm"
            >
              {devices.map((d) => (
                <option key={d.device_code} value={d.device_code}>
                  {d.device_code} — {d.device_name}{' '}
                  {d.status === 'revoked' ? '🚫 [ملغى اعتماده - مفقود]' : '✓ [معتمد]'}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="ds-label">
              3. كلمة المرور / رمز PIN للدخول دون اتصال (اختياري للتجربة السريعة: {selectedUser?.pin_code})
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-text-muted absolute right-3.5 top-3.5" />
              <input
                type="password"
                dir="ltr"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder={`الرمز الافتراضي لهذا الحساب: ${selectedUser?.pin_code}`}
                className="ds-input pr-10 font-mono text-left text-sm"
              />
            </div>
          </div>

          {/* Role Permissions Summary Box */}
          {selectedUser && (
            <div className="p-3 rounded-card bg-background border border-border text-xs space-y-1">
              <div className="font-bold text-primary flex items-center gap-1.5">
                <UserCheck className="w-4 h-4" />
                <span>صلاحيات الدور المختار ({selectedUser.role_label_ar}):</span>
              </div>
              <p className="text-text-muted">
                {selectedUser.role === 'admin' &&
                  'كامل الصلاحيات: إدارة المستخدمين، الأجهزة، القوائم، حل التعارضات، الدمج، التصدير، وسجل التدقيق.'}
                {selectedUser.role === 'case_worker' &&
                  'إضافة وتعديل الحالات والمتابعات، رؤية البيانات الصحية الحساسة، واعتماد حالات الباحثين الآخرين (مبدأ العينين الأربعة).'}
                {selectedUser.role === 'data_entry' &&
                  'إضافة وتعديل محدود للحالات، مع حجب الحقول الصحية الحساسة ومنع الحذف والتصدير.'}
                {selectedUser.role === 'internal_auditor' &&
                  'صلاحية قراءة ومراجعة فقط لكافة البطاقات وسجل التدقيق دون تعديل أو حذف.'}
                {selectedUser.role === 'donor' &&
                  'عزل تام (Zero-PII): يرى فقط مؤشرات الأثر المجمّعة والمجهولة لبوابة الداعمين ولا يمكنه الوصول لبيانات المستفيدين الشخصية.'}
              </p>
            </div>
          )}

          <button
            type="submit"
            className="ds-btn ds-btn-primary w-full text-sm font-bold"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>فتح الجلسة والدخول بهذا الحساب</span>
          </button>
        </form>
      </div>
    </div>
  );
};
