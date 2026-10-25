'use strict';

const path    = require('path');
const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');

const RoomManager          = require('./RoomManager');
const { DEFAULT_ROWS, DEFAULT_COLS } = require('../shared/constants');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });
const rooms  = new RoomManager();

// ─── Static files ──────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../../public')));

// Health-check for Render
app.get('/ping', (_req, res) => res.json({ ok: true, ts: Date.now() }));

// ─── Socket.IO ─────────────────────────────────────────────────────────────
io.on('connection', socket => {
  console.log(`[+] ${socket.id}`);

  // ── Create room ──────────────────────────────────────────────────────────
  socket.on('create_room', ({ playerName } = {}) => {
    const name = sanitizeName(playerName);
    if (!name) return socket.emit('error', { message: 'A player name is required.' });

    const result = rooms.createRoom(socket.id, name);
    if (!result.success) return socket.emit('error', { message: result.reason });

    socket.join(result.code);
    socket.emit('room_joined', {
      roomCode: result.code,
      players:  result.room.players,
      hostId:   result.room.hostId,
      playerId: socket.id,
      isHost:   true,
    });
  });

  // ── Join room ────────────────────────────────────────────────────────────
  socket.on('join_room', ({ roomCode, playerName } = {}) => {
    const name = sanitizeName(playerName);
    const code = sanitizeCode(roomCode);
    if (!name || !code) return socket.emit('error', { message: 'Name and room code are required.' });

    const result = rooms.joinRoom(code, socket.id, name);
    if (!result.success) return socket.emit('error', { message: result.reason });

    socket.join(result.code);

    // Tell the joining player
    socket.emit('room_joined', {
      roomCode:    result.code,
      players:     result.room.players,
      hostId:      result.room.hostId,
      playerId:    socket.id,
      isHost:      result.room.hostId === socket.id,
      reconnected: result.reconnected,
      gameState:   result.reconnected && result.room.engine
        ? result.room.engine.getState()
        : null,
    });

    // Tell everyone else
    io.to(result.code).emit('room_updated', {
      players: result.room.players,
      hostId:  result.room.hostId,
    });
  });

  // ── Start game ───────────────────────────────────────────────────────────
  socket.on('start_game', ({ roomCode, rows, cols } = {}) => {
    const room = getRoom(socket, roomCode);
    if (!room) return;
    if (room.hostId !== socket.id)
      return socket.emit('error', { message: 'Only the host can start the game.' });

    const r = clamp(parseInt(rows) || DEFAULT_ROWS, 4, 12);
    const c = clamp(parseInt(cols) || DEFAULT_COLS, 4, 12);
    const result = room.startGame(r, c);
    if (!result.success) return socket.emit('error', { message: result.reason });

    io.to(roomCode.toUpperCase()).emit('game_started', { state: room.engine.getState() });
    room.scheduleAutoSkip(io);
  });

  // ── Place orb ────────────────────────────────────────────────────────────
  socket.on('place_orb', ({ roomCode, row, col } = {}) => {
    const room = getRoom(socket, roomCode);
    if (!room) return socket.emit('move_rejected', { reason: 'Room not found.' });

    const result = room.placeOrb(socket.id, row, col);
    if (!result.success) return socket.emit('move_rejected', { reason: result.reason });

    // Cancel any pending auto-skip (current player just acted)
    if (room.autoSkipTimer) { clearTimeout(room.autoSkipTimer); room.autoSkipTimer = null; }

    const state = room.engine.getState();
    io.to(room.code).emit('state_update', {
      state,
      waves: result.waves || [],
      lastMove: { row, col, playerId: socket.id },
    });

    if (room.status === 'playing') room.scheduleAutoSkip(io);
  });

  // ── Rematch vote ─────────────────────────────────────────────────────────
  socket.on('request_rematch', ({ roomCode } = {}) => {
    const room = getRoom(socket, roomCode);
    if (!room) return;

    const allVoted = room.voteRematch(socket.id);
    io.to(room.code).emit('rematch_vote', {
      votes: room.rematchVotes.size,
      total: room.connectedCount(),
    });

    if (allVoted) {
      room.resetForRematch();
      io.to(room.code).emit('game_started', { state: room.engine.getState() });
      room.scheduleAutoSkip(io);
    }
  });

  // ── Disconnect ───────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    console.log(`[-] ${socket.id}`);
    const room = rooms.disconnect(socket.id);
    if (!room) return;

    io.to(room.code).emit('player_disconnected', {
      players: room.players,
      hostId:  room.hostId,
    });

    // Start auto-skip in case the disconnected player is currently the active one
    if (room.status === 'playing') room.scheduleAutoSkip(io);
  });
});

// ─── Helpers ───────────────────────────────────────────────────────────────

function sanitizeName(s) {
  return (typeof s === 'string') ? s.trim().slice(0, 20) : '';
}

function sanitizeCode(s) {
  return (typeof s === 'string') ? s.trim().toUpperCase().slice(0, 6) : '';
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/** Emit an error and return null if the room can't be found. */
function getRoom(socket, roomCode) {
  if (!roomCode) { socket.emit('error', { message: 'Room code missing.' }); return null; }
  const room = rooms.rooms.get(sanitizeCode(roomCode));
  if (!room) { socket.emit('error', { message: 'Room not found.' }); return null; }
  return room;
}

// ─── Start ─────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Chain Reaction running on http://localhost:${PORT}`));
