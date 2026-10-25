/**
 * Chain Reaction — Standalone Local Pass & Play Game Engine & UI
 * Pure client-side zero-latency execution. Runs directly in browser on one mobile phone.
 */

'use strict';

// ─── Constants & Color Palette ────────────────────────────────────────────────
const PLAYER_COLORS = [
  '#2DFE54', // Cannabis Electric Green
  '#FF007F', // Acid Magenta
  '#00F5FF', // Electric Cyan
  '#FFB703', // Solar Amber
  '#B537F2', // Ultraviolet Violet
  '#FF3333', // Toxic Flame Red
  '#FFE600', // Electric Lemon
  '#00FFA3', // Mint Trichome Teal
];

const DEFAULT_NAMES = [
  'Thalaivar',
  'Singam',
  'Rowdy',
  'KD Paiyan',
  'Gethu Mass',
  'Vera Mari',
  'Attacker',
  'Ganja Gopal',
];

const TAMIL_ROASTS = {
  victory: [
    'OTHAAAA! {player} THAAN DA MASS WINNER-U! 👑',
    'Dei dei dei, {player} vera level-la vachu senjitaan da!',
    'MASS DA! Motha board-um {player}-ku surrender aayiduchu!',
    'Ommala, champion vandhuttaan da {player}! Orama po!',
    'OTHAA, KING-U DA NEE {player}!'
  ],
  elimination: [
    'AYYAYYOOO! {player} GAME-LENDHU KAALI! 💀',
    'Otha, {player} kathai mudinjiduchu, orama po!',
    'Motha game-la irundhu exit-u {player}! Veetukku kelambu!',
    'Baadu maari aadi {player} ippo orama ukkaandhu azhudhutu irukkaan!'
  ],
  cascade: [
    'OTHA! CHAIN REACTION DAWWW! {waves} WAVES BLAST! 💥',
    'Dei {player}, motha board-um vedichu sitharudhu da!',
    'Ommala, enna destruction da idhu?! Board-e katharudhu!',
    'Thala, ore move-la sambavam pannita {player}!'
  ],
  ordinary: [
    'Dei {player}, paathu aadu da!',
    'Ennada strategic look-u vidra? Move mattum mokkaya irukku!',
    'Manda bathram da {player}, adutha move kavanama kudu!',
    'Otha {player}, semma build-up!'
  ]
};

// ─── State ───────────────────────────────────────────────────────────────────
let playerCount = 2;
let localPlayers = [];
let boardRows = 9;
let boardCols = 6;
let slangEnabled = true;
let audioEnabled = true;

// Engine state
let grid = [];
let enginePlayers = [];
let currentPlayerIndex = 0;
let turnNumber = 0;
let gameStatus = 'setup'; // 'setup' | 'playing' | 'finished'
let winner = null;
let moveHistory = []; // For Undo functionality
let isAnimatingFX = false;
let passPhoneModalShown = false;

