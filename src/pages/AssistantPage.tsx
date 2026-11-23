import React, { useState } from 'react';
import { Send, Sparkles } from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import { useMonetraAuth } from '../lib/authContext.tsx';
import type { WorkspaceOverviewData } from '../shared/types.ts';
import { Card, SectionHeader } from '../components/ui/Primitives.tsx';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function AssistantPage({ overview }: { overview: WorkspaceOverviewData }) {
  const { config, getAuthToken } = useMonetraAuth();
  const { workspace } = overview;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const starterPrompts =
    workspace.type === 'business'
      ? [
          'Summarize my operating profit margin and burn rate based on my recorded business ledger.',
          'Which expense categories represent the biggest drag on cash flow?',
          'How does our current cash runway look against our monthly expenses?',
        ]
      : [
          'Analyze my current net worth breakdown and debt-to-asset position.',
          'Where is most of my spending going, and how can I boost my savings rate?',
          'How close am I to completing my active savings goals at my current pace?',
        ];

  async function sendMessage(promptText: string) {
    const trimmed = promptText.trim();
    if (!trimmed || loading) return;
    setError(null);
    const nextHistory: ChatMessage[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(nextHistory);
    setInput('');
    setLoading(true);
    try {
      const res = await apiRequest<{ reply: string; model: string }>(
        `/api/workspaces/${workspace.id}/ai/chat`,
        {
          method: 'POST',
          getToken: getAuthToken,
          body: {
            prompt: trimmed,
            history: messages.slice(-6),
          },
        }
      );
      setMessages([...nextHistory, { role: 'assistant', content: res.reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reach Gemini AI Financial Advisor');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="AI Financial Assistant"
        subtitle={`Grounded strictly in verified database records for "${workspace.name}" (${workspace.currency})`}
      />

      {!config.geminiConfigured ? (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
          GEMINI_API_KEY is not configured in server secrets yet. Add it in your environment / Settings &gt; Secrets panel to activate live AI insights.
        </div>
      ) : null}

      <Card className="p-6 space-y-5">
        {messages.length === 0 ? (
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-2.5 text-sm font-semibold text-slate-900">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-800 flex items-center justify-center">
                <Sparkles className="w-4 h-4" />
              </div>
              <span>Ask about your cash flow, net worth, spending drivers, or business P&amp;L</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {starterPrompts.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => sendMessage(p)}
                  className="text-left p-4 rounded-xl border border-slate-200 hover:border-emerald-700 hover:bg-emerald-50/30 text-xs text-slate-700 transition-colors cursor-pointer"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4 max-h-[480px] overflow-y-auto pr-1">
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`p-4 rounded-xl text-sm leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-slate-900 text-white ml-auto max-w-2xl'
                    : 'bg-slate-50 border border-slate-200 text-slate-800 mr-auto max-w-3xl'
                }`}
              >
                <div className="text-[11px] font-semibold mb-1 opacity-70">
                  {m.role === 'user' ? 'You' : 'Monetra Financial Advisor'}
                </div>
                {m.content}
              </div>
            ))}
            {loading ? (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 max-w-xs">
                Analyzing verified workspace ledger...
              </div>
            ) : null}
          </div>
        )}

        {error ? (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
            {error}
          </div>
        ) : null}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage(input);
          }}
          className="flex items-center gap-2 pt-2 border-t border-slate-200"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Ask about ${workspace.name} (${workspace.currency})...`}
            className="flex-1 px-4 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-700"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="px-4 py-2.5 bg-emerald-800 hover:bg-emerald-900 disabled:opacity-50 text-white text-xs font-medium rounded-lg flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Analyze</span>
          </button>
        </form>
      </Card>
    </div>
  );
}
