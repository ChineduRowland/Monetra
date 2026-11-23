import type { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
  type AccountType,
  type AccountingClass,
  type Asset,
  type BankConnection,
  type BusinessDetails,
  type Category,
  type FinancialAccount,
  type FinancialReport,
  type FinancialSnapshot,
  type ImportBatch,
  type Liability,
  type Profile,
  type SavingsContribution,
  type SavingsGoal,
  type Transaction,
  type Workspace,
  type WorkspaceOverviewData,
  type WorkspaceType,
} from '../src/shared/types.ts';
import {
  buildDedupHash,
  fromMinorUnits,
  reconcileAccountBalances,
  toMinorUnits,
} from '../src/shared/finance.ts';

export const isSupabaseConfigured = Boolean(
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
);

let supabaseAdmin: SupabaseClient | null = null;
if (isSupabaseConfigured) {
  supabaseAdmin = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

let sqlite!: DatabaseSync;

if (!isSupabaseConfigured) {
  const require = createRequire(path.resolve(process.cwd(), 'package.json'));
  const { DatabaseSync: SqliteDatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');
  const isServerless = Boolean(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME);
  const dataDir = isServerless
    ? path.join('/tmp', 'monetra-data')
    : path.resolve(process.cwd(), '.data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const sqlitePath = path.join(dataDir, 'monetra.sqlite');
  sqlite = new SqliteDatabaseSync(sqlitePath);
  sqlite.exec('PRAGMA foreign_keys = ON;');
  try {
    sqlite.exec('PRAGMA journal_mode = WAL;');
  } catch {
    // WAL mode may be unsupported on ephemeral /tmp mounts
  }

  sqlite.exec(`
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT,
  country TEXT NOT NULL DEFAULT 'Nigeria',
  preferred_currency TEXT NOT NULL DEFAULT 'NGN',
  avatar_url TEXT,
  onboarding_completed INTEGER NOT NULL DEFAULT 0,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS password_resets (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('personal', 'business')),
  currency TEXT NOT NULL DEFAULT 'NGN',
  country TEXT NOT NULL DEFAULT 'Nigeria',
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_members (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'owner',
  created_at TEXT NOT NULL,
  UNIQUE (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS business_details (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  legal_name TEXT NOT NULL DEFAULT '',
  industry TEXT NOT NULL DEFAULT '',
  registration_number TEXT NOT NULL DEFAULT '',
  tax_id TEXT NOT NULL DEFAULT '',
  fiscal_year_start_month INTEGER NOT NULL DEFAULT 1,
  monthly_revenue_target_minor INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS financial_accounts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  institution TEXT NOT NULL DEFAULT '',
  account_type TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NGN',
  opening_balance_minor INTEGER NOT NULL DEFAULT 0,
  current_balance_minor INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  external_provider TEXT,
  external_account_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  is_system INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE (workspace_id, type, name)
);

CREATE TABLE IF NOT EXISTS import_batches (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES financial_accounts(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  total_rows INTEGER NOT NULL DEFAULT 0,
  imported_rows INTEGER NOT NULL DEFAULT 0,
  skipped_duplicates INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES financial_accounts(id) ON DELETE RESTRICT,
  transfer_to_account_id TEXT REFERENCES financial_accounts(id) ON DELETE RESTRICT,
  description TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NGN',
  type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
  category TEXT NOT NULL,
  accounting_class TEXT NOT NULL DEFAULT 'standard',
  tx_date TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  reference TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'manual',
  import_batch_id TEXT REFERENCES import_batches(id) ON DELETE SET NULL,
  dedup_hash TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  valuation_minor INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NGN',
  acquired_date TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS liabilities (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  principal_balance_minor INTEGER NOT NULL,
  interest_rate REAL NOT NULL DEFAULT 0,
  due_date TEXT,
  currency TEXT NOT NULL DEFAULT 'NGN',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS savings_goals (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  account_id TEXT REFERENCES financial_accounts(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  target_amount_minor INTEGER NOT NULL,
  current_amount_minor INTEGER NOT NULL DEFAULT 0,
  target_date TEXT,
  monthly_contribution_minor INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'NGN',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS savings_contributions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  goal_id TEXT NOT NULL REFERENCES savings_goals(id) ON DELETE CASCADE,
  amount_minor INTEGER NOT NULL,
  contribution_date TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS financial_reports (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  report_type TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  summary_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bank_connections (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'mono',
  institution_name TEXT NOT NULL,
  institution_code TEXT NOT NULL DEFAULT '',
  account_mask TEXT NOT NULL DEFAULT '',
  linked_account_id TEXT REFERENCES financial_accounts(id) ON DELETE SET NULL,
  external_connection_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'connected',
  is_simulated INTEGER NOT NULL DEFAULT 1,
  last_synced_at TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS financial_snapshots (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  snapshot_date TEXT NOT NULL,
  total_cash_balances_minor INTEGER NOT NULL DEFAULT 0,
  total_assets_minor INTEGER NOT NULL DEFAULT 0,
  total_liabilities_minor INTEGER NOT NULL DEFAULT 0,
  net_worth_minor INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_tx_ws_date ON transactions(workspace_id, tx_date DESC);
CREATE INDEX IF NOT EXISTS idx_tx_ws_dedup ON transactions(workspace_id, dedup_hash);
`);
}

function nowIso(): string {
  return new Date().toISOString();
}

function uuid(): string {
  return crypto.randomUUID();
}

function mapProfileRow(row: Record<string, unknown>): Profile {
  return {
    id: String(row.id),
    email: String(row.email),
    display_name: String(row.display_name),
    country: String(row.country),
    preferred_currency: String(row.preferred_currency),
    avatar_url: row.avatar_url ? String(row.avatar_url) : null,
    onboarding_completed: Boolean(row.onboarding_completed),
    is_demo: Boolean(row.is_demo),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapWorkspaceRow(row: Record<string, unknown>): Workspace {
  return {
    id: String(row.id),
    owner_id: String(row.owner_id),
    name: String(row.name),
    type: String(row.type) as WorkspaceType,
    currency: String(row.currency),
    country: String(row.country),
    is_demo: Boolean(row.is_demo),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapAccountRow(row: Record<string, unknown>): FinancialAccount {
  return {
    id: String(row.id),
    workspace_id: String(row.workspace_id),
    name: String(row.name),
    institution: String(row.institution ?? ''),
    account_type: String(row.account_type) as AccountType,
    currency: String(row.currency),
    opening_balance:
      'opening_balance_minor' in row
        ? fromMinorUnits(Number(row.opening_balance_minor))
        : Number(row.opening_balance),
    current_balance:
      'current_balance_minor' in row
        ? fromMinorUnits(Number(row.current_balance_minor))
        : Number(row.current_balance),
    status: String(row.status) as 'active' | 'archived',
    external_provider: row.external_provider ? String(row.external_provider) : null,
    external_account_id: row.external_account_id ? String(row.external_account_id) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapTxRow(row: Record<string, unknown>): Transaction {
  return {
    id: String(row.id),
    workspace_id: String(row.workspace_id),
    account_id: String(row.account_id),
    transfer_to_account_id: row.transfer_to_account_id ? String(row.transfer_to_account_id) : null,
    description: String(row.description),
    amount:
      'amount_minor' in row ? fromMinorUnits(Number(row.amount_minor)) : Number(row.amount),
    currency: String(row.currency),
    type: String(row.type) as Transaction['type'],
    category: String(row.category),
    accounting_class: String(row.accounting_class ?? 'standard') as AccountingClass,
    tx_date: String(row.tx_date),
    notes: String(row.notes ?? ''),
    reference: String(row.reference ?? ''),
    source: String(row.source ?? 'manual') as Transaction['source'],
    import_batch_id: row.import_batch_id ? String(row.import_batch_id) : null,
    dedup_hash: row.dedup_hash ? String(row.dedup_hash) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function getProfileById(id: string): Promise<Profile | null> {
  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin.from('profiles').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? mapProfileRow(data) : null;
  }
  const row = sqlite.prepare('SELECT * FROM profiles WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? mapProfileRow(row) : null;
}

export async function getProfileByEmail(email: string): Promise<(Profile & { password_hash?: string | null }) | null> {
  const normEmail = email.trim().toLowerCase();
  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin.from('profiles').select('*').eq('email', normEmail).maybeSingle();
    if (error) throw error;
    return data ? mapProfileRow(data) : null;
  }
  const row = sqlite
    .prepare('SELECT * FROM profiles WHERE lower(email) = ?')
    .get(normEmail) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    ...mapProfileRow(row),
    password_hash: row.password_hash ? String(row.password_hash) : null,
  };
}

export async function createProfile(input: {
  id: string;
  email: string;
  display_name: string;
  password_hash?: string | null;
  country?: string;
  preferred_currency?: string;
  avatar_url?: string | null;
  onboarding_completed?: boolean;
  is_demo?: boolean;
}): Promise<Profile> {
  const now = nowIso();
  const normEmail = input.email.trim().toLowerCase();
  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .upsert(
        {
          id: input.id,
          email: normEmail,
          display_name: input.display_name,
          country: input.country ?? 'Nigeria',
          preferred_currency: input.preferred_currency ?? 'NGN',
          avatar_url: input.avatar_url ?? null,
          onboarding_completed: input.onboarding_completed ?? false,
          is_demo: input.is_demo ?? false,
          updated_at: now,
        },
        { onConflict: 'id' }
      )
      .select()
      .single();
    if (error) throw error;
    return mapProfileRow(data);
  }

  sqlite
    .prepare(
      `INSERT INTO profiles (id, email, display_name, password_hash, country, preferred_currency, avatar_url, onboarding_completed, is_demo, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.id,
      normEmail,
      input.display_name,
      input.password_hash ?? null,
      input.country ?? 'Nigeria',
      input.preferred_currency ?? 'NGN',
      input.avatar_url ?? null,
      input.onboarding_completed ? 1 : 0,
      input.is_demo ? 1 : 0,
      now,
      now
    );

  return (await getProfileById(input.id))!;
}

export async function updateProfileDetails(
  id: string,
  updates: Partial<Pick<Profile, 'display_name' | 'country' | 'preferred_currency' | 'avatar_url' | 'onboarding_completed'>>
): Promise<Profile> {
  const now = nowIso();
  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update({ ...updates, updated_at: now })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return mapProfileRow(data);
  }

  const current = await getProfileById(id);
  if (!current) throw new Error('Profile not found');
  sqlite
    .prepare(
      `UPDATE profiles SET display_name = ?, country = ?, preferred_currency = ?, avatar_url = ?, onboarding_completed = ?, updated_at = ? WHERE id = ?`
    )
    .run(
      updates.display_name ?? current.display_name,
      updates.country ?? current.country,
      updates.preferred_currency ?? current.preferred_currency,
      updates.avatar_url !== undefined ? updates.avatar_url : current.avatar_url,
      (updates.onboarding_completed ?? current.onboarding_completed) ? 1 : 0,
      now,
      id
    );
  return (await getProfileById(id))!;
}

export async function updateProfilePassword(id: string, passwordHash: string): Promise<void> {
  if (supabaseAdmin) return;
  sqlite
    .prepare('UPDATE profiles SET password_hash = ?, updated_at = ? WHERE id = ?')
    .run(passwordHash, nowIso(), id);
}

export async function deleteUserAccountData(userId: string): Promise<void> {
  if (supabaseAdmin) {
    await supabaseAdmin.from('workspaces').delete().eq('owner_id', userId);
    await supabaseAdmin.from('profiles').delete().eq('id', userId);
    return;
  }
  sqlite.prepare('DELETE FROM workspaces WHERE owner_id = ?').run(userId);
  sqlite.prepare('DELETE FROM profiles WHERE id = ?').run(userId);
}

export async function createPasswordResetToken(userId: string, token: string): Promise<void> {
  if (supabaseAdmin) return;
  const expiresAt = Date.now() + 15 * 60 * 1000;
  sqlite.prepare('DELETE FROM password_resets WHERE user_id = ?').run(userId);
  sqlite
    .prepare('INSERT INTO password_resets (token, user_id, expires_at) VALUES (?, ?, ?)')
    .run(token, userId, expiresAt);
}

export async function consumePasswordResetToken(token: string): Promise<string | null> {
  if (supabaseAdmin) return null;
  const row = sqlite
    .prepare('SELECT * FROM password_resets WHERE token = ?')
    .get(token.trim().toUpperCase()) as { token: string; user_id: string; expires_at: number } | undefined;
  if (!row) return null;
  sqlite.prepare('DELETE FROM password_resets WHERE token = ?').run(row.token);
  if (row.expires_at < Date.now()) return null;
  return row.user_id;
}

export async function listWorkspacesForUser(userId: string): Promise<Workspace[]> {
  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin
      .from('workspaces')
      .select('*')
      .eq('owner_id', userId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapWorkspaceRow);
  }
  const rows = sqlite
    .prepare(
      `SELECT w.* FROM workspaces w
       LEFT JOIN workspace_members m ON m.workspace_id = w.id
       WHERE w.owner_id = ? OR m.user_id = ?
       GROUP BY w.id
       ORDER BY w.created_at ASC`
    )
    .all(userId, userId) as Record<string, unknown>[];
  return rows.map(mapWorkspaceRow);
}

export async function verifyWorkspaceAccess(workspaceId: string, userId: string): Promise<Workspace | null> {
  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin
      .from('workspaces')
      .select('*')
      .eq('id', workspaceId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    if (data.owner_id === userId) return mapWorkspaceRow(data);
    const { data: member } = await supabaseAdmin
      .from('workspace_members')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .maybeSingle();
    return member ? mapWorkspaceRow(data) : null;
  }

  const row = sqlite
    .prepare(
      `SELECT w.* FROM workspaces w
       LEFT JOIN workspace_members m ON m.workspace_id = w.id
       WHERE w.id = ? AND (w.owner_id = ? OR m.user_id = ?)
       LIMIT 1`
    )
    .get(workspaceId, userId, userId) as Record<string, unknown> | undefined;
  return row ? mapWorkspaceRow(row) : null;
}

async function seedDefaultCategories(workspaceId: string): Promise<void> {
  const now = nowIso();
  if (supabaseAdmin) {
    const rows = [
      ...DEFAULT_INCOME_CATEGORIES.map((name) => ({
        workspace_id: workspaceId,
        name,
        type: 'income',
        is_system: true,
      })),
      ...DEFAULT_EXPENSE_CATEGORIES.map((name) => ({
        workspace_id: workspaceId,
        name,
        type: 'expense',
        is_system: true,
      })),
    ];
    await supabaseAdmin.from('categories').upsert(rows, { onConflict: 'workspace_id,type,name' });
    return;
  }

  const stmt = sqlite.prepare(
    `INSERT OR IGNORE INTO categories (id, workspace_id, name, type, is_system, created_at) VALUES (?, ?, ?, ?, 1, ?)`
  );
  for (const name of DEFAULT_INCOME_CATEGORIES) {
    stmt.run(uuid(), workspaceId, name, 'income', now);
  }
  for (const name of DEFAULT_EXPENSE_CATEGORIES) {
    stmt.run(uuid(), workspaceId, name, 'expense', now);
  }
}

export async function createWorkspace(input: {
  id?: string;
  owner_id: string;
  name: string;
  type: WorkspaceType;
  currency?: string;
  country?: string;
  legal_name?: string;
  industry?: string;
  is_demo?: boolean;
}): Promise<Workspace> {
  const id = input.id ?? uuid();
  const now = nowIso();
  const currency = input.currency ?? 'NGN';
  const country = input.country ?? 'Nigeria';

  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin
      .from('workspaces')
      .insert({
        id,
        owner_id: input.owner_id,
        name: input.name,
        type: input.type,
        currency,
        country,
        is_demo: input.is_demo ?? false,
      })
      .select()
      .single();
    if (error) throw error;

    await supabaseAdmin.from('workspace_members').insert({
      workspace_id: id,
      user_id: input.owner_id,
      role: 'owner',
    });

    if (input.type === 'business') {
      await supabaseAdmin.from('business_details').upsert({
        workspace_id: id,
        legal_name: input.legal_name ?? input.name,
        industry: input.industry ?? 'General Commerce & Services',
      });
    }

    await seedDefaultCategories(id);
    return mapWorkspaceRow(data);
  }

  sqlite
    .prepare(
      `INSERT INTO workspaces (id, owner_id, name, type, currency, country, is_demo, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(id, input.owner_id, input.name, input.type, currency, country, input.is_demo ? 1 : 0, now, now);

  sqlite
    .prepare(
      `INSERT INTO workspace_members (id, workspace_id, user_id, role, created_at) VALUES (?, ?, ?, 'owner', ?)`
    )
    .run(uuid(), id, input.owner_id, now);

  if (input.type === 'business') {
    sqlite
      .prepare(
        `INSERT INTO business_details (workspace_id, legal_name, industry, registration_number, tax_id, fiscal_year_start_month, monthly_revenue_target_minor, updated_at)
         VALUES (?, ?, ?, '', '', 1, 0, ?)`
      )
      .run(id, input.legal_name ?? input.name, input.industry ?? 'General Commerce & Services', now);
  }

  await seedDefaultCategories(id);
  const created = sqlite.prepare('SELECT * FROM workspaces WHERE id = ?').get(id) as Record<string, unknown>;
  return mapWorkspaceRow(created);
}

export async function updateWorkspaceName(workspaceId: string, name: string): Promise<Workspace> {
  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin
      .from('workspaces')
      .update({ name, updated_at: nowIso() })
      .eq('id', workspaceId)
      .select()
      .single();
    if (error) throw error;
    return mapWorkspaceRow(data);
  }
  sqlite.prepare('UPDATE workspaces SET name = ?, updated_at = ? WHERE id = ?').run(name, nowIso(), workspaceId);
  const row = sqlite.prepare('SELECT * FROM workspaces WHERE id = ?').get(workspaceId) as Record<string, unknown>;
  return mapWorkspaceRow(row);
}

export async function deleteWorkspace(workspaceId: string): Promise<void> {
  if (supabaseAdmin) {
    const { error } = await supabaseAdmin.from('workspaces').delete().eq('id', workspaceId);
    if (error) throw error;
    return;
  }
  sqlite.prepare('DELETE FROM workspaces WHERE id = ?').run(workspaceId);
}

export async function updateBusinessDetails(
  workspaceId: string,
  details: Partial<Omit<BusinessDetails, 'workspace_id' | 'updated_at'>>
): Promise<BusinessDetails> {
  const now = nowIso();
  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin
      .from('business_details')
      .upsert({
        workspace_id: workspaceId,
        ...details,
        updated_at: now,
      })
      .select()
      .single();
    if (error) throw error;
    return {
      workspace_id: String(data.workspace_id),
      legal_name: String(data.legal_name ?? ''),
      industry: String(data.industry ?? ''),
      registration_number: String(data.registration_number ?? ''),
      tax_id: String(data.tax_id ?? ''),
      fiscal_year_start_month: Number(data.fiscal_year_start_month ?? 1),
      monthly_revenue_target: Number(data.monthly_revenue_target ?? 0),
      updated_at: String(data.updated_at),
    };
  }

  const current = sqlite
    .prepare('SELECT * FROM business_details WHERE workspace_id = ?')
    .get(workspaceId) as Record<string, unknown> | undefined;

  const legalName = details.legal_name ?? String(current?.legal_name ?? '');
  const industry = details.industry ?? String(current?.industry ?? '');
  const regNo = details.registration_number ?? String(current?.registration_number ?? '');
  const taxId = details.tax_id ?? String(current?.tax_id ?? '');
  const fiscalMonth = details.fiscal_year_start_month ?? Number(current?.fiscal_year_start_month ?? 1);
  const targetMinor =
    details.monthly_revenue_target !== undefined
      ? toMinorUnits(details.monthly_revenue_target)
      : Number(current?.monthly_revenue_target_minor ?? 0);

  sqlite
    .prepare(
      `INSERT INTO business_details (workspace_id, legal_name, industry, registration_number, tax_id, fiscal_year_start_month, monthly_revenue_target_minor, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(workspace_id) DO UPDATE SET
         legal_name = excluded.legal_name,
         industry = excluded.industry,
         registration_number = excluded.registration_number,
         tax_id = excluded.tax_id,
         fiscal_year_start_month = excluded.fiscal_year_start_month,
         monthly_revenue_target_minor = excluded.monthly_revenue_target_minor,
         updated_at = excluded.updated_at`
    )
    .run(workspaceId, legalName, industry, regNo, taxId, fiscalMonth, targetMinor, now);

  return {
    workspace_id: workspaceId,
    legal_name: legalName,
    industry,
    registration_number: regNo,
    tax_id: taxId,
    fiscal_year_start_month: fiscalMonth,
    monthly_revenue_target: fromMinorUnits(targetMinor),
    updated_at: now,
  };
}

/**
 * Recomputes and persists every account's current_balance from its opening_balance + all ledger transactions.
 */
export async function syncReconciledBalancesForWorkspace(workspaceId: string): Promise<void> {
  if (supabaseAdmin) {
    const [{ data: accRows }, { data: txRows }] = await Promise.all([
      supabaseAdmin.from('financial_accounts').select('*').eq('workspace_id', workspaceId),
      supabaseAdmin.from('transactions').select('*').eq('workspace_id', workspaceId),
    ]);
    const accounts = (accRows ?? []).map(mapAccountRow);
    const transactions = (txRows ?? []).map(mapTxRow);
    const reconciled = reconcileAccountBalances(accounts, transactions);
    for (const acc of accounts) {
      const nextBal = reconciled[acc.id] ?? acc.opening_balance;
      if (toMinorUnits(nextBal) !== toMinorUnits(acc.current_balance)) {
        await supabaseAdmin
          .from('financial_accounts')
          .update({ current_balance: nextBal, updated_at: nowIso() })
          .eq('id', acc.id);
      }
    }
    return;
  }

  const accRows = sqlite
    .prepare('SELECT * FROM financial_accounts WHERE workspace_id = ?')
    .all(workspaceId) as Record<string, unknown>[];
  const txRows = sqlite
    .prepare('SELECT * FROM transactions WHERE workspace_id = ?')
    .all(workspaceId) as Record<string, unknown>[];
  const accounts = accRows.map(mapAccountRow);
  const transactions = txRows.map(mapTxRow);
  const reconciled = reconcileAccountBalances(accounts, transactions);
  const stmt = sqlite.prepare(
    'UPDATE financial_accounts SET current_balance_minor = ?, updated_at = ? WHERE id = ?'
  );
  const now = nowIso();
  for (const acc of accounts) {
    const nextMinor = toMinorUnits(reconciled[acc.id] ?? acc.opening_balance);
    if (nextMinor !== toMinorUnits(acc.current_balance)) {
      stmt.run(nextMinor, now, acc.id);
    }
  }
}

export async function getWorkspaceOverview(workspaceId: string): Promise<WorkspaceOverviewData> {
  if (supabaseAdmin) {
    const [
      wsRes,
      bizRes,
      accRes,
      txRes,
      catRes,
      assetRes,
      liabRes,
      goalRes,
      contribRes,
      batchRes,
      reportRes,
      connRes,
      snapRes,
    ] = await Promise.all([
      supabaseAdmin.from('workspaces').select('*').eq('id', workspaceId).single(),
      supabaseAdmin.from('business_details').select('*').eq('workspace_id', workspaceId).maybeSingle(),
      supabaseAdmin.from('financial_accounts').select('*').eq('workspace_id', workspaceId).order('created_at'),
      supabaseAdmin
        .from('transactions')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('tx_date', { ascending: false })
        .order('created_at', { ascending: false }),
      supabaseAdmin.from('categories').select('*').eq('workspace_id', workspaceId).order('name'),
      supabaseAdmin.from('assets').select('*').eq('workspace_id', workspaceId).order('created_at', { ascending: false }),
      supabaseAdmin.from('liabilities').select('*').eq('workspace_id', workspaceId).order('created_at', { ascending: false }),
      supabaseAdmin.from('savings_goals').select('*').eq('workspace_id', workspaceId).order('created_at', { ascending: false }),
      supabaseAdmin
        .from('savings_contributions')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('contribution_date', { ascending: false }),
      supabaseAdmin.from('import_batches').select('*').eq('workspace_id', workspaceId).order('created_at', { ascending: false }),
      supabaseAdmin.from('financial_reports').select('*').eq('workspace_id', workspaceId).order('created_at', { ascending: false }),
      supabaseAdmin.from('bank_connections').select('*').eq('workspace_id', workspaceId).order('created_at', { ascending: false }),
      supabaseAdmin.from('financial_snapshots').select('*').eq('workspace_id', workspaceId).order('snapshot_date', { ascending: true }),
    ]);

    if (wsRes.error) throw wsRes.error;
    const workspace = mapWorkspaceRow(wsRes.data);
    const accounts = (accRes.data ?? []).map(mapAccountRow);
    const transactions = (txRes.data ?? []).map(mapTxRow);
    const reconciled = reconcileAccountBalances(accounts, transactions);
    for (const acc of accounts) {
      acc.current_balance = reconciled[acc.id] ?? acc.opening_balance;
    }

    return {
      workspace,
      businessDetails: bizRes.data
        ? {
            workspace_id: String(bizRes.data.workspace_id),
            legal_name: String(bizRes.data.legal_name ?? ''),
            industry: String(bizRes.data.industry ?? ''),
            registration_number: String(bizRes.data.registration_number ?? ''),
            tax_id: String(bizRes.data.tax_id ?? ''),
            fiscal_year_start_month: Number(bizRes.data.fiscal_year_start_month ?? 1),
            monthly_revenue_target: Number(bizRes.data.monthly_revenue_target ?? 0),
            updated_at: String(bizRes.data.updated_at),
          }
        : null,
      accounts,
      transactions,
      categories: (catRes.data ?? []).map((c) => ({
        id: String(c.id),
        workspace_id: String(c.workspace_id),
        name: String(c.name),
        type: c.type as 'income' | 'expense',
        is_system: Boolean(c.is_system),
        created_at: String(c.created_at),
      })),
      assets: (assetRes.data ?? []).map((a) => ({
        id: String(a.id),
        workspace_id: String(a.workspace_id),
        name: String(a.name),
        category: a.category as Asset['category'],
        valuation: Number(a.valuation),
        currency: String(a.currency),
        acquired_date: a.acquired_date ? String(a.acquired_date) : null,
        notes: String(a.notes ?? ''),
        created_at: String(a.created_at),
        updated_at: String(a.updated_at),
      })),
      liabilities: (liabRes.data ?? []).map((l) => ({
        id: String(l.id),
        workspace_id: String(l.workspace_id),
        name: String(l.name),
        category: l.category as Liability['category'],
        principal_balance: Number(l.principal_balance),
        interest_rate: Number(l.interest_rate ?? 0),
        due_date: l.due_date ? String(l.due_date) : null,
        currency: String(l.currency),
        notes: String(l.notes ?? ''),
        created_at: String(l.created_at),
        updated_at: String(l.updated_at),
      })),
      savingsGoals: (goalRes.data ?? []).map((g) => ({
        id: String(g.id),
        workspace_id: String(g.workspace_id),
        account_id: g.account_id ? String(g.account_id) : null,
        name: String(g.name),
        target_amount: Number(g.target_amount),
        current_amount: Number(g.current_amount),
        target_date: g.target_date ? String(g.target_date) : null,
        monthly_contribution: Number(g.monthly_contribution ?? 0),
        currency: String(g.currency),
        status: g.status as SavingsGoal['status'],
        created_at: String(g.created_at),
        updated_at: String(g.updated_at),
      })),
      savingsContributions: (contribRes.data ?? []).map((c) => ({
        id: String(c.id),
        workspace_id: String(c.workspace_id),
        goal_id: String(c.goal_id),
        amount: Number(c.amount),
        contribution_date: String(c.contribution_date),
        notes: String(c.notes ?? ''),
        created_at: String(c.created_at),
      })),
      importBatches: (batchRes.data ?? []).map((b) => ({
        id: String(b.id),
        workspace_id: String(b.workspace_id),
        account_id: String(b.account_id),
        filename: String(b.filename),
        total_rows: Number(b.total_rows),
        imported_rows: Number(b.imported_rows),
        skipped_duplicates: Number(b.skipped_duplicates),
        created_at: String(b.created_at),
      })),
      reports: (reportRes.data ?? []).map((r) => ({
        id: String(r.id),
        workspace_id: String(r.workspace_id),
        title: String(r.title),
        report_type: r.report_type as FinancialReport['report_type'],
        period_start: String(r.period_start),
        period_end: String(r.period_end),
        summary_json: (r.summary_json ?? {}) as Record<string, unknown>,
        created_at: String(r.created_at),
      })),
      bankConnections: (connRes.data ?? []).map((bc) => ({
        id: String(bc.id),
        workspace_id: String(bc.workspace_id),
        provider: String(bc.provider),
        institution_name: String(bc.institution_name),
        institution_code: String(bc.institution_code ?? ''),
        account_mask: String(bc.account_mask ?? ''),
        linked_account_id: bc.linked_account_id ? String(bc.linked_account_id) : null,
        external_connection_id: String(bc.external_connection_id),
        status: bc.status as BankConnection['status'],
        is_simulated: Boolean(bc.is_simulated),
        last_synced_at: bc.last_synced_at ? String(bc.last_synced_at) : null,
        metadata: (bc.metadata ?? {}) as Record<string, unknown>,
        created_at: String(bc.created_at),
        updated_at: String(bc.updated_at),
      })),
      snapshots: (snapRes.data ?? []).map((s) => ({
        id: String(s.id),
        workspace_id: String(s.workspace_id),
        snapshot_date: String(s.snapshot_date),
        total_cash_balances: Number(s.total_cash_balances),
        total_assets: Number(s.total_assets),
        total_liabilities: Number(s.total_liabilities),
        net_worth: Number(s.net_worth),
        created_at: String(s.created_at),
        updated_at: String(s.updated_at),
      })),
    };
  }

  const wsRow = sqlite.prepare('SELECT * FROM workspaces WHERE id = ?').get(workspaceId) as Record<string, unknown> | undefined;
  if (!wsRow) throw new Error('Workspace not found');
  const workspace = mapWorkspaceRow(wsRow);

  const bizRow = sqlite.prepare('SELECT * FROM business_details WHERE workspace_id = ?').get(workspaceId) as Record<string, unknown> | undefined;
  const accRows = sqlite.prepare('SELECT * FROM financial_accounts WHERE workspace_id = ? ORDER BY created_at ASC').all(workspaceId) as Record<string, unknown>[];
  const txRows = sqlite.prepare('SELECT * FROM transactions WHERE workspace_id = ? ORDER BY tx_date DESC, created_at DESC').all(workspaceId) as Record<string, unknown>[];
  const catRows = sqlite.prepare('SELECT * FROM categories WHERE workspace_id = ? ORDER BY name ASC').all(workspaceId) as Record<string, unknown>[];
  const assetRows = sqlite.prepare('SELECT * FROM assets WHERE workspace_id = ? ORDER BY created_at DESC').all(workspaceId) as Record<string, unknown>[];
  const liabRows = sqlite.prepare('SELECT * FROM liabilities WHERE workspace_id = ? ORDER BY created_at DESC').all(workspaceId) as Record<string, unknown>[];
  const goalRows = sqlite.prepare('SELECT * FROM savings_goals WHERE workspace_id = ? ORDER BY created_at DESC').all(workspaceId) as Record<string, unknown>[];
  const contribRows = sqlite.prepare('SELECT * FROM savings_contributions WHERE workspace_id = ? ORDER BY contribution_date DESC').all(workspaceId) as Record<string, unknown>[];
  const batchRows = sqlite.prepare('SELECT * FROM import_batches WHERE workspace_id = ? ORDER BY created_at DESC').all(workspaceId) as Record<string, unknown>[];
  const reportRows = sqlite.prepare('SELECT * FROM financial_reports WHERE workspace_id = ? ORDER BY created_at DESC').all(workspaceId) as Record<string, unknown>[];
  const connRows = sqlite.prepare('SELECT * FROM bank_connections WHERE workspace_id = ? ORDER BY created_at DESC').all(workspaceId) as Record<string, unknown>[];
  const snapRows = sqlite.prepare('SELECT * FROM financial_snapshots WHERE workspace_id = ? ORDER BY snapshot_date ASC').all(workspaceId) as Record<string, unknown>[];

  const accounts = accRows.map(mapAccountRow);
  const transactions = txRows.map(mapTxRow);
  const reconciled = reconcileAccountBalances(accounts, transactions);
  for (const acc of accounts) {
    acc.current_balance = reconciled[acc.id] ?? acc.opening_balance;
  }

  return {
    workspace,
    businessDetails: bizRow
      ? {
          workspace_id: String(bizRow.workspace_id),
          legal_name: String(bizRow.legal_name ?? ''),
          industry: String(bizRow.industry ?? ''),
          registration_number: String(bizRow.registration_number ?? ''),
          tax_id: String(bizRow.tax_id ?? ''),
          fiscal_year_start_month: Number(bizRow.fiscal_year_start_month ?? 1),
          monthly_revenue_target: fromMinorUnits(Number(bizRow.monthly_revenue_target_minor ?? 0)),
          updated_at: String(bizRow.updated_at),
        }
      : null,
    accounts,
    transactions,
    categories: catRows.map((c) => ({
      id: String(c.id),
      workspace_id: String(c.workspace_id),
      name: String(c.name),
      type: String(c.type) as 'income' | 'expense',
      is_system: Boolean(c.is_system),
      created_at: String(c.created_at),
    })),
    assets: assetRows.map((a) => ({
      id: String(a.id),
      workspace_id: String(a.workspace_id),
      name: String(a.name),
      category: String(a.category) as Asset['category'],
      valuation: fromMinorUnits(Number(a.valuation_minor)),
      currency: String(a.currency),
      acquired_date: a.acquired_date ? String(a.acquired_date) : null,
      notes: String(a.notes ?? ''),
      created_at: String(a.created_at),
      updated_at: String(a.updated_at),
    })),
    liabilities: liabRows.map((l) => ({
      id: String(l.id),
      workspace_id: String(l.workspace_id),
      name: String(l.name),
      category: String(l.category) as Liability['category'],
      principal_balance: fromMinorUnits(Number(l.principal_balance_minor)),
      interest_rate: Number(l.interest_rate ?? 0),
      due_date: l.due_date ? String(l.due_date) : null,
      currency: String(l.currency),
      notes: String(l.notes ?? ''),
      created_at: String(l.created_at),
      updated_at: String(l.updated_at),
    })),
    savingsGoals: goalRows.map((g) => ({
      id: String(g.id),
      workspace_id: String(g.workspace_id),
      account_id: g.account_id ? String(g.account_id) : null,
      name: String(g.name),
      target_amount: fromMinorUnits(Number(g.target_amount_minor)),
      current_amount: fromMinorUnits(Number(g.current_amount_minor)),
      target_date: g.target_date ? String(g.target_date) : null,
      monthly_contribution: fromMinorUnits(Number(g.monthly_contribution_minor ?? 0)),
      currency: String(g.currency),
      status: String(g.status) as SavingsGoal['status'],
      created_at: String(g.created_at),
      updated_at: String(g.updated_at),
    })),
    savingsContributions: contribRows.map((c) => ({
      id: String(c.id),
      workspace_id: String(c.workspace_id),
      goal_id: String(c.goal_id),
      amount: fromMinorUnits(Number(c.amount_minor)),
      contribution_date: String(c.contribution_date),
      notes: String(c.notes ?? ''),
      created_at: String(c.created_at),
    })),
    importBatches: batchRows.map((b) => ({
      id: String(b.id),
      workspace_id: String(b.workspace_id),
      account_id: String(b.account_id),
      filename: String(b.filename),
      total_rows: Number(b.total_rows),
      imported_rows: Number(b.imported_rows),
      skipped_duplicates: Number(b.skipped_duplicates),
      created_at: String(b.created_at),
    })),
    reports: reportRows.map((r) => ({
      id: String(r.id),
      workspace_id: String(r.workspace_id),
      title: String(r.title),
      report_type: String(r.report_type) as FinancialReport['report_type'],
      period_start: String(r.period_start),
      period_end: String(r.period_end),
      summary_json: JSON.parse(String(r.summary_json || '{}')) as Record<string, unknown>,
      created_at: String(r.created_at),
    })),
    bankConnections: connRows.map((bc) => ({
      id: String(bc.id),
      workspace_id: String(bc.workspace_id),
      provider: String(bc.provider),
      institution_name: String(bc.institution_name),
      institution_code: String(bc.institution_code ?? ''),
      account_mask: String(bc.account_mask ?? ''),
      linked_account_id: bc.linked_account_id ? String(bc.linked_account_id) : null,
      external_connection_id: String(bc.external_connection_id),
      status: String(bc.status) as BankConnection['status'],
      is_simulated: Boolean(bc.is_simulated),
      last_synced_at: bc.last_synced_at ? String(bc.last_synced_at) : null,
      metadata: JSON.parse(String(bc.metadata || '{}')) as Record<string, unknown>,
      created_at: String(bc.created_at),
      updated_at: String(bc.updated_at),
    })),
    snapshots: snapRows.map((s) => ({
      id: String(s.id),
      workspace_id: String(s.workspace_id),
      snapshot_date: String(s.snapshot_date),
      total_cash_balances: fromMinorUnits(Number(s.total_cash_balances_minor)),
      total_assets: fromMinorUnits(Number(s.total_assets_minor)),
      total_liabilities: fromMinorUnits(Number(s.total_liabilities_minor)),
      net_worth: fromMinorUnits(Number(s.net_worth_minor)),
      created_at: String(s.created_at),
      updated_at: String(s.updated_at),
    })),
  };
}

export async function createAccount(
  workspaceId: string,
  input: {
    id?: string;
    name: string;
    institution: string;
    account_type: AccountType;
    currency: string;
    opening_balance: number;
    status?: 'active' | 'archived';
    external_provider?: string | null;
    external_account_id?: string | null;
  }
): Promise<FinancialAccount> {
  const id = input.id ?? uuid();
  const now = nowIso();
  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin
      .from('financial_accounts')
      .insert({
        id,
        workspace_id: workspaceId,
        name: input.name,
        institution: input.institution,
        account_type: input.account_type,
        currency: input.currency,
        opening_balance: input.opening_balance,
        current_balance: input.opening_balance,
        status: input.status ?? 'active',
        external_provider: input.external_provider ?? null,
        external_account_id: input.external_account_id ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return mapAccountRow(data);
  }

  const openMinor = toMinorUnits(input.opening_balance);
  sqlite
    .prepare(
      `INSERT INTO financial_accounts (id, workspace_id, name, institution, account_type, currency, opening_balance_minor, current_balance_minor, status, external_provider, external_account_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      workspaceId,
      input.name,
      input.institution,
      input.account_type,
      input.currency,
      openMinor,
      openMinor,
      input.status ?? 'active',
      input.external_provider ?? null,
      input.external_account_id ?? null,
      now,
      now
    );

  const row = sqlite.prepare('SELECT * FROM financial_accounts WHERE id = ?').get(id) as Record<string, unknown>;
  return mapAccountRow(row);
}

export async function updateAccount(
  workspaceId: string,
  accountId: string,
  updates: Partial<{
    name: string;
    institution: string;
    account_type: AccountType;
    currency: string;
    opening_balance: number;
    status: 'active' | 'archived';
  }>
): Promise<FinancialAccount> {
  const now = nowIso();
  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin
      .from('financial_accounts')
      .update({ ...updates, updated_at: now })
      .eq('id', accountId)
      .eq('workspace_id', workspaceId)
      .select()
      .single();
    if (error) throw error;
    await syncReconciledBalancesForWorkspace(workspaceId);
    const { data: refreshed } = await supabaseAdmin.from('financial_accounts').select('*').eq('id', accountId).single();
    return mapAccountRow(refreshed ?? data);
  }

  const currentRow = sqlite
    .prepare('SELECT * FROM financial_accounts WHERE id = ? AND workspace_id = ?')
    .get(accountId, workspaceId) as Record<string, unknown> | undefined;
  if (!currentRow) throw new Error('Account not found');
  const current = mapAccountRow(currentRow);

  sqlite
    .prepare(
      `UPDATE financial_accounts
       SET name = ?, institution = ?, account_type = ?, currency = ?, opening_balance_minor = ?, status = ?, updated_at = ?
       WHERE id = ? AND workspace_id = ?`
    )
    .run(
      updates.name ?? current.name,
      updates.institution ?? current.institution,
      updates.account_type ?? current.account_type,
      updates.currency ?? current.currency,
      toMinorUnits(updates.opening_balance ?? current.opening_balance),
      updates.status ?? current.status,
      now,
      accountId,
      workspaceId
    );
  await syncReconciledBalancesForWorkspace(workspaceId);
  const refreshed = sqlite.prepare('SELECT * FROM financial_accounts WHERE id = ?').get(accountId) as Record<string, unknown>;
  return mapAccountRow(refreshed);
}

export async function createCustomCategory(
  workspaceId: string,
  name: string,
  type: 'income' | 'expense'
): Promise<Category> {
  const cleanName = name.trim();
  const now = nowIso();
  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin
      .from('categories')
      .upsert(
        { workspace_id: workspaceId, name: cleanName, type, is_system: false },
        { onConflict: 'workspace_id,type,name' }
      )
      .select()
      .single();
    if (error) throw error;
    return {
      id: String(data.id),
      workspace_id: String(data.workspace_id),
      name: String(data.name),
      type: data.type as 'income' | 'expense',
      is_system: Boolean(data.is_system),
      created_at: String(data.created_at),
    };
  }

  const existing = sqlite
    .prepare('SELECT * FROM categories WHERE workspace_id = ? AND type = ? AND lower(name) = lower(?)')
    .get(workspaceId, type, cleanName) as Record<string, unknown> | undefined;
  if (existing) {
    return {
      id: String(existing.id),
      workspace_id: String(existing.workspace_id),
      name: String(existing.name),
      type: String(existing.type) as 'income' | 'expense',
      is_system: Boolean(existing.is_system),
      created_at: String(existing.created_at),
    };
  }
  const id = uuid();
  sqlite
    .prepare('INSERT INTO categories (id, workspace_id, name, type, is_system, created_at) VALUES (?, ?, ?, ?, 0, ?)')
    .run(id, workspaceId, cleanName, type, now);
  return { id, workspace_id: workspaceId, name: cleanName, type, is_system: false, created_at: now };
}

export async function createTransaction(
  workspaceId: string,
  input: Omit<Transaction, 'id' | 'workspace_id' | 'created_at' | 'updated_at'> & { id?: string }
): Promise<Transaction> {
  const id = input.id ?? uuid();
  const now = nowIso();
  const dedupHash =
    input.dedup_hash ??
    buildDedupHash({
      workspaceId,
      accountId: input.account_id,
      txDate: input.tx_date,
      amount: input.amount,
      type: input.type,
      description: input.description,
      reference: input.reference,
    });

  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin
      .from('transactions')
      .insert({
        id,
        workspace_id: workspaceId,
        account_id: input.account_id,
        transfer_to_account_id: input.transfer_to_account_id ?? null,
        description: input.description,
        amount: input.amount,
        currency: input.currency,
        type: input.type,
        category: input.category,
        accounting_class: input.accounting_class ?? 'standard',
        tx_date: input.tx_date,
        notes: input.notes ?? '',
        reference: input.reference ?? '',
        source: input.source ?? 'manual',
        import_batch_id: input.import_batch_id ?? null,
        dedup_hash: dedupHash,
      })
      .select()
      .single();
    if (error) throw error;
    await syncReconciledBalancesForWorkspace(workspaceId);
    return mapTxRow(data);
  }

  sqlite
    .prepare(
      `INSERT INTO transactions (
        id, workspace_id, account_id, transfer_to_account_id, description, amount_minor, currency, type, category, accounting_class, tx_date, notes, reference, source, import_batch_id, dedup_hash, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      workspaceId,
      input.account_id,
      input.transfer_to_account_id ?? null,
      input.description,
      toMinorUnits(input.amount),
      input.currency,
      input.type,
      input.category,
      input.accounting_class ?? 'standard',
      input.tx_date,
      input.notes ?? '',
      input.reference ?? '',
      input.source ?? 'manual',
      input.import_batch_id ?? null,
      dedupHash,
      now,
      now
    );

  await syncReconciledBalancesForWorkspace(workspaceId);
  const row = sqlite.prepare('SELECT * FROM transactions WHERE id = ?').get(id) as Record<string, unknown>;
  return mapTxRow(row);
}

export async function updateTransaction(
  workspaceId: string,
  txId: string,
  updates: Partial<Omit<Transaction, 'id' | 'workspace_id' | 'created_at' | 'updated_at'>>
): Promise<Transaction> {
  const now = nowIso();
  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin
      .from('transactions')
      .update({ ...updates, updated_at: now })
      .eq('id', txId)
      .eq('workspace_id', workspaceId)
      .select()
      .single();
    if (error) throw error;
    await syncReconciledBalancesForWorkspace(workspaceId);
    return mapTxRow(data);
  }

  const row = sqlite
    .prepare('SELECT * FROM transactions WHERE id = ? AND workspace_id = ?')
    .get(txId, workspaceId) as Record<string, unknown> | undefined;
  if (!row) throw new Error('Transaction not found');
  const cur = mapTxRow(row);

  const next = {
    account_id: updates.account_id ?? cur.account_id,
    transfer_to_account_id:
      updates.transfer_to_account_id !== undefined ? updates.transfer_to_account_id : cur.transfer_to_account_id,
    description: updates.description ?? cur.description,
    amount: updates.amount ?? cur.amount,
    currency: updates.currency ?? cur.currency,
    type: updates.type ?? cur.type,
    category: updates.category ?? cur.category,
    accounting_class: updates.accounting_class ?? cur.accounting_class,
    tx_date: updates.tx_date ?? cur.tx_date,
    notes: updates.notes ?? cur.notes,
    reference: updates.reference ?? cur.reference,
  };

  const dedupHash = buildDedupHash({
    workspaceId,
    accountId: next.account_id,
    txDate: next.tx_date,
    amount: next.amount,
    type: next.type,
    description: next.description,
    reference: next.reference,
  });

  sqlite
    .prepare(
      `UPDATE transactions
       SET account_id = ?, transfer_to_account_id = ?, description = ?, amount_minor = ?, currency = ?, type = ?, category = ?, accounting_class = ?, tx_date = ?, notes = ?, reference = ?, dedup_hash = ?, updated_at = ?
       WHERE id = ? AND workspace_id = ?`
    )
    .run(
      next.account_id,
      next.transfer_to_account_id,
      next.description,
      toMinorUnits(next.amount),
      next.currency,
      next.type,
      next.category,
      next.accounting_class,
      next.tx_date,
      next.notes,
      next.reference,
      dedupHash,
      now,
      txId,
      workspaceId
    );

  await syncReconciledBalancesForWorkspace(workspaceId);
  const refreshed = sqlite.prepare('SELECT * FROM transactions WHERE id = ?').get(txId) as Record<string, unknown>;
  return mapTxRow(refreshed);
}

export async function deleteTransaction(workspaceId: string, txId: string): Promise<void> {
  if (supabaseAdmin) {
    const { error } = await supabaseAdmin.from('transactions').delete().eq('id', txId).eq('workspace_id', workspaceId);
    if (error) throw error;
    await syncReconciledBalancesForWorkspace(workspaceId);
    return;
  }
  sqlite.prepare('DELETE FROM transactions WHERE id = ? AND workspace_id = ?').run(txId, workspaceId);
  await syncReconciledBalancesForWorkspace(workspaceId);
}

export async function commitCsvImportBatch(params: {
  workspaceId: string;
  accountId: string;
  filename: string;
  currency: string;
  rows: Array<{
    tx_date: string;
    description: string;
    amount: number;
    type: 'income' | 'expense';
    category: string;
    reference?: string;
    notes?: string;
    source?: 'csv_import' | 'open_banking';
  }>;
}): Promise<{ batch: ImportBatch; importedCount: number; skippedDuplicates: number }> {
  const { workspaceId, accountId, filename, currency, rows } = params;
  const batchId = uuid();
  const now = nowIso();

  let existingHashes = new Set<string>();
  if (supabaseAdmin) {
    const { data } = await supabaseAdmin
      .from('transactions')
      .select('dedup_hash')
      .eq('workspace_id', workspaceId)
      .not('dedup_hash', 'is', null);
    existingHashes = new Set((data ?? []).map((r) => String(r.dedup_hash)));
  } else {
    const dbRows = sqlite
      .prepare('SELECT dedup_hash FROM transactions WHERE workspace_id = ? AND dedup_hash IS NOT NULL')
      .all(workspaceId) as Array<{ dedup_hash: string }>;
    existingHashes = new Set(dbRows.map((r) => r.dedup_hash));
  }

  const toInsert: Array<{
    tx_date: string;
    description: string;
    amount: number;
    type: 'income' | 'expense';
    category: string;
    reference: string;
    notes: string;
    source: 'csv_import' | 'open_banking';
    dedup_hash: string;
  }> = [];

  let skippedDuplicates = 0;
  for (const row of rows) {
    const hash = buildDedupHash({
      workspaceId,
      accountId,
      txDate: row.tx_date,
      amount: row.amount,
      type: row.type,
      description: row.description,
      reference: row.reference ?? '',
    });
    if (existingHashes.has(hash)) {
      skippedDuplicates++;
      continue;
    }
    existingHashes.add(hash);
    toInsert.push({
      tx_date: row.tx_date,
      description: row.description,
      amount: row.amount,
      type: row.type,
      category: row.category,
      reference: row.reference ?? '',
      notes: row.notes ?? '',
      source: row.source ?? 'csv_import',
      dedup_hash: hash,
    });
  }

  const batch: ImportBatch = {
    id: batchId,
    workspace_id: workspaceId,
    account_id: accountId,
    filename,
    total_rows: rows.length,
    imported_rows: toInsert.length,
    skipped_duplicates: skippedDuplicates,
    created_at: now,
  };

  if (supabaseAdmin) {
    const { error: batchErr } = await supabaseAdmin.from('import_batches').insert(batch);
    if (batchErr) throw batchErr;
    if (toInsert.length > 0) {
      const { error: txErr } = await supabaseAdmin.from('transactions').insert(
        toInsert.map((r) => ({
          workspace_id: workspaceId,
          account_id: accountId,
          transfer_to_account_id: null,
          description: r.description,
          amount: r.amount,
          currency,
          type: r.type,
          category: r.category,
          accounting_class: 'standard',
          tx_date: r.tx_date,
          notes: r.notes,
          reference: r.reference,
          source: r.source,
          import_batch_id: batchId,
          dedup_hash: r.dedup_hash,
        }))
      );
      if (txErr) throw txErr;
    }
    await syncReconciledBalancesForWorkspace(workspaceId);
    return { batch, importedCount: toInsert.length, skippedDuplicates };
  }

  sqlite
    .prepare(
      `INSERT INTO import_batches (id, workspace_id, account_id, filename, total_rows, imported_rows, skipped_duplicates, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(batchId, workspaceId, accountId, filename, rows.length, toInsert.length, skippedDuplicates, now);

  const stmt = sqlite.prepare(
    `INSERT INTO transactions (
      id, workspace_id, account_id, transfer_to_account_id, description, amount_minor, currency, type, category, accounting_class, tx_date, notes, reference, source, import_batch_id, dedup_hash, created_at, updated_at
    ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, 'standard', ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const r of toInsert) {
    stmt.run(
      uuid(),
      workspaceId,
      accountId,
      r.description,
      toMinorUnits(r.amount),
      currency,
      r.type,
      r.category,
      r.tx_date,
      r.notes,
      r.reference,
      r.source,
      batchId,
      r.dedup_hash,
      now,
      now
    );
  }

  await syncReconciledBalancesForWorkspace(workspaceId);
  return { batch, importedCount: toInsert.length, skippedDuplicates };
}

export async function createAsset(
  workspaceId: string,
  input: Omit<Asset, 'id' | 'workspace_id' | 'created_at' | 'updated_at'>
): Promise<Asset> {
  const id = uuid();
  const now = nowIso();
  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin
      .from('assets')
      .insert({ id, workspace_id: workspaceId, ...input })
      .select()
      .single();
    if (error) throw error;
    return {
      ...data,
      valuation: Number(data.valuation),
      acquired_date: data.acquired_date ? String(data.acquired_date) : null,
      notes: String(data.notes ?? ''),
    } as Asset;
  }

  sqlite
    .prepare(
      `INSERT INTO assets (id, workspace_id, name, category, valuation_minor, currency, acquired_date, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      workspaceId,
      input.name,
      input.category,
      toMinorUnits(input.valuation),
      input.currency,
      input.acquired_date ?? null,
      input.notes ?? '',
      now,
      now
    );
  return { id, workspace_id: workspaceId, ...input, created_at: now, updated_at: now };
}

export async function updateAsset(
  workspaceId: string,
  assetId: string,
  updates: Partial<Omit<Asset, 'id' | 'workspace_id' | 'created_at' | 'updated_at'>>
): Promise<Asset> {
  const now = nowIso();
  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin
      .from('assets')
      .update({ ...updates, updated_at: now })
      .eq('id', assetId)
      .eq('workspace_id', workspaceId)
      .select()
      .single();
    if (error) throw error;
    return { ...data, valuation: Number(data.valuation) } as Asset;
  }

  const row = sqlite
    .prepare('SELECT * FROM assets WHERE id = ? AND workspace_id = ?')
    .get(assetId, workspaceId) as Record<string, unknown> | undefined;
  if (!row) throw new Error('Asset not found');

  const nextName = updates.name ?? String(row.name);
  const nextCat = updates.category ?? (String(row.category) as Asset['category']);
  const nextVal = updates.valuation ?? fromMinorUnits(Number(row.valuation_minor));
  const nextNotes = updates.notes ?? String(row.notes ?? '');
  const nextAcq = updates.acquired_date !== undefined ? updates.acquired_date : (row.acquired_date ? String(row.acquired_date) : null);

  sqlite
    .prepare(
      `UPDATE assets SET name = ?, category = ?, valuation_minor = ?, acquired_date = ?, notes = ?, updated_at = ? WHERE id = ? AND workspace_id = ?`
    )
    .run(nextName, nextCat, toMinorUnits(nextVal), nextAcq, nextNotes, now, assetId, workspaceId);

  return {
    id: assetId,
    workspace_id: workspaceId,
    name: nextName,
    category: nextCat,
    valuation: nextVal,
    currency: String(row.currency),
    acquired_date: nextAcq,
    notes: nextNotes,
    created_at: String(row.created_at),
    updated_at: now,
  };
}

export async function deleteAsset(workspaceId: string, assetId: string): Promise<void> {
  if (supabaseAdmin) {
    await supabaseAdmin.from('assets').delete().eq('id', assetId).eq('workspace_id', workspaceId);
    return;
  }
  sqlite.prepare('DELETE FROM assets WHERE id = ? AND workspace_id = ?').run(assetId, workspaceId);
}

export async function createLiability(
  workspaceId: string,
  input: Omit<Liability, 'id' | 'workspace_id' | 'created_at' | 'updated_at'>
): Promise<Liability> {
  const id = uuid();
  const now = nowIso();
  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin
      .from('liabilities')
      .insert({ id, workspace_id: workspaceId, ...input })
      .select()
      .single();
    if (error) throw error;
    return {
      ...data,
      principal_balance: Number(data.principal_balance),
      interest_rate: Number(data.interest_rate ?? 0),
    } as Liability;
  }

  sqlite
    .prepare(
      `INSERT INTO liabilities (id, workspace_id, name, category, principal_balance_minor, interest_rate, due_date, currency, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      workspaceId,
      input.name,
      input.category,
      toMinorUnits(input.principal_balance),
      input.interest_rate ?? 0,
      input.due_date ?? null,
      input.currency,
      input.notes ?? '',
      now,
      now
    );
  return { id, workspace_id: workspaceId, ...input, created_at: now, updated_at: now };
}

export async function updateLiability(
  workspaceId: string,
  liabilityId: string,
  updates: Partial<Omit<Liability, 'id' | 'workspace_id' | 'created_at' | 'updated_at'>>
): Promise<Liability> {
  const now = nowIso();
  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin
      .from('liabilities')
      .update({ ...updates, updated_at: now })
      .eq('id', liabilityId)
      .eq('workspace_id', workspaceId)
      .select()
      .single();
    if (error) throw error;
    return {
      ...data,
      principal_balance: Number(data.principal_balance),
      interest_rate: Number(data.interest_rate ?? 0),
    } as Liability;
  }

  const row = sqlite
    .prepare('SELECT * FROM liabilities WHERE id = ? AND workspace_id = ?')
    .get(liabilityId, workspaceId) as Record<string, unknown> | undefined;
  if (!row) throw new Error('Liability not found');

  const nextName = updates.name ?? String(row.name);
  const nextCat = updates.category ?? (String(row.category) as Liability['category']);
  const nextBal = updates.principal_balance ?? fromMinorUnits(Number(row.principal_balance_minor));
  const nextRate = updates.interest_rate ?? Number(row.interest_rate ?? 0);
  const nextDue = updates.due_date !== undefined ? updates.due_date : (row.due_date ? String(row.due_date) : null);
  const nextNotes = updates.notes ?? String(row.notes ?? '');

  sqlite
    .prepare(
      `UPDATE liabilities SET name = ?, category = ?, principal_balance_minor = ?, interest_rate = ?, due_date = ?, notes = ?, updated_at = ? WHERE id = ? AND workspace_id = ?`
    )
    .run(nextName, nextCat, toMinorUnits(nextBal), nextRate, nextDue, nextNotes, now, liabilityId, workspaceId);

  return {
    id: liabilityId,
    workspace_id: workspaceId,
    name: nextName,
    category: nextCat,
    principal_balance: nextBal,
    interest_rate: nextRate,
    due_date: nextDue,
    currency: String(row.currency),
    notes: nextNotes,
    created_at: String(row.created_at),
    updated_at: now,
  };
}

export async function deleteLiability(workspaceId: string, liabilityId: string): Promise<void> {
  if (supabaseAdmin) {
    await supabaseAdmin.from('liabilities').delete().eq('id', liabilityId).eq('workspace_id', workspaceId);
    return;
  }
  sqlite.prepare('DELETE FROM liabilities WHERE id = ? AND workspace_id = ?').run(liabilityId, workspaceId);
}

export async function createSavingsGoal(
  workspaceId: string,
  input: Omit<SavingsGoal, 'id' | 'workspace_id' | 'created_at' | 'updated_at'>
): Promise<SavingsGoal> {
  const id = uuid();
  const now = nowIso();
  const status = input.current_amount >= input.target_amount ? 'completed' : input.status ?? 'active';
  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin
      .from('savings_goals')
      .insert({ id, workspace_id: workspaceId, ...input, status })
      .select()
      .single();
    if (error) throw error;
    return {
      ...data,
      target_amount: Number(data.target_amount),
      current_amount: Number(data.current_amount),
      monthly_contribution: Number(data.monthly_contribution ?? 0),
    } as SavingsGoal;
  }

  sqlite
    .prepare(
      `INSERT INTO savings_goals (id, workspace_id, account_id, name, target_amount_minor, current_amount_minor, target_date, monthly_contribution_minor, currency, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      workspaceId,
      input.account_id ?? null,
      input.name,
      toMinorUnits(input.target_amount),
      toMinorUnits(input.current_amount),
      input.target_date ?? null,
      toMinorUnits(input.monthly_contribution ?? 0),
      input.currency,
      status,
      now,
      now
    );
  return { id, workspace_id: workspaceId, ...input, status, created_at: now, updated_at: now };
}

export async function updateSavingsGoal(
  workspaceId: string,
  goalId: string,
  updates: Partial<Omit<SavingsGoal, 'id' | 'workspace_id' | 'created_at' | 'updated_at'>>
): Promise<SavingsGoal> {
  const now = nowIso();
  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin
      .from('savings_goals')
      .update({ ...updates, updated_at: now })
      .eq('id', goalId)
      .eq('workspace_id', workspaceId)
      .select()
      .single();
    if (error) throw error;
    return {
      ...data,
      target_amount: Number(data.target_amount),
      current_amount: Number(data.current_amount),
      monthly_contribution: Number(data.monthly_contribution ?? 0),
    } as SavingsGoal;
  }

  const row = sqlite
    .prepare('SELECT * FROM savings_goals WHERE id = ? AND workspace_id = ?')
    .get(goalId, workspaceId) as Record<string, unknown> | undefined;
  if (!row) throw new Error('Savings goal not found');

  const target = updates.target_amount ?? fromMinorUnits(Number(row.target_amount_minor));
  const current = updates.current_amount ?? fromMinorUnits(Number(row.current_amount_minor));
  const status = updates.status ?? (current >= target ? 'completed' : (String(row.status) as SavingsGoal['status']));

  sqlite
    .prepare(
      `UPDATE savings_goals SET account_id = ?, name = ?, target_amount_minor = ?, current_amount_minor = ?, target_date = ?, monthly_contribution_minor = ?, status = ?, updated_at = ? WHERE id = ? AND workspace_id = ?`
    )
    .run(
      updates.account_id !== undefined ? updates.account_id : (row.account_id ? String(row.account_id) : null),
      updates.name ?? String(row.name),
      toMinorUnits(target),
      toMinorUnits(current),
      updates.target_date !== undefined ? updates.target_date : (row.target_date ? String(row.target_date) : null),
      toMinorUnits(updates.monthly_contribution ?? fromMinorUnits(Number(row.monthly_contribution_minor ?? 0))),
      status,
      now,
      goalId,
      workspaceId
    );

  const refreshed = sqlite.prepare('SELECT * FROM savings_goals WHERE id = ?').get(goalId) as Record<string, unknown>;
  return {
    id: goalId,
    workspace_id: workspaceId,
    account_id: refreshed.account_id ? String(refreshed.account_id) : null,
    name: String(refreshed.name),
    target_amount: fromMinorUnits(Number(refreshed.target_amount_minor)),
    current_amount: fromMinorUnits(Number(refreshed.current_amount_minor)),
    target_date: refreshed.target_date ? String(refreshed.target_date) : null,
    monthly_contribution: fromMinorUnits(Number(refreshed.monthly_contribution_minor ?? 0)),
    currency: String(refreshed.currency),
    status: String(refreshed.status) as SavingsGoal['status'],
    created_at: String(refreshed.created_at),
    updated_at: now,
  };
}

export async function recordSavingsContribution(
  workspaceId: string,
  goalId: string,
  input: { amount: number; contribution_date: string; notes?: string }
): Promise<{ contribution: SavingsContribution; goal: SavingsGoal }> {
  const id = uuid();
  const now = nowIso();
  if (supabaseAdmin) {
    const { data: goalRow, error: gErr } = await supabaseAdmin
      .from('savings_goals')
      .select('*')
      .eq('id', goalId)
      .eq('workspace_id', workspaceId)
      .single();
    if (gErr || !goalRow) throw new Error('Savings goal not found');

    const { data: contrib, error: cErr } = await supabaseAdmin
      .from('savings_contributions')
      .insert({
        id,
        workspace_id: workspaceId,
        goal_id: goalId,
        amount: input.amount,
        contribution_date: input.contribution_date,
        notes: input.notes ?? '',
      })
      .select()
      .single();
    if (cErr) throw cErr;

    const nextAmount = fromMinorUnits(toMinorUnits(Number(goalRow.current_amount)) + toMinorUnits(input.amount));
    const goal = await updateSavingsGoal(workspaceId, goalId, {
      current_amount: nextAmount,
      status: nextAmount >= Number(goalRow.target_amount) ? 'completed' : 'active',
    });
    return {
      contribution: { ...contrib, amount: Number(contrib.amount) } as SavingsContribution,
      goal,
    };
  }

  const goalRow = sqlite
    .prepare('SELECT * FROM savings_goals WHERE id = ? AND workspace_id = ?')
    .get(goalId, workspaceId) as Record<string, unknown> | undefined;
  if (!goalRow) throw new Error('Savings goal not found');

  const amtMinor = toMinorUnits(input.amount);
  sqlite
    .prepare(
      `INSERT INTO savings_contributions (id, workspace_id, goal_id, amount_minor, contribution_date, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(id, workspaceId, goalId, amtMinor, input.contribution_date, input.notes ?? '', now);

  const nextMinor = Number(goalRow.current_amount_minor) + amtMinor;
  const goal = await updateSavingsGoal(workspaceId, goalId, {
    current_amount: fromMinorUnits(nextMinor),
    status: nextMinor >= Number(goalRow.target_amount_minor) ? 'completed' : 'active',
  });

  return {
    contribution: {
      id,
      workspace_id: workspaceId,
      goal_id: goalId,
      amount: input.amount,
      contribution_date: input.contribution_date,
      notes: input.notes ?? '',
      created_at: now,
    },
    goal,
  };
}

export async function saveFinancialReport(
  workspaceId: string,
  input: Omit<FinancialReport, 'id' | 'workspace_id' | 'created_at'>
): Promise<FinancialReport> {
  const id = uuid();
  const now = nowIso();
  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin
      .from('financial_reports')
      .insert({ id, workspace_id: workspaceId, ...input })
      .select()
      .single();
    if (error) throw error;
    return data as FinancialReport;
  }

  sqlite
    .prepare(
      `INSERT INTO financial_reports (id, workspace_id, title, report_type, period_start, period_end, summary_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      workspaceId,
      input.title,
      input.report_type,
      input.period_start,
      input.period_end,
      JSON.stringify(input.summary_json ?? {}),
      now
    );

  return { id, workspace_id: workspaceId, ...input, created_at: now };
}

export async function createBankConnection(
  workspaceId: string,
  input: Omit<BankConnection, 'id' | 'workspace_id' | 'created_at' | 'updated_at'>
): Promise<BankConnection> {
  const id = uuid();
  const now = nowIso();
  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin
      .from('bank_connections')
      .insert({ id, workspace_id: workspaceId, ...input })
      .select()
      .single();
    if (error) throw error;
    return data as BankConnection;
  }

  sqlite
    .prepare(
      `INSERT INTO bank_connections (id, workspace_id, provider, institution_name, institution_code, account_mask, linked_account_id, external_connection_id, status, is_simulated, last_synced_at, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      workspaceId,
      input.provider,
      input.institution_name,
      input.institution_code,
      input.account_mask,
      input.linked_account_id ?? null,
      input.external_connection_id,
      input.status,
      input.is_simulated ? 1 : 0,
      input.last_synced_at ?? null,
      JSON.stringify(input.metadata ?? {}),
      now,
      now
    );

  return { id, workspace_id: workspaceId, ...input, created_at: now, updated_at: now };
}

export async function updateBankConnectionStatus(
  workspaceId: string,
  connectionId: string,
  updates: Partial<Pick<BankConnection, 'status' | 'last_synced_at'>>
): Promise<void> {
  const now = nowIso();
  if (supabaseAdmin) {
    await supabaseAdmin
      .from('bank_connections')
      .update({ ...updates, updated_at: now })
      .eq('id', connectionId)
      .eq('workspace_id', workspaceId);
    return;
  }
  const row = sqlite
    .prepare('SELECT * FROM bank_connections WHERE id = ? AND workspace_id = ?')
    .get(connectionId, workspaceId) as Record<string, unknown> | undefined;
  if (!row) return;
  sqlite
    .prepare('UPDATE bank_connections SET status = ?, last_synced_at = ?, updated_at = ? WHERE id = ? AND workspace_id = ?')
    .run(
      updates.status ?? String(row.status),
      updates.last_synced_at !== undefined ? updates.last_synced_at : (row.last_synced_at ? String(row.last_synced_at) : null),
      now,
      connectionId,
      workspaceId
    );
}

export async function upsertFinancialSnapshot(
  workspaceId: string,
  snapshot: {
    snapshot_date: string;
    total_cash_balances: number;
    total_assets: number;
    total_liabilities: number;
    net_worth: number;
  }
): Promise<FinancialSnapshot> {
  const now = nowIso();
  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin
      .from('financial_snapshots')
      .upsert(
        {
          workspace_id: workspaceId,
          ...snapshot,
          updated_at: now,
        },
        { onConflict: 'workspace_id,snapshot_date' }
      )
      .select()
      .single();
    if (error) throw error;
    return {
      ...data,
      total_cash_balances: Number(data.total_cash_balances),
      total_assets: Number(data.total_assets),
      total_liabilities: Number(data.total_liabilities),
      net_worth: Number(data.net_worth),
    } as FinancialSnapshot;
  }

  const existing = sqlite
    .prepare('SELECT * FROM financial_snapshots WHERE workspace_id = ? AND snapshot_date = ?')
    .get(workspaceId, snapshot.snapshot_date) as Record<string, unknown> | undefined;
  const id = existing ? String(existing.id) : uuid();
  sqlite
    .prepare(
      `INSERT INTO financial_snapshots (id, workspace_id, snapshot_date, total_cash_balances_minor, total_assets_minor, total_liabilities_minor, net_worth_minor, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(workspace_id, snapshot_date) DO UPDATE SET
         total_cash_balances_minor = excluded.total_cash_balances_minor,
         total_assets_minor = excluded.total_assets_minor,
         total_liabilities_minor = excluded.total_liabilities_minor,
         net_worth_minor = excluded.net_worth_minor,
         updated_at = excluded.updated_at`
    )
    .run(
      id,
      workspaceId,
      snapshot.snapshot_date,
      toMinorUnits(snapshot.total_cash_balances),
      toMinorUnits(snapshot.total_assets),
      toMinorUnits(snapshot.total_liabilities),
      toMinorUnits(snapshot.net_worth),
      existing ? String(existing.created_at) : now,
      now
    );

  return {
    id,
    workspace_id: workspaceId,
    ...snapshot,
    created_at: existing ? String(existing.created_at) : now,
    updated_at: now,
  };
}

/**
 * Seeds a realistic, strictly isolated Nigerian Personal + Business demonstration dataset ONLY for the Demo account.
 * Real registered users always start with clean, empty ledgers.
 */
export async function ensureDemoUserSeeded(): Promise<Profile> {
  const demoUserId = 'demo_user_monetra_2026';
  const existingProfile = await getProfileById(demoUserId);
  const existingWorkspaces = existingProfile ? await listWorkspacesForUser(demoUserId) : [];

  if (existingProfile && existingWorkspaces.length >= 2) {
    return existingProfile;
  }

  const profile =
    existingProfile ??
    (await createProfile({
      id: demoUserId,
      email: 'demo@monetra.app',
      display_name: 'Chinedu Rowland (Demo)',
      country: 'Nigeria',
      preferred_currency: 'NGN',
      avatar_url: '/src/assets/images/avatar_demo_founder_1795443813609.jpg',
      onboarding_completed: true,
      is_demo: true,
    }));

  if (!existingProfile?.onboarding_completed) {
    await updateProfileDetails(demoUserId, { onboarding_completed: true });
  }

  const monthsAgoDate = (monthsAgo: number, day: number) => {
    const d = new Date();
    d.setUTCMonth(d.getUTCMonth() - monthsAgo);
    d.setUTCDate(Math.min(day, 28));
    return d.toISOString().slice(0, 10);
  };

  // 1. Personal Wealth Workspace (Demo)
  const personalWs = await createWorkspace({
    owner_id: demoUserId,
    name: 'Personal Wealth Ledger (Demo)',
    type: 'personal',
    currency: 'NGN',
    country: 'Nigeria',
    is_demo: true,
  });

  const gtCurrent = await createAccount(personalWs.id, {
    name: 'GTBank Everyday Current',
    institution: 'Guaranty Trust Bank',
    account_type: 'current',
    currency: 'NGN',
    opening_balance: 480000,
  });
  const piggySavings = await createAccount(personalWs.id, {
    name: 'PiggyVest Flex Reserve',
    institution: 'PiggyVest',
    account_type: 'savings',
    currency: 'NGN',
    opening_balance: 1200000,
  });
  const stanbicInvest = await createAccount(personalWs.id, {
    name: 'Stanbic Money Market Fund',
    institution: 'Stanbic IBTC Asset Mgmt',
    account_type: 'investment',
    currency: 'NGN',
    opening_balance: 2100000,
  });

  const personalTxs: Array<Omit<Transaction, 'id' | 'workspace_id' | 'created_at' | 'updated_at'>> = [
    { account_id: gtCurrent.id, transfer_to_account_id: null, description: 'Product Engineering Salary', amount: 1450000, currency: 'NGN', type: 'income', category: 'Salary', accounting_class: 'standard', tx_date: monthsAgoDate(3, 25), notes: 'Monthly net payroll', reference: 'PAY-2026-07', source: 'manual', import_batch_id: null, dedup_hash: null },
    { account_id: gtCurrent.id, transfer_to_account_id: null, description: 'Lekki Phase 1 Service Charge & Rent', amount: 420000, currency: 'NGN', type: 'expense', category: 'Housing', accounting_class: 'standard', tx_date: monthsAgoDate(3, 26), notes: 'Quarterly estate allocation', reference: 'EST-881', source: 'manual', import_batch_id: null, dedup_hash: null },
    { account_id: gtCurrent.id, transfer_to_account_id: piggySavings.id, description: 'Automated Emergency Fund Sweep', amount: 300000, currency: 'NGN', type: 'transfer', category: 'Transfer', accounting_class: 'standard', tx_date: monthsAgoDate(3, 27), notes: 'Monthly reserve transfer', reference: 'TRF-301', source: 'manual', import_batch_id: null, dedup_hash: null },
    { account_id: gtCurrent.id, transfer_to_account_id: null, description: 'Product Engineering Salary', amount: 1450000, currency: 'NGN', type: 'income', category: 'Salary', accounting_class: 'standard', tx_date: monthsAgoDate(2, 25), notes: 'Monthly net payroll', reference: 'PAY-2026-08', source: 'manual', import_batch_id: null, dedup_hash: null },
    { account_id: gtCurrent.id, transfer_to_account_id: null, description: 'Fintech Advisory Retainer', amount: 380000, currency: 'NGN', type: 'income', category: 'Freelance income', accounting_class: 'standard', tx_date: monthsAgoDate(2, 14), notes: 'Architecture advisory sprint', reference: 'ADV-104', source: 'manual', import_batch_id: null, dedup_hash: null },
    { account_id: gtCurrent.id, transfer_to_account_id: null, description: 'Shoprite & Weekly Market Groceries', amount: 165000, currency: 'NGN', type: 'expense', category: 'Food', accounting_class: 'standard', tx_date: monthsAgoDate(2, 16), notes: 'Household food restock', reference: 'POS-992', source: 'manual', import_batch_id: null, dedup_hash: null },
    { account_id: gtCurrent.id, transfer_to_account_id: null, description: 'EKEDC Band A Power & Starlink Fiber', amount: 98500, currency: 'NGN', type: 'expense', category: 'Utilities', accounting_class: 'standard', tx_date: monthsAgoDate(2, 19), notes: 'Power + home internet', reference: 'UTL-410', source: 'manual', import_batch_id: null, dedup_hash: null },
    { account_id: gtCurrent.id, transfer_to_account_id: stanbicInvest.id, description: 'Money Market Top-up', amount: 400000, currency: 'NGN', type: 'transfer', category: 'Transfer', accounting_class: 'standard', tx_date: monthsAgoDate(2, 28), notes: 'Compounding yield allocation', reference: 'INV-208', source: 'manual', import_batch_id: null, dedup_hash: null },
    { account_id: gtCurrent.id, transfer_to_account_id: null, description: 'Product Engineering Salary', amount: 1520000, currency: 'NGN', type: 'income', category: 'Salary', accounting_class: 'standard', tx_date: monthsAgoDate(1, 25), notes: 'Updated compensation band', reference: 'PAY-2026-09', source: 'manual', import_batch_id: null, dedup_hash: null },
    { account_id: stanbicInvest.id, transfer_to_account_id: null, description: 'Quarterly MMF Dividend Distribution', amount: 112400, currency: 'NGN', type: 'income', category: 'Investment income', accounting_class: 'standard', tx_date: monthsAgoDate(1, 28), notes: '16.4% annualized money market yield', reference: 'DIV-Q3', source: 'manual', import_batch_id: null, dedup_hash: null },
    { account_id: gtCurrent.id, transfer_to_account_id: null, description: 'Fuel, Ride-hailing & Toll', amount: 134000, currency: 'NGN', type: 'expense', category: 'Transportation', accounting_class: 'standard', tx_date: monthsAgoDate(1, 20), notes: 'Monthly Lagos commute', reference: 'TRN-511', source: 'manual', import_batch_id: null, dedup_hash: null },
    { account_id: gtCurrent.id, transfer_to_account_id: null, description: 'Reliance HMO Annual Health Renewal', amount: 185000, currency: 'NGN', type: 'expense', category: 'Healthcare', accounting_class: 'standard', tx_date: monthsAgoDate(0, 4), notes: 'Family health coverage', reference: 'HMO-04', source: 'manual', import_batch_id: null, dedup_hash: null },
    { account_id: gtCurrent.id, transfer_to_account_id: null, description: 'Chowdeck & Household Provisions', amount: 142500, currency: 'NGN', type: 'expense', category: 'Food', accounting_class: 'standard', tx_date: monthsAgoDate(0, 9), notes: 'Monthly dining & pantry', reference: 'FD-092', source: 'manual', import_batch_id: null, dedup_hash: null },
    { account_id: gtCurrent.id, transfer_to_account_id: null, description: 'AWS Certifications & Leadership Course', amount: 95000, currency: 'NGN', type: 'expense', category: 'Education', accounting_class: 'standard', tx_date: monthsAgoDate(0, 12), notes: 'Professional development', reference: 'EDU-12', source: 'manual', import_batch_id: null, dedup_hash: null },
  ];
  for (const tx of personalTxs) {
    await createTransaction(personalWs.id, tx);
  }

  await createAsset(personalWs.id, {
    name: 'FGN Savings Bond & Treasury Bills',
    category: 'investment',
    valuation: 3500000,
    currency: 'NGN',
    acquired_date: monthsAgoDate(6, 15),
    notes: '180-day sovereign fixed income portfolio',
  });
  await createAsset(personalWs.id, {
    name: 'Epe Suburban Plot (Titled)',
    category: 'real_estate',
    valuation: 8500000,
    currency: 'NGN',
    acquired_date: monthsAgoDate(14, 10),
    notes: 'Verified C of O appreciation valuation',
  });
  await createLiability(personalWs.id, {
    name: 'Solar Inverter Financing Facility',
    category: 'loan',
    principal_balance: 920000,
    interest_rate: 14.5,
    due_date: monthsAgoDate(-8, 28),
    currency: 'NGN',
    notes: '5kVA lithium backup system installment',
  });

  await createSavingsGoal(personalWs.id, {
    account_id: piggySavings.id,
    name: '12-Month Emergency Reserve',
    target_amount: 4500000,
    current_amount: 1500000,
    target_date: monthsAgoDate(-10, 1),
    monthly_contribution: 300000,
    currency: 'NGN',
    status: 'active',
  });
  await createSavingsGoal(personalWs.id, {
    account_id: stanbicInvest.id,
    name: 'Capital Reserve for Commercial Property',
    target_amount: 10000000,
    current_amount: 2612400,
    target_date: monthsAgoDate(-18, 1),
    monthly_contribution: 400000,
    currency: 'NGN',
    status: 'active',
  });

  await upsertFinancialSnapshot(personalWs.id, {
    snapshot_date: monthsAgoDate(3, 28),
    total_cash_balances: 4510000,
    total_assets: 15800000,
    total_liabilities: 1220000,
    net_worth: 14580000,
  });
  await upsertFinancialSnapshot(personalWs.id, {
    snapshot_date: monthsAgoDate(2, 28),
    total_cash_balances: 6076500,
    total_assets: 17650000,
    total_liabilities: 1100000,
    net_worth: 16550000,
  });
  await upsertFinancialSnapshot(personalWs.id, {
    snapshot_date: monthsAgoDate(1, 28),
    total_cash_balances: 7574900,
    total_assets: 19200000,
    total_liabilities: 980000,
    net_worth: 18220000,
  });

  // 2. Business Workspace (Demo)
  const businessWs = await createWorkspace({
    owner_id: demoUserId,
    name: 'Kora Craft Studio Ltd (Demo)',
    type: 'business',
    currency: 'NGN',
    country: 'Nigeria',
    legal_name: 'Kora Craft Studio Limited',
    industry: 'Consumer Packaging & Retail Fulfillment',
    is_demo: true,
  });
  await updateBusinessDetails(businessWs.id, {
    legal_name: 'Kora Craft Studio Limited',
    industry: 'Consumer Packaging & Retail Fulfillment',
    registration_number: 'RC-1948204',
    tax_id: 'TIN-23491082-0001',
    fiscal_year_start_month: 1,
    monthly_revenue_target: 4500000,
  });

  const zenithBiz = await createAccount(businessWs.id, {
    name: 'Zenith Corporate Operating',
    institution: 'Zenith Bank Plc',
    account_type: 'business',
    currency: 'NGN',
    opening_balance: 1850000,
  });
  const paystackClearing = await createAccount(businessWs.id, {
    name: 'Paystack Merchant Settlement',
    institution: 'Paystack Titan',
    account_type: 'business',
    currency: 'NGN',
    opening_balance: 340000,
  });

  const bizTxs: Array<Omit<Transaction, 'id' | 'workspace_id' | 'created_at' | 'updated_at'>> = [
    { account_id: zenithBiz.id, transfer_to_account_id: null, description: 'Founder Working Capital Injection', amount: 1500000, currency: 'NGN', type: 'income', category: 'Other income', accounting_class: 'owner_equity', tx_date: monthsAgoDate(3, 5), notes: 'Equity injection excluded from operating P&L revenue', reference: 'EQ-001', source: 'manual', import_batch_id: null, dedup_hash: null },
    { account_id: zenithBiz.id, transfer_to_account_id: null, description: 'Wholesale Packaging Contract — Eko Roasters', amount: 2850000, currency: 'NGN', type: 'income', category: 'Business revenue', accounting_class: 'standard', tx_date: monthsAgoDate(3, 18), notes: 'Invoice #KCS-301 settled', reference: 'INV-301', source: 'manual', import_batch_id: null, dedup_hash: null },
    { account_id: zenithBiz.id, transfer_to_account_id: null, description: 'Kraft Board Raw Stock & Ink Supply', amount: 1180000, currency: 'NGN', type: 'expense', category: 'Business operations', accounting_class: 'standard', tx_date: monthsAgoDate(3, 21), notes: 'Production inventory procurement', reference: 'PO-112', source: 'manual', import_batch_id: null, dedup_hash: null },
    { account_id: paystackClearing.id, transfer_to_account_id: null, description: 'D2C Storefront Settlements (August)', amount: 3420000, currency: 'NGN', type: 'income', category: 'Business revenue', accounting_class: 'standard', tx_date: monthsAgoDate(2, 22), notes: 'Settled Paystack storefront batch', reference: 'PS-0822', source: 'manual', import_batch_id: null, dedup_hash: null },
    { account_id: paystackClearing.id, transfer_to_account_id: zenithBiz.id, description: 'Treasury Sweep to Zenith Operating', amount: 2800000, currency: 'NGN', type: 'transfer', category: 'Transfer', accounting_class: 'standard', tx_date: monthsAgoDate(2, 24), notes: 'Internal liquidity sweep', reference: 'SWP-824', source: 'manual', import_batch_id: null, dedup_hash: null },
    { account_id: zenithBiz.id, transfer_to_account_id: null, description: 'Staff Payroll & Production Stipends', amount: 1450000, currency: 'NGN', type: 'expense', category: 'Business operations', accounting_class: 'standard', tx_date: monthsAgoDate(2, 27), notes: '6 full-time team members', reference: 'PR-08', source: 'manual', import_batch_id: null, dedup_hash: null },
    { account_id: zenithBiz.id, transfer_to_account_id: null, description: 'Diesel Generator & Warehouse Power', amount: 365000, currency: 'NGN', type: 'expense', category: 'Utilities', accounting_class: 'standard', tx_date: monthsAgoDate(1, 12), notes: 'Ilupeju workshop utilities', reference: 'UTL-B09', source: 'manual', import_batch_id: null, dedup_hash: null },
    { account_id: zenithBiz.id, transfer_to_account_id: null, description: 'Corporate Gift Box Contract — FinHub NG', amount: 4250000, currency: 'NGN', type: 'income', category: 'Business revenue', accounting_class: 'standard', tx_date: monthsAgoDate(1, 19), notes: 'Invoice #KCS-408 paid in full', reference: 'INV-408', source: 'manual', import_batch_id: null, dedup_hash: null },
    { account_id: zenithBiz.id, transfer_to_account_id: null, description: 'Last-Mile Dispatch & Waybill Logistics', amount: 410000, currency: 'NGN', type: 'expense', category: 'Transportation', accounting_class: 'standard', tx_date: monthsAgoDate(1, 25), notes: 'GIGL & Kwik fleet settlements', reference: 'LOG-09', source: 'manual', import_batch_id: null, dedup_hash: null },
    { account_id: zenithBiz.id, transfer_to_account_id: null, description: 'Owner Dividend Draw', amount: 450000, currency: 'NGN', type: 'expense', category: 'Other expenses', accounting_class: 'owner_draw', tx_date: monthsAgoDate(0, 3), notes: 'Director draw excluded from operating expenses', reference: 'DRW-003', source: 'manual', import_batch_id: null, dedup_hash: null },
    { account_id: paystackClearing.id, transfer_to_account_id: null, description: 'October Recurring Merchant Orders', amount: 2980000, currency: 'NGN', type: 'income', category: 'Business revenue', accounting_class: 'standard', tx_date: monthsAgoDate(0, 11), notes: 'Active month storefront inflows', reference: 'PS-1011', source: 'manual', import_batch_id: null, dedup_hash: null },
    { account_id: zenithBiz.id, transfer_to_account_id: null, description: 'Staff Payroll & Q4 Marketing Spend', amount: 1620000, currency: 'NGN', type: 'expense', category: 'Business operations', accounting_class: 'standard', tx_date: monthsAgoDate(0, 14), notes: 'Salaries + digital customer acquisition', reference: 'OP-1014', source: 'manual', import_batch_id: null, dedup_hash: null },
  ];
  for (const tx of bizTxs) {
    await createTransaction(businessWs.id, tx);
  }

  await createAsset(businessWs.id, {
    name: 'Heidelberg Die-Cutting & Print Press',
    category: 'equipment',
    valuation: 6200000,
    currency: 'NGN',
    acquired_date: monthsAgoDate(10, 5),
    notes: 'Core packaging production machinery',
  });
  await createAsset(businessWs.id, {
    name: 'Finished Packaging Raw Inventory',
    category: 'inventory',
    valuation: 2450000,
    currency: 'NGN',
    acquired_date: monthsAgoDate(0, 1),
    notes: 'Verified Q4 warehouse stock count',
  });
  await createLiability(businessWs.id, {
    name: 'Paper Mill Supplier Payable (Net-30)',
    category: 'supplier_payable',
    principal_balance: 840000,
    interest_rate: 0,
    due_date: monthsAgoDate(-1, 15),
    currency: 'NGN',
    notes: 'Upcoming supplier invoice settlement',
  });

  await upsertFinancialSnapshot(businessWs.id, {
    snapshot_date: monthsAgoDate(2, 28),
    total_cash_balances: 6990000,
    total_assets: 15640000,
    total_liabilities: 1120000,
    net_worth: 14520000,
  });
  await upsertFinancialSnapshot(businessWs.id, {
    snapshot_date: monthsAgoDate(1, 28),
    total_cash_balances: 10465000,
    total_assets: 19115000,
    total_liabilities: 950000,
    net_worth: 18165000,
  });

  return profile;
}
