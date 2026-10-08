// src/audio/AudioMeter.js  (owner: audio) — tiny debug overlay (?debug or ctx.audio.showMeter(true)): bus levels,
// the music deck, wind, voices and the last sounds. A fixed canvas with pointer-events off; built only on demand.

const W = 260, H = 150;

export class AudioMeter {
  /** @param {import('./AudioManager.js').AudioManager} am */
  constructor(am) {
    this.am = am;
    this.canvas = document.createElement('canvas');
    this.canvas.width = W * 2; this.canvas.height = H * 2;
    this.canvas.className = 'audio-meter';
    this.canvas.style.cssText = `position:fixed;left:8px;bottom:8px;width:${W}px;height:${H}px;z-index:9999;pointer-events:none;` +
      'border-radius:8px;background:rgba(32,24,18,.78);box-shadow:0 2px 8px rgba(0,0,0,.35)';
    (document.getElementById('ui') ?? document.body).appendChild(this.canvas);
    this.g = this.canvas.getContext('2d');
    this.peak = { master: 0, music: 0, sfx: 0 };
    this._t = 0;
  }

  update(dt) {
    if ((this._t += dt) < 0.08) return;
    this._t = 0;
    const g = this.g, am = this.am, s = am.debugState();
    g.setTransform(2, 0, 0, 2, 0, 0);
    g.clearRect(0, 0, W, H);
    g.font = '600 11px system-ui, sans-serif';
    g.fillStyle = '#F4E7C9';
    g.fillText(`AUDIO ${s.unlocked ? 'on' : 'locked'} · ${s.state ?? 'no ctx'} · v2D ${s.voices2D} v3D ${s.voices3D}`, 8, 15);
    g.fillStyle = '#E8C77A';
    g.fillText(`♪ ${s.music?.track ?? '—'}${s.director?.combat ? ' (combat)' : ''}${s.director?.boss ? ' (boss)' : ''}`, 8, 31);
    const bars = [['master', s.levels.master], ['music', s.levels.music], ['sfx', s.levels.sfx]];
    bars.forEach(([name, rms], i) => {
      const db = rms > 1e-5 ? 20 * Math.log10(rms) : -90;
      const f = Math.max(0, Math.min(1, (db + 60) / 60));
      this.peak[name] = Math.max(f, (this.peak[name] ?? 0) - 0.03);
      const y = 40 + i * 16;
      g.fillStyle = '#F4E7C9'; g.fillText(name, 8, y + 10);
      g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(56, y + 2, 150, 9);
      g.fillStyle = f > 0.9 ? '#FF6A3D' : '#7FD38A'; g.fillRect(56, y + 2, 150 * f, 9);
      g.fillStyle = '#FFD34D'; g.fillRect(56 + 150 * this.peak[name] - 1, y + 1, 2, 11);
      g.fillStyle = '#F4E7C9'; g.fillText(`${db.toFixed(0)} dB`, 212, y + 10);
    });
    g.fillStyle = '#C9D6E8';
    g.fillText(`wind ${s.wind ? s.wind.wind.toFixed(2) : '—'} · ${s.wind ? Math.round(s.wind.freq) + ' Hz' : ''} · duck ${s.duck.toFixed(2)}`, 8, 102);
    g.fillStyle = '#F4E7C9';
    const last = s.recent.slice(-3).map((r) => r.id).join('  ');
    g.fillText(last.length > 44 ? last.slice(0, 44) + '…' : last, 8, 120);
    if (s.babble) { g.fillStyle = '#FFB3C7'; g.fillText(`babble: ${s.babble.speaker} ${s.babble.blips}/${s.babble.total}`, 8, 138); }
  }

  dispose() { this.canvas.remove(); }
}
