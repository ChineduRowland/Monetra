import React, { useState } from 'react';
import { Save, Trash2 } from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import { useMonetraAuth } from '../lib/authContext.tsx';
import { CURRENCY_OPTIONS, type WorkspaceOverviewData } from '../shared/types.ts';
import { Card, SectionHeader } from '../components/ui/Primitives.tsx';

export function SettingsPage({
  overview,
  onReload,
  onOpenNewWorkspace,
}: {
  overview: WorkspaceOverviewData;
  onReload: () => Promise<void>;
  onOpenNewWorkspace: () => void;
}) {
  const { profile, workspaces, getAuthToken, refreshMe, signOut, setActiveWorkspaceId } = useMonetraAuth();
  const { workspace } = overview;

  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [country, setCountry] = useState(profile?.country ?? 'Nigeria');
  const [preferredCurrency, setPreferredCurrency] = useState(profile?.preferred_currency ?? 'NGN');
  const [wsName, setWsName] = useState(workspace.name);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatusMsg(null);
    try {
      await apiRequest('/api/me', {
        method: 'PATCH',
        getToken: getAuthToken,
        body: {
          display_name: displayName,
          country,
          preferred_currency: preferredCurrency,
        },
      });
      await refreshMe();
      setStatusMsg('Profile settings saved.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRenameWorkspace(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatusMsg(null);
    try {
      await apiRequest(`/api/workspaces/${workspace.id}`, {
        method: 'PATCH',
        getToken: getAuthToken,
        body: { name: wsName },
      });
      await refreshMe();
      await onReload();
      setStatusMsg('Workspace name updated.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteWorkspace(wsId: string) {
    setBusy(true);
    setStatusMsg(null);
    try {
      await apiRequest(`/api/workspaces/${wsId}`, {
        method: 'DELETE',
        getToken: getAuthToken,
      });
      const res = await refreshMe();
      if (res && res.workspaces[0]) {
        setActiveWorkspaceId(res.workspaces[0].id);
      }
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Unable to delete workspace');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Settings & Workspaces"
        subtitle="Manage your profile defaults and isolated personal or business workspaces"
      />

      {statusMsg ? (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
          {statusMsg}
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-900">User Profile</h3>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">Display name</label>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-700">Country</label>
                <input
                  type="text"
                  required
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-700">Preferred currency</label>
                <select
                  value={preferredCurrency}
                  onChange={(e) => setPreferredCurrency(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {CURRENCY_OPTIONS.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 text-xs font-medium text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg flex items-center gap-1.5 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save profile</span>
            </button>
          </form>
        </Card>

        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Workspaces</h3>
            <button
              type="button"
              onClick={onOpenNewWorkspace}
              className="text-xs font-medium text-emerald-800 hover:underline cursor-pointer"
            >
              + New workspace
            </button>
          </div>

          <form onSubmit={handleRenameWorkspace} className="flex items-center gap-2">
            <input
              type="text"
              required
              value={wsName}
              onChange={(e) => setWsName(e.target.value)}
              className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg"
            />
            <button
              type="submit"
              disabled={busy}
              className="px-3 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg cursor-pointer"
            >
              Rename active
            </button>
          </form>

          <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
            {workspaces.map((ws) => (
              <div key={ws.id} className="px-3.5 py-2.5 flex items-center justify-between text-xs">
                <div>
                  <div className="font-medium text-slate-900">{ws.name}</div>
                  <div className="text-[11px] text-slate-500 capitalize">
                    {ws.type} · {ws.currency}
                  </div>
                </div>
                {workspaces.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => handleDeleteWorkspace(ws.id)}
                    aria-label={`Delete ${ws.name}`}
                    className="p-1.5 text-slate-400 hover:text-rose-700 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </Card>
      </div>

      {!profile?.is_demo ? (
        <Card className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-rose-200">
          <div>
            <h3 className="text-sm font-semibold text-rose-900">Delete Account &amp; Financial Records</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Permanently removes your profile, workspaces, accounts, and transaction ledgers.
            </p>
          </div>
          <button
            type="button"
            onClick={async () => {
              await apiRequest('/api/me', { method: 'DELETE', getToken: getAuthToken });
              await signOut();
            }}
            className="px-4 py-2 text-xs font-medium text-white bg-rose-700 hover:bg-rose-800 rounded-lg cursor-pointer whitespace-nowrap self-start sm:self-auto"
          >
            Delete my account
          </button>
        </Card>
      ) : null}
    </div>
  );
}
