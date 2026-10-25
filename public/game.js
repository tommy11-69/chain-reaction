/* =====================================================================
   Chain Reaction  ·  game.js
   Dark Minimalist × Hypnotic Motion × Web Audio Synthesis
   Server-authoritative state display with cascading energy VFX.
===================================================================== */
'use strict';

// ─── App State ────────────────────────────────────────────────────────────────
let socket;
let myPlayerId     = null;
let myRoomCode     = null;
let isHost         = false;
let currentState   = null;
let prevGridFlat   = null;
let gridSize       = { rows: 9, cols: 6 };
let isAnimatingFX  = false;
let fxQueue        = [];

// Settings
let audioEnabled   = false;
let motionReduced  = false;
let slangEnabled   = true;
let slangFrequency = 'med'; // 'low' | 'med' | 'high'

// DOM refs
const $ = id => document.getElementById(id);

// Orb layouts — center positions as [left%, top%]
const ORB_CENTERS = [
  [],
  [[50, 50]],
  [[32, 50], [68, 50]],
  [[50, 27], [26, 73], [74, 73]],
  [[27, 27], [73, 27], [27, 73], [73, 73]],
];

// ─── Entry Point ──────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadPreferences();
  initAudioEngine();
  initBackgroundCanvas();
  initSocket();
  initUI();
});

// ─── Preferences ─────────────────────────────────────────────────────────────
function loadPreferences() {
  audioEnabled = localStorage.getItem('cr_audio') === 'true';
  const sysReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  motionReduced = localStorage.getItem('cr_motion') !== null
    ? localStorage.getItem('cr_motion') === 'reduced'
    : sysReduced;

  slangEnabled = localStorage.getItem('cr_slang') !== 'false';
  slangFrequency = localStorage.getItem('cr_slang_freq') || 'med';

  updateAudioUI();
  updateMotionUI();
  updateSlangUI();
}

function updateSlangUI() {
  const dot = $('slang-dot');
  const label = $('slang-label');
  const ingameDot = $('ingame-slang-dot');
  const ingameText = $('ingame-slang-text');
  const freqLabel = $('freq-label');

  if (slangEnabled) {
    if (dot) dot.classList.add('active');
    if (label) label.textContent = 'Gaali: On';
    if (ingameDot) ingameDot.classList.add('active');
    if (ingameText) ingameText.textContent = 'GAALI: ON';
  } else {
    if (dot) dot.classList.remove('active');
    if (label) label.textContent = 'Gaali: Off';
    if (ingameDot) ingameDot.classList.remove('active');
    if (ingameText) ingameText.textContent = 'GAALI: OFF';
  }

  const freqMap = { low: 'Konjam', med: 'Med', high: 'Full Attack' };
  const freqDisplay = freqMap[slangFrequency] || 'Med';

  if (freqLabel) {
    freqLabel.textContent = `Roast: ${freqDisplay}`;
  }

  const ingameFreq = $('ingame-freq-text');
  if (ingameFreq) {
    ingameFreq.textContent = `ROAST: ${freqDisplay.toUpperCase()}`;
  }
}

function toggleSlang() {
  slangEnabled = !slangEnabled;
  localStorage.setItem('cr_slang', slangEnabled ? 'true' : 'false');
  updateSlangUI();
  showToast(slangEnabled ? 'Gaali Mode On Da! Full Roast Mode 💀' : 'Gaali Mode Muted da!', 'info');
}

function cycleFrequency() {
  const next = { low: 'med', med: 'high', high: 'low' };
  slangFrequency = next[slangFrequency] || 'med';
  localStorage.setItem('cr_slang_freq', slangFrequency);
  updateSlangUI();
  const freqMap = { low: 'Konjam (Only Big Events)', med: 'Medium Roast', high: 'Full Gaali Attack' };
  showToast(`Roast Level: ${freqMap[slangFrequency]}`, 'info');
}

function updateAudioUI() {
  const dot = $('audio-dot');
  const label = $('audio-label');
  const ingameDot = $('ingame-sound-dot');
  const ingameText = $('ingame-sound-text');

  if (audioEnabled) {
    if (dot) dot.classList.add('active');
    if (label) label.textContent = 'Satham: On';
    if (ingameDot) ingameDot.classList.add('active');
    if (ingameText) ingameText.textContent = 'SATHAM: ON';
  } else {
    if (dot) dot.classList.remove('active');
    if (label) label.textContent = 'Satham: Off';
    if (ingameDot) ingameDot.classList.remove('active');
    if (ingameText) ingameText.textContent = 'SATHAM: OFF';
  }
}

function updateMotionUI() {
  const dot = $('motion-dot');
  const label = $('motion-label');

  if (motionReduced) {
    document.body.classList.add('reduce-motion');
    if (dot) dot.classList.remove('active');
    if (label) label.textContent = 'FX: Konjam';
  } else {
    document.body.classList.remove('reduce-motion');
    if (dot) dot.classList.add('active');
    if (label) label.textContent = 'FX: Vera Level';
  }
}

function toggleAudio() {
  audioEnabled = !audioEnabled;
  localStorage.setItem('cr_audio', audioEnabled ? 'true' : 'false');
  updateAudioUI();
  if (audioEnabled) {
    unlockAudioContext((ctx) => {
      playToggleChime(true);
      showToast('Sound on panniyaachu! 🔊', 'info');
    });
  } else {
    playToggleChime(false);
    showToast('Sound-a off pannitta da! 🔇', 'info');
  }
}

