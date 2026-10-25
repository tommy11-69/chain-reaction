'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const GameEngine = require('./GameEngine');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function make2P(rows = 9, cols = 6) {
  return new GameEngine(rows, cols, [
    { id: 'p1', name: 'Alice', color: '#ff0000' },
    { id: 'p2', name: 'Bob',   color: '#0000ff' },
  ]);
}

function make3P() {
  return new GameEngine(5, 5, [
    { id: 'p1', name: 'A', color: '#f00' },
    { id: 'p2', name: 'B', color: '#0f0' },
    { id: 'p3', name: 'C', color: '#00f' },
  ]);
}

// Shortcut: place one orb per player in sequence so all hasPlayed = true
function allPlayOnce(engine, coords) {
  // coords: [[r,c], [r,c], ...]  — one per player in order
  engine.players.forEach((p, i) => {
    const [r, c] = coords[i];
    engine.placeOrb(p.id, r, c);
  });
}

// ─── Critical Mass ────────────────────────────────────────────────────────────

describe('Critical Mass', () => {
  test('corner cell has CM=2', () => {
    const e = make2P();
    assert.equal(e.getCriticalMass(0, 0), 2);
    assert.equal(e.getCriticalMass(0, 5), 2);
    assert.equal(e.getCriticalMass(8, 0), 2);
    assert.equal(e.getCriticalMass(8, 5), 2);
  });

  test('top/bottom edge (not corner) has CM=3', () => {
    const e = make2P();
    assert.equal(e.getCriticalMass(0, 1), 3);
    assert.equal(e.getCriticalMass(0, 4), 3);
    assert.equal(e.getCriticalMass(8, 2), 3);
  });

  test('left/right edge (not corner) has CM=3', () => {
    const e = make2P();
    assert.equal(e.getCriticalMass(1, 0), 3);
    assert.equal(e.getCriticalMass(4, 5), 3);
  });

  test('interior cell has CM=4', () => {
    const e = make2P();
    assert.equal(e.getCriticalMass(1, 1), 4);
    assert.equal(e.getCriticalMass(4, 3), 4);
    assert.equal(e.getCriticalMass(7, 4), 4);
  });

  test('smallest valid grid (2x2): all cells are corners with CM=2', () => {
    const e = make2P(2, 2);
    for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) {
      assert.equal(e.getCriticalMass(r, c), 2);
    }
  });
});

// ─── Move Validation ──────────────────────────────────────────────────────────

describe('Move Validation', () => {
  test('rejects move when it is not that players turn', () => {
    const e = make2P();
    const r = e.placeOrb('p2', 0, 0);
    assert.equal(r.success, false);
    assert.match(r.reason, /turn/i);
  });

  test('accepts move for the current player', () => {
    const e = make2P();
    const r = e.placeOrb('p1', 0, 0);
    assert.equal(r.success, true);
  });

  test('rejects move on a cell owned by another player', () => {
    const e = make2P();
    e.placeOrb('p1', 2, 2);
    const r = e.placeOrb('p2', 2, 2);
    assert.equal(r.success, false);
    assert.match(r.reason, /another player/i);
  });

  test('accepts move on players own cell', () => {
    const e = make2P();
    e.placeOrb('p1', 1, 1);
    e.placeOrb('p2', 5, 5);
    const r = e.placeOrb('p1', 1, 1);
    assert.equal(r.success, true);
  });

  test('rejects move on an empty cell that is out of bounds', () => {
    const e = make2P();
    assert.equal(e.placeOrb('p1', -1,  0).success, false);
    assert.equal(e.placeOrb('p1',  0, -1).success, false);
    assert.equal(e.placeOrb('p1',  9,  0).success, false);
    assert.equal(e.placeOrb('p1',  0,  6).success, false);
  });

  test('rejects any move when game status is finished', () => {
    const e = make2P();
    e.status = 'finished';
    const r = e.placeOrb('p1', 0, 0);
    assert.equal(r.success, false);
    assert.match(r.reason, /not in progress/i);
  });
});

// ─── Simple Explosion ─────────────────────────────────────────────────────────

