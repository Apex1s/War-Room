export const TOKENS = {
  colors: {
    bg: '#0A0E17',
    panel: '#111826',
    panelElevated: '#162032',
    border: '#223049',
    text: '#E6EDF3',
    muted: '#8B9BB4',
    accent: '#E0A84B',
    danger: '#EF4444',
    safe: '#22C55E',
  },
  classes: {
    card: 'bg-[#111826] border border-[#223049] rounded-lg p-5 shadow-sm',
    cardInteractive:
      'bg-[#111826] border border-[#223049] hover:border-[#E0A84B]/70 rounded-lg p-5 transition-colors cursor-pointer',
    badge:
      'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-mono border border-[#223049] bg-[#162032] text-[#E6EDF3]',
    btnPrimary:
      'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md font-medium text-sm bg-[#E0A84B] text-[#0A0E17] hover:bg-[#e8b765] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer',
    btnSecondary:
      'inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-md font-medium text-sm bg-[#162032] text-[#E6EDF3] border border-[#223049] hover:border-[#E0A84B]/60 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer',
    input:
      'w-full rounded-md bg-[#0A0E17] border border-[#223049] px-3.5 py-2.5 text-sm text-[#E6EDF3] placeholder-[#8B9BB4]/60 focus:outline-none focus:border-[#E0A84B]',
  },
} as const;
