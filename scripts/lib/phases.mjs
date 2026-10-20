// The 6-phase pipeline. Skills listed are the ones `next` suggests, in order.
// `thirdParty` overrides a phase for games remade from someone else's (source.ownership: third-party).
export const PHASES = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5'];

export const PHASE_INFO = {
  P0: { name: 'Intake', skills: ['game-recon', 'triage'], human: 'Bạn quyết định làm hay bỏ (triage).' },
  P1: { name: 'Phân tích', skills: ['engine-<engine>', 're-notes', 'gameplay-spec', 'asset-inventory', 'ui-extract'] },
  P2: { name: 'Dựng lại', skills: ['runtime-select', 'parity-check', 'module-plan', 'rebuild-game', 'integrate'] },
  P3: {
    name: 'Chuyển sang web',
    skills: ['web-relayout', 'asset-spec'],
    human: 'Bạn duyệt bố cục và điều khiển trên web.',
    thirdParty: { name: 'Reskin', skills: ['web-relayout', 'style-direction', 'style-preview', 'apply-style', 'rename-and-text', 'asset-spec', 'replace-graphics', 'replace-audio'], human: 'Bạn chọn style.' },
  },
  P4: { name: 'Tích hợp', skills: ['platform-sdk', 'add-analytics', 'add-leaderboard', 'add-save', 'add-i18n'] },
  P5: { name: 'Phát hành', skills: ['package-web-build', 'perf-budget', 'qa-smoke', 'store-assets', 'release-check'], human: 'Bạn playtest bản cuối.' },
};

// Skills that ship with the plugin (one folder each in skills/). engine-<engine> resolves per game.
export const ENGINE_SKILLS = ['unity', 'cocos', 'godot', 'unreal', 'flash', 'construct', 'laya', 'html5', 'other'].map((e) => `engine-${e}`);
export const AVAILABLE_SKILLS = new Set([
  'using-gamekit',
  ...Object.values(PHASE_INFO).flatMap((p) => [...p.skills, ...(p.thirdParty?.skills ?? [])]).filter((s) => !s.includes('<')),
  ...ENGINE_SKILLS,
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
