import React, { useState } from 'react';
import { SignIn, SignUp } from '@clerk/clerk-react';
import { ArrowRight, KeyRound, Layers, ShieldCheck, WalletCards } from 'lucide-react';
import { apiRequest } from '../../lib/api.ts';
import { useMonetraAuth } from '../../lib/authContext.tsx';

type AuthModeTab = 'signin' | 'signup' | 'reset';

export function AuthScreen() {
  const { authMode, signInPreview, registerPreview, signInDemo } = useMonetraAuth();
  const [tab, setTab] = useState<AuthModeTab>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetRequestedCode, setResetRequestedCode] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatusMessage(null);
    setBusy(true);
    try {
      if (tab === 'signin') {
        await signInPreview(email, password);
      } else if (tab === 'signup') {
        await registerPreview(email, password, displayName);
      } else if (tab === 'reset') {
        if (!resetRequestedCode) {
          const res = await apiRequest<{ resetCodePreview: string | null; message: string }>(
            '/api/auth/reset-request',
            { method: 'POST', body: { email } }
          );
          setResetRequestedCode(res.resetCodePreview ?? 'SENT');
          setStatusMessage(
            res.resetCodePreview
              ? `${res.message} Recovery code: ${res.resetCodePreview}`
              : res.message
          );
        } else {
          await apiRequest('/api/auth/reset-confirm', {
            method: 'POST',
            body: { code: resetCode, newPassword },
          });
          setStatusMessage('Password updated. Sign in with your new credentials.');
          setTab('signin');
          setResetRequestedCode(null);
          setPassword('');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleDemoLaunch() {
    setError(null);
    setBusy(true);
    try {
      await signInDemo();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to launch demo workspace');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 grid grid-cols-1 lg:grid-cols-12">
      {/* Left Brand & Editorial Showcase */}
      <div className="lg:col-span-6 relative bg-slate-900 text-white flex flex-col justify-between p-8 sm:p-12 overflow-hidden">
        <img
          src="/src/assets/images/auth_fintech_backdrop_1795443813928.jpg"
          alt="Modern financial executive lounge"
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover opacity-35"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/75 to-slate-900/50" />

        <div className="relative z-10 flex items-center justify-between">
          <span className="text-xl font-bold tracking-tight font-display">Monetra</span>
          <span className="text-xs text-slate-300">Personal &amp; SME Financial Intelligence</span>
        </div>

        <div className="relative z-10 max-w-xl space-y-6 my-12">
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight leading-tight text-balance">
            Transform scattered financial data into a clear picture of your wealth, business performance and cash flow.
          </h1>
          <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
            Built for individuals and growing businesses across Nigeria and beyond. Manage multiple accounts, reconcile bank CSV statements, separate personal net worth from business P&amp;L, and consult an AI financial analyst grounded strictly in your ledger.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-white/15">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-medium text-emerald-300">
                <Layers className="w-4 h-4" />
                <span>Isolated Workspaces</span>
              </div>
              <p className="text-xs text-slate-300">Keep personal wealth and business operations strictly separate.</p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-medium text-emerald-300">
                <WalletCards className="w-4 h-4" />
                <span>Reconciled Ledgers</span>
              </div>
              <p className="text-xs text-slate-300">Exact NGN &amp; multi-currency balances backed by statement dedup.</p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-medium text-emerald-300">
                <ShieldCheck className="w-4 h-4" />
                <span>Verified AI Insights</span>
              </div>
              <p className="text-xs text-slate-300">Server-side Gemini analysis anchored to database totals.</p>
            </div>
          </div>
        </div>

        <div className="relative z-10 flex items-center justify-between text-xs text-slate-400">
          <span>Zero bank passwords or PINs ever collected</span>
          <span className="font-mono">NGN ₦ Default</span>
        </div>
      </div>

      {/* Right Authentication Panel */}
      <div className="lg:col-span-6 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md space-y-6">
          <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
            <button
              type="button"
              onClick={() => {
                setTab('signin');
                setError(null);
              }}
              className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                tab === 'signin'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('signup');
                setError(null);
              }}
              className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                tab === 'signup'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Create account
            </button>
            {authMode === 'preview' ? (
              <button
                type="button"
                onClick={() => {
                  setTab('reset');
                  setError(null);
                }}
                className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  tab === 'reset'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Recover password
              </button>
            ) : null}
          </div>

          {authMode === 'clerk' ? (
            <div className="bg-white border border-slate-200 rounded-xl p-4 flex justify-center">
              {tab === 'signup' ? <SignUp routing="hash" /> : <SignIn routing="hash" />}
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
            >
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  {tab === 'signin'
                    ? 'Sign in to Monetra'
                    : tab === 'signup'
                      ? 'Create your Monetra account'
                      : 'Reset your password'}
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  {tab === 'signin'
                    ? 'Access your personal and business financial workspaces.'
                    : tab === 'signup'
                      ? 'New accounts start clean with guided personal or business workspace onboarding.'
                      : 'Request a recovery code to regain access to your account.'}
                </p>
              </div>

              {error ? (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
                  {error}
                </div>
              ) : null}
              {statusMessage ? (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-mono">
                  {statusMessage}
                </div>
              ) : null}

              {tab === 'signup' ? (
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700">Full name</label>
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Adaobi Okafor"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700"
                  />
                </div>
              ) : null}

              {tab !== 'reset' || !resetRequestedCode ? (
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700">Email address</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.ng"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700"
                  />
                </div>
              ) : null}

              {tab !== 'reset' ? (
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700">Password</label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700"
                  />
                </div>
              ) : resetRequestedCode ? (
                <>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-slate-700">Recovery code</label>
                    <input
                      type="text"
                      required
                      value={resetCode}
                      onChange={(e) => setResetCode(e.target.value)}
                      placeholder="8-character code"
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-slate-700">New password</label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Minimum 8 characters"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700"
                    />
                  </div>
                </>
              ) : null}

              <button
                type="submit"
                disabled={busy}
                className="w-full py-2.5 px-4 bg-emerald-800 hover:bg-emerald-900 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>
                  {busy
                    ? 'Please wait...'
                    : tab === 'signin'
                      ? 'Sign in'
                      : tab === 'signup'
                        ? 'Create account'
                        : resetRequestedCode
                          ? 'Set new password'
                          : 'Send recovery code'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          {/* Isolated Demo Account Card */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-slate-900">
                  Explore Monetra Demo Workspace
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Isolated sample data: Personal Wealth Ledger &amp; Kora Craft Studio Ltd (NGN ₦)
                </p>
              </div>
              <KeyRound className="w-4 h-4 text-slate-400 shrink-0" />
            </div>
            <button
              type="button"
              onClick={handleDemoLaunch}
              disabled={busy}
              className="w-full py-2 px-4 border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-800 text-xs font-medium rounded-lg transition-colors cursor-pointer"
            >
              Launch Demo Account (Chinedu Rowland)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
