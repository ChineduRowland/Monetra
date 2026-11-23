import { z } from 'zod';

export type WorkspaceType = 'personal' | 'business';
export type AccountType = 'savings' | 'current' | 'cash' | 'business' | 'investment' | 'other';
export type TransactionType = 'income' | 'expense' | 'transfer';
export type TransactionSource = 'manual' | 'csv_import' | 'open_banking';
export type AccountingClass = 'standard' | 'owner_equity' | 'owner_draw';
export type AssetCategory =
  | 'cash_equivalent'
  | 'real_estate'
  | 'equipment'
  | 'inventory'
  | 'investment'
  | 'vehicle'
  | 'receivable'
  | 'other';
export type LiabilityCategory =
  | 'loan'
  | 'credit_card'
  | 'mortgage'
  | 'supplier_payable'
  | 'tax_payable'
  | 'other';

export interface Profile {
  id: string;
  email: string;
  display_name: string;
  country: string;
  preferred_currency: string;
  avatar_url: string | null;
  onboarding_completed: boolean;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

export interface Workspace {
  id: string;
  owner_id: string;
  name: string;
  type: WorkspaceType;
  currency: string;
  country: string;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

export interface BusinessDetails {
  workspace_id: string;
  legal_name: string;
  industry: string;
  registration_number: string;
  tax_id: string;
  fiscal_year_start_month: number;
  monthly_revenue_target: number;
  updated_at: string;
}

export interface FinancialAccount {
  id: string;
  workspace_id: string;
  name: string;
  institution: string;
  account_type: AccountType;
  currency: string;
  opening_balance: number;
  current_balance: number;
  status: 'active' | 'archived';
  external_provider: string | null;
  external_account_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  workspace_id: string;
  name: string;
  type: 'income' | 'expense';
  is_system: boolean;
  created_at: string;
}

export interface Transaction {
  id: string;
  workspace_id: string;
  account_id: string;
  transfer_to_account_id: string | null;
  description: string;
  amount: number;
  currency: string;
  type: TransactionType;
  category: string;
  accounting_class: AccountingClass;
  tx_date: string;
  notes: string;
  reference: string;
  source: TransactionSource;
  import_batch_id: string | null;
  dedup_hash: string | null;
  created_at: string;
  updated_at: string;
}

export interface Asset {
  id: string;
  workspace_id: string;
  name: string;
  category: AssetCategory;
  valuation: number;
  currency: string;
  acquired_date: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface Liability {
  id: string;
  workspace_id: string;
  name: string;
  category: LiabilityCategory;
  principal_balance: number;
  interest_rate: number;
  due_date: string | null;
  currency: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface SavingsGoal {
  id: string;
  workspace_id: string;
  account_id: string | null;
  name: string;
  target_amount: number;
  current_amount: number;
  target_date: string | null;
  monthly_contribution: number;
  currency: string;
  status: 'active' | 'completed' | 'paused';
  created_at: string;
  updated_at: string;
}

export interface SavingsContribution {
  id: string;
  workspace_id: string;
  goal_id: string;
  amount: number;
  contribution_date: string;
  notes: string;
  created_at: string;
}

export interface ImportBatch {
  id: string;
  workspace_id: string;
  account_id: string;
  filename: string;
  total_rows: number;
  imported_rows: number;
  skipped_duplicates: number;
  created_at: string;
}

export interface FinancialReport {
  id: string;
  workspace_id: string;
  title: string;
  report_type: 'monthly_summary' | 'cash_flow' | 'net_worth' | 'business_pnl';
  period_start: string;
  period_end: string;
  summary_json: Record<string, unknown>;
  created_at: string;
}

export interface BankConnection {
  id: string;
  workspace_id: string;
  provider: string;
  institution_name: string;
  institution_code: string;
  account_mask: string;
  linked_account_id: string | null;
  external_connection_id: string;
  status: 'connected' | 'reauth_required' | 'disconnected';
  is_simulated: boolean;
  last_synced_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface FinancialSnapshot {
  id: string;
  workspace_id: string;
  snapshot_date: string;
  total_cash_balances: number;
  total_assets: number;
  total_liabilities: number;
  net_worth: number;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceOverviewData {
  workspace: Workspace;
  businessDetails: BusinessDetails | null;
  accounts: FinancialAccount[];
  transactions: Transaction[];
  categories: Category[];
  assets: Asset[];
  liabilities: Liability[];
  savingsGoals: SavingsGoal[];
  savingsContributions: SavingsContribution[];
  importBatches: ImportBatch[];
  reports: FinancialReport[];
  bankConnections: BankConnection[];
  snapshots: FinancialSnapshot[];
}

export interface FinancialInsight {
  id: string;
  severity: 'positive' | 'caution' | 'neutral';
  title: string;
  detail: string;
}

export const DEFAULT_INCOME_CATEGORIES = [
  'Salary',
  'Business revenue',
  'Freelance income',
  'Investment income',
  'Gifts',
  'Other income',
] as const;

export const DEFAULT_EXPENSE_CATEGORIES = [
  'Food',
  'Transportation',
  'Housing',
  'Utilities',
  'Education',
  'Healthcare',
  'Entertainment',
  'Shopping',
  'Business operations',
  'Other expenses',
] as const;

export const CURRENCY_OPTIONS = [
  { code: 'NGN', symbol: '₦', label: 'Nigerian Naira (NGN)' },
  { code: 'USD', symbol: '$', label: 'US Dollar (USD)' },
  { code: 'GBP', symbol: '£', label: 'British Pound (GBP)' },
  { code: 'EUR', symbol: '€', label: 'Euro (EUR)' },
  { code: 'KES', symbol: 'KSh', label: 'Kenyan Shilling (KES)' },
  { code: 'GHS', symbol: '₵', label: 'Ghanaian Cedi (GHS)' },
] as const;

export const OnboardingSchema = z.object({
  display_name: z.string().trim().min(2, 'Display name must be at least 2 characters').max(80),
  country: z.string().trim().min(2).max(60).default('Nigeria'),
  preferred_currency: z.string().trim().length(3).default('NGN'),
  selection: z.enum(['personal', 'business', 'both']),
  personal_workspace_name: z.string().trim().max(80).optional(),
  business_workspace_name: z.string().trim().max(80).optional(),
  business_industry: z.string().trim().max(80).optional(),
});

export const CreateWorkspaceSchema = z.object({
  name: z.string().trim().min(2).max(80),
  type: z.enum(['personal', 'business']),
  currency: z.string().trim().length(3).default('NGN'),
  country: z.string().trim().min(2).max(60).default('Nigeria'),
  legal_name: z.string().trim().max(120).optional(),
  industry: z.string().trim().max(80).optional(),
});

export const AccountSchema = z.object({
  name: z.string().trim().min(2).max(80),
  institution: z.string().trim().max(80).default(''),
  account_type: z.enum(['savings', 'current', 'cash', 'business', 'investment', 'other']),
  currency: z.string().trim().length(3).default('NGN'),
  opening_balance: z.coerce.number().finite().min(-1_000_000_000_000).max(1_000_000_000_000),
  status: z.enum(['active', 'archived']).optional().default('active'),
});

export const TransactionSchema = z.object({
  account_id: z.string().min(1),
  transfer_to_account_id: z.string().nullable().optional(),
  description: z.string().trim().min(1).max(200),
  amount: z.coerce.number().finite().positive('Amount must be greater than zero').max(1_000_000_000_000),
  currency: z.string().trim().length(3).default('NGN'),
  type: z.enum(['income', 'expense', 'transfer']),
  category: z.string().trim().min(1).max(80),
  accounting_class: z.enum(['standard', 'owner_equity', 'owner_draw']).optional().default('standard'),
  tx_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD date format'),
  notes: z.string().trim().max(500).optional().default(''),
  reference: z.string().trim().max(120).optional().default(''),
  source: z.enum(['manual', 'csv_import', 'open_banking']).optional().default('manual'),
});

export const AssetSchema = z.object({
  name: z.string().trim().min(2).max(100),
  category: z.enum([
    'cash_equivalent',
    'real_estate',
    'equipment',
    'inventory',
    'investment',
    'vehicle',
    'receivable',
    'other',
  ]),
  valuation: z.coerce.number().finite().min(0).max(1_000_000_000_000),
  currency: z.string().trim().length(3).default('NGN'),
  acquired_date: z.string().nullable().optional(),
  notes: z.string().trim().max(400).optional().default(''),
});

export const LiabilitySchema = z.object({
  name: z.string().trim().min(2).max(100),
  category: z.enum(['loan', 'credit_card', 'mortgage', 'supplier_payable', 'tax_payable', 'other']),
  principal_balance: z.coerce.number().finite().min(0).max(1_000_000_000_000),
  interest_rate: z.coerce.number().finite().min(0).max(200).optional().default(0),
  due_date: z.string().nullable().optional(),
  currency: z.string().trim().length(3).default('NGN'),
  notes: z.string().trim().max(400).optional().default(''),
});

export const SavingsGoalSchema = z.object({
  account_id: z.string().nullable().optional(),
  name: z.string().trim().min(2).max(100),
  target_amount: z.coerce.number().finite().positive().max(1_000_000_000_000),
  current_amount: z.coerce.number().finite().min(0).max(1_000_000_000_000).optional().default(0),
  target_date: z.string().nullable().optional(),
  monthly_contribution: z.coerce.number().finite().min(0).max(1_000_000_000_000).optional().default(0),
  currency: z.string().trim().length(3).default('NGN'),
  status: z.enum(['active', 'completed', 'paused']).optional().default('active'),
});

export const SavingsContributionSchema = z.object({
  amount: z.coerce.number().finite().positive(),
  contribution_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().trim().max(300).optional().default(''),
});
