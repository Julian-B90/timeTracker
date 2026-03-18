import * as vscode from 'vscode';
import { TimerManager, formatDuration } from './timerManager';
import { getCurrentBranchInfo } from './gitHelper';
import { getRecentEntries, getActivityTypeSettings, TimeEntry, ActivityType } from './apiClient';

export class TrackerPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'timeTracker.mainView';

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
    const [entries, activityTypeSettings] = await Promise.all([
      getRecentEntries(),
      getActivityTypeSettings(),
    ]);
    this._view.webview.html = getWebviewContent({
      timer: this._timer,
      branchInfo,
      entries,
      activityTypes: activityTypeSettings.activityTypes,
      activityTypesEnabled: activityTypeSettings.enabled,
    });
  }

  private async _handleMessage(message: any) {
    switch (message.command) {
      case 'start':
        await vscode.commands.executeCommand('timeTracker.startTimer', message.data);
        break;
      case 'stop':
        await vscode.commands.executeCommand('timeTracker.stopTimer');
        break;
      case 'log':
        await vscode.commands.executeCommand('timeTracker.logTime', message.data);
        break;
      case 'configure':
        await vscode.commands.executeCommand('timeTracker.configure');
        break;
      case 'test':
        await vscode.commands.executeCommand('timeTracker.testConnection');
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
  activityTypes: ActivityType[];
  activityTypesEnabled: boolean;
}

function getSelectedActivity(activityTypes: ActivityType[], activityTypeId?: string): ActivityType | undefined {
  if (!activityTypeId) { return undefined; }
  return activityTypes.find((activityType) => activityType.id === activityTypeId);
}

function getDefaultActivity(activityTypes: ActivityType[]): ActivityType | undefined {
  return activityTypes.find((activityType) => activityType.isDefault);
}

function renderActivityOptions(activityTypes: ActivityType[], selectedActivityId: string): string {
  return activityTypes.map((activityType) => {
    const selected = activityType.id === selectedActivityId ? ' selected' : '';
    const suffix = activityType.isDefault ? ' (default)' : '';
    const style = activityType.color ? ` style="color:${activityType.color}"` : '';
    return `<option value="${activityType.id}"${selected}${style}>${activityType.name}${suffix}</option>`;
  }).join('');
}

function renderActivityHint(activityType?: ActivityType): string {
  if (!activityType) { return ''; }

  return `
    <div class="activity-hint">
      <span class="activity-color"${activityType.color ? ` style="background:${activityType.color}"` : ''}></span>
      <span>${activityType.name}${activityType.isDefault ? ' · Default activity' : ''}</span>
    </div>`;
}

function getEntryActivity(activityTypes: ActivityType[], entry: TimeEntry): { name: string; color?: string } | undefined {
  if (entry.activityTypeName) {
    const matchedActivity = entry.activityTypeId
      ? activityTypes.find((activityType) => activityType.id === entry.activityTypeId)
      : undefined;

    return {
      name: entry.activityTypeName,
      color: matchedActivity?.color,
    };
  }

  if (!entry.activityTypeId) { return undefined; }

  const matchedActivity = activityTypes.find((activityType) => activityType.id === entry.activityTypeId);
  if (!matchedActivity) { return undefined; }

  return {
    name: matchedActivity.name,
    color: matchedActivity.color,
  };
}

function renderActivitySelector(id: string, activityTypes: ActivityType[], selectedActivityId: string, activityTypesEnabled: boolean): string {
  const disabled = !activityTypesEnabled || activityTypes.length === 0;
  const hint = !activityTypesEnabled
    ? '<div class="activity-disabled-note">Activity types are disabled in 7pace.</div>'
    : activityTypes.length === 0
      ? '<div class="activity-disabled-note">No activity types available.</div>'
      : renderActivityHint(getSelectedActivity(activityTypes, selectedActivityId));

  return `
    <select id="${id}"${disabled ? ' disabled' : ''}>
      <option value="">-- none --</option>
      ${renderActivityOptions(activityTypes, selectedActivityId)}
    </select>
    ${hint}`;
}

function getWebviewContent({ timer, branchInfo, entries, activityTypes, activityTypesEnabled }: WebviewData): string {
  const isRunning = timer.isRunning;
  const session = timer.session;
  const elapsed = timer.elapsedSeconds;
  const elapsedStr = formatDuration(elapsed);
  const ticketId = session?.ticketId || branchInfo?.ticketId || '';
  const branch = branchInfo?.branchName || '—';
  const defaultActivity = getDefaultActivity(activityTypes);
  const timerActivityId = session?.activityTypeId || defaultActivity?.id || '';
  const logActivityId = defaultActivity?.id || '';
  const timerActivity = getSelectedActivity(activityTypes, timerActivityId);
  const logActivity = getSelectedActivity(activityTypes, logActivityId);

  const entriesHtml = entries.length === 0
    ? '<p class="empty">No entries in the last 7 days</p>'
    : entries.slice(0, 10).map(e => {
        const d = new Date(e.date).toLocaleDateString();
        const dur = formatDuration(e.length);
        const activity = getEntryActivity(activityTypes, e);
        return `
          <div class="entry">
            <span class="entry-ticket">#${e.workItemId}</span>
            <div class="entry-main">
              <span class="entry-comment">${e.comment || '—'}</span>
              ${activity ? `<span class="entry-activity"><span class="activity-color"${activity.color ? ` style="background:${activity.color}"` : ''}></span>${activity.name}</span>` : ''}
            </div>
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
  input:focus, textarea:focus, select:focus {
    border-color: var(--accent);
  }
  textarea { resize: vertical; min-height: 50px; }
  select {
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
  .activity-hint {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 4px;
    font-size: 11px;
    color: var(--muted);
  }
  .activity-color {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: var(--accent);
    flex: 0 0 auto;
  }

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
  .entry-main {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .entry-activity {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--muted);
  }
  .entry-meta {
    font-size: 11px;
    color: var(--muted);
    white-space: nowrap;
    text-align: right;
  }
  .activity-disabled-note {
    margin-top: 4px;
    font-size: 11px;
    color: var(--muted);
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
        ? `Tracking #${session!.ticketId} since ${session!.startTime.toLocaleTimeString()}${timerActivity ? ` · ${timerActivity.name}` : ''}`
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
  <div>
    <label>Activity Type</label>
    ${renderActivitySelector('timerActivity', activityTypes, timerActivityId, activityTypesEnabled)}
  </div>

  <div id="timerError" style="color:var(--vscode-inputValidation-errorForeground,#f48771);font-size:11px;margin-top:2px;display:none"></div>
  <div class="btn-row">
    ${isRunning
      ? `<button class="btn-stop" onclick="stopTimer()">⏹ Stop &amp; Log</button>`
      : `<button class="btn-start" onclick="startTimer()">▶ Start Timer</button>`}
    <button class="btn-secondary" onclick="configure()" title="Settings">⚙</button>
    <button class="btn-secondary" onclick="testConnection()" title="Test Connection">🔗</button>
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
  <div>
    <label>Activity Type</label>
    ${renderActivitySelector('logActivity', activityTypes, logActivityId, activityTypesEnabled)}
  </div>
  <div id="logError" style="color:var(--vscode-inputValidation-errorForeground,#f48771);font-size:11px;margin-top:2px;display:none"></div>
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

  function showError(id, msg) {
    const el = document.getElementById(id);
    if (!msg) { el.style.display = 'none'; el.textContent = ''; return; }
    el.textContent = msg;
    el.style.display = 'block';
  }

  function startTimer() {
    const ticketId = document.getElementById('ticketId').value.trim();
    const comment = document.getElementById('timerComment').value.trim();
    const activityTypeId = document.getElementById('timerActivity').value;
    if (!ticketId) { showError('timerError', 'Please enter a ticket ID'); return; }
    showError('timerError', '');
    vscode.postMessage({ command: 'start', data: { ticketId, comment, activityTypeId } });
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
    const activityTypeId = document.getElementById('logActivity').value;
    if (!ticket) { showError('logError', 'Please enter a ticket ID'); return; }
    if (!duration) { showError('logError', 'Please enter a duration'); return; }
    showError('logError', '');
    vscode.postMessage({ command: 'log', data: { ticket, duration, date, comment, activityTypeId } });
  }

  function configure() {
    vscode.postMessage({ command: 'configure' });
  }

  function testConnection() {
    vscode.postMessage({ command: 'test' });
  }

  function refresh() {
    vscode.postMessage({ command: 'refresh' });
  }
</script>
</body>
</html>`;
}
