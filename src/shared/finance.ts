import type {
  Asset,
  FinancialAccount,
  FinancialInsight,
  FinancialSnapshot,
  Liability,
  SavingsGoal,
  Transaction,
  WorkspaceType,
} from './types.ts';

/**
 * Exact integer minor-unit helpers (kobo/cents) to avoid IEEE-754 floating-point drift.
 */
export function toMinorUnits(amount: number | string): number {
  const num = typeof amount === 'string' ? Number(amount.replace(/,/g, '').trim()) : amount;
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100);
}

export function fromMinorUnits(minor: number): number {
  return Math.round(minor) / 100;
}

export function addMoney(...values: number[]): number {
  const sumMinor = values.reduce((acc, v) => acc + toMinorUnits(v), 0);
  return fromMinorUnits(sumMinor);
}

export function subtractMoney(a: number, b: number): number {
  return fromMinorUnits(toMinorUnits(a) - toMinorUnits(b));
}

export function getCurrencySymbol(currency: string = 'NGN'): string {
  switch (currency.toUpperCase()) {
    case 'NGN':
      return '₦';
    case 'USD':
      return '$';
    case 'GBP':
      return '£';
    case 'EUR':
      return '€';
    case 'KES':
      return 'KSh';
    case 'GHS':
      return '₵';
    default:
      return `${currency.toUpperCase()} `;
  }
}

