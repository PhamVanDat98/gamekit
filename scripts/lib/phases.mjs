// The 6-phase pipeline. Skills listed are the ones `next` suggests, in order.
// `thirdParty` overrides a phase for games remade from someone else's (source.ownership: third-party).
export const PHASES = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5'];

export const PHASE_INFO = {
  P0: { name: 'Intake', skills: ['game-recon', 'triage'], human: 'Bạn quyết định làm hay bỏ (triage).' },
  P1: { name: 'Phân tích', skills: ['engine-<engine>', 're-notes', 'asset-inventory', 'parity-check', 'ui-extract'] },
  P2: { name: 'Dựng lại', skills: ['runtime-select', 'module-plan', 'rebuild-game', 'integrate', 'parity-check'] },
  P3: {
    name: 'Chuyển sang web',
    skills: ['web-relayout'],
    human: 'Bạn duyệt bố cục và điều khiển trên web.',
    thirdParty: { name: 'Reskin', skills: ['web-relayout', 'style-direction', 'style-preview', 'asset-spec', 'apply-style', 'replace-graphics', 'replace-audio', 'rename-and-text'], human: 'Bạn chọn style.' },
  },
  P4: { name: 'Tích hợp', skills: ['platform-sdk', 'add-analytics', 'add-leaderboard', 'add-save', 'add-i18n'] },
  P5: { name: 'Phát hành', skills: ['package-web-build', 'qa-smoke', 'store-assets', 'release-check'], human: 'Bạn playtest bản cuối.' },
};

// Engine skills: `engine-<engine>` in a phase list resolves to one of these (see engineSkill).
export const ENGINE_SKILLS = ['engine-unity', 'engine-cocos', 'engine-godot', 'engine-html5', 'engine-construct', 'engine-laya', 'engine-flash', 'engine-unreal', 'engine-gamemaker', 'engine-native'];

/** The engine skill for source.engine: unknown → recon first; other (native C/C++, DOS…) → engine-native. */
export function engineSkill(engine = 'unknown') {
  if (engine === 'unknown') return 'game-recon';
  if (engine === 'other') return 'engine-native';
  return `engine-${engine}`;
}

// Every skill that ships with the plugin (one folder in skills/ each).
export const AVAILABLE_SKILLS = new Set([
  'using-gamekit',
  // P0
  'game-recon',
  'triage',
  // P1
  ...ENGINE_SKILLS,
  're-notes',
  'asset-inventory',
  'ui-extract',
  'parity-check',
  // P2
  'runtime-select',
  'module-plan',
  'rebuild-game',
  'integrate',
  // P3
  'web-relayout',
  'style-direction',
  'style-preview',
  'asset-spec',
  'apply-style',
  'replace-graphics',
  'replace-audio',
  'rename-and-text',
  // P4
  'platform-sdk',
  'add-analytics',
  'add-leaderboard',
  'add-save',
  'add-i18n',
  // P5
  'package-web-build',
  'qa-smoke',
  'store-assets',
  'release-check',
]);

/** Phase name, skills and the user's decision for this game's ownership. */
export function phaseInfo(phase, ownership = 'own') {
  const { thirdParty, ...base } = PHASE_INFO[phase];
  return ownership === 'third-party' && thirdParty ? { ...base, ...thirdParty } : base;
}

export const nextPhase = (p) => {
  const i = PHASES.indexOf(p);
  return i < 0 || i === PHASES.length - 1 ? 'released' : PHASES[i + 1];
};
