import type { SyncStatus as Status } from '../../lib/training/queue';

// The save indicator in the header. Its width is fixed, so "Saved", "Saving"
// and "Offline" swap in place and nothing on the screen moves when a tap goes
// out or lands. The word and icon are for the eye; a screen reader hears the
// whole sentence instead.

export function SyncStatus({ status }: { status: Status }) {
  const tone = status.kind === 'offline' ? 'text-amber' : 'text-neutral-400';

  return (
    <span role="status" className={`inline-flex w-[76px] shrink-0 items-center justify-end gap-1 text-sm ${tone}`}>
      <Icon kind={status.kind} />
      <span aria-hidden="true">{status.word}</span>
      <span className="sr-only">{status.spoken}</span>
    </span>
  );
}

function Icon({ kind }: { kind: Status['kind'] }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  if (kind === 'saving') {
    return (
      <svg {...common} className="motion-safe:animate-spin">
        <path d="M21 12a9 9 0 1 1-3-6.7" />
        <path d="M21 4v5h-5" />
      </svg>
    );
  }

  if (kind === 'offline') {
    return (
      <svg {...common}>
        <path d="M17.5 19H7a5 5 0 0 1-1.4-9.8" />
        <path d="M10 5.2A6 6 0 0 1 18 10a4.5 4.5 0 0 1 3 7.4" />
        <path d="M3 3l18 18" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M17.5 19H7a5 5 0 1 1 1-9.9A6 6 0 0 1 18 10a4.5 4.5 0 0 1-.5 9z" />
      <path d="M9.5 14l2 2 3.5-3.5" />
    </svg>
  );
}
