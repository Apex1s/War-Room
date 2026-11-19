import type { EntityType, PlaceholderEntry } from '@warroom/core';
import { useState } from 'react';
import { TOKENS } from '../tokens';

const ENTITY_TYPES: EntityType[] = [
  'COMPANY',
  'PERSON',
  'PRODUCT',
  'PLACE',
  'OTHER',
  'MONEY',
  'PERCENT',
  'NUMBER',
  'DATE',
  'CONTACT',
];

export interface PlaceholderTableProps {
  map: PlaceholderEntry[];
  onToggleEntry: (token: string) => void;
  onChangeEntryType: (token: string, newType: EntityType) => void;
  onAddManualTerm: (text: string, type: EntityType) => void;
}

export function PlaceholderTable({
  map,
  onToggleEntry,
  onChangeEntryType,
  onAddManualTerm,
}: PlaceholderTableProps) {
  const [customText, setCustomText] = useState('');
  const [customType, setCustomType] = useState<EntityType>('COMPANY');

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customText.trim();
    if (trimmed.length < 2) return;
    onAddManualTerm(trimmed, customType);
    setCustomText('');
  };

  return (
    <div className={TOKENS.classes.card}>
      <div className="flex flex-wrap items-center justify-between gap-13 mb-13">
        <div>
          <div className="terminal-label">
            PLACEHOLDER VAULT MAP ({map.filter((e) => e.enabled).length} OF{' '}
            {map.length} ACTIVE)
          </div>
          <p className="text-label text-muted mt-3 mb-0">
            Stored only in local IndexedDB (vault). Never sent to the cloud or written to Firestore.
          </p>
        </div>

        <form
          onSubmit={handleAdd}
          className="flex flex-wrap items-center gap-8 w-full sm:w-auto"
        >
          <input
            type="text"
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            placeholder="Add term to mask..."
            className="flex-1 min-w-[130px] rounded-[3px] bg-bg border border-line px-8 py-5 text-label text-text placeholder:text-muted focus:outline-none focus:border-mint"
            data-testid="input-manual-redact"
          />
          <select
            value={customType}
            onChange={(e) => setCustomType(e.target.value as EntityType)}
            className="rounded-[3px] bg-bg border border-line px-8 py-5 text-label font-mono text-text"
            aria-label="Custom entity type"
          >
            {ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className={TOKENS.classes.btnSecondary}
            data-testid="btn-add-manual-redact"
          >
            Add term
          </button>
        </form>
      </div>

      <div className="overflow-x-auto">
        <table
          className="w-full text-left border-collapse font-mono text-label"
          data-testid="placeholder-table"
        >
          <thead>
            <tr className="border-b border-line text-muted uppercase tracking-[0.12em]">
              <th className="py-8 px-13">ACTIVE</th>
              <th className="py-8 px-13">TOKEN</th>
              <th className="py-8 px-13">ORIGINAL VALUE (LOCAL ONLY)</th>
              <th className="py-8 px-13">TYPE</th>
              <th className="py-8 px-13">DETECTED BY</th>
            </tr>
          </thead>
          <tbody>
            {map.map((entry) => (
              <tr
                key={entry.token}
                className={`border-b border-line ${
                  entry.enabled ? 'text-text' : 'text-muted line-through'
                }`}
                data-testid={`placeholder-row-${entry.token}`}
              >
                <td className="py-8 px-13">
                  <input
                    type="checkbox"
                    checked={entry.enabled}
                    onChange={() => onToggleEntry(entry.token)}
                    className="accent-mint cursor-pointer"
                    aria-label={`Toggle redaction for ${entry.original}`}
                    data-testid={`toggle-${entry.token}`}
                  />
                </td>
                <td className="py-8 px-13 text-mint font-semibold">
                  {entry.token}
                </td>
                <td className="py-8 px-13 font-sans">
                  <span>{entry.original}</span>
                  {entry.aliases.length > 0 && (
                    <span className="ml-8 text-label text-muted">
                      ({entry.aliases.join(', ')})
                    </span>
                  )}
                </td>
                <td className="py-8 px-13">
                  <select
                    value={entry.type}
                    onChange={(e) =>
                      onChangeEntryType(
                        entry.token,
                        e.target.value as EntityType,
                      )
                    }
                    className="bg-bg border border-line rounded-[3px] px-8 py-3 text-label font-mono text-text"
                    aria-label={`Entity type for ${entry.original}`}
                  >
                    {ENTITY_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-8 px-13">
                  <span className="px-8 py-3 rounded-[3px] bg-bg border border-line text-label uppercase">
                    {entry.detectedBy}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