function toggleMotion() {
  motionReduced = !motionReduced;
  localStorage.setItem('cr_motion', motionReduced ? 'reduced' : 'full');
  updateMotionUI();
  showToast(motionReduced ? 'FX konjam aakiyachu da' : 'FX vera level-la irukku da!', 'info');
}

// ─── Procedural Web Audio Synthesis (Mobile & Desktop Optimized) ─────────────
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    try {
      audioCtx = new AudioCtor({ latencyHint: 'interactive' });
    } catch (_) {
      audioCtx = new AudioCtor();
    }
  }
  return audioCtx;
}

/**
 * Mobile Web Audio unlocker for iOS Safari & Android Chrome.
 * Plays a 1-sample silent buffer synchronously to unlock hardware audio output.
 */
function unlockAudioContext(onReady) {
  const ctx = getAudioContext();
  if (!ctx) {
    if (onReady) onReady(null);
    return;
  }

  // iOS WebKit hardware speaker unlock
  try {
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
  } catch (_) {}

  if (ctx.state === 'suspended' || ctx.state === 'interrupted') {
    ctx.resume().then(() => {
      if (onReady) onReady(ctx);
    }).catch(() => {
      if (onReady) onReady(ctx);
    });
  } else {
    if (onReady) onReady(ctx);
  }
}

function resumeAudioContext() {
  unlockAudioContext();
}

/** Instant clear feedback chime when user toggles sound ON/OFF */
function playToggleChime(isOn) {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state !== 'running') {
    ctx.resume();
  }

  const now = ctx.currentTime;
  if (isOn) {
    // Bright ascending double chime (587Hz -> 880Hz) — perfectly tuned for phone speakers
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    const gain2 = ctx.createGain();

    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(587.33, now); // D5
    gain1.gain.setValueAtTime(0.38, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880.00, now + 0.06); // A5
    gain2.gain.setValueAtTime(0.001, now);
    gain2.gain.setValueAtTime(0.42, now + 0.06);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.085);
    osc2.start(now + 0.06);
    osc2.stop(now + 0.19);
  } else {
    // Soft descending tone (400Hz -> 240Hz)
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.09);
    gain.gain.setValueAtTime(0.24, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.095);
  }
}

