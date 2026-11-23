import React from 'react';
import { X } from 'lucide-react';

export function Card({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-white border border-slate-200 rounded-xl ${className}`}>
      {children}
    </div>
  );
}

export function MetricTile({
  label,
  value,
  subtext,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  subtext?: string;
  tone?: 'neutral' | 'positive' | 'negative' | 'accent';
}) {
  const valueTone =
    tone === 'positive'
      ? 'text-emerald-700'
      : tone === 'negative'
        ? 'text-rose-700'
        : tone === 'accent'
          ? 'text-slate-900'
          : 'text-slate-900';

  return (
    <Card className="p-5 flex flex-col justify-between gap-2">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`text-2xl font-semibold tracking-tight font-mono tabular-nums ${valueTone}`}>
        {value}
      </div>
      {subtext ? <div className="text-xs text-slate-500 truncate">{subtext}</div> : null}
    </Card>
  );
}

export function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 tracking-tight">{title}</h2>
        {subtitle ? <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p> : null}
      </div>
      {action ? <div className="flex items-center gap-2 shrink-0">{action}</div> : null}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <Card className="p-10 text-center flex flex-col items-center justify-center gap-3">
      <div className="w-11 h-11 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
        {icon}
      </div>
      <div className="max-w-md space-y-1">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        <p className="text-sm text-slate-500">{description}</p>
      </div>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-2 px-4 py-2 text-sm font-medium text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          {actionLabel}
        </button>
      ) : null}
    </Card>
  );
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  maxWidth = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className={`w-full ${maxWidth} bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden`}>
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-base font-semibold text-slate-900">{title}</h3>
            {subtitle ? <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 max-h-[80vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function SkeletonGrid() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="h-3 w-24 bg-slate-200 rounded" />
            <div className="h-6 w-36 bg-slate-200 rounded" />
            <div className="h-3 w-28 bg-slate-100 rounded" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 h-80 bg-white border border-slate-200 rounded-xl" />
        <div className="h-80 bg-white border border-slate-200 rounded-xl" />
      </div>
    </div>
  );
}
