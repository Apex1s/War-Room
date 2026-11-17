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
        className="bg-red-950/80 text-red-300 border border-red-500/40 rounded px-1 py-0.5 font-mono text-[0.82em]"
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

const TOKEN_SPLIT_RE = /(\[(?:COMPANY|PERSON|PRODUCT|PLACE|OTHER|MONEY|PERCENT|NUMBER|DATE|CONTACT)_\d+\])/g;

function renderAbstractedWithTokens(text: string): ReactNode[] {
  const parts = text.split(TOKEN_SPLIT_RE);
  return parts.map((part, idx) => {
    if (part.startsWith('[') && part.endsWith(']')) {
      return (
        <mark
          key={`tok-${idx}`}
          className="bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 rounded px-1 py-0.5 font-mono text-[0.82em]"
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
    <div className="flex flex-col gap-4">
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-md bg-[#162032] border border-[#223049] text-xs"
        data-testid="selection-redact-bar"
      >
        <span className="text-[#8B9BB4]">
          Tip: Select any unredacted word or phrase in the left pane to add it to the privacy map.
        </span>
        {selectedText ? (
          <div className="flex items-center gap-2">
            <span className="font-mono text-[#E0A84B]">"{selectedText}"</span>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as EntityType)}
              className="bg-[#0A0E17] border border-[#223049] rounded px-2 py-1 text-xs text-[#E6EDF3]"
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
              className="px-2.5 py-1 rounded bg-[#E0A84B] text-[#0A0E17] font-semibold cursor-pointer"
              data-testid="btn-redact-selection"
            >
              Redact selection
            </button>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div
          className={TOKENS.classes.card}
          onMouseUp={handleMouseUp}
          data-testid="diff-original-pane"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-mono uppercase tracking-wider text-red-400">
              🔒 Original (Kept in Local Vault Only)
            </span>
            <span className="text-xs font-mono text-[#8B9BB4]">
              Red = removed
            </span>
          </div>

          <div className="mb-3">
            <div className="text-xs font-mono text-[#8B9BB4] mb-1">Objective</div>
            <div className="text-sm leading-relaxed whitespace-pre-wrap bg-[#0A0E17] border border-[#223049] rounded p-3">
              {renderRedactedOriginal(rawObjective, objectiveSpans)}
            </div>
          </div>

          <div>
            <div className="text-xs font-mono text-[#8B9BB4] mb-1">Confidential Plan</div>
            <div className="text-sm leading-relaxed whitespace-pre-wrap bg-[#0A0E17] border border-[#223049] rounded p-3 min-h-[160px]">
              {renderRedactedOriginal(rawBrief, briefSpans)}
            </div>
          </div>
        </div>

        <div className={TOKENS.classes.card} data-testid="diff-abstracted-pane">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-mono uppercase tracking-wider text-emerald-400">
              ☁️ Abstracted (What Cloud Opponents See)
            </span>
            <span className="text-xs font-mono text-[#8B9BB4]">
              Green = placeholder
            </span>
          </div>

          <div className="mb-3">
            <div className="text-xs font-mono text-[#8B9BB4] mb-1">Objective</div>
            <div
              className="text-sm leading-relaxed whitespace-pre-wrap bg-[#0A0E17] border border-[#223049] rounded p-3"
              data-testid="abstracted-objective-text"
            >
              {renderAbstractedWithTokens(abstractedObjective)}
            </div>
          </div>

          <div>
            <div className="text-xs font-mono text-[#8B9BB4] mb-1">Abstracted Plan</div>
            <div
              className="text-sm leading-relaxed whitespace-pre-wrap bg-[#0A0E17] border border-[#223049] rounded p-3 min-h-[160px]"
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
