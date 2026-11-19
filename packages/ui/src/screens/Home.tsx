import {
  cleanPunctuation,
  formatPhaseStatus,
  TEMPLATE_LIST,
  type GameRecord,
  type GameTemplate,
  type TemplateId,
} from '@warroom/core';
import { TOKENS } from '../tokens';

export interface HomeScreenProps {
  savedGames: GameRecord[];
  onSelectTemplate: (templateId: TemplateId) => void;
  onResumeGame: (gameId: string) => void;
  onSyncCloudGames?: () => void;
  cloudSyncBusy?: boolean;
  cloudSyncStatus?: string | null;
}

export function HomeScreen({
  savedGames,
  onSelectTemplate,
  onResumeGame,
  onSyncCloudGames,
  cloudSyncBusy = false,
  cloudSyncStatus,
}: HomeScreenProps) {
  return (
    <div className="flex flex-col gap-34" data-testid="screen-home">
      <div>
        <div className="terminal-label mb-8">CONFIDENTIAL AI WAR-GAMING</div>
        <h1 className="text-display font-semibold text-text m-0">
          The cloud does the thinking, the device keeps the secrets.
        </h1>
        <p className="text-body text-muted mt-13 mb-0 max-w-3xl">
          Run a multi-agent war game on your most confidential plan without your real names, figures or locations ever leaving your device.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-13 items-stretch">
        {TEMPLATE_LIST.map((tpl: GameTemplate) => (
          <div
            key={tpl.id}
            onClick={() => onSelectTemplate(tpl.id)}
            className={
              TOKENS.classes.cardInteractive +
              ' flex flex-col justify-between gap-21 h-full'
            }
            data-testid={`template-card-${tpl.id}`}
          >
            <div className="flex-1">
              <div className="flex items-center justify-between gap-8 mb-8">
                <span className="font-mono text-label uppercase tracking-[0.12em] text-mint">
                  {tpl.id === 'startup' ? 'LEAD SCENARIO' : 'SCENARIO'}
                </span>
                <span className="font-mono text-label text-muted">
                  3 ROUNDS
                </span>
              </div>
              <h2 className="text-title font-semibold text-text m-0">
                {cleanPunctuation(tpl.title)}
              </h2>
              <p className="text-body text-muted mt-8 mb-0">
                {cleanPunctuation(tpl.situation)}
              </p>
            </div>

            <div className="mt-auto pt-13 border-t border-line">
              <div className="terminal-label mb-8">OPPOSING GENERALS</div>
              <div className="flex flex-wrap gap-8">
                {tpl.generals.map((g) => {
                  const initials = g.name
                    .split(/\s+/)
                    .map((w) => w[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase();
                  return (
                    <span
                      key={g.id}
                      className="inline-flex items-center gap-5 px-8 py-3 rounded-[3px] bg-bg border border-line font-mono text-label text-text"
                    >
                      <span className="text-muted">[{initials}]</span>
                      <span>{g.name}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>

      {(savedGames.length > 0 || onSyncCloudGames) && (
        <div className={TOKENS.classes.card + ' flex flex-col gap-13'}>
          <div className="flex flex-wrap items-center justify-between gap-13">
            <div className="terminal-label">
              SAVED SESSIONS ({savedGames.length})
            </div>
            {onSyncCloudGames && (
              <div className="flex flex-wrap items-center gap-8">
                {cloudSyncStatus && (
                  <span
                    className="font-mono text-label text-muted"
                    data-testid="cloud-sync-status"
                  >
                    {cleanPunctuation(cloudSyncStatus)}
                  </span>
                )}
                <button
                  type="button"
                  onClick={onSyncCloudGames}
                  disabled={cloudSyncBusy}
                  className={TOKENS.classes.btnSecondary}
                  data-testid="btn-load-cloud-games"
                >
                  {cloudSyncBusy ? 'Syncing...' : 'Load cloud saved games'}
                </button>
              </div>
            )}
          </div>
          {savedGames.length === 0 ? (
            <div className="font-mono text-label text-muted">
              No local sessions yet. Select a scenario above or load your abstracted cloud sessions.
            </div>
          ) : (
            <div className="flex flex-col gap-8">
              {savedGames.map((g) => (
                <div
                  key={g.id}
                  className="flex flex-wrap items-center justify-between gap-13 p-13 rounded-[3px] bg-bg border border-line"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-8 font-mono text-label uppercase tracking-[0.12em] text-muted">
                      <span>
                        {g.templateId.toUpperCase()} ·{' '}
                        {formatPhaseStatus(g.phase, g.totalRounds)}
                      </span>
                      {g.cloudSavedAt && (
                        <span className="px-5 py-3 rounded-[3px] border border-mint text-mint">
                          CLOUD SYNCED
                        </span>
                      )}
                    </div>
                    <div className="text-body text-text mt-3">
                      {cleanPunctuation(g.objective || 'Untitled session')}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onResumeGame(g.id)}
                    className={TOKENS.classes.btnSecondary}
                    data-testid={`btn-resume-${g.id}`}
                  >
                    Resume
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