/** Crisp, tactile organic droplet pop (audible on phone speakers & headphones) */
function playOrbPlace(colorHex) {
  if (!audioEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  unlockAudioContext((activeCtx) => {
    if (!activeCtx) return;
    const now = activeCtx.currentTime;

    // Dual oscillator: rich harmonic pop (triangle overtone + warm sine)
    const oscMain = activeCtx.createOscillator();
    const oscHarm = activeCtx.createOscillator();
    const gain = activeCtx.createGain();

    oscMain.type = 'sine';
    oscMain.frequency.setValueAtTime(720, now);
    oscMain.frequency.exponentialRampToValueAtTime(280, now + 0.11);

    oscHarm.type = 'triangle';
    oscHarm.frequency.setValueAtTime(1080, now);
    oscHarm.frequency.exponentialRampToValueAtTime(420, now + 0.09);

    gain.gain.setValueAtTime(0.42, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

    oscMain.connect(gain);
    oscHarm.connect(gain);
    gain.connect(activeCtx.destination);

    oscMain.start(now);
    oscHarm.start(now);
    oscMain.stop(now + 0.115);
    oscHarm.stop(now + 0.095);
  });
}

/** Punchy explosive thud on cell explosion / cascade burst */
function playCellBurst() {
  if (!audioEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  unlockAudioContext((activeCtx) => {
    if (!activeCtx) return;
    const now = activeCtx.currentTime;

    const osc = activeCtx.createOscillator();
    const gain = activeCtx.createGain();
    const filter = activeCtx.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(380, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.16);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, now);
    filter.frequency.exponentialRampToValueAtTime(350, now + 0.16);

    gain.gain.setValueAtTime(0.48, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(activeCtx.destination);

    osc.start(now);
    osc.stop(now + 0.165);
  });
}

/** Harmonic resonant pulse during cascade wave */
function playCascadeWave(waveIndex) {
  if (!audioEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  unlockAudioContext((activeCtx) => {
    if (!activeCtx) return;
    const now = activeCtx.currentTime;
    const osc = activeCtx.createOscillator();
    const gain = activeCtx.createGain();

    // Vibrant melodic scale that rings clearly on mobile speakers
    const scale = [330, 392, 440, 523.25, 587.33, 659.25, 784, 880];
    const freq = scale[waveIndex % scale.length];

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.98, now + 0.14);

    gain.gain.setValueAtTime(0.32, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    osc.connect(gain);
    gain.connect(activeCtx.destination);

    osc.start(now);
    osc.stop(now + 0.145);
  });
}

/** Triumphant atmospheric victory celebration chords */
function playVictory() {
  if (!audioEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  unlockAudioContext((activeCtx) => {
    if (!activeCtx) return;
    const chords = [261.63, 329.63, 392.00, 523.25, 659.25];
    const now = activeCtx.currentTime;
    chords.forEach((f, idx) => {
      const osc = activeCtx.createOscillator();
      const gain = activeCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now + idx * 0.08);
      gain.gain.setValueAtTime(0.28, now + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.08 + 1.6);
      osc.connect(gain);
      gain.connect(activeCtx.destination);
      osc.start(now + idx * 0.08);
      osc.stop(now + idx * 0.08 + 1.65);
    });
  });
}

/** Punchy comedic audio accent for major Tamil gaali roasts */
function playRoastAccent() {
  if (!audioEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  unlockAudioContext((activeCtx) => {
    if (!activeCtx) return;
    const now = activeCtx.currentTime;
    const osc = activeCtx.createOscillator();
    const gain = activeCtx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(460, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.15);

    gain.gain.setValueAtTime(0.36, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(activeCtx.destination);

    osc.start(now);
    osc.stop(now + 0.155);
  });
}

function initAudioEngine() {
  // Prime & unlock context on ANY user touch or click
  const unlock = () => {
    unlockAudioContext();
  };
  ['touchstart', 'touchend', 'pointerdown', 'click', 'keydown'].forEach(evt => {
    window.addEventListener(evt, unlock, { passive: true });
  });
}

// ─── Hypnotic Ambient Weed Vapor & Trichome Canvas ────────────────────────────
let bgCanvas, bgCtx;
let bgAnimFrame;
let bgMotes = [];

function initBackgroundCanvas() {
  bgCanvas = $('bg-canvas');
  if (!bgCanvas) return;
  bgCtx = bgCanvas.getContext('2d');

  resizeBgCanvas();
  window.addEventListener('resize', resizeBgCanvas);

  // Initialize floating luminous cannabinoid / trichome motes
  bgMotes = [];
  const count = 30;
  for (let i = 0; i < count; i++) {
    bgMotes.push({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      radius: 0.8 + Math.random() * 1.8,
      speedY: -0.18 - Math.random() * 0.32,
      driftAngle: Math.random() * Math.PI * 2,
      driftSpeed: 0.012 + Math.random() * 0.016,
      opacity: 0.12 + Math.random() * 0.28,
      hue: Math.random() > 0.45 ? '#2DFE54' : (Math.random() > 0.5 ? '#00F5FF' : '#B537F2')
    });
  }

  let time = 0;
  function renderBg() {
    if (document.hidden || motionReduced) {
      bgAnimFrame = requestAnimationFrame(renderBg);
      return;
    }

    time += 0.005;
    const w = bgCanvas.width;
    const h = bgCanvas.height;

    // Pitch cosmic resin black background
    bgCtx.fillStyle = '#050805';
    bgCtx.fillRect(0, 0, w, h);

    // Dynamic swirling weed smoke nebula / plasma nodes
    // Node 1: Cannabis Emerald Smoke Plume
    const cx1 = w * 0.32 + Math.sin(time * 0.6) * (w * 0.22);
    const cy1 = h * 0.38 + Math.cos(time * 0.45) * (h * 0.2);
    const grad1 = bgCtx.createRadialGradient(cx1, cy1, 15, cx1, cy1, w * 0.7);
    grad1.addColorStop(0, 'rgba(45, 254, 84, 0.18)');
    grad1.addColorStop(0.4, 'rgba(20, 110, 40, 0.08)');
    grad1.addColorStop(1, 'transparent');
    bgCtx.fillStyle = grad1;
    bgCtx.fillRect(0, 0, w, h);

    // Node 2: Purple Haze & Ultraviolet Vapor
    const cx2 = w * 0.7 + Math.cos(time * 0.55) * (w * 0.24);
    const cy2 = h * 0.62 + Math.sin(time * 0.7) * (h * 0.22);
    const grad2 = bgCtx.createRadialGradient(cx2, cy2, 15, cx2, cy2, w * 0.72);
    grad2.addColorStop(0, 'rgba(181, 55, 242, 0.15)');
    grad2.addColorStop(0.5, 'rgba(90, 20, 130, 0.06)');
    grad2.addColorStop(1, 'transparent');
    bgCtx.fillStyle = grad2;
    bgCtx.fillRect(0, 0, w, h);

    // Node 3: Electric Aqua Psychedelic Core
    const cx3 = w * 0.5 + Math.sin(time * 0.8) * (w * 0.18);
    const cy3 = h * 0.5 + Math.cos(time * 0.65) * (h * 0.16);
    const grad3 = bgCtx.createRadialGradient(cx3, cy3, 10, cx3, cy3, w * 0.55);
    grad3.addColorStop(0, 'rgba(0, 245, 255, 0.12)');
    grad3.addColorStop(0.45, 'rgba(10, 60, 90, 0.04)');
    grad3.addColorStop(1, 'transparent');
    bgCtx.fillStyle = grad3;
    bgCtx.fillRect(0, 0, w, h);

    // Floating luminous trichome / resin motes with soft sinusoidal drift
    for (const p of bgMotes) {
      p.y += p.speedY;
      p.driftAngle += p.driftSpeed;
      p.x += Math.sin(p.driftAngle) * 0.45;

      if (p.y < -15) {
        p.y = h + 15;
        p.x = Math.random() * w;
      }

      bgCtx.globalAlpha = p.opacity;
      bgCtx.fillStyle = p.hue;
      bgCtx.shadowColor = p.hue;
      bgCtx.shadowBlur = 6;
      bgCtx.beginPath();
      bgCtx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      bgCtx.fill();
    }
    bgCtx.shadowBlur = 0;
    bgCtx.globalAlpha = 1.0;

    bgAnimFrame = requestAnimationFrame(renderBg);
  }

  bgAnimFrame = requestAnimationFrame(renderBg);
}

function resizeBgCanvas() {
  if (!bgCanvas) return;
  bgCanvas.width = window.innerWidth;
  bgCanvas.height = window.innerHeight;
}

// ─── Socket.IO Setup ─────────────────────────────────────────────────────────
function initSocket() {
  socket = io({ reconnectionAttempts: 10 });

  socket.on('connect',    () => console.log('[ws] connected', socket.id));
  socket.on('disconnect', () => showToast('Net cut aayiduchu da baadu... Connect aagudhu!', 'warning'));
  socket.on('reconnect',  () => showToast('Thirumba ulla vandhutta da! Aatam continue aagudhu!', 'success'));

  socket.on('room_joined',          onRoomJoined);
  socket.on('room_updated',         onRoomUpdated);
  socket.on('game_started',         onGameStarted);
  socket.on('state_update',         onStateUpdate);
  socket.on('move_rejected',        onMoveRejected);
  socket.on('player_disconnected',  onPlayerDisconnected);
  socket.on('rematch_vote',         onRematchVote);
  socket.on('error',                data => {
    const errorMap = {
      'Room is full (max 4 players)': 'Room full aayiduchu da, 4 peru thaan aada mudiyum!',
      'Game has already started': 'Aatam already start aayiduchu da, velila nillu!',
      'Name already taken in this room': 'Indha peru already oruthan vachirukaan da, vera peru vai!',
      'Need at least 2 players to start': 'Aatam start panna innum oruthan venum da baadu (min 2 players)!',
      'Room not found. Check the code.': 'Appadi oru room-ae illa da, code-a olunga paathu type pannu!',
      'Game already started': 'Aatam already start aayiduchu da!',
      'Game is not in progress': 'Aatam innum thodangala da baadu!',
    };
    const msg = errorMap[data.message] || data.message || 'Server-la yedho kolaaru da!';
    showToast(msg, 'error');
  });
}

// ─── UI Bindings ─────────────────────────────────────────────────────────────
function initUI() {
  // Utility buttons
  const soundBtns = [$('audio-toggle-btn'), $('ingame-sound-btn')].filter(Boolean);
  soundBtns.forEach(b => {
    b.addEventListener('click', toggleAudio);
    b.addEventListener('pointerdown', () => unlockAudioContext());
  });
  $('motion-toggle-btn').addEventListener('click', toggleMotion);
  $('slang-toggle-btn').addEventListener('click', toggleSlang);
  $('freq-toggle-btn').addEventListener('click', cycleFrequency);
  $('ingame-slang-btn').addEventListener('click', toggleSlang);
  if ($('ingame-freq-btn')) $('ingame-freq-btn').addEventListener('click', cycleFrequency);

  // Landing
  $('create-room-btn').addEventListener('click', createRoom);
  $('show-join-btn').addEventListener('click', toggleJoinSection);
  $('join-room-btn').addEventListener('click', joinRoom);
  $('player-name').addEventListener('keydown', e => { if (e.key === 'Enter') createRoom(); });
  $('join-code').addEventListener('keydown',   e => { if (e.key === 'Enter') joinRoom(); });
  $('join-code').addEventListener('input',     e => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  });

  // Lobby
  $('copy-code-btn').addEventListener('click', copyRoomCode);
  $('start-game-btn').addEventListener('click', startGame);
  $('grid-size-select').addEventListener('change', e => {
    const [r, c] = e.target.value.split('x').map(Number);
    gridSize = { rows: r, cols: c };
  });

  // Board
  $('game-board').addEventListener('click', onCellClick);
  $('game-room-badge').addEventListener('click', copyRoomCode);

  // Game over
  $('rematch-btn').addEventListener('click', requestRematch);
  $('leave-btn').addEventListener('click', () => location.reload());

  // Window resize -> recalculate cell size & fx canvas
  window.addEventListener('resize', () => {
    if (currentState) {
      renderBoard(currentState);
      syncFxCanvas();
    }
  });
}

// ─── Screen Transitions ──────────────────────────────────────────────────────
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active');
    s.classList.add('hidden');
  });
  const el = $('screen-' + name);
  if (el) {
    el.classList.remove('hidden');
    el.classList.add('active');
  }

  // Hide floating global utils when game screen is active to keep in-game topbar perfectly clean
  const globalUtils = document.querySelector('.global-utils');
  if (globalUtils) {
    globalUtils.style.display = (name === 'game') ? 'none' : 'flex';
  }
}

// ─── Landing Actions ─────────────────────────────────────────────────────────
function getPlayerName() {
  const name = $('player-name').value.trim();
  if (!name) {
    showToast('Dei baadu, modhalla un pera type pannuda!', 'error');
    $('player-name').focus();
    return null;
  }
  return name;
}

function createRoom() {
  const name = getPlayerName();
  if (!name) return;
  socket.emit('create_room', { playerName: name });
}

function toggleJoinSection() {
  const sec = $('join-section');
  sec.classList.toggle('hidden');
  if (!sec.classList.contains('hidden')) $('join-code').focus();
}

function joinRoom() {
  const name = getPlayerName();
  if (!name) return;
  const code = $('join-code').value.trim().toUpperCase();
  if (code.length !== 6) {
    showToast('6 letter room code poduda olunga!', 'error');
    return;
  }
  socket.emit('join_room', { roomCode: code, playerName: name });
}

// ─── Lobby Handlers ──────────────────────────────────────────────────────────
function onRoomJoined(data) {
  const { roomCode, players, hostId, playerId, isHost: host, reconnected, gameState } = data;
  myPlayerId = playerId;
  myRoomCode = roomCode;
  isHost     = host;

  if (reconnected && gameState) {
    onGameStarted({ state: gameState });
    showToast('Thirumba ulla vandhutta da! Back to game!', 'success');
    return;
  }

  $('lobby-room-code').textContent = roomCode;
  setHostControls(host);
  updateLobbyPlayers(players, hostId);
  $('lobby-status').textContent = host
    ? 'Code-a un pasangalukku anupu da, 2-4 aalu koodanum!'
    : 'Host payya start pandra varaikkum amaidhiyaa iru da...';
  showScreen('lobby');
}

function onRoomUpdated(data) {
  const { players, hostId } = data;
  updateLobbyPlayers(players, hostId);
  const amHost = hostId === myPlayerId;
  if (amHost && !isHost) {
    isHost = true;
    setHostControls(true);
  }
}

function setHostControls(host) {
  const hc = $('host-controls');
  if (host) {
    hc.classList.remove('hidden');
  } else {
    hc.classList.add('hidden');
  }
}

function updateLobbyPlayers(players, hostId) {
  const list     = $('players-list');
  const cnt      = $('player-count');
  const startBtn = $('start-game-btn');
  const connected = players.filter(p => p.connected);

  cnt.textContent = `${connected.length} / 8`;
  if (startBtn) startBtn.disabled = connected.length < 2;

  list.innerHTML = '';
  players.forEach(player => {
    const li = document.createElement('li');
    li.className = 'player-item';
    li.innerHTML = `
      <span class="player-dot" style="background:${esc(player.color)};box-shadow:0 0 7px ${esc(player.color)}"></span>
      <span>${esc(player.name)}</span>
      ${player.id === hostId ? '<span class="host-badge">Periya Poolan</span>' : ''}
      ${!player.connected ? '<span class="disconnected-badge">OODITAAN (OFFLINE)</span>' : ''}
    `;
    list.appendChild(li);
  });
}

function copyRoomCode() {
  const code = myRoomCode || $('lobby-room-code').textContent;
  if (!code || code === '——') return;
  navigator.clipboard.writeText(code)
    .then(() => showToast(`Room code ${code} copy aayiduchu da, WhatsApp-la thooki podu!`, 'success'))
    .catch(() => showToast(`Room Code: ${code}`, 'info'));
}

function startGame() {
  socket.emit('start_game', { roomCode: myRoomCode, rows: gridSize.rows, cols: gridSize.cols });
}

// ─── Game Started ────────────────────────────────────────────────────────────
function onGameStarted(data) {
  currentState  = data.state;
  prevGridFlat  = null;

  $('game-room-code-display').textContent = myRoomCode;
  showScreen('game');
  renderAll(currentState);
  syncFxCanvas();
}

// ─── Tamil Slang Commentary System ───────────────────────────────────────────
let currentCommentaryPriority = 0;
let commentaryTimer = null;
let commentaryShowTime = 0;

function handleCommentary(commentary) {
  if (!slangEnabled || !commentary || !commentary.text) return;

  const p = commentary.priority || 1;

  // Frequency Filtering
  if (slangFrequency === 'low') {
    // Low only triggers on major events (waves >= 2, elimination, victory)
    if (p < 3) return;
  } else if (slangFrequency === 'med') {
    // Medium allows p >= 2, and ~40% of ordinary moves (p === 1)
    if (p === 1 && Math.random() > 0.4) return;
  } else {
    // High: shows commentary, but throttles ordinary moves to min 2.2s gap
    const now = Date.now();
    if (p === 1 && now - commentaryShowTime < 2200) return;
  }

  const now = Date.now();
  // If higher priority message is currently on screen and was displayed recently, keep it
  if (commentaryTimer && currentCommentaryPriority > p && (now - commentaryShowTime < 2200)) {
    return;
  }

  currentCommentaryPriority = p;
  commentaryShowTime = now;

  const banner = $('commentary-banner');
  const catEl = $('commentary-category');
  const textEl = $('commentary-text');
  if (!banner || !textEl) return;

  if (catEl) catEl.textContent = (commentary.category || 'roast').toUpperCase().replace('_', ' ');
  textEl.textContent = commentary.text;

  if (commentary.major) {
    banner.classList.add('major');
    playRoastAccent();
  } else {
    banner.classList.remove('major');
  }

  banner.classList.remove('hidden');

  clearTimeout(commentaryTimer);
  const duration = commentary.major ? 4200 : 3200;
  commentaryTimer = setTimeout(() => {
    banner.classList.add('hidden');
    currentCommentaryPriority = 0;
    commentaryTimer = null;
  }, duration);
}

// ─── State Update & Cascade Processing ───────────────────────────────────────
function onStateUpdate(data) {
  if (data.skippedPlayer) {
    showToast(`${data.skippedPlayer} turn skipped (disconnected)`, 'warning');
  }

  const waves = data.waves || [];
  const lastMove = data.lastMove;

  // Trigger contextual Tamil Slang Commentary
  if (data.commentary) {
    if (waves.length > 0) {
      setTimeout(() => handleCommentary(data.commentary), 100);
    } else {
      handleCommentary(data.commentary);
    }
  }

  // Single move or cascade
  if (waves.length === 0) {
    if (lastMove) {
      const p = data.state.players.find(pl => pl.id === lastMove.playerId);
      playOrbPlace(p ? p.color : '#2DFE54');
      animateSinglePlacement(lastMove.row, lastMove.col);
    }
    applyAuthoritativeState(data.state);
  } else {
    // Chain reaction cascade sequence!
    executeCascadeSequence(data, waves);
  }
}

function applyAuthoritativeState(state) {
  prevGridFlat = currentState ? flatGrid(currentState.grid) : null;
  currentState = state;
  renderAll(currentState);

  if (currentState.status === 'finished') {
    setTimeout(() => {
      playVictory();
      showGameOver(currentState);
    }, 700);
  }
}

function animateSinglePlacement(row, col) {
  const board = $('game-board');
  if (!board || !currentState) return;
  const idx = row * currentState.cols + col;
  const cell = board.children[idx];
  if (cell) {
    cell.classList.add('receiving-ripple');
    setTimeout(() => cell.classList.remove('receiving-ripple'), 360);
  }
}

// ─── Hypnotic Cascade Engine (FX Canvas) ──────────────────────────────────────
function syncFxCanvas() {
  const frame = $('board-frame');
  const canvas = $('fx-canvas');
  if (!frame || !canvas) return;
  canvas.width = frame.clientWidth;
  canvas.height = frame.clientHeight;
}

function executeCascadeSequence(data, waves) {
  if (motionReduced) {
    // Immediate clean sync without cascading delay
    if (waves.length > 0) playCellBurst();
    applyAuthoritativeState(data.state);
    return;
  }

  isAnimatingFX = true;
  syncFxCanvas();
  const fxCanvas = $('fx-canvas');
  const ctx = fxCanvas ? fxCanvas.getContext('2d') : null;
  const board = $('game-board');

  let currentWaveIdx = 0;

  // Determine bursting player color
  const burstPlayer = data.state.players.find(p => p.id === (data.lastMove ? data.lastMove.playerId : null));
  const burstColor = burstPlayer ? burstPlayer.color : '#2DFE54';

  function runNextWave() {
    if (currentWaveIdx >= waves.length) {
      // Cascade ended: clear fx canvas and snap to final authoritative server state
      if (ctx) ctx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
      isAnimatingFX = false;
      applyAuthoritativeState(data.state);
      return;
    }

    const wave = waves[currentWaveIdx];
    playCellBurst();
    playCascadeWave(currentWaveIdx);

    // 1. Burst exploding cells, spawn shockwaves & gather trail vectors
    const trails = [];
    const shockwaves = [];
    const sparks = [];

    wave.forEach(({ row, col, neighbors }) => {
      const idx = row * currentState.cols + col;
      const cell = board.children[idx];
      if (cell) {
        cell.classList.add('bursting');
        setTimeout(() => cell.classList.remove('bursting'), 260);

        const r1 = cell.getBoundingClientRect();
        const fR = $('board-frame').getBoundingClientRect();
        const startX = r1.left - fR.left + r1.width / 2;
        const startY = r1.top - fR.top + r1.height / 2;

        shockwaves.push({ x: startX, y: startY, color: burstColor });

        // Spawn 6 sparks per exploding cell
        for (let i = 0; i < 6; i++) {
          const ang = Math.random() * Math.PI * 2;
          const spd = 1.0 + Math.random() * 2.8;
          sparks.push({
            x: startX,
            y: startY,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd,
            color: burstColor,
            size: 1.5 + Math.random() * 2
          });
        }

        neighbors.forEach(([nr, nc]) => {
          const nIdx = nr * currentState.cols + nc;
          const nCell = board.children[nIdx];
          if (nCell) {
            const r2 = nCell.getBoundingClientRect();
            const endX = r2.left - fR.left + r2.width / 2;
            const endY = r2.top - fR.top + r2.height / 2;
            trails.push({ startX, startY, endX, endY, targetCell: nCell });
          }
        });
      }
    });

    // 2. Animate psychedelic plasma trails, shockwaves & sparks
    const trailDuration = waves.length > 25 ? 45 : (waves.length > 10 ? 80 : 140);
    const waveDelay = waves.length > 25 ? 20 : (waves.length > 10 ? 40 : 75);
    const startTime = performance.now();

    function drawTrails(now) {
      const elapsed = now - startTime;
      const progress = Math.min(1.0, elapsed / trailDuration);

      if (ctx) {
        ctx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);

        // Draw expanding neon shockwave rings
        shockwaves.forEach(sw => {
          ctx.beginPath();
          ctx.arc(sw.x, sw.y, 4 + progress * 26, 0, Math.PI * 2);
          ctx.strokeStyle = sw.color;
          ctx.lineWidth = Math.max(1, (1 - progress) * 3);
          ctx.globalAlpha = (1 - progress) * 0.85;
          ctx.shadowColor = sw.color;
          ctx.shadowBlur = 10;
          ctx.stroke();
        });
        ctx.globalAlpha = 1.0;

        // Draw glowing plasma beams
        trails.forEach(t => {
          const curX = t.startX + (t.endX - t.startX) * progress;
          const curY = t.startY + (t.endY - t.startY) * progress;

          // Glowing plasma beam
          ctx.beginPath();
          ctx.moveTo(t.startX, t.startY);
          ctx.lineTo(curX, curY);
          ctx.strokeStyle = burstColor;
          ctx.lineWidth = 3;
          ctx.shadowColor = burstColor;
          ctx.shadowBlur = 10;
          ctx.stroke();

          // High-voltage droplet head
          ctx.beginPath();
          ctx.arc(curX, curY, 4, 0, Math.PI * 2);
          ctx.fillStyle = '#FFFFFF';
          ctx.shadowColor = burstColor;
          ctx.shadowBlur = 14;
          ctx.fill();
        });

        // Draw scattering fluorescent sparks
        sparks.forEach(s => {
          ctx.beginPath();
          const sx = s.x + s.vx * progress * 14;
          const sy = s.y + s.vy * progress * 14;
          ctx.arc(sx, sy, s.size * (1 - progress * 0.6), 0, Math.PI * 2);
          ctx.fillStyle = s.color;
          ctx.shadowColor = s.color;
          ctx.shadowBlur = 8;
          ctx.fill();
        });

        ctx.shadowBlur = 0;
      }

      if (progress < 1.0) {
        requestAnimationFrame(drawTrails);
      } else {
        // Impact on receiving cells
        trails.forEach(t => {
          t.targetCell.classList.add('receiving-ripple');
          setTimeout(() => t.targetCell.classList.remove('receiving-ripple'), 300);
        });

        // Delay to next wave
        currentWaveIdx++;
        setTimeout(runNextWave, waveDelay);
      }
    }

    requestAnimationFrame(drawTrails);
  }

  runNextWave();
}

function onMoveRejected(data) {
  const reasonMap = {
    'Not your turn': 'Dei avasara koodhi, un turn illa da!',
    'Cell belongs to another player': 'Adhu vera aaloda cell-u da, anga kaiya vekkadha!',
    'Game is not in progress': 'Aatam innum thodangala da baadu!',
    'Cell out of bounds': 'Board-ai thaandi enga pora loosu!',
  };
  const msg = reasonMap[data.reason] || data.reason || 'Anga vaikka mudiyadhu da baadu!';
  showToast(msg, 'error');
}

function onPlayerDisconnected(data) {
  const { players, hostId } = data;
  if (!$('screen-lobby').classList.contains('hidden')) {
    updateLobbyPlayers(players, hostId);
  }
  if (currentState) {
    currentState.players.forEach(p => {
      const sp = players.find(pl => pl.id === p.id);
      if (sp) p.connected = sp.connected;
    });
    renderPlayerList(currentState);
  }
  showToast('Oru payya payandhu ooditaan da (Disconnected)!', 'warning');
}

function onRematchVote(data) {
  $('rematch-info').textContent = `${data.votes} / ${data.total} peru rematch-ku ready aayitaanga!`;
}

// ─── Rendering ────────────────────────────────────────────────────────────────
function renderAll(state) {
  renderTurnIndicator(state);
  renderPlayerList(state);
  renderBoard(state);
}

function renderTurnIndicator(state) {
  const { players, currentPlayerIndex, status } = state;
  const el   = $('turn-indicator');
  const dot  = el.querySelector('.turn-dot');
  const text = el.querySelector('.turn-text');
  const frame = $('board-frame');

  if (status === 'finished') {
    dot.style.background = '';
    text.textContent = 'Aatam Mudinjiduchu Da!';
    el.className = 'turn-indicator';
    if (frame) frame.style.removeProperty('--current-turn-color');
    return;
  }

  const cur  = players[currentPlayerIndex];
  const isMe = cur && cur.id === myPlayerId;

  dot.style.background = cur ? cur.color : '#F0FDF4';
  text.textContent = isMe ? 'Un Turn Dha! Podu!' : (cur ? `${cur.name}'s Turn ! Thailee ennamo pandran...` : '—');
  el.className = 'turn-indicator' + (isMe ? ' my-turn' : '');

  if (frame && cur) {
    frame.style.setProperty('--current-turn-color', cur.color);
  }
}

function renderPlayerList(state) {
  const { players, currentPlayerIndex } = state;
  const list = $('game-players-list');
  list.innerHTML = '';

  players.forEach((p, i) => {
    const div = document.createElement('div');
    div.className = 'game-player-item' +
      (i === currentPlayerIndex ? ' active-player' : '') +
      (!p.alive                 ? ' eliminated'    : '');

    div.innerHTML = `
      <span class="player-dot" style="background:${esc(p.color)};color:${esc(p.color)}"></span>
      <span class="player-name" title="${esc(p.name)}">${esc(p.name)}</span>
      <span class="orb-count">${p.alive ? p.orbCount : '✕'}</span>
    `;
    list.appendChild(div);
  });
}

function renderBoard(state) {
  const { grid, rows, cols, players, currentPlayerIndex, status } = state;
  const board  = $('game-board');
  const total  = rows * cols;

  board.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  const cellPx = computeCellSize(rows, cols);

  // Sync cell count
  while (board.children.length < total) {
    const c = document.createElement('div');
    c.className = 'cell';
    c.setAttribute('role', 'gridcell');
    board.appendChild(c);
  }
  while (board.children.length > total) board.removeChild(board.lastChild);

  const curPlayer = players[currentPlayerIndex];
  const isMyTurn  = curPlayer && curPlayer.id === myPlayerId && status === 'playing';
  const myPlayer  = players.find(p => p.id === myPlayerId);

  let idx = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell     = board.children[idx];
      const cellData = grid[r][c];
      const owner    = cellData.owner ? players.find(p => p.id === cellData.owner) : null;

      // Set dimensions
      cell.style.width  = cellPx + 'px';
      cell.style.height = cellPx + 'px';
      cell.dataset.row = r;
      cell.dataset.col = c;
      cell.dataset.orbs = cellData.orbs;

      // Reset classes
      cell.className = 'cell';
      if (owner) {
        cell.classList.add('owned');
        cell.style.setProperty('--cell-color', owner.color);
      } else {
        cell.style.removeProperty('--cell-color');
      }

      // Clickable check
      const canClick = isMyTurn && (cellData.owner === null || cellData.owner === myPlayerId);
      if (canClick) {
        cell.classList.add('clickable');
        if (myPlayer) cell.style.setProperty('--cell-hover-color', myPlayer.color);
      }

      // Critical mass indicator (one orb away from exploding)
      const cm = getCM(r, c, rows, cols);
      if (owner && cellData.orbs === cm - 1) {
        cell.classList.add('critical');
      }

      // Accessibility
      cell.setAttribute('aria-label',
        owner ? `${owner.name}: ${cellData.orbs} orb${cellData.orbs !== 1 ? 's' : ''}` : 'empty cell');

      // Render 3D Molecular Cluster Orbs
      renderOrbs(cell, cellData.orbs, owner ? owner.color : null);
      idx++;
    }
  }
}

