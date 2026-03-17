import * as vscode from 'vscode';

export interface TimeEntry {
  id?: string;
  workItemId: string;
  date: string;       // ISO string
  length: number;     // seconds
  comment?: string;
}

export interface WorkItem {
  id: string;
  title: string;
  type?: string;
  state?: string;
  url?: string;
}

function getConfig() {
  const cfg = vscode.workspace.getConfiguration('7pace-tracker');
  return {
    apiToken: cfg.get<string>('apiToken') || '',
    orgUrl: cfg.get<string>('organizationUrl') || '',
    project: cfg.get<string>('project') || '',
  };
}

function buildHeaders(apiToken: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiToken}`,
  };
}

/**
 * 7pace Timetracker REST API v2
 * Docs: https://www.7pace.com/api-docs
 */
export async function logTimeEntry(entry: TimeEntry): Promise<boolean> {
  const { apiToken, orgUrl, project } = getConfig();

  if (!apiToken || !orgUrl || !project) {
    vscode.window.showErrorMessage(
      '7pace: Missing configuration. Run "7pace: Configure Settings" first.'
    );
    return false;
  }

  // 7pace API endpoint
  const url = `${orgUrl}/${project}/_apis/7pace/timetracking/entries?api-version=7pace`;

  const body = {
    workItemId: parseInt(entry.workItemId, 10),
    date: entry.date,
    length: entry.length,
    comment: entry.comment || '',
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(apiToken),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text}`);
    }

    return true;
  } catch (err: any) {
    vscode.window.showErrorMessage(`7pace: Failed to log time — ${err.message}`);
    return false;
  }
}

export async function getRecentEntries(): Promise<TimeEntry[]> {
  const { apiToken, orgUrl, project } = getConfig();
  if (!apiToken || !orgUrl || !project) { return []; }

  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

  const url = `${orgUrl}/${project}/_apis/7pace/timetracking/entries?from=${weekAgo}&to=${today}&api-version=7pace`;

  try {
    const response = await fetch(url, {
      headers: buildHeaders(apiToken),
    });
    if (!response.ok) { return []; }
    const data: any = await response.json();
    return (data.value || data || []).map((e: any) => ({
      id: e.id,
      workItemId: String(e.workItemId),
      date: e.date,
      length: e.length,
      comment: e.comment,
    }));
  } catch {
    return [];
  }
}

export async function getWorkItem(ticketId: string): Promise<WorkItem | null> {
  const { apiToken, orgUrl, project } = getConfig();
  if (!apiToken || !orgUrl || !project) { return null; }

  const url = `${orgUrl}/${project}/_apis/wit/workitems/${ticketId}?api-version=7.0`;

  try {
    const response = await fetch(url, {
      headers: buildHeaders(apiToken),
    });
    if (!response.ok) { return null; }
    const data: any = await response.json();
    return {
      id: String(data.id),
      title: data.fields?.['System.Title'] || `Work Item ${ticketId}`,
      type: data.fields?.['System.WorkItemType'],
      state: data.fields?.['System.State'],
      url: data._links?.html?.href,
    };
  } catch {
    return null;
  }
}

export function isConfigured(): boolean {
  const { apiToken, orgUrl, project } = getConfig();
  return Boolean(apiToken && orgUrl && project);
}
