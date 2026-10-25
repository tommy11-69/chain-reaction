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
   * @param {Array<{id:string, name:string, color:string}>} playerDefs  2-4 entries
   */
  constructor(rows, cols, playerDefs) {
    if (rows < 2 || cols < 2) throw new Error('Grid must be at least 2x2');
    if (playerDefs.length < 2 || playerDefs.length > 4)
      throw new Error('Need 2-4 players');

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
   * Grace period: elimination only applies after every player has had
   * at least one turn (hasPlayed flag), so nobody is wiped out before
   * they even get a chance to play.
   */
  _checkElimination() {
    const allHavePlayed = this.players.every(p => p.hasPlayed);
    if (!allHavePlayed) return;
    for (const p of this.players) {
      if (p.alive && p.orbCount === 0) {
        p.alive = false;
      }
    }
  }

  /**
   * Declare a winner when exactly one player is still alive,
   * but only after the grace period has passed.
   */
  _checkVictory() {
    const allHavePlayed = this.players.every(p => p.hasPlayed);
    if (!allHavePlayed) return;
    const alive = this.players.filter(p => p.alive);
    if (alive.length === 1) {
      this.status = 'finished';
      this.winner = alive[0];
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
    this._advanceTurn();
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
