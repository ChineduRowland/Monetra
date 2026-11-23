export interface RuntimeConfig {
  authMode: 'clerk' | 'preview';
  clerkPublishableKey: string | null;
  databaseMode: 'supabase' | 'local_sqlite';
  geminiConfigured: boolean;
  openBankingMode: 'sandbox_simulated' | 'live';
}

export async function apiRequest<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    body?: unknown;
    token?: string | null;
    getToken?: () => Promise<string | null>;
  } = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'monetra-spa',
  };

  let resolvedToken = options.token ?? null;
  if (!resolvedToken && options.getToken) {
    resolvedToken = await options.getToken();
  }
  if (resolvedToken) {
    headers.Authorization = `Bearer ${resolvedToken}`;
  }

  const res = await fetch(path, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    parsed = { error: text || `Request failed (${res.status})` };
  }

  if (!res.ok) {
    throw new Error(String(parsed.error || `Request failed with status ${res.status}`));
  }

  return parsed as T;
}
