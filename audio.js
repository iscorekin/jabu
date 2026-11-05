// Gesture-unlocked sample playback, with a synthesized fallback if loading fails.
export class FrogAudio {
  constructor() {
    this.enabled = true;
    this.context = null;
    this.master = null;
    this.wave = null;
    this.samplePromise = null;
    this.soundVersion = 0;
  }

  unlock() {
    try {
      const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AudioContext) return Promise.resolve(false);
      if (!this.context || this.context.state === 'closed') {
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.master.gain.value = this.enabled ? 0.22 : 0;
        this.master.connect(this.context.destination);
        // Strong uneven harmonics give the throat a hollow, buzzy character.
        this.wave = this.context.createPeriodicWave(
          new Float32Array(9),
          new Float32Array([0, 1, 0.48, 0.7, 0.18, 0.3, 0.1, 0.15, 0.04]),
        );
      }
      if (!this.samplePromise) {
        this.samplePromise = fetch(new URL('./frog-croak.mp3', import.meta.url))
          .then(response => {
            if (!response.ok) throw new Error('Cannot load frog croak');
            return response.arrayBuffer();
          })
          .then(data => this.context.decodeAudioData(data))
          .catch(() => null);
      }
      return Promise.resolve(this.context.resume())
        .then(() => this.context.state === 'running')
        .catch(() => false);
    } catch {
      return Promise.resolve(false);
    }
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    this.soundVersion += 1;
    if (this.master && this.context.state !== 'closed') {
      const now = this.context.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(this.enabled ? 0.22 : 0, now, 0.015);
    }
  }

  async playMerge(level = 1) {
    if (!this.enabled) return;
    const version = ++this.soundVersion;
    const ready = await this.unlock();
    const buffer = await this.samplePromise;
    if (!ready || !this.enabled || version !== this.soundVersion) return;
    if (!buffer) { this.playSynth(level); return; }
    const rank = Number.isFinite(Number(level)) ? Math.max(2, Number(level)) : 2;
    // Level 2 plays the original; slowing the sample lowers pitch and lengthens it.
    // Logarithmic growth keeps changes gradual, including beyond the supplied art.
    const rate = 1 / (1 + 0.22 * Math.log2(rank - 1));
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    gain.gain.value = 3;
    source.connect(gain);
    gain.connect(this.master);
    source.onended = () => { source.disconnect(); gain.disconnect(); };
    source.start();
  }

  playSynth(level = 1) {
    const ctx = this.context;
    if (!this.enabled || !ctx || ctx.state !== 'running') return;
    const parsed = Number(level);
    const rank = Number.isFinite(parsed) ? Math.max(1, parsed) : 1;
    // Continue deepening and lengthening beyond level 13, with a natural bass floor.
    const fundamental = 43 + 185 / (1 + 0.24 * (rank - 1));
    const duration = 0.28 + 0.28 * Math.log2(rank + 1);
    const start = ctx.currentTime + 0.008;
    const end = start + duration;
    const throat = ctx.createOscillator();
    throat.setPeriodicWave(this.wave);
    throat.frequency.setValueAtTime(fundamental * 1.35, start);
    throat.frequency.exponentialRampToValueAtTime(fundamental, start + duration * 0.22);
    throat.frequency.exponentialRampToValueAtTime(fundamental * 0.86, end);

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.8;
    filter.frequency.setValueAtTime(fundamental * 4.7, start);
    filter.frequency.exponentialRampToValueAtTime(fundamental * 2.8, end);

    // Repeated glottal bursts produce a croak instead of a smooth musical note.
    const envelope = ctx.createGain();
    const pulses = Math.min(12, 3 + Math.floor(Math.log2(rank + 1)));
    const period = duration / pulses;
    envelope.gain.setValueAtTime(0, start);
    for (let i = 0; i < pulses; i += 1) {
      const time = start + i * period;
      const strength = (1 - i / pulses * 0.55) * (i % 2 ? 0.8 : 1);
      envelope.gain.linearRampToValueAtTime(strength, time + period * 0.12);
      envelope.gain.exponentialRampToValueAtTime(0.015, time + period * 0.86);
      envelope.gain.linearRampToValueAtTime(0, time + period);
    }

    const flutter = ctx.createOscillator();
    const flutterDepth = ctx.createGain();
    flutter.type = 'triangle';
    flutter.frequency.value = 23 + 12 / Math.sqrt(rank);
    flutterDepth.gain.value = fundamental * 0.11;
    flutter.connect(flutterDepth);
    flutterDepth.connect(throat.frequency);
    throat.connect(filter);
    filter.connect(envelope);
    envelope.connect(this.master);
    throat.onended = () => {
      throat.disconnect();
      flutter.disconnect();
      flutterDepth.disconnect();
      filter.disconnect();
      envelope.disconnect();
    };
    throat.start(start);
    flutter.start(start);
    throat.stop(end + 0.02);
    flutter.stop(end + 0.02);
  }
}
