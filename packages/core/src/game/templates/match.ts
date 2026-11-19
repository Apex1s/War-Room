import type { GameTemplate } from '../types';

export const matchTemplate: GameTemplate = {
  id: 'match',
  title: 'Match Tactical War Game',
  subtitle: 'Opposing Manager · Opposition Playmaker · Match Conditions',
  situation:
    'A coaching staff is stress-testing a tactical game plan against the opposing manager, key opposition threats and match tempo.',
  objectivePlaceholder:
    'e.g. Win away in Casablanca while keeping high-press intensity sustainable for 90 minutes',
  briefPlaceholder:
    'Paste your tactical plan: starting formation, pressing triggers, key player matchups, set-piece routines and substitution windows...',
  demoObjective:
    'Win the derby for Raja Athletic away in Casablanca while keeping high-press intensity sustainable for 90 minutes',
  demoBrief:
    'Raja Athletic faces Wydad AC in Casablanca on 12/11/2026 before 45,000 supporters at Mohammed V Stadium. Head coach Karim Benali and analyst Sofia Mansouri plan to press playmaker Youssef En-Nesyri high in the first 25 minutes using a $180,000 GPS load model from Apex Sports. If possession drops below 42% before minute 60, we trigger Project Bastion and bring on striker Mehdi Chraibi (briefing: karim@rajaathletic.ma, https://rajaathletic.ma).',
  openingMove: 'Start the match with the tactical setup described in the brief.',
  generals: [
    {
      id: 'manager',
      name: 'Opposing Manager',
      role: 'a pragmatic tactician known for dismantling aggressive game plans inside twenty minutes',
      persona:
        'You study opponent pressing traps all week. When an opponent commits numbers high, you bypass the first line with rehearsed third-man patterns or switch to a back three in buildup to overload their front line. You make early tactical adjustments without waiting for half-time.',
      goal: 'Neutralize the player primary tactical advantage, exploit spaces left behind their commitment line and control the decisive phases of each half.',
      hiddenInfo:
        'Your starting left-back is carrying a tight hamstring and cannot recover repeatedly against balls in behind after the 60th minute. You have drilled a specific short-corner routine targeting the near-post zone.',
      style:
        'Sharp, observant, unsentimental. Speaks in spatial overloads, rest defense, pressing triggers and transition windows.',
      color: '#10B981',
    },
    {
      id: 'playmaker',
      name: 'Opposition Playmaker',
      role: 'the opponent most dangerous creative midfielder and on-pitch tempo setter',
      persona:
        'You drift into half-spaces between the lines where markers hesitate to follow. If man-marked tightly, you drag your marker wide to open the central lane for runners. You hunt for isolated one-on-one matchups and punish any drop in pressing coordination.',
      goal: 'Find pockets of space between midfield and defense, draw fouls in dangerous zones and create high-value chances on the counter.',
      hiddenInfo:
        'You struggle when forced onto your weaker foot toward the touchline early in buildup, and you lose discipline defensively when your side goes fifteen minutes without clean possession in the final third.',
      style:
        'Direct, instinctive, opportunistic. Focuses on body orientation, passing lanes, blind-side runs and second balls.',
      color: '#F97316',
    },
    {
      id: 'tempo',
      name: 'Match Conditions',
      role: 'the combined physical reality of fatigue, stadium pressure, refereeing threshold and match clock',
      persona:
        'You enforce the physical cost of every tactical instruction. High pressing drains legs by minute 65. Yellow cards change tackling aggression. Hostile away crowds amplify momentum swings after turnovers, and narrow leads invite nervy deep blocks.',
      goal: 'Test whether the tactical plan survives contact with fatigue, cards, scoreline pressure and game-state shifts over ninety minutes.',
      hiddenInfo:
        'Humidity on match night is high, accelerating sprint drop-off by 15% in the final half hour. The assigned referee lets physical challenges go early but books tactical pull-backs immediately after the break.',
      style:
        'Objective, physical, relentless. Reports sprint decay, turnover locations, card risk and momentum swings.',
      color: '#10B981',
    },
  ],
  crowd: [
    {
      id: 'p1',
      label: 'Veteran club captain at centre-back',
      outlook: 'Wants clear line-height triggers and hates being left exposed in wide channels.',
    },
    {
      id: 'p2',
      label: 'Box-to-box midfielder tasked with the press',
      outlook: 'Can sustain high-intensity closures for sixty minutes before recovery runs slow down.',
    },
    {
      id: 'p3',
      label: 'Away end ultra who travelled six hours',
      outlook: 'Demands brave attacking football and groans at sideways recycling under pressure.',
    },
    {
      id: 'p4',
      label: 'Head of sports science on the bench',
      outlook: 'Watches high-speed running loads and warns when hamstring risk enters the red zone.',
    },
    {
      id: 'p5',
      label: 'Live tactical broadcast analyst',
      outlook: 'Spots structural gaps immediately and highlights whether adjustments are working.',
    },
    {
      id: 'p6',
      label: 'Winger waiting on the substitutes bench',
      outlook: 'Eager to attack tired full-backs if introduced before the 70th minute.',
    },
    {
      id: 'p7',
      label: 'Set-piece coach in the technical area',
      outlook: 'Judges every sequence by territorial gain, dead-ball delivery and second-phase cover.',
    },
    {
      id: 'p8',
      label: 'Goalkeeper organizing the back line',
      outlook: 'Prefers a compact block in front of the box over risky high-line offside traps.',
    },
    {
      id: 'p9',
      label: 'Sporting director in the directors box',
      outlook: 'Evaluates whether the coach has a coherent Plan B when the opponent adapts.',
    },
    {
      id: 'p10',
      label: 'Local football beat reporter',
      outlook: 'Ready to question selection gambles if the side concedes first.',
    },
  ],
};
