import { describe, expect, it } from 'vitest';
import { withEnFallback } from '../../src/platform/dev-loader';
import { translate } from '../../src/view/i18n';

const en = { 'coins.one': '{count} coin', 'coins.other': '{count} coins', 'lives.one': '{count} life', 'lives.other': '{count} lives', title: 'Title' };

describe('dev loader: en fallback', () => {
  it('fills missing keys from en', () => {
    expect(withEnFallback(en, { title: 'Заголовок' })).toMatchObject({ title: 'Заголовок', 'coins.one': '{count} coin' });
  });
  it('takes no en plural form of a key the language pluralises itself', () => {
    const ru = withEnFallback(en, { 'coins.other': '{count} монет' });
    expect(ru['coins.one']).toBeUndefined();
    expect(ru['lives.one']).toBe('{count} life');
    expect(translate(ru, 'ru', 'coins', { count: 1 })).toBe('1 монет');
  });
});
