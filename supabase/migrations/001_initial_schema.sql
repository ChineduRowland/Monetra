-- Monetra PostgreSQL Initial Schema & Row-Level Security (RLS)
-- Designed for Clerk JWT authentication (`auth.jwt() ->> 'sub'`)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'Nigeria',
  preferred_currency TEXT NOT NULL DEFAULT 'NGN',
  avatar_url TEXT,
  onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('personal', 'business')),
  currency TEXT NOT NULL DEFAULT 'NGN',
  country TEXT NOT NULL DEFAULT 'Nigeria',
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS business_details (
  workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  legal_name TEXT NOT NULL DEFAULT '',
  industry TEXT NOT NULL DEFAULT '',
  registration_number TEXT NOT NULL DEFAULT '',
  tax_id TEXT NOT NULL DEFAULT '',
  fiscal_year_start_month INTEGER NOT NULL DEFAULT 1 CHECK (fiscal_year_start_month BETWEEN 1 AND 12),
  monthly_revenue_target NUMERIC(18,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS financial_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  institution TEXT NOT NULL DEFAULT '',
  account_type TEXT NOT NULL CHECK (account_type IN ('savings', 'current', 'cash', 'business', 'investment', 'other')),
  currency TEXT NOT NULL DEFAULT 'NGN',
  opening_balance NUMERIC(18,2) NOT NULL DEFAULT 0,
  current_balance NUMERIC(18,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  external_provider TEXT,
  external_account_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, type, name)
);

CREATE TABLE IF NOT EXISTS import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES financial_accounts(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  total_rows INTEGER NOT NULL DEFAULT 0,
  imported_rows INTEGER NOT NULL DEFAULT 0,
  skipped_duplicates INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES financial_accounts(id) ON DELETE RESTRICT,
  transfer_to_account_id UUID REFERENCES financial_accounts(id) ON DELETE RESTRICT,
  description TEXT NOT NULL,
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'NGN',
  type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
  category TEXT NOT NULL,
  accounting_class TEXT NOT NULL DEFAULT 'standard' CHECK (accounting_class IN ('standard', 'owner_equity', 'owner_draw')),
  tx_date DATE NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  reference TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'csv_import', 'open_banking')),
  import_batch_id UUID REFERENCES import_batches(id) ON DELETE SET NULL,
  dedup_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_ws_date ON transactions(workspace_id, tx_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_ws_dedup ON transactions(workspace_id, dedup_hash);

CREATE TABLE IF NOT EXISTS assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('cash_equivalent', 'real_estate', 'equipment', 'inventory', 'investment', 'vehicle', 'receivable', 'other')),
  valuation NUMERIC(18,2) NOT NULL CHECK (valuation >= 0),
  currency TEXT NOT NULL DEFAULT 'NGN',
  acquired_date DATE,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS liabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('loan', 'credit_card', 'mortgage', 'supplier_payable', 'tax_payable', 'other')),
  principal_balance NUMERIC(18,2) NOT NULL CHECK (principal_balance >= 0),
  interest_rate NUMERIC(6,2) NOT NULL DEFAULT 0,
  due_date DATE,
  currency TEXT NOT NULL DEFAULT 'NGN',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS savings_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  account_id UUID REFERENCES financial_accounts(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  target_amount NUMERIC(18,2) NOT NULL CHECK (target_amount > 0),
  current_amount NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (current_amount >= 0),
  target_date DATE,
  monthly_contribution NUMERIC(18,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'NGN',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS savings_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  goal_id UUID NOT NULL REFERENCES savings_goals(id) ON DELETE CASCADE,
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  contribution_date DATE NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS financial_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  report_type TEXT NOT NULL CHECK (report_type IN ('monthly_summary', 'cash_flow', 'net_worth', 'business_pnl')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bank_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'mono',
  institution_name TEXT NOT NULL,
  institution_code TEXT NOT NULL DEFAULT '',
  account_mask TEXT NOT NULL DEFAULT '',
  linked_account_id UUID REFERENCES financial_accounts(id) ON DELETE SET NULL,
  external_connection_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'reauth_required', 'disconnected')),
  is_simulated BOOLEAN NOT NULL DEFAULT TRUE,
  last_synced_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS financial_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  total_cash_balances NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_assets NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_liabilities NUMERIC(18,2) NOT NULL DEFAULT 0,
  net_worth NUMERIC(18,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, snapshot_date)
);

-- Enable Row-Level Security across all workspace-scoped and user tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE liabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE savings_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE savings_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_snapshots ENABLE ROW LEVEL SECURITY;

-- Policies keyed off Clerk `sub` claim
CREATE POLICY "profiles_self_access" ON profiles
  FOR ALL USING (id = (auth.jwt() ->> 'sub'))
  WITH CHECK (id = (auth.jwt() ->> 'sub'));

CREATE POLICY "workspaces_member_access" ON workspaces
  FOR ALL USING (
    owner_id = (auth.jwt() ->> 'sub')
    OR EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = workspaces.id AND m.user_id = (auth.jwt() ->> 'sub')
    )
  )
  WITH CHECK (owner_id = (auth.jwt() ->> 'sub'));

CREATE POLICY "workspace_members_access" ON workspace_members
  FOR ALL USING (
    user_id = (auth.jwt() ->> 'sub')
    OR EXISTS (
      SELECT 1 FROM workspaces w WHERE w.id = workspace_members.workspace_id AND w.owner_id = (auth.jwt() ->> 'sub')
    )
  );

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'business_details',
    'financial_accounts',
    'categories',
    'import_batches',
    'transactions',
    'assets',
    'liabilities',
    'savings_goals',
    'savings_contributions',
    'financial_reports',
    'bank_connections',
    'financial_snapshots'
  ]
  LOOP
    EXECUTE format(
      'CREATE POLICY "ws_isolation_%I" ON %I FOR ALL USING (
        EXISTS (
          SELECT 1 FROM workspaces w
          WHERE w.id = %I.workspace_id
            AND (
              w.owner_id = (auth.jwt() ->> ''sub'')
              OR EXISTS (
                SELECT 1 FROM workspace_members m
                WHERE m.workspace_id = w.id AND m.user_id = (auth.jwt() ->> ''sub'')
              )
            )
        )
      ) WITH CHECK (
        EXISTS (
          SELECT 1 FROM workspaces w
          WHERE w.id = %I.workspace_id
            AND (
              w.owner_id = (auth.jwt() ->> ''sub'')
              OR EXISTS (
                SELECT 1 FROM workspace_members m
                WHERE m.workspace_id = w.id AND m.user_id = (auth.jwt() ->> ''sub'')
              )
            )
        )
      );',
      tbl, tbl, tbl, tbl
    );
  END LOOP;
END $$;
