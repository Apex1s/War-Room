import { LIMITS, type PromptSpec } from './types';

/**
 * redact: PRIVACY FIREWALL, name extraction.
 * Runs on Gemini Nano, ONLY_ON_DEVICE, locked in code: this prompt sees raw text.
 *
 * The model only lists names. Code does the substitution, and regex finds numbers,
 * money, dates, emails, URLs and phones. Keeping the model's job this narrow is what
 * makes a small model reliable here.
 *
 * Output schema: RedactOutput  { entities: { text, type }[] }
 * After the call: drop any entity whose text is not found verbatim in the chunk.
 */
const SYSTEM = `You find confidential names in business text. Return JSON only.

List every specific name that could identify the author or their plans:
- COMPANY: companies, brands, clubs, investors, institutions
- PERSON: names of people
- PRODUCT: product, project or code names
- PLACE: cities, countries, regions, venues
- OTHER: any other identifying proper noun

Rules:
- Copy each name exactly as it is written in the text, character for character.
- One entry per distinct name.
- Do not list generic words (startup, market, customers, investors).
- Do not list numbers, dates or amounts of money.
- If there are no names, return {"entities":[]}.

Example
Text: "Northwind will undercut Globex in Lyon. Dana Reyes leads Project Falcon."
JSON: {"entities":[{"text":"Northwind","type":"COMPANY"},{"text":"Globex","type":"COMPANY"},{"text":"Lyon","type":"PLACE"},{"text":"Dana Reyes","type":"PERSON"},{"text":"Project Falcon","type":"PRODUCT"}]}`;

/** Names used in the system prompt's example. Drop them from results unless the chunk contains them. */
export const REDACT_EXAMPLE_NAMES = ['Northwind', 'Globex', 'Lyon', 'Dana Reyes', 'Project Falcon'] as const;

export const redactPrompt: PromptSpec<'redact'> = {
  target: 'on-device',
  system: () => SYSTEM,
  user: ({ text }) => {
    // Clipping here would leave part of the text unscanned, which is a leak. Fail loudly instead.
    if (text.length > LIMITS.redactChunk) {
      throw new RangeError(
        `redact chunk is ${text.length} chars; the firewall must chunk to ${LIMITS.redactChunk} or less`,
      );
    }
    return `Text: """${text}"""\nJSON:`;
  },
};
