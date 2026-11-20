import { describe, expect, it } from 'vitest';
import { abortSignalAny } from './polyfills';

describe('abortSignalAny', () => {
  it('aborts when any input signal aborts, with that reason', () => {
    const a = new AbortController();
    const b = new AbortController();
    const combined = abortSignalAny([a.signal, b.signal]);
    expect(combined.aborted).toBe(false);
    b.abort('timeout');
    expect(combined.aborted).toBe(true);
    expect(combined.reason).toBe('timeout');
  });

  it('is already aborted when an input signal was aborted', () => {
    const a = new AbortController();
    a.abort('gone');
    const combined = abortSignalAny([a.signal]);
    expect(combined.aborted).toBe(true);
    expect(combined.reason).toBe('gone');
  });
});
