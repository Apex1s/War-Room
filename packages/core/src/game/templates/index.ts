import type { GameTemplate, TemplateId } from '../types';
import { startupTemplate } from './startup';
import { priceWarTemplate } from './price-war';
import { matchTemplate } from './match';

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

export { startupTemplate, priceWarTemplate, matchTemplate };
