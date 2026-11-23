import React, { useState } from 'react';
import { Briefcase, Building2, Check, User } from 'lucide-react';
import { apiRequest } from '../../lib/api.ts';
import { useMonetraAuth } from '../../lib/authContext.tsx';
import { CURRENCY_OPTIONS, type Profile, type Workspace } from '../../shared/types.ts';

export function OnboardingFlow() {
  const { profile, getAuthToken, setProfileAndWorkspaces } = useMonetraAuth();
  const [selection, setSelection] = useState<'personal' | 'business' | 'both'>('both');
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [country, setCountry] = useState(profile?.country || 'Nigeria');
  const [currency, setCurrency] = useState(profile?.preferred_currency || 'NGN');
  const [personalName, setPersonalName] = useState('Personal Finance');
  const [businessName, setBusinessName] = useState('');
  const [businessIndustry, setBusinessIndustry] = useState('Technology & Consulting');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleComplete(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await apiRequest<{ profile: Profile; workspaces: Workspace[] }>(
        '/api/onboarding',
        {
          method: 'POST',
          getToken: getAuthToken,
          body: {
            display_name: displayName,
            country,
            preferred_currency: currency,
            selection,
            personal_workspace_name: personalName,
            business_workspace_name: businessName || 'Business Operations',
            business_industry: businessIndustry,
          },
        }
      );
      setProfileAndWorkspaces(res.profile, res.workspaces);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save onboarding workspace');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
        <div className="space-y-1">
          <div className="text-xs font-medium text-emerald-800">Workspace Setup · Step 1 of 1</div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
            Configure your Monetra workspaces
          </h1>
          <p className="text-sm text-slate-500">
            Personal and business records stay strictly isolated. You can add or switch workspaces anytime.
          </p>
        </div>

        {error ? (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleComplete} className="space-y-6">
          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-700">
              How will you use Monetra?
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                {
                  id: 'personal' as const,
                  title: 'Personal finance',
                  desc: 'Accounts, budgeting, savings & net worth',
                  icon: User,
                },
                {
                  id: 'business' as const,
                  title: 'Business finance',
                  desc: 'Revenue, expenses, profitability & cash runway',
                  icon: Briefcase,
                },
                {
                  id: 'both' as const,
                  title: 'Both workspaces',
                  desc: 'Separate personal wealth & business ledger',
                  icon: Building2,
                },
              ].map((opt) => {
                const Icon = opt.icon;
                const selected = selection === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSelection(opt.id)}
                    className={`text-left p-4 rounded-xl border transition-colors cursor-pointer ${
                      selected
                        ? 'border-emerald-800 bg-emerald-50/40'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <Icon className={`w-4 h-4 ${selected ? 'text-emerald-800' : 'text-slate-500'}`} />
                      {selected ? <Check className="w-4 h-4 text-emerald-800" /> : null}
                    </div>
                    <div className="text-sm font-semibold text-slate-900">{opt.title}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{opt.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-700">Display name</label>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-700"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-700">Country</label>
              <input
                type="text"
                required
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-700"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-700">Preferred currency</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-emerald-700"
              >
                {CURRENCY_OPTIONS.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
            {selection === 'personal' || selection === 'both' ? (
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700">
                  Personal workspace name
                </label>
                <input
                  type="text"
                  required
                  value={personalName}
                  onChange={(e) => setPersonalName(e.target.value)}
                  placeholder="Personal Wealth"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-700"
                />
              </div>
            ) : null}

            {selection === 'business' || selection === 'both' ? (
              <>
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700">
                    Business workspace name
                  </label>
                  <input
                    type="text"
                    required
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="e.g. Zuri Ventures Ltd"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-700"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700">
                    Business industry
                  </label>
                  <input
                    type="text"
                    value={businessIndustry}
                    onChange={(e) => setBusinessIndustry(e.target.value)}
                    placeholder="Retail, Consulting, Logistics, SaaS..."
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-700"
                  />
                </div>
              </>
            ) : null}
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-slate-500">
              No bank passwords or sensitive credentials requested.
            </span>
            <button
              type="submit"
              disabled={busy}
              className="px-5 py-2.5 bg-emerald-800 hover:bg-emerald-900 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              {busy ? 'Creating workspaces...' : 'Launch Monetra'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
