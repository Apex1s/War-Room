export interface HandLabelledBrief {
  id: string;
  title: string;
  text: string;
  expectedNames: string[];
  expectedValues: string[];
}

/**
 * Five hand-labelled sample briefs for Day 3 firewall verification (the lead startup demo
 * brief plus four additional confidential scenarios).
 */
export const SAMPLE_BRIEFS: HandLabelledBrief[] = [
  {
    id: 'startup-demo',
    title: 'Startup Idea Stress Test (Lead Demo)',
    text: 'Kestrel Labs is building PulseAudit, an automated workflow auditing engine for mid-size operations teams in Casablanca and Lyon. Founder Amine Tazi left Atlas Cloud to launch the product. Current ARR is $240,000 across 18 design partners including Zenith Logistics, with 14% monthly growth. We plan to launch a self-serve tier at $49 per seat on 2026-12-01 (contact: amine@kestrellabs.io, https://kestrellabs.io) to reach 1,000 teams without raising a seed round from Sequoia.',
    expectedNames: [
      'Kestrel Labs',
      'PulseAudit',
      'Casablanca',
      'Lyon',
      'Amine Tazi',
      'Atlas Cloud',
      'Zenith Logistics',
      'Sequoia',
    ],
    expectedValues: [
      '$240,000',
      '18',
      '14%',
      '$49',
      '2026-12-01',
      'amine@kestrellabs.io',
      'https://kestrellabs.io',
      '1,000',
    ],
  },
  {
    id: 'price-war',
    title: 'Commodity B2B Price War',
    text: 'Veridian Pay processes €18.5M in cross-border invoices for 420 exporters in Madrid and Barcelona. Rival Finova Corp just cut FX spreads by 35% after raising $12M from Northstar Ventures. CEO Elena Rostova proposes bundling free treasury accounts via Project Mercury before Q1 2027.',
    expectedNames: [
      'Veridian Pay',
      'Madrid',
      'Barcelona',
      'Finova Corp',
      'Northstar Ventures',
      'Elena Rostova',
      'Project Mercury',
    ],
    expectedValues: ['€18.5M', '420', '35%', '$12M', 'Q1 2027'],
  },
  {
    id: 'enterprise-expansion',
    title: 'Up-Market Enterprise Pivot',
    text: 'Helios Security sells cloud posture monitoring to 310 teams in Berlin. CTO Lukas Weber built ShieldCore to replace Datadog modules at $1,200 per month. Orbis Bank offered a $450,000 annual contract if we deliver on-prem deployment in Zurich by March 15, 2027.',
    expectedNames: [
      'Helios Security',
      'Berlin',
      'Lukas Weber',
      'ShieldCore',
      'Datadog',
      'Orbis Bank',
      'Zurich',
    ],
    expectedValues: ['310', '$1,200', '$450,000', 'March 15, 2027'],
  },
  {
    id: 'match-tactics',
    title: 'Match Tactical Plan',
    text: 'Raja Athletic faces Wydad AC in Casablanca on 12/11/2026 before 45,000 supporters. Coach Karim Benali plans to press Youssef En-Nesyri high in the first 25 minutes and switch to Project Bastion if possession drops below 42%.',
    expectedNames: [
      'Raja Athletic',
      'Wydad AC',
      'Casablanca',
      'Karim Benali',
      'Youssef En-Nesyri',
      'Project Bastion',
    ],
    expectedValues: ['12/11/2026', '45,000', '25', '42%'],
  },
  {
    id: 'corporate-acquisition',
    title: 'Confidential M&A Bid',
    text: 'Solvay Dynamics will submit a $8.4M cash offer to acquire Cobalt Robotics in Austin. CFO Maya Lin and partner David Vance at Crestview Capital modelled 22% EBITDA margins once CoreSync is integrated into our 1,450 warehouse accounts.',
    expectedNames: [
      'Solvay Dynamics',
      'Cobalt Robotics',
      'Austin',
      'Maya Lin',
      'David Vance',
      'Crestview Capital',
      'CoreSync',
    ],
    expectedValues: ['$8.4M', '22%', '1,450'],
  },
];