export function formatCurrency(
  amount: number,
  currency: string = 'NGN',
  options?: { compact?: boolean; signed?: boolean }
): string {
  const symbol = getCurrencySymbol(currency);
  const absVal = Math.abs(fromMinorUnits(toMinorUnits(amount)));
  const sign = amount < 0 ? '-' : options?.signed && amount > 0 ? '+' : '';

  if (options?.compact && absVal >= 1_000_000) {
    return `${sign}${symbol}${(absVal / 1_000_000).toFixed(2)}M`;
  }
  if (options?.compact && absVal >= 100_000) {
    return `${sign}${symbol}${(absVal / 1_000).toFixed(1)}k`;
  }

  const formatted = new Intl.NumberFormat('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(absVal);

  return `${sign}${symbol}${formatted}`;
}

/**
 * Reconciles every account's current balance strictly from opening_balance + recorded ledger transactions.
 */
export function reconcileAccountBalances(
  accounts: FinancialAccount[],
  transactions: Transaction[]
): Record<string, number> {
  const balanceMinorMap: Record<string, number> = {};
  for (const acc of accounts) {
    balanceMinorMap[acc.id] = toMinorUnits(acc.opening_balance);
  }

  for (const tx of transactions) {
    const amt = toMinorUnits(tx.amount);
    if (tx.type === 'income') {
      if (tx.account_id in balanceMinorMap) {
        balanceMinorMap[tx.account_id] += amt;
      }
    } else if (tx.type === 'expense') {
      if (tx.account_id in balanceMinorMap) {
        balanceMinorMap[tx.account_id] -= amt;
      }
    } else if (tx.type === 'transfer') {
      if (tx.account_id in balanceMinorMap) {
        balanceMinorMap[tx.account_id] -= amt;
      }
      if (tx.transfer_to_account_id && tx.transfer_to_account_id in balanceMinorMap) {
        balanceMinorMap[tx.transfer_to_account_id] += amt;
      }
    }
  }

  const result: Record<string, number> = {};
  for (const [id, minor] of Object.entries(balanceMinorMap)) {
    result[id] = fromMinorUnits(minor);
  }
  return result;
}

export interface CashFlowMetrics {
  totalIncome: number;
  totalExpenses: number;
  netCashFlow: number;
  savingsRatePct: number;
  monthlySeries: Array<{
    month: string;
    label: string;
    inflows: number;
    outflows: number;
    net: number;
  }>;
  weeklySeries: Array<{
    week: string;
    label: string;
    inflows: number;
    outflows: number;
    net: number;
  }>;
  spendingByCategory: Array<{
    category: string;
    amount: number;
    sharePct: number;
  }>;
  incomeByCategory: Array<{
    category: string;
    amount: number;
    sharePct: number;
  }>;
}

export function calculateCashFlowMetrics(transactions: Transaction[]): CashFlowMetrics {
  let incomeMinor = 0;
  let expenseMinor = 0;

  const monthlyMap = new Map<string, { inflows: number; outflows: number }>();
  const weeklyMap = new Map<string, { inflows: number; outflows: number }>();
  const expenseCatMap = new Map<string, number>();
  const incomeCatMap = new Map<string, number>();

  for (const tx of transactions) {
    if (tx.type === 'transfer') continue;
    const amt = toMinorUnits(tx.amount);
    const monthKey = tx.tx_date.slice(0, 7); // YYYY-MM
    const d = new Date(`${tx.tx_date}T00:00:00Z`);
    const dayOfWeek = d.getUTCDay() || 7;
    const monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() - dayOfWeek + 1);
    const weekKey = monday.toISOString().slice(0, 10);

    const mEntry = monthlyMap.get(monthKey) ?? { inflows: 0, outflows: 0 };
    const wEntry = weeklyMap.get(weekKey) ?? { inflows: 0, outflows: 0 };

    if (tx.type === 'income') {
      incomeMinor += amt;
      mEntry.inflows += amt;
      wEntry.inflows += amt;
      incomeCatMap.set(tx.category, (incomeCatMap.get(tx.category) ?? 0) + amt);
    } else if (tx.type === 'expense') {
      expenseMinor += amt;
      mEntry.outflows += amt;
      wEntry.outflows += amt;
      expenseCatMap.set(tx.category, (expenseCatMap.get(tx.category) ?? 0) + amt);
    }

    monthlyMap.set(monthKey, mEntry);
    weeklyMap.set(weekKey, wEntry);
  }

  const totalIncome = fromMinorUnits(incomeMinor);
  const totalExpenses = fromMinorUnits(expenseMinor);
  const netCashFlow = fromMinorUnits(incomeMinor - expenseMinor);
  const savingsRatePct =
    incomeMinor > 0 ? Number((((incomeMinor - expenseMinor) / incomeMinor) * 100).toFixed(1)) : 0;

  const monthlySeries = Array.from(monthlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => {
      const date = new Date(`${month}-01T00:00:00Z`);
      const label = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
      return {
        month,
        label,
        inflows: fromMinorUnits(v.inflows),
        outflows: fromMinorUnits(v.outflows),
        net: fromMinorUnits(v.inflows - v.outflows),
      };
    });

  const weeklySeries = Array.from(weeklyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-10)
    .map(([week, v]) => {
      const date = new Date(`${week}T00:00:00Z`);
      const label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
      return {
        week,
        label,
        inflows: fromMinorUnits(v.inflows),
        outflows: fromMinorUnits(v.outflows),
        net: fromMinorUnits(v.inflows - v.outflows),
      };
    });

  const spendingByCategory = Array.from(expenseCatMap.entries())
    .sort(([, a], [, b]) => b - a)
    .map(([category, minor]) => ({
      category,
      amount: fromMinorUnits(minor),
      sharePct: expenseMinor > 0 ? Number(((minor / expenseMinor) * 100).toFixed(1)) : 0,
    }));

  const incomeByCategory = Array.from(incomeCatMap.entries())
    .sort(([, a], [, b]) => b - a)
    .map(([category, minor]) => ({
      category,
      amount: fromMinorUnits(minor),
      sharePct: incomeMinor > 0 ? Number(((minor / incomeMinor) * 100).toFixed(1)) : 0,
    }));

  return {
    totalIncome,
    totalExpenses,
    netCashFlow,
    savingsRatePct,
    monthlySeries,
    weeklySeries,
    spendingByCategory,
    incomeByCategory,
  };
}

