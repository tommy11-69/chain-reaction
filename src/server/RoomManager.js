'use strict';

const GameEngine = require('../engine/GameEngine');
const { PLAYER_COLORS, DEFAULT_ROWS, DEFAULT_COLS, MAX_PLAYERS } = require('../shared/constants');

// ─── Room ────────────────────────────────────────────────────────────────────

class Room {
  constructor(code) {
    this.code = code;
    this.players = [];   // { id, name, color, connected }
    this.hostId = null;
    this.engine = null;
    this.status = 'waiting';  // 'waiting' | 'playing' | 'finished'
    this.lastRows = DEFAULT_ROWS;
    this.lastCols = DEFAULT_COLS;
    this.rematchVotes = new Set();
    this.autoSkipTimer = null;
    this.disconnectGraceTimer = null;
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
  }

  // ── Player management ──────────────────────────────────────────────────────

  addPlayer(socketId, name, token = null) {
    if (this.players.length >= MAX_PLAYERS)
      return { success: false, reason: `Room is full (max ${MAX_PLAYERS} players)` };
    if (this.status !== 'waiting')
      return { success: false, reason: 'Game has already started' };
    if (this.players.some(p => p.connected && p.name === name))
      return { success: false, reason: 'Name already taken in this room' };

    const color = PLAYER_COLORS[this.players.length];
    const playerToken = token || Math.random().toString(36).substring(2) + Date.now().toString(36);
    const player = { id: socketId, name, color, connected: true, token: playerToken };
    this.players.push(player);
    if (!this.hostId) this.hostId = socketId;
    this._touch();
    return { success: true, player };
  }

  disconnectPlayer(socketId, io) {
    const p = this.players.find(pl => pl.id === socketId);
    if (!p) return false;
    p.connected = false;

    // Transfer host to next connected player (lobby only)
    if (this.hostId === socketId && this.status === 'waiting') {
      const next = this.players.find(pl => pl.connected);
      this.hostId = next ? next.id : null;
    }

    // In an active game, give a 60-second grace period before declaring default win
    if (this.engine && this.status === 'playing') {
      const connected = this.players.filter(pl => pl.connected);
      if (connected.length === 1) {
        if (this.disconnectGraceTimer) clearTimeout(this.disconnectGraceTimer);
        this.disconnectGraceTimer = setTimeout(() => {
          this.disconnectGraceTimer = null;
          if (this.status !== 'playing' || !this.engine) return;
          const stillConnected = this.players.filter(pl => pl.connected);
          if (stillConnected.length === 1) {
            const winner = this.engine.players.find(pl => pl.id === stillConnected[0].id);
            if (winner) {
              this.engine.status = 'finished';
              this.engine.winner = winner;
              this.status = 'finished';
              if (io) {
                io.to(this.code).emit('state_update', {
                  state: this.engine.getState(),
                  waves: [],
                  lastMove: null,
                  commentary: {
                    text: `${p.name} varala da! Timeout aayiduchu, default winner declared! 🏆`,
                    category: 'victory',
                    priority: 5,
                    major: true
                  }
                });
              }
            }
          }
        }, 60_000);
      }
    }

    this._touch();
    return true;
  }

  cancelDisconnectGrace() {
    if (this.disconnectGraceTimer) {
      clearTimeout(this.disconnectGraceTimer);
      this.disconnectGraceTimer = null;
    }
  }

  removePlayer(socketId) {
    const idx = this.players.findIndex(p => p.id === socketId);
    if (idx === -1) return null;
    const removed = this.players.splice(idx, 1)[0];
    if (this.hostId === socketId) {
      const next = this.players.find(p => p.connected);
      this.hostId = next ? next.id : null;
    }
    // If active game, eliminate player in engine if present
    if (this.engine && this.status === 'playing') {
      const ep = this.engine.players.find(p => p.id === socketId);
      if (ep) ep.alive = false;
      this.engine._checkVictory();
      if (this.engine.status === 'finished') {
        this.status = 'finished';
      }
    }
    this._touch();
    return removed;
  }

  /** Returns the player object if reconnection succeeded, else null. */
  reconnectPlayer(oldSocketId, newSocketId) {
    const p = this.players.find(pl => pl.id === oldSocketId);
    if (!p) return null;
    p.id = newSocketId;
    p.connected = true;
    this.cancelDisconnectGrace();
    if (this.hostId === oldSocketId) this.hostId = newSocketId;
    // Keep engine in sync
    if (this.engine) {
      const ep = this.engine.players.find(pl => pl.id === oldSocketId);
      if (ep) ep.id = newSocketId;
      for (let r = 0; r < this.engine.rows; r++) {
        for (let c = 0; c < this.engine.cols; c++) {
          if (this.engine.grid[r][c].owner === oldSocketId) {
            this.engine.grid[r][c].owner = newSocketId;
          }
        }
      }
    }
    this._touch();
    return p;
  }

  hasConnectedPlayers() {
    return this.players.some(p => p.connected);
  }

  connectedCount() {
    return this.players.filter(p => p.connected).length;
  }

  // ── Game management ────────────────────────────────────────────────────────

  startGame(rows, cols) {
    if (this.connectedCount() < 2)
      return { success: false, reason: 'Need at least 2 players to start' };
    if (this.status !== 'waiting')
      return { success: false, reason: 'Game already started' };

    this.lastRows = rows;
    this.lastCols = cols;

    const defs = this.players
      .filter(p => p.connected)
      .map(p => ({ id: p.id, name: p.name, color: p.color }));

    this.engine = new GameEngine(rows, cols, defs);
    this.status = 'playing';
    this._touch();
    return { success: true };
  }

