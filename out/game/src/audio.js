// Tiny synthesized sound: engine hum, skid, beeps and thuds, all WebAudio,
// nothing fetched. Everything is guarded: no audio context, no sound, no crash.
export function createAudio() {
  let ctx = null, engine = null, engineGain = null, skidGain = null, muted = false;
  let noiseBuf = null;
  function ensure() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
      engine = ctx.createOscillator();
      engine.type = 'sawtooth';
      engine.frequency.value = 55;
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass'; filt.frequency.value = 420;
      engineGain = ctx.createGain(); engineGain.gain.value = 0;
      engine.connect(filt).connect(engineGain).connect(ctx.destination);
      engine.start();
      const skid = ctx.createBufferSource();
      skid.buffer = noiseBuf; skid.loop = true;
      const skidFilt = ctx.createBiquadFilter();
      skidFilt.type = 'bandpass'; skidFilt.frequency.value = 900; skidFilt.Q.value = 1.2;
      skidGain = ctx.createGain(); skidGain.gain.value = 0;
      skid.connect(skidFilt).connect(skidGain).connect(ctx.destination);
      skid.start();
    } catch { ctx = null; }
    return ctx;
  }
  function tone(freq, dur, type = 'sine', vol = 0.2, when = 0) {
    if (!ensure() || muted) return;
    try {
      const t0 = ctx.currentTime + when;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      o.connect(g).connect(ctx.destination);
      o.start(t0); o.stop(t0 + dur + 0.05);
    } catch { /* silent */ }
  }
  return {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); },
    setMuted(m) { muted = m; if (engineGain) engineGain.gain.value = 0; if (skidGain) skidGain.gain.value = 0; },
    isMuted() { return muted; },
    engine(speed, throttle) {
      if (!ensure() || muted) return;
      try {
        engine.frequency.value = 52 + Math.abs(speed) * 9 + throttle * 12;
        engineGain.gain.value = 0.045 + (throttle ? 0.035 : 0);
        if (skidGain) skidGain.gain.value = 0;
      } catch { /* silent */ }
    },
    skid(on) {
      if (!ensure() || muted || !skidGain) return;
      try { skidGain.gain.value = on ? 0.06 : 0; } catch { /* silent */ }
    },
    crash(hard) {
      if (!ensure() || muted) return;
      try {
        const s = ctx.createBufferSource();
        s.buffer = noiseBuf;
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300;
        const g = ctx.createGain();
        g.gain.setValueAtTime(hard ? 0.4 : 0.18, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
        s.connect(f).connect(g).connect(ctx.destination);
        s.start(); s.stop(ctx.currentTime + 0.3);
        tone(70, 0.2, 'sine', 0.25);
      } catch { /* silent */ }
    },
    beep() { tone(880, 0.12, 'sine', 0.18); },
    success() { tone(660, 0.14, 'sine', 0.2); tone(880, 0.2, 'sine', 0.2, 0.14); tone(1320, 0.3, 'sine', 0.18, 0.28); },
    fail() { tone(220, 0.3, 'sawtooth', 0.15); tone(160, 0.45, 'sawtooth', 0.15, 0.2); },
  };
}