function renderOrbs(cell, count, color) {
  cell.querySelectorAll('.orb-cluster, .orb').forEach(o => o.remove());
  if (count <= 0 || !color) return;

  const clusterCount = Math.min(count, 4);
  const cluster = document.createElement('div');
  cluster.className = `orb-cluster cluster-${clusterCount}`;

  for (let i = 0; i < clusterCount; i++) {
    const orb = document.createElement('span');
    orb.className = 'orb';
    orb.style.setProperty('--orb-color', color);
    cluster.appendChild(orb);
  }

  cell.appendChild(cluster);
}

function computeCellSize(rows, cols) {
  const wrapper = document.querySelector('.board-wrapper');
  if (!wrapper) return 48;
  const { width, height } = wrapper.getBoundingClientRect();
  const gap    = 2;
  const padPx  = (width < 480) ? 8 : 16;
  const avW    = width  - padPx - gap * (cols - 1);
  const avH    = height - padPx - gap * (rows - 1);
  const byW    = Math.floor(avW / cols);
  const byH    = Math.floor(avH / rows);
  return Math.max(26, Math.min(byW, byH, 68));
}

function getCM(r, c, rows, cols) {
  let n = 0;
  if (r > 0) n++; if (r < rows - 1) n++;
  if (c > 0) n++; if (c < cols - 1) n++;
  return n;
}

