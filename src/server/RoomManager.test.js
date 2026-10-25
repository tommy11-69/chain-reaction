'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const RoomManager = require('./RoomManager');
const { PLAYER_COLORS } = require('../shared/constants');

describe('RoomManager 8-Player Capacity', () => {
  test('allows up to 8 players to join a room with distinct colors', () => {
    const rm = new RoomManager();
    const created = rm.createRoom('socket_p1', 'Player 1');
    assert.equal(created.success, true);
    const roomCode = created.code;
    const room = created.room;

    assert.equal(room.players.length, 1);
    assert.equal(room.players[0].color, PLAYER_COLORS[0]);

    // Join 7 more players (total 8)
    for (let i = 2; i <= 8; i++) {
      const res = rm.joinRoom(roomCode, `socket_p${i}`, `Player ${i}`);
      assert.equal(res.success, true, `Player ${i} should be able to join`);
      assert.equal(room.players.length, i);
      assert.equal(room.players[i - 1].color, PLAYER_COLORS[i - 1]);
    }

    assert.equal(room.players.length, 8);

    // 9th player must be rejected
    const ninth = rm.joinRoom(roomCode, 'socket_p9', 'Player 9');
    assert.equal(ninth.success, false);
    assert.match(ninth.reason, /full/i);
  });

  test('starts game with all 8 joined players', () => {
    const rm = new RoomManager();
    const created = rm.createRoom('socket_p1', 'Player 1');
    const room = created.room;

    for (let i = 2; i <= 8; i++) {
      rm.joinRoom(created.code, `socket_p${i}`, `Player ${i}`);
    }

    const startRes = room.startGame(9, 6);
    assert.equal(startRes.success, true);
    assert.equal(room.status, 'playing');
    assert.equal(room.engine.players.length, 8);
  });
});
