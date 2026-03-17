import * as vscode from 'vscode';
import { TimerManager, formatDuration } from './timerManager';
import { getCurrentBranchInfo } from './gitHelper';
import { getRecentEntries, TimeEntry } from './apiClient';

export class TrackerPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = '7pace-tracker.mainView';

  private _view?: vscode.WebviewView;
  private _timer: TimerManager;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    timer: TimerManager
  ) {
    this._timer = timer;
    timer.onSessionChange(() => this._refresh());
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) { this._refresh(); }
    });
    webviewView.webview.onDidReceiveMessage(this._handleMessage.bind(this));
    this._refresh();
  }

  private async _refresh() {
    if (!this._view) { return; }
    const branchInfo = await getCurrentBranchInfo();
    const entries = await getRecentEntries();
    this._view.webview.html = getWebviewContent({
      timer: this._timer,
      branchInfo,
      entries,
    });
  }

  private async _handleMessage(message: any) {
    switch (message.command) {
      case 'start':
        await vscode.commands.executeCommand('7pace-tracker.startTimer');
        break;
      case 'stop':
        await vscode.commands.executeCommand('7pace-tracker.stopTimer');
        break;
      case 'log':
        await vscode.commands.executeCommand('7pace-tracker.logTime', message.data);
        break;
      case 'configure':
        await vscode.commands.executeCommand('7pace-tracker.configure');
        break;
      case 'refresh':
        await this._refresh();
        break;
    }
  }

  public refresh() {
    this._refresh();
  }
}

interface WebviewData {
  timer: TimerManager;
  branchInfo: { branchName: string; ticketId: string | null } | null;
  entries: TimeEntry[];
}

function getWebviewContent({ timer, branchInfo, entries }: WebviewData): string {
  const isRunning = timer.isRunning;
  const session = timer.session;
  const elapsed = timer.elapsedSeconds;
  const elapsedStr = formatDuration(elapsed);
  const ticketId = session?.ticketId || branchInfo?.ticketId || '';
  const branch = branchInfo?.branchName || '—';

  const entriesHtml = entries.length === 0
    ? '<p class="empty">No entries in the last 7 days</p>'
    : entries.slice(0, 10).map(e => {
        const d = new Date(e.date).toLocaleDateString();
        const dur = formatDuration(e.length);
        return `
          <div class="entry">
            <span class="entry-ticket">#${e.workItemId}</span>
            <span class="entry-comment">${e.comment || '—'}</span>
            <span class="entry-meta">${d} · ${dur}</span>
          </div>`;
      }).join('');

  return /* html */`
<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>7pace Tracker</title>
<style>
  :root {
    --accent: #0078d4;
    --accent-stop: #d44000;
    --bg: var(--vscode-sideBar-background);
    --fg: var(--vscode-foreground);
    --border: var(--vscode-panel-border);
    --input-bg: var(--vscode-input-background);
    --input-fg: var(--vscode-input-foreground);
    --input-border: var(--vscode-input-border);
    --btn-bg: var(--vscode-button-background);
    --btn-fg: var(--vscode-button-foreground);
    --card: var(--vscode-editor-inactiveSelectionBackground);
    --muted: var(--vscode-descriptionForeground);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--vscode-font-family);
    font-size: 13px;
    color: var(--fg);
    background: var(--bg);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  /* ── Branch Info ── */
  .branch-info {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    background: var(--card);
    border-radius: 6px;
    border-left: 3px solid var(--accent);
    font-size: 12px;
  }
  .branch-icon { font-size: 14px; }
  .branch-name { color: var(--muted); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ticket-badge {
    background: var(--accent);
    color: white;
    padding: 2px 8px;
    border-radius: 12px;
    font-weight: 600;
    font-size: 11px;
    flex-shrink: 0;
  }
  .ticket-badge.none {
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
  }

  /* ── Timer Card ── */
  .timer-card {
    background: var(--card);
    border-radius: 8px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .timer-display {
    text-align: center;
    font-size: 36px;
    font-weight: 700;
    letter-spacing: 2px;
    font-variant-numeric: tabular-nums;
    color: ${isRunning ? 'var(--accent-stop)' : 'var(--fg)'};
    line-height: 1;
  }
  .timer-sub {
    text-align: center;
    font-size: 11px;
    color: var(--muted);
    margin-top: 4px;
  }

  /* ── Form fields ── */
  label { font-size: 11px; color: var(--muted); display: block; margin-bottom: 3px; }
  input, textarea {
    width: 100%;
    background: var(--input-bg);
    color: var(--input-fg);
    border: 1px solid var(--input-border, transparent);
    border-radius: 4px;
    padding: 6px 8px;
    font-family: inherit;
    font-size: 13px;
    outline: none;
  }
  input:focus, textarea:focus {
    border-color: var(--accent);
  }
  textarea { resize: vertical; min-height: 50px; }

  /* ── Buttons ── */
  .btn-row { display: flex; gap: 8px; }
  button {
    flex: 1;
    padding: 8px 12px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    font-family: inherit;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    transition: opacity 0.15s;
  }
  button:hover { opacity: 0.85; }
  button:active { opacity: 0.7; }

  .btn-start {
    background: var(--accent);
    color: white;
  }
  .btn-stop {
    background: var(--accent-stop);
    color: white;
  }
  .btn-log {
    background: #107c10;
    color: white;
  }
  .btn-secondary {
    background: var(--vscode-button-secondaryBackground, #3c3c3c);
    color: var(--vscode-button-secondaryForeground, #fff);
    flex: 0 0 auto;
    padding: 8px 10px;
  }

  /* ── Log time form ── */
  .log-form {
    background: var(--card);
    border-radius: 8px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .log-form h3 {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--muted);
  }
  .field-row { display: flex; gap: 8px; }
  .field-row > div { flex: 1; }

  /* ── Recent entries ── */
  .entries-section h3 {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--muted);
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .entry {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 6px;
    align-items: center;
    padding: 7px 0;
    border-bottom: 1px solid var(--border, rgba(255,255,255,0.05));
    font-size: 12px;
  }
  .entry:last-child { border-bottom: none; }
  .entry-ticket {
    font-weight: 600;
    color: var(--accent);
    min-width: 50px;
  }
  .entry-comment {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--muted);
  }
  .entry-meta {
    font-size: 11px;
    color: var(--muted);
    white-space: nowrap;
    text-align: right;
  }
  .empty { color: var(--muted); font-size: 12px; text-align: center; padding: 12px 0; }

  .refresh-btn {
    background: none;
    border: none;
    color: var(--muted);
    cursor: pointer;
    font-size: 11px;
    padding: 0;
    flex: 0;
  }
  .status-dot {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: ${isRunning ? '#d44000' : '#666'};
    margin-right: 4px;
    ${isRunning ? 'animation: pulse 1.2s infinite;' : ''}
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }
</style>
</head>
<body>

<!-- Branch Info -->
<div class="branch-info">
  <span class="branch-icon">⎇</span>
  <span class="branch-name" title="${branch}">${branch}</span>
  ${ticketId
    ? `<span class="ticket-badge">#${ticketId}</span>`
    : `<span class="ticket-badge none">No ticket</span>`}
