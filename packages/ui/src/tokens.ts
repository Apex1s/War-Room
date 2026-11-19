export const TOKENS = {
  colors: {
    bg: '#121413',
    surface: '#1C211E',
    text: '#E5E7EB',
    muted: '#9CA3A0',
    line: '#2D3630',
    mint: '#10B981',
    orange: '#F97316',
  },
  spacing: {
    s3: '3px',
    s5: '5px',
    s8: '8px',
    s13: '13px',
    s21: '21px',
    s34: '34px',
    s55: '55px',
    s89: '89px',
  },
  typeScale: {
    display: { size: '42px', mobileSize: '26px', lineHeight: 1.15 },
    title: { size: '26px', mobileSize: '20px', lineHeight: 1.25 },
    body: { size: '16px', lineHeight: 1.618 },
    label: { size: '12px', lineHeight: 1.4 },
  },
  classes: {
    card: 'bg-surface border border-line rounded-[8px] p-13 sm:p-21 min-w-0',
    cardInteractive:
      'bg-surface border border-line hover:border-mint rounded-[8px] p-13 sm:p-21 transition-colors cursor-pointer min-w-0',
    badge:
      'inline-flex items-center gap-5 px-8 py-3 rounded-[3px] font-mono text-label border border-line bg-surface text-text',
    btnPrimary:
      'inline-flex items-center justify-center gap-8 px-21 py-13 rounded-[8px] font-sans font-medium text-body bg-mint text-bg hover:bg-mint/90 focus-visible:outline-2 focus-visible:outline-mint disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer',
    btnSecondary:
      'inline-flex items-center justify-center gap-8 px-13 py-8 rounded-[8px] font-sans font-medium text-label bg-transparent text-text border border-line hover:border-mint focus-visible:outline-2 focus-visible:outline-mint disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer',
    input:
      'w-full rounded-[3px] bg-surface border border-line px-13 py-8 text-body text-text placeholder:text-muted focus:outline-none focus:border-mint',
    label: 'font-mono text-label uppercase tracking-[0.12em] text-muted',
  },
} as const;
