import { describe, it, expect } from 'vitest';
import { searchIdea, snippet } from '../ideaSearch';

const vermont = [
  { label: null, text: 'Fall foliage weekend in Vermont' },
  { label: 'Place', text: 'Woodstock, VT' },
  { label: 'Notes', text: 'Rent a farmhouse, cider donuts.\n\nAna: Woodstock or Stowe?' },
  { label: 'With', text: 'Ana Reyes, Ben Okafor' },
  { label: 'Ben', text: 'Found a farmhouse that sleeps 8, about $90 a night each.' },
];

describe('searching ideas', () => {
  it('finds a word wherever it is, case aside', () => {
    expect(searchIdea(vermont, 'VERMONT')?.field.label).toBeNull();
    expect(searchIdea(vermont, 'okafor')?.field.label).toBe('With');
    expect(searchIdea(vermont, 'sleeps')?.field.label).toBe('Ben');
  });

  it('needs every word, but they can be in different places', () => {
    expect(searchIdea(vermont, 'ana farmhouse')).not.toBeNull();
    expect(searchIdea(vermont, 'ana skiing')).toBeNull();
  });

  it('shows the line that matches the most words', () => {
    const hit = searchIdea(vermont, 'farmhouse night')!;
    expect(hit.field.label).toBe('Ben');
    expect(hit.text.slice(hit.start, hit.start + hit.length)).toBe('farmhouse');
  });

  it('nothing for an empty search', () => {
    expect(searchIdea(vermont, '   ')).toBeNull();
  });
});

describe('snippets', () => {
  it('keeps short text whole, on one line', () => {
    const text = 'Rent a farmhouse,\n\ncider donuts';
    const s = snippet(text, text.indexOf('cider'), 5);
    expect(s.text).toBe('Rent a farmhouse, cider donuts');
    expect(s.text.slice(s.start, s.start + 5)).toBe('cider');
  });

  it('cuts long text around the match, with ellipses', () => {
    const long = `${'a'.repeat(200)} needle ${'b'.repeat(200)}`;
    const s = snippet(long, 201, 6);
    expect(s.text.startsWith('…')).toBe(true);
    expect(s.text.endsWith('…')).toBe(true);
    expect(s.text.slice(s.start, s.start + 6)).toBe('needle');
  });
});
