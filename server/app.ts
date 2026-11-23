import 'dotenv/config';
import express from 'express';
import { z } from 'zod';
import {
  AccountSchema,
  AssetSchema,
  CreateWorkspaceSchema,
  LiabilitySchema,
  OnboardingSchema,
  SavingsContributionSchema,
  SavingsGoalSchema,
  TransactionSchema,
} from '../src/shared/types.ts';
import { buildDedupHash, calculateNetWorth } from '../src/shared/finance.ts';
import {
  applyAuthMiddleware,
  completePreviewPasswordReset,
  isClerkConfigured,
  loginDemoAccount,
  loginPreviewAccount,
  registerPreviewAccount,
  requestPreviewPasswordReset,
  requireAuthenticatedUser,
  type AuthenticatedRequest,
} from './auth.ts';
import {
  commitCsvImportBatch,
  createAccount,
  createAsset,
  createBankConnection,
  createCustomCategory,
  createLiability,
  createSavingsGoal,
  createTransaction,
  createWorkspace,
  deleteAsset,
  deleteLiability,
  deleteTransaction,
  deleteUserAccountData,
  deleteWorkspace,
  getProfileById,
  getWorkspaceOverview,
  isSupabaseConfigured,
  listWorkspacesForUser,
  recordSavingsContribution,
  saveFinancialReport,
  updateAccount,
  updateAsset,
  updateBankConnectionStatus,
  updateBusinessDetails,
  updateLiability,
  updateProfileDetails,
  updateSavingsGoal,
  updateTransaction,
  updateWorkspaceName,
  upsertFinancialSnapshot,
  verifyWorkspaceAccess,
} from './db.ts';
import { askFinancialAssistant } from './gemini.ts';
import { monoProvider } from './openBanking.ts';

function handleError(res: express.Response, err: unknown, fallbackStatus = 400) {
  if (err instanceof z.ZodError) {
    return res.status(400).json({
      error: err.issues.map((i) => `${i.path.join('.') || 'field'}: ${i.message}`).join('; '),
    });
  }
  const message = err instanceof Error ? err.message : 'Unexpected server error';
  const status = message.toLowerCase().includes('not found') ? 404 : fallbackStatus;
  return res.status(status).json({ error: message });
}

