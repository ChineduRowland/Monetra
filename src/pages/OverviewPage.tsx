import React from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowUpRight,
  FileSpreadsheet,
  Landmark,
  PiggyBank,
  Plus,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import {
  calculateBusinessProfitability,
  calculateCashFlowMetrics,
  calculateNetWorth,
  calculateSavingsMetrics,
  formatCurrency,
  generateFinancialInsights,
} from '../shared/finance.ts';
import type { WorkspaceOverviewData } from '../shared/types.ts';
import type { NavSectionId } from '../components/layout/AppShell.tsx';
import { Card, EmptyState, MetricTile, SectionHeader } from '../components/ui/Primitives.tsx';

const CHART_COLORS = ['#065F46', '#0F172A', '#0284C7', '#D97706', '#64748B', '#94A3B8'];

export function OverviewPage({
  overview,
  onNavigate,
  onOpenAddTransaction,
  onOpenCsvImport,
}: {
  overview: WorkspaceOverviewData;
  onNavigate: (nav: NavSectionId) => void;
  onOpenAddTransaction: () => void;
  onOpenCsvImport: () => void;
}) {
  const { workspace, accounts, transactions, assets, liabilities, savingsGoals, snapshots } = overview;
  const currency = workspace.currency;

  const cashFlow = calculateCashFlowMetrics(transactions);
  const netWorth = calculateNetWorth(accounts, assets, liabilities, snapshots);
  const savings = calculateSavingsMetrics(savingsGoals);
  const businessPnl =
    workspace.type === 'business'
      ? calculateBusinessProfitability(transactions, netWorth.liquidAccountBalances)
      : undefined;

  const insights = generateFinancialInsights({
    workspaceType: workspace.type,
    currency,
    cashFlow,
    netWorth,
    savingsRatePct: cashFlow.savingsRatePct,
    businessPnl,
    goalsCount: savingsGoals.length,
    transactionsCount: transactions.length,
  });

  const activeAccountCount = accounts.filter((a) => a.status === 'active').length;
  const recentTxs = transactions.slice(0, 6);
  const accountMap = new Map(accounts.map((a) => [a.id, a.name]));

  if (accounts.length === 0 && transactions.length === 0 && assets.length === 0) {
    return (
      <div className="space-y-6">
        <SectionHeader
          title={`${workspace.name} Overview`}
          subtitle="Start by connecting or creating your first financial account, then record entries or import a bank CSV."
        />
        <EmptyState
          icon={<Wallet className="w-5 h-5" />}
          title="Your workspace ledger is ready"
          description="All metrics on Monetra are computed from real database records. Add a bank, cash, savings, or business account to begin tracking balances, cash flow, and net worth."
          actionLabel="Create your first account"
          onAction={() => onNavigate('accounts')}
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              title: '1. Add Accounts',
              detail: 'Create savings, current, cash, investment, or business operating accounts with opening balances.',
              action: 'Open Accounts',
              nav: 'accounts' as const,
            },
            {
              title: '2. Record or Import Ledger',
              detail: 'Enter income, expenses, or transfers manually, or import a bank statement CSV with duplicate protection.',
              action: 'Open Transactions',
              nav: 'transactions' as const,
            },
            {
              title: '3. Track Wealth & Goals',
              detail: 'Add real estate, equipment, investments, liabilities, and dedicated savings targets.',
              action: 'Open Net Worth',
              nav: 'networth' as const,
            },
          ].map((step) => (
            <Card key={step.title} className="p-5 flex flex-col justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">{step.title}</h3>
                <p className="text-xs text-slate-500 mt-1">{step.detail}</p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate(step.nav)}
                className="text-xs font-medium text-emerald-800 hover:underline self-start cursor-pointer"
              >
                {step.action} &rarr;
              </button>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Financial Overview"
        subtitle={`${workspace.type === 'business' ? 'Business' : 'Personal'} intelligence summary · ${activeAccountCount} active accounts · Currency ${currency}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onOpenCsvImport}
              className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Import CSV</span>
            </button>
            <button
              type="button"
              onClick={onOpenAddTransaction}
              className="px-3.5 py-2 text-xs font-medium text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add transaction</span>
            </button>
          </div>
        }
      />

      {/* 8 Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricTile
          label="Total Account Balance"
          value={formatCurrency(netWorth.liquidAccountBalances, currency)}
          subtext={`${activeAccountCount} active accounts`}
        />
        <MetricTile
          label="Total Income"
          value={formatCurrency(cashFlow.totalIncome, currency)}
          subtext="Recorded inflows"
          tone="positive"
        />
        <MetricTile
          label="Total Expenses"
          value={formatCurrency(cashFlow.totalExpenses, currency)}
          subtext="Recorded outflows"
          tone="negative"
        />
        <MetricTile
          label="Net Cash Flow"
          value={formatCurrency(cashFlow.netCashFlow, currency, { signed: true })}
          subtext={`${cashFlow.savingsRatePct}% retention rate`}
          tone={cashFlow.netCashFlow >= 0 ? 'positive' : 'negative'}
        />
        <MetricTile
          label="Total Assets"
          value={formatCurrency(netWorth.totalAssets, currency)}
          subtext={`Tracked assets: ${formatCurrency(netWorth.trackedAssetsTotal, currency, { compact: true })}`}
        />
        <MetricTile
          label="Total Liabilities"
          value={formatCurrency(netWorth.totalLiabilities, currency)}
          subtext={`${netWorth.debtToAssetRatioPct}% debt-to-asset`}
        />
        <MetricTile
          label="Net Worth"
          value={formatCurrency(netWorth.netWorth, currency)}
          subtext="Assets minus liabilities"
          tone={netWorth.netWorth >= 0 ? 'positive' : 'negative'}
        />
        <MetricTile
          label="Savings Progress"
          value={`${savings.overallProgressPct}%`}
          subtext={`${formatCurrency(savings.totalSaved, currency, { compact: true })} of ${formatCurrency(savings.totalTarget, currency, { compact: true })}`}
        />
      </div>

      {/* Quick Actions Strip */}
      <Card className="p-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs font-semibold text-slate-700">Quick Actions</span>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenAddTransaction}
            className="px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg cursor-pointer whitespace-nowrap"
          >
            + Add transaction
          </button>
          <button
            type="button"
            onClick={() => onNavigate('accounts')}
            className="px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg cursor-pointer whitespace-nowrap"
          >
            + Add account
          </button>
          <button
            type="button"
            onClick={onOpenCsvImport}
            className="px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg cursor-pointer whitespace-nowrap"
          >
            Import statement
          </button>
          <button
            type="button"
            onClick={() => onNavigate('networth')}
            className="px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg cursor-pointer whitespace-nowrap"
          >
            + Add asset / liability
          </button>
          <button
            type="button"
            onClick={() => onNavigate('savings')}
            className="px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg cursor-pointer whitespace-nowrap"
          >
            + Create savings goal
          </button>
        </div>
      </Card>

      {/* Main Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Cash Flow (Income vs. Expenses)</h3>
              <p className="text-xs text-slate-500">Monthly cash movement across workspace accounts</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('cashflow')}
              className="text-xs font-medium text-emerald-800 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>Deep dive</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="h-72 w-full">
            {cashFlow.monthlySeries.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                Record income or expense transactions to chart cash flow.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cashFlow.monthlySeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#64748B' }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => formatCurrency(Number(v), currency, { compact: true })}
                  />
                  <Tooltip
                    formatter={(val) => formatCurrency(Number(val ?? 0), currency)}
                    contentStyle={{ borderRadius: '8px', borderColor: '#E2E8F0', fontSize: '12px' }}
                  />
                  <Bar dataKey="inflows" name="Income" fill="#065F46" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="outflows" name="Expenses" fill="#94A3B8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card className="p-6 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Spending Breakdown</h3>
            <p className="text-xs text-slate-500">Expense share by category</p>
          </div>
          {cashFlow.spendingByCategory.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-xs text-slate-400">
              No expense categories recorded yet.
            </div>
          ) : (
            <>
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={cashFlow.spendingByCategory.slice(0, 6)}
                      dataKey="amount"
                      nameKey="category"
                      innerRadius={45}
                      outerRadius={72}
                      paddingAngle={2}
                    >
                      {cashFlow.spendingByCategory.slice(0, 6).map((_, idx) => (
                        <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(val) => formatCurrency(Number(val ?? 0), currency)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                {cashFlow.spendingByCategory.slice(0, 5).map((cat, idx) => (
                  <div key={cat.category} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
                      />
                      <span className="text-slate-700 truncate">{cat.category}</span>
                    </div>
                    <span className="font-mono tabular-nums text-slate-900 shrink-0">
                      {cat.sharePct}% · {formatCurrency(cat.amount, currency, { compact: true })}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>

      {/* Net Worth Trajectory + Financial Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Net Worth Position</h3>
              <p className="text-xs text-slate-500">Historical snapshots combined with live balance valuation</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('networth')}
              className="text-xs font-medium text-emerald-800 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>Manage assets</span>
              <Landmark className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={netWorth.timeline} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#065F46" stopOpacity={0.22} />
                    <stop offset="95%" stopColor="#065F46" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#64748B' }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 11, fill: '#64748B' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => formatCurrency(Number(v), currency, { compact: true })}
                />
                <Tooltip formatter={(val) => formatCurrency(Number(val ?? 0), currency)} />
                <Area
                  type="monotone"
                  dataKey="netWorth"
                  name="Net Worth"
                  stroke="#065F46"
                  strokeWidth={2}
                  fill="url(#nwGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Financial Insights</h3>
            <button
              type="button"
              onClick={() => onNavigate('assistant')}
              className="text-xs font-medium text-emerald-800 hover:underline cursor-pointer"
            >
              Ask AI Advisor
            </button>
          </div>
          <div className="space-y-3">
            {insights.map((ins) => (
              <div key={ins.id} className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
                  {ins.severity === 'positive' ? (
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                  ) : ins.severity === 'caution' ? (
                    <TrendingDown className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                  ) : (
                    <PiggyBank className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  )}
                  <span>{ins.title}</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">{ins.detail}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Recent Transactions */}
      <Card className="overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Recent Transactions</h3>
            <p className="text-xs text-slate-500">Latest ledger movements across your accounts</p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('transactions')}
            className="text-xs font-medium text-emerald-800 hover:underline cursor-pointer"
          >
            View all transactions
          </button>
        </div>
        {recentTxs.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No transactions recorded yet. Click "Add transaction" to record your first entry.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-6 font-medium">Date</th>
                  <th className="py-3 px-4 font-medium">Description</th>
                  <th className="py-3 px-4 font-medium">Category</th>
                  <th className="py-3 px-4 font-medium">Account</th>
                  <th className="py-3 px-6 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentTxs.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-6 font-mono text-slate-600 whitespace-nowrap">{tx.tx_date}</td>
                    <td className="py-3 px-4 font-medium text-slate-900 max-w-[260px] truncate">
                      {tx.description}
                    </td>
                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap">{tx.category}</td>
                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                      {accountMap.get(tx.account_id) ?? 'Account'}
                    </td>
                    <td
                      className={`py-3 px-6 text-right font-mono tabular-nums font-medium whitespace-nowrap ${
                        tx.type === 'income'
                          ? 'text-emerald-700'
                          : tx.type === 'expense'
                            ? 'text-slate-900'
                            : 'text-sky-700'
                      }`}
                    >
                      {tx.type === 'transfer'
                        ? formatCurrency(tx.amount, tx.currency)
                        : formatCurrency(tx.type === 'expense' ? -tx.amount : tx.amount, tx.currency, {
                            signed: true,
                          })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
