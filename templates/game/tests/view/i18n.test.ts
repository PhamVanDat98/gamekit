import { describe, expect, it } from 'vitest';
import { translate } from '../../src/view/i18n';

const dict = { 'hud.score': 'Score: {score}', 'coins.one': '{count} coin', 'coins.other': '{count} coins', 'only.other': '{count} x' };

describe('i18n', () => {
  it('fills {params}', () => {
    expect(translate(dict, 'en', 'hud.score', { score: 42 })).toBe('Score: 42');
  });
  it('picks the plural form by the language rules, falling back to .other', () => {
    expect(translate(dict, 'en', 'coins', { count: 1 })).toBe('1 coin');
    expect(translate(dict, 'en', 'coins', { count: 3 })).toBe('3 coins');
    expect(translate(dict, 'en', 'only', { count: 1 })).toBe('1 x');
  });
  it('uses a plain key when {count} is passed but the key has no plural forms', () => {
    expect(translate({ 'hud.coins': '{count} coins' }, 'en', 'hud.coins', { count: 5 })).toBe('5 coins');
    expect(translate({ 'hud.coins': '{count} coins' }, 'ru', 'hud.coins', { count: 2 })).toBe('2 coins');
  });
  it('shows the key when missing so gaps are visible', () => {
    expect(translate(dict, 'en', 'nope')).toBe('nope');
  });
  it('does not resolve inherited names like {constructor}', () => {
    expect(translate({ k: 'a {constructor} b' }, 'en', 'k')).toBe('a {constructor} b');
  });
  it('leaves unknown placeholders untouched', () => {
    expect(translate(dict, 'en', 'hud.score')).toBe('Score: {score}');
  });
});