// ─── DOM Helpers ─────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ─── Web Audio Synthesis ─────────────────────────────────────────────────────
let audioCtx = null;
function getAudioContext() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) audioCtx = new AudioContext();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function playOrbPlace() {
  if (!audioEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(680, now);
  osc.frequency.exponentialRampToValueAtTime(260, now + 0.1);
  gain.gain.setValueAtTime(0.35, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.1);
}

function playCellBurst() {
  if (!audioEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(160, now);
  osc.frequency.exponentialRampToValueAtTime(45, now + 0.18);
  gain.gain.setValueAtTime(0.5, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.18);
}

function playVictory() {
  if (!audioEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99];
  notes.forEach((freq, idx) => {
    const t = ctx.currentTime + idx * 0.1;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.3);
  });
}

// ─── Setup Screen UI ─────────────────────────────────────────────────────────
function initSetupScreen() {
  renderSetupPlayers();

  $('btn-dec-players').onclick = () => {
    if (playerCount > 2) {
      playerCount--;
      $('display-player-count').textContent = playerCount;
      renderSetupPlayers();
    }
  };

  $('btn-inc-players').onclick = () => {
    if (playerCount < 8) {
      playerCount++;
      $('display-player-count').textContent = playerCount;
      renderSetupPlayers();
    }
  };

  $('local-slang-toggle').onclick = () => {
    slangEnabled = !slangEnabled;
    $('local-slang-dot').className = 'hud-pill-dot' + (slangEnabled ? ' active' : '');
    $('local-slang-text').textContent = slangEnabled ? 'GAALI: ON' : 'GAALI: OFF';
  };

  $('local-sound-toggle').onclick = () => {
    audioEnabled = !audioEnabled;
    $('local-sound-dot').className = 'hud-pill-dot' + (audioEnabled ? ' active' : '');
    $('local-sound-text').textContent = audioEnabled ? 'SATHAM: ON' : 'SATHAM: OFF';
    if (audioEnabled) getAudioContext();
  };

  $('btn-start-local').onclick = startLocalGame;
  $('btn-pass-ready').onclick = dismissTurnModal;
  if ($('btn-pass-dont-show-again')) {
    $('btn-pass-dont-show-again').onclick = () => {
      localStorage.setItem('cr_local_pass_modal_disabled', 'true');
      dismissTurnModal();
      showToast('Pass phone reminder disabled for future games!', 'info');
    };
  }
  const turnModalEl = $('turn-change-modal');
  if (turnModalEl) {
    turnModalEl.onclick = (e) => {
      if (e.target === turnModalEl) dismissTurnModal();
    };
  }
  $('btn-local-undo').onclick = undoLastMove;
  $('btn-local-restart').onclick = restartCurrentMatch;
  $('btn-local-play-again').onclick = restartCurrentMatch;
  $('btn-local-change-settings').onclick = () => showScreen('setup');

  // Custom Grid Creator Controls (Local)
  const localGridSelect = $('local-grid-size');
  const customLocalBuilder = $('custom-grid-builder-local');
  const localRowsInput = $('custom-rows-local');
  const localColsInput = $('custom-cols-local');
  const localSummaryEl = $('custom-grid-summary-local');

  function updateLocalCustomGridSummary() {
    if (!localRowsInput || !localColsInput || !localSummaryEl) return;
    let r = parseInt(localRowsInput.value) || 14;
    let c = parseInt(localColsInput.value) || 14;
    r = Math.max(3, Math.min(24, r));
    c = Math.max(3, Math.min(24, c));
    localRowsInput.value = r;
    localColsInput.value = c;
    const cells = r * c;
    const shape = r === c ? 'Square' : (r > c ? 'Portrait' : 'Landscape');
    localSummaryEl.textContent = `${r} \u00D7 ${c} \u2022 ${cells} Cells (${shape})`;

    if (customLocalBuilder) {
      customLocalBuilder.querySelectorAll('.preset-chip').forEach(btn => {
        const pr = parseInt(btn.dataset.r);
        const pc = parseInt(btn.dataset.c);
        btn.classList.toggle('active', pr === r && pc === c);
      });
    }
  }

  if (localGridSelect) {
    localGridSelect.addEventListener('change', e => {
      if (e.target.value === 'custom') {
        if (customLocalBuilder) customLocalBuilder.classList.remove('hidden');
        updateLocalCustomGridSummary();
      } else {
        if (customLocalBuilder) customLocalBuilder.classList.add('hidden');
      }
    });
  }

  if (customLocalBuilder) {
    customLocalBuilder.querySelectorAll('.dim-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.target;
        const delta = parseInt(btn.dataset.delta) || 0;
        const input = $(targetId);
        if (input) {
          const cur = parseInt(input.value) || 14;
          input.value = Math.max(3, Math.min(24, cur + delta));
          updateLocalCustomGridSummary();
        }
      });
    });

    if (localRowsInput) {
      localRowsInput.addEventListener('input', updateLocalCustomGridSummary);
    }
    if (localColsInput) {
      localColsInput.addEventListener('input', updateLocalCustomGridSummary);
    }

    customLocalBuilder.querySelectorAll('.preset-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const r = parseInt(btn.dataset.r);
        const c = parseInt(btn.dataset.c);
        if (localRowsInput) localRowsInput.value = r;
        if (localColsInput) localColsInput.value = c;
        updateLocalCustomGridSummary();
      });
    });
  }

  window.addEventListener('resize', () => {
    if (gameStatus === 'playing') {
      renderBoard();
      syncFxCanvas();
    }
  });

  const boardEl = $('game-board');
  boardEl.addEventListener('click', handleCellClick);
  boardEl.addEventListener('touchend', (e) => {
    const cell = e.target.closest('.cell');
    if (cell) {
      e.preventDefault();
      handleCellClick({ target: cell });
    }
  }, { passive: false });
}

