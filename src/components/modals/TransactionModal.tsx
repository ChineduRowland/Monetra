import React, { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { apiRequest } from '../../lib/api.ts';
import { useMonetraAuth } from '../../lib/authContext.tsx';
import { Modal } from '../ui/Primitives.tsx';
import type {
  AccountingClass,
  Category,
  FinancialAccount,
  Transaction,
  TransactionType,
  WorkspaceType,
} from '../../shared/types.ts';

export function TransactionModal({
  open,
  onClose,
  workspaceId,
  workspaceType,
  currency,
  accounts,
  categories,
  editingTx,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  workspaceType: WorkspaceType;
  currency: string;
  accounts: FinancialAccount[];
  categories: Category[];
  editingTx: Transaction | null;
  onSaved: () => Promise<void> | void;
}) {
  const { getAuthToken } = useMonetraAuth();
  const activeAccounts = accounts.filter((a) => a.status === 'active');

  const [type, setType] = useState<TransactionType>('expense');
  const [accountId, setAccountId] = useState('');
  const [transferToAccountId, setTransferToAccountId] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [accountingClass, setAccountingClass] = useState<AccountingClass>('standard');
  const [txDate, setTxDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [customCategoryName, setCustomCategoryName] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (editingTx) {
      setType(editingTx.type);
      setAccountId(editingTx.account_id);
      setTransferToAccountId(editingTx.transfer_to_account_id ?? '');
      setDescription(editingTx.description);
      setAmount(String(editingTx.amount));
      setCategory(editingTx.category);
      setAccountingClass(editingTx.accounting_class);
      setTxDate(editingTx.tx_date);
      setReference(editingTx.reference);
      setNotes(editingTx.notes);
    } else {
      setType('expense');
      setAccountId(activeAccounts[0]?.id ?? '');
      setTransferToAccountId(activeAccounts[1]?.id ?? '');
      setDescription('');
      setAmount('');
      const firstExpense = categories.find((c) => c.type === 'expense')?.name ?? 'Other expenses';
      setCategory(firstExpense);
      setAccountingClass('standard');
      setTxDate(new Date().toISOString().slice(0, 10));
      setReference('');
      setNotes('');
    }
  }, [open, editingTx]);

  const filteredCategories = categories.filter((c) => c.type === (type === 'income' ? 'income' : 'expense'));

  async function handleAddCustomCategory() {
    if (!customCategoryName.trim() || type === 'transfer') return;
    try {
      const res = await apiRequest<{ category: Category }>(
        `/api/workspaces/${workspaceId}/categories`,
        {
          method: 'POST',
          getToken: getAuthToken,
          body: { name: customCategoryName.trim(), type },
        }
      );
      setCategory(res.category.name);
      setCustomCategoryName('');
      setAddingCategory(false);
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create custom category');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const payload = {
        account_id: accountId,
        transfer_to_account_id: type === 'transfer' ? transferToAccountId : null,
        description,
        amount: Number(amount),
        currency,
        type,
        category: type === 'transfer' ? 'Transfer' : category,
        accounting_class: workspaceType === 'business' && type !== 'transfer' ? accountingClass : 'standard',
        tx_date: txDate,
        reference,
        notes,
      };
      if (editingTx) {
        await apiRequest(`/api/workspaces/${workspaceId}/transactions/${editingTx.id}`, {
          method: 'PATCH',
          getToken: getAuthToken,
          body: payload,
        });
      } else {
        await apiRequest(`/api/workspaces/${workspaceId}/transactions`, {
          method: 'POST',
          getToken: getAuthToken,
          body: payload,
        });
      }
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save transaction');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editingTx ? 'Edit Transaction' : 'Record Transaction'}
      subtitle="All account balances reconcile automatically with recorded entries."
    >
      {activeAccounts.length === 0 ? (
        <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
          Create at least one active financial account first before recording transactions.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error ? (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
              {error}
            </div>
          ) : null}

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(['income', 'expense', 'transfer'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setType(t);
                  if (t !== 'transfer') {
                    const match = categories.find((c) => c.type === t)?.name;
                    if (match) setCategory(match);
                  }
                }}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md capitalize transition-colors cursor-pointer ${
                  type === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">
                {type === 'transfer' ? 'From account' : 'Account'}
              </label>
              <select
                required
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {activeAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>

            {type === 'transfer' ? (
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-700">Destination account</label>
                <select
                  required
                  value={transferToAccountId}
                  onChange={(e) => setTransferToAccountId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">Select destination</option>
                  {activeAccounts
                    .filter((a) => a.id !== accountId)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </select>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium text-slate-700">Category</label>
                  <button
                    type="button"
                    onClick={() => setAddingCategory((v) => !v)}
                    className="text-xs text-emerald-800 hover:underline flex items-center gap-0.5 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Custom</span>
                  </button>
                </div>
                <select
                  required
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {filteredCategories.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {addingCategory && type !== 'transfer' ? (
            <div className="flex items-center gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
              <input
                type="text"
                value={customCategoryName}
                onChange={(e) => setCustomCategoryName(e.target.value)}
                placeholder={`New ${type} category name`}
                className="flex-1 px-2.5 py-1.5 text-xs border border-slate-300 rounded-md bg-white"
              />
              <button
                type="button"
                onClick={handleAddCustomCategory}
                className="px-3 py-1.5 text-xs font-medium bg-emerald-800 text-white rounded-md cursor-pointer"
              >
                Add
              </button>
            </div>
          ) : null}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">
                Amount ({currency})
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">Date</label>
              <input
                type="date"
                required
                value={txDate}
                onChange={(e) => setTxDate(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-700">Description</label>
            <input
              type="text"
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Client retainer invoice #402"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          {workspaceType === 'business' && type !== 'transfer' ? (
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">
                Accounting classification (P&amp;L separation)
              </label>
              <select
                value={accountingClass}
                onChange={(e) => setAccountingClass(e.target.value as AccountingClass)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="standard">
                  {type === 'income' ? 'Operating Revenue' : 'Operating Expense'}
                </option>
                {type === 'income' ? (
                  <option value="owner_equity">Owner Capital Injection (Excluded from Revenue)</option>
                ) : (
                  <option value="owner_draw">Owner Draw / Dividend (Excluded from Operating Expense)</option>
                )}
              </select>
            </div>
          ) : null}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">Reference (optional)</label>
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="INV-001"
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">Notes (optional)</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional context"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 text-xs font-medium text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg cursor-pointer"
            >
              {busy ? 'Saving...' : editingTx ? 'Update transaction' : 'Save transaction'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
