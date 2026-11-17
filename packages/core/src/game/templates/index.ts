import type { GameTemplate, TemplateId } from '../types';
import { startupTemplate } from './startup';

export const priceWarTemplate: GameTemplate = {
  id: 'price-war',
  title: 'Price War Simulation',
  subtitle: 'Incumbent Leader · Low-Cost Challenger · Procurement Coalition',
  situation:
    'An operator is preparing a pricing or bundling move in a contested B2B market and stress-testing how rivals and buyers will retaliate.',
  objectivePlaceholder:
    'e.g. Defend 22% gross margin in Madrid and Barcelona while growing net revenue 30%',
  briefPlaceholder:
    'Paste your pricing plan: current contract values, proposed discount or bundle, key accounts, competitor pricing and margin floor…',
  openingMove: 'Announce the new pricing structure as described in the brief.',
  generals: startupTemplate.generals,
  crowd: startupTemplate.crowd,
};

export const matchTemplate: GameTemplate = {
  id: 'match',
  title: 'Match Tactical War Game',
  subtitle: 'Opposing Manager · Key Playmaker · Match Conditions',
  situation:
    'A coaching staff is stress-testing a tactical game plan against the opposing manager, key opposition threats and match tempo.',
  objectivePlaceholder:
    'e.g. Win away in Casablanca while keeping high-press intensity sustainable for 90 minutes',
  briefPlaceholder:
    'Paste your tactical plan: starting formation, pressing triggers, key player matchups, set-piece routines and substitution windows…',
  openingMove: 'Start the match with the tactical setup described in the brief.',
  generals: startupTemplate.generals,
  crowd: startupTemplate.crowd,
};

export const TEMPLATES: Record<TemplateId, GameTemplate> = {
  startup: startupTemplate,
  'price-war': priceWarTemplate,
  match: matchTemplate,
};

export const TEMPLATE_LIST: GameTemplate[] = [
  startupTemplate,
  priceWarTemplate,
  matchTemplate,
];

export { startupTemplate };
