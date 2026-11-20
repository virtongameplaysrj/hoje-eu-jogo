/* Sons sintetizados na hora (Web Audio): nenhum arquivo de áudio.
   Tudo aqui é composição original: marchinha de circo, tique da roleta, ta-dá e fanfarra espacial. */
const Sound = (() => {
  let ctx = null, master = null;

  function audio() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

  /** Nota com envelope simples. type: oscilador; peak: volume; dest: destino opcional. */
  function note(midi, t, dur, { type = 'square', peak = 0.12, attack = 0.005, release = 0.06, detune = 0, dest } = {}) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = hz(midi); o.detune.value = detune;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.setValueAtTime(peak, t + Math.max(attack, dur - release));
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g); g.connect(dest || master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  /* ---------- marchinha de circo (original), em loop enquanto a roleta gira ---------- */
  // [nota MIDI, duração em colcheias]; null = pausa
  const MELODY = [
    [67, 1], [68, 1], [69, 1], [76, 2], [72, 1], [69, 2],
    [67, 1], [66, 1], [67, 1], [74, 2], [71, 1], [67, 2],
    [65, 1], [66, 1], [67, 1], [72, 1], [71, 1], [69, 1], [67, 1], [65, 1],
    [64, 1], [63, 1], [64, 1], [67, 1], [72, 2], [null, 2],
    [69, 1], [70, 1], [71, 1], [77, 2], [74, 1], [71, 2],
    [72, 1], [71, 1], [72, 1], [76, 2], [72, 1], [67, 2],
    [69, 1], [68, 1], [69, 1], [72, 1], [71, 1], [74, 1], [71, 1], [67, 1],
    [72, 2], [67, 2], [60, 2], [null, 2],
  ];
  // um acorde por compasso (8 colcheias): [baixo, notas do "pá"]
  const BARS = [[48, [64, 67]], [43, [62, 65, 71]], [41, [65, 69, 72]], [48, [64, 67, 72]],
                [41, [65, 69, 72]], [48, [64, 67, 72]], [43, [62, 65, 71]], [48, [64, 67, 72]]];
  const EIGHTH = 60 / 168 / 2;   // 168 bpm
  let circusTimer = 0, circusNext = 0, circusStep = 0, circusBus = null;

  function scheduleCircus() {
    const total = MELODY.reduce((s, m) => s + m[1], 0);
    while (circusNext < ctx.currentTime + 0.25) {
      // descobre a nota da melodia que começa neste passo
      let acc = 0;
      const pos = circusStep % total;
      for (const [m, len] of MELODY) {
        if (acc === pos && m) {
          note(m, circusNext, len * EIGHTH * 0.92, { type: 'square', peak: 0.07, dest: circusBus });
          note(m + 12, circusNext, len * EIGHTH * 0.6, { type: 'triangle', peak: 0.05, dest: circusBus });
        }
        acc += len;
      }
      // oom-pá: baixo nos tempos 1 e 3, acorde nos tempos 2 e 4
      const beat = pos % 8, bar = BARS[Math.floor(pos / 8) % BARS.length];
      if (beat === 0 || beat === 4) note(bar[0] - (beat === 4 ? 5 : 0), circusNext, EIGHTH * 1.6, { type: 'triangle', peak: 0.22, dest: circusBus });
      if (beat === 2 || beat === 6) for (const c of bar[1]) note(c, circusNext, EIGHTH * 0.8, { type: 'square', peak: 0.025, dest: circusBus });
      circusNext += EIGHTH;
      circusStep++;
    }
  }

  function circusStart() {
    if (!audio() || circusTimer) return;
    circusBus = ctx.createGain(); circusBus.gain.value = 1; circusBus.connect(master);
    circusNext = ctx.currentTime + 0.05; circusStep = 0;
    scheduleCircus();
    circusTimer = setInterval(scheduleCircus, 60);
  }

  function circusStop(fade = 0.4) {
    if (!circusTimer) return;
    clearInterval(circusTimer); circusTimer = 0;
    const bus = circusBus, t = ctx.currentTime;
    bus.gain.setValueAtTime(bus.gain.value, t);
    bus.gain.linearRampToValueAtTime(0, t + fade);
    setTimeout(() => bus.disconnect(), fade * 1000 + 200);
  }

  /** Tique curto, como a palheta de uma roleta batendo nos pinos. */
  function tick() {
    if (!audio()) return;
    const t = ctx.currentTime;
    note(96, t, 0.025, { type: 'square', peak: 0.06, release: 0.02 });
  }

  /** Ta-dá: dois acordes de metais. */
  function tada() {
    if (!audio()) return;
    const t = ctx.currentTime + 0.02;
    for (const m of [60, 64, 67]) note(m, t, 0.14, { type: 'sawtooth', peak: 0.07 });
    for (const m of [60, 64, 67, 72]) note(m, t + 0.18, 0.9, { type: 'sawtooth', peak: 0.07, release: 0.5 });
    for (const m of [48, 55]) note(m, t + 0.18, 0.9, { type: 'triangle', peak: 0.2, release: 0.5 });
  }

  /* ---------- abertura: drone espacial + fanfarra de metais (original) ---------- */
  function brass(midi, t, dur, peak = 0.06) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.Q.value = 2;
    f.frequency.setValueAtTime(400, t);
    f.frequency.linearRampToValueAtTime(2600, t + 0.25);
    f.frequency.linearRampToValueAtTime(1400, t + dur);
    f.connect(master);
    note(midi, t, dur, { type: 'sawtooth', peak, attack: 0.08, release: 0.5, dest: f });
    note(midi, t, dur, { type: 'sawtooth', peak: peak * 0.7, attack: 0.08, release: 0.5, detune: 9, dest: f });
  }

  function whoosh(t, dur) {
    const n = ctx.sampleRate * dur, buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = buf; f.type = 'bandpass'; f.Q.value = 0.8;
    f.frequency.setValueAtTime(200, t); f.frequency.exponentialRampToValueAtTime(5000, t + dur * 0.8);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.25, t + dur * 0.75); g.gain.linearRampToValueAtTime(0, t + dur);
    src.connect(f); f.connect(g); g.connect(master); src.start(t);
  }

  /** Agenda a trilha da abertura no contexto atual; warpAt = segundo em que acontece o salto. */
  function scheduleIntro(warpAt) {
    const t = ctx.currentTime + 0.05;
    // drone grave que cresce até o salto
    for (const [m, det] of [[33, 0], [40, 6], [45, -5]]) {
      note(m, t, warpAt + 1.5, { type: 'sawtooth', peak: 0.05, attack: warpAt * 0.8, release: 1.2, detune: det });
    }
    whoosh(t + warpAt - 1.6, 2.2);
    // fanfarra depois do salto: Lá maior → Fá maior → Sol maior → Lá maior
    const f0 = t + warpAt + 0.3;
    const line = [[57, 0, 0.5], [64, 0.5, 0.5], [69, 1.0, 1.4], [68, 2.4, 0.3], [69, 2.7, 0.3], [72, 3.0, 1.6],
                  [71, 4.6, 0.4], [74, 5.0, 0.6], [76, 5.6, 2.6]];
    for (const [m, at, d] of line) brass(m, f0 + at, d, 0.055);
    for (const [ch, at, d] of [[[45, 52, 61], 1.0, 2.0], [[41, 53, 60], 3.0, 1.6], [[43, 55, 59], 4.6, 1.0], [[45, 57, 64, 69], 5.6, 2.8]]) {
      for (const m of ch) brass(m, f0 + at, d, 0.03);
    }
  }

  /**
   * O Android bloqueia o Web Audio "ao vivo" até o primeiro toque, mas deixa o app tocar um
   * <audio> comum sozinho. Então renderizamos a trilha inteira offline (não precisa de toque),
   * viramos um WAV e devolvemos um elemento <audio> pronto para tocar.
   */
  async function introTrack(warpAt, totalSec) {
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OAC) return null;
    const sr = 22050;
    const off = new OAC(1, Math.ceil(sr * totalSec), sr);
    const keep = [ctx, master];
    ctx = off;                                     // note()/brass()/whoosh() desenham neste contexto
    master = off.createGain(); master.gain.value = 0.55; master.connect(off.destination);
    try { scheduleIntro(warpAt); } finally { [ctx, master] = keep; }
    const buf = await off.startRendering();
    const a = new Audio(URL.createObjectURL(new Blob([toWav(buf)], { type: 'audio/wav' })));
    a.preload = 'auto';
    return a;
  }

  /** AudioBuffer (mono) → arquivo WAV PCM 16 bits. */
  function toWav(buf) {
    const d = buf.getChannelData(0), n = d.length;
    const v = new DataView(new ArrayBuffer(44 + n * 2));
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE');
    str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, buf.sampleRate, true); v.setUint32(28, buf.sampleRate * 2, true);
    v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    str(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) {
      const s = Math.max(-1, Math.min(1, d[i]));
      v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return v.buffer;
  }

  function stopAll() { circusStop(0.2); }

  // qualquer toque "destrava" o áudio ao vivo (roleta, tiques) o quanto antes
  document.addEventListener('pointerdown', () => audio(), { capture: true, once: true });

  return { unlock: audio, circusStart, circusStop, tick, tada, introTrack, stopAll };
})();
