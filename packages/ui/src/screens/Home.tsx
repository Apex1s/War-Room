import {
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
    <div className="flex flex-col gap-6" data-testid="screen-home">
      <div>
        <h2 className="text-xl font-semibold text-[#E6EDF3] m-0">
          Select a Confidential War-Game Scenario
        </h2>
        <p className="text-sm text-[#8B9BB4] mt-1 mb-0">
          The cloud does the thinking, the device keeps the secrets. Your real names and figures are sealed on-device before any round begins.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {TEMPLATE_LIST.map((tpl: GameTemplate) => {
          const isAvailable = tpl.id === 'startup';
          return (
            <div
              key={tpl.id}
              onClick={isAvailable ? () => onSelectTemplate(tpl.id) : undefined}
              aria-disabled={!isAvailable}
              className={
                (isAvailable
                  ? TOKENS.classes.cardInteractive
                  : TOKENS.classes.card + ' opacity-60 cursor-not-allowed') +
                ' flex flex-col justify-between'
              }
              data-testid={`template-card-${tpl.id}`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-mono uppercase tracking-wider text-[#E0A84B]">
                    {isAvailable ? 'Lead Scenario' : 'Template'}
                  </span>
                  {isAvailable ? (
                    <span className="text-xs font-mono text-[#8B9BB4]">
                      3 Rounds
                    </span>
                  ) : (
                    <span
                      className="px-2 py-0.5 rounded bg-[#162032] border border-[#223049] text-[11px] font-mono text-[#8B9BB4]"
                      data-testid={`template-coming-soon-${tpl.id}`}
                    >
                      Coming soon
                    </span>
                  )}
                </div>
                <h3 className="text-base font-semibold text-[#E6EDF3] m-0">
                  {tpl.title}
                </h3>
                <p className="text-xs text-[#8B9BB4] mt-2 leading-relaxed">
                  {tpl.situation}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-[#223049]">
                <div className="text-[11px] font-mono text-[#8B9BB4] mb-2">
                  Opposing Generals
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {tpl.generals.map((g) => (
                    <span
                      key={g.id}
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#0A0E17] border border-[#223049] text-xs"
                    >
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: g.color }}
                      />
                      {g.name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {(savedGames.length > 0 || onSyncCloudGames) && (
        <div className={TOKENS.classes.card}>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h3 className="text-sm font-semibold text-[#E6EDF3] m-0">
              Saved Sessions ({savedGames.length})
            </h3>
            {onSyncCloudGames && (
              <div className="flex items-center gap-2">
                {cloudSyncStatus && (
                  <span
                    className="text-xs font-mono text-[#8B9BB4]"
                    data-testid="cloud-sync-status"
                  >
                    {cloudSyncStatus}
                  </span>
                )}
                <button
                  type="button"
                  onClick={onSyncCloudGames}
                  disabled={cloudSyncBusy}
                  className={TOKENS.classes.btnSecondary + ' text-xs py-1.5'}
                  data-testid="btn-load-cloud-games"
                >
                  {cloudSyncBusy ? '☁️ Syncing…' : '☁️ Load Cloud Saved Games'}
                </button>
              </div>
            )}
          </div>
          {savedGames.length === 0 ? (
            <div className="text-xs font-mono text-[#8B9BB4]">
              No local sessions yet. Select a template above or load your abstracted cloud sessions.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {savedGames.map((g) => (
                <div
                  key={g.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-3 rounded bg-[#0A0E17] border border-[#223049]"
                >
                  <div>
                    <div className="flex items-center gap-2 text-xs font-mono text-[#E0A84B]">
                      <span>
                        {g.templateId.toUpperCase()} · {formatPhaseStatus(g.phase, g.totalRounds)}
                      </span>
                      {g.cloudSavedAt && (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-950/60 border border-emerald-700/50 text-[10px] text-emerald-300">
                          ☁️ Cloud synced
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-[#E6EDF3] mt-0.5">
                      {g.objective || 'Untitled session'}
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
