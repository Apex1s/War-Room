/**
 * Repair prompt. Sent once, on the same model instance, when the first reply fails
 * schema validation. A second failure is an `invalid_json` error.
 *
 * `issues` is a short summary of the zod issues, for example:
 *   error.issues.slice(0, 3).map((i) => `${i.path.join('.') || 'root'}: ${i.message}`).join('; ')
 */
export function repairPrompt(rawReply: string, issues: string): string {
  return `Your previous reply did not match the required JSON format.

Problem: ${issues}

Previous reply:
"""${rawReply.slice(0, 1500)}"""

Return only the corrected JSON object.`;
}