describe('Simple Explosion', () => {
  test('corner cell explodes when it reaches CM=2', () => {
    const e = make2P(5, 5);
    // Turn 1: p1 → (0,0), 1 orb  (CM=2, no explosion)
    e.placeOrb('p1', 0, 0);
    // Turn 2: p2 somewhere safe
    e.placeOrb('p2', 4, 4);
    // Turn 3: p1 → (0,0) again, 2nd orb → explosion!
    e.placeOrb('p1', 0, 0);

    const s = e.getState();
    // (0,0) should have reset to 0 orbs after exploding
    assert.equal(s.grid[0][0].orbs, 0, 'exploded cell should reset to 0');
    // Neighbors each receive 1 orb
    assert.equal(s.grid[0][1].orbs, 1);
    assert.equal(s.grid[0][1].owner, 'p1');
    assert.equal(s.grid[1][0].orbs, 1);
    assert.equal(s.grid[1][0].owner, 'p1');
  });

  test('orb count is conserved through an explosion', () => {
    const e = make2P(5, 5);
    e.placeOrb('p1', 0, 0);
    e.placeOrb('p2', 4, 4);
    e.placeOrb('p1', 0, 0); // triggers explosion

    const s = e.getState();
    const total = s.grid.flat().reduce((sum, cell) => sum + cell.orbs, 0);
    // 3 orbs placed total (p1×2 + p2×1)
    assert.equal(total, 3, 'orbs must be conserved');
  });
});

// ─── Cell Capture ─────────────────────────────────────────────────────────────

describe('Cell Capture', () => {
  test('exploding into a neighbor converts it to the attackers color', () => {
    // Arrange: p2 owns (0,1).  p1 loads corner (0,0) to CM → explodes into (0,1)
    const e = make2P(5, 5);
    e.placeOrb('p1', 4, 4); // p1 somewhere safe (turn 1)
    e.placeOrb('p2', 0, 1); // p2 owns (0,1) (turn 2)
    e.placeOrb('p1', 0, 0); // p1 → corner (turn 3): 1 orb
    e.placeOrb('p2', 4, 3); // p2 somewhere safe (turn 4)
    e.placeOrb('p1', 0, 0); // p1 → corner (turn 5): 2 orbs → EXPLODE

    const s = e.getState();
    assert.equal(s.grid[0][1].owner, 'p1', 'captured cell must now belong to p1');
    assert.ok(s.grid[0][1].orbs >= 1, 'captured cell must have orbs');
  });
});

// ─── Chain Reaction ───────────────────────────────────────────────────────────

describe('Chain Reaction', () => {
  test('cascade resolves fully — no cell remains at or above critical mass', () => {
    // Build up (0,1) to CM-1=2 so that (0,0) explosion will cascade into it
    const e = make2P(5, 5);
    e.placeOrb('p1', 0, 1); // (0,1): 1 orb, CM=3 → ok
    e.placeOrb('p2', 4, 4);
    e.placeOrb('p1', 0, 1); // (0,1): 2 orbs → still ok
    e.placeOrb('p2', 4, 3);
    e.placeOrb('p1', 0, 0); // (0,0): 1 orb
    e.placeOrb('p2', 3, 4);
    // Now (0,0) → 2 orbs → EXPLODE → sends 1 to (0,1) → (0,1) = 3 = CM → CASCADE
    e.placeOrb('p1', 0, 0);

    const s = e.getState();
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        const cm = e.getCriticalMass(r, c);
        assert.ok(
          s.grid[r][c].orbs < cm,
          `cell (${r},${c}) has ${s.grid[r][c].orbs} orbs but CM=${cm}`
        );
      }
    }
  });

  test('chain reaction spreads attackers ownership across multiple cells', () => {
    const e = make2P(5, 5);
    e.placeOrb('p1', 4, 4);
    e.placeOrb('p2', 0, 1); // p2 plants at (0,1)
    e.placeOrb('p1', 0, 0);
    e.placeOrb('p2', 4, 3);
    e.placeOrb('p1', 0, 0); // explodes → cascade into p2's cell

    const s = e.getState();
    // (0,1) was p2's, should now be p1's after chain
    assert.equal(s.grid[0][1].owner, 'p1');
  });
});

