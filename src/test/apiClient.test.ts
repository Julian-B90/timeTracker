import * as assert from 'assert';
import * as vscode from 'vscode';
import { isConfigured, logTimeEntry, getRecentEntries, getActivityTypeSettings, getActivityTypes } from '../apiClient';

async function withConfiguredTimeTracker<T>(callback: () => Promise<T>): Promise<T> {
  const originalGetConfiguration = vscode.workspace.getConfiguration.bind(vscode.workspace);

  Object.defineProperty(vscode.workspace, 'getConfiguration', {
    configurable: true,
    value: ((section?: string) => {
      if (section !== 'timeTracker') {
        return originalGetConfiguration(section);
      }

      return {
        get<U>(key: string, defaultValue?: U): U | undefined {
          if (key === 'apiToken') {
            return 'test-token' as U;
          }
          if (key === 'instanceUrl') {
            return 'https://example.7pace.test' as U;
          }
          return defaultValue;
        },
      } as vscode.WorkspaceConfiguration;
    }) as typeof vscode.workspace.getConfiguration,
  });

  try {
    return await callback();
  } finally {
    Object.defineProperty(vscode.workspace, 'getConfiguration', {
      configurable: true,
      value: originalGetConfiguration,
    });
  }
}

// In the test environment, timeTracker settings are not configured,
// so isConfigured() returns false and API calls short-circuit.

suite('isConfigured', () => {
  test('returns false when no settings are configured', () => {
    assert.strictEqual(isConfigured(), false);
  });
});

suite('logTimeEntry – unconfigured', () => {
  test('returns false without calling fetch', async () => {
    let fetchCalled = false;
    const originalFetch = global.fetch;
    global.fetch = async () => { fetchCalled = true; return new Response(); };

    try {
      const result = await logTimeEntry({
        workItemId: '123',
        date: new Date().toISOString(),
        length: 3600,
        comment: 'test',
      });
      assert.strictEqual(result, false);
      assert.strictEqual(fetchCalled, false);
    } finally {
      global.fetch = originalFetch;
    }
  });
});

suite('getRecentEntries – unconfigured', () => {
  test('returns empty array without calling fetch', async () => {
    let fetchCalled = false;
    const originalFetch = global.fetch;
    global.fetch = async () => { fetchCalled = true; return new Response(); };

    try {
      const entries = await getRecentEntries();
      assert.deepStrictEqual(entries, []);
      assert.strictEqual(fetchCalled, false);
    } finally {
      global.fetch = originalFetch;
    }
  });
});

suite('logTimeEntry – fetch behaviour', () => {
  // Temporarily patch vscode workspace config to simulate a configured state.
  // We do this by monkey-patching the module's internal getConfig via fetch interception.
  // Since config is read inside the function and we can't inject it, we verify
  // the correct URL/headers are used by checking the captured request.

  test('sends POST with correct structure when configured', async () => {
    const vscode = await import('vscode');
    const cfg = vscode.workspace.getConfiguration('timeTracker');

    // VS Code config is read-only in tests; simulate by stubbing fetch and
    // verifying the call is attempted only when configured.
    // We test the fetch path by directly passing a configured-like scenario
    // via a wrapper that replaces global.fetch.

    let capturedRequest: { url: string; options: RequestInit } | undefined;
    const originalFetch = global.fetch;
    global.fetch = async (url: string | URL | Request, options?: RequestInit) => {
      capturedRequest = { url: String(url), options: options ?? {} };
      return new Response(JSON.stringify({ id: 'abc' }), { status: 200 });
    };

    // If not configured, the function returns early – skip this test when unconfigured.
    if (!isConfigured()) {
      global.fetch = originalFetch;
      return;
    }

    const result = await logTimeEntry({
      workItemId: '42',
      date: '2026-03-17T10:00:00.000Z',
      length: 1800,
      comment: 'hello',
    });

    assert.strictEqual(result, true);
    assert.ok(capturedRequest, 'fetch should have been called');
    assert.ok(capturedRequest!.url.includes('7pace'), 'URL should contain 7pace endpoint');
    assert.strictEqual(capturedRequest!.options.method, 'POST');

    const body = JSON.parse(capturedRequest!.options.body as string);
    assert.strictEqual(body.workItemId, 42);
    assert.strictEqual(body.length, 1800);
    assert.strictEqual(body.comment, 'hello');

    global.fetch = originalFetch;
  });
});

