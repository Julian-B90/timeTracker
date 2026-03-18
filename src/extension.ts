import * as vscode from 'vscode';
import { TimerManager } from './timerManager';
import { TrackerPanelProvider } from './panelProvider';
import { getCurrentBranchInfo, watchBranchChanges } from './gitHelper';
import { logTimeEntry, isConfigured, testConnection, startTracking, stopTracking } from './apiClient';

let timer: TimerManager;
let panelProvider: TrackerPanelProvider;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  timer = new TimerManager();
  panelProvider = new TrackerPanelProvider(context.extensionUri, timer);

  // Register the sidebar webview
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      TrackerPanelProvider.viewType,
      panelProvider
    )
  );

  // ── Commands ──────────────────────────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand('timeTracker.startTimer', async (data?: any) => {
      if (timer.isRunning) {
        const answer = await vscode.window.showWarningMessage(
          `Timer already running for #${timer.session!.ticketId}. Stop and restart?`,
          'Yes', 'No'
        );
        if (answer !== 'Yes') { return; }
        timer.stop();
      }

      let ticketId = data?.ticketId;
      let comment = data?.comment || '';
      const activityTypeId = data?.activityTypeId || '';

      if (!ticketId) {
        const branchInfo = await getCurrentBranchInfo();
        ticketId = branchInfo?.ticketId || '';
      }

      if (!ticketId) {
        ticketId = await vscode.window.showInputBox({
          prompt: 'Enter ticket / work item ID',
          placeHolder: '123456',
        });
        if (!ticketId) { return; }
      }

      if (!comment) {
        comment = await vscode.window.showInputBox({
          prompt: 'Comment (optional)',
          placeHolder: 'What are you working on?',
        }) || '';
      }

      const branchInfo = await getCurrentBranchInfo();
      timer.start(ticketId, branchInfo?.branchName || '', comment, activityTypeId || undefined);
      vscode.window.setStatusBarMessage(`timeTracker: Timer started for #${ticketId}`, 3000);
      startTracking(ticketId, comment, activityTypeId || undefined).catch(() => { /* silent */ });
      panelProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('timeTracker.stopTimer', async () => {
      if (!timer.isRunning) {
        vscode.window.showInformationMessage('timeTracker: No timer is running.');
        return;
      }

      const session = timer.stop();
      if (!session) { return; }

      const elapsed = Math.floor(
        (Date.now() - session.startTime.getTime()) / 1000
      );

      const msg = `Stopped timer for #${session.ticketId} — ${formatDurationShort(elapsed)}. Log this time?`;
      const answer = await vscode.window.showInformationMessage(msg, 'Log', 'Discard');

      if (answer === 'Log') {
        if (!isConfigured()) {
          await vscode.commands.executeCommand('timeTracker.configure');
          return;
        }

        const ok = await stopTracking();

        if (ok) {
          vscode.window.showInformationMessage(
            `✓ timeTracker: Logged ${formatDurationShort(elapsed)} for #${session.ticketId}`
          );
        }
      }

      panelProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('timeTracker.logTime', async (data?: any) => {
      if (!isConfigured()) {
        await vscode.commands.executeCommand('timeTracker.configure');
        return;
      }

      let ticketId = data?.ticket;
      let durationStr = data?.duration;
      let dateStr = data?.date;
      let comment = data?.comment || '';
      const activityTypeId = data?.activityTypeId || '';

      if (!ticketId) {
        const branch = await getCurrentBranchInfo();
        ticketId = await vscode.window.showInputBox({
          prompt: 'Enter ticket / work item ID',
          value: branch?.ticketId || '',
          placeHolder: '123456',
        });
        if (!ticketId) { return; }
      }

      if (!durationStr) {
        durationStr = await vscode.window.showInputBox({
          prompt: 'Duration (e.g. 1h 30m, 45m, 2h)',
          placeHolder: '1h 30m',
        });
        if (!durationStr) { return; }
      }

      const seconds = parseDuration(durationStr);
      if (seconds <= 0) {
        vscode.window.showErrorMessage(`timeTracker: Could not parse duration "${durationStr}"`);
        return;
      }

      if (!comment && !data) {
        comment = await vscode.window.showInputBox({
          prompt: 'Comment (optional)',
          placeHolder: 'What did you work on?',
        }) || '';
      }

      const date = dateStr || new Date().toISOString();
      const ok = await logTimeEntry({ workItemId: ticketId, date, length: seconds, comment, activityTypeId: activityTypeId || undefined });
      if (ok) {
        vscode.window.showInformationMessage(
          `✓ timeTracker: Logged ${formatDurationShort(seconds)} for #${ticketId}`
        );
        panelProvider.refresh();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('timeTracker.configure', async () => {
      await vscode.commands.executeCommand(
        'workbench.action.openSettings',
        'timeTracker'
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('timeTracker.testConnection', async () => {
      const result = await testConnection();
      if (result.ok) {
        vscode.window.showInformationMessage(`TimeTracker: ${result.message}`);
      } else {
        vscode.window.showErrorMessage(`TimeTracker: ${result.message}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('timeTracker.showPanel', async () => {
      await vscode.commands.executeCommand('timeTracker.mainView.focus');
    })
  );

  // ── Branch watcher ────────────────────────────────────────────────────────
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (workspaceFolders && workspaceFolders.length > 0) {
    const rootPath = workspaceFolders[0].uri.fsPath;
    const watcher = watchBranchChanges(rootPath, (branchInfo) => {
      if (branchInfo.ticketId && !timer.isRunning) {
        vscode.window.setStatusBarMessage(
          `timeTracker: Branch → #${branchInfo.ticketId} detected`,
          4000
        );
      }
      panelProvider.refresh();
    });
    context.subscriptions.push(watcher);
  }

  // Initial check: prompt if not configured
  if (!isConfigured()) {
    vscode.window.showInformationMessage(
      'timeTracker Tracker: Please configure your API token and organization URL.',
      'Open Settings'
    ).then(answer => {
      if (answer === 'Open Settings') {
        vscode.commands.executeCommand('timeTracker.configure');
      }
    });
  }

  context.subscriptions.push(timer);
}

export function deactivate() {
  if (timer?.isRunning) {
    timer.stop();
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function parseDuration(input: string): number {
  let seconds = 0;
  const hoursMatch = input.match(/(\d+(?:\.\d+)?)\s*h/i);
  const minutesMatch = input.match(/(\d+(?:\.\d+)?)\s*m/i);
  const secondsMatch = input.match(/(\d+(?:\.\d+)?)\s*s/i);

  if (hoursMatch) { seconds += parseFloat(hoursMatch[1]) * 3600; }
  if (minutesMatch) { seconds += parseFloat(minutesMatch[1]) * 60; }
  if (secondsMatch) { seconds += parseFloat(secondsMatch[1]); }

  // Plain number → assume minutes
  if (!hoursMatch && !minutesMatch && !secondsMatch) {
    const plain = parseFloat(input);
    if (!isNaN(plain)) { seconds = plain * 60; }
  }

  return Math.round(seconds);
}

function formatDurationShort(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0 && m > 0) { return `${h}h ${m}m`; }
  if (h > 0) { return `${h}h`; }
  return `${m}m`;
}
