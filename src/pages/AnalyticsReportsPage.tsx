import React, { useMemo, useState } from 'react';
import { Download, Printer, Save } from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import { useMonetraAuth } from '../lib/authContext.tsx';
import {
  calculateBusinessProfitability,
  calculateCashFlowMetrics,
  calculateNetWorth,
  formatCurrency,
} from '../shared/finance.ts';
import type { FinancialReport, WorkspaceOverviewData } from '../shared/types.ts';
import { Card, SectionHeader } from '../components/ui/Primitives.tsx';

export function AnalyticsReportsPage({
  overview,
  onReload,
}: {
  overview: WorkspaceOverviewData;
  onReload: () => Promise<void>;
}) {
  const { getAuthToken } = useMonetraAuth();
  const { workspace, accounts, transactions, assets, liabilities, snapshots, reports } = overview;
  const currency = workspace.currency;

  const today = new Date().toISOString().slice(0, 10);
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [periodStart, setPeriodStart] = useState(ninetyDaysAgo);
  const [periodEnd, setPeriodEnd] = useState(today);
  const [reportType, setReportType] = useState<FinancialReport['report_type']>(
    workspace.type === 'business' ? 'business_pnl' : 'monthly_summary'
  );
  const [saving, setSaving] = useState(false);

  const periodTxs = useMemo(
    () => transactions.filter((t) => t.tx_date >= periodStart && t.tx_date <= periodEnd),
    [transactions, periodStart, periodEnd]
  );

  const cashFlow = calculateCashFlowMetrics(periodTxs);
  const netWorth = calculateNetWorth(accounts, assets, liabilities, snapshots);
  const businessPnl =
    workspace.type === 'business'
      ? calculateBusinessProfitability(periodTxs, netWorth.liquidAccountBalances)
      : null;

  async function handleSaveReport() {
    setSaving(true);
    try {
      await apiRequest(`/api/workspaces/${workspace.id}/reports`, {
        method: 'POST',
        getToken: getAuthToken,
        body: {
          title: `${workspace.name} — ${reportType.replace('_', ' ').toUpperCase()} (${periodStart} to ${periodEnd})`,
          report_type: reportType,
          period_start: periodStart,
          period_end: periodEnd,
          summary_json: {
            totalIncome: cashFlow.totalIncome,
            totalExpenses: cashFlow.totalExpenses,
            netCashFlow: cashFlow.netCashFlow,
            netWorth: netWorth.netWorth,
            transactionCount: periodTxs.length,
          },
        },
      });
      await onReload();
    } finally {
      setSaving(false);
    }
  }

  function handleExportCsv() {
    const headers = ['Date', 'Type', 'Category', 'Description', 'Amount', 'Currency', 'Reference'];
    const lines = [
      headers.join(','),
      ...periodTxs.map((t) =>
        [
          t.tx_date,
          t.type,
          `"${t.category.replace(/"/g, '""')}"`,
          `"${t.description.replace(/"/g, '""')}"`,
          t.amount.toFixed(2),
          t.currency,
          `"${t.reference.replace(/"/g, '""')}"`,
        ].join(',')
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `monetra-${workspace.name.toLowerCase().replace(/\s+/g, '-')}-${periodStart}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Analytics & Financial Reports"
        subtitle="Generate printable financial statements, save point-in-time report records, or export CSV ledgers"
        action={
          <div className="flex flex-wrap items-center gap-2 no-print">
            <button
              type="button"
              onClick={handleExportCsv}
              className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / PDF</span>
            </button>
            <button
              type="button"
              onClick={handleSaveReport}
              disabled={saving}
              className="px-3.5 py-2 text-xs font-medium text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg flex items-center gap-1.5 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? 'Saving...' : 'Archive report'}</span>
            </button>
          </div>
        }
      />

      <Card className="p-4 flex flex-wrap items-center gap-3 no-print">
        <select
          value={reportType}
          onChange={(e) => setReportType(e.target.value as FinancialReport['report_type'])}
          className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
        >
          <option value="monthly_summary">Executive Summary Statement</option>
          <option value="cash_flow">Cash Flow Statement</option>
          <option value="net_worth">Balance Sheet &amp; Net Worth</option>
          {workspace.type === 'business' ? (
            <option value="business_pnl">Business Profit &amp; Loss</option>
          ) : null}
        </select>
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <span>Period:</span>
          <input
            type="date"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
            className="px-2.5 py-1.5 border border-slate-300 rounded-md font-mono text-xs"
          />
          <span>to</span>
          <input
            type="date"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
            className="px-2.5 py-1.5 border border-slate-300 rounded-md font-mono text-xs"
          />
        </div>
      </Card>

      {/* Printable Financial Statement */}
      <Card className="p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-200">
          <div>
            <div className="text-xs font-semibold text-emerald-800">Monetra Financial Statement</div>
            <h3 className="text-xl font-semibold text-slate-900">{workspace.name}</h3>
            <p className="text-xs text-slate-500">
              Period {periodStart} to {periodEnd} · Currency {currency} · {periodTxs.length} transactions
            </p>
          </div>
          <div className="text-right font-mono text-xs text-slate-500">
            Generated {new Date().toISOString().slice(0, 10)}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-slate-900 uppercase tracking-wider">
              Income &amp; Cash Flow Summary
            </h4>
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg text-xs">
              <div className="p-3 flex justify-between">
                <span className="text-slate-600">Total Period Inflows</span>
                <span className="font-mono font-semibold text-emerald-700">
                  {formatCurrency(cashFlow.totalIncome, currency)}
                </span>
              </div>
              <div className="p-3 flex justify-between">
                <span className="text-slate-600">Total Period Outflows</span>
                <span className="font-mono font-semibold text-slate-900">
                  {formatCurrency(cashFlow.totalExpenses, currency)}
                </span>
              </div>
              <div className="p-3 flex justify-between bg-slate-50">
                <span className="font-semibold text-slate-900">Net Cash Flow</span>
                <span className="font-mono font-semibold text-slate-900">
                  {formatCurrency(cashFlow.netCashFlow, currency, { signed: true })}
                </span>
              </div>
              {businessPnl ? (
                <div className="p-3 flex justify-between">
                  <span className="text-slate-600">Operating Margin (excl. owner equity)</span>
                  <span className="font-mono font-semibold text-slate-900">
                    {businessPnl.profitMarginPct}% ({formatCurrency(businessPnl.netProfit, currency)})
                  </span>
                </div>
              ) : null}
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-slate-900 uppercase tracking-wider">
              Balance Sheet Position
            </h4>
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg text-xs">
              <div className="p-3 flex justify-between">
                <span className="text-slate-600">Liquid Account Cash</span>
                <span className="font-mono font-semibold text-slate-900">
                  {formatCurrency(netWorth.liquidAccountBalances, currency)}
                </span>
              </div>
              <div className="p-3 flex justify-between">
                <span className="text-slate-600">Tracked Assets Valuation</span>
                <span className="font-mono font-semibold text-slate-900">
                  {formatCurrency(netWorth.trackedAssetsTotal, currency)}
                </span>
              </div>
              <div className="p-3 flex justify-between">
                <span className="text-slate-600">Total Liabilities</span>
                <span className="font-mono font-semibold text-rose-700">
                  {formatCurrency(netWorth.totalLiabilities, currency)}
                </span>
              </div>
              <div className="p-3 flex justify-between bg-slate-50">
                <span className="font-semibold text-slate-900">Total Net Worth</span>
                <span className="font-mono font-semibold text-emerald-800">
                  {formatCurrency(netWorth.netWorth, currency)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {reports.length > 0 ? (
        <Card className="overflow-hidden no-print">
          <div className="px-5 py-4 border-b border-slate-200 text-sm font-semibold text-slate-900">
            Archived Statement Records
          </div>
          <div className="divide-y divide-slate-100">
            {reports.map((r) => (
              <div key={r.id} className="px-5 py-3 flex items-center justify-between text-xs">
                <div>
                  <div className="font-medium text-slate-900">{r.title}</div>
                  <div className="text-[11px] text-slate-500">
                    {r.period_start} to {r.period_end} · Saved {new Date(r.created_at).toLocaleDateString()}
                  </div>
                </div>
                <span className="font-mono text-slate-600 capitalize">
                  {r.report_type.replace('_', ' ')}
                </span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