function renderSetupPlayers() {
  const container = $('local-players-setup-list');
  container.innerHTML = '';

  for (let i = 0; i < playerCount; i++) {
    const color = PLAYER_COLORS[i % PLAYER_COLORS.length];
    const defaultName = DEFAULT_NAMES[i % DEFAULT_NAMES.length];

    const card = document.createElement('div');
    card.className = 'player-setup-card';
    card.style.setProperty('--card-color', color);

    card.innerHTML = `
      <div class="player-color-preview" style="background:${color}; color:${color};"></div>
      <div class="player-setup-inputs">
        <label class="player-setup-label">Player ${i + 1} (${color})</label>
        <input type="text" class="player-name-input" id="player-input-${i}"
               value="${defaultName}" maxlength="18" autocomplete="off" spellcheck="false" />
      </div>
    `;
    container.appendChild(card);
  }
}

function showScreen(screen) {
  $('screen-local-setup').classList.toggle('hidden', screen !== 'setup');
  $('screen-local-game').classList.toggle('hidden', screen !== 'game');
  $('screen-local-gameover').classList.toggle('hidden', screen !== 'gameover');
}

// ─── Local Engine Logic ──────────────────────────────────────────────────────
function startLocalGame() {
  getAudioContext();
  passPhoneModalShown = false;
  let r, c;
  const selectVal = $('local-grid-size').value;
  if (selectVal === 'custom') {
    const rInput = $('custom-rows-local');
    const cInput = $('custom-cols-local');
    r = Math.max(3, Math.min(24, parseInt(rInput ? rInput.value : 14) || 14));
    c = Math.max(3, Math.min(24, parseInt(cInput ? cInput.value : 14) || 14));
  } else {
    [r, c] = selectVal.split('x').map(Number);
  }
  boardRows = r;
  boardCols = c;

  enginePlayers = [];
  for (let i = 0; i < playerCount; i++) {
    const input = $(`player-input-${i}`);
    const name = (input && input.value.trim()) ? input.value.trim() : DEFAULT_NAMES[i];
    enginePlayers.push({
      id: `p${i + 1}`,
      name,
      color: PLAYER_COLORS[i % PLAYER_COLORS.length],
      orbCount: 0,
      alive: true,
      hasPlayed: false,
    });
  }

  // Create clean grid
  grid = Array.from({ length: boardRows }, () =>
    Array.from({ length: boardCols }, () => ({ owner: null, orbs: 0 }))
  );

  currentPlayerIndex = 0;
  turnNumber = 0;
  gameStatus = 'playing';
  winner = null;
  moveHistory = [];
  isAnimatingFX = false;

  showScreen('game');
  renderTurnIndicator();
  renderPlayerList();
  renderBoard();
  syncFxCanvas();

  showToast(`Match Thodangiyadhu! ${enginePlayers[0].name} un turn da! 💥`, 'info');
}

function restartCurrentMatch() {
  // Re-use current players and restart clean
  passPhoneModalShown = false;
  grid = Array.from({ length: boardRows }, () =>
    Array.from({ length: boardCols }, () => ({ owner: null, orbs: 0 }))
  );
  enginePlayers.forEach(p => {
    p.orbCount = 0;
    p.alive = true;
    p.hasPlayed = false;
  });
  currentPlayerIndex = 0;
  turnNumber = 0;
  gameStatus = 'playing';
  winner = null;
  moveHistory = [];
  isAnimatingFX = false;

  showScreen('game');
  renderTurnIndicator();
  renderPlayerList();
  renderBoard();
  syncFxCanvas();
  showToast(`Match Restarted! ${enginePlayers[0].name} Start pannu!`, 'info');
}

function getCriticalMass(row, col) {
  let n = 0;
  if (row > 0) n++;
  if (row < boardRows - 1) n++;
  if (col > 0) n++;
  if (col < boardCols - 1) n++;
  return n;
}

function getNeighbors(row, col) {
  return [
    row > 0 ? [row - 1, col] : null,
    row < boardRows - 1 ? [row + 1, col] : null,
    col > 0 ? [row, col - 1] : null,
    col < boardCols - 1 ? [row, col + 1] : null,
  ].filter(Boolean);
}

