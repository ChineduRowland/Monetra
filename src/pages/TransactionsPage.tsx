import React, { useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  Edit3,
  FileSpreadsheet,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import { useMonetraAuth } from '../lib/authContext.tsx';
import { formatCurrency } from '../shared/finance.ts';
import type { Transaction, WorkspaceOverviewData } from '../shared/types.ts';
import { Card, EmptyState, SectionHeader } from '../components/ui/Primitives.tsx';

const PAGE_SIZE = 15;

export function TransactionsPage({
  overview,
  onReload,
  onOpenNewTx,
  onEditTx,
  onOpenCsvImport,
}: {
  overview: WorkspaceOverviewData;
  onReload: () => Promise<void>;
  onOpenNewTx: () => void;
  onEditTx: (tx: Transaction) => void;
  onOpenCsvImport: () => void;
}) {
  const { getAuthToken } = useMonetraAuth();
  const { workspace, transactions, accounts, categories } = overview;

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense' | 'transfer'>('all');
  const [accountFilter, setAccountFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState<'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc'>(
    'date_desc'
  );
  const [page, setPage] = useState(1);

  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = transactions.filter((tx) => {
      if (typeFilter !== 'all' && tx.type !== typeFilter) return false;
      if (
        accountFilter !== 'all' &&
        tx.account_id !== accountFilter &&
        tx.transfer_to_account_id !== accountFilter
      ) {
        return false;
      }
      if (categoryFilter !== 'all' && tx.category !== categoryFilter) return false;
      if (dateFrom && tx.tx_date < dateFrom) return false;
      if (dateTo && tx.tx_date > dateTo) return false;
      if (
        q &&
        !tx.description.toLowerCase().includes(q) &&
        !tx.category.toLowerCase().includes(q) &&
        !tx.reference.toLowerCase().includes(q) &&
        !tx.notes.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });

    return [...list].sort((a, b) => {
      if (sortBy === 'date_asc') return a.tx_date.localeCompare(b.tx_date);
      if (sortBy === 'amount_desc') return b.amount - a.amount;
      if (sortBy === 'amount_asc') return a.amount - b.amount;
      return b.tx_date.localeCompare(a.tx_date);
    });
  }, [transactions, search, typeFilter, accountFilter, categoryFilter, dateFrom, dateTo, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  async function handleDelete(tx: Transaction) {
    await apiRequest(`/api/workspaces/${workspace.id}/transactions/${tx.id}`, {
      method: 'DELETE',
      getToken: getAuthToken,
    });
    await onReload();
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Transactions Ledger"
        subtitle={`${filtered.length} matching entries · Search, filter, edit, or import CSV bank statements`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onOpenCsvImport}
              className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Import CSV</span>
            </button>
            <button
              type="button"
              onClick={onOpenNewTx}
              className="px-3.5 py-2 text-xs font-medium text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add transaction</span>
            </button>
          </div>
        }
      />

      {/* Filter Bar */}
      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="md:col-span-2 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search description, reference, category..."
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg"
            />
          </div>

          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value as typeof typeFilter);
              setPage(1);
            }}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="all">All types</option>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
            <option value="transfer">Transfer</option>
          </select>

          <select
            value={accountFilter}
            onChange={(e) => {
              setAccountFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="all">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>

          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <span>From:</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
              className="px-2.5 py-1 border border-slate-300 rounded-md font-mono text-xs"
            />
            <span>To:</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
              className="px-2.5 py-1 border border-slate-300 rounded-md font-mono text-xs"
            />
            {(search || typeFilter !== 'all' || accountFilter !== 'all' || categoryFilter !== 'all' || dateFrom || dateTo) ? (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setTypeFilter('all');
                  setAccountFilter('all');
                  setCategoryFilter('all');
                  setDateFrom('');
                  setDateTo('');
                }}
                className="text-xs text-emerald-800 hover:underline ml-1 cursor-pointer"
              >
                Reset filters
              </button>
            ) : null}
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="date_desc">Newest first</option>
            <option value="date_asc">Oldest first</option>
            <option value="amount_desc">Highest amount</option>
            <option value="amount_asc">Lowest amount</option>
          </select>
        </div>
      </Card>

      {transactions.length === 0 ? (
        <EmptyState
          icon={<ArrowLeftRight className="w-5 h-5" />}
          title="No transactions recorded yet"
          description="Record an income, expense, or internal transfer, or upload a CSV statement from your bank."
          actionLabel="Record first transaction"
          onAction={onOpenNewTx}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="py-3 px-4 font-medium">Date</th>
                  <th className="py-3 px-4 font-medium">Description</th>
                  <th className="py-3 px-4 font-medium">Type</th>
                  <th className="py-3 px-4 font-medium">Category</th>
                  <th className="py-3 px-4 font-medium">Account</th>
                  <th className="py-3 px-4 font-medium">Source</th>
                  <th className="py-3 px-4 font-medium text-right">Amount</th>
                  <th className="py-3 px-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginated.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">{tx.tx_date}</td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900 max-w-[240px] truncate">{tx.description}</div>
                      {tx.reference ? (
                        <div className="text-[11px] font-mono text-slate-400">{tx.reference}</div>
                      ) : null}
                    </td>
                    <td className="py-3 px-4 capitalize text-slate-600 whitespace-nowrap">
                      {tx.type}
                      {tx.accounting_class !== 'standard' ? ` · ${tx.accounting_class.replace('_', ' ')}` : ''}
                    </td>
                    <td className="py-3 px-4 text-slate-700 whitespace-nowrap">{tx.category}</td>
                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                      {accountMap.get(tx.account_id) ?? 'Account'}
                      {tx.transfer_to_account_id
                        ? ` → ${accountMap.get(tx.transfer_to_account_id) ?? 'Account'}`
                        : ''}
                    </td>
                    <td className="py-3 px-4 text-slate-500 whitespace-nowrap capitalize">
                      {tx.source.replace('_', ' ')}
                    </td>
                    <td
                      className={`py-3 px-4 text-right font-mono tabular-nums font-medium whitespace-nowrap ${
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
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onEditTx(tx)}
                          aria-label={`Edit ${tx.description}`}
                          className="p-1.5 text-slate-400 hover:text-slate-800 rounded-md hover:bg-slate-100 cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(tx)}
                          aria-label={`Delete ${tx.description}`}
                          className="p-1.5 text-slate-400 hover:text-rose-700 rounded-md hover:bg-rose-50 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
            <span>
              Page {safePage} of {totalPages} ({filtered.length} entries)
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="p-1.5 border border-slate-300 rounded-md disabled:opacity-40 cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="p-1.5 border border-slate-300 rounded-md disabled:opacity-40 cursor-pointer"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