  placeOrb(socketId, row, col) {
    if (!this.engine || this.status !== 'playing')
      return { success: false, reason: 'Game is not in progress' };

    const result = this.engine.placeOrb(socketId, row, col);
    if (result.success) {
      if (this.engine.status === 'finished') {
        this.status = 'finished';
        if (this.autoSkipTimer) {
          clearTimeout(this.autoSkipTimer);
          this.autoSkipTimer = null;
        }
        this.cancelDisconnectGrace();
      }
      this._touch();
    }
    return result;
  }

  /** Returns true when all connected players have voted. */
  voteRematch(socketId) {
    this.rematchVotes.add(socketId);
    return this.rematchVotes.size >= this.connectedCount();
  }

  resetForRematch() {
    this.rematchVotes.clear();
    if (this.autoSkipTimer) { clearTimeout(this.autoSkipTimer); this.autoSkipTimer = null; }

    // Re-use the same players (including new socket IDs after reconnects)
    const defs = this.players
      .filter(p => p.connected)
      .map(p => ({ id: p.id, name: p.name, color: p.color }));

    this.engine = new GameEngine(this.lastRows, this.lastCols, defs);
    this.status = 'playing';
    this._touch();
    return { success: true };
  }

  // ── Auto-skip for disconnected players ────────────────────────────────────

  /**
   * Schedule a 30-second auto-skip if the current player is disconnected.
   * Returns the timer id (or null).  Caller must pass the io instance.
   */
  scheduleAutoSkip(io) {
    if (this.autoSkipTimer) { clearTimeout(this.autoSkipTimer); this.autoSkipTimer = null; }
    if (!this.engine || this.status !== 'playing') return null;

    const current = this.engine.getCurrentPlayer();
    const roomPlayer = this.players.find(p => p.id === current.id);
    if (!roomPlayer || roomPlayer.connected) return null;

    this.autoSkipTimer = setTimeout(() => {
      this.autoSkipTimer = null;
      if (this.status !== 'playing' || !this.engine) return;

      const cur = this.engine.getCurrentPlayer();
      const rp = this.players.find(p => p.id === cur.id);
      if (rp && !rp.connected) {
        this.engine.skipTurn();
        if (this.engine.status === 'finished') {
          this.status = 'finished';
          this.cancelDisconnectGrace();
          if (this.autoSkipTimer) {
            clearTimeout(this.autoSkipTimer);
            this.autoSkipTimer = null;
          }
        }
        io.to(this.code).emit('state_update', {
          state: this.engine.getState(),
          skippedPlayer: rp.name,
        });
        if (this.status === 'playing') {
          this.scheduleAutoSkip(io); // recurse in case next is also disconnected
        }
      }
    }, 30_000);

    return this.autoSkipTimer;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  _touch() { this.lastActivity = Date.now(); }

  getPublicLobbyState() {
    return { players: this.players, hostId: this.hostId };
  }
}

// ─── RoomManager ─────────────────────────────────────────────────────────────

class RoomManager {
  constructor() {
    this.rooms = new Map();  // code → Room
    this._startGarbageCollector();
  }

  _generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code;
    do {
      code = Array.from({ length: 6 }, () =>
        chars[Math.floor(Math.random() * chars.length)]
      ).join('');
    } while (this.rooms.has(code));
    return code;
  }

  createRoom(socketId, playerName) {
    const code = this._generateCode();
    const room = new Room(code);
    const result = room.addPlayer(socketId, playerName);
    if (!result.success) return result;
    this.rooms.set(code, room);
    return { success: true, code, room, player: result.player };
  }

  /**
   * Join (or reconnect to) a room.
   * Reconnection: matching session token OR (same name + previously disconnected slot).
   */
  joinRoom(code, socketId, playerName, token = null) {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) return { success: false, reason: 'Room not found. Check the code.' };

    // Reconnection path: matching token or same name while disconnected
    const existing = room.players.find(
      p => (token && p.token === token) || (p.name === playerName && !p.connected)
    );
    if (existing) {
      room.reconnectPlayer(existing.id, socketId);
      return { success: true, code: room.code, room, player: existing, reconnected: true };
    }

    const result = room.addPlayer(socketId, playerName, token);
    if (!result.success) return result;
    return { success: true, code: room.code, room, player: result.player, reconnected: false };
  }

  getRoomBySocket(socketId) {
    for (const room of this.rooms.values()) {
      if (room.players.some(p => p.id === socketId)) return room;
    }
    return null;
  }

  leaveRoom(socketId) {
    const room = this.getRoomBySocket(socketId);
    if (!room) return null;
    const removedPlayer = room.removePlayer(socketId);
    return { room, removedPlayer };
  }

  disconnect(socketId, io) {
    const room = this.getRoomBySocket(socketId);
    if (room) room.disconnectPlayer(socketId, io);
    return room;
  }

  _startGarbageCollector() {
    const gcInterval = setInterval(() => {
      const TEN_MIN = 10 * 60 * 1000;
      const now = Date.now();
      for (const [code, room] of this.rooms.entries()) {
        if (!room.hasConnectedPlayers() && now - room.lastActivity > TEN_MIN) {
          if (room.autoSkipTimer) clearTimeout(room.autoSkipTimer);
          this.rooms.delete(code);
          console.log(`[GC] Room ${code} removed`);
        }
      }
    }, 60_000);
    if (gcInterval.unref) gcInterval.unref();
  }
}

module.exports = RoomManager;
