import {
  cleanPunctuation,
  createInitialGameRecord,
  dispatchAndPersist,
  formatGeneralsStatus,
  formatPhaseStatus,
  reduceGame,
  retrySingleGeneralEffect,
  runPlayerMoveAndGeneralsEffect,
  runSealBriefEffect,
  TEMPLATES,
  type GameRecord,
  type VaultRecord,
} from '@warroom/core';
import { useState } from 'react';
import { SourceBadge } from '../components/SourceBadge';
import { TOKENS } from '../tokens';

export interface TranscriptDocument {
  transcriptId: string;
  scenarioTitle: string;
  templateId: string;
  redactionMethod: 'on-device-ai' | 'basic';
  maskedEntityCount: number;
  tokensInMap: string[];
  objective: string;
  brief: string;
  rounds: {
    n: number;
    userMove: string;
    generalMoves: {
      generalId: string;
      generalName: string;
      headline: string;
      move: string;
      rationale: string;
      threatLevel: number;
      targets: string;
      source: 'on-device' | 'cloud';
      latencyMs: number;
      model: string;
      fallback: boolean;
    }[];
  }[];
  generatedAt: string;
}

export interface BatchScenario {
  id: string;
  title: string;
  rawObjective: string;
  rawBrief: string;
  rawMoves: [string, string, string];
}