export interface NetWorthMetrics {
  liquidAccountBalances: number;
  trackedAssetsTotal: number;
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  debtToAssetRatioPct: number;
  assetBreakdown: Array<{ category: string; amount: number; sharePct: number }>;
  liabilityBreakdown: Array<{ category: string; amount: number; sharePct: number }>;
  timeline: Array<{ date: string; label: string; assets: number; liabilities: number; netWorth: number }>;
}

export function calculateNetWorth(
  accounts: FinancialAccount[],
  assets: Asset[],
  liabilities: Liability[],
  snapshots: FinancialSnapshot[] = []
): NetWorthMetrics {
  const activeAccounts = accounts.filter((a) => a.status === 'active');
  const liquidMinor = activeAccounts.reduce((sum, a) => sum + toMinorUnits(a.current_balance), 0);
  const trackedAssetMinor = assets.reduce((sum, a) => sum + toMinorUnits(a.valuation), 0);
  const totalAssetsMinor = liquidMinor + trackedAssetMinor;
  const totalLiabilitiesMinor = liabilities.reduce((sum, l) => sum + toMinorUnits(l.principal_balance), 0);
  const netWorthMinor = totalAssetsMinor - totalLiabilitiesMinor;

  const assetCatMap = new Map<string, number>();
  if (liquidMinor !== 0) {
    assetCatMap.set('Account Cash Balances', Math.max(0, liquidMinor));
  }
  for (const a of assets) {
    const label = a.category.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    assetCatMap.set(label, (assetCatMap.get(label) ?? 0) + toMinorUnits(a.valuation));
  }

  const liabilityCatMap = new Map<string, number>();
  for (const l of liabilities) {
    const label = l.category.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    liabilityCatMap.set(label, (liabilityCatMap.get(label) ?? 0) + toMinorUnits(l.principal_balance));
  }

  const assetBreakdown = Array.from(assetCatMap.entries())
    .sort(([, a], [, b]) => b - a)
    .map(([category, minor]) => ({
      category,
      amount: fromMinorUnits(minor),
      sharePct: totalAssetsMinor > 0 ? Number(((minor / totalAssetsMinor) * 100).toFixed(1)) : 0,
    }));

  const liabilityBreakdown = Array.from(liabilityCatMap.entries())
    .sort(([, a], [, b]) => b - a)
    .map(([category, minor]) => ({
      category,
      amount: fromMinorUnits(minor),
      sharePct: totalLiabilitiesMinor > 0 ? Number(((minor / totalLiabilitiesMinor) * 100).toFixed(1)) : 0,
    }));

  const todayStr = new Date().toISOString().slice(0, 10);
  const timelineMap = new Map<string, { assets: number; liabilities: number; netWorth: number }>();
  for (const snap of snapshots) {
    timelineMap.set(snap.snapshot_date, {
      assets: snap.total_assets,
      liabilities: snap.total_liabilities,
      netWorth: snap.net_worth,
    });
  }
  timelineMap.set(todayStr, {
    assets: fromMinorUnits(totalAssetsMinor),
    liabilities: fromMinorUnits(totalLiabilitiesMinor),
    netWorth: fromMinorUnits(netWorthMinor),
  });

  const timeline = Array.from(timelineMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, val]) => ({
      date,
      label: new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      }),
      ...val,
    }));

  return {
    liquidAccountBalances: fromMinorUnits(liquidMinor),
    trackedAssetsTotal: fromMinorUnits(trackedAssetMinor),
    totalAssets: fromMinorUnits(totalAssetsMinor),
    totalLiabilities: fromMinorUnits(totalLiabilitiesMinor),
    netWorth: fromMinorUnits(netWorthMinor),
    debtToAssetRatioPct:
      totalAssetsMinor > 0 ? Number(((totalLiabilitiesMinor / totalAssetsMinor) * 100).toFixed(1)) : 0,
    assetBreakdown,
    liabilityBreakdown,
    timeline,
  };
}

