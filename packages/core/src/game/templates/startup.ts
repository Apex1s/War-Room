import type { GameTemplate } from '../types';

export const startupTemplate: GameTemplate = {
  id: 'startup',
  title: 'Startup Idea Stress Test',
  subtitle: 'Skeptical VC · Copycat Competitor · The Market',
  situation:
    'A founder is about to commit to a startup plan and is testing it against investors, rivals and the market.',
  objectivePlaceholder:
    'e.g. Reach 1,000 paying teams for Kestrel Labs in 12 months without raising a seed round',
  briefPlaceholder:
    'Paste your confidential startup brief: company name, product, target city/market, current ARR, pricing, key customers and launch timeline…',
  demoObjective:
    'Reach 1,000 paying teams for Kestrel Labs in 12 months without raising a seed round',
  demoBrief:
    'Kestrel Labs is building PulseAudit, an automated workflow auditing engine for mid-size operations teams in Casablanca and Lyon. Founder Amine Tazi left Atlas Cloud to launch the product. Current ARR is $240,000 across 18 design partners including Zenith Logistics, with 14% monthly growth. We plan to launch a self-serve tier at $49 per seat on 2026-12-01 (contact: amine@kestrellabs.io, https://kestrellabs.io) to reach 1,000 teams without raising a seed round from Sequoia.',
  openingMove: 'Launch as described in the brief.',
  generals: [
    {
      id: 'vc',
      name: 'Skeptical VC',
      role: 'a partner at an early-stage fund who has heard this pitch forty times',
      persona:
        'You have funded two companies in this space and written off one. You like the founder but you are paid to find the reason not to invest. You think in terms of market size, defensibility and what has to be true for this to return the fund.',
      goal: 'Decide whether to invest, and on what terms. Expose any assumption that only works on a slide.',
      hiddenInfo:
        'Your fund already holds a stake in a company one step away from this market, and your partners will not approve anything that competes with it. You also know that seed valuations in this category have fallen by about a third this year.',
      style:
        'Calm, numerate, slightly bored. Short sentences. Asks the question the founder hoped nobody would ask.',
      color: '#E0A84B',
    },
    {
      id: 'copycat',
      name: 'Copycat Competitor',
      role: 'the head of product at a larger, well-funded company in the adjacent market',
      persona:
        'You watch every launch in your space. You do not need to out-invent anyone: you have distribution, a sales team and existing customers. When something small starts to work, you ship a good-enough version to your own users and price it to hurt.',
      goal: 'Take the market the player is opening before they can defend it, at the lowest cost to yourself.',
      hiddenInfo:
        'You have a team of eight engineers free next quarter and a standing budget to bundle new features for free. Your weak point is that your enterprise customers lock your roadmap six months ahead, so you are slow to follow anything that changes shape quickly.',
      style: 'Friendly, corporate, unhurried. Talks like someone who can afford to wait.',
      color: '#D9534F',
    },
    {
      id: 'market',
      name: 'The Market',
      role: 'the buyers, channels and economic conditions the plan depends on, speaking as one voice',
      persona:
        'You are not hostile, you are indifferent. Buyers have budgets, habits and switching costs. Channels get more expensive as they get crowded. You respond to what is actually offered, at the actual price, with the actual effort required to adopt it.',
      goal: 'Behave the way real demand would. Reward moves that reduce friction or risk for buyers. Punish moves that assume attention, trust or budget that has not been earned.',
      hiddenInfo:
        'Most buyers in this segment already pay for something that half-solves the problem and renewed it recently. Procurement cycles are running longer than last year, and the cheapest acquisition channel in this category has roughly doubled in cost.',
      style:
        'Impersonal and concrete. Reports what buyers and channels do, in plain numbers and behaviours, not opinions.',
      color: '#4BA3E0',
    },
  ],
  crowd: [
    {
      id: 'p1',
      label: 'Busy team lead at a mid-size company',
      outlook: 'Would pay to save time but has been burned by tools nobody adopted.',
    },
    {
      id: 'p2',
      label: 'Price-sensitive freelancer',
      outlook: 'Switches tools for a small discount and cancels at the first price rise.',
    },
    {
      id: 'p3',
      label: 'Enterprise procurement officer',
      outlook: 'Cares about security reviews, contracts and vendor risk, not features.',
    },
    {
      id: 'p4',
      label: 'Early adopter who posts about new tools',
      outlook: 'Loves anything new and loses interest within a month.',
    },
    {
      id: 'p5',
      label: 'Loyal customer of the big incumbent',
      outlook: 'Thinks what they have is good enough and distrusts small vendors.',
    },
    {
      id: 'p6',
      label: 'Angel investor who backs friends',
      outlook: 'Optimistic by temperament and bets on people more than plans.',
    },
    {
      id: 'p7',
      label: 'Industry journalist',
      outlook: 'Has seen three versions of this idea fail and wants to know what is different.',
    },
    {
      id: 'p8',
      label: 'Engineer who might join the startup',
      outlook: 'Excited by the problem and worried about runway and salary.',
    },
    {
      id: 'p9',
      label: 'Small business owner',
      outlook: 'Wants it to work in ten minutes, without a call with sales.',
    },
    {
      id: 'p10',
      label: 'Former founder in the same space',
      outlook: 'Sympathetic, blunt, and remembers exactly what killed their own company.',
    },
  ],
};
