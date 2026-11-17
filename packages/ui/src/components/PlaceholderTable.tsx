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
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-[#E6EDF3] m-0">
            Placeholder Vault Map ({map.filter((e) => e.enabled).length} of {map.length} active)
          </h3>
          <p className="text-xs text-[#8B9BB4] mt-0.5 mb-0">
            Stored only in local IndexedDB (`vault`). Never sent to the cloud or written to Firestore.
          </p>
        </div>

        <form onSubmit={handleAdd} className="flex items-center gap-2">
          <input
            type="text"
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            placeholder="Add term to mask…"
            className="rounded bg-[#0A0E17] border border-[#223049] px-2.5 py-1.5 text-xs text-[#E6EDF3] focus:outline-none focus:border-[#E0A84B]"
            data-testid="input-manual-redact"
          />
          <select
            value={customType}
            onChange={(e) => setCustomType(e.target.value as EntityType)}
            className="rounded bg-[#0A0E17] border border-[#223049] px-2 py-1.5 text-xs text-[#E6EDF3]"
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
            className={TOKENS.classes.btnSecondary + ' !py-1.5 !px-3 !text-xs'}
            data-testid="btn-add-manual-redact"
          >
            + Add
          </button>
        </form>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs font-mono" data-testid="placeholder-table">
          <thead>
            <tr className="border-b border-[#223049] text-[#8B9BB4]">
              <th className="py-2 px-3">Active</th>
              <th className="py-2 px-3">Token</th>
              <th className="py-2 px-3">Original Value (Local Only)</th>
              <th className="py-2 px-3">Type</th>
              <th className="py-2 px-3">Detected By</th>
            </tr>
          </thead>
          <tbody>
            {map.map((entry) => (
              <tr
                key={entry.token}
                className={`border-b border-[#223049]/60 ${
                  entry.enabled ? 'text-[#E6EDF3]' : 'text-[#8B9BB4]/50 line-through'
                }`}
                data-testid={`placeholder-row-${entry.token}`}
              >
                <td className="py-2 px-3">
                  <input
                    type="checkbox"
                    checked={entry.enabled}
                    onChange={() => onToggleEntry(entry.token)}
                    className="accent-[#E0A84B] cursor-pointer"
                    aria-label={`Toggle redaction for ${entry.original}`}
                    data-testid={`toggle-${entry.token}`}
                  />
                </td>
                <td className="py-2 px-3 text-emerald-400 font-semibold">
                  {entry.token}
                </td>
                <td className="py-2 px-3 font-sans">
                  <span>{entry.original}</span>
                  {entry.aliases.length > 0 && (
                    <span className="ml-2 text-[11px] text-[#8B9BB4]">
                      ({entry.aliases.join(', ')})
                    </span>
                  )}
                </td>
                <td className="py-2 px-3">
                  <select
                    value={entry.type}
                    onChange={(e) =>
                      onChangeEntryType(entry.token, e.target.value as EntityType)
                    }
                    className="bg-[#0A0E17] border border-[#223049] rounded px-2 py-1 text-xs text-[#E6EDF3]"
                    aria-label={`Entity type for ${entry.original}`}
                  >
                    {ENTITY_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-2 px-3">
                  <span className="px-2 py-0.5 rounded bg-[#162032] border border-[#223049] text-[11px]">
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
