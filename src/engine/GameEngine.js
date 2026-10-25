'use strict';

const { MAX_CASCADE_WAVES } = require('../shared/constants');

/**
 * Pure, server-authoritative Chain Reaction game engine.
 * No I/O, no networking — only game logic.
 */
class GameEngine {
  /**
   * @param {number} rows
   * @param {number} cols
   * @param {Array<{id:string, name:string, color:string}>} playerDefs  2-8 entries
   */
  constructor(rows, cols, playerDefs) {
    if (rows < 2 || cols < 2) throw new Error('Grid must be at least 2x2');
    if (playerDefs.length < 2 || playerDefs.length > 8)
      throw new Error('Need 2-8 players');

    this.rows = rows;
    this.cols = cols;

    this.players = playerDefs.map(p => ({
      id: p.id,
      name: p.name,
      color: p.color,
      orbCount: 0,
      alive: true,
      hasPlayed: false,
    }));

    this.grid = this._createGrid();
    this.currentPlayerIndex = 0;
    this.turnNumber = 0;
    this.status = 'playing'; // 'playing' | 'finished'
    this.winner = null;
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  _createGrid() {
    return Array.from({ length: this.rows }, () =>
      Array.from({ length: this.cols }, () => ({ owner: null, orbs: 0 }))
    );
  }

  _getCriticalMass(row, col) {
    let n = 0;
    if (row > 0)             n++;
    if (row < this.rows - 1) n++;
    if (col > 0)             n++;
    if (col < this.cols - 1) n++;
    return n;
  }

  _getNeighbors(row, col) {
    const nb = [];
    if (row > 0)             nb.push([row - 1, col]);
    if (row < this.rows - 1) nb.push([row + 1, col]);
    if (col > 0)             nb.push([row, col - 1]);
    if (col < this.cols - 1) nb.push([row, col + 1]);
    return nb;
  }

  /**
   * Iterative simultaneous-wave BFS cascade.
   * Each wave: collect all over-CM cells, explode them together, repeat.
   * Terminates because orbs always spread outward on standard grids
   * and the MAX_CASCADE_WAVES guard prevents runaway on degenerate cases.
   */
  _runCascade(triggeringPlayerId) {
    const waves = [];
    for (let wave = 0; wave < MAX_CASCADE_WAVES; wave++) {
      // 1. Collect all cells that are at or above critical mass
      const toExplode = [];
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          if (this.grid[r][c].orbs >= this._getCriticalMass(r, c)) {
            toExplode.push([r, c]);
          }
        }
      }
      if (toExplode.length === 0) break;

      const waveData = [];
      // 2. Explode all collected cells (subtract then distribute)
      for (const [r, c] of toExplode) {
        const cm = this._getCriticalMass(r, c);
        const neighbors = this._getNeighbors(r, c);
        this.grid[r][c].orbs -= cm;
        if (this.grid[r][c].orbs <= 0) {
          this.grid[r][c].orbs = 0;
          this.grid[r][c].owner = null;
        }
        for (const [nr, nc] of neighbors) {
          this.grid[nr][nc].orbs += 1;
          this.grid[nr][nc].owner = triggeringPlayerId;
        }
        waveData.push({ row: r, col: c, neighbors });
      }
      waves.push(waveData);

      // Early exit: if wipeout happened this wave, stop cascading
      // Guard: only check wipeout after at least 2 moves have been made or 2 players have played
      this._recalculateOrbCounts();
      const playersWithOrbs = this.players.filter(p => p.orbCount > 0);
      const playersWhoPlayed = this.players.filter(p => p.hasPlayed);
      if (playersWithOrbs.length === 1 && (this.turnNumber >= 2 || playersWhoPlayed.length >= 2)) {
        break;
      }
    }

