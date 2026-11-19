import { SAMPLE_BRIEFS, type GameTemplate } from '@warroom/core';
import { useEffect, useState } from 'react';
import { TOKENS } from '../tokens';

export interface BriefScreenProps {
  template: GameTemplate;
  initialObjective?: string;
  initialBrief?: string;
  sealingProgress: number | null;
  onBack: () => void;
  onSubmitBrief: (objective: string, brief: string) => void;
}

export function BriefScreen({
  template,
  initialObjective = '',
  initialBrief = '',
  sealingProgress,
  onBack,
  onSubmitBrief,
}: BriefScreenProps) {
  const [objective, setObjective] = useState(initialObjective);
  const [brief, setBrief] = useState(initialBrief);

  useEffect(() => {
    if (initialObjective) {
      setObjective(initialObjective);
    }
  }, [initialObjective]);

  useEffect(() => {
    if (initialBrief) {
      setBrief(initialBrief);
    }
  }, [initialBrief]);

  const isSealing = sealingProgress !== null;

  const handleLoadDemo = () => {
    const demo = SAMPLE_BRIEFS[0];
    setObjective(
      'Reach 1,000 paying teams for Kestrel Labs in 12 months without raising a seed round',
    );
    setBrief(demo.text);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!objective.trim() || !brief.trim() || isSealing) return;
    onSubmitBrief(objective.trim(), brief.trim());
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-5"
      data-testid="screen-brief"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="text-xs font-mono text-[#8B9BB4] hover:text-[#E6EDF3] mb-1 cursor-pointer"
          >
            ← Back to scenarios
          </button>
          <h2 className="text-xl font-semibold text-[#E6EDF3] m-0">
            {template.title} — Confidential Brief
          </h2>
          <p className="text-xs text-[#8B9BB4] mt-1 mb-0">
            Paste your real company names, metrics, pricing and locations. The Privacy Firewall seals them locally before anything leaves this device.
          </p>
        </div>

        <button
          type="button"
          onClick={handleLoadDemo}
          disabled={isSealing}
          className={TOKENS.classes.btnSecondary}
          data-testid="btn-load-demo-brief"
        >
          Load Demo Brief
        </button>
      </div>

      <div className={TOKENS.classes.card + ' flex flex-col gap-4'}>
        <div>
          <label
            htmlFor="wr-objective-input"
            className="block text-xs font-mono uppercase tracking-wider text-[#8B9BB4] mb-1.5"
          >
            Objective (One Line)
          </label>
          <input
            id="wr-objective-input"
            type="text"
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            placeholder={template.objectivePlaceholder}
            disabled={isSealing}
            className={TOKENS.classes.input}
            data-testid="input-objective"
          />
        </div>

        <div>
          <label
            htmlFor="wr-brief-textarea"
            className="block text-xs font-mono uppercase tracking-wider text-[#8B9BB4] mb-1.5"
          >
            Confidential Plan &amp; Context
          </label>
          <textarea
            id="wr-brief-textarea"
            rows={8}
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder={template.briefPlaceholder}
            disabled={isSealing}
            className={TOKENS.classes.input + ' leading-relaxed resize-y'}
            data-testid="textarea-brief"
          />
        </div>

        {isSealing && (
          <div className="p-3 rounded bg-[#162032] border border-[#E0A84B]/50 text-xs font-mono">
            <div className="flex justify-between mb-1.5 text-[#E0A84B]">
              <span>Sealing brief in local Privacy Firewall…</span>
              <span>{Math.round(sealingProgress * 100)}%</span>
            </div>
            <progress value={sealingProgress} max={1} className="w-full h-2" />
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <span className="text-xs font-mono text-[#8B9BB4]">
            🔒 Vault storage: local IndexedDB only
          </span>
          <button
            type="submit"
            disabled={!objective.trim() || !brief.trim() || isSealing}
            className={TOKENS.classes.btnPrimary}
            data-testid="btn-seal-brief"
          >
            {isSealing ? 'Sealing…' : 'Seal Brief in Privacy Firewall →'}
          </button>
        </div>
      </div>
    </form>
  );
}
