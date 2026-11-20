import { describe, expect, it } from 'vitest';
import { TASKS } from './tasks';

describe('redact normalize', () => {
  it('drops ordinary lowercase words and keeps proper nouns', () => {
    const text =
      'A marketplace connects local bakeries, cafes and shops in Lyon. FreshBox sells surprise bags. Project 7 starts soon.';
    const out = TASKS.redact.normalize!(
      {
        entities: [
          { text: 'local', type: 'COMPANY' },
          { text: 'bakeries', type: 'COMPANY' },
          { text: 'cafes', type: 'COMPANY' },
          { text: 'surprise bags', type: 'PRODUCT' },
          { text: 'Lyon', type: 'PLACE' },
          { text: 'FreshBox', type: 'COMPANY' },
          { text: 'Project 7', type: 'PRODUCT' },
        ],
      },
      { text },
    );
    expect(out.entities.map((e) => e.text)).toEqual(['Lyon', 'FreshBox', 'Project 7']);
  });
});
