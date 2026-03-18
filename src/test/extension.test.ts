import * as assert from 'assert';
import { parseDuration } from '../extension';

suite('parseDuration', () => {
  test('parses hours only', () => {
    assert.strictEqual(parseDuration('2h'), 7200);
  });

  test('parses minutes only', () => {
    assert.strictEqual(parseDuration('30m'), 1800);
  });

  test('parses seconds only', () => {
    assert.strictEqual(parseDuration('90s'), 90);
  });

  test('parses hours and minutes', () => {
    assert.strictEqual(parseDuration('1h 30m'), 5400);
  });

  test('parses hours, minutes, and seconds', () => {
    assert.strictEqual(parseDuration('1h 2m 3s'), 3723);
  });

  test('parses decimal hours', () => {
    assert.strictEqual(parseDuration('1.5h'), 5400);
  });

  test('parses decimal minutes', () => {
    assert.strictEqual(parseDuration('0.5m'), 30);
  });

  test('plain number is treated as minutes', () => {
    assert.strictEqual(parseDuration('45'), 2700);
  });

  test('plain decimal is treated as minutes', () => {
    assert.strictEqual(parseDuration('1.5'), 90);
  });

  test('case-insensitive units', () => {
    assert.strictEqual(parseDuration('1H 30M'), 5400);
  });

  test('returns 0 for empty string', () => {
    assert.strictEqual(parseDuration(''), 0);
  });

  test('returns 0 for non-numeric garbage', () => {
    assert.strictEqual(parseDuration('abc'), 0);
  });
});
