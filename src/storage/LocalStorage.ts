import { clamp01 } from '../logic/math';

const HIGH_SCORE_KEY = 'balance-tunnel:v1:high-score';
const SOUND_KEY = 'balance-tunnel:v1:sound-enabled';
const MUSIC_VOLUME_KEY = 'balance-tunnel:v1:music-volume';
const EFFECTS_VOLUME_KEY = 'balance-tunnel:v1:effects-volume';

export class LocalStorageStore {
  getHighScore(): number {
    try {
      const value = Number.parseInt(localStorage.getItem(HIGH_SCORE_KEY) ?? '0', 10);
      return Number.isFinite(value) && value > 0 ? value : 0;
    } catch {
      return 0;
    }
  }

  setHighScore(value: number): void {
    try { localStorage.setItem(HIGH_SCORE_KEY, String(Math.max(0, Math.floor(value)))); } catch { /* storage is optional */ }
  }

  getSoundEnabled(): boolean {
    try { return localStorage.getItem(SOUND_KEY) !== 'false'; } catch { return true; }
  }

  setSoundEnabled(value: boolean): void {
    try { localStorage.setItem(SOUND_KEY, String(value)); } catch { /* storage is optional */ }
  }

  getMusicVolume(): number { return this.getVolume(MUSIC_VOLUME_KEY, 0.6); }

  getEffectsVolume(): number { return this.getVolume(EFFECTS_VOLUME_KEY, 1); }

  setMusicVolume(value: number): void { this.setVolume(MUSIC_VOLUME_KEY, value); }

  setEffectsVolume(value: number): void { this.setVolume(EFFECTS_VOLUME_KEY, value); }

  private getVolume(key: string, fallback: number): number {
    try {
      const stored = localStorage.getItem(key);
      if (stored === null || stored.trim() === '') return fallback;
      const value = Number(stored);
      return Number.isFinite(value) ? clamp01(value) : fallback;
    } catch {
      return fallback;
    }
  }

  private setVolume(key: string, value: number): void {
    if (!Number.isFinite(value)) return;
    try { localStorage.setItem(key, String(clamp01(value))); } catch { /* storage is optional */ }
  }
}
