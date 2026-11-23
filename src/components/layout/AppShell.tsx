import React, { useState } from 'react';
import {
  ArrowLeftRight,
  BarChart3,
  Bell,
  Briefcase,
  Building2,
  ChevronDown,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  PiggyBank,
  Plus,
  Settings,
  Sparkles,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react';
import { useMonetraAuth } from '../../lib/authContext.tsx';
import type { FinancialInsight, Workspace } from '../../shared/types.ts';

export type NavSectionId =
  | 'overview'
  | 'accounts'
  | 'transactions'
  | 'cashflow'
  | 'networth'
  | 'savings'
  | 'business'
  | 'analytics'
  | 'assistant'
  | 'settings';

interface NavItem {
  id: NavSectionId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  businessOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'accounts', label: 'Accounts', icon: Wallet },
  { id: 'transactions', label: 'Transactions', icon: ArrowLeftRight },
  { id: 'cashflow', label: 'Cash Flow', icon: TrendingUp },
  { id: 'networth', label: 'Net Worth', icon: Landmark },
  { id: 'savings', label: 'Savings Goals', icon: PiggyBank },
  { id: 'business', label: 'Business Performance', icon: Briefcase, businessOnly: true },
  { id: 'analytics', label: 'Analytics & Reports', icon: BarChart3 },
  { id: 'assistant', label: 'AI Financial Assistant', icon: Sparkles },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function AppShell({
  activeNav,
  onSelectNav,
  activeWorkspace,
  insights,
  onOpenNewWorkspace,
  onQuickAddTransaction,
  children,
}: {
  activeNav: NavSectionId;
  onSelectNav: (nav: NavSectionId) => void;
  activeWorkspace: Workspace;
  insights: FinancialInsight[];
  onOpenNewWorkspace: () => void;
  onQuickAddTransaction: () => void;
  children: React.ReactNode;
}) {
  const { profile, workspaces, setActiveWorkspaceId, signOut } = useMonetraAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [wsDropdownOpen, setWsDropdownOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  const visibleNavItems = NAV_ITEMS.filter(
    (item) => !item.businessOnly || activeWorkspace.type === 'business'
  );
  const mobilePrimaryItems = visibleNavItems.slice(0, 4);
  const currentNavLabel = visibleNavItems.find((n) => n.id === activeNav)?.label ?? 'Overview';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:flex flex-col bg-white border-r border-slate-200 transition-all duration-150 shrink-0 no-print ${
          collapsed ? 'w-[74px]' : 'w-[252px]'
        }`}
      >
        <div className="h-16 px-4 border-b border-slate-200 flex items-center justify-between gap-2">
          {!collapsed ? (
            <span className="text-lg font-bold tracking-tight font-display text-slate-900 whitespace-nowrap">
              Monetra
            </span>
          ) : (
            <span className="text-base font-bold font-display text-emerald-800 mx-auto">M</span>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg cursor-pointer"
          >
            {collapsed ? (
              <PanelLeftOpen className="w-4 h-4" />
            ) : (
              <PanelLeftClose className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Workspace Switcher in Sidebar */}
        <div className="p-3 border-b border-slate-200 relative">
          <button
            type="button"
            onClick={() => setWsDropdownOpen((o) => !o)}
            className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-left transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-md bg-emerald-800 text-white flex items-center justify-center shrink-0">
                <Building2 className="w-3.5 h-3.5" />
              </div>
              {!collapsed ? (
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-900 truncate">
                    {activeWorkspace.name}
                  </div>
                  <div className="text-[11px] text-slate-500 capitalize">
                    {activeWorkspace.type} · {activeWorkspace.currency}
                  </div>
                </div>
              ) : null}
            </div>
            {!collapsed ? <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" /> : null}
          </button>

          {wsDropdownOpen ? (
            <div className="absolute left-3 right-3 top-[calc(100%+4px)] z-40 bg-white border border-slate-200 rounded-xl shadow-lg p-1.5 space-y-1">
              {workspaces.map((ws) => (
                <button
                  key={ws.id}
                  type="button"
                  onClick={() => {
                    setActiveWorkspaceId(ws.id);
                    setWsDropdownOpen(false);
                    if (activeNav === 'business' && ws.type !== 'business') {
                      onSelectNav('overview');
                    }
                  }}
                  className={`w-full text-left px-2.5 py-2 rounded-lg text-xs transition-colors cursor-pointer ${
                    ws.id === activeWorkspace.id
                      ? 'bg-emerald-50 text-emerald-950 font-semibold'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="truncate">{ws.name}</div>
                  <div className="text-[11px] text-slate-500 capitalize">
                    {ws.type} · {ws.currency}
                  </div>
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setWsDropdownOpen(false);
                  onOpenNewWorkspace();
                }}
                className="w-full flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium text-emerald-800 hover:bg-emerald-50 border-t border-slate-100 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New workspace</span>
              </button>
            </div>
          ) : null}
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const active = activeNav === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectNav(item.id)}
                title={collapsed ? item.label : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {!collapsed ? <span className="truncate">{item.label}</span> : null}
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-200">
          <button
            type="button"
            onClick={signOut}
            className="w-full flex items-center gap-3 px-3 py-2 text-xs font-medium text-slate-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!collapsed ? <span>Sign out</span> : null}
          </button>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar */}
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between gap-4 sticky top-0 z-30 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileDrawerOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="font-semibold text-slate-900 truncate max-w-[160px] sm:max-w-xs">
                {activeWorkspace.name}
              </span>
              <span className="text-slate-300" aria-hidden="true">/</span>
              <span className="text-slate-600 truncate">{currentNavLabel}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0 relative">
            <button
              type="button"
              onClick={onQuickAddTransaction}
              className="px-3.5 py-2 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add transaction</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setNotifOpen((v) => !v);
                setProfileMenuOpen(false);
              }}
              aria-label="Financial insights notifications"
              className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg relative cursor-pointer"
            >
              <Bell className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => {
                setProfileMenuOpen((v) => !v);
                setNotifOpen(false);
              }}
              className="flex items-center gap-2 pl-2 pr-2.5 py-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            >
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.display_name}
                  referrerPolicy="no-referrer"
                  className="w-7 h-7 rounded-full object-cover border border-slate-200"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-slate-900 text-white text-xs font-semibold flex items-center justify-center">
                  {(profile?.display_name || 'M').slice(0, 1).toUpperCase()}
                </div>
              )}
              <span className="hidden sm:inline text-xs font-medium text-slate-700 max-w-[120px] truncate">
                {profile?.display_name}
              </span>
            </button>

            {notifOpen ? (
              <div className="absolute right-0 top-[calc(100%+8px)] w-80 bg-white border border-slate-200 rounded-xl shadow-xl p-4 z-40 space-y-3">
                <div className="text-xs font-semibold text-slate-900">
                  Workspace Financial Signals
                </div>
                <div className="space-y-2.5">
                  {insights.map((ins) => (
                    <div key={ins.id} className="text-xs border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                      <div className="font-medium text-slate-800">{ins.title}</div>
                      <div className="text-slate-500 mt-0.5">{ins.detail}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {profileMenuOpen ? (
              <div className="absolute right-0 top-[calc(100%+8px)] w-60 bg-white border border-slate-200 rounded-xl shadow-xl p-2 z-40 space-y-1">
                <div className="px-3 py-2 border-b border-slate-100">
                  <div className="text-xs font-semibold text-slate-900 truncate">
                    {profile?.display_name}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">{profile?.email}</div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setProfileMenuOpen(false);
                    onSelectNav('settings');
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 rounded-lg cursor-pointer"
                >
                  Profile &amp; Workspace Settings
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setProfileMenuOpen(false);
                    onOpenNewWorkspace();
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 rounded-lg cursor-pointer"
                >
                  Create Workspace
                </button>
                <button
                  type="button"
                  onClick={signOut}
                  className="w-full text-left px-3 py-2 text-xs text-rose-700 hover:bg-rose-50 rounded-lg cursor-pointer"
                >
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </header>

        {/* Page Viewport */}
        <main className="flex-1 p-4 sm:p-8 pb-24 lg:pb-10 max-w-[1380px] w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Mobile Secondary Drawer */}
      {mobileDrawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/40"
            onClick={() => setMobileDrawerOpen(false)}
          />
          <div className="relative w-72 bg-white h-full border-r border-slate-200 p-4 flex flex-col justify-between z-10">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold font-display">Monetra</span>
                <button
                  type="button"
                  onClick={() => setMobileDrawerOpen(false)}
                  className="p-2 text-slate-500"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-1">
                <div className="text-[11px] font-medium text-slate-500 px-1">Workspaces</div>
                {workspaces.map((ws) => (
                  <button
                    key={ws.id}
                    type="button"
                    onClick={() => {
                      setActiveWorkspaceId(ws.id);
                      setMobileDrawerOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium ${
                      ws.id === activeWorkspace.id
                        ? 'bg-emerald-50 text-emerald-900'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {ws.name} ({ws.type})
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setMobileDrawerOpen(false);
                    onOpenNewWorkspace();
                  }}
                  className="w-full text-left px-3 py-2 text-xs font-medium text-emerald-800"
                >
                  + Add workspace
                </button>
              </div>

              <nav className="space-y-1 border-t border-slate-100 pt-3">
                {visibleNavItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onSelectNav(item.id);
                        setMobileDrawerOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium ${
                        activeNav === item.id
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>

            <button
              type="button"
              onClick={signOut}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-rose-700 hover:bg-rose-50 rounded-lg"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      ) : null}

      {/* Mobile Bottom Navigation */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-slate-200 px-2 flex items-center justify-around z-30 no-print">
        {mobilePrimaryItems.map((item) => {
          const Icon = item.icon;
          const active = activeNav === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectNav(item.id)}
              className={`flex flex-col items-center justify-center gap-1 min-w-[64px] py-1.5 text-[11px] font-medium ${
                active ? 'text-emerald-800' : 'text-slate-500'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="truncate max-w-[70px]">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
