import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalStorageStore } from '../src/storage/LocalStorage';

describe('saved audio settings', () => {
  let values: Map<string, string>;

  beforeEach(() => {
    values = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('preserves existing mute preferences and uses the original mix for new settings', () => {
    values.set('balance-tunnel:v1:sound-enabled', 'false');
    const settings = new LocalStorageStore();
    expect(settings.getSoundEnabled()).toBe(false);
    expect(settings.getMusicVolume()).toBe(0.6);
    expect(settings.getEffectsVolume()).toBe(1);
  });

  it('remembers separate levels, including zero, after reload and unmute', () => {
    const settings = new LocalStorageStore();
    settings.setMusicVolume(0);
    settings.setEffectsVolume(0.35);
    settings.setSoundEnabled(false);
    const reloaded = new LocalStorageStore();
    reloaded.setSoundEnabled(true);
    expect(reloaded.getMusicVolume()).toBe(0);
    expect(reloaded.getEffectsVolume()).toBe(0.35);
    expect(reloaded.getSoundEnabled()).toBe(true);
  });

  it('recovers from invalid saved levels and unavailable browser storage', () => {
    const settings = new LocalStorageStore();
    values.set('balance-tunnel:v1:music-volume', 'NaN');
    values.set('balance-tunnel:v1:effects-volume', '');
    expect(settings.getMusicVolume()).toBe(0.6);
    expect(settings.getEffectsVolume()).toBe(1);
    settings.setMusicVolume(-1);
    settings.setEffectsVolume(2);
    expect(settings.getMusicVolume()).toBe(0);
    expect(settings.getEffectsVolume()).toBe(1);
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('Storage disabled'); },
      setItem: () => { throw new Error('Storage disabled'); },
    });
    expect(() => settings.setMusicVolume(0.2)).not.toThrow();
    expect(settings.getMusicVolume()).toBe(0.6);
    expect(settings.getEffectsVolume()).toBe(1);
  });
});
