import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addMoney,
  buildDedupHash,
  calculateBusinessProfitability,
  calculateNetWorth,
  calculateSavingsMetrics,
  normalizeCsvDate,
  parseCsvText,
  reconcileAccountBalances,
  toMinorUnits,
} from '../src/shared/finance.ts';
import type { Asset, FinancialAccount, Liability, SavingsGoal, Transaction } from '../src/shared/types.ts';

test('exact decimal arithmetic avoids IEEE-754 floating point drift', () => {
  assert.equal(addMoney(0.1, 0.2), 0.3);
  assert.equal(toMinorUnits('1250000.75'), 125000075);
});

test('account balance reconciliation handles income, expense, and internal transfers accurately', () => {
  const accounts: FinancialAccount[] = [
    {
      id: 'acc-1',
      workspace_id: 'ws-1',
      name: 'GTBank Current',
      institution: 'GTBank',
      account_type: 'current',
      currency: 'NGN',
      opening_balance: 500000,
      current_balance: 500000,
      status: 'active',
      external_provider: null,
      external_account_id: null,
      created_at: '',
      updated_at: '',
    },
    {
      id: 'acc-2',
      workspace_id: 'ws-1',
      name: 'PiggyVest Reserve',
      institution: 'PiggyVest',
      account_type: 'savings',
      currency: 'NGN',
      opening_balance: 100000,
      current_balance: 100000,
      status: 'active',
      external_provider: null,
      external_account_id: null,
      created_at: '',
      updated_at: '',
    },
  ];

  const txs: Transaction[] = [
    {
      id: 'tx-1',
      workspace_id: 'ws-1',
      account_id: 'acc-1',
      transfer_to_account_id: null,
      description: 'Monthly Salary',
      amount: 850000.5,
      currency: 'NGN',
      type: 'income',
      category: 'Salary',
      accounting_class: 'standard',
      tx_date: '2026-10-01',
      notes: '',
      reference: '',
      source: 'manual',
      import_batch_id: null,
      dedup_hash: null,
      created_at: '',
      updated_at: '',
    },
    {
      id: 'tx-2',
      workspace_id: 'ws-1',
      account_id: 'acc-1',
      transfer_to_account_id: null,
      description: 'Groceries',
      amount: 120000.25,
      currency: 'NGN',
      type: 'expense',
      category: 'Food',
      accounting_class: 'standard',
      tx_date: '2026-10-03',
      notes: '',
      reference: '',
      source: 'manual',
      import_batch_id: null,
      dedup_hash: null,
      created_at: '',
      updated_at: '',
    },
    {
      id: 'tx-3',
      workspace_id: 'ws-1',
      account_id: 'acc-1',
      transfer_to_account_id: 'acc-2',
      description: 'Move to savings',
      amount: 200000,
      currency: 'NGN',
      type: 'transfer',
      category: 'Transfer',
      accounting_class: 'standard',
      tx_date: '2026-10-05',
      notes: '',
      reference: '',
      source: 'manual',
      import_batch_id: null,
      dedup_hash: null,
      created_at: '',
      updated_at: '',
    },
  ];

  const reconciled = reconcileAccountBalances(accounts, txs);
  assert.equal(reconciled['acc-1'], 1030000.25);
  assert.equal(reconciled['acc-2'], 300000);
});

test('net worth calculation equals total assets minus total liabilities', () => {
  const accounts: FinancialAccount[] = [
    {
      id: 'a1',
      workspace_id: 'ws',
      name: 'Main',
      institution: 'Access',
      account_type: 'current',
      currency: 'NGN',
      opening_balance: 0,
      current_balance: 1500000,
      status: 'active',
      external_provider: null,
      external_account_id: null,
      created_at: '',
      updated_at: '',
    },
  ];
  const assets: Asset[] = [
    {
      id: 'as1',
      workspace_id: 'ws',
      name: 'FGN T-Bills',
      category: 'investment',
      valuation: 2500000,
      currency: 'NGN',
      acquired_date: '2026-01-01',
      notes: '',
      created_at: '',
      updated_at: '',
    },
  ];
  const liabilities: Liability[] = [
    {
      id: 'l1',
      workspace_id: 'ws',
      name: 'Equipment Loan',
      category: 'loan',
      principal_balance: 750000,
      interest_rate: 12,
      due_date: '2027-01-01',
      currency: 'NGN',
      notes: '',
      created_at: '',
      updated_at: '',
    },
  ];

  const nw = calculateNetWorth(accounts, assets, liabilities);
  assert.equal(nw.totalAssets, 4000000);
  assert.equal(nw.totalLiabilities, 750000);
  assert.equal(nw.netWorth, 3250000);
});

