import { LIMITS } from '../../prompts';

/**
 * Paragraph-aware chunking for Gemini Nano's `redact` task.
 * Guarantees every returned chunk has `chunk.length <= maxChars` and that
 * no characters from `text` are dropped.
 */
export function chunkText(
  text: string,
  maxChars: number = LIMITS.redactChunk,
): string[] {
  if (maxChars < 1) {
    throw new RangeError('maxChars must be at least 1');
  }
  if (text.length === 0) return [];
  if (text.length <= maxChars) return [text];

  const chunks: string[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const remaining = text.length - cursor;
    if (remaining <= maxChars) {
      chunks.push(text.slice(cursor));
      break;
    }

    const slice = text.slice(cursor, cursor + maxChars);

    // 1. Prefer paragraph boundary (\n\n)
    let splitAt = slice.lastIndexOf('\n\n');
    if (splitAt > Math.floor(maxChars * 0.3)) {
      splitAt += 2;
    } else {
      // 2. Single line break (\n)
      splitAt = slice.lastIndexOf('\n');
      if (splitAt > Math.floor(maxChars * 0.3)) {
        splitAt += 1;
      } else {
        // 3. Sentence boundary (. ! ?)
        const sentenceMatch = Math.max(
          slice.lastIndexOf('. '),
          slice.lastIndexOf('! '),
          slice.lastIndexOf('? '),
        );
        if (sentenceMatch > Math.floor(maxChars * 0.3)) {
          splitAt = sentenceMatch + 2;
        } else {
          // 4. Word boundary (space)
          const spaceMatch = slice.lastIndexOf(' ');
          splitAt = spaceMatch > 0 ? spaceMatch + 1 : maxChars;
        }
      }
    }

    chunks.push(text.slice(cursor, cursor + splitAt));
    cursor += splitAt;
  }

  return chunks;
}