function handleCellClick(e) {
  if (gameStatus !== 'playing' || isAnimatingFX) return;
  const cell = e.target.closest('.cell');
  if (!cell) return;

  const r = parseInt(cell.dataset.row);
  const c = parseInt(cell.dataset.col);
  const cellData = grid[r][c];
  const curPlayer = enginePlayers[currentPlayerIndex];

  if (cellData.owner !== null && cellData.owner !== curPlayer.id) {
    showToast('Adhu vera aaloda cell-u da! Un cell-la podu!', 'error');
    return;
  }

  // Save snapshot for Undo
  saveSnapshot();

  // Place orb
  playOrbPlace();
  cellData.orbs += 1;
  cellData.owner = curPlayer.id;
  curPlayer.hasPlayed = true;

  // Run cascade
  const waves = runCascade(curPlayer.id);

  // Elimination & victory
  checkElimination();
  checkVictory();

  if (waves.length > 0) {
    executeCascadeFX(waves, curPlayer, () => {
      onMoveFinished(waves);
    });
  } else {
    onMoveFinished(waves);
  }
}

function onMoveFinished(waves) {
  recalculateOrbCounts();
  renderPlayerList();
  renderBoard();

  if (gameStatus === 'finished') {
    triggerVictoryCommentary();
    setTimeout(() => {
      playVictory();
      showGameOver();
    }, 400);
    return;
  }

  // Slang commentary
  triggerMoveCommentary(waves);

  // Advance turn
  advanceTurn();
  renderTurnIndicator();
  renderPlayerList();
  renderBoard();

  // Prompt turn switch modal - ONLY ONCE on the first turn transition
  if (!passPhoneModalShown) {
    passPhoneModalShown = true;
    promptPassPhoneModal();
  }
}

function runCascade(triggeringPlayerId) {
  const waves = [];
  for (let wave = 0; wave < 2000; wave++) {
    const toExplode = [];
    for (let r = 0; r < boardRows; r++) {
      for (let c = 0; c < boardCols; c++) {
        if (grid[r][c].orbs >= getCriticalMass(r, c)) {
          toExplode.push([r, c]);
        }
      }
    }
    if (toExplode.length === 0) break;

    const waveData = [];
    for (const [r, c] of toExplode) {
      const cm = getCriticalMass(r, c);
      const neighbors = getNeighbors(r, c);
      grid[r][c].orbs -= cm;
      if (grid[r][c].orbs <= 0) {
        grid[r][c].orbs = 0;
        grid[r][c].owner = null;
      }
      for (const [nr, nc] of neighbors) {
        grid[nr][nc].orbs += 1;
        grid[nr][nc].owner = triggeringPlayerId;
      }
      waveData.push({ row: r, col: c, neighbors });
    }
    waves.push(waveData);

    // Early exit: if wipeout happened this wave, stop cascading
    recalculateOrbCounts();
    const playersWithOrbs = enginePlayers.filter(p => p.orbCount > 0);
    const playersWhoPlayed = enginePlayers.filter(p => p.hasPlayed);
    if (playersWithOrbs.length === 1 && (turnNumber >= 2 || playersWhoPlayed.length >= 2)) {
      break;
    }
  }

  recalculateOrbCounts();
  return waves;
}

function recalculateOrbCounts() {
  enginePlayers.forEach(p => p.orbCount = 0);
  for (let r = 0; r < boardRows; r++) {
    for (let c = 0; c < boardCols; c++) {
      const { owner, orbs } = grid[r][c];
      if (owner && orbs > 0) {
        const p = enginePlayers.find(pl => pl.id === owner);
        if (p) p.orbCount += orbs;
      }
    }
  }
}

function checkElimination() {
  for (const p of enginePlayers) {
    if (p.hasPlayed && p.alive && p.orbCount === 0) {
      p.alive = false;
      showToast(`${p.name} Game-lendhu Out aayitaan da! 💀`, 'warning');
    }
  }
}

function checkVictory() {
  const alive = enginePlayers.filter(p => p.alive);
  const playersWithOrbs = enginePlayers.filter(p => p.orbCount > 0);
  const playersWhoPlayed = enginePlayers.filter(p => p.hasPlayed);

  // Condition 1: Exactly 1 alive player
  if (alive.length === 1 && turnNumber >= 1) {
    gameStatus = 'finished';
    winner = alive[0];
    return;
  }

  // Condition 2: Total wipeout (all orbs belong to single player after min 2 turns)
  if (playersWithOrbs.length === 1 && (turnNumber >= 2 || playersWhoPlayed.length >= 2)) {
    const w = playersWithOrbs[0];
    enginePlayers.forEach(p => {
      if (p.id !== w.id) {
        p.alive = false;
        p.orbCount = 0;
      }
    });
    w.alive = true;
    gameStatus = 'finished';
    winner = w;
    return;
  }
}

