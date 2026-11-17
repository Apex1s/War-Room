import type { z } from 'zod';
import { repairPrompt } from '../../prompts/repair';

export { repairPrompt };

/** Tolerates code fences and stray text around the JSON object. */
export function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) {
    throw new SyntaxError('no JSON object found');
  }
  return JSON.parse(text.slice(start, end + 1));
}

export function formatZodIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 3)
    .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
    .join('; ');
}

export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; issues: string };

export function parseAndValidate<T>(
  rawText: string,
  schema: z.ZodType<T>,
): ValidationResult<T> {
  let extracted: unknown;
  try {
    extracted = extractJson(rawText);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, issues: msg };
  }

  const parsed = schema.safeParse(extracted);
  if (!parsed.success) {
    return { ok: false, issues: formatZodIssues(parsed.error) };
  }

  return { ok: true, data: parsed.data };
}
