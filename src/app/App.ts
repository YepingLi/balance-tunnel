import { GameState } from './GameState';
import { AudioEngine } from '../audio/AudioEngine';
import { Game } from '../game/Game';
import { TiltController } from '../input/TiltController';
import { GameModel } from '../logic/GameModel';
import { LocalStorageStore } from '../storage/LocalStorage';
import { UIController } from '../ui/UIController';

export class App {
  private storage = new LocalStorageStore();
  private model = new GameModel(this.storage.getHighScore());
  private tilt = new TiltController();
  private audio = new AudioEngine(this.storage.getSoundEnabled());
  private ui = new UIController();
  private game: Game;
  private animationFrame = 0;
  private lastFrame = performance.now();
  private countdownToken = 0;
  private disposed = false;
  private starting = false;

  constructor(canvas: HTMLCanvasElement) {
    this.game = new Game(canvas, this.audio, {
      onScore: (value) => this.onScore(value),
      onCrash: () => this.onCrash(),
    });
    this.ui.bind({
      start: () => this.startRun(),
      pause: () => this.togglePause(),
      resume: () => this.resume(),
      restart: () => this.startRun(),
      toggleSound: () => this.toggleSound(),
    });
    this.ui.setSound(this.audio.isEnabled());
    this.ui.updateResults(0, 0, 0, this.model.highScore, false);
    this.ui.showState(GameState.Start);
    this.updateDeviceGuidance();
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('orientationchange', this.onOrientationChange);
    window.addEventListener('beforeunload', this.dispose);
    this.animationFrame = requestAnimationFrame(this.loop);
  }

  private startRun = async (): Promise<void> => {
    if (this.starting) return;
    this.starting = true;
    this.countdownToken++;
    this.ui.setBusy(true);
    this.ui.setError();
    this.model.state = GameState.RequestingPermission;
    this.ui.showState(this.model.state);
    try {
      this.audio.reset();
      const [permission] = await Promise.all([
        this.tilt.requestPermission(),
        this.audio.start(),
      ]);
      if (permission !== 'granted') throw new Error('Motion access is required. Allow motion and orientation access, then try again.');
      const hasReading = await this.tilt.waitForReading();
      if (!hasReading || !this.tilt.calibrate()) {
        throw new Error('No tilt sensor data was received. Open this game on a phone and make sure motion access is enabled.');
      }
      this.game.reset();
      this.model.beginCountdown();
      this.ui.updateMetrics(0, 0, 0);
      this.ui.showState(this.model.state);
      const token = ++this.countdownToken;
      for (const value of ['3', '2', '1', 'Go']) {
        if (token !== this.countdownToken) return;
        this.ui.setCountdown(value);
        await this.wait(value === 'Go' ? 500 : 750);
      }
      if (token !== this.countdownToken) return;
      this.model.beginPlaying();
      this.game.setRunning(true);
      this.audio.setPaused(false);
      this.ui.showState(this.model.state);
      this.lastFrame = performance.now();
    } catch (error) {
      this.model.state = GameState.Unsupported;
      this.ui.setError(error instanceof Error ? error.message : 'The tilt sensor could not be started.');
      this.ui.showState(this.model.state);
    } finally {
      this.starting = false;
      this.ui.setBusy(false);
    }
  };

  private togglePause = (): void => {
    if (this.model.state === GameState.Playing) this.pause();
    else if (this.model.state === GameState.Paused) this.resume();
  };

  private pause = (): void => {
    if (this.model.state !== GameState.Playing) return;
    this.model.pause();
    this.game.setRunning(false);
    this.audio.setPaused(true);
    this.ui.setPauseLabel(true);
    this.ui.showState(this.model.state);
  };

  private resume = (): void => {
    if (this.model.state !== GameState.Paused) return;
    if (!this.tilt.isFresh()) {
      this.ui.setError('Tilt data is unavailable. Restart to recalibrate.');
      return;
    }
    this.ui.setError();
    this.model.resume();
    this.game.setRunning(true);
    this.audio.setPaused(false);
    this.ui.setPauseLabel(false);
    this.ui.showState(this.model.state);
    this.lastFrame = performance.now();
  };

  private toggleSound = async (): Promise<void> => {
    const enabled = !this.audio.isEnabled();
    this.audio.setEnabled(enabled);
    this.storage.setSoundEnabled(enabled);
    this.ui.setSound(enabled);
    if (enabled && this.model.state === GameState.Playing) await this.audio.start();
  };

  private onScore(value: 1 | 5 | 10): void {
    this.model.addScore(value);
    this.audio.score(value);
    this.ui.scoreFeedback(value);
  }

  private onCrash(): void {
    if (this.model.state !== GameState.Playing) return;
    this.game.setRunning(false);
    this.audio.impact();
    this.audio.setPaused(true);
    this.ui.crashFeedback();
    const isNewBest = this.model.endRun();
    if (isNewBest) this.storage.setHighScore(this.model.highScore);
    this.ui.updateResults(this.model.score, this.model.time, this.model.distance, this.model.highScore, isNewBest);
    window.setTimeout(() => this.ui.showState(this.model.state), 360);
  }

  private loop = (now: number): void => {
    if (this.disposed) return;
    const delta = Math.min(Math.max((now - this.lastFrame) / 1000, 0), 0.1);
    this.lastFrame = now;
    if (this.model.state === GameState.Playing) {
      const tilt = this.tilt.update(delta);
      if (!this.tilt.isFresh()) {
        this.pause();
        this.ui.setError('Tilt signal paused. Restart to recalibrate.');
      } else {
        this.model.update(delta);
        this.game.update(delta, this.model.speed, tilt);
        this.ui.updateMetrics(this.model.score, this.model.time, this.model.distance);
      }
    } else {
      this.game.update(delta, this.model.speed, { x: 0, y: 0 });
    }
    this.animationFrame = requestAnimationFrame(this.loop);
  };

  private updateDeviceGuidance(): void {
    if (!this.tilt.isMobileLike()) {
      this.ui.setDeviceMessage('Open this game on a phone to play with tilt controls.', true);
    } else {
      this.ui.setDeviceMessage('Rotate to landscape, hold your phone comfortably, then tap Start.');
    }
  }

  private onVisibilityChange = (): void => { if (document.hidden) this.pause(); };
  private onBlur = (): void => this.pause();
  private onOrientationChange = (): void => {
    if ([GameState.Playing, GameState.Paused].includes(this.model.state)) {
      this.pause();
      this.ui.setError('Screen orientation changed. Restart to recalibrate.');
    }
  };

  private dispose = (): void => {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.animationFrame);
    this.countdownToken++;
    this.game.dispose();
    this.tilt.dispose();
    this.audio.dispose();
    this.ui.dispose();
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('orientationchange', this.onOrientationChange);
  };

  private wait(ms: number): Promise<void> { return new Promise((resolve) => window.setTimeout(resolve, ms)); }
}
