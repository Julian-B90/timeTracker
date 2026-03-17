import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execAsync = promisify(exec);

export interface BranchInfo {
  branchName: string;
  ticketId: string | null;
}

export async function getCurrentBranchInfo(): Promise<BranchInfo | null> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return null;
  }

  const cwd = workspaceFolders[0].uri.fsPath;

  try {
    const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd });
    const branchName = stdout.trim();

    if (!branchName || branchName === 'HEAD') {
      return { branchName: branchName || 'unknown', ticketId: null };
    }

    const ticketId = extractTicketId(branchName);
    return { branchName, ticketId };
  } catch {
    return null;
  }
}

export function extractTicketId(branchName: string): string | null {
  const config = vscode.workspace.getConfiguration('7pace-tracker');
  const pattern = config.get<string>('branchPattern') || '(?:feature|bugfix|hotfix|fix|task)[/\\\\](\\d+)';

  try {
    const regex = new RegExp(pattern, 'i');
    const match = branchName.match(regex);
    if (match && match[1]) {
      return match[1];
    }
  } catch (e) {
    console.error('Invalid branch pattern regex:', e);
  }

  // Fallback: find first sequence of 4+ digits
  const fallback = branchName.match(/(\d{4,})/);
  return fallback ? fallback[1] : null;
}

export function watchBranchChanges(
  workspaceRoot: string,
  onChange: (info: BranchInfo) => void
): vscode.Disposable {
  const headFile = path.join(workspaceRoot, '.git', 'HEAD');
  const watcher = vscode.workspace.createFileSystemWatcher(headFile);

  const handler = async () => {
    const info = await getCurrentBranchInfo();
    if (info) {
      onChange(info);
    }
  };

  watcher.onDidChange(handler);
  watcher.onDidCreate(handler);

  return watcher;
}