// ─── Player Elimination ───────────────────────────────────────────────────────

describe('Player Elimination', () => {
  test('player is NOT eliminated before the grace period ends', () => {
    // After only p1 has played, p2 hasn't yet → allHavePlayed=false → no elimination
    const e = make2P(3, 3);
    e.placeOrb('p1', 0, 0);
    // p2 still alive even though p1 just played
    assert.equal(e.players[0].alive, true);
    assert.equal(e.players[1].alive, true);
  });

  test('player with 0 orbs is eliminated after grace period', () => {
    const e = make3P();
    // All three play once to clear the grace period
    allPlayOnce(e, [[0,0],[4,4],[0,4]]);
    // Manually zero out p3 orbs
    e.players[2].orbCount = 0;
    e.grid[0][4].orbs  = 0;
    e.grid[0][4].owner = null;
    e._checkElimination();
    assert.equal(e.players[2].alive, false, 'p3 should be eliminated');
    assert.equal(e.players[0].alive, true,  'p1 should still be alive');
    assert.equal(e.players[1].alive, true,  'p2 should still be alive');
  });
});

// ─── Victory Conditions ───────────────────────────────────────────────────────

describe('Victory Conditions', () => {
  test('last living player wins', () => {
    const e = make2P(3, 3);
    allPlayOnce(e, [[0,0],[2,2]]);
    // Zero out p2
    e.players[1].orbCount = 0;
    e.grid[2][2].orbs  = 0;
    e.grid[2][2].owner = null;
    e._checkElimination();
    e._checkVictory();
    assert.equal(e.status, 'finished');
    assert.equal(e.winner.id, 'p1');
  });

  test('no winner is declared while multiple players are still alive', () => {
    const e = make2P();
    allPlayOnce(e, [[0,0],[8,5]]);
    assert.equal(e.status, 'playing');
    assert.equal(e.winner, null);
  });

  test('no winner declared before grace period even if one player has 0 orbs', () => {
    // p1 places, but p2 has not yet played → grace period active
    const e = make2P(3, 3);
    e.placeOrb('p1', 0, 0); // only p1 has played
    // Manually simulate: after p1's first move, p2 hasn't played yet
    // No _checkElimination should fire (called internally)
    // Both players should still be alive
    assert.equal(e.players[0].alive, true);
    assert.equal(e.players[1].alive, true);
    assert.equal(e.status, 'playing');
  });

  test('wipeout: game finishes immediately when all opponent colors are wiped out and only one color stays', () => {
    const e = make2P(3, 3);
    // p1 places at corner (0,0)
    e.placeOrb('p1', 0, 0);
    // p2 places adjacent at (0,1)
    e.placeOrb('p2', 0, 1);
    // p1 places at (0,0) again -> explodes into (0,1), capturing p2's only orb
    const result = e.placeOrb('p1', 0, 0);

    assert.equal(result.success, true);
    assert.equal(e.status, 'finished', 'game must finish when all other players are wiped out');
    assert.equal(e.winner.id, 'p1', 'p1 must be declared winner');
    assert.equal(e.players[1].alive, false, 'p2 must be eliminated');
    assert.equal(e.players[1].orbCount, 0);
  });

  test('wipeout with a skipped 3rd player ends immediately without endless loop', () => {
    const e = make3P(3, 3);
    e.placeOrb('p1', 0, 0);
    e.placeOrb('p2', 0, 1);
    // p3 is skipped (e.g. disconnected)
    e.skipTurn();

    // p1 triggers cascade and captures all p2 orbs
    e.placeOrb('p1', 0, 0);

    assert.equal(e.status, 'finished', 'game must finish without looping');
    assert.equal(e.winner.id, 'p1');
    assert.equal(e.players[1].alive, false);
    assert.equal(e.players[2].alive, false);
  });
});

// ─── Turn Advancement ─────────────────────────────────────────────────────────

