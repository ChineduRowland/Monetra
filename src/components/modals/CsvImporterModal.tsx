import React, { useMemo, useState } from 'react';
import { CheckCircle2, FileSpreadsheet, Upload } from 'lucide-react';
import { apiRequest } from '../../lib/api.ts';
import { useMonetraAuth } from '../../lib/authContext.tsx';
import {
  autoCategorizeDescription,
  formatCurrency,
  normalizeCsvDate,
  parseCsvText,
  parseMonetaryInput,
} from '../../shared/finance.ts';
import type { FinancialAccount } from '../../shared/types.ts';
import { Modal } from '../ui/Primitives.tsx';

interface MappedRow {
  tx_date: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  reference: string;
  isDuplicate?: boolean;
}

export function CsvImporterModal({
  open,
  onClose,
  workspaceId,
  currency,
  accounts,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  currency: string;
  accounts: FinancialAccount[];
  onImported: () => Promise<void> | void;
}) {
  const { getAuthToken } = useMonetraAuth();
  const activeAccounts = accounts.filter((a) => a.status === 'active');

  const [accountId, setAccountId] = useState(activeAccounts[0]?.id ?? '');
  const [filename, setFilename] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<string[][]>([]);

  const [dateCol, setDateCol] = useState(0);
  const [descCol, setDescCol] = useState(1);
  const [amountCol, setAmountCol] = useState<number>(-1);
  const [debitCol, setDebitCol] = useState<number>(2);
  const [creditCol, setCreditCol] = useState<number>(3);
  const [refCol, setRefCol] = useState<number>(-1);

  const [previewRows, setPreviewRows] = useState<MappedRow[] | null>(null);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultMsg, setResultMsg] = useState<string | null>(null);

  function loadCsvContent(name: string, text: string) {
    setError(null);
    setResultMsg(null);
    setPreviewRows(null);
    const parsed = parseCsvText(text);
    if (parsed.headers.length < 2 || parsed.rows.length === 0) {
      setError('CSV must include a header row and at least one transaction row.');
      return;
    }
    setFilename(name);
    setHeaders(parsed.headers);
    setRawRows(parsed.rows);

    const lower = parsed.headers.map((h) => h.toLowerCase());
    const findIdx = (patterns: string[]) =>
      lower.findIndex((h) => patterns.some((p) => h.includes(p)));

    const dIdx = findIdx(['date', 'posted', 'value']);
    const descIdx = findIdx(['desc', 'narration', 'memo', 'detail', 'remark']);
    const debIdx = findIdx(['debit', 'withdrawal', 'outflow']);
    const credIdx = findIdx(['credit', 'deposit', 'inflow']);
    const amtIdx = debIdx === -1 && credIdx === -1 ? findIdx(['amount', 'value']) : -1;
    const rIdx = findIdx(['ref', 'id']);

    setDateCol(dIdx >= 0 ? dIdx : 0);
    setDescCol(descIdx >= 0 ? descIdx : 1);
    setDebitCol(debIdx);
    setCreditCol(credIdx);
    setAmountCol(amtIdx);
    setRefCol(rIdx);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!accountId && activeAccounts[0]) setAccountId(activeAccounts[0].id);
    const reader = new FileReader();
    reader.onload = () => loadCsvContent(file.name, String(reader.result ?? ''));
    reader.readAsText(file);
  }

  function loadSampleStatement() {
    if (!accountId && activeAccounts[0]) setAccountId(activeAccounts[0].id);
    const today = new Date().toISOString().slice(0, 10);
    const sample = [
      'Date,Description,Debit,Credit,Reference',
      `${today},"Paystack Merchant Settlement Batch",,275000.00,PS-SAMPLE-01`,
      `${today},"EKEDC Prepaid Meter Vend",18500.00,,UTL-SAMPLE-02`,
      `${today},"Shoprite Victoria Island Groceries",42300.00,,POS-SAMPLE-03`,
    ].join('\n');
    loadCsvContent('sample_nigerian_bank_statement.csv', sample);
  }

  const mappedCandidates = useMemo<MappedRow[]>(() => {
    if (rawRows.length === 0) return [];
    const list: MappedRow[] = [];
    for (const row of rawRows) {
      const txDate = normalizeCsvDate(row[dateCol] ?? '');
      const desc = (row[descCol] ?? '').trim();
      if (!txDate || !desc) continue;

      let type: 'income' | 'expense' = 'expense';
      let amt = 0;
      if (amountCol >= 0) {
        const signed = parseMonetaryInput(row[amountCol] ?? '');
        if (signed === 0) continue;
        type = signed >= 0 ? 'income' : 'expense';
        amt = Math.abs(signed);
      } else {
        const debitVal = debitCol >= 0 ? Math.abs(parseMonetaryInput(row[debitCol] ?? '')) : 0;
        const creditVal = creditCol >= 0 ? Math.abs(parseMonetaryInput(row[creditCol] ?? '')) : 0;
        if (creditVal > 0) {
          type = 'income';
          amt = creditVal;
        } else if (debitVal > 0) {
          type = 'expense';
          amt = debitVal;
        } else {
          continue;
        }
      }

      list.push({
        tx_date: txDate,
        description: desc,
        amount: amt,
        type,
        category: autoCategorizeDescription(desc, type),
        reference: refCol >= 0 ? (row[refCol] ?? '').trim() : '',
      });
    }
    return list;
  }, [rawRows, dateCol, descCol, amountCol, debitCol, creditCol, refCol]);

  async function runDuplicateCheck() {
    if (!accountId || mappedCandidates.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiRequest<{
        total: number;
        duplicates: number;
        rows: MappedRow[];
      }>(`/api/workspaces/${workspaceId}/imports/preview`, {
        method: 'POST',
        getToken: getAuthToken,
        body: { account_id: accountId, rows: mappedCandidates },
      });
      setPreviewRows(res.rows);
      setDuplicateCount(res.duplicates);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview check failed');
    } finally {
      setBusy(false);
    }
  }

  async function commitImport() {
    if (!previewRows || !accountId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiRequest<{ importedCount: number; skippedDuplicates: number }>(
        `/api/workspaces/${workspaceId}/imports/commit`,
        {
          method: 'POST',
          getToken: getAuthToken,
          body: {
            account_id: accountId,
            filename: filename || 'bank-statement.csv',
            rows: previewRows,
          },
        }
      );
      setResultMsg(
        `Imported ${res.importedCount} transactions (${res.skippedDuplicates} duplicates skipped).`
      );
      await onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Commit failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Import Bank Statement (CSV)"
      subtitle="Upload a CSV export, map columns, preview duplicates, and reconcile balances."
      maxWidth="max-w-3xl"
    >
      <div className="space-y-4">
        {error ? (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
            {error}
          </div>
        ) : null}
        {resultMsg ? (
          <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>{resultMsg}</span>
          </div>
        ) : null}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-700">Target Account</label>
            <select
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
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-700">Statement CSV File</label>
            <div className="flex items-center gap-2">
              <label className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium border border-dashed border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer">
                <Upload className="w-3.5 h-3.5 text-slate-500" />
                <span className="truncate">{filename || 'Choose .csv file'}</span>
                <input type="file" accept=".csv,text/csv" onChange={handleFileChange} className="hidden" />
              </label>
              <button
                type="button"
                onClick={loadSampleStatement}
                className="px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg whitespace-nowrap cursor-pointer"
              >
                Load sample
              </button>
            </div>
          </div>
        </div>

        {headers.length > 0 ? (
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="text-xs font-semibold text-slate-800 flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-slate-500" />
              <span>Column Mapping ({rawRows.length} rows detected)</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {[
                { label: 'Date column', val: dateCol, setter: setDateCol, optional: false },
                { label: 'Description column', val: descCol, setter: setDescCol, optional: false },
                { label: 'Debit / Outflow', val: debitCol, setter: setDebitCol, optional: true },
                { label: 'Credit / Inflow', val: creditCol, setter: setCreditCol, optional: true },
                { label: 'Single Amount (+/-)', val: amountCol, setter: setAmountCol, optional: true },
                { label: 'Reference', val: refCol, setter: setRefCol, optional: true },
              ].map((m) => (
                <div key={m.label} className="space-y-1">
                  <label className="block text-[11px] font-medium text-slate-600">{m.label}</label>
                  <select
                    value={m.val}
                    onChange={(e) => {
                      m.setter(Number(e.target.value));
                      setPreviewRows(null);
                    }}
                    className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-md bg-white"
                  >
                    {m.optional ? <option value={-1}>None</option> : null}
                    {headers.map((h, i) => (
                      <option key={h + i} value={i}>
                        {h || `Column ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={runDuplicateCheck}
                disabled={busy || mappedCandidates.length === 0}
                className="px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
              >
                {busy ? 'Checking duplicates...' : `Preview ${mappedCandidates.length} rows`}
              </button>
            </div>
          </div>
        ) : null}

        {previewRows ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span>
                Ready to import: <strong>{previewRows.length - duplicateCount}</strong> new ·{' '}
                <strong>{duplicateCount}</strong> duplicates auto-skipped
              </span>
            </div>
            <div className="border border-slate-200 rounded-lg overflow-x-auto max-h-60">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="py-2 px-3">Date</th>
                    <th className="py-2 px-3">Description</th>
                    <th className="py-2 px-3">Category</th>
                    <th className="py-2 px-3 text-right">Amount</th>
                    <th className="py-2 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {previewRows.slice(0, 25).map((r, i) => (
                    <tr key={i} className={r.isDuplicate ? 'bg-amber-50/40 text-slate-400' : ''}>
                      <td className="py-2 px-3 font-mono whitespace-nowrap">{r.tx_date}</td>
                      <td className="py-2 px-3 max-w-[200px] truncate">{r.description}</td>
                      <td className="py-2 px-3">{r.category}</td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                        {formatCurrency(r.type === 'expense' ? -r.amount : r.amount, currency, {
                          signed: true,
                        })}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        {r.isDuplicate ? 'Duplicate (skip)' : 'New'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={commitImport}
                disabled={busy || previewRows.length - duplicateCount === 0}
                className="px-4 py-2 text-xs font-medium text-white bg-emerald-800 hover:bg-emerald-900 disabled:opacity-50 rounded-lg cursor-pointer"
              >
                {busy ? 'Importing...' : `Import ${previewRows.length - duplicateCount} transactions`}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
