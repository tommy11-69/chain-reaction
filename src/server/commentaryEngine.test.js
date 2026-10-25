'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const CommentaryEngine = require('./commentaryEngine');

describe('CommentaryEngine (Tamil Slang Chaos Mode)', () => {
  test('loads vocabulary from badwords.txt without throwing', () => {
    const engine = new CommentaryEngine();
    assert.ok(engine.vocab.length > 0, 'Vocabulary must have loaded terms');
  });

  test('generates victory commentary on game finish', () => {
    const engine = new CommentaryEngine();
    const result = engine.evaluateMove({
      playerName: 'Karthi',
      playerId: 'p1',
      waves: [],
      oldState: { players: [{ id: 'p1', name: 'Karthi', alive: true }] },
      newState: { status: 'finished', winner: { name: 'Karthi' } }
    });

    assert.ok(result);
    assert.equal(result.category, 'victory');
    assert.equal(result.priority, 5);
    assert.equal(result.major, true);
    assert.match(result.text, /Karthi/);
  });

  test('generates elimination commentary when player is eliminated', () => {
    const engine = new CommentaryEngine();
    const oldState = {
      players: [
        { id: 'p1', name: 'Attacker', alive: true },
        { id: 'p2', name: 'Suresh', alive: true }
      ]
    };
    const newState = {
      status: 'playing',
      players: [
        { id: 'p1', name: 'Attacker', alive: true },
        { id: 'p2', name: 'Suresh', alive: false }
      ]
    };

    const result = engine.evaluateMove({
      playerName: 'Attacker',
      playerId: 'p1',
      waves: [[{ row: 0, col: 0, neighbors: [] }]],
      oldState,
      newState
    });

    assert.ok(result);
    assert.equal(result.category, 'elimination');
    assert.equal(result.priority, 4);
    assert.equal(result.major, true);
    assert.match(result.text, /Suresh/);
  });

  test('generates major cascade commentary when waves >= 2', () => {
    const engine = new CommentaryEngine();
    const oldState = { players: [{ id: 'p1', name: 'Ramesh', alive: true }] };
    const newState = { status: 'playing', players: [{ id: 'p1', name: 'Ramesh', alive: true }] };

    const result = engine.evaluateMove({
      playerName: 'Ramesh',
      playerId: 'p1',
      waves: [
        [{ row: 0, col: 0, neighbors: [] }],
        [{ row: 0, col: 1, neighbors: [] }]
      ],
      oldState,
      newState
    });

    assert.ok(result);
    assert.equal(result.category, 'cascade_huge');
    assert.equal(result.priority, 3);
    assert.equal(result.major, true);
    assert.ok(typeof result.text === 'string' && result.text.length > 5);
  });

  test('generates ordinary move commentary for normal move', () => {
    const engine = new CommentaryEngine();
    const oldState = {
      grid: [[{ owner: null, orbs: 0 }]],
      players: [{ id: 'p1', name: 'Mani', alive: true }]
    };
    const newState = {
      grid: [[{ owner: 'p1', orbs: 1 }]],
      status: 'playing',
      players: [{ id: 'p1', name: 'Mani', alive: true }]
    };

    const result = engine.evaluateMove({
      playerName: 'Mani',
      playerId: 'p1',
      waves: [],
      oldState,
      newState
    });

    assert.ok(result);
    assert.equal(result.category, 'ordinary');
    assert.equal(result.priority, 1);
    assert.equal(result.major, false);
    assert.ok(typeof result.text === 'string' && result.text.length > 5);
  });
});
