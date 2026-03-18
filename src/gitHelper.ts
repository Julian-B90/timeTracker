import * as vscode from 'vscode';

// Minimal subset of the VS Code Git extension API used by this module.
interface GitExtension {
  getAPI(version: 1): GitAPI;
}

interface GitAPI {
  readonly repositories: Repository[];
}

interface Repository {
  readonly state: RepositoryState;
}

interface RepositoryState {
  readonly HEAD: Branch | undefined;
  readonly onDidChange: vscode.Event<void>;
}

interface Branch {
  readonly name?: string;
}

export interface BranchInfo {
  branchName: string;
  ticketId: string | null;
}

async function getGitAPI(): Promise<GitAPI | undefined> {
  const extension = vscode.extensions.getExtension<GitExtension>('vscode.git');
  if (!extension) { return undefined; }
  if (!extension.isActive) {
    await extension.activate();
  }
  return extension.exports.getAPI(1);
}

export async function getCurrentBranchInfo(): Promise<BranchInfo | null> {
  const git = await getGitAPI();
  const repo = git?.repositories[0];
  if (!repo) { return null; }

  const branchName = repo.state.HEAD?.name;
  if (!branchName) {
    return { branchName: 'HEAD', ticketId: null };
  }

  const ticketId = extractTicketId(branchName);
  return { branchName, ticketId };
}

export function extractTicketId(branchName: string): string | null {
  const config = vscode.workspace.getConfiguration('timeTracker');
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
  _workspaceRoot: string,
  onChange: (info: BranchInfo) => void
): vscode.Disposable {
  const extension = vscode.extensions.getExtension<GitExtension>('vscode.git');
  if (!extension?.isActive) {
    return new vscode.Disposable(() => { /* git extension not active */ });
  }

  const repo = extension.exports.getAPI(1).repositories[0];
  if (!repo) {
    return new vscode.Disposable(() => { /* no repository open */ });
  }

  return repo.state.onDidChange(async () => {
    const info = await getCurrentBranchInfo();
    if (info) {
      onChange(info);
    }
  });
}
