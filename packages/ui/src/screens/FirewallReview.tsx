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
  onUpdateMap: (
    nextMap: PlaceholderEntry[],
    nextAbstractedObjective: string,
    nextAbstractedBrief: string,
  ) => void;
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
  const objApplied = applyMapWithSpans(
    vaultRecord.rawObjective,
    vaultRecord.map,
  );
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
    const nextNum =
      (existingNumbers.length ? Math.max(...existingNumbers) : 0) + 1;
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
    <div className="flex flex-col gap-21" data-testid="screen-firewall-review">
      <div className="flex flex-wrap items-center justify-between gap-13">
        <div>
          <button
            type="button"
            onClick={onBackToEdit}
            className="font-mono text-label uppercase tracking-[0.12em] text-muted hover:text-text mb-5 cursor-pointer"
          >
            Edit raw brief
          </button>
          <h2 className="text-title font-semibold text-text m-0">
            Privacy firewall review
          </h2>
          <p className="text-body text-muted mt-5 mb-0">
            Verify the abstracted text below. Nothing touches the cloud until you click "Approve and send".
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-13">
          {game.redactionMethod === 'basic' ? (
            <span
              className="inline-flex items-center gap-8 px-13 py-8 rounded-[3px] font-mono text-label uppercase border border-orange bg-surface text-orange"
              data-testid="redaction-method-label"
            >
              <span>BASIC REDACTION: ON-DEVICE AI UNAVAILABLE</span>
            </span>
          ) : (
            <span
              className="inline-flex items-center gap-8 px-13 py-8 rounded-[3px] font-mono text-label uppercase border border-mint bg-surface text-mint"
              data-testid="redaction-method-label"
            >
              <span>●</span>
              <span>ON-DEVICE AI REDACTION: GEMINI NANO</span>
            </span>
          )}

          <button
            type="button"
            onClick={onApprove}
            className={TOKENS.classes.btnPrimary}
            data-testid="btn-approve-redaction"
          >
            Approve and send
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
