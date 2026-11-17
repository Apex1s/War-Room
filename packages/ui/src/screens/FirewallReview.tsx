import {
  applyMapWithSpans,
  buildMap,
  type EntityType,
  type GameRecord,
  type PlaceholderEntry,
  type VaultRecord,
} from '@warroom/core';
import { DiffView } from '../components/DiffView';
import { PlaceholderTable } from '../components/PlaceholderTable';
import { TOKENS } from '../tokens';

export interface FirewallReviewScreenProps {
  game: GameRecord;
  vaultRecord: VaultRecord;
  onUpdateMap: (nextMap: PlaceholderEntry[], nextAbstractedObjective: string, nextAbstractedBrief: string) => void;
  onApprove: () => void;
  onBackToEdit: () => void;
}

function recomputeAndNotify(
  vaultRecord: VaultRecord,
  nextMap: PlaceholderEntry[],
  onUpdateMap: FirewallReviewScreenProps['onUpdateMap'],
) {
  const objRes = applyMapWithSpans(vaultRecord.rawObjective, nextMap);
  const briefRes = applyMapWithSpans(vaultRecord.rawBrief, nextMap);
  onUpdateMap(nextMap, objRes.abstracted, briefRes.abstracted);
}

export function FirewallReviewScreen({
  game,
  vaultRecord,
  onUpdateMap,
  onApprove,
  onBackToEdit,
}: FirewallReviewScreenProps) {
  const objApplied = applyMapWithSpans(vaultRecord.rawObjective, vaultRecord.map);
  const briefApplied = applyMapWithSpans(vaultRecord.rawBrief, vaultRecord.map);

  const handleToggleEntry = (token: string) => {
    const nextMap = vaultRecord.map.map((entry) =>
      entry.token === token ? { ...entry, enabled: !entry.enabled } : entry,
    );
    recomputeAndNotify(vaultRecord, nextMap, onUpdateMap);
  };

  const handleChangeEntryType = (token: string, newType: EntityType) => {
    const existingNumbers = vaultRecord.map
      .filter((e) => e.type === newType && e.token !== token)
      .map((e) => {
        const m = /_(\d+)\]$/.exec(e.token);
        return m ? Number(m[1]) : 0;
      });
    const nextNum = (existingNumbers.length ? Math.max(...existingNumbers) : 0) + 1;
    const newToken = `[${newType}_${nextNum}]`;

    const nextMap = vaultRecord.map.map((entry) =>
      entry.token === token
        ? { ...entry, type: newType, token: newToken }
        : entry,
    );
    recomputeAndNotify(vaultRecord, nextMap, onUpdateMap);
  };

  const handleAddTerm = (text: string, type: EntityType) => {
    const nextMap = buildMap(vaultRecord.map, [
      { text, type, detectedBy: 'user' },
    ]);
    recomputeAndNotify(vaultRecord, nextMap, onUpdateMap);
  };

  return (
    <div className="flex flex-col gap-5" data-testid="screen-firewall-review">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <button
            type="button"
            onClick={onBackToEdit}
            className="text-xs font-mono text-[#8B9BB4] hover:text-[#E6EDF3] mb-1 cursor-pointer"
          >
            ← Edit raw brief
          </button>
          <h2 className="text-xl font-semibold text-[#E6EDF3] m-0">
            Privacy Firewall Review
          </h2>
          <p className="text-xs text-[#8B9BB4] mt-1 mb-0">
            Verify the abstracted text below. Nothing touches the cloud until you click "Approve and send".
          </p>
        </div>

        <div className="flex items-center gap-3">
          {game.redactionMethod === 'basic' ? (
            <span
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-mono bg-amber-950/70 text-amber-300 border border-amber-500/40"
              data-testid="redaction-method-label"
            >
              <span>🛡️</span>
              <span>Basic redaction (on-device AI unavailable)</span>
            </span>
          ) : (
            <span
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-mono bg-emerald-950/70 text-emerald-300 border border-emerald-500/40"
              data-testid="redaction-method-label"
            >
              <span>🔒</span>
              <span>On-device AI redaction (Gemini Nano)</span>
            </span>
          )}

          <button
            type="button"
            onClick={onApprove}
            className={TOKENS.classes.btnPrimary}
            data-testid="btn-approve-redaction"
          >
            Approve and send →
          </button>
        </div>
      </div>

      <DiffView
        rawObjective={vaultRecord.rawObjective}
        rawBrief={vaultRecord.rawBrief}
        abstractedObjective={objApplied.abstracted}
        abstractedBrief={briefApplied.abstracted}
        objectiveSpans={objApplied.spans}
        briefSpans={briefApplied.spans}
        onAddSelectedTerm={handleAddTerm}
      />

      <PlaceholderTable
        map={vaultRecord.map}
        onToggleEntry={handleToggleEntry}
        onChangeEntryType={handleChangeEntryType}
        onAddManualTerm={handleAddTerm}
      />
    </div>
  );
}
