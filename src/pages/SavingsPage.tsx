import React, { useState } from 'react';
import { PiggyBank, Plus } from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import { useMonetraAuth } from '../lib/authContext.tsx';
import { calculateSavingsMetrics, formatCurrency } from '../shared/finance.ts';
import type { WorkspaceOverviewData } from '../shared/types.ts';
import { Card, EmptyState, MetricTile, Modal, SectionHeader } from '../components/ui/Primitives.tsx';

export function SavingsPage({
  overview,
  onReload,
}: {
  overview: WorkspaceOverviewData;
  onReload: () => Promise<void>;
}) {
  const { getAuthToken } = useMonetraAuth();
  const { workspace, accounts, savingsGoals, savingsContributions } = overview;
  const currency = workspace.currency;
  const metrics = calculateSavingsMetrics(savingsGoals);

  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [contribGoalId, setContribGoalId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [initialAmount, setInitialAmount] = useState('0');
  const [monthlyContribution, setMonthlyContribution] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [accountId, setAccountId] = useState('');

  const [contribAmount, setContribAmount] = useState('');
  const [contribDate, setContribDate] = useState(new Date().toISOString().slice(0, 10));
  const [contribNotes, setContribNotes] = useState('');

  async function handleCreateGoal(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiRequest(`/api/workspaces/${workspace.id}/savings-goals`, {
        method: 'POST',
        getToken: getAuthToken,
        body: {
          account_id: accountId || null,
          name,
          target_amount: Number(targetAmount),
          current_amount: Number(initialAmount),
          monthly_contribution: Number(monthlyContribution || 0),
          target_date: targetDate || null,
          currency,
        },
      });
      await onReload();
      setGoalModalOpen(false);
      setName('');
      setTargetAmount('');
      setInitialAmount('0');
      setMonthlyContribution('');
    } finally {
      setBusy(false);
    }
  }

  async function handleRecordContribution(e: React.FormEvent) {
    e.preventDefault();
    if (!contribGoalId) return;
    setBusy(true);
    try {
      await apiRequest(`/api/workspaces/${workspace.id}/savings-goals/${contribGoalId}/contributions`, {
        method: 'POST',
        getToken: getAuthToken,
        body: {
          amount: Number(contribAmount),
          contribution_date: contribDate,
          notes: contribNotes,
        },
      });
      await onReload();
      setContribGoalId(null);
      setContribAmount('');
      setContribNotes('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Savings Goals"
        subtitle="Track dedicated reserves, completion velocity, and projected target timelines"
        action={
          <button
            type="button"
            onClick={() => setGoalModalOpen(true)}
            className="px-3.5 py-2 text-xs font-medium text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create savings goal</span>
          </button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricTile label="Total Saved Across Goals" value={formatCurrency(metrics.totalSaved, currency)} tone="positive" />
        <MetricTile label="Combined Target" value={formatCurrency(metrics.totalTarget, currency)} />
        <MetricTile label="Overall Completion" value={`${metrics.overallProgressPct}%`} />
      </div>

      {metrics.goals.length === 0 ? (
        <EmptyState
          icon={<PiggyBank className="w-5 h-5" />}
          title="No savings goals created yet"
          description="Set an emergency fund, tax reserve, equipment purchase, or capital goal and track monthly contributions."
          actionLabel="Create first goal"
          onAction={() => setGoalModalOpen(true)}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {metrics.goals.map((g) => (
            <Card key={g.id} className="p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">{g.name}</h3>
                  <div className="text-xs text-slate-500 mt-0.5 capitalize">
                    Status: {g.status} ·{' '}
                    {g.etaMonths === 0
                      ? 'Target reached'
                      : g.etaMonths !== null
                        ? `Est. ${g.etaMonths} months remaining`
                        : 'Set monthly plan for ETA'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setContribGoalId(g.id)}
                  className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white hover:bg-slate-800 rounded-lg cursor-pointer whitespace-nowrap"
                >
                  + Contribute
                </button>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-mono tabular-nums">
                  <span className="text-emerald-800 font-semibold">
                    {formatCurrency(g.current_amount, g.currency)}
                  </span>
                  <span className="text-slate-600">
                    of {formatCurrency(g.target_amount, g.currency)} ({g.progressPct}%)
                  </span>
                </div>
                <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-700 transition-all"
                    style={{ width: `${g.progressPct}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-slate-500">
                  <span>Remaining: {formatCurrency(g.remainingAmount, g.currency)}</span>
                  {g.monthly_contribution > 0 ? (
                    <span>Plan: {formatCurrency(g.monthly_contribution, g.currency)}/mo</span>
                  ) : null}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {savingsContributions.length > 0 ? (
        <Card className="overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 text-sm font-semibold text-slate-900">
            Recent Savings Contributions
          </div>
          <div className="divide-y divide-slate-100">
            {savingsContributions.slice(0, 10).map((c) => {
              const goalName = savingsGoals.find((g) => g.id === c.goal_id)?.name ?? 'Savings Goal';
              return (
                <div key={c.id} className="px-5 py-3 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-medium text-slate-900">{goalName}</div>
                    <div className="text-[11px] text-slate-500">
                      {c.contribution_date} {c.notes ? `· ${c.notes}` : ''}
                    </div>
                  </div>
                  <div className="font-mono tabular-nums font-semibold text-emerald-700">
                    +{formatCurrency(c.amount, currency)}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}

      <Modal open={goalModalOpen} onClose={() => setGoalModalOpen(false)} title="Create Savings Goal">
        <form onSubmit={handleCreateGoal} className="space-y-4">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-700">Goal name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. 6-Month Emergency Reserve"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">Target amount ({currency})</label>
              <input
                type="number"
                step="0.01"
                min="1"
                required
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">Starting balance ({currency})</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={initialAmount}
                onChange={(e) => setInitialAmount(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">Planned monthly ({currency})</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={monthlyContribution}
                onChange={(e) => setMonthlyContribution(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">Target date</label>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-700">Linked account (optional)</label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="">Unlinked</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setGoalModalOpen(false)} className="px-4 py-2 text-xs bg-slate-100 rounded-lg cursor-pointer">Cancel</button>
            <button type="submit" disabled={busy} className="px-4 py-2 text-xs text-white bg-emerald-800 rounded-lg cursor-pointer">Save goal</button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(contribGoalId)} onClose={() => setContribGoalId(null)} title="Record Contribution">
        <form onSubmit={handleRecordContribution} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">Amount ({currency})</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={contribAmount}
                onChange={(e) => setContribAmount(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">Date</label>
              <input
                type="date"
                required
                value={contribDate}
                onChange={(e) => setContribDate(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-700">Notes</label>
            <input
              type="text"
              value={contribNotes}
              onChange={(e) => setContribNotes(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setContribGoalId(null)} className="px-4 py-2 text-xs bg-slate-100 rounded-lg cursor-pointer">Cancel</button>
            <button type="submit" disabled={busy} className="px-4 py-2 text-xs text-white bg-emerald-800 rounded-lg cursor-pointer">Record</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