test('business profitability separates equity transactions and handles zero revenue safely', () => {
  const txs: Transaction[] = [
    {
      id: 'b1',
      workspace_id: 'ws-b',
      account_id: 'acc-b',
      transfer_to_account_id: null,
      description: 'Founder Capital Injection',
      amount: 2000000,
      currency: 'NGN',
      type: 'income',
      category: 'Other income',
      accounting_class: 'owner_equity',
      tx_date: '2026-09-01',
      notes: '',
      reference: '',
      source: 'manual',
      import_batch_id: null,
      dedup_hash: null,
      created_at: '',
      updated_at: '',
    },
    {
      id: 'b2',
      workspace_id: 'ws-b',
      account_id: 'acc-b',
      transfer_to_account_id: null,
      description: 'Client Invoice Paid',
      amount: 1000000,
      currency: 'NGN',
      type: 'income',
      category: 'Business revenue',
      accounting_class: 'standard',
      tx_date: '2026-09-10',
      notes: '',
      reference: '',
      source: 'manual',
      import_batch_id: null,
      dedup_hash: null,
      created_at: '',
      updated_at: '',
    },
    {
      id: 'b3',
      workspace_id: 'ws-b',
      account_id: 'acc-b',
      transfer_to_account_id: null,
      description: 'Cloud & Logistics',
      amount: 400000,
      currency: 'NGN',
      type: 'expense',
      category: 'Business operations',
      accounting_class: 'standard',
      tx_date: '2026-09-12',
      notes: '',
      reference: '',
      source: 'manual',
      import_batch_id: null,
      dedup_hash: null,
      created_at: '',
      updated_at: '',
    },
  ];

  const pnl = calculateBusinessProfitability(txs, 2600000);
  assert.equal(pnl.operatingRevenue, 1000000);
  assert.equal(pnl.operatingExpenses, 400000);
  assert.equal(pnl.netProfit, 600000);
  assert.equal(pnl.profitMarginPct, 60);
  assert.equal(pnl.ownerCapitalInjected, 2000000);

  const zeroRevPnl = calculateBusinessProfitability([], 0);
  assert.equal(zeroRevPnl.profitMarginPct, 0);
});

test('savings metrics compute completion percentage, remaining, and ETA', () => {
  const goals: SavingsGoal[] = [
    {
      id: 'g1',
      workspace_id: 'ws',
      account_id: null,
      name: 'Emergency Fund',
      target_amount: 1200000,
      current_amount: 450000,
      target_date: '2027-06-01',
      monthly_contribution: 150000,
      currency: 'NGN',
      status: 'active',
      created_at: '',
      updated_at: '',
    },
  ];

  const metrics = calculateSavingsMetrics(goals);
  assert.equal(metrics.overallProgressPct, 37.5);
  assert.equal(metrics.goals[0].remainingAmount, 750000);
  assert.equal(metrics.goals[0].etaMonths, 5);
});

test('CSV parsing, date normalization, and duplicate detection work reliably', () => {
  const csv = `Date,Description,Debit,Credit,Reference\n14/10/2026,"Paystack Settlement, Store A",,450000.00,REF-901\n15/10/2026,IKEDC Power Topup,35000,,REF-902`;
  const parsed = parseCsvText(csv);
  assert.equal(parsed.headers.length, 5);
  assert.equal(parsed.rows.length, 2);
  assert.equal(normalizeCsvDate(parsed.rows[0][0]), '2026-10-14');

  const h1 = buildDedupHash({
    workspaceId: 'w1',
    accountId: 'a1',
    txDate: '2026-10-14',
    amount: 450000,
    type: 'income',
    description: 'Paystack Settlement, Store A',
    reference: 'REF-901',
  });
  const h2 = buildDedupHash({
    workspaceId: 'w1',
    accountId: 'a1',
    txDate: '2026-10-14',
    amount: 450000,
    type: 'income',
    description: '  paystack settlement, store a  ',
    reference: 'ref-901',
  });
  assert.equal(h1, h2);
});