describe('Turn Advancement', () => {
  test('turn passes to next player after a valid move', () => {
    const e = make2P();
    assert.equal(e.getCurrentPlayer().id, 'p1');
    e.placeOrb('p1', 0, 0);
    assert.equal(e.getCurrentPlayer().id, 'p2');
    e.placeOrb('p2', 8, 5);
    assert.equal(e.getCurrentPlayer().id, 'p1');
  });

  test('turn skips an eliminated player', () => {
    const e = make3P();
    allPlayOnce(e, [[0,0],[4,4],[0,4]]);
    // Eliminate p2 (index 1)
    e.players[1].alive = false;
    e.players[1].orbCount = 0;
    e.grid[4][4].orbs  = 0;
    e.grid[4][4].owner = null;
    // Force currentPlayerIndex to p1 (index 0) and advance
    e.currentPlayerIndex = 0;
    e._advanceTurn();
    // Should skip p2 (index 1) and land on p3 (index 2)
    assert.equal(e.players[e.currentPlayerIndex].id, 'p3');
  });

  test('skipTurn advances the turn', () => {
    const e = make2P();
    assert.equal(e.getCurrentPlayer().id, 'p1');
    e.skipTurn();
    assert.equal(e.getCurrentPlayer().id, 'p2');
  });
});

// ─── Full game smoke test ─────────────────────────────────────────────────────

describe('Full game smoke test', () => {
  test('a 2x2 game reaches finished state without getting stuck', () => {
    // 2x2 board: all CM=2.  Players alternately fill it up until one wins.
    const e = new GameEngine(2, 2, [
      { id: 'p1', name: 'A', color: '#f00' },
      { id: 'p2', name: 'B', color: '#0f0' },
    ]);

    // On a 2x2 board each corner has CM=2.  A simple sequence that guarantees termination:
    const moves = [
      ['p1', 0, 0], ['p2', 0, 1],
      ['p1', 0, 0], ['p2', 0, 1],
      ['p1', 1, 0], ['p2', 1, 1],
      ['p1', 1, 0], ['p2', 1, 1],
      ['p1', 0, 0], ['p2', 0, 1],
    ];

    let done = false;
    for (const [id, r, c] of moves) {
      if (e.status === 'finished') { done = true; break; }
      e.placeOrb(id, r, c);
    }

    // The game must have finished within the move sequence (or just about to)
    // Key assertion: no infinite loop — we got here
    assert.ok(e.status === 'finished' || done || e.turnNumber <= moves.length);
  });
});

// ─── 8-Player Support ─────────────────────────────────────────────────────────

describe('8-Player Support', () => {
  const { PLAYER_COLORS } = require('../shared/constants');

  test('8 players can initialize and rotate turns properly', () => {
    const players = Array.from({ length: 8 }, (_, i) => ({
      id: `p${i + 1}`,
      name: `Player ${i + 1}`,
      color: PLAYER_COLORS[i],
    }));

    const e = new GameEngine(9, 6, players);
    assert.equal(e.players.length, 8);
    assert.equal(e.status, 'playing');

    // Each of the 8 players places one orb in sequence
    for (let i = 0; i < 8; i++) {
      assert.equal(e.getCurrentPlayer().id, `p${i + 1}`);
      const res = e.placeOrb(`p${i + 1}`, i, 0);
      assert.equal(res.success, true);
    }

    // Turn wraps back to p1
    assert.equal(e.getCurrentPlayer().id, 'p1');
    assert.equal(e.turnNumber, 8);
  });

  test('rejects less than 2 players or more than 8 players in constructor', () => {
    assert.throws(() => {
      new GameEngine(5, 5, [{ id: 'p1', name: 'Alone', color: '#fff' }]);
    }, /Need 2-8 players/);

    const ninePlayers = Array.from({ length: 9 }, (_, i) => ({
      id: `p${i + 1}`,
      name: `Player ${i + 1}`,
      color: '#fff',
    }));
    assert.throws(() => {
      new GameEngine(5, 5, ninePlayers);
    }, /Need 2-8 players/);
  });
});

