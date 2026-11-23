import React, { useEffect, useState } from 'react';
import { Archive, Building2, Edit3, Landmark, Plus, RefreshCw, RotateCcw, Wallet } from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import { useMonetraAuth } from '../lib/authContext.tsx';
import { formatCurrency } from '../shared/finance.ts';
import type { AccountType, FinancialAccount, WorkspaceOverviewData } from '../shared/types.ts';
import { Card, EmptyState, Modal, SectionHeader } from '../components/ui/Primitives.tsx';

interface Institution {
  code: string;
  name: string;
  country: string;
  accountTypes: string[];
}

export function AccountsPage({
  overview,
  onReload,
}: {
  overview: WorkspaceOverviewData;
  onReload: () => Promise<void>;
}) {
  const { getAuthToken } = useMonetraAuth();
  const { workspace, accounts, transactions, bankConnections } = overview;

  const [showArchived, setShowArchived] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FinancialAccount | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<FinancialAccount | null>(null);

  const [name, setName] = useState('');
  const [institution, setInstitution] = useState('');
  const [accountType, setAccountType] = useState<AccountType>('current');
  const [openingBalance, setOpeningBalance] = useState('0');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Open Banking Linking
  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [isSimulatedOB, setIsSimulatedOB] = useState(true);
  const [bankCode, setBankCode] = useState('gtbank');
  const [accountMask, setAccountMask] = useState('');
  const [bankAccountType, setBankAccountType] = useState<'savings' | 'current' | 'business'>('current');
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<{ institutions: Institution[]; isSimulated: boolean }>('/api/open-banking/institutions', {
      getToken: getAuthToken,
    })
      .then((res) => {
        setInstitutions(res.institutions);
        setIsSimulatedOB(res.isSimulated);
        if (res.institutions[0]) setBankCode(res.institutions[0].code);
      })
      .catch(() => {});
  }, [getAuthToken]);

  function openCreate() {
    setEditing(null);
    setName('');
    setInstitution('');
    setAccountType(workspace.type === 'business' ? 'business' : 'current');
    setOpeningBalance('0');
    setError(null);
    setModalOpen(true);
  }

  function openEdit(acc: FinancialAccount) {
    setEditing(acc);
    setName(acc.name);
    setInstitution(acc.institution);
    setAccountType(acc.account_type);
    setOpeningBalance(String(acc.opening_balance));
    setError(null);
    setModalOpen(true);
  }

  async function handleSaveAccount(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const payload = {
        name,
        institution,
        account_type: accountType,
        currency: workspace.currency,
        opening_balance: Number(openingBalance),
      };
      if (editing) {
        await apiRequest(`/api/workspaces/${workspace.id}/accounts/${editing.id}`, {
          method: 'PATCH',
          getToken: getAuthToken,
          body: payload,
        });
      } else {
        await apiRequest(`/api/workspaces/${workspace.id}/accounts`, {
          method: 'POST',
          getToken: getAuthToken,
          body: payload,
        });
      }
      await onReload();
      setModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save account');
    } finally {
      setBusy(false);
    }
  }

  async function toggleArchive(acc: FinancialAccount) {
    await apiRequest(`/api/workspaces/${workspace.id}/accounts/${acc.id}`, {
      method: 'PATCH',
      getToken: getAuthToken,
      body: { status: acc.status === 'active' ? 'archived' : 'active' },
    });
    await onReload();
  }

  async function handleLinkBank(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const inst = institutions.find((i) => i.code === bankCode);
      await apiRequest(`/api/workspaces/${workspace.id}/bank-connections/link`, {
        method: 'POST',
        getToken: getAuthToken,
        body: {
          institution_code: bankCode,
          institution_name: inst?.name ?? 'Nigerian Bank',
          account_mask: accountMask,
          account_type: bankAccountType,
        },
      });
      await onReload();
      setBankModalOpen(false);
      setAccountMask('');
      setSyncMessage('Bank connection linked in read-only Open Banking mode. Click Sync Feed to import recent transactions.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link bank connection');
    } finally {
      setBusy(false);
    }
  }

  async function handleSyncConnection(connectionId: string) {
    setBusy(true);
    setSyncMessage(null);
    try {
      const res = await apiRequest<{ importedCount: number; skippedDuplicates: number }>(
        `/api/workspaces/${workspace.id}/bank-connections/${connectionId}/sync`,
        { method: 'POST', getToken: getAuthToken }
      );
      await onReload();
      setSyncMessage(
        `Sync complete: ${res.importedCount} new transactions imported (${res.skippedDuplicates} duplicates skipped).`
      );
    } catch (err) {
      setSyncMessage(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setBusy(false);
    }
  }

  const visibleAccounts = accounts.filter((a) => (showArchived ? true : a.status === 'active'));
  const totalActiveBalance = accounts
    .filter((a) => a.status === 'active')
    .reduce((sum, a) => sum + a.current_balance, 0);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Financial Accounts"
        subtitle={`Combined active liquidity: ${formatCurrency(totalActiveBalance, workspace.currency)} · Balances reconcile from opening balance + transactions`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowArchived((v) => !v)}
              className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer"
            >
              {showArchived ? 'Hide archived' : 'Show archived'}
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setBankModalOpen(true);
              }}
              className="px-3 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Landmark className="w-3.5 h-3.5" />
              <span>Link Bank (Open Banking)</span>
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="px-3.5 py-2 text-xs font-medium text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add account</span>
            </button>
          </div>
        }
      />

      {syncMessage ? (
        <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
          {syncMessage}
        </div>
      ) : null}

      {visibleAccounts.length === 0 ? (
        <EmptyState
          icon={<Wallet className="w-5 h-5" />}
          title="No accounts in this workspace"
          description="Add a savings, current, cash, business, or investment account to start reconciling transactions."
          actionLabel="Add first account"
          onAction={openCreate}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleAccounts.map((acc) => {
            const txCount = transactions.filter(
              (t) => t.account_id === acc.id || t.transfer_to_account_id === acc.id
            ).length;
            return (
              <Card
                key={acc.id}
                className={`p-5 flex flex-col justify-between gap-4 ${
                  acc.status === 'archived' ? 'opacity-65 bg-slate-50' : ''
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">{acc.name}</h3>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {acc.institution || 'Independent'} · <span className="capitalize">{acc.account_type}</span> · {acc.status}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(acc)}
                        aria-label={`Edit ${acc.name}`}
                        className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-100 cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleArchive(acc)}
                        aria-label={acc.status === 'active' ? `Archive ${acc.name}` : `Restore ${acc.name}`}
                        className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-100 cursor-pointer"
                      >
                        {acc.status === 'active' ? (
                          <Archive className="w-3.5 h-3.5" />
                        ) : (
                          <RotateCcw className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-1 pt-2 border-t border-slate-100">
                  <div className="text-[11px] text-slate-500">Reconciled Current Balance</div>
                  <div className="text-xl font-semibold font-mono tabular-nums text-slate-900">
                    {formatCurrency(acc.current_balance, acc.currency)}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                    <span>Opening: {formatCurrency(acc.opening_balance, acc.currency)}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedAccount(acc)}
                      className="text-emerald-800 font-medium hover:underline cursor-pointer"
                    >
                      {txCount} transactions &rarr;
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Open Banking Connections Section */}
      {bankConnections.length > 0 ? (
        <Card className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Connected Open Banking Feeds ({isSimulatedOB ? 'Mono Sandbox Simulation' : 'Mono Live'})
              </h3>
              <p className="text-xs text-slate-500">
                Read-only tokenized feeds without storing bank passwords or PINs.
              </p>
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {bankConnections.map((bc) => (
              <div key={bc.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-900">
                      {bc.institution_name} · ••••{bc.account_mask}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Status: {bc.status} · {bc.is_simulated ? 'Sandbox Feed' : 'Live Feed'} ·{' '}
                      {bc.last_synced_at
                        ? `Last synced ${new Date(bc.last_synced_at).toLocaleString()}`
                        : 'Not synced yet'}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleSyncConnection(bc.id)}
                  className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white hover:bg-slate-800 rounded-lg flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Sync feed</span>
                </button>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {/* Account Create / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Account' : 'Create Financial Account'}
      >
        <form onSubmit={handleSaveAccount} className="space-y-4">
          {error ? (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
              {error}
            </div>
          ) : null}
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-700">Account name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. GTBank Current or Cash Safe"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">Institution</label>
              <input
                type="text"
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
                placeholder="GTBank, Zenith, Kuda, Cash..."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">Account type</label>
              <select
                value={accountType}
                onChange={(e) => setAccountType(e.target.value as AccountType)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="savings">Savings account</option>
                <option value="current">Current account</option>
                <option value="cash">Cash</option>
                <option value="business">Business account</option>
                <option value="investment">Investment account</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-700">
              Opening balance ({workspace.currency})
            </label>
            <input
              type="number"
              step="0.01"
              required
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 text-xs font-medium text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg cursor-pointer"
            >
              {busy ? 'Saving...' : editing ? 'Save changes' : 'Create account'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Open Banking Modal */}
      <Modal
        open={bankModalOpen}
        onClose={() => setBankModalOpen(false)}
        title="Link Bank Account via Open Banking"
        subtitle="Read-only consent flow. Monetra never requests or stores your banking password or PIN."
      >
        <form onSubmit={handleLinkBank} className="space-y-4">
          {error ? (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
              {error}
            </div>
          ) : null}
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
            Provider Mode: <strong>{isSimulatedOB ? 'Mono Read-Only Sandbox Simulation' : 'Mono Live API'}</strong>
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-700">Select Bank / Institution</label>
            <select
              value={bankCode}
              onChange={(e) => setBankCode(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              {institutions.map((i) => (
                <option key={i.code} value={i.code}>
                  {i.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">Last 4 digits (mask)</label>
              <input
                type="text"
                maxLength={4}
                pattern="\d{4}"
                required
                value={accountMask}
                onChange={(e) => setAccountMask(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="4821"
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">Account type</label>
              <select
                value={bankAccountType}
                onChange={(e) => setBankAccountType(e.target.value as 'savings' | 'current' | 'business')}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="current">Current</option>
                <option value="savings">Savings</option>
                <option value="business">Business</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setBankModalOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 text-xs font-medium text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg cursor-pointer"
            >
              {busy ? 'Authorizing...' : 'Authorize Read-Only Link'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Account Transactions Drawer Modal */}
      <Modal
        open={Boolean(selectedAccount)}
        onClose={() => setSelectedAccount(null)}
        title={selectedAccount ? `${selectedAccount.name} — Ledger` : 'Account Ledger'}
        subtitle={
          selectedAccount
            ? `Reconciled Balance: ${formatCurrency(selectedAccount.current_balance, selectedAccount.currency)}`
            : ''
        }
        maxWidth="max-w-2xl"
      >
        {selectedAccount ? (
          <div className="space-y-3">
            {transactions.filter(
              (t) => t.account_id === selectedAccount.id || t.transfer_to_account_id === selectedAccount.id
            ).length === 0 ? (
              <div className="text-xs text-slate-500 py-6 text-center">
                No transactions recorded for this account yet.
              </div>
            ) : (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                    <tr>
                      <th className="py-2 px-3">Date</th>
                      <th className="py-2 px-3">Description</th>
                      <th className="py-2 px-3">Category</th>
                      <th className="py-2 px-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {transactions
                      .filter(
                        (t) =>
                          t.account_id === selectedAccount.id ||
                          t.transfer_to_account_id === selectedAccount.id
                      )
                      .map((t) => {
                        const isIncomingTransfer =
                          t.type === 'transfer' && t.transfer_to_account_id === selectedAccount.id;
                        const signed =
                          t.type === 'income' || isIncomingTransfer ? t.amount : -t.amount;
                        return (
                          <tr key={t.id}>
                            <td className="py-2 px-3 font-mono text-slate-600">{t.tx_date}</td>
                            <td className="py-2 px-3 text-slate-900">{t.description}</td>
                            <td className="py-2 px-3 text-slate-500">{t.category}</td>
                            <td
                              className={`py-2 px-3 text-right font-mono tabular-nums font-medium ${
                                signed >= 0 ? 'text-emerald-700' : 'text-slate-900'
                              }`}
                            >
                              {formatCurrency(signed, t.currency, { signed: true })}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
