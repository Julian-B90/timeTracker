import * as vscode from 'vscode';

export interface TimerSession {
  ticketId: string;
  branchName: string;
  startTime: Date;
  comment: string;
  activityTypeId?: string;
}

export class TimerManager {
  private _session: TimerSession | null = null;
  private _statusBarItem: vscode.StatusBarItem;
  private _tickInterval: ReturnType<typeof setInterval> | null = null;

  private _onSessionChange = new vscode.EventEmitter<TimerSession | null>();
  readonly onSessionChange = this._onSessionChange.event;

  constructor() {
    this._statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    this._statusBarItem.command = 'timeTracker.showPanel';
    this._statusBarItem.show();
    this._updateStatusBar();
  }

  get isRunning(): boolean {
    return this._session !== null;
  }

  get session(): TimerSession | null {
    return this._session;
  }

  get elapsedSeconds(): number {
    if (!this._session) { return 0; }
    return Math.floor((Date.now() - this._session.startTime.getTime()) / 1000);
  }

  start(ticketId: string, branchName: string, comment: string = '', activityTypeId?: string): void {
    if (this._session) {
      this.stop();
    }
    this._session = { ticketId, branchName, startTime: new Date(), comment, activityTypeId };
    this._tickInterval = setInterval(() => this._updateStatusBar(), 1000);
    this._updateStatusBar();
    this._onSessionChange.fire(this._session);
  }

  stop(): TimerSession | null {
    const session = this._session;
    this._session = null;
    if (this._tickInterval) {
      clearInterval(this._tickInterval);
      this._tickInterval = null;
    }
    this._updateStatusBar();
    this._onSessionChange.fire(null);
    return session;
  }

  private _updateStatusBar(): void {
    if (!this._session) {
      this._statusBarItem.text = '$(clock) 7pace';
      this._statusBarItem.tooltip = 'Click to open 7pace Time Tracker';
      this._statusBarItem.backgroundColor = undefined;
      return;
    }

    const elapsed = this.elapsedSeconds;
    const timeStr = formatDuration(elapsed);
    this._statusBarItem.text = `$(debug-stop) ${this._session.ticketId} — ${timeStr}`;
    this._statusBarItem.tooltip = `7pace: Tracking #${this._session.ticketId} (${this._session.branchName})\nClick to open panel`;
    this._statusBarItem.backgroundColor = new vscode.ThemeColor(
      'statusBarItem.warningBackground'
    );
  }

  dispose(): void {
    if (this._tickInterval) { clearInterval(this._tickInterval); }
    this._statusBarItem.dispose();
    this._onSessionChange.dispose();
  }
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}h ${m.toString().padStart(2, '0')}m`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}