export interface BusinessProfitabilityMetrics {
  operatingRevenue: number;
  operatingExpenses: number;
  netProfit: number;
  profitMarginPct: number;
  ownerCapitalInjected: number;
  ownerDraws: number;
  burnRateMonthly: number;
  runwayMonths: number | null;
  topExpenseCategory: { category: string; amount: number } | null;
  monthlyPnL: Array<{
    month: string;
    label: string;
    revenue: number;
    expenses: number;
    profit: number;
    marginPct: number;
  }>;
}

/**
 * Separates operating P&L from owner equity capital injections / owner drawings.
 */
export function calculateBusinessProfitability(
  transactions: Transaction[],
  liquidCashBalance: number
): BusinessProfitabilityMetrics {
  let revenueMinor = 0;
  let expenseMinor = 0;
  let equityMinor = 0;
  let drawMinor = 0;

  const monthMap = new Map<string, { rev: number; exp: number }>();
  const expenseCatMap = new Map<string, number>();

  for (const tx of transactions) {
    if (tx.type === 'transfer') continue;
    const amt = toMinorUnits(tx.amount);
    if (tx.accounting_class === 'owner_equity') {
      equityMinor += amt;
      continue;
    }
    if (tx.accounting_class === 'owner_draw') {
      drawMinor += amt;
      continue;
    }

    const monthKey = tx.tx_date.slice(0, 7);
    const m = monthMap.get(monthKey) ?? { rev: 0, exp: 0 };

    if (tx.type === 'income') {
      revenueMinor += amt;
      m.rev += amt;
    } else if (tx.type === 'expense') {
      expenseMinor += amt;
      m.exp += amt;
      expenseCatMap.set(tx.category, (expenseCatMap.get(tx.category) ?? 0) + amt);
    }

    monthMap.set(monthKey, m);
  }

  const operatingRevenue = fromMinorUnits(revenueMinor);
  const operatingExpenses = fromMinorUnits(expenseMinor);
  const netProfit = fromMinorUnits(revenueMinor - expenseMinor);
  const profitMarginPct =
    revenueMinor > 0 ? Number((((revenueMinor - expenseMinor) / revenueMinor) * 100).toFixed(1)) : 0;

  const monthlyPnL = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => {
      const profit = v.rev - v.exp;
      return {
        month,
        label: new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-US', {
          month: 'short',
          year: '2-digit',
          timeZone: 'UTC',
        }),
        revenue: fromMinorUnits(v.rev),
        expenses: fromMinorUnits(v.exp),
        profit: fromMinorUnits(profit),
        marginPct: v.rev > 0 ? Number(((profit / v.rev) * 100).toFixed(1)) : 0,
      };
    });

  const activeMonths = Math.max(1, monthlyPnL.length);
  const burnRateMonthly = fromMinorUnits(Math.round(expenseMinor / activeMonths));
  const avgNetMonthlyMinor = Math.round((revenueMinor - expenseMinor) / activeMonths);
  const runwayMonths =
    avgNetMonthlyMinor < 0 && liquidCashBalance > 0
      ? Number((liquidCashBalance / Math.abs(fromMinorUnits(avgNetMonthlyMinor))).toFixed(1))
      : null;

  const sortedExpenseCats = Array.from(expenseCatMap.entries()).sort(([, a], [, b]) => b - a);
  const topExpenseCategory = sortedExpenseCats[0]
    ? { category: sortedExpenseCats[0][0], amount: fromMinorUnits(sortedExpenseCats[0][1]) }
    : null;

  return {
    operatingRevenue,
    operatingExpenses,
    netProfit,
    profitMarginPct,
    ownerCapitalInjected: fromMinorUnits(equityMinor),
    ownerDraws: fromMinorUnits(drawMinor),
    burnRateMonthly,
    runwayMonths,
    topExpenseCategory,
    monthlyPnL,
  };
}