export const TEN_CLOUD_SCENARIOS: BatchScenario[] = [
  {
    id: 'transcript-01',
    title: '01 · Workflow Auditing Self-Serve Launch (Defensive Wedge)',
    rawObjective:
      'Reach $1.2M ARR and 1,000 teams in 12 months without raising a seed round.',
    rawBrief:
      'Kestrel Labs is building PulseAudit, an automated workflow auditing engine for mid-size operations teams in Casablanca and Lyon. Founder Amine Tazi left Atlas Cloud to launch the product. Current ARR is $240,000 across 18 design partners including Zenith Logistics, with 14% monthly growth. We plan to launch a self-serve tier at $49 per seat on 2026-12-01 to reach 1,000 teams without raising a seed round from Sequoia.',
    rawMoves: [
      'Launch as described in the brief with a 14-day self-serve trial at $49 per seat.',
      'Convert all 18 design partners including Zenith Logistics to annual pre-paid contracts with a 20% discount and ship cross-vendor connectors that Atlas Cloud cannot bundle.',
      'Drop paid search completely; distribute free SOC2 workflow templates through compliance communities in Lyon and Casablanca to keep payback under 45 days.',
    ],
  },
  {
    id: 'transcript-02',
    title: '02 · Workflow Auditing Vertical Pivot (Logistics Focus)',
    rawObjective:
      'Dominate mid-market freight and logistics auditing before horizontal incumbents react.',
    rawBrief:
      'Kestrel Labs is building PulseAudit, an automated workflow auditing engine for mid-size operations teams in Casablanca and Lyon. Founder Amine Tazi left Atlas Cloud to launch the product. Current ARR is $240,000 across 18 design partners including Zenith Logistics, with 14% monthly growth. We plan to launch a self-serve tier at $49 per seat on 2026-12-01 to reach 1,000 teams.',
    rawMoves: [
      'Narrow the launch exclusively to freight and customs operations teams like Zenith Logistics at $149 per team.',
      'Publish a live customs-audit benchmark with Zenith Logistics and lock in 3-year data retention contracts with switching penalties.',
      'Partner with regional freight ERP integrators in Casablanca and Lyon on a 25% revenue-share so we add zero sales headcount.',
    ],
  },
  {
    id: 'transcript-03',
    title: '03 · Cross-Border B2B FX and Treasury Bundle',
    rawObjective:
      'Protect €18.5M exporter volume and reach 700 exporters by Q2 2027.',
    rawBrief:
      'Veridian Pay processes €18.5M in cross-border invoices for 420 exporters in Madrid and Barcelona. Rival Finova Corp just cut FX spreads by 35% after raising $12M from Northstar Ventures. CEO Elena Rostova proposes bundling free treasury accounts via Project Mercury before Q1 2027.',
    rawMoves: [
      'Launch Project Mercury free multi-currency treasury accounts for all 420 exporters in Madrid and Barcelona while holding FX spreads steady.',
      'Match Finova Corp on spot FX rates only for exporters who lock €50,000 minimum treasury balances and automate ERP reconciliation.',
      'Embed instant export-vat financing backed by partner banks so switching away from Veridian Pay breaks the exporter working-capital line.',
    ],
  },
  {
    id: 'transcript-04',
    title: '04 · Cross-Border B2B Corridor Specialisation',
    rawObjective:
      'Increase net revenue retention to 125% across Iberian industrial exporters.',
    rawBrief:
      'Veridian Pay processes €18.5M in cross-border invoices for 420 exporters in Madrid and Barcelona. Rival Finova Corp just cut FX spreads by 35% after raising $12M from Northstar Ventures. CEO Elena Rostova proposes bundling free treasury accounts via Project Mercury before Q1 2027.',
    rawMoves: [
      'Focus Project Mercury on automated supplier payouts in Latin America and North Africa corridors where Finova Corp lacks local banking rails.',
      'Sign exclusive ERP plugin agreements with the top 3 accounting networks in Madrid and Barcelona.',
      'Introduce tiered volume rebates paid quarterly so any exporter splitting volume with Finova Corp loses their rebate tier.',
    ],
  },
  {
    id: 'transcript-05',
    title: '05 · Cloud Posture Monitoring Up-Market Enterprise Deal',
    rawObjective:
      'Close Orbis Bank at $450,000 ARR without starving the 310 mid-market teams.',
    rawBrief:
      'Helios Security sells cloud posture monitoring to 310 teams in Berlin. CTO Lukas Weber built ShieldCore to replace Datadog modules at $1,200 per month. Orbis Bank offered a $450,000 annual contract if we deliver on-prem deployment in Zurich by March 15, 2027.',
    rawMoves: [
      'Accept the Orbis Bank $450,000 contract by shipping a containerized BYOC version of ShieldCore rather than a bespoke on-prem fork.',
      'Require Orbis Bank to pay 50% upfront upon architecture sign-off in Zurich and reuse the same BYOC installer for all regulated DACH banks.',
      'Keep mid-market onboarding 100% self-serve at $1,200 per month with automated Datadog alert migration in under 15 minutes.',
    ],
  },
  {
    id: 'transcript-06',
    title: '06 · Cloud Posture Monitoring Pure Self-Serve Displacement',
    rawObjective:
      'Double self-serve customers from 310 to 620 teams in Berlin and DACH.',
    rawBrief:
      'Helios Security sells cloud posture monitoring to 310 teams in Berlin. CTO Lukas Weber built ShieldCore to replace Datadog modules at $1,200 per month. Orbis Bank offered a $450,000 annual contract if we deliver on-prem deployment in Zurich by March 15, 2027.',
    rawMoves: [
      'Decline custom on-prem work for Orbis Bank and launch a one-click Datadog bill-cutter calculator for ShieldCore at $1,200 per month.',
      'Offer Orbis Bank our standard single-tenant cloud VPC in Frankfurt at $180,000/yr with zero custom engineering.',
      'Guarantee a 30% cloud monitoring cost reduction in writing or refund the first 60 days of ShieldCore.',
    ],
  },
  {
    id: 'transcript-07',
    title: '07 · Warehouse Robotics Software Integration and M&A',
    rawObjective:
      'Integrate CoreSync across 1,450 warehouses and reach 22% EBITDA margin.',
    rawBrief:
      'Solvay Dynamics will submit a $8.4M cash offer to acquire Cobalt Robotics in Austin. CFO Maya Lin and partner David Vance at Crestview Capital modelled 22% EBITDA margins once CoreSync is integrated into our 1,450 warehouse accounts.',
    rawMoves: [
      'Structure the $8.4M offer for Cobalt Robotics with $5.4M cash at close and $3.0M earnout tied to CoreSync retention in Austin.',
      'Cross-sell CoreSync as a mandatory firmware upgrade to our top 200 warehouse accounts with a 90-day payback guarantee.',
      'Open CoreSync APIs to third-party conveyor hardware so competitors cannot lock our 1,450 warehouse accounts into proprietary fleets.',
    ],
  },
  {
    id: 'transcript-08',
    title: '08 · Warehouse Robotics OEM Licensing Alternative',
    rawObjective:
      'Capture CoreSync telemetry value without balance-sheet M&A risk.',
    rawBrief:
      'Solvay Dynamics will submit a $8.4M cash offer to acquire Cobalt Robotics in Austin. CFO Maya Lin and partner David Vance at Crestview Capital modelled 22% EBITDA margins once CoreSync is integrated into our 1,450 warehouse accounts.',
    rawMoves: [
      'Replace the $8.4M buyout with a $2.0M exclusive 3-year OEM license for CoreSync across our 1,450 warehouse accounts.',
      'Hire 4 field deployment engineers in Austin directly and co-develop the next CoreSync release with full IP step-in rights.',
      'Price the telemetry add-on per active robot hour so seasonal warehouse customers adopt without capex approval.',
    ],
  },
  {
    id: 'transcript-09',
    title: '09 · Clinical Coding AI for Outpatient Clinics',
    rawObjective:
      'Sign 150 outpatient clinics at $1,800/month with zero HIPAA incidents.',
    rawBrief:
      'MedScribe AI automates ICD-10 billing audits for 42 clinics in Boston and Chicago. Founder Dr. Sarah Chen raised $600,000 from Beacon Angels and reached $85,000 MRR. Epic Systems just announced a native coding assistant for Q2 2027.',
    rawMoves: [
      'Position MedScribe AI as a payer-denial appeal engine rather than a generic note-taker, guaranteeing <2% claim rejection for Boston and Chicago clinics.',
      'Run all PHI scrubbing locally inside the clinic browser before cloud inference and sign BAAs with 48-hour turnarounds.',
      'Switch pricing to 8% of recovered denied claims above baseline so clinics pay only from cash we recover.',
    ],
  },
  {
    id: 'transcript-10',
    title: '10 · Industrial Grid Battery Dispatch SaaS',
    rawObjective:
      'Scale from 28 MW to 250 MW under management across Texas industrial sites.',
    rawBrief:
      'VoltGrid optimises behind-the-meter battery dispatch for 14 factories in Houston and Dallas. CEO Marcus Vance built PeakShield, saving $1.4M in ERCOT demand charges last summer. Incumbent Enel X is offering zero-upfront hardware leases.',
    rawMoves: [
      'Launch PeakShield as hardware-agnostic optimization software that plugs into existing batteries in Houston and Dallas within 72 hours.',
      'Partner with independent battery financiers to match Enel X zero-upfront leases while keeping PeakShield software margin at 80%.',
      'Provide a contractual demand-charge cap backed by Munich Re insurance so factory CFOs have downside protection.',
    ],
  },
];

