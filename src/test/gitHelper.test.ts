import * as assert from 'assert';
import { extractTicketId } from '../gitHelper';

// extractTicketId reads vscode.workspace.getConfiguration('timeTracker').branchPattern.
// In the test environment no config is set, so it falls back to the default pattern:
//   (?:feature|bugfix|hotfix|fix|task)[/\\](\d+)
// and then to the first sequence of 4+ digits.

suite('extractTicketId – default pattern', () => {
  test('feature/<id>', () => {
    assert.strictEqual(extractTicketId('feature/12345'), '12345');
  });

  test('bugfix/<id>', () => {
    assert.strictEqual(extractTicketId('bugfix/6789'), '6789');
  });

  test('hotfix/<id>', () => {
    assert.strictEqual(extractTicketId('hotfix/1001'), '1001');
  });

  test('fix/<id>', () => {
    assert.strictEqual(extractTicketId('fix/42000'), '42000');
  });

  test('task/<id>', () => {
    assert.strictEqual(extractTicketId('task/9999'), '9999');
  });

  test('backslash separator', () => {
    assert.strictEqual(extractTicketId('feature\\54321'), '54321');
  });

  test('case-insensitive prefix', () => {
    assert.strictEqual(extractTicketId('Feature/11111'), '11111');
  });
});

suite('extractTicketId – fallback (4+ digit sequence)', () => {
  test('branch with 4-digit number but no prefix', () => {
    assert.strictEqual(extractTicketId('PROJ-1234-some-description'), '1234');
  });

  test('branch with longer number', () => {
    assert.strictEqual(extractTicketId('my-branch-99999'), '99999');
  });

  test('returns first 4+ digit sequence when multiple present', () => {
    assert.strictEqual(extractTicketId('branch-1234-and-5678'), '1234');
  });
});

suite('extractTicketId – no match', () => {
  test('main returns null', () => {
    assert.strictEqual(extractTicketId('main'), null);
  });

  test('develop returns null', () => {
    assert.strictEqual(extractTicketId('develop'), null);
  });

  test('short numbers (< 4 digits) return null', () => {
    assert.strictEqual(extractTicketId('branch-42'), null);
  });

  test('empty string returns null', () => {
    assert.strictEqual(extractTicketId(''), null);
  });
});
