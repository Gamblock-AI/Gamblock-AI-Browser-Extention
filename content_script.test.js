import { describe, it, expect, beforeEach } from 'vitest';
import { extractDOM } from './content_script.js';

describe('extractDOM', () => {
  beforeEach(() => {
    document.documentElement.innerHTML = '';
  });

  it('returns empty defaults for an empty page', () => {
    document.title = '';
    const dom = extractDOM();
    expect(dom.title).toBe('');
    expect(dom.headings).toEqual([]);
    expect(dom.anchorTexts).toEqual([]);
  });

  it('extracts title, headings (capped at 10), and anchor texts (capped at 50)', () => {
    document.title = 'Judi Slot Online Terpercaya';
    for (let i = 0; i < 15; i++) {
      const h = document.createElement('h2');
      h.textContent = `Heading ${i}`;
      document.body.appendChild(h);
    }
    for (let i = 0; i < 60; i++) {
      const a = document.createElement('a');
      a.textContent = `link${i}`;
      document.body.appendChild(a);
    }
    const dom = extractDOM();
    expect(dom.title).toBe('Judi Slot Online Terpercaya');
    expect(dom.headings.length).toBe(10);
    expect(dom.anchorTexts.length).toBe(50);
  });

  it('filters out empty and too-long anchor text', () => {
    const a1 = document.createElement('a');
    a1.textContent = '   ';
    const a2 = document.createElement('a');
    a2.textContent = 'x'.repeat(300); // > 200 chars, must be filtered
    const a3 = document.createElement('a');
    a3.textContent = 'valid link';
    document.body.append(a1, a2, a3);
    const dom = extractDOM();
    expect(dom.anchorTexts).toEqual(['valid link']);
  });

  it('trims heading whitespace and skips empty headings', () => {
    const h1 = document.createElement('h1');
    h1.textContent = '  Title  ';
    const h2 = document.createElement('h2');
    h2.textContent = '';
    document.body.append(h1, h2);
    const dom = extractDOM();
    expect(dom.headings).toEqual(['Title']);
  });
});
