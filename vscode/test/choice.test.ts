import { test } from 'node:test';
import assert from 'node:assert/strict';
import { knownChoice, CHOICES } from '../src/choice.ts';

test('the setting wins; with it on ask, what fastdraw open saved here; with neither, the person is asked', () => {
  assert.equal(knownChoice('local', () => 'hosted'), 'local');
  assert.equal(knownChoice('hosted', () => 'local'), 'hosted');
  assert.equal(knownChoice('ask', () => 'local'), 'local');
  assert.equal(knownChoice(undefined, () => 'hosted'), 'hosted');
  assert.equal(knownChoice('ask', () => null), null);
  assert.equal(knownChoice('something else', () => null), null);
});

test('the picker offers hosted first, as the recommended one, then local', () => {
  assert.deepEqual(CHOICES.map((c) => c.choice), ['hosted', 'local']);
  assert.match(CHOICES[0].description!, /recommended/);
});