function advanceTurn() {
  let attempts = 0;
  do {
    currentPlayerIndex = (currentPlayerIndex + 1) % enginePlayers.length;
    attempts++;
  } while (!enginePlayers[currentPlayerIndex].alive && attempts <= enginePlayers.length);

  turnNumber++;
  if (!enginePlayers[currentPlayerIndex].alive) {
    checkVictory();
  }
}

// ─── Undo Move ───────────────────────────────────────────────────────────────
function saveSnapshot() {
  const snapshot = {
    grid: grid.map(row => row.map(cell => ({ ...cell }))),
    players: enginePlayers.map(p => ({ ...p })),
    currentPlayerIndex,
    turnNumber,
  };
  moveHistory.push(snapshot);
  if (moveHistory.length > 20) moveHistory.shift();
}

function undoLastMove() {
  if (moveHistory.length === 0 || isAnimatingFX) {
    showToast('Undo panna move edhum illa da!', 'info');
    return;
  }
  const prev = moveHistory.pop();
  grid = prev.grid;
  enginePlayers = prev.players;
  currentPlayerIndex = prev.currentPlayerIndex;
  turnNumber = prev.turnNumber;
  gameStatus = 'playing';
  winner = null;

  renderTurnIndicator();
  renderPlayerList();
  renderBoard();
  showToast('Kadaisi move undo panniyaachu! ↩', 'info');
}

// ─── Pass the Phone Modal ────────────────────────────────────────────────────
function promptPassPhoneModal() {
  if (gameStatus !== 'playing') return;
  if (localStorage.getItem('cr_local_pass_modal_disabled') === 'true') return;
  const nextPlayer = enginePlayers[currentPlayerIndex];
  if (!nextPlayer) return;

  const modal = $('turn-change-modal');
  const card = $('turn-change-card');
  card.style.setProperty('--next-player-color', nextPlayer.color);

  $('pass-player-avatar').style.background = nextPlayer.color;
  $('pass-player-avatar').style.boxShadow = `0 0 30px ${nextPlayer.color}`;
  $('pass-player-name').textContent = nextPlayer.name;
  $('btn-pass-ready').style.background = nextPlayer.color;

  modal.classList.add('visible');
}

function dismissTurnModal() {
  $('turn-change-modal').classList.remove('visible');
}

// ─── Hypnotic Cascade Animation (FX Canvas) ───────────────────────────────────
function syncFxCanvas() {
  const canvas = $('fx-canvas');
  const frame = $('board-frame');
  if (!canvas || !frame) return;
  const rect = frame.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
}

