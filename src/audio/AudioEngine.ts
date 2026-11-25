import { clamp01 } from '../logic/math';

export class AudioEngine {
  private static readonly PLAYING_GAIN = 0.82;
  private static readonly MUSIC_URL = `${import.meta.env.BASE_URL}audio/swim-with-me-at-lovequay.mp3`;

  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private analyser: AnalyserNode | null = null;
  private frequencyData: Uint8Array<ArrayBuffer> | null = null;
  private musicGain: GainNode | null = null;
  private effectsGain: GainNode | null = null;
  private musicVolume = 0.6;
  private effectsVolume = 1;
  private musicBuffer: AudioBuffer | null = null;
  private musicLoad: Promise<AudioBuffer> | null = null;
  private musicSource: AudioBufferSourceNode | null = null;
  private musicOffset = 0;
  private musicStartedAt = 0;
  private enabled = true;
  private paused = true;
  private smoothedEnergy = 0.15;

  constructor(enabled: boolean, musicVolume = 0.6, effectsVolume = 1) {
    this.enabled = enabled;
    this.setMusicVolume(musicVolume);
    this.setEffectsVolume(effectsVolume);
  }

  async start(): Promise<void> {
    if (!this.context) this.createGraph();
    const context = this.context!;
    // Resume on the Start/Sound button gesture, before fetching or decoding music.
    const resumed = context.state === 'suspended' ? context.resume() : Promise.resolve();
    this.musicLoad ??= this.loadMusic(context);
    try {
      const [, buffer] = await Promise.all([resumed, this.musicLoad]);
      if (this.context !== context) return;
      this.musicBuffer = buffer;
      this.playMusic();
    } catch (error) {
      if (this.context === context) this.musicLoad = null;
      throw error;
    }
  }

  reset(): void {
    this.setPaused(true);
    this.musicOffset = 0;
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) this.stopMusic();
    else this.playMusic();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.applyGain(AudioEngine.PLAYING_GAIN);
  }

  isEnabled(): boolean { return this.enabled; }

  getMusicVolume(): number { return this.musicVolume; }

  getEffectsVolume(): number { return this.effectsVolume; }

  setMusicVolume(volume: number): void {
    if (!Number.isFinite(volume)) return;
    this.musicVolume = clamp01(volume);
    this.setChannelGain(this.musicGain, this.musicVolume);
  }

  setEffectsVolume(volume: number): void {
    if (!Number.isFinite(volume)) return;
    this.effectsVolume = clamp01(volume);
    this.setChannelGain(this.effectsGain, this.effectsVolume);
  }

  score(value: 1 | 5 | 10): void {
    if (this.paused || !this.enabled || !this.context || !this.master) return;
    const notes = value === 1 ? [880] : value === 5 ? [660, 990] : [660, 990, 1320];
    notes.forEach((frequency, index) => this.tone(frequency, 0.06 + index * 0.055, 0.15, value === 10 ? 'triangle' : 'sine', 0.2));
  }

  impact(): void {
    if (!this.enabled || !this.context || !this.master) return;
    this.tone(180, 0, 0.42, 'sawtooth', 0.32, 58);
  }

  energy(): number {
    if (!this.analyser || !this.frequencyData || this.paused || !this.enabled) {
      this.smoothedEnergy += (0.12 - this.smoothedEnergy) * 0.05;
      return this.smoothedEnergy;
    }
    this.analyser.getByteFrequencyData(this.frequencyData);
    const bins = Math.min(28, this.frequencyData.length);
    let sum = 0;
    for (let i = 0; i < bins; i++) sum += this.frequencyData[i];
    const raw = sum / Math.max(1, bins) / 255;
    this.smoothedEnergy += (clamp01(raw * 1.8) - this.smoothedEnergy) * 0.12;
    return this.smoothedEnergy;
  }

  dispose(): void {
    this.setPaused(true);
    void this.context?.close();
    this.context = null;
    this.master = null;
    this.compressor = null;
    this.analyser = null;
    this.frequencyData = null;
    this.musicGain = null;
    this.effectsGain = null;
    this.musicBuffer = null;
    this.musicLoad = null;
  }

  private createGraph(): void {
    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.master.gain.value = this.enabled ? AudioEngine.PLAYING_GAIN : 0;
    this.musicGain = this.context.createGain();
    this.musicGain.gain.value = this.musicVolume;
    this.musicGain.connect(this.master);
    this.effectsGain = this.context.createGain();
    this.effectsGain.gain.value = this.effectsVolume;
    this.effectsGain.connect(this.master);
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 128;
    this.analyser.smoothingTimeConstant = 0.84;
    this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
    this.compressor = this.context.createDynamicsCompressor();
    this.compressor.threshold.value = -18;
    this.compressor.knee.value = 12;
    this.compressor.ratio.value = 8;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.25;
    this.master.connect(this.compressor);
    this.compressor.connect(this.analyser);
    this.analyser.connect(this.context.destination);
  }

  private async loadMusic(context: AudioContext): Promise<AudioBuffer> {
    const response = await fetch(AudioEngine.MUSIC_URL);
    if (!response.ok) throw new Error('Background music could not be loaded. Check your connection and try again.');
    return context.decodeAudioData(await response.arrayBuffer());
  }

  private playMusic(): void {
    if (this.paused || this.musicSource || !this.context || !this.musicBuffer || !this.musicGain) return;
    const source = this.context.createBufferSource();
    source.buffer = this.musicBuffer;
    source.loop = true;
    source.connect(this.musicGain);
    this.musicStartedAt = this.context.currentTime;
    source.start(0, this.musicOffset);
    this.musicSource = source;
  }

  private stopMusic(): void {
    if (!this.musicSource || !this.context || !this.musicBuffer) return;
    this.musicOffset = (this.musicOffset + this.context.currentTime - this.musicStartedAt) % this.musicBuffer.duration;
    this.musicSource.stop();
    this.musicSource.disconnect();
    this.musicSource = null;
  }

  private tone(frequency: number, delay: number, duration: number, type: OscillatorType, volume: number, endFrequency?: number): void {
    if (!this.context || !this.effectsGain || this.effectsVolume === 0) return;
    const now = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(this.effectsGain);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  private applyGain(target: number): void {
    this.setChannelGain(this.master, this.enabled ? target : 0);
  }

  private setChannelGain(channel: GainNode | null, volume: number): void {
    if (!this.context || !channel) return;
    channel.gain.cancelScheduledValues(this.context.currentTime);
    channel.gain.setTargetAtTime(volume, this.context.currentTime, 0.035);
  }
}