export function createApiApp(): express.Express {
  const app = express();

  app.set('trust proxy', 1);
  app.use(express.json({ limit: '5mb' }));
  app.use(applyAuthMiddleware());

  app.get('/api/config', (_req, res) => {
    res.json({
      authMode: isClerkConfigured ? 'clerk' : 'preview',
      clerkPublishableKey: isClerkConfigured ? process.env.VITE_CLERK_PUBLISHABLE_KEY : null,
      databaseMode: isSupabaseConfigured ? 'supabase' : 'local_sqlite',
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
      openBankingMode: monoProvider.isSimulated ? 'sandbox_simulated' : 'live',
    });
  });

  app.post('/api/auth/register', async (req, res) => {
    try {
      const body = z
        .object({
          email: z.string().email(),
          password: z.string().min(8, 'Password must be at least 8 characters'),
          display_name: z.string().trim().min(2).max(80),
        })
        .parse(req.body);
      const result = await registerPreviewAccount(body);
      res.status(201).json(result);
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const body = z
        .object({
          email: z.string().email(),
          password: z.string().min(1),
        })
        .parse(req.body);
      const result = await loginPreviewAccount(body);
      res.json(result);
    } catch (err) {
      handleError(res, err, 401);
    }
  });

  app.post('/api/auth/demo', async (_req, res) => {
    try {
      const result = await loginDemoAccount();
      res.json(result);
    } catch (err) {
      handleError(res, err, 500);
    }
  });

  app.post('/api/auth/reset-request', async (req, res) => {
    try {
      const body = z.object({ email: z.string().email() }).parse(req.body);
      const result = await requestPreviewPasswordReset(body.email);
      res.json(result);
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post('/api/auth/reset-confirm', async (req, res) => {
    try {
      const body = z
        .object({
          code: z.string().trim().min(4),
          newPassword: z.string().min(8),
        })
        .parse(req.body);
      await completePreviewPasswordReset(body);
      res.json({ ok: true });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.get('/api/me', requireAuthenticatedUser, async (req: AuthenticatedRequest, res) => {
    try {
      const profile = (await getProfileById(req.authUser!.id))!;
      const workspaces = await listWorkspacesForUser(profile.id);
      res.json({ profile, workspaces });
    } catch (err) {
      handleError(res, err, 500);
    }
  });

  app.patch('/api/me', requireAuthenticatedUser, async (req: AuthenticatedRequest, res) => {
    try {
      const body = z
        .object({
          display_name: z.string().trim().min(2).max(80).optional(),
          country: z.string().trim().min(2).max(60).optional(),
          preferred_currency: z.string().trim().length(3).optional(),
        })
        .parse(req.body);
      const profile = await updateProfileDetails(req.authUser!.id, body);
      res.json({ profile });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.delete('/api/me', requireAuthenticatedUser, async (req: AuthenticatedRequest, res) => {
    try {
      await deleteUserAccountData(req.authUser!.id);
      res.json({ ok: true });
    } catch (err) {
      handleError(res, err, 500);
    }
  });

  app.post('/api/onboarding', requireAuthenticatedUser, async (req: AuthenticatedRequest, res) => {
    try {
      const parsed = OnboardingSchema.parse(req.body);
      const userId = req.authUser!.id;

      const profile = await updateProfileDetails(userId, {
        display_name: parsed.display_name,
        country: parsed.country,
        preferred_currency: parsed.preferred_currency,
        onboarding_completed: true,
      });

      const createdWorkspaces = [];
      if (parsed.selection === 'personal' || parsed.selection === 'both') {
        const ws = await createWorkspace({
          owner_id: userId,
          name: parsed.personal_workspace_name?.trim() || `${parsed.display_name.split(' ')[0]}'s Personal Finance`,
          type: 'personal',
          currency: parsed.preferred_currency,
          country: parsed.country,
        });
        createdWorkspaces.push(ws);
      }
      if (parsed.selection === 'business' || parsed.selection === 'both') {
        const wsName = parsed.business_workspace_name?.trim() || 'My Business Finance';
        const ws = await createWorkspace({
          owner_id: userId,
          name: wsName,
          type: 'business',
          currency: parsed.preferred_currency,
          country: parsed.country,
          legal_name: wsName,
          industry: parsed.business_industry?.trim() || 'General Commerce & Services',
        });
        createdWorkspaces.push(ws);
      }

      const workspaces = await listWorkspacesForUser(userId);
      res.status(201).json({ profile, workspaces, createdWorkspaces });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.get('/api/workspaces', requireAuthenticatedUser, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaces = await listWorkspacesForUser(req.authUser!.id);
      res.json({ workspaces });
    } catch (err) {
      handleError(res, err, 500);
    }
  });

  app.post('/api/workspaces', requireAuthenticatedUser, async (req: AuthenticatedRequest, res) => {
    try {
      const parsed = CreateWorkspaceSchema.parse(req.body);
      const ws = await createWorkspace({
        owner_id: req.authUser!.id,
        name: parsed.name,
        type: parsed.type,
        currency: parsed.currency,
        country: parsed.country,
        legal_name: parsed.legal_name,
        industry: parsed.industry,
      });
      res.status(201).json({ workspace: ws });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.patch('/api/workspaces/:workspaceId', requireAuthenticatedUser, async (req: AuthenticatedRequest, res) => {
    try {
      const ws = await verifyWorkspaceAccess(req.params.workspaceId, req.authUser!.id);
      if (!ws) return res.status(404).json({ error: 'Workspace not found' });
      const body = z.object({ name: z.string().trim().min(2).max(80) }).parse(req.body);
      const updated = await updateWorkspaceName(ws.id, body.name);
      res.json({ workspace: updated });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.delete('/api/workspaces/:workspaceId', requireAuthenticatedUser, async (req: AuthenticatedRequest, res) => {
    try {
      const ws = await verifyWorkspaceAccess(req.params.workspaceId, req.authUser!.id);
      if (!ws) return res.status(404).json({ error: 'Workspace not found' });
      const all = await listWorkspacesForUser(req.authUser!.id);
      if (all.length <= 1) {
        return res.status(400).json({ error: 'You must retain at least one active workspace.' });
      }
      await deleteWorkspace(ws.id);
      res.json({ ok: true });
    } catch (err) {
      handleError(res, err, 500);
    }
  });

  app.get('/api/workspaces/:workspaceId/overview', requireAuthenticatedUser, async (req: AuthenticatedRequest, res) => {
    try {
      const ws = await verifyWorkspaceAccess(req.params.workspaceId, req.authUser!.id);
      if (!ws) return res.status(404).json({ error: 'Workspace not found' });
      const overview = await getWorkspaceOverview(ws.id);
      res.json(overview);
    } catch (err) {
      handleError(res, err, 500);
    }
  });

  app.patch('/api/workspaces/:workspaceId/business-details', requireAuthenticatedUser, async (req: AuthenticatedRequest, res) => {
    try {
      const ws = await verifyWorkspaceAccess(req.params.workspaceId, req.authUser!.id);
      if (!ws) return res.status(404).json({ error: 'Workspace not found' });
      const body = z
        .object({
          legal_name: z.string().trim().max(120).optional(),
          industry: z.string().trim().max(80).optional(),
          registration_number: z.string().trim().max(60).optional(),
          tax_id: z.string().trim().max(60).optional(),
          fiscal_year_start_month: z.coerce.number().int().min(1).max(12).optional(),
          monthly_revenue_target: z.coerce.number().min(0).max(1_000_000_000_000).optional(),
        })
        .parse(req.body);
      const details = await updateBusinessDetails(ws.id, body);
      res.json({ businessDetails: details });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post('/api/workspaces/:workspaceId/accounts', requireAuthenticatedUser, async (req: AuthenticatedRequest, res) => {
    try {
      const ws = await verifyWorkspaceAccess(req.params.workspaceId, req.authUser!.id);
      if (!ws) return res.status(404).json({ error: 'Workspace not found' });
      const parsed = AccountSchema.parse(req.body);
      const account = await createAccount(ws.id, {
        name: parsed.name,
        institution: parsed.institution,
        account_type: parsed.account_type,
        currency: parsed.currency,
        opening_balance: parsed.opening_balance,
        status: parsed.status,
      });
      res.status(201).json({ account });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.patch('/api/workspaces/:workspaceId/accounts/:accountId', requireAuthenticatedUser, async (req: AuthenticatedRequest, res) => {
    try {
      const ws = await verifyWorkspaceAccess(req.params.workspaceId, req.authUser!.id);
      if (!ws) return res.status(404).json({ error: 'Workspace not found' });
      const parsed = AccountSchema.partial().parse(req.body);
      const account = await updateAccount(ws.id, req.params.accountId, parsed);
      res.json({ account });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post('/api/workspaces/:workspaceId/categories', requireAuthenticatedUser, async (req: AuthenticatedRequest, res) => {
    try {
      const ws = await verifyWorkspaceAccess(req.params.workspaceId, req.authUser!.id);
      if (!ws) return res.status(404).json({ error: 'Workspace not found' });
      const body = z
        .object({
          name: z.string().trim().min(2).max(60),
          type: z.enum(['income', 'expense']),
        })
        .parse(req.body);
      const category = await createCustomCategory(ws.id, body.name, body.type);
      res.status(201).json({ category });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post('/api/workspaces/:workspaceId/transactions', requireAuthenticatedUser, async (req: AuthenticatedRequest, res) => {
    try {
      const ws = await verifyWorkspaceAccess(req.params.workspaceId, req.authUser!.id);
      if (!ws) return res.status(404).json({ error: 'Workspace not found' });
      const parsed = TransactionSchema.parse(req.body);
      if (parsed.type === 'transfer' && (!parsed.transfer_to_account_id || parsed.transfer_to_account_id === parsed.account_id)) {
        return res.status(400).json({ error: 'Transfer transactions require a distinct destination account.' });
      }
      const transaction = await createTransaction(ws.id, {
        account_id: parsed.account_id,
        transfer_to_account_id: parsed.type === 'transfer' ? (parsed.transfer_to_account_id ?? null) : null,
        description: parsed.description,
        amount: parsed.amount,
        currency: parsed.currency || ws.currency,
        type: parsed.type,
        category: parsed.type === 'transfer' ? 'Transfer' : parsed.category,
        accounting_class: parsed.accounting_class ?? 'standard',
        tx_date: parsed.tx_date,
        notes: parsed.notes ?? '',
        reference: parsed.reference ?? '',
        source: parsed.source ?? 'manual',
        import_batch_id: null,
        dedup_hash: null,
      });
      res.status(201).json({ transaction });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.patch('/api/workspaces/:workspaceId/transactions/:txId', requireAuthenticatedUser, async (req: AuthenticatedRequest, res) => {
    try {
      const ws = await verifyWorkspaceAccess(req.params.workspaceId, req.authUser!.id);
      if (!ws) return res.status(404).json({ error: 'Workspace not found' });
      const parsed = TransactionSchema.partial().parse(req.body);
      const transaction = await updateTransaction(ws.id, req.params.txId, parsed);
      res.json({ transaction });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.delete('/api/workspaces/:workspaceId/transactions/:txId', requireAuthenticatedUser, async (req: AuthenticatedRequest, res) => {
    try {
      const ws = await verifyWorkspaceAccess(req.params.workspaceId, req.authUser!.id);
      if (!ws) return res.status(404).json({ error: 'Workspace not found' });
      await deleteTransaction(ws.id, req.params.txId);
      res.json({ ok: true });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post('/api/workspaces/:workspaceId/imports/preview', requireAuthenticatedUser, async (req: AuthenticatedRequest, res) => {
    try {
      const ws = await verifyWorkspaceAccess(req.params.workspaceId, req.authUser!.id);
      if (!ws) return res.status(404).json({ error: 'Workspace not found' });
      const body = z
        .object({
          account_id: z.string().min(1),
          rows: z.array(
            z.object({
              tx_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
              description: z.string().min(1),
              amount: z.number().positive(),
              type: z.enum(['income', 'expense']),
              category: z.string().min(1),
              reference: z.string().optional().default(''),
            })
          ),
        })
        .parse(req.body);

      const overview = await getWorkspaceOverview(ws.id);
      const existingHashes = new Set(overview.transactions.map((t) => t.dedup_hash).filter(Boolean));
      const seenInBatch = new Set<string>();

      const previewRows = body.rows.map((row, idx) => {
        const hash = buildDedupHash({
          workspaceId: ws.id,
          accountId: body.account_id,
          txDate: row.tx_date,
          amount: row.amount,
          type: row.type,
          description: row.description,
          reference: row.reference,
        });
        const isDuplicate = existingHashes.has(hash) || seenInBatch.has(hash);
        seenInBatch.add(hash);
        return { index: idx, ...row, isDuplicate };
      });

      res.json({
        total: previewRows.length,
        duplicates: previewRows.filter((r) => r.isDuplicate).length,
        rows: previewRows,
      });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post('/api/workspaces/:workspaceId/imports/commit', requireAuthenticatedUser, async (req: AuthenticatedRequest, res) => {
    try {
      const ws = await verifyWorkspaceAccess(req.params.workspaceId, req.authUser!.id);
      if (!ws) return res.status(404).json({ error: 'Workspace not found' });
      const body = z
        .object({
          account_id: z.string().min(1),
          filename: z.string().trim().min(1).max(160),
          rows: z
            .array(
              z.object({
                tx_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
                description: z.string().trim().min(1).max(200),
                amount: z.coerce.number().positive(),
                type: z.enum(['income', 'expense']),
                category: z.string().trim().min(1).max(80),
                reference: z.string().trim().max(120).optional().default(''),
                notes: z.string().trim().max(400).optional().default(''),
              })
            )
            .min(1)
            .max(1000),
        })
        .parse(req.body);

      const result = await commitCsvImportBatch({
        workspaceId: ws.id,
        accountId: body.account_id,
        filename: body.filename,
        currency: ws.currency,
        rows: body.rows.map((r) => ({ ...r, source: 'csv_import' })),
      });
      res.status(201).json(result);
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post('/api/workspaces/:workspaceId/assets', requireAuthenticatedUser, async (req: AuthenticatedRequest, res) => {
    try {
      const ws = await verifyWorkspaceAccess(req.params.workspaceId, req.authUser!.id);
      if (!ws) return res.status(404).json({ error: 'Workspace not found' });
      const parsed = AssetSchema.parse(req.body);
      const asset = await createAsset(ws.id, {
        name: parsed.name,
        category: parsed.category,
        valuation: parsed.valuation,
        currency: parsed.currency || ws.currency,
        acquired_date: parsed.acquired_date ?? null,
        notes: parsed.notes ?? '',
      });
      res.status(201).json({ asset });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.patch('/api/workspaces/:workspaceId/assets/:assetId', requireAuthenticatedUser, async (req: AuthenticatedRequest, res) => {
    try {
      const ws = await verifyWorkspaceAccess(req.params.workspaceId, req.authUser!.id);
      if (!ws) return res.status(404).json({ error: 'Workspace not found' });
      const parsed = AssetSchema.partial().parse(req.body);
      const asset = await updateAsset(ws.id, req.params.assetId, parsed);
      res.json({ asset });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.delete('/api/workspaces/:workspaceId/assets/:assetId', requireAuthenticatedUser, async (req: AuthenticatedRequest, res) => {
    try {
      const ws = await verifyWorkspaceAccess(req.params.workspaceId, req.authUser!.id);
      if (!ws) return res.status(404).json({ error: 'Workspace not found' });
      await deleteAsset(ws.id, req.params.assetId);
      res.json({ ok: true });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post('/api/workspaces/:workspaceId/liabilities', requireAuthenticatedUser, async (req: AuthenticatedRequest, res) => {
    try {
      const ws = await verifyWorkspaceAccess(req.params.workspaceId, req.authUser!.id);
      if (!ws) return res.status(404).json({ error: 'Workspace not found' });
      const parsed = LiabilitySchema.parse(req.body);
      const liability = await createLiability(ws.id, {
        name: parsed.name,
        category: parsed.category,
        principal_balance: parsed.principal_balance,
        interest_rate: parsed.interest_rate ?? 0,
        due_date: parsed.due_date ?? null,
        currency: parsed.currency || ws.currency,
        notes: parsed.notes ?? '',
      });
      res.status(201).json({ liability });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.patch('/api/workspaces/:workspaceId/liabilities/:liabilityId', requireAuthenticatedUser, async (req: AuthenticatedRequest, res) => {
    try {
      const ws = await verifyWorkspaceAccess(req.params.workspaceId, req.authUser!.id);
      if (!ws) return res.status(404).json({ error: 'Workspace not found' });
      const parsed = LiabilitySchema.partial().parse(req.body);
      const liability = await updateLiability(ws.id, req.params.liabilityId, parsed);
      res.json({ liability });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.delete('/api/workspaces/:workspaceId/liabilities/:liabilityId', requireAuthenticatedUser, async (req: AuthenticatedRequest, res) => {
    try {
      const ws = await verifyWorkspaceAccess(req.params.workspaceId, req.authUser!.id);
      if (!ws) return res.status(404).json({ error: 'Workspace not found' });
      await deleteLiability(ws.id, req.params.liabilityId);
      res.json({ ok: true });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post('/api/workspaces/:workspaceId/snapshots', requireAuthenticatedUser, async (req: AuthenticatedRequest, res) => {
    try {
      const ws = await verifyWorkspaceAccess(req.params.workspaceId, req.authUser!.id);
      if (!ws) return res.status(404).json({ error: 'Workspace not found' });
      const overview = await getWorkspaceOverview(ws.id);
      const nw = calculateNetWorth(overview.accounts, overview.assets, overview.liabilities, overview.snapshots);
      const snapshot = await upsertFinancialSnapshot(ws.id, {
        snapshot_date: new Date().toISOString().slice(0, 10),
        total_cash_balances: nw.liquidAccountBalances,
        total_assets: nw.totalAssets,
        total_liabilities: nw.totalLiabilities,
        net_worth: nw.netWorth,
      });
      res.status(201).json({ snapshot });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post('/api/workspaces/:workspaceId/savings-goals', requireAuthenticatedUser, async (req: AuthenticatedRequest, res) => {
    try {
      const ws = await verifyWorkspaceAccess(req.params.workspaceId, req.authUser!.id);
      if (!ws) return res.status(404).json({ error: 'Workspace not found' });
      const parsed = SavingsGoalSchema.parse(req.body);
      const goal = await createSavingsGoal(ws.id, {
        account_id: parsed.account_id ?? null,
        name: parsed.name,
        target_amount: parsed.target_amount,
        current_amount: parsed.current_amount ?? 0,
        target_date: parsed.target_date ?? null,
        monthly_contribution: parsed.monthly_contribution ?? 0,
        currency: parsed.currency || ws.currency,
        status: parsed.status ?? 'active',
      });
      res.status(201).json({ goal });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.patch('/api/workspaces/:workspaceId/savings-goals/:goalId', requireAuthenticatedUser, async (req: AuthenticatedRequest, res) => {
    try {
      const ws = await verifyWorkspaceAccess(req.params.workspaceId, req.authUser!.id);
      if (!ws) return res.status(404).json({ error: 'Workspace not found' });
      const parsed = SavingsGoalSchema.partial().parse(req.body);
      const goal = await updateSavingsGoal(ws.id, req.params.goalId, parsed);
      res.json({ goal });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post('/api/workspaces/:workspaceId/savings-goals/:goalId/contributions', requireAuthenticatedUser, async (req: AuthenticatedRequest, res) => {
    try {
      const ws = await verifyWorkspaceAccess(req.params.workspaceId, req.authUser!.id);
      if (!ws) return res.status(404).json({ error: 'Workspace not found' });
      const parsed = SavingsContributionSchema.parse(req.body);
      const result = await recordSavingsContribution(ws.id, req.params.goalId, parsed);
      res.status(201).json(result);
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post('/api/workspaces/:workspaceId/reports', requireAuthenticatedUser, async (req: AuthenticatedRequest, res) => {
    try {
      const ws = await verifyWorkspaceAccess(req.params.workspaceId, req.authUser!.id);
      if (!ws) return res.status(404).json({ error: 'Workspace not found' });
      const body = z
        .object({
          title: z.string().trim().min(2).max(120),
          report_type: z.enum(['monthly_summary', 'cash_flow', 'net_worth', 'business_pnl']),
          period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          summary_json: z.record(z.string(), z.unknown()),
        })
        .parse(req.body);
      const report = await saveFinancialReport(ws.id, {
        title: body.title,
        report_type: body.report_type,
        period_start: body.period_start,
        period_end: body.period_end,
        summary_json: body.summary_json,
      });
      res.status(201).json({ report });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.get('/api/open-banking/institutions', requireAuthenticatedUser, (_req, res) => {
    res.json({
      provider: monoProvider.providerName,
      isSimulated: monoProvider.isSimulated,
      institutions: monoProvider.listInstitutions(),
    });
  });

  app.post('/api/workspaces/:workspaceId/bank-connections/link', requireAuthenticatedUser, async (req: AuthenticatedRequest, res) => {
    try {
      const ws = await verifyWorkspaceAccess(req.params.workspaceId, req.authUser!.id);
      if (!ws) return res.status(404).json({ error: 'Workspace not found' });
      const body = z
        .object({
          institution_code: z.string().min(2),
          institution_name: z.string().min(2),
          account_mask: z.string().trim().regex(/^\d{4}$/, 'Enter the last 4 digits only'),
          account_type: z.enum(['savings', 'current', 'business']).default('current'),
        })
        .parse(req.body);

      const exchange = await monoProvider.exchangeLinkCode({
        institutionCode: body.institution_code,
        institutionName: body.institution_name,
        accountMask: body.account_mask,
      });

      const linkedAccount = await createAccount(ws.id, {
        name: `${body.institution_name.split('(')[0].trim()} ••••${body.account_mask}`,
        institution: body.institution_name,
        account_type: body.account_type,
        currency: ws.currency,
        opening_balance: 0,
        external_provider: 'mono',
        external_account_id: exchange.externalConnectionId,
      });

      const connection = await createBankConnection(ws.id, {
        provider: monoProvider.providerName,
        institution_name: body.institution_name,
        institution_code: body.institution_code,
        account_mask: body.account_mask,
        linked_account_id: linkedAccount.id,
        external_connection_id: exchange.externalConnectionId,
        status: exchange.status,
        is_simulated: monoProvider.isSimulated,
        last_synced_at: null,
        metadata: { read_only: true },
      });

      res.status(201).json({ connection, account: linkedAccount });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post('/api/workspaces/:workspaceId/bank-connections/:connectionId/sync', requireAuthenticatedUser, async (req: AuthenticatedRequest, res) => {
    try {
      const ws = await verifyWorkspaceAccess(req.params.workspaceId, req.authUser!.id);
      if (!ws) return res.status(404).json({ error: 'Workspace not found' });
      const overview = await getWorkspaceOverview(ws.id);
      const connection = overview.bankConnections.find((c) => c.id === req.params.connectionId);
      if (!connection) return res.status(404).json({ error: 'Bank connection not found' });
      if (!connection.linked_account_id) return res.status(400).json({ error: 'No linked Monetra account found' });

      const syncRes = await monoProvider.syncAccountActivity({
        connection,
        accountId: connection.linked_account_id,
        currency: ws.currency,
      });

      const commitRes = await commitCsvImportBatch({
        workspaceId: ws.id,
        accountId: connection.linked_account_id,
        filename: `open-banking-${connection.institution_code}-sync`,
        currency: ws.currency,
        rows: syncRes.syncedTransactions.map((t) => ({
          tx_date: t.tx_date,
          description: t.description,
          amount: t.amount,
          type: t.type === 'income' ? 'income' : 'expense',
          category: t.category,
          reference: t.reference,
          notes: t.notes,
          source: 'open_banking',
        })),
      });

      await updateBankConnectionStatus(ws.id, connection.id, {
        status: 'connected',
        last_synced_at: syncRes.syncedAt,
      });

      res.json({
        importedCount: commitRes.importedCount,
        skippedDuplicates: commitRes.skippedDuplicates,
        syncedAt: syncRes.syncedAt,
        simulated: syncRes.simulated,
      });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post('/api/open-banking/webhook/mono', (req, res) => {
    const sig = req.headers['mono-webhook-secret'] as string | undefined;
    const raw = JSON.stringify(req.body ?? {});
    const verified = monoProvider.verifyWebhookSignature(raw, sig);
    if (!verified && process.env.MONO_WEBHOOK_SECRET) {
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }
    res.json({ received: true, verified });
  });

  app.post('/api/workspaces/:workspaceId/ai/chat', requireAuthenticatedUser, async (req: AuthenticatedRequest, res) => {
    try {
      const ws = await verifyWorkspaceAccess(req.params.workspaceId, req.authUser!.id);
      if (!ws) return res.status(404).json({ error: 'Workspace not found' });
      const body = z
        .object({
          prompt: z.string().trim().min(2).max(1500),
          history: z
            .array(
              z.object({
                role: z.enum(['user', 'assistant']),
                content: z.string(),
              })
            )
            .optional(),
        })
        .parse(req.body);

      const overview = await getWorkspaceOverview(ws.id);
      const result = await askFinancialAssistant({
        overview,
        prompt: body.prompt,
        history: body.history,
      });
      res.json(result);
    } catch (err) {
      handleError(res, err, 502);
    }
  });

  return app;
}
