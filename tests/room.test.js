import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRoomCode, normalizeRoomCode, roomLink } from '../js/room.js';

test('room codes are 4 unambiguous letters', () => {
  for (let i = 0; i < 200; i++) {
    const c = makeRoomCode();
    assert.match(c, /^[A-HJ-NP-Z]{4}$/);
  }
});

test('normalizeRoomCode accepts lower case and junk, rejects bad codes', () => {
  assert.equal(normalizeRoomCode(' kx4p'), null); // digit not allowed
  assert.equal(normalizeRoomCode('kxtp'), 'KXTP');
  assert.equal(normalizeRoomCode('KX-TP'), 'KXTP');
  assert.equal(normalizeRoomCode('KXT'), null);
  assert.equal(normalizeRoomCode('KXTO'), null);
  assert.equal(normalizeRoomCode(null), null);
});

test('roomLink keeps path, replaces query', () => {
  assert.equal(roomLink('ABCD', 'https://x.github.io/forhandling/?foo=1#h'), 'https://x.github.io/forhandling/?rum=ABCD');
});