function buildTranscriptDoc(
  game: GameRecord,
  vaultRecord: VaultRecord,
  transcriptId: string,
  scenarioTitle: string,
): TranscriptDocument {
  const generalNameMap = new Map(game.generals.map((g) => [g.id, g.name]));
  const enabledEntries = vaultRecord.map.filter((e) => e.enabled);

  return {
    transcriptId,
    scenarioTitle,
    templateId: game.templateId,
    redactionMethod: game.redactionMethod,
    maskedEntityCount: enabledEntries.length,
    tokensInMap: enabledEntries.map((e) => `${e.token} (${e.type})`),
    objective: game.objective,
    brief: game.brief,
    rounds: game.rounds.map((r) => ({
      n: r.n,
      userMove: r.userMove,
      generalMoves: r.generalMoves.map((gm) => ({
        generalId: gm.generalId,
        generalName: generalNameMap.get(gm.generalId) ?? gm.generalId,
        headline: gm.headline,
        move: gm.move,
        rationale: gm.rationale,
        threatLevel: gm.threatLevel,
        targets: gm.targets,
        source: gm.source,
        latencyMs: gm.latencyMs,
        model: gm.model,
        fallback: gm.fallback,
      })),
    })),
    generatedAt: new Date(game.updatedAt).toISOString(),
  };
}

export interface WarRoomDebugScreenProps {
  game: GameRecord;
  vaultRecord: VaultRecord;
  onGameUpdated: (game: GameRecord, vaultRecord: VaultRecord) => void;
  onBackToReview: () => void;
}