export function calculateSavingsMetrics(goals: SavingsGoal[]) {
  const targetMinor = goals.reduce((s, g) => s + toMinorUnits(g.target_amount), 0);
  const currentMinor = goals.reduce((s, g) => s + toMinorUnits(g.current_amount), 0);
  const overallProgressPct =
    targetMinor > 0 ? Math.min(100, Number(((currentMinor / targetMinor) * 100).toFixed(1))) : 0;

  const goalItems = goals.map((g) => {
    const target = toMinorUnits(g.target_amount);
    const current = toMinorUnits(g.current_amount);
    const remainingMinor = Math.max(0, target - current);
    const progressPct = target > 0 ? Math.min(100, Number(((current / target) * 100).toFixed(1))) : 0;
    const monthlyMinor = toMinorUnits(g.monthly_contribution);
    const etaMonths =
      remainingMinor === 0 ? 0 : monthlyMinor > 0 ? Math.ceil(remainingMinor / monthlyMinor) : null;
    return {
      ...g,
      remainingAmount: fromMinorUnits(remainingMinor),
      progressPct,
      etaMonths,
    };
  });

  return {
    totalTarget: fromMinorUnits(targetMinor),
    totalSaved: fromMinorUnits(currentMinor),
    overallProgressPct,
    goals: goalItems,
  };
}

export function generateFinancialInsights(params: {
  workspaceType: WorkspaceType;
  currency: string;
  cashFlow: CashFlowMetrics;
  netWorth: NetWorthMetrics;
  savingsRatePct: number;
  businessPnl?: BusinessProfitabilityMetrics;
  goalsCount: number;
  transactionsCount: number;
}): FinancialInsight[] {
  const { workspaceType, currency, cashFlow, netWorth, businessPnl, goalsCount, transactionsCount } = params;
  const insights: FinancialInsight[] = [];

  if (transactionsCount === 0) {
    insights.push({
      id: 'empty-ledger',
      severity: 'neutral',
      title: 'Ledger ready for your first entries',
      detail: 'Add an account and record transactions or import a bank CSV statement to unlock cash flow analytics.',
    });
    return insights;
  }

  if (cashFlow.netCashFlow > 0) {
    insights.push({
      id: 'positive-cashflow',
      severity: 'positive',
      title: 'Positive net cash flow',
      detail: `Inflows exceed outflows by ${formatCurrency(cashFlow.netCashFlow, currency)} (${cashFlow.savingsRatePct}% retention).`,
    });
  } else if (cashFlow.netCashFlow < 0) {
    insights.push({
      id: 'negative-cashflow',
      severity: 'caution',
      title: 'Outflows exceed inflows',
      detail: `Net cash deficit is ${formatCurrency(Math.abs(cashFlow.netCashFlow), currency)}. Review recurring expenses to restore surplus.`,
    });
  }

  if (cashFlow.spendingByCategory.length > 0) {
    const top = cashFlow.spendingByCategory[0];
    insights.push({
      id: 'top-expense',
      severity: top.sharePct > 45 ? 'caution' : 'neutral',
      title: `Largest expense category: ${top.category}`,
      detail: `${top.category} accounts for ${top.sharePct}% (${formatCurrency(top.amount, currency)}) of total recorded outflows.`,
    });
  }

  if (workspaceType === 'business' && businessPnl) {
    insights.push({
      id: 'biz-margin',
      severity: businessPnl.profitMarginPct >= 20 ? 'positive' : businessPnl.profitMarginPct >= 0 ? 'neutral' : 'caution',
      title: `Operating margin is ${businessPnl.profitMarginPct}%`,
      detail: `Operating profit is ${formatCurrency(businessPnl.netProfit, currency)} on ${formatCurrency(businessPnl.operatingRevenue, currency)} operating revenue (excluding owner equity flows).`,
    });
  } else {
    insights.push({
      id: 'net-worth-position',
      severity: netWorth.netWorth >= 0 ? 'positive' : 'caution',
      title: `Net worth stands at ${formatCurrency(netWorth.netWorth, currency)}`,
      detail:
        netWorth.totalLiabilities > 0
          ? `Debt-to-asset ratio is ${netWorth.debtToAssetRatioPct}% across ${formatCurrency(netWorth.totalAssets, currency)} total assets.`
          : `Zero recorded liabilities against ${formatCurrency(netWorth.totalAssets, currency)} in cash and tracked assets.`,
    });
  }

  if (goalsCount === 0) {
    insights.push({
      id: 'no-goals',
      severity: 'neutral',
      title: 'No active savings goals yet',
      detail: 'Create a dedicated savings target to track completion percentage and projected monthly ETA.',
    });
  }

  return insights.slice(0, 4);
}

