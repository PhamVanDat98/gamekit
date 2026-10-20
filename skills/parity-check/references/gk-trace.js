// gk-trace.js — record the original game's state each frame as JSON Lines, for `gamekit oracle import`.
// For games that already run in a browser (HTML5, Cocos web build, Construct, Unity WebGL with a JS bridge)
// and that belong to the user (source.ownership: own). Never ship this file.
//
// 1. Open the original game in the browser, open DevTools → Console.
// 2. Paste this file, then start recording with the values you want, e.g. for Cocos Creator 2.x:
//      gkTrace.start({
//        'player.x': () => cc.find('Canvas/Player').x,
//        'obstacle.speed': () => cc.find('Canvas/Spawner').getComponent('Spawner').speed,
//      }, { everyFrames: 1, maxSeconds: 60 });
// 3. Play. `gkTrace.stop()` (or reaching maxSeconds) downloads gk-trace.jsonl.
// Each line: {"t": seconds since start, "frame": n, "<column>": value, …}. A getter that throws records null.
(() => {
  let rows = [];
  let raf = 0;
  let running = false;

  const download = (name = 'gk-trace.jsonl') => {
    const blob = new Blob([rows.map((r) => JSON.stringify(r)).join('\n') + '\n'], { type: 'application/x-ndjson' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const stop = () => {
    if (!running) return rows.length;
    running = false;
    cancelAnimationFrame(raf);
    console.info(`[gk-trace] ${rows.length} dòng`);
    download();
    return rows.length;
  };

  const start = (getters, { everyFrames = 1, maxSeconds = 60 } = {}) => {
    if (running) stop();
    rows = [];
    running = true;
    const t0 = performance.now();
    let frame = 0;
    const tick = (now) => {
      if (!running) return;
      const t = (now - t0) / 1000;
      if (maxSeconds > 0 && t > maxSeconds) return void stop();
      if (frame % everyFrames === 0) {
        const row = { t: Math.round(t * 1e4) / 1e4, frame };
        for (const [k, get] of Object.entries(getters)) {
          try {
            const v = get();
            row[k] = v === undefined || Number.isNaN(v) ? null : v;
          } catch {
            row[k] = null;
          }
        }
        rows.push(row);
      }
      frame++;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    console.info('[gk-trace] đang ghi — gkTrace.stop() để dừng và tải file');
  };

  window.gkTrace = { start, stop, rows: () => rows };
})();
