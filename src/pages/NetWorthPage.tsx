import React, { useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Camera, Plus, Trash2 } from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import { useMonetraAuth } from '../lib/authContext.tsx';
import { calculateNetWorth, formatCurrency } from '../shared/finance.ts';
import type { AssetCategory, LiabilityCategory, WorkspaceOverviewData } from '../shared/types.ts';
import { Card, MetricTile, Modal, SectionHeader } from '../components/ui/Primitives.tsx';

export function NetWorthPage({
  overview,
  onReload,
}: {
  overview: WorkspaceOverviewData;
  onReload: () => Promise<void>;
}) {
  const { getAuthToken } = useMonetraAuth();
  const { workspace, accounts, assets, liabilities, snapshots } = overview;
  const currency = workspace.currency;
  const netWorth = calculateNetWorth(accounts, assets, liabilities, snapshots);

  const [assetModalOpen, setAssetModalOpen] = useState(false);
  const [liabModalOpen, setLiabModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [snapshotNotice, setSnapshotNotice] = useState<string | null>(null);

  // Asset form
  const [assetName, setAssetName] = useState('');
  const [assetCategory, setAssetCategory] = useState<AssetCategory>('real_estate');
  const [assetValuation, setAssetValuation] = useState('');
  const [assetNotes, setAssetNotes] = useState('');

  // Liability form
  const [liabName, setLiabName] = useState('');
  const [liabCategory, setLiabCategory] = useState<LiabilityCategory>('loan');
  const [liabBalance, setLiabBalance] = useState('');
  const [liabRate, setLiabRate] = useState('0');
  const [liabDue, setLiabDue] = useState('');

  async function handleSaveAsset(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiRequest(`/api/workspaces/${workspace.id}/assets`, {
        method: 'POST',
        getToken: getAuthToken,
        body: {
          name: assetName,
          category: assetCategory,
          valuation: Number(assetValuation),
          currency,
          notes: assetNotes,
        },
      });
      await onReload();
      setAssetModalOpen(false);
      setAssetName('');
      setAssetValuation('');
      setAssetNotes('');
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveLiability(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiRequest(`/api/workspaces/${workspace.id}/liabilities`, {
        method: 'POST',
        getToken: getAuthToken,
        body: {
          name: liabName,
          category: liabCategory,
          principal_balance: Number(liabBalance),
          interest_rate: Number(liabRate),
          due_date: liabDue || null,
          currency,
        },
      });
      await onReload();
      setLiabModalOpen(false);
      setLiabName('');
      setLiabBalance('');
    } finally {
      setBusy(false);
    }
  }

  async function handleRecordSnapshot() {
    setBusy(true);
    setSnapshotNotice(null);
    try {
      await apiRequest(`/api/workspaces/${workspace.id}/snapshots`, {
        method: 'POST',
        getToken: getAuthToken,
      });
      await onReload();
      setSnapshotNotice('Today’s balance sheet snapshot saved to Net Worth history.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Net Worth & Balance Sheet"
        subtitle="Real-time consolidation of liquid accounts, physical/financial assets, and outstanding liabilities"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleRecordSnapshot}
              disabled={busy}
              className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Save snapshot</span>
            </button>
            <button
              type="button"
              onClick={() => setLiabModalOpen(true)}
              className="px-3 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add liability</span>
            </button>
            <button
              type="button"
              onClick={() => setAssetModalOpen(true)}
              className="px-3.5 py-2 text-xs font-medium text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add asset</span>
            </button>
          </div>
        }
      />

      {snapshotNotice ? (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
          {snapshotNotice}
        </div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricTile
          label="Liquid Account Cash"
          value={formatCurrency(netWorth.liquidAccountBalances, currency)}
        />
        <MetricTile
          label="Tracked Assets Valuation"
          value={formatCurrency(netWorth.trackedAssetsTotal, currency)}
        />
        <MetricTile
          label="Total Liabilities"
          value={formatCurrency(netWorth.totalLiabilities, currency)}
          subtext={`${netWorth.debtToAssetRatioPct}% debt-to-asset ratio`}
          tone={netWorth.totalLiabilities > 0 ? 'negative' : 'neutral'}
        />
        <MetricTile
          label="Net Worth"
          value={formatCurrency(netWorth.netWorth, currency)}
          tone={netWorth.netWorth >= 0 ? 'positive' : 'negative'}
        />
      </div>

      <Card className="p-6 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Net Worth Trajectory</h3>
          <p className="text-xs text-slate-500">Assets vs. liabilities over recorded snapshots</p>
        </div>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={netWorth.timeline}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#64748B' }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 11, fill: '#64748B' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => formatCurrency(Number(v), currency, { compact: true })}
              />
              <Tooltip formatter={(val) => formatCurrency(Number(val ?? 0), currency)} />
              <Area type="monotone" dataKey="assets" name="Total Assets" stroke="#0284C7" fill="#E0F2FE" />
              <Area type="monotone" dataKey="netWorth" name="Net Worth" stroke="#065F46" fill="#D1FAE5" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Assets List */}
        <Card className="overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Tracked Assets</h3>
            <span className="text-xs font-mono text-slate-600">
              {formatCurrency(netWorth.trackedAssetsTotal, currency)}
            </span>
          </div>
          {assets.length === 0 ? (
            <div className="p-6 text-xs text-slate-500 text-center">
              No non-account assets added yet. Add investments, real estate, inventory, or equipment.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {assets.map((a) => (
                <div key={a.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-900 truncate">{a.name}</div>
                    <div className="text-[11px] text-slate-500 capitalize">
                      {a.category.replace('_', ' ')} {a.notes ? `· ${a.notes}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs font-mono tabular-nums font-semibold text-slate-900">
                      {formatCurrency(a.valuation, a.currency)}
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        await apiRequest(`/api/workspaces/${workspace.id}/assets/${a.id}`, {
                          method: 'DELETE',
                          getToken: getAuthToken,
                        });
                        await onReload();
                      }}
                      className="p-1 text-slate-400 hover:text-rose-700 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Liabilities List */}
        <Card className="overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Liabilities &amp; Payables</h3>
            <span className="text-xs font-mono text-rose-700">
              {formatCurrency(netWorth.totalLiabilities, currency)}
            </span>
          </div>
          {liabilities.length === 0 ? (
            <div className="p-6 text-xs text-slate-500 text-center">
              Zero recorded liabilities in this workspace.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {liabilities.map((l) => (
                <div key={l.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-900 truncate">{l.name}</div>
                    <div className="text-[11px] text-slate-500 capitalize">
                      {l.category.replace('_', ' ')} · {l.interest_rate}% APR
                      {l.due_date ? ` · Due ${l.due_date}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs font-mono tabular-nums font-semibold text-rose-700">
                      {formatCurrency(l.principal_balance, l.currency)}
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        await apiRequest(`/api/workspaces/${workspace.id}/liabilities/${l.id}`, {
                          method: 'DELETE',
                          getToken: getAuthToken,
                        });
                        await onReload();
                      }}
                      className="p-1 text-slate-400 hover:text-rose-700 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Add Asset Modal */}
      <Modal open={assetModalOpen} onClose={() => setAssetModalOpen(false)} title="Add Asset">
        <form onSubmit={handleSaveAsset} className="space-y-4">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-700">Asset name</label>
            <input
              type="text"
              required
              value={assetName}
              onChange={(e) => setAssetName(e.target.value)}
              placeholder="e.g. Treasury Bills or Warehouse Equipment"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">Category</label>
              <select
                value={assetCategory}
                onChange={(e) => setAssetCategory(e.target.value as AssetCategory)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="real_estate">Real Estate</option>
                <option value="investment">Investment</option>
                <option value="equipment">Equipment</option>
                <option value="inventory">Inventory</option>
                <option value="cash_equivalent">Cash Equivalent</option>
                <option value="vehicle">Vehicle</option>
                <option value="receivable">Receivable</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">Valuation ({currency})</label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={assetValuation}
                onChange={(e) => setAssetValuation(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-700">Notes</label>
            <input
              type="text"
              value={assetNotes}
              onChange={(e) => setAssetNotes(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAssetModalOpen(false)} className="px-4 py-2 text-xs bg-slate-100 rounded-lg cursor-pointer">Cancel</button>
            <button type="submit" disabled={busy} className="px-4 py-2 text-xs text-white bg-emerald-800 rounded-lg cursor-pointer">Save asset</button>
          </div>
        </form>
      </Modal>

      {/* Add Liability Modal */}
      <Modal open={liabModalOpen} onClose={() => setLiabModalOpen(false)} title="Add Liability">
        <form onSubmit={handleSaveLiability} className="space-y-4">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-700">Liability name</label>
            <input
              type="text"
              required
              value={liabName}
              onChange={(e) => setLiabName(e.target.value)}
              placeholder="e.g. Working Capital Facility or Supplier Payable"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">Category</label>
              <select
                value={liabCategory}
                onChange={(e) => setLiabCategory(e.target.value as LiabilityCategory)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="loan">Loan</option>
                <option value="supplier_payable">Supplier Payable</option>
                <option value="tax_payable">Tax Payable</option>
                <option value="credit_card">Credit Card</option>
                <option value="mortgage">Mortgage</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">Balance ({currency})</label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={liabBalance}
                onChange={(e) => setLiabBalance(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">Interest rate (% APR)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={liabRate}
                onChange={(e) => setLiabRate(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">Due date</label>
              <input
                type="date"
                value={liabDue}
                onChange={(e) => setLiabDue(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setLiabModalOpen(false)} className="px-4 py-2 text-xs bg-slate-100 rounded-lg cursor-pointer">Cancel</button>
            <button type="submit" disabled={busy} className="px-4 py-2 text-xs text-white bg-emerald-800 rounded-lg cursor-pointer">Save liability</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
