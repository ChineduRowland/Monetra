import React, { useCallback, useEffect, useState } from 'react';
import { ClerkProvider, useAuth, useUser } from '@clerk/clerk-react';
import { apiRequest, type RuntimeConfig } from './lib/api.ts';
import {
  ClerkBridgeContextProvider,
  PreviewAuthProvider,
  useMonetraAuth,
} from './lib/authContext.tsx';
import {
  calculateBusinessProfitability,
  calculateCashFlowMetrics,
  calculateNetWorth,
  generateFinancialInsights,
} from './shared/finance.ts';
import {
  CURRENCY_OPTIONS,
  type Profile,
  type Transaction,
  type Workspace,
  type WorkspaceOverviewData,
  type WorkspaceType,
} from './shared/types.ts';
import { AuthScreen } from './components/auth/AuthScreen.tsx';
import { OnboardingFlow } from './components/onboarding/OnboardingFlow.tsx';
import { AppShell, type NavSectionId } from './components/layout/AppShell.tsx';
import { Modal, SkeletonGrid } from './components/ui/Primitives.tsx';
import { TransactionModal } from './components/modals/TransactionModal.tsx';
import { CsvImporterModal } from './components/modals/CsvImporterModal.tsx';
import { OverviewPage } from './pages/OverviewPage.tsx';
import { AccountsPage } from './pages/AccountsPage.tsx';
import { TransactionsPage } from './pages/TransactionsPage.tsx';
import { CashFlowPage } from './pages/CashFlowPage.tsx';
import { NetWorthPage } from './pages/NetWorthPage.tsx';
import { SavingsPage } from './pages/SavingsPage.tsx';
import { BusinessPerformancePage } from './pages/BusinessPerformancePage.tsx';
import { AnalyticsReportsPage } from './pages/AnalyticsReportsPage.tsx';
import { AssistantPage } from './pages/AssistantPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';

