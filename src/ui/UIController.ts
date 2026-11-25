import { GameState } from '../app/GameState';

type Handler = () => void | Promise<void>;

function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing required UI element #${id}`);
  return element as T;
}

export class UIController {
  private startScreen = required<HTMLElement>('start-screen');
  private countdownScreen = required<HTMLElement>('countdown-screen');
  private pauseScreen = required<HTMLElement>('pause-screen');
  private gameOverScreen = required<HTMLElement>('game-over-screen');
  private hud = required<HTMLElement>('hud');
  private error = required<HTMLElement>('error-message');
  private deviceMessage = required<HTMLElement>('device-message');
  private impactFlash = required<HTMLElement>('impact-flash');
  private scorePop = required<HTMLElement>('score-pop');
  private audioDialog = required<HTMLDialogElement>('audio-settings');
  private callbacks: Array<() => void> = [];

  bind(actions: {
    start: Handler;
    pause: Handler;
    resume: Handler;
    restart: Handler;
    openAudio: Handler;
    toggleSound: Handler;
    setMusicVolume: (volume: number) => void;
    setEffectsVolume: (volume: number) => void;
  }): void {
    this.on('start-button', actions.start);
    this.on('pause-button', actions.pause);
    this.on('resume-button', actions.resume);
    this.on('restart-button', actions.restart);
    this.on('game-over-restart', actions.restart);
    ['start-sound-button', 'hud-sound-button', 'pause-sound-button', 'game-over-sound'].forEach((id) => this.on(id, actions.openAudio));
    this.on('audio-close', () => this.audioDialog.close());
    this.on('audio-mute-button', actions.toggleSound);
    this.onVolume('music-volume', actions.setMusicVolume);
    this.onVolume('effects-volume', actions.setEffectsVolume);
    const onClose = (): void => {
      if (this.pauseScreen.classList.contains('active')) required('resume-button').focus();
    };
    this.audioDialog.addEventListener('close', onClose);
    this.callbacks.push(() => this.audioDialog.removeEventListener('close', onClose));
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.audioDialog.close();
      }
    };
    this.audioDialog.addEventListener('keydown', onKeyDown);
    this.callbacks.push(() => this.audioDialog.removeEventListener('keydown', onKeyDown));
  }

  showState(state: GameState): void {
    [this.startScreen, this.countdownScreen, this.pauseScreen, this.gameOverScreen].forEach((screen) => screen.classList.remove('active'));
    this.hud.classList.toggle('hidden', ![GameState.Playing, GameState.Paused].includes(state));
    if ([GameState.Start, GameState.Unsupported, GameState.RequestingPermission].includes(state)) this.startScreen.classList.add('active');
    if (state === GameState.Countdown) this.countdownScreen.classList.add('active');
    if (state === GameState.Paused) this.pauseScreen.classList.add('active');
    if (state === GameState.GameOver) this.gameOverScreen.classList.add('active');
  }

  updateMetrics(score: number, time: number, distance: number): void {
    required('hud-score').textContent = String(score);
    required('hud-time').textContent = this.formatTime(time);
    required('hud-distance').textContent = `${Math.floor(distance)}m`;
  }

  updateResults(score: number, time: number, distance: number, best: number, isNewBest: boolean): void {
    required('result-score').textContent = String(score);
    required('result-time').textContent = this.formatTime(time);
    required('result-distance').textContent = `${Math.floor(distance)}m`;
    required('result-best').textContent = String(best);
    required('start-best').textContent = String(best);
    required('new-best').classList.toggle('hidden', !isNewBest);
  }

  setCountdown(value: string): void { required('countdown-value').textContent = value; }

  setSound(enabled: boolean): void {
    ['start-sound-button', 'hud-sound-button', 'pause-sound-button', 'game-over-sound'].forEach((id) => {
      required<HTMLButtonElement>(id).textContent = enabled ? 'Audio' : 'Audio (muted)';
    });
    const mute = required<HTMLButtonElement>('audio-mute-button');
    mute.textContent = enabled ? 'Mute all' : 'Unmute all';
    mute.setAttribute('aria-pressed', String(!enabled));
  }

  showAudioSettings(): void {
    if (!this.audioDialog.open) this.audioDialog.showModal();
  }

  setVolumes(music: number, effects: number): void {
    for (const [id, volume] of [['music', music], ['effects', effects]] as const) {
      const percentage = String(Math.round(volume * 100));
      const slider = required<HTMLInputElement>(`${id}-volume`);
      slider.value = percentage;
      slider.setAttribute('aria-valuetext', `${percentage}%`);
      required<HTMLOutputElement>(`${id}-volume-value`).value = `${percentage}%`;
    }
  }

  setBusy(busy: boolean): void {
    const button = required<HTMLButtonElement>('start-button');
    button.disabled = busy;
    button.textContent = busy ? 'Connecting…' : 'Start';
  }

  setError(message = ''): void {
    this.error.textContent = message;
    this.error.classList.toggle('hidden', message.length === 0);
  }

  setDeviceMessage(message: string, warning = false): void {
    this.deviceMessage.textContent = message;
    this.deviceMessage.classList.toggle('warning', warning);
  }

  scoreFeedback(value: 1 | 5 | 10): void {
    this.scorePop.textContent = `+${value}`;
    this.scorePop.className = `score-pop show value-${value}`;
    window.setTimeout(() => this.scorePop.classList.remove('show'), 500);
  }

  crashFeedback(): void {
    this.impactFlash.classList.remove('show');
    void this.impactFlash.offsetWidth;
    this.impactFlash.classList.add('show');
  }

  setPauseLabel(paused: boolean): void { required('pause-button').textContent = paused ? 'Resume' : 'Pause'; }

  dispose(): void { this.callbacks.forEach((remove) => remove()); }

  private on(id: string, handler: Handler): void {
    const element = required<HTMLButtonElement>(id);
    const listener = (): void => { void handler(); };
    element.addEventListener('click', listener);
    this.callbacks.push(() => element.removeEventListener('click', listener));
  }

  private onVolume(id: string, handler: (volume: number) => void): void {
    const slider = required<HTMLInputElement>(id);
    const listener = (): void => handler(slider.valueAsNumber / 100);
    slider.addEventListener('input', listener);
    this.callbacks.push(() => slider.removeEventListener('input', listener));
  }

  private formatTime(seconds: number): string {
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
  }
}
