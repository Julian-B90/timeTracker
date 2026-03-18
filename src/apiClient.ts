import * as vscode from 'vscode';

export interface ActivityType {
  id: string;
  name: string;
  color?: string;
  isDefault?: boolean;
  isNotSet?: boolean;
}

export interface ActivityTypeSettings {
  enabled: boolean;
  activityTypes: ActivityType[];
}

export interface TimeEntry {
  id?: string;
  workItemId: string;
  date: string;       // ISO string
  length: number;     // seconds
  comment?: string;
  activityTypeId?: string;
  activityTypeName?: string;
}

export interface WorkItem {
  id: string;
  title: string;
  type?: string;
  state?: string;
  url?: string;
}

function getConfig() {
  const cfg = vscode.workspace.getConfiguration('timeTracker');
  return {
    apiToken: cfg.get<string>('apiToken') || '',
    instanceUrl: cfg.get<string>('instanceUrl')?.replace(/\/$/, '') || '',
  };
}

function buildHeaders(apiToken: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiToken}`,
  };
}

export function isConfigured(): boolean {
  const { apiToken, instanceUrl } = getConfig();
  return Boolean(apiToken && instanceUrl);
}

export async function testConnection(): Promise<{ ok: boolean; message: string }> {
  const { apiToken, instanceUrl } = getConfig();
  if (!apiToken || !instanceUrl) {
    return { ok: false, message: 'Configuration incomplete — set apiToken and instanceUrl first.' };
  }
  const url = `${instanceUrl}/api/rest/me?api-version=3.2`;
  try {
    const response = await fetch(url, { headers: buildHeaders(apiToken) });
    if (response.ok) {
      return { ok: true, message: 'Connection successful.' };
    }
    const text = await response.text();
    return { ok: false, message: `HTTP ${response.status}: ${text.slice(0, 120)}` };
  } catch (err: unknown) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function logTimeEntry(entry: TimeEntry): Promise<boolean> {
  const { apiToken, instanceUrl } = getConfig();

  if (!apiToken || !instanceUrl) {
    vscode.window.showErrorMessage(
      'timeTracker: Missing configuration. Run "timeTracker: Configure Settings" first.'
    );
    return false;
  }

  const url = `${instanceUrl}/api/rest/workLogs?api-version=3.2`;

  const body: Record<string, unknown> = {
    workItemId: parseInt(entry.workItemId, 10),
    timestamp: entry.date,
    length: entry.length,
    remark: entry.comment || '',
  };
  if (entry.activityTypeId) {
    body.activityTypeId = entry.activityTypeId;
  }

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
  const { apiToken, instanceUrl } = getConfig();
  if (!apiToken || !instanceUrl) { return []; }

  const today = new Date().toISOString();
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  const url = `${instanceUrl}/api/rest/workLogs?_fromTimestamp=${weekAgo}&_toTimestamp=${today}&api-version=3.2`;

  try {
    const response = await fetch(url, {
      headers: buildHeaders(apiToken),
    });
    if (!response.ok) { return []; }
    const data: any = await response.json();
    const entries = data?.data?.value || data?.data || [];
    return entries.map((e: any) => ({
      id: e.id,
      workItemId: String(e.workItemId),
      date: e.timestamp,
      length: e.length,
      comment: e.remark,
      activityTypeId: e.activityTypeId ? String(e.activityTypeId) : undefined,
      activityTypeName: typeof e.activityTypeName === 'string'
        ? e.activityTypeName
        : typeof e.activityType?.name === 'string'
          ? e.activityType.name
          : undefined,
    }));
  } catch {
    return [];
  }
}

export async function getWorkItem(ticketId: string): Promise<WorkItem | null> {
  const { apiToken, instanceUrl } = getConfig();
  if (!apiToken || !instanceUrl) { return null; }

  const url = `${instanceUrl}/api/tracking/client/search?api-version=3.2`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(apiToken),
      body: JSON.stringify({ query: ticketId }),
    });
    if (!response.ok) { return null; }
    const data: any = await response.json();
    const items: any[] = data?.data ?? data ?? [];
    const match = items.find((item: any) => String(item.id) === String(ticketId));
    if (!match) { return null; }
    return {
      id: String(match.id),
      title: match.title || `Work Item ${ticketId}`,
      type: match.workItemType,
      state: match.state,
    };
  } catch {
    return null;
  }
}

export async function startTracking(workItemId: string, comment?: string, activityTypeId?: string): Promise<boolean> {
  const { apiToken, instanceUrl } = getConfig();
  if (!apiToken || !instanceUrl) { return false; }

  const url = `${instanceUrl}/api/tracking/client/startTracking?api-version=3.2`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(apiToken),
      body: JSON.stringify({
        workItemId: parseInt(workItemId, 10),
        remark: comment || '',
        ...(activityTypeId ? { activityTypeId } : {}),
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function mapActivityType(activityType: any, defaultActivityTypeId?: string): ActivityType {
  return {
    id: String(activityType.id),
    name: String(activityType.name),
    color: typeof activityType.color === 'string' ? activityType.color : undefined,
    isDefault: Boolean(activityType.isDefault) || String(activityType.id) === defaultActivityTypeId,
    isNotSet: Boolean(activityType.isNotSet),
  };
}

export async function getActivityTypeSettings(): Promise<ActivityTypeSettings> {
  const { apiToken, instanceUrl } = getConfig();
  if (!apiToken || !instanceUrl) {
    return { enabled: false, activityTypes: [] };
  }

  const url = `${instanceUrl}/api/rest/activityTypes?api-version=3.2`;

  try {
    const response = await fetch(url, { headers: buildHeaders(apiToken) });
    if (!response.ok) {
      return { enabled: false, activityTypes: [] };
    }
    const data: any = await response.json();
    const defaultActivityTypeId = typeof data?.data?.systemDefaultActivityTypeId === 'string'
      ? data.data.systemDefaultActivityTypeId
      : undefined;
    const items = data?.data?.activityTypes ?? data?.data?.value ?? data?.data;
    if (!Array.isArray(items)) {
      return { enabled: false, activityTypes: [] };
    }
    return {
      enabled: Boolean(data?.data?.enabled),
      activityTypes: items.map((activityType: any) => mapActivityType(activityType, defaultActivityTypeId)),
    };
  } catch {
    return { enabled: false, activityTypes: [] };
  }
}

export async function getActivityTypes(): Promise<ActivityType[]> {
  const activityTypeSettings = await getActivityTypeSettings();
  return activityTypeSettings.activityTypes;
}

export async function stopTracking(): Promise<boolean> {
  const { apiToken, instanceUrl } = getConfig();
  if (!apiToken || !instanceUrl) { return false; }

  const url = `${instanceUrl}/api/tracking/client/stopTracking/manual?api-version=3.2`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(apiToken),
      body: JSON.stringify({}),
    });
    return response.ok;
  } catch {
    return false;
  }
}
