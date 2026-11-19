import {
  cleanPunctuation,
  SAMPLE_BRIEFS,
  type GameTemplate,
} from '@warroom/core';
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
      className="flex flex-col gap-21"
      data-testid="screen-brief"
    >
      <div className="flex flex-wrap items-center justify-between gap-13">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="font-mono text-label uppercase tracking-[0.12em] text-muted hover:text-text mb-5 cursor-pointer"
          >
            Back to scenarios
          </button>
          <h2 className="text-title font-semibold text-text m-0">
            {cleanPunctuation(template.title)}: confidential brief
          </h2>
          <p className="text-body text-muted mt-5 mb-0">
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
          Load demo brief
        </button>
      </div>

      <div className={TOKENS.classes.card + ' flex flex-col gap-21'}>
        <div>
          <label
            htmlFor="wr-objective-input"
            className="block terminal-label mb-8"
          >
            OBJECTIVE (ONE LINE)
          </label>
          <input
            id="wr-objective-input"
            type="text"
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            placeholder={cleanPunctuation(template.objectivePlaceholder)}
            disabled={isSealing}
            className={TOKENS.classes.input}
            data-testid="input-objective"
          />
        </div>

        <div>
          <label
            htmlFor="wr-brief-textarea"
            className="block terminal-label mb-8"
          >
            CONFIDENTIAL PLAN AND CONTEXT
          </label>
          <textarea
            id="wr-brief-textarea"
            rows={8}
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder={cleanPunctuation(template.briefPlaceholder)}
            disabled={isSealing}
            className={TOKENS.classes.input + ' resize-y'}
            data-testid="textarea-brief"
          />
        </div>

        {isSealing && (
          <div className="p-13 rounded-[3px] bg-bg border border-mint font-mono text-label">
            <div className="flex items-center justify-between mb-8 text-mint">
              <span className="inline-flex items-center gap-8">
                <span className="wr-live-dot" aria-hidden="true" />
                <span>SEALING BRIEF IN LOCAL PRIVACY FIREWALL...</span>
              </span>
              <span>{Math.round(sealingProgress * 100)}%</span>
            </div>
            <progress value={sealingProgress} max={1} className="w-full h-5" />
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-13 pt-8">
          <span className="font-mono text-label uppercase tracking-[0.12em] text-muted">
            VAULT STORAGE: LOCAL INDEXEDDB ONLY
          </span>
          <button
            type="submit"
            disabled={!objective.trim() || !brief.trim() || isSealing}
            className={TOKENS.classes.btnPrimary}
            data-testid="btn-seal-brief"
          >
            {isSealing ? 'Sealing...' : 'Seal brief in privacy firewall'}
          </button>
        </div>
      </div>
    </form>
  );
}