function executeCascadeFX(waves, burstPlayer, onComplete) {
  isAnimatingFX = true;
  const canvas = $('fx-canvas');
  if (!canvas) {
    isAnimatingFX = false;
    onComplete();
    return;
  }
  const ctx = canvas.getContext('2d');
  const board = $('game-board');
  const frame = $('board-frame');
  const burstColor = burstPlayer ? burstPlayer.color : '#2DFE54';

  let currentWaveIdx = 0;
  const trailDuration = waves.length > 10 ? 120 : 160;
  const waveDelay = waves.length > 10 ? 130 : 180;

  function runWave() {
    if (currentWaveIdx >= waves.length) {
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      isAnimatingFX = false;
      onComplete();
      return;
    }

    const wave = waves[currentWaveIdx];
    playCellBurst();

    const trails = [];
    const shockwaves = [];
    const sparks = [];
    const fR = frame.getBoundingClientRect();

    wave.forEach(({ row, col, neighbors }) => {
      const idx = row * boardCols + col;
      const cell = board.children[idx];
      if (cell) {
        cell.classList.add('bursting');
        setTimeout(() => {
          cell.classList.remove('bursting');
          cell.querySelectorAll('.orb-cluster, .orb').forEach(o => o.remove());
          cell.style.removeProperty('--cell-color');
          cell.classList.remove('owned', 'critical');
        }, 260);

        const r1 = cell.getBoundingClientRect();
        const startX = r1.left - fR.left + r1.width / 2;
        const startY = r1.top - fR.top + r1.height / 2;
        shockwaves.push({ x: startX, y: startY, color: burstColor });

        for (let i = 0; i < 5; i++) {
          const ang = Math.random() * Math.PI * 2;
          const spd = 1.0 + Math.random() * 2.5;
          sparks.push({
            x: startX,
            y: startY,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd,
            color: burstColor,
            size: 1.5 + Math.random() * 2,
          });
        }

        neighbors.forEach(([nr, nc]) => {
          const nIdx = nr * boardCols + nc;
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

    const startTime = performance.now();
    function draw(now) {
      const elapsed = now - startTime;
      const progress = Math.min(1.0, elapsed / trailDuration);

      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        shockwaves.forEach(sw => {
          ctx.beginPath();
          ctx.arc(sw.x, sw.y, 4 + progress * 24, 0, Math.PI * 2);
          ctx.strokeStyle = sw.color;
          ctx.lineWidth = Math.max(1, (1 - progress) * 3);
          ctx.globalAlpha = (1 - progress) * 0.85;
          ctx.stroke();
        });
        ctx.globalAlpha = 1.0;

        trails.forEach(t => {
          const curX = t.startX + (t.endX - t.startX) * progress;
          const curY = t.startY + (t.endY - t.startY) * progress;
          ctx.beginPath();
          ctx.moveTo(t.startX, t.startY);
          ctx.lineTo(curX, curY);
          ctx.strokeStyle = burstColor;
          ctx.lineWidth = 3;
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(curX, curY, 4, 0, Math.PI * 2);
          ctx.fillStyle = '#FFFFFF';
          ctx.fill();
        });

        sparks.forEach(s => {
          ctx.beginPath();
          const sx = s.x + s.vx * progress * 12;
          const sy = s.y + s.vy * progress * 12;
          ctx.arc(sx, sy, s.size * (1 - progress * 0.6), 0, Math.PI * 2);
          ctx.fillStyle = s.color;
          ctx.fill();
        });
      }

      if (progress < 1.0) {
        requestAnimationFrame(draw);
      } else {
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        trails.forEach(t => {
          t.targetCell.classList.add('receiving-ripple', 'owned');
          t.targetCell.style.setProperty('--cell-color', burstColor);
          t.targetCell.querySelectorAll('.orb').forEach(orb => {
            orb.style.setProperty('--orb-color', burstColor);
          });
          setTimeout(() => t.targetCell.classList.remove('receiving-ripple'), 260);
        });
        currentWaveIdx++;
        setTimeout(runWave, waveDelay);
      }
    }

    requestAnimationFrame(draw);
  }

  runWave();
}

// ─── Rendering ────────────────────────────────────────────────────────────────
function renderTurnIndicator() {
  const el = $('turn-indicator');
  const dot = el.querySelector('.turn-dot');
  const text = el.querySelector('.turn-text');
  const frame = $('board-frame');

  if (gameStatus === 'finished') {
    dot.style.background = '';
    text.textContent = 'Aatam Mudinjiduchu Da!';
    el.className = 'turn-indicator';
    if (frame) frame.style.removeProperty('--current-turn-color');
    return;
  }

  const cur = enginePlayers[currentPlayerIndex];
  if (cur) {
    dot.style.background = cur.color;
    text.textContent = `${cur.name}'s Turn (Podu da!)`;
    el.className = 'turn-indicator my-turn';
    if (frame) frame.style.setProperty('--current-turn-color', cur.color);
  }
}

function renderPlayerList() {
  const list = $('game-players-list');
  list.innerHTML = '';

  enginePlayers.forEach((p, i) => {
    const div = document.createElement('div');
    div.className = 'game-player-item' +
      (i === currentPlayerIndex ? ' active-player' : '') +
      (!p.alive ? ' eliminated' : '');

    div.innerHTML = `
      <span class="player-dot" style="background:${p.color};color:${p.color}"></span>
      <span class="player-name" title="${p.name}">${p.name}</span>
      <span class="orb-count">${p.alive ? p.orbCount : '✕'}</span>
    `;
    list.appendChild(div);
  });
}

function renderBoard() {
  const board = $('game-board');
  const total = boardRows * boardCols;
  board.style.gridTemplateColumns = `repeat(${boardCols}, 1fr)`;
  board.style.gap = (boardCols > 10 || boardRows > 10) ? '1px' : '2px';

  const cellPx = computeCellSize(boardRows, boardCols);

  while (board.children.length < total) {
    const c = document.createElement('div');
    c.className = 'cell';
    board.appendChild(c);
  }
  while (board.children.length > total) board.removeChild(board.lastChild);

  const curPlayer = enginePlayers[currentPlayerIndex];

  let idx = 0;
  for (let r = 0; r < boardRows; r++) {
    for (let c = 0; c < boardCols; c++) {
      const cell = board.children[idx];
      const cellData = grid[r][c];
      const owner = cellData.owner ? enginePlayers.find(p => p.id === cellData.owner) : null;

      cell.style.width = cellPx + 'px';
      cell.style.height = cellPx + 'px';
      cell.dataset.row = r;
      cell.dataset.col = c;

      cell.className = 'cell';
      if (owner) {
        cell.classList.add('owned');
        cell.style.setProperty('--cell-color', owner.color);
      } else {
        cell.style.removeProperty('--cell-color');
      }

      const canClick = gameStatus === 'playing' && curPlayer && (cellData.owner === null || cellData.owner === curPlayer.id);
      if (canClick) {
        cell.classList.add('clickable');
        cell.style.setProperty('--cell-hover-color', curPlayer.color);
      }

      const cm = getCriticalMass(r, c);
      if (gameStatus === 'playing' && owner && cellData.orbs === cm - 1) {
        cell.classList.add('critical');
      }

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
  if (!wrapper) return 42;
  const rect = wrapper.getBoundingClientRect();
  const width = rect.width || window.innerWidth;
  const height = rect.height || (window.innerHeight - 100);

  const gap = (cols > 10 || rows > 10) ? 1 : 2;
  const padPx = (width < 480) ? 6 : 14;
  const avW = Math.max(80, width - padPx - gap * (cols - 1));
  const avH = Math.max(80, height - padPx - gap * (rows - 1));

  const byW = Math.floor(avW / cols);
  const byH = Math.floor(avH / rows);
  const fit = Math.min(byW, byH);

  return Math.max(14, Math.min(fit, 68));
}

// ─── Tamil Slang Commentary ───────────────────────────────────────────────────
let commentaryTimer = null;
function showCommentary(text, category = 'REACTION') {
  if (!slangEnabled) return;
  const banner = $('commentary-banner');
  const catEl = $('commentary-category');
  const textEl = $('commentary-text');

  if (catEl) catEl.textContent = category.toUpperCase();
  if (textEl) textEl.textContent = text;

  banner.classList.remove('hidden');
  clearTimeout(commentaryTimer);
  commentaryTimer = setTimeout(() => {
    banner.classList.add('hidden');
  }, 3200);
}

function triggerMoveCommentary(waves) {
  const curPlayer = enginePlayers[currentPlayerIndex];
  if (waves.length >= 2) {
    const list = TAMIL_ROASTS.cascade;
    const raw = list[Math.floor(Math.random() * list.length)];
    const text = raw.replace('{player}', curPlayer.name).replace('{waves}', String(waves.length));
    showCommentary(text, 'MEGA BLAST');
  } else if (Math.random() < 0.4) {
    const list = TAMIL_ROASTS.ordinary;
    const raw = list[Math.floor(Math.random() * list.length)];
    const text = raw.replace('{player}', curPlayer.name);
    showCommentary(text, 'ROAST');
  }
}

function triggerVictoryCommentary() {
  if (!winner) return;
  const list = TAMIL_ROASTS.victory;
  const raw = list[Math.floor(Math.random() * list.length)];
  const text = raw.replace('{player}', winner.name);
  showCommentary(text, 'CHAMPION');
}

// ─── Game Over ────────────────────────────────────────────────────────────────
function showGameOver() {
  const ann = $('winner-announcement');
  if (winner) {
    ann.innerHTML = `
      <div class="winner-color-dot"
           style="background:${winner.color};box-shadow:0 0 30px ${winner.color}"></div>
      <h2 class="winner-title">OTHAAA! ${winner.name} THAAN DA WINNER-U! 👑</h2>
    `;
  } else {
    ann.innerHTML = '<h2 class="winner-title">Aatam Mudinjiduchu Da!</h2>';
  }
  showScreen('gameover');
}

// ─── Toast System ─────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg, type = 'info') {
  const el = $('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = `toast toast-${type} visible`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visible'), 2800);
}

// ─── Start on load ────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', initSetupScreen);