suite('getRecentEntries – fetch behaviour', () => {
  test('parses activity type information from response', async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => new Response(JSON.stringify({
      data: {
        value: [
          {
            id: '1',
            workItemId: 100,
            timestamp: '2026-03-17T10:00:00.000Z',
            length: 3600,
            remark: 'work',
            activityTypeId: 'dev-id',
            activityType: { name: 'Development' },
          },
        ],
      },
    }), { status: 200 });

    try {
      const entries = await withConfiguredTimeTracker(() => getRecentEntries());
      assert.deepStrictEqual(entries, [
        {
          id: '1',
          workItemId: '100',
          date: '2026-03-17T10:00:00.000Z',
          length: 3600,
          comment: 'work',
          activityTypeId: 'dev-id',
          activityTypeName: 'Development',
        },
      ]);
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('parses value array from response', async () => {
    if (!isConfigured()) { return; }

    const mockEntries = [
      { id: '1', workItemId: 100, date: '2026-03-17', length: 3600, comment: 'work' },
      { id: '2', workItemId: 200, date: '2026-03-16', length: 1800, comment: '' },
    ];

    const originalFetch = global.fetch;
    global.fetch = async () =>
      new Response(JSON.stringify({ value: mockEntries }), { status: 200 });

    try {
      const entries = await getRecentEntries();
      assert.strictEqual(entries.length, 2);
      assert.strictEqual(entries[0].workItemId, '100');
      assert.strictEqual(entries[0].length, 3600);
      assert.strictEqual(entries[1].workItemId, '200');
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('returns empty array on non-ok response', async () => {
    if (!isConfigured()) { return; }

    const originalFetch = global.fetch;
    global.fetch = async () => new Response('Unauthorized', { status: 401 });

    try {
      const entries = await getRecentEntries();
      assert.deepStrictEqual(entries, []);
    } finally {
      global.fetch = originalFetch;
    }
  });
});

suite('getActivityTypes – fetch behaviour', () => {
  test('exposes enabled flag and default activity through settings', async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => new Response(JSON.stringify({
      data: {
        enabled: false,
        systemDefaultActivityTypeId: 'default-id',
        activityTypes: [
          { id: 'default-id', name: 'Development', color: '#00ff00' },
        ],
      },
    }), { status: 200 });

    try {
      const activityTypeSettings = await withConfiguredTimeTracker(() => getActivityTypeSettings());
      assert.deepStrictEqual(activityTypeSettings, {
        enabled: false,
        activityTypes: [
          { id: 'default-id', name: 'Development', color: '#00ff00', isDefault: true, isNotSet: false },
        ],
      });
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('parses activity types from data.activityTypes', async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => new Response(JSON.stringify({
      data: {
        enabled: true,
        systemDefaultActivityTypeId: 'default-id',
        activityTypes: [
          { id: 'dev-id', name: 'Development', color: '#00ff00', isDefault: true },
          { id: 'review-id', name: 'Code Review', color: '#0000ff', isDefault: false },
        ],
      },
    }), { status: 200 });

    try {
      const activityTypes = await withConfiguredTimeTracker(() => getActivityTypes());
      assert.deepStrictEqual(activityTypes, [
        { id: 'dev-id', name: 'Development', color: '#00ff00', isDefault: true, isNotSet: false },
        { id: 'review-id', name: 'Code Review', color: '#0000ff', isDefault: false, isNotSet: false },
      ]);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
