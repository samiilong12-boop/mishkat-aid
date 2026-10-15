import React from 'react';
import {
  Users,
  CalendarCheck,
  PackageCheck,
  LayoutDashboard,
  PlusCircle,
  Menu,
} from 'lucide-react';

export type MobileTab =
  | 'cases'
  | 'followups'
  | 'distributions_projects'
  | 'dashboard'
  | 'more';

interface MobileBottomNavProps {
  activeTab: string;
  onSelectTab: (tabId: any) => void;
  onOpenNewCase: () => void;
  casesCount: number;
  followupsCount: number;
  isReadOnlyRole: boolean;
  onOpenMobileMenu: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  onSelectTab,
  onOpenNewCase,
  casesCount,
  followupsCount,
  isReadOnlyRole,
  onOpenMobileMenu,
}) => {
  return (
    <nav
      aria-label="شريط التنقل السفلي للهواتف"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-lg border-t border-slate-200 dark:border-slate-800 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-1.5"
    >
      <div className="flex items-center justify-around px-2 max-w-lg mx-auto">
        {/* Cases Tab */}
        <button
          type="button"
          onClick={() => onSelectTab('cases')}
          className={`flex flex-col items-center justify-center py-1 px-2 min-w-[56px] transition relative ${
            activeTab === 'cases'
              ? 'text-primary font-bold'
              : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 font-medium'
          }`}
        >
          <div className="relative">
            <Users className="w-5 h-5" />
            {casesCount > 0 && (
              <span className="absolute -top-1.5 -right-2.5 bg-primary text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full min-w-[16px] text-center">
                {casesCount > 99 ? '99+' : casesCount}
              </span>
            )}
          </div>
          <span className="text-[11px] mt-1 leading-tight">الحالات</span>
          {activeTab === 'cases' && (
            <span className="w-4 h-1 bg-primary rounded-full mt-0.5" />
          )}
        </button>

        {/* Followups Tab */}
        <button
          type="button"
          onClick={() => onSelectTab('followups')}
          className={`flex flex-col items-center justify-center py-1 px-2 min-w-[56px] transition relative ${
            activeTab === 'followups'
              ? 'text-primary font-bold'
              : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 font-medium'
          }`}
        >
          <div className="relative">
            <CalendarCheck className="w-5 h-5" />
            {followupsCount > 0 && (
              <span className="absolute -top-1.5 -right-2.5 bg-warning text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full min-w-[16px] text-center">
                {followupsCount > 99 ? '99+' : followupsCount}
              </span>
            )}
          </div>
          <span className="text-[11px] mt-1 leading-tight">المتابعات</span>
          {activeTab === 'followups' && (
            <span className="w-4 h-1 bg-primary rounded-full mt-0.5" />
          )}
        </button>

        {/* Center Floating Quick-Add Action Button */}
        {!isReadOnlyRole && (
          <button
            type="button"
            onClick={onOpenNewCase}
            className="flex flex-col items-center justify-center -mt-5 mx-1 p-2 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/30 active:scale-95 transition"
            title="إضافة حالة جديدة فوراً"
          >
            <PlusCircle className="w-6 h-6" />
            <span className="sr-only">إضافة حالة جديدة</span>
          </button>
        )}

        {/* Distributions Tab */}
        <button
          type="button"
          onClick={() => onSelectTab('distributions_projects')}
          className={`flex flex-col items-center justify-center py-1 px-2 min-w-[56px] transition relative ${
            activeTab === 'distributions_projects'
              ? 'text-primary font-bold'
              : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 font-medium'
          }`}
        >
          <PackageCheck className="w-5 h-5" />
          <span className="text-[11px] mt-1 leading-tight">الصرفيات</span>
          {activeTab === 'distributions_projects' && (
            <span className="w-4 h-1 bg-primary rounded-full mt-0.5" />
          )}
        </button>

        {/* Dashboard Tab */}
        <button
          type="button"
          onClick={() => onSelectTab('dashboard')}
          className={`flex flex-col items-center justify-center py-1 px-2 min-w-[56px] transition relative ${
            activeTab === 'dashboard'
              ? 'text-primary font-bold'
              : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 font-medium'
          }`}
        >
          <LayoutDashboard className="w-5 h-5" />
          <span className="text-[11px] mt-1 leading-tight">المؤشرات</span>
          {activeTab === 'dashboard' && (
            <span className="w-4 h-1 bg-primary rounded-full mt-0.5" />
          )}
        </button>

        {/* More / Menu Drawer */}
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="flex flex-col items-center justify-center py-1 px-2 min-w-[56px] text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 font-medium transition"
        >
          <Menu className="w-5 h-5" />
          <span className="text-[11px] mt-1 leading-tight">المزيد</span>
        </button>
      </div>
    </nav>
  );
};
