// The 6-phase pipeline. Skills listed are the ones `next` suggests, in order.
// `thirdParty` overrides a phase for games remade from someone else's (source.ownership: third-party).
export const PHASES = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5'];

export const PHASE_INFO = {
  P0: { name: 'Intake', skills: ['game-recon', 'triage'], human: 'Bạn quyết định làm hay bỏ (triage).' },
  P1: { name: 'Phân tích', skills: ['engine-<engine>', 're-notes', 'gameplay-spec', 'asset-inventory', 'art-review', 'ui-extract'] },
  P2: { name: 'Dựng lại', skills: ['runtime-select', 'module-plan', 'rebuild-game', 'integrate', 'parity-check'] },
  P3: {
    name: 'Chuyển sang web',
    skills: ['web-relayout', 'animate', 'art-review'],
    human: 'Bạn duyệt bố cục và điều khiển trên web.',
    thirdParty: { name: 'Reskin', skills: ['web-relayout', 'style-analysis', 'style-direction', 'style-preview', 'asset-spec', 'apply-style', 'replace-graphics', 'animate', 'art-review', 'replace-audio', 'rename-and-text'], human: 'Bạn chọn style.' },
  },
  P4: { name: 'Tích hợp', skills: ['platform-sdk', 'add-analytics', 'add-leaderboard', 'add-save', 'add-i18n'] },
  P5: { name: 'Phát hành', skills: ['package-web-build', 'perf-budget', 'qa-smoke', 'store-assets', 'release-check'], human: 'Bạn playtest bản cuối.' },
};

// Skills that ship in this version of the plugin. Others are planned (later sub-projects).
export const AVAILABLE_SKILLS = new Set([
  'using-gamekit',
  're-notes',
  'rebuild-game',
  'parity-check',
  'module-plan',
  'integrate',
  'platform-sdk',
  'animate',
  'style-analysis',
  'art-review',
  'package-web-build',
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