function MonetraAuthenticatedShell() {
  const {
    profile,
    workspaces,
    activeWorkspaceId,
    setActiveWorkspaceId,
    getAuthToken,
    refreshMe,
  } = useMonetraAuth();

  const [activeNav, setActiveNav] = useState<NavSectionId>('overview');
  const [overview, setOverview] = useState<WorkspaceOverviewData | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [txModalOpen, setTxModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [newWsModalOpen, setNewWsModalOpen] = useState(false);

  const [wsName, setWsName] = useState('');
  const [wsType, setWsType] = useState<WorkspaceType>('personal');
  const [wsCurrency, setWsCurrency] = useState(profile?.preferred_currency ?? 'NGN');
  const [creatingWs, setCreatingWs] = useState(false);

  const activeWorkspace =
    workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0] ?? null;

  const loadWorkspaceOverview = useCallback(async () => {
    if (!activeWorkspace) return;
    setLoadingOverview(true);
    setLoadError(null);
    try {
      const data = await apiRequest<WorkspaceOverviewData>(
        `/api/workspaces/${activeWorkspace.id}/overview`,
        { getToken: getAuthToken }
      );
      setOverview(data);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Unable to load workspace data');
    } finally {
      setLoadingOverview(false);
    }
  }, [activeWorkspace, getAuthToken]);

  useEffect(() => {
    if (profile && profile.onboarding_completed && activeWorkspace) {
      loadWorkspaceOverview();
    }
  }, [profile, activeWorkspace?.id, loadWorkspaceOverview]);

  if (!profile) {
    return <AuthScreen />;
  }

  if (!profile.onboarding_completed || workspaces.length === 0) {
    return <OnboardingFlow />;
  }

  if (!activeWorkspace) {
    return <SkeletonGrid />;
  }

  const insights = overview
    ? (() => {
        const cashFlow = calculateCashFlowMetrics(overview.transactions);
        const netWorth = calculateNetWorth(
          overview.accounts,
          overview.assets,
          overview.liabilities,
          overview.snapshots
        );
        const businessPnl =
          overview.workspace.type === 'business'
            ? calculateBusinessProfitability(overview.transactions, netWorth.liquidAccountBalances)
            : undefined;
        return generateFinancialInsights({
          workspaceType: overview.workspace.type,
          currency: overview.workspace.currency,
          cashFlow,
          netWorth,
          savingsRatePct: cashFlow.savingsRatePct,
          businessPnl,
          goalsCount: overview.savingsGoals.length,
          transactionsCount: overview.transactions.length,
        });
      })()
    : [];

  async function handleCreateWorkspace(e: React.FormEvent) {
    e.preventDefault();
    setCreatingWs(true);
    try {
      const res = await apiRequest<{ workspace: Workspace }>('/api/workspaces', {
        method: 'POST',
        getToken: getAuthToken,
        body: {
          name: wsName,
          type: wsType,
          currency: wsCurrency,
          country: profile?.country ?? 'Nigeria',
        },
      });
      await refreshMe();
      setActiveWorkspaceId(res.workspace.id);
      setNewWsModalOpen(false);
      setWsName('');
      setActiveNav('overview');
    } finally {
      setCreatingWs(false);
    }
  }

  return (
    <>
      <AppShell
        activeNav={activeNav}
        onSelectNav={setActiveNav}
        activeWorkspace={activeWorkspace}
        insights={insights}
        onOpenNewWorkspace={() => setNewWsModalOpen(true)}
        onQuickAddTransaction={() => {
          setEditingTx(null);
          setTxModalOpen(true);
        }}
      >
        {loadError ? (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 mb-6">
            {loadError}
          </div>
        ) : null}

        {loadingOverview && !overview ? (
          <SkeletonGrid />
        ) : overview ? (
          <>
            {activeNav === 'overview' && (
              <OverviewPage
                overview={overview}
                onNavigate={setActiveNav}
                onOpenAddTransaction={() => {
                  setEditingTx(null);
                  setTxModalOpen(true);
                }}
                onOpenCsvImport={() => setCsvModalOpen(true)}
              />
            )}
            {activeNav === 'accounts' && (
              <AccountsPage overview={overview} onReload={loadWorkspaceOverview} />
            )}
            {activeNav === 'transactions' && (
              <TransactionsPage
                overview={overview}
                onReload={loadWorkspaceOverview}
                onOpenNewTx={() => {
                  setEditingTx(null);
                  setTxModalOpen(true);
                }}
                onEditTx={(tx) => {
                  setEditingTx(tx);
                  setTxModalOpen(true);
                }}
                onOpenCsvImport={() => setCsvModalOpen(true)}
              />
            )}
            {activeNav === 'cashflow' && (
              <CashFlowPage
                overview={overview}
                onOpenNewTx={() => {
                  setEditingTx(null);
                  setTxModalOpen(true);
                }}
              />
            )}
            {activeNav === 'networth' && (
              <NetWorthPage overview={overview} onReload={loadWorkspaceOverview} />
            )}
            {activeNav === 'savings' && (
              <SavingsPage overview={overview} onReload={loadWorkspaceOverview} />
            )}
            {activeNav === 'business' && overview.workspace.type === 'business' && (
              <BusinessPerformancePage
                overview={overview}
                onReload={loadWorkspaceOverview}
                onOpenNewTx={() => {
                  setEditingTx(null);
                  setTxModalOpen(true);
                }}
              />
            )}
            {activeNav === 'analytics' && (
              <AnalyticsReportsPage overview={overview} onReload={loadWorkspaceOverview} />
            )}
            {activeNav === 'assistant' && <AssistantPage overview={overview} />}
            {activeNav === 'settings' && (
              <SettingsPage
                overview={overview}
                onReload={loadWorkspaceOverview}
                onOpenNewWorkspace={() => setNewWsModalOpen(true)}
              />
            )}
          </>
        ) : null}
      </AppShell>

      {overview ? (
        <>
          <TransactionModal
            open={txModalOpen}
            onClose={() => setTxModalOpen(false)}
            workspaceId={overview.workspace.id}
            workspaceType={overview.workspace.type}
            currency={overview.workspace.currency}
            accounts={overview.accounts}
            categories={overview.categories}
            editingTx={editingTx}
            onSaved={loadWorkspaceOverview}
          />
          <CsvImporterModal
            open={csvModalOpen}
            onClose={() => setCsvModalOpen(false)}
            workspaceId={overview.workspace.id}
            currency={overview.workspace.currency}
            accounts={overview.accounts}
            onImported={loadWorkspaceOverview}
          />
        </>
      ) : null}

      <Modal
        open={newWsModalOpen}
        onClose={() => setNewWsModalOpen(false)}
        title="Create Financial Workspace"
        subtitle="Workspaces isolate personal wealth from business operations."
      >
        <form onSubmit={handleCreateWorkspace} className="space-y-4">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-700">Workspace name</label>
            <input
              type="text"
              required
              value={wsName}
              onChange={(e) => setWsName(e.target.value)}
              placeholder="e.g. Side Consultancy or Family Treasury"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">Workspace type</label>
              <select
                value={wsType}
                onChange={(e) => setWsType(e.target.value as WorkspaceType)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="personal">Personal finance</option>
                <option value="business">Business finance</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">Base currency</label>
              <select
                value={wsCurrency}
                onChange={(e) => setWsCurrency(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {CURRENCY_OPTIONS.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setNewWsModalOpen(false)}
              className="px-4 py-2 text-xs bg-slate-100 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creatingWs}
              className="px-4 py-2 text-xs text-white bg-emerald-800 rounded-lg cursor-pointer"
            >
              {creatingWs ? 'Creating...' : 'Create workspace'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

function ClerkAuthAdapter({
  config,
  children,
}: {
  config: RuntimeConfig;
  children: React.ReactNode;
}) {
  const { isLoaded, isSignedIn, getToken, signOut: clerkSignOut } = useAuth();
  const { user } = useUser();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [demoOverrideToken, setDemoOverrideToken] = useState<string | null>(null);

  const getAuthToken = useCallback(async () => {
    if (demoOverrideToken) return demoOverrideToken;
    return await getToken();
  }, [demoOverrideToken, getToken]);

  const setProfileAndWorkspaces = useCallback((p: Profile, ws: Workspace[]) => {
    setProfile(p);
    setWorkspaces(ws);
    setActiveWorkspaceId((prev) => (prev && ws.some((w) => w.id === prev) ? prev : (ws[0]?.id ?? null)));
  }, []);

  const refreshMe = useCallback(async () => {
    const token = await getAuthToken();
    if (!token) return null;
    const res = await apiRequest<{ profile: Profile; workspaces: Workspace[] }>('/api/me', { token });
    setProfileAndWorkspaces(res.profile, res.workspaces);
    return res;
  }, [getAuthToken, setProfileAndWorkspaces]);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn && !demoOverrideToken) {
      setProfile(null);
      setWorkspaces([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    refreshMe()
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isLoaded, isSignedIn, user?.id, demoOverrideToken, refreshMe]);

  return (
    <ClerkBridgeContextProvider
      value={{
        config,
        profile,
        workspaces,
        activeWorkspaceId,
        loading,
        authMode: 'clerk',
        setActiveWorkspaceId,
        refreshMe,
        getAuthToken,
        signInPreview: async () => {},
        registerPreview: async () => {},
        signInDemo: async () => {
          const res = await apiRequest<{ profile: Profile; token: string }>('/api/auth/demo', {
            method: 'POST',
          });
          setDemoOverrideToken(res.token);
        },
        signOut: async () => {
          if (demoOverrideToken) {
            setDemoOverrideToken(null);
            setProfile(null);
            setWorkspaces([]);
          } else {
            await clerkSignOut();
          }
        },
        setProfileAndWorkspaces,
      }}
    >
      {children}
    </ClerkBridgeContextProvider>
  );
}

export default function App() {
  const [config, setConfig] = useState<RuntimeConfig | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<RuntimeConfig>('/api/config')
      .then(setConfig)
      .catch((err) => setBootError(err instanceof Error ? err.message : 'Unable to boot Monetra'));
  }, []);

  if (bootError) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md bg-white border border-rose-200 rounded-xl p-6 text-sm text-rose-800">
          {bootError}
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-sm text-slate-500">
        Loading Monetra...
      </div>
    );
  }

  if (config.authMode === 'clerk' && config.clerkPublishableKey) {
    return (
      <ClerkProvider publishableKey={config.clerkPublishableKey}>
        <ClerkAuthAdapter config={config}>
          <MonetraAuthenticatedShell />
        </ClerkAuthAdapter>
      </ClerkProvider>
    );
  }

  return (
    <PreviewAuthProvider config={config}>
      <MonetraAuthenticatedShell />
    </PreviewAuthProvider>
  );
}
