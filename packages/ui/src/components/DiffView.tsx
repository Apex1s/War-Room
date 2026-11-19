import type { EntityType, TextSpan } from '@warroom/core';
import { useState, type ReactNode } from 'react';
import { TOKENS } from '../tokens';

export interface DiffViewProps {
  rawObjective: string;
  rawBrief: string;
  abstractedObjective: string;
  abstractedBrief: string;
  objectiveSpans: TextSpan[];
  briefSpans: TextSpan[];
  onAddSelectedTerm: (text: string, type: EntityType) => void;
}

function renderRedactedOriginal(text: string, spans: TextSpan[]): ReactNode[] {
  if (spans.length === 0) return [text];

  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const nodes: ReactNode[] = [];
  let cursor = 0;

  sorted.forEach((span, idx) => {
    if (span.start > cursor) {
      nodes.push(text.slice(cursor, span.start));
    }
    nodes.push(
      <mark
        key={`${span.start}-${idx}`}
        className="bg-transparent text-orange underline decoration-orange underline-offset-4 font-mono px-3"
        title={`Replaced by ${span.token}`}
      >
        {text.slice(span.start, span.end)}
      </mark>,
    );
    cursor = span.end;
  });

  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }

  return nodes;
}

const TOKEN_SPLIT_RE =
  /(\[(?:COMPANY|PERSON|PRODUCT|PLACE|OTHER|MONEY|PERCENT|NUMBER|DATE|CONTACT)_\d+\])/g;

function renderAbstractedWithTokens(text: string): ReactNode[] {
  const parts = text.split(TOKEN_SPLIT_RE);
  return parts.map((part, idx) => {
    if (part.startsWith('[') && part.endsWith(']')) {
      return (
        <mark
          key={`tok-${idx}`}
          className="inline-block bg-bg text-mint border border-line rounded-[3px] px-5 py-3 font-mono text-label mx-3"
        >
          {part}
        </mark>
      );
    }
    return part;
  });
}

export function DiffView({
  rawObjective,
  rawBrief,
  abstractedObjective,
  abstractedBrief,
  objectiveSpans,
  briefSpans,
  onAddSelectedTerm,
}: DiffViewProps) {
  const [selectedText, setSelectedText] = useState('');
  const [selectedType, setSelectedType] = useState<EntityType>('COMPANY');

  const handleMouseUp = () => {
    const sel = window.getSelection()?.toString().trim() ?? '';
    if (sel.length >= 2 && sel.length <= 120 && !sel.includes('[')) {
      setSelectedText(sel);
    }
  };

  const handleAddSelection = () => {
    const clean = selectedText.trim();
    if (clean.length < 2) return;
    onAddSelectedTerm(clean, selectedType);
    setSelectedText('');
    window.getSelection()?.removeAllRanges();
  };

  return (
    <div className="flex flex-col gap-13">
      <div
        className="flex flex-wrap items-center justify-between gap-13 px-13 py-8 rounded-[3px] bg-surface border border-line text-label"
        data-testid="selection-redact-bar"
      >
        <span className="text-muted">
          Select any unredacted word or phrase in the left pane to add it to the privacy map.
        </span>
        {selectedText ? (
          <div className="flex flex-wrap items-center gap-8">
            <span className="font-mono text-mint">"{selectedText}"</span>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as EntityType)}
              className="bg-bg border border-line rounded-[3px] px-8 py-5 text-label font-mono text-text"
              aria-label="Entity type for selection"
            >
              <option value="COMPANY">COMPANY</option>
              <option value="PERSON">PERSON</option>
              <option value="PRODUCT">PRODUCT</option>
              <option value="PLACE">PLACE</option>
              <option value="OTHER">OTHER</option>
            </select>
            <button
              type="button"
              onClick={handleAddSelection}
              className={TOKENS.classes.btnSecondary}
              data-testid="btn-redact-selection"
            >
              Redact selection
            </button>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-13">
        <div
          className={TOKENS.classes.card}
          onMouseUp={handleMouseUp}
          data-testid="diff-original-pane"
        >
          <div className="flex items-center justify-between mb-13">
            <span className="font-mono text-label uppercase tracking-[0.12em] text-orange">
              ORIGINAL (LOCAL VAULT ONLY)
            </span>
            <span className="font-mono text-label text-muted">
              Orange underline = removed
            </span>
          </div>

          <div className="mb-13">
            <div className="terminal-label mb-5">OBJECTIVE</div>
            <div className="text-body whitespace-pre-wrap break-words bg-bg border border-line rounded-[3px] p-13">
              {renderRedactedOriginal(rawObjective, objectiveSpans)}
            </div>
          </div>

          <div>
            <div className="terminal-label mb-5">CONFIDENTIAL PLAN</div>
            <div className="text-body whitespace-pre-wrap break-words bg-bg border border-line rounded-[3px] p-13 min-h-[160px]">
              {renderRedactedOriginal(rawBrief, briefSpans)}
            </div>
          </div>
        </div>

        <div className={TOKENS.classes.card} data-testid="diff-abstracted-pane">
          <div className="flex items-center justify-between mb-13">
            <span className="font-mono text-label uppercase tracking-[0.12em] text-mint">
              ABSTRACTED (CLOUD PAYLOAD VIEW)
            </span>
            <span className="font-mono text-label text-muted">
              Mint chip = placeholder
            </span>
          </div>

          <div className="mb-13">
            <div className="terminal-label mb-5">OBJECTIVE</div>
            <div
              className="text-body whitespace-pre-wrap break-words bg-bg border border-line rounded-[3px] p-13"
              data-testid="abstracted-objective-text"
            >
              {renderAbstractedWithTokens(abstractedObjective)}
            </div>
          </div>

          <div>
            <div className="terminal-label mb-5">ABSTRACTED PLAN</div>
            <div
              className="text-body whitespace-pre-wrap break-words bg-bg border border-line rounded-[3px] p-13 min-h-[160px]"
              data-testid="abstracted-brief-text"
            >
              {renderAbstractedWithTokens(abstractedBrief)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
