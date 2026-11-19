import { matchTemplate } from '../game/templates/match';
import { priceWarTemplate } from '../game/templates/price-war';
import { startupTemplate } from '../game/templates/startup';

export interface HandLabelledBrief {
  id: string;
  title: string;
  text: string;
  expectedNames: string[];
  expectedValues: string[];
}

/**
 * Five hand-labelled sample briefs for Day 3 firewall verification (the three template demo
 * briefs plus two additional confidential scenarios).
 */
export const SAMPLE_BRIEFS: HandLabelledBrief[] = [
  {
    id: 'startup-demo',
    title: 'Startup Idea Stress Test (Lead Demo)',
    text: startupTemplate.demoBrief,
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
    text: priceWarTemplate.demoBrief,
    expectedNames: [
      'Solis Ledger',
      'Valencia',
      'Bilbao',
      'Kora Billing',
      'Redcrest Ventures',
      'Clara Mendoza',
      'Project Halcyon',
      'Cantabria Freight',
    ],
    expectedValues: [
      '€18.5M',
      '420',
      '35%',
      '$12M',
      '€290',
      '2027-01-15',
      'clara@solisledger.example',
      'https://solisledger.example',
      '22%',
    ],
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
    text: matchTemplate.demoBrief,
    expectedNames: [
      'Atlas Athletic',
      'Medina FC',
      'Tangier',
      'Corniche Arena',
      'Tariq Haddad',
      'Nadia Berrada',
      'Sami El-Khoury',
      'Vektor Sports',
      'Project Bastion',
      'Omar Ziani',
    ],
    expectedValues: [
      '12/11/2026',
      '45,000',
      '25',
      '$180,000',
      '42%',
      '60',
      'tariq@atlasathletic.example',
      'https://atlasathletic.example',
    ],
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