export function WarRoomDebugScreen({
  game,
  vaultRecord,
  onGameUpdated,
  onBackToReview,
}: WarRoomDebugScreenProps) {
  const template = TEMPLATES[game.templateId];
  const currentRoundNumber =
    game.phase.kind === 'user_turn' ||
    game.phase.kind === 'sealing_move' ||
    game.phase.kind === 'generals' ||
    game.phase.kind === 'aftermath'
      ? game.phase.round
      : game.rounds.length || 1;

  const [moveText, setMoveText] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const [batchRunning, setBatchRunning] = useState(false);
  const [batchStatus, setBatchStatus] = useState<string>('');
  const [savedTranscriptIds, setSavedTranscriptIds] = useState<string[]>([]);

  const handleSubmitMove = async () => {
    if (!moveText.trim() || busy || game.phase.kind !== 'user_turn') return;
    setBusy(true);
    try {
      const res = await runPlayerMoveAndGeneralsEffect(
        game,
        vaultRecord,
        moveText.trim(),
        {
          skipAftermath: true,
          onStateChange: (nextGame, nextVault) => {
            onGameUpdated(nextGame, nextVault);
          },
        },
      );
      onGameUpdated(res.game, res.vaultRecord);

      if (
        res.game.phase.kind === 'aftermath' &&
        res.game.phase.referee !== 'running'
      ) {
        const nextGame = await dispatchAndPersist(
          res.game,
          res.vaultRecord,
          { type: 'NEXT' },
          { onStateChange: onGameUpdated },
        );
        onGameUpdated(nextGame, res.vaultRecord);
        setMoveText('');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleRetryGeneral = async (generalId: string) => {
    if (
      busy ||
      (game.phase.kind !== 'generals' && game.phase.kind !== 'aftermath')
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await retrySingleGeneralEffect(game, vaultRecord, generalId, {
        skipAftermath: true,
        onStateChange: onGameUpdated,
      });
      onGameUpdated(res.game, res.vaultRecord);
    } finally {
      setBusy(false);
    }
  };

  const handleRunTenTranscriptsBatch = async () => {
    if (batchRunning) return;
    setBatchRunning(true);
    const completedIds: string[] = [];

    try {
      let alreadyComplete = new Set<string>();
      try {
        const checkRes = await fetch('/__dev/save-transcript');
        if (checkRes.ok) {
          const checkJson = (await checkRes.json()) as {
            completeIds?: string[];
          };
          alreadyComplete = new Set(checkJson.completeIds ?? []);
        }
      } catch {
        // ignore
      }

      for (let i = 0; i < TEN_CLOUD_SCENARIOS.length; i++) {
        const scenario = TEN_CLOUD_SCENARIOS[i]!;
        if (alreadyComplete.has(scenario.id)) {
          completedIds.push(scenario.id);
          setSavedTranscriptIds([...completedIds]);
          continue;
        }

        setBatchStatus(
          `[${i + 1}/10] Sealing brief for "${scenario.title}"...`,
        );

        let g = createInitialGameRecord(`batch-${scenario.id}`, 'startup');
        let v: VaultRecord = {
          gameId: g.id,
          rawObjective: '',
          rawBrief: '',
          rawMoves: {},
          map: [],
        };

        const sealed = await runSealBriefEffect(
          g,
          v,
          scenario.rawObjective,
          scenario.rawBrief,
        );
        g = reduceGame(sealed.game, { type: 'REDACTION_APPROVED' });
        v = sealed.vaultRecord;
        onGameUpdated(g, v);

        for (const roundNum of [1, 2, 3] as const) {
          setBatchStatus(
            `[${i + 1}/10] ${scenario.id}: Running round ${roundNum}/3 (3 Generals in parallel)...`,
          );
          const moveRaw = scenario.rawMoves[roundNum - 1]!;
          const roundRes = await runPlayerMoveAndGeneralsEffect(g, v, moveRaw, {
            skipAftermath: true,
            onStateChange: onGameUpdated,
          });
          g = roundRes.game;
          v = roundRes.vaultRecord;

          for (let retryPass = 0; retryPass < 6; retryPass++) {
            const failedMap =
              (g.phase.kind === 'generals' || g.phase.kind === 'aftermath') &&
              g.phase.failedGenerals
                ? g.phase.failedGenerals
                : undefined;
            if (failedMap) {
              const failedIds = Object.keys(failedMap);
              if (failedIds.length === 0) break;
              setBatchStatus(
                `[${i + 1}/10] ${scenario.id}: Round ${roundNum}/3 rate-limit backoff (retrying ${failedIds.join(', ')})...`,
              );
              await new Promise((r) => setTimeout(r, 4500));
              for (const fid of failedIds) {
                const retried = await retrySingleGeneralEffect(g, v, fid, {
                  skipAftermath: true,
                  onStateChange: onGameUpdated,
                });
                g = retried.game;
                v = retried.vaultRecord;
              }
            } else {
              break;
            }
          }

          if (g.phase.kind === 'aftermath') {
            g = await dispatchAndPersist(
              g,
              v,
              { type: 'NEXT' },
              { onStateChange: onGameUpdated },
            );
          }
        }

        const doc = buildTranscriptDoc(g, v, scenario.id, scenario.title);
        await fetch('/__dev/save-transcript', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: `${scenario.id}.json`,
            transcript: doc,
          }),
        });

        completedIds.push(scenario.id);
        setSavedTranscriptIds([...completedIds]);
      }

      setBatchStatus(
        `Completed and saved all ${completedIds.length}/10 three-round transcripts to docs/transcripts/.`,
      );
    } catch (err) {
      setBatchStatus(
        `Batch error: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setBatchRunning(false);
    }
  };

  const currentTranscript = buildTranscriptDoc(
    game,
    vaultRecord,
    game.id,
    template.title,
  );

  return (
    <div className="flex flex-col gap-21" data-testid="screen-war-room-debug">
      <div className={TOKENS.classes.card + ' flex flex-col gap-13'}>
        <div className="flex flex-wrap items-center justify-between gap-13">
          <div>
            <div className="flex items-center gap-8">
              <span className="font-mono text-label uppercase tracking-[0.12em] text-mint">
                FIREWALL ACTIVE ({vaultRecord.map.filter((e) => e.enabled).length}{' '}
                ENTITIES MASKED LOCALLY)
              </span>
              <span className="font-mono text-label text-muted">·</span>
              <span
                className="terminal-label"
                data-testid="game-phase-badge"
              >
                {formatPhaseStatus(game.phase, game.totalRounds)}
              </span>
            </div>
            <h2 className="text-title font-semibold text-text mt-5 mb-0">
              Situation room: 3-round Generals simulation
            </h2>
          </div>

          <div className="flex items-center gap-8">
            <button
              type="button"
              onClick={onBackToReview}
              className={TOKENS.classes.btnSecondary}
              data-testid="btn-return-review"
            >
              Review firewall map
            </button>
          </div>
        </div>
      </div>

      {(game.phase.kind === 'user_turn' ||
        game.phase.kind === 'sealing_move' ||
        game.phase.kind === 'generals') && (
        <div className={TOKENS.classes.card + ' flex flex-col gap-13'}>
          <label htmlFor="move-composer-input" className="terminal-label">
            ROUND {currentRoundNumber} OF {game.totalRounds}: YOUR STRATEGIC MOVE
          </label>

          <textarea
            id="move-composer-input"
            rows={3}
            value={moveText}
            onChange={(e) => setMoveText(e.target.value)}
            disabled={busy || game.phase.kind !== 'user_turn'}
            className={TOKENS.classes.input}
            placeholder={cleanPunctuation(template.openingMove)}
            data-testid="move-composer-input"
          />

          <div className="flex flex-wrap items-center justify-between gap-13">
            <div className="font-mono text-label text-muted">
              {game.phase.kind === 'sealing_move' && 'Sealing move on-device...'}
              {game.phase.kind === 'generals' &&
                (() => {
                  const phase = game.phase;
                  if (phase.kind !== 'generals') return null;
                  const rRec = game.rounds.find((r) => r.n === phase.round);
                  return `Generals responding in parallel (${formatGeneralsStatus(
                    game.generals.length,
                    rRec?.generalMoves.length ?? 0,
                    Object.keys(
                      phase.failedGenerals ?? rRec?.failedGenerals ?? {},
                    ).length,
                    phase.pending.length,
                  )})...`;
                })()}
            </div>
            <button
              type="button"
              onClick={() => void handleSubmitMove()}
              disabled={
                busy || game.phase.kind !== 'user_turn' || !moveText.trim()
              }
              className={TOKENS.classes.btnPrimary}
              data-testid="btn-submit-move"
            >
              {busy
                ? `Running round ${currentRoundNumber}...`
                : `Submit round ${currentRoundNumber} move`}
            </button>
          </div>
        </div>
      )}

      {game.rounds.map((round) => (
        <div
          key={round.n}
          className={TOKENS.classes.card + ' flex flex-col gap-13'}
          data-testid={`round-section-${round.n}`}
        >
          <div className="border-b border-line pb-13">
            <span className="terminal-label">
              ROUND {round.n} OF {game.totalRounds}
            </span>
            <div
              className="text-body text-text mt-5"
              data-testid={`round-${round.n}-user-move`}
            >
              Player move (abstracted): {cleanPunctuation(round.userMove)}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-13">
            {game.generals.map((gen) => {
              const reply = round.generalMoves.find(
                (m) => m.generalId === gen.id,
              );
              const failedCode = round.failedGenerals?.[gen.id];
              return (
                <div
                  key={gen.id}
                  className="rounded-[8px] border border-line bg-bg p-13 flex flex-col justify-between gap-13"
                  data-testid={`general-card-r${round.n}-${gen.id}`}
                >
                  <div className="flex flex-col gap-8">
                    <span className="font-sans text-body font-semibold text-text">
                      {gen.name}
                    </span>

                    {failedCode && (
                      <div className="p-13 rounded-[3px] bg-surface border border-line flex flex-col gap-8">
                        <div className="font-mono text-label uppercase text-orange">
                          HOLDS POSITION THIS ROUND ({failedCode})
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleRetryGeneral(gen.id)}
                          disabled={busy}
                          className={TOKENS.classes.btnSecondary}
                          data-testid={`btn-retry-general-r${round.n}-${gen.id}`}
                        >
                          Retry {gen.name}
                        </button>
                      </div>
                    )}

                    {reply && (
                      <>
                        <div className="text-body font-semibold text-text">
                          {cleanPunctuation(reply.headline)}
                        </div>
                        <div className="text-body text-text">
                          {cleanPunctuation(reply.move)}
                        </div>
                      </>
                    )}
                  </div>

                  {reply && (
                    <div className="pt-8 border-t border-line">
                      <SourceBadge
                        source={reply.source}
                        latencyMs={reply.latencyMs}
                        fallback={reply.fallback}
                        model={reply.model}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div className={TOKENS.classes.card + ' flex flex-col gap-13'}>
        <div className="flex flex-wrap items-center justify-between gap-13">
          <div>
            <div className="terminal-label">
              ABSTRACTED GAME TRANSCRIPT (JSON)
            </div>
            <p className="text-label text-muted mt-3 mb-0">
              Contains abstracted text only, zero vault originals.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleRunTenTranscriptsBatch()}
            disabled={batchRunning || busy}
            className={TOKENS.classes.btnSecondary}
            data-testid="btn-run-10-transcripts"
          >
            {batchRunning
              ? 'Running 10 cloud games...'
              : 'Run and save 10 full 3-round cloud transcripts'}
          </button>
        </div>

        {batchStatus && (
          <div
            className="p-13 rounded-[3px] bg-bg border border-line font-mono text-label text-text"
            data-testid="batch-runner-status"
          >
            {cleanPunctuation(batchStatus)}
            {savedTranscriptIds.length > 0 && (
              <div className="mt-5 text-mint">
                Saved: {savedTranscriptIds.join(', ')}
              </div>
            )}
          </div>
        )}

        <pre
          className="p-13 rounded-[3px] bg-bg border border-line font-mono text-label text-text overflow-x-auto max-h-96 m-0"
          data-testid="transcript-json"
        >
          {JSON.stringify(currentTranscript, null, 2)}
        </pre>
      </div>
    </div>
  );
}