// ─── Cell Click ───────────────────────────────────────────────────────────────
function onCellClick(e) {
  const cell = e.target.closest('.cell.clickable');
  if (!cell || isAnimatingFX) return;
  unlockAudioContext();
  socket.emit('place_orb', {
    roomCode: myRoomCode,
    row: parseInt(cell.dataset.row),
    col: parseInt(cell.dataset.col),
  });
}

// ─── Game Over ────────────────────────────────────────────────────────────────
function showGameOver(state) {
  const winner = state.winner;
  const ann    = $('winner-announcement');

  if (winner) {
    ann.innerHTML = `
      <div class="winner-color-dot"
           style="background:${esc(winner.color)};box-shadow:0 0 30px ${esc(winner.color)}"></div>
      <h2 class="winner-title">OTHAAA! ${esc(winner.name)} THAAN DA WINNER-U! 👑</h2>
    `;
  } else {
    ann.innerHTML = '<h2 class="winner-title">Aatam Mudinjiduchu Da!</h2>';
  }

  $('rematch-btn').disabled    = false;
  $('rematch-btn').innerHTML   = '<span class="btn-indicator"></span> Innoru Match Podalaama? (Rematch)';
  $('rematch-info').textContent = '';
  showScreen('gameover');
}

function requestRematch() {
  socket.emit('request_rematch', { roomCode: myRoomCode });
  $('rematch-btn').disabled    = true;
  $('rematch-btn').textContent = '✓ Vote Potachu — Mathavanunga Podatum...';
}

// ─── Toast System ─────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg, type = 'info') {
  const el = $('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = `toast toast-${type} visible`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visible'), 3000);
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function esc(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(String(str)));
  return d.innerHTML;
}

function flatGrid(grid) {
  return grid.flatMap(row => row.map(c => ({ orbs: c.orbs, owner: c.owner })));
}
