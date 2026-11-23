import React, { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Briefcase, Save } from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import { useMonetraAuth } from '../lib/authContext.tsx';
import {
  calculateBusinessProfitability,
  calculateNetWorth,
  formatCurrency,
} from '../shared/finance.ts';
import type { WorkspaceOverviewData } from '../shared/types.ts';
import { Card, EmptyState, MetricTile, SectionHeader } from '../components/ui/Primitives.tsx';

export function BusinessPerformancePage({
  overview,
  onReload,
  onOpenNewTx,
}: {
  overview: WorkspaceOverviewData;
  onReload: () => Promise<void>;
  onOpenNewTx: () => void;
}) {
  const { getAuthToken } = useMonetraAuth();
  const { workspace, businessDetails, accounts, transactions, assets, liabilities, snapshots } = overview;
  const currency = workspace.currency;

  const netWorth = calculateNetWorth(accounts, assets, liabilities, snapshots);
  const pnl = calculateBusinessProfitability(transactions, netWorth.liquidAccountBalances);

  const [legalName, setLegalName] = useState(businessDetails?.legal_name ?? workspace.name);
  const [industry, setIndustry] = useState(businessDetails?.industry ?? '');
  const [regNo, setRegNo] = useState(businessDetails?.registration_number ?? '');
  const [taxId, setTaxId] = useState(businessDetails?.tax_id ?? '');
  const [monthlyTarget, setMonthlyTarget] = useState(String(businessDetails?.monthly_revenue_target ?? 0));
  const [savingBiz, setSavingBiz] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  async function handleSaveBusinessProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingBiz(true);
    setSavedNotice(false);
    try {
      await apiRequest(`/api/workspaces/${workspace.id}/business-details`, {
        method: 'PATCH',
        getToken: getAuthToken,
        body: {
          legal_name: legalName,
          industry,
          registration_number: regNo,
          tax_id: taxId,
          monthly_revenue_target: Number(monthlyTarget || 0),
        },
      });
      await onReload();
      setSavedNotice(true);
    } finally {
      setSavingBiz(false);
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Business Performance & P&L"
        subtitle={`${businessDetails?.legal_name || workspace.name} · Owner equity injections & draws are strictly separated from operating profit`}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricTile
          label="Operating Revenue"
          value={formatCurrency(pnl.operatingRevenue, currency)}
          subtext="Excludes founder equity"
          tone="positive"
        />
        <MetricTile
          label="Operating Expenses"
          value={formatCurrency(pnl.operatingExpenses, currency)}
          subtext={`Monthly burn: ${formatCurrency(pnl.burnRateMonthly, currency, { compact: true })}`}
          tone="negative"
        />
        <MetricTile
          label="Net Operating Profit"
          value={formatCurrency(pnl.netProfit, currency, { signed: true })}
          subtext={`Margin: ${pnl.profitMarginPct}%`}
          tone={pnl.netProfit >= 0 ? 'positive' : 'negative'}
        />
        <MetricTile
          label="Owner Capital / Draws"
          value={formatCurrency(pnl.ownerCapitalInjected, currency)}
          subtext={`Owner draws: ${formatCurrency(pnl.ownerDraws, currency, { compact: true })}`}
        />
      </div>

      {pnl.monthlyPnL.length === 0 ? (
        <EmptyState
          icon={<Briefcase className="w-5 h-5" />}
          title="No operating transactions recorded"
          description="Record business revenue invoices, supplier costs, payroll, or equity entries to populate P&L analytics."
          actionLabel="Record business entry"
          onAction={onOpenNewTx}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 p-6 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Monthly Operating P&amp;L</h3>
              <p className="text-xs text-slate-500">Operating revenue vs. expenses by period</p>
            </div>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pnl.monthlyPnL}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#64748B' }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => formatCurrency(Number(v), currency, { compact: true })}
                  />
                  <Tooltip formatter={(val) => formatCurrency(Number(val ?? 0), currency)} />
                  <Bar dataKey="revenue" name="Operating Revenue" fill="#065F46" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expenses" name="Operating Expenses" fill="#94A3B8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="p-6 space-y-4">
            <h3 className="text-sm font-semibold text-slate-900">Liquidity &amp; Cost Signals</h3>
            <div className="space-y-3 text-xs">
              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 flex justify-between">
                <span className="text-slate-600">Business Liquid Cash</span>
                <span className="font-mono font-semibold text-slate-900">
                  {formatCurrency(netWorth.liquidAccountBalances, currency)}
                </span>
              </div>
              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 flex justify-between">
                <span className="text-slate-600">Estimated Runway</span>
                <span className="font-mono font-semibold text-slate-900">
                  {pnl.runwayMonths !== null ? `${pnl.runwayMonths} months` : 'Cashflow positive'}
                </span>
              </div>
              {pnl.topExpenseCategory ? (
                <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 flex justify-between">
                  <span className="text-slate-600">Top Cost Driver</span>
                  <span className="font-mono font-semibold text-slate-900">
                    {pnl.topExpenseCategory.category} ({formatCurrency(pnl.topExpenseCategory.amount, currency, { compact: true })})
                  </span>
                </div>
              ) : null}
              {Number(monthlyTarget) > 0 ? (
                <div className="p-3.5 rounded-lg bg-emerald-50/70 border border-emerald-200 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-emerald-900">Monthly Revenue Target</span>
                    <span className="font-mono font-semibold text-emerald-900">
                      {formatCurrency(Number(monthlyTarget), currency)}
                    </span>
                  </div>
                  <div className="text-[11px] text-emerald-800">
                    Latest month:{' '}
                    {formatCurrency(pnl.monthlyPnL[pnl.monthlyPnL.length - 1]?.revenue ?? 0, currency)}
                  </div>
                </div>
              ) : null}
            </div>
          </Card>
        </div>
      )}

      {/* Business Entity Metadata Form */}
      <Card className="p-6">
        <form onSubmit={handleSaveBusinessProfile} className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Corporate Profile &amp; Targets</h3>
              <p className="text-xs text-slate-500">RC number, TIN, industry, and monthly revenue benchmark</p>
            </div>
            {savedNotice ? (
              <span className="text-xs text-emerald-700 font-medium">Saved</span>
            ) : null}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">Legal Entity Name</label>
              <input
                type="text"
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">Industry</label>
              <input
                type="text"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">Registration (RC)</label>
              <input
                type="text"
                value={regNo}
                onChange={(e) => setRegNo(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">Tax ID (TIN)</label>
              <input
                type="text"
                value={taxId}
                onChange={(e) => setTaxId(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">Monthly Target ({currency})</label>
              <input
                type="number"
                min="0"
                value={monthlyTarget}
                onChange={(e) => setMonthlyTarget(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingBiz}
              className="px-4 py-2 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-white rounded-lg flex items-center gap-1.5 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{savingBiz ? 'Saving...' : 'Save corporate profile'}</span>
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