    // Recount all player orbs from the grid
    this._recalculateOrbCounts();
    return waves;
  }

  _recalculateOrbCounts() {
    for (const p of this.players) p.orbCount = 0;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const { owner, orbs } = this.grid[r][c];
        if (owner && orbs > 0) {
          const p = this.players.find(pl => pl.id === owner);
          if (p) p.orbCount += orbs;
        }
      }
    }
  }

  /**
   * Eliminate players who have 0 orbs on the board.
   * Any player who has had at least one turn (hasPlayed === true)
   * and now has 0 orbs is eliminated from the game.
   */
  _checkElimination() {
    for (const p of this.players) {
      if (p.hasPlayed && p.alive && p.orbCount === 0) {
        p.alive = false;
      }
    }
  }

  /**
   * Declare a winner when:
   * 1. Only one player remains alive, OR
   * 2. All orbs on the board belong to a single player and at least 2 moves have taken place,
   *    or any opponent has 0 orbs after having played.
   *    (Instant wipeout victory: no infinite loop, immediate podium finish).
   */
  _checkVictory() {
    const alive = this.players.filter(p => p.alive);
    const playersWithOrbs = this.players.filter(p => p.orbCount > 0);
    const playersWhoPlayed = this.players.filter(p => p.hasPlayed);

    // Condition 1: Exactly one alive player remains (and at least 1 move was made)
    if (alive.length === 1 && this.turnNumber >= 1) {
      this.status = 'finished';
      this.winner = alive[0];
      return;
    }

    // Condition 2: Wipeout! All orbs on the board belong to only ONE player
    // This happens when one player blasts and completely swallows/wipes out every opponent orb.
    // Guard: ensure it's not literally the first move of the whole game where player 1 just placed 1 orb.
    if (playersWithOrbs.length === 1 && (this.turnNumber >= 2 || playersWhoPlayed.length >= 2)) {
      const winner = playersWithOrbs[0];
      // Mark all other players dead
      for (const p of this.players) {
        if (p.id !== winner.id) {
          p.alive = false;
          p.orbCount = 0;
        }
      }
      winner.alive = true;
      this.status = 'finished';
      this.winner = winner;
      return;
    }

    // Condition 3: Safety tiebreaker if all players got marked dead somehow
    if (alive.length === 0 && playersWithOrbs.length > 0) {
      const winner = playersWithOrbs[0];
      winner.alive = true;
      this.status = 'finished';
      this.winner = winner;
      return;
    }
  }

  /**
   * Advance currentPlayerIndex to the next alive player.
   * Wraps around; skips eliminated players.
   */
  _advanceTurn() {
    let attempts = 0;
    do {
      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
      attempts++;
    } while (!this.players[this.currentPlayerIndex].alive && attempts <= this.players.length);
    this.turnNumber++;

    if (!this.players[this.currentPlayerIndex].alive) {
      this._checkVictory();
    }
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /**
   * Attempt to place one orb for playerId at (row, col).
   * @returns {{ success: boolean, reason?: string }}
   */
  placeOrb(playerId, row, col) {
    if (this.status !== 'playing') {
      return { success: false, reason: 'Game is not in progress' };
    }

    const current = this.players[this.currentPlayerIndex];
    if (current.id !== playerId) {
      return { success: false, reason: 'Not your turn' };
    }

    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) {
      return { success: false, reason: 'Cell out of bounds' };
    }

    const cell = this.grid[row][col];
    if (cell.owner !== null && cell.owner !== playerId) {
      return { success: false, reason: 'Cell belongs to another player' };
    }

    // Place the orb
    cell.orbs += 1;
    cell.owner = playerId;
    current.hasPlayed = true;

    // Resolve all cascades synchronously
    const waves = this._runCascade(playerId);

    // Elimination then victory checks
    this._checkElimination();
    this._checkVictory();

    // Advance turn only if game continues
    if (this.status === 'playing') {
      this._advanceTurn();
    }

    return { success: true, waves };
  }

  /**
   * Skip the current player's turn (used for disconnected auto-skip).
   * @returns {boolean} whether the skip succeeded
   */
  skipTurn() {
    if (this.status !== 'playing') return false;
    const current = this.players[this.currentPlayerIndex];
    if (current) current.hasPlayed = true;
    this._checkElimination();
    this._checkVictory();
    if (this.status === 'playing') {
      this._advanceTurn();
    }
    return true;
  }

  getCriticalMass(row, col) {
    return this._getCriticalMass(row, col);
  }

  getCurrentPlayer() {
    return { ...this.players[this.currentPlayerIndex] };
  }

  /**
   * Deep-cloned state snapshot safe to send over the network.
   */
  getState() {
    return {
      rows: this.rows,
      cols: this.cols,
      grid: this.grid.map(row => row.map(cell => ({ ...cell }))),
      players: this.players.map(p => ({ ...p })),
      currentPlayerIndex: this.currentPlayerIndex,
      turnNumber: this.turnNumber,
      status: this.status,
      winner: this.winner ? { ...this.winner } : null,
    };
  }
}

module.exports = GameEngine;