</div>

<!-- Timer -->
<div class="timer-card">
  <div>
    <div class="timer-display">
      <span class="status-dot"></span>${isRunning ? elapsedStr : '00:00'}
    </div>
    <div class="timer-sub">
      ${isRunning
        ? `Tracking #${session!.ticketId} since ${session!.startTime.toLocaleTimeString()}`
        : 'Timer stopped'}
    </div>
  </div>

  <div>
    <label>Ticket / Work Item ID</label>
    <input id="ticketId" type="text" placeholder="e.g. 123456" value="${ticketId}">
  </div>
  <div>
    <label>Comment</label>
    <input id="timerComment" type="text" placeholder="Optional comment..."
      value="${isRunning ? session!.comment : ''}">
  </div>

  <div class="btn-row">
    ${isRunning
      ? `<button class="btn-stop" onclick="stopTimer()">⏹ Stop &amp; Log</button>`
      : `<button class="btn-start" onclick="startTimer()">▶ Start Timer</button>`}
    <button class="btn-secondary" onclick="configure()" title="Settings">⚙</button>
  </div>
</div>

<!-- Manual Log -->
<div class="log-form">
  <h3>📋 Manual Entry</h3>
  <div class="field-row">
    <div>
      <label>Ticket ID</label>
      <input id="logTicket" type="text" placeholder="123456" value="${ticketId}">
    </div>
    <div>
      <label>Duration (e.g. 1h 30m)</label>
      <input id="logDuration" type="text" placeholder="1h 30m">
    </div>
  </div>
  <div>
    <label>Date</label>
    <input id="logDate" type="date" value="${new Date().toISOString().split('T')[0]}">
  </div>
  <div>
    <label>Comment</label>
    <input id="logComment" type="text" placeholder="What did you work on?">
  </div>
  <div class="btn-row">
    <button class="btn-log" onclick="logManual()">✓ Log Time</button>
  </div>
</div>

<!-- Recent Entries -->
<div class="entries-section">
  <h3>Recent (7 days) <button class="refresh-btn" onclick="refresh()">↻ Refresh</button></h3>
  ${entriesHtml}
</div>

<script>
  const vscode = acquireVsCodeApi();

  function startTimer() {
    const ticketId = document.getElementById('ticketId').value.trim();
    const comment = document.getElementById('timerComment').value.trim();
    if (!ticketId) { alert('Please enter a ticket ID'); return; }
    vscode.postMessage({ command: 'start', data: { ticketId, comment } });
  }

  function stopTimer() {
    const comment = document.getElementById('timerComment').value.trim();
    vscode.postMessage({ command: 'stop', data: { comment } });
  }

  function logManual() {
    const ticket = document.getElementById('logTicket').value.trim();
    const duration = document.getElementById('logDuration').value.trim();
    const date = document.getElementById('logDate').value;
    const comment = document.getElementById('logComment').value.trim();
    if (!ticket) { alert('Please enter a ticket ID'); return; }
    if (!duration) { alert('Please enter a duration'); return; }
    vscode.postMessage({ command: 'log', data: { ticket, duration, date, comment } });
  }

  function configure() {
    vscode.postMessage({ command: 'configure' });
  }

  function refresh() {
    vscode.postMessage({ command: 'refresh' });
  }
</script>
</body>
</html>`;
}
