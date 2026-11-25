import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioEngine } from '../src/audio/AudioEngine';

const parameter = () => ({
  value: 0,
  setValueAtTime: vi.fn(),
  exponentialRampToValueAtTime: vi.fn(),
  cancelScheduledValues: vi.fn(),
  setTargetAtTime: vi.fn(),
});

const node = () => ({ connect: vi.fn((destination: unknown) => destination), disconnect: vi.fn() });
const gainNode = () => ({ ...node(), gain: parameter() });
const bufferSource = () => ({ ...node(), buffer: null, loop: false, start: vi.fn(), stop: vi.fn() });
const oscillatorNode = () => ({ ...node(), frequency: parameter(), type: 'sine', start: vi.fn(), stop: vi.fn() });

class TestAudioContext {
  state = 'suspended';
  currentTime = 0;
  destination = node();
  gains: ReturnType<typeof gainNode>[] = [];
  sources: ReturnType<typeof bufferSource>[] = [];
  oscillators: ReturnType<typeof oscillatorNode>[] = [];
  resume = vi.fn(async () => { this.state = 'running'; });
  close = vi.fn(async () => { this.state = 'closed'; });
  decodeAudioData = vi.fn(async () => ({ duration: 60 }));

  createGain() {
    const gain = gainNode();
    this.gains.push(gain);
    return gain;
  }

  createBufferSource() {
    const source = bufferSource();
    this.sources.push(source);
    return source;
  }

  createOscillator() {
    const oscillator = oscillatorNode();
    this.oscillators.push(oscillator);
    return oscillator;
  }

  createAnalyser() {
    return { ...node(), frequencyBinCount: 64, fftSize: 0, smoothingTimeConstant: 0, getByteFrequencyData: vi.fn() };
  }

  createDynamicsCompressor() {
    return { ...node(), threshold: parameter(), knee: parameter(), ratio: parameter(), attack: parameter(), release: parameter() };
  }
}

describe('background music playback', () => {
  let context: TestAudioContext;
  let audio: AudioEngine;

  beforeEach(() => {
    context = new TestAudioContext();
    vi.stubGlobal('AudioContext', vi.fn(function () { return context; }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    }));
    audio = new AudioEngine(true);
  });

  afterEach(() => {
    audio.dispose();
    vi.unstubAllGlobals();
  });

  it('unlocks audio before loading, then waits for the countdown before looping music', async () => {
    await audio.start();
    expect(context.resume.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(fetch).mock.invocationCallOrder[0]);
    expect(context.sources).toHaveLength(0);

    audio.setPaused(false);
    expect(context.sources).toHaveLength(1);
    expect(context.sources[0].loop).toBe(true);
    expect(context.sources[0].start).toHaveBeenCalledWith(0, 0);
  });

  it('resumes at the paused position across loops and resets each new run', async () => {
    await audio.start();
    audio.setPaused(false);
    context.currentTime = 75;
    audio.setPaused(true);
    expect(context.sources[0].stop).toHaveBeenCalledOnce();

    context.currentTime = 100;
    audio.setPaused(false);
    expect(context.sources[1].start).toHaveBeenCalledWith(0, 15);

    audio.reset();
    await audio.start();
    expect(fetch).toHaveBeenCalledOnce();
    expect(context.sources).toHaveLength(2);
    audio.setPaused(false);
    expect(context.sources[2].start).toHaveBeenCalledWith(0, 0);
  });

  it('mutes music and effects together without restarting music or resuming a paused game', async () => {
    await audio.start();
    audio.setPaused(false);
    audio.setEnabled(false);
    expect(context.gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 0, 0.035);
    expect(context.sources[0].stop).not.toHaveBeenCalled();
    audio.score(10);
    expect(context.oscillators).toHaveLength(0);

    audio.setPaused(true);
    audio.setEnabled(true);
    expect(context.sources).toHaveLength(1);
    audio.setPaused(false);
    audio.impact();
    audio.setPaused(true);
    expect(context.oscillators).toHaveLength(1);
    expect(context.gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(0.82, 0, 0.035);
  });

  it('allows a failed music download to be retried on Start', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false } as Response);
    await expect(audio.start()).rejects.toThrow('Background music could not be loaded');
    await audio.start();
    audio.setPaused(false);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(context.sources).toHaveLength(1);
  });

  it('routes music and effects through independent volume controls', async () => {
    audio.setMusicVolume(0.25);
    audio.setEffectsVolume(0.8);
    await audio.start();
    expect(context.gains[1].gain.value).toBe(0.25);
    expect(context.gains[2].gain.value).toBe(0.8);

    audio.setPaused(false);
    audio.setMusicVolume(0);
    audio.score(1);
    expect(context.sources[0].connect).toHaveBeenCalledWith(context.gains[1]);
    expect(context.gains[1].gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 0, 0.035);
    expect(context.gains[2].gain.setTargetAtTime).not.toHaveBeenCalled();
    expect(context.gains[3].connect).toHaveBeenCalledWith(context.gains[2]);
    expect(context.oscillators).toHaveLength(1);

    audio.setEffectsVolume(0);
    audio.setMusicVolume(0.9);
    audio.score(10);
    expect(context.gains[2].gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 0, 0.035);
    expect(audio.getMusicVolume()).toBe(0.9);
    expect(audio.getEffectsVolume()).toBe(0);
    expect(context.sources).toHaveLength(1);
    expect(context.sources[0].stop).not.toHaveBeenCalled();
    expect(context.oscillators).toHaveLength(1);
  });

  it('keeps channel levels when muting and restoring all audio', async () => {
    audio = new AudioEngine(true, 0.4, 0.7);
    await audio.start();
    audio.setEnabled(false);
    audio.setMusicVolume(0.2);
    expect(context.gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 0, 0.035);
    audio.setEnabled(true);
    expect(context.gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(0.82, 0, 0.035);
    expect(audio.getMusicVolume()).toBe(0.2);
    expect(audio.getEffectsVolume()).toBe(0.7);
    expect(context.gains[1].gain.setTargetAtTime).toHaveBeenLastCalledWith(0.2, 0, 0.035);
    expect(context.gains[2].gain.value).toBe(0.7);
  });
});
