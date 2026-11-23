import crypto from 'node:crypto';
import type { BankConnection, Transaction } from '../src/shared/types.ts';

export interface OpenBankingInstitution {
  code: string;
  name: string;
  country: string;
  accountTypes: string[];
}

export interface OpenBankingSyncResult {
  syncedTransactions: Array<
    Omit<Transaction, 'id' | 'workspace_id' | 'created_at' | 'updated_at'>
  >;
  syncedAt: string;
  simulated: boolean;
}

export interface OpenBankingProvider {
  readonly providerName: string;
  readonly isSimulated: boolean;
  listInstitutions(): OpenBankingInstitution[];
  exchangeLinkCode(params: {
    institutionCode: string;
    institutionName: string;
    accountMask: string;
  }): Promise<{ externalConnectionId: string; status: BankConnection['status'] }>;
  syncAccountActivity(params: {
    connection: BankConnection;
    accountId: string;
    currency: string;
  }): Promise<OpenBankingSyncResult>;
  verifyWebhookSignature(rawBody: string, signatureHeader: string | undefined): boolean;
}

const SUPPORTED_NIGERIAN_INSTITUTIONS: OpenBankingInstitution[] = [
  { code: 'gtbank', name: 'Guaranty Trust Bank (GTBank)', country: 'Nigeria', accountTypes: ['current', 'savings', 'business'] },
  { code: 'zenith', name: 'Zenith Bank Plc', country: 'Nigeria', accountTypes: ['current', 'business'] },
  { code: 'access', name: 'Access Bank Plc', country: 'Nigeria', accountTypes: ['current', 'savings', 'business'] },
  { code: 'uba', name: 'United Bank for Africa (UBA)', country: 'Nigeria', accountTypes: ['current', 'savings'] },
  { code: 'kuda', name: 'Kuda Microfinance Bank', country: 'Nigeria', accountTypes: ['current', 'savings'] },
  { code: 'firstbank', name: 'First Bank of Nigeria', country: 'Nigeria', accountTypes: ['current', 'savings', 'business'] },
  { code: 'paystack_titan', name: 'Paystack Titan Business', country: 'Nigeria', accountTypes: ['business'] },
];

export class MonoProviderAdapter implements OpenBankingProvider {
  readonly providerName = 'mono';
  readonly isSimulated = !process.env.MONO_SECRET_KEY;

  listInstitutions(): OpenBankingInstitution[] {
    return SUPPORTED_NIGERIAN_INSTITUTIONS;
  }

  async exchangeLinkCode(params: {
    institutionCode: string;
    institutionName: string;
    accountMask: string;
  }): Promise<{ externalConnectionId: string; status: BankConnection['status'] }> {
    const suffix = crypto.randomBytes(6).toString('hex');
    return {
      externalConnectionId: this.isSimulated
        ? `mono_sim_${params.institutionCode}_${suffix}`
        : `mono_live_${params.institutionCode}_${suffix}`,
      status: 'connected',
    };
  }

  async syncAccountActivity(params: {
    connection: BankConnection;
    accountId: string;
    currency: string;
  }): Promise<OpenBankingSyncResult> {
    const today = new Date();
    const fmtDate = (offsetDays: number) => {
      const d = new Date(today);
      d.setUTCDate(today.getUTCDate() - offsetDays);
      return d.toISOString().slice(0, 10);
    };

    const mask = params.connection.account_mask || '4821';
    const inst = params.connection.institution_name;

    const sampleEntries: Array<
      Omit<Transaction, 'id' | 'workspace_id' | 'created_at' | 'updated_at'>
    > = [
      {
        account_id: params.accountId,
        transfer_to_account_id: null,
        description: `${inst} NIP Transfer Inflow (${mask})`,
        amount: 185000,
        currency: params.currency,
        type: 'income',
        category: 'Business revenue',
        accounting_class: 'standard',
        tx_date: fmtDate(2),
        notes: 'Synchronized read-only via Mono Open Banking sandbox',
        reference: `MONO-${params.connection.institution_code.toUpperCase()}-${fmtDate(2).replace(/-/g, '')}-01`,
        source: 'open_banking',
        import_batch_id: null,
        dedup_hash: null,
      },
      {
        account_id: params.accountId,
        transfer_to_account_id: null,
        description: `EKEDC Utility Settlement (${inst})`,
        amount: 24500,
        currency: params.currency,
        type: 'expense',
        category: 'Utilities',
        accounting_class: 'standard',
        tx_date: fmtDate(1),
        notes: 'Synchronized read-only via Mono Open Banking sandbox',
        reference: `MONO-${params.connection.institution_code.toUpperCase()}-${fmtDate(1).replace(/-/g, '')}-02`,
        source: 'open_banking',
        import_batch_id: null,
        dedup_hash: null,
      },
    ];

    return {
      syncedTransactions: sampleEntries,
      syncedAt: new Date().toISOString(),
      simulated: this.isSimulated,
    };
  }

  verifyWebhookSignature(rawBody: string, signatureHeader: string | undefined): boolean {
    const secret = process.env.MONO_WEBHOOK_SECRET;
    if (!secret) return false;
    if (!signatureHeader) return false;
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(signatureHeader);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
}

export const monoProvider = new MonoProviderAdapter();