/**
 * Deterministic normalization & deduplication hash for bank CSV imports and Open Banking sync.
 */
export function buildDedupHash(input: {
  workspaceId: string;
  accountId: string;
  txDate: string;
  amount: number;
  type: string;
  description: string;
  reference?: string;
}): string {
  const normDesc = input.description.trim().toLowerCase().replace(/\s+/g, ' ');
  const normRef = (input.reference ?? '').trim().toLowerCase();
  const amtMinor = toMinorUnits(input.amount);
  return `${input.workspaceId}|${input.accountId}|${input.txDate}|${amtMinor}|${input.type}|${normDesc}|${normRef}`;
}

export interface ParsedCsvData {
  headers: string[];
  rows: string[][];
}

export function parseCsvText(rawText: string): ParsedCsvData {
  const lines: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  const text = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        currentCell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      currentRow.push(currentCell.trim());
      currentCell = '';
    } else if (ch === '\n' && !inQuotes) {
      currentRow.push(currentCell.trim());
      if (currentRow.some((cell) => cell.length > 0)) {
        lines.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += ch;
    }
  }
  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((cell) => cell.length > 0)) {
      lines.push(currentRow);
    }
  }

  if (lines.length === 0) return { headers: [], rows: [] };
  return { headers: lines[0], rows: lines.slice(1) };
}

export function normalizeCsvDate(raw: string): string | null {
  const cleaned = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return cleaned;
  const dmyMatch = cleaned.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3];
    if (Number(month) <= 12 && Number(day) <= 31) {
      return `${year}-${month}-${day}`;
    }
  }
  const parsed = new Date(cleaned);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return null;
}

export function parseMonetaryInput(raw: string): number {
  const cleaned = raw.replace(/[₦$£€, \s]/g, '').trim();
  if (!cleaned) return 0;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
}

export function autoCategorizeDescription(description: string, type: 'income' | 'expense'): string {
  const d = description.toLowerCase();
  if (type === 'income') {
    if (/salary|payroll|wages/.test(d)) return 'Salary';
    if (/invoice|pos|paystack|flutterwave|client|sale|revenue/.test(d)) return 'Business revenue';
    if (/freelance|consulting|retainer/.test(d)) return 'Freelance income';
    if (/dividend|interest|yield|treasury|tbill/.test(d)) return 'Investment income';
    return 'Other income';
  }
  if (/uber|bolt|fuel|diesel|petrol|flight|danfo|transport/.test(d)) return 'Transportation';
  if (/shoprite|spar|food|restaurant|chowdeck|glovo|grocer|meal/.test(d)) return 'Food';
  if (/rent|estate|lease|mortgage/.test(d)) return 'Housing';
  if (/ekedc|ikedc|power|electric|mtn|airtel|glo|fiber|internet|water|utility/.test(d)) return 'Utilities';
  if (/hospital|pharmacy|clinic|med|health/.test(d)) return 'Healthcare';
  if (/tuition|course|school|udemy|coursera/.test(d)) return 'Education';
  if (/aws|google|meta|ads|inventory|supplier|logistics|office|staff|software/.test(d)) return 'Business operations';
  if (/netflix|spotify|cinema|showmax/.test(d)) return 'Entertainment';
  return 'Other expenses';
}
