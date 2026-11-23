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
import { TrendingUp } from 'lucide-react';
import { calculateCashFlowMetrics, formatCurrency } from '../shared/finance.ts';
import type { WorkspaceOverviewData } from '../shared/types.ts';
import { Card, EmptyState, MetricTile, SectionHeader } from '../components/ui/Primitives.tsx';

export function CashFlowPage({
  overview,
  onOpenNewTx,
}: {
  overview: WorkspaceOverviewData;
  onOpenNewTx: () => void;
}) {
  const { workspace, transactions } = overview;
  const currency = workspace.currency;
  const cashFlow = calculateCashFlowMetrics(transactions);
  const [granularity, setGranularity] = useState<'monthly' | 'weekly'>('monthly');

  const chartSeries: Array<{ label: string; inflows: number; outflows: number; net: number }> =
    granularity === 'monthly' ? cashFlow.monthlySeries : cashFlow.weeklySeries;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Cash Flow Analysis"
        subtitle="Inflows, outflows, retention rate, and period-over-period liquidity velocity (transfers excluded from P&L)"
        action={
          <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
            {(['monthly', 'weekly'] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGranularity(g)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize cursor-pointer ${
                  granularity === g ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricTile
          label="Total Inflows"
          value={formatCurrency(cashFlow.totalIncome, currency)}
          tone="positive"
        />
        <MetricTile
          label="Total Outflows"
          value={formatCurrency(cashFlow.totalExpenses, currency)}
          tone="negative"
        />
        <MetricTile
          label="Net Cash Surplus / Deficit"
          value={formatCurrency(cashFlow.netCashFlow, currency, { signed: true })}
          tone={cashFlow.netCashFlow >= 0 ? 'positive' : 'negative'}
        />
        <MetricTile
          label="Cash Retention Rate"
          value={`${cashFlow.savingsRatePct}%`}
          subtext="Share of inflows retained"
        />
      </div>

      {chartSeries.length === 0 ? (
        <EmptyState
          icon={<TrendingUp className="w-5 h-5" />}
          title="No cash flow history yet"
          description="Record income and expense entries to visualize inflows, outflows, and net surplus across weeks or months."
          actionLabel="Record transaction"
          onAction={onOpenNewTx}
        />
      ) : (
        <>
          <Card className="p-6 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                {granularity === 'monthly' ? 'Monthly' : 'Weekly'} Inflows vs. Outflows
              </h3>
              <p className="text-xs text-slate-500">Internal transfers between accounts are excluded to prevent double counting.</p>
            </div>
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#64748B' }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => formatCurrency(Number(v), currency, { compact: true })}
                  />
                  <Tooltip formatter={(val) => formatCurrency(Number(val ?? 0), currency)} />
                  <Bar dataKey="inflows" name="Inflows" fill="#065F46" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="outflows" name="Outflows" fill="#DC2626" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="p-6 space-y-4">
              <h3 className="text-sm font-semibold text-slate-900">Income Sources</h3>
              <div className="space-y-3">
                {cashFlow.incomeByCategory.map((item) => (
                  <div key={item.category} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-slate-800">{item.category}</span>
                      <span className="font-mono tabular-nums text-emerald-700">
                        {formatCurrency(item.amount, currency)} ({item.sharePct}%)
                      </span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-700" style={{ width: `${item.sharePct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-6 space-y-4">
              <h3 className="text-sm font-semibold text-slate-900">Outflow Categories</h3>
              <div className="space-y-3">
                {cashFlow.spendingByCategory.map((item) => (
                  <div key={item.category} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-slate-800">{item.category}</span>
                      <span className="font-mono tabular-nums text-slate-900">
                        {formatCurrency(item.amount, currency)} ({item.sharePct}%)
                      </span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-slate-800" style={{ width: `${item.sharePct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
