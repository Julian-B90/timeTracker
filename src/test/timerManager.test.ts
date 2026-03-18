import * as assert from 'assert';
import { TimerManager, formatDuration, TimerSession } from '../timerManager';

suite('formatDuration', () => {
  test('formats seconds only', () => {
    assert.strictEqual(formatDuration(45), '0:45');
  });

  test('pads seconds with leading zero', () => {
    assert.strictEqual(formatDuration(65), '1:05');
  });

  test('formats minutes and seconds', () => {
    assert.strictEqual(formatDuration(3599), '59:59');
  });

  test('formats hours and minutes', () => {
    assert.strictEqual(formatDuration(3600), '1h 00m');
  });

  test('formats hours with non-zero minutes', () => {
    assert.strictEqual(formatDuration(5400), '1h 30m');
  });

  test('formats zero', () => {
    assert.strictEqual(formatDuration(0), '0:00');
  });
});

suite('TimerManager', () => {
  let timer: TimerManager;

  setup(() => {
    timer = new TimerManager();
  });

  teardown(() => {
    timer.dispose();
  });

  test('is not running initially', () => {
    assert.strictEqual(timer.isRunning, false);
    assert.strictEqual(timer.session, null);
    assert.strictEqual(timer.elapsedSeconds, 0);
  });

  test('start() sets session and isRunning', () => {
    timer.start('12345', 'feature/12345', 'Test comment', 'dev-id');
    assert.strictEqual(timer.isRunning, true);
    assert.ok(timer.session);
    assert.strictEqual(timer.session!.ticketId, '12345');
    assert.strictEqual(timer.session!.branchName, 'feature/12345');
    assert.strictEqual(timer.session!.comment, 'Test comment');
    assert.strictEqual(timer.session!.activityTypeId, 'dev-id');
  });

  test('start() defaults comment to empty string', () => {
    timer.start('99', 'main');
    assert.strictEqual(timer.session!.comment, '');
    assert.strictEqual(timer.session!.activityTypeId, undefined);
  });

  test('start() sets startTime close to now', () => {
    const before = Date.now();
    timer.start('1', 'branch');
    const after = Date.now();
    assert.ok(timer.session!.startTime.getTime() >= before);
    assert.ok(timer.session!.startTime.getTime() <= after);
  });

  test('stop() returns the session and clears state', () => {
    timer.start('42', 'hotfix/42', 'hotfix');
    const session = timer.stop();

    assert.ok(session);
    assert.strictEqual(session!.ticketId, '42');
    assert.strictEqual(timer.isRunning, false);
    assert.strictEqual(timer.session, null);
    assert.strictEqual(timer.elapsedSeconds, 0);
  });

  test('stop() returns null when not running', () => {
    const session = timer.stop();
    assert.strictEqual(session, null);
  });

  test('start() while running stops previous session', () => {
    timer.start('111', 'branch-a');
    timer.start('222', 'branch-b');
    assert.strictEqual(timer.session!.ticketId, '222');
    assert.strictEqual(timer.isRunning, true);
  });

  test('onSessionChange fires on start', (done) => {
    timer.onSessionChange((s: TimerSession | null) => {
      assert.ok(s);
      assert.strictEqual(s!.ticketId, '7');
      done();
    });
    timer.start('7', 'branch');
  });

  test('onSessionChange fires null on stop', (done) => {
    timer.start('8', 'branch');
    // Listen after start to only catch the stop event
    const disposable = timer.onSessionChange((s: TimerSession | null) => {
      if (s === null) {
        disposable.dispose();
        done();
      }
    });
    timer.stop();
  });

  test('elapsedSeconds is >= 0 when running', async () => {
    timer.start('5', 'branch');
    await new Promise(r => setTimeout(r, 50));
    assert.ok(timer.elapsedSeconds >= 0);
  });
});
