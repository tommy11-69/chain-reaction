'use strict';

const fs = require('fs');
const path = require('path');

/**
 * CommentaryEngine for Tamil Slang Chaos Mode.
 * Reads `badwords.txt` as vocabulary reference and generates
 * context-aware, hilarious Tanglish roasts for game events.
 */
class CommentaryEngine {
  constructor(vocabFilePath) {
    this.vocabFilePath = vocabFilePath || path.join(__dirname, '../../badwords.txt');
    this.vocab = this._loadVocabulary();
    this.lastCommentaryTime = 0;
    this.lastCategory = null;
    this.recentPhrases = [];
  }

  _loadVocabulary() {
    const terms = new Set();
    try {
      if (fs.existsSync(this.vocabFilePath)) {
        const content = fs.readFileSync(this.vocabFilePath, 'utf8');
        const lines = content.split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.toLowerCase().startsWith('tamil slang')) continue;

          // If tab-separated, take first column
          let termPart = trimmed.split('\t')[0].trim();
          // Remove bullet points if any
          termPart = termPart.replace(/^[•\-\*]\s*/, '').trim();

          // Handle "Term1 / Term2"
          if (termPart.includes('/')) {
            termPart.split('/').forEach(t => {
              const sub = t.trim();
              if (sub.length > 1) terms.add(sub);
            });
          } else if (termPart.length > 1) {
            terms.add(termPart);
          }
        }
      }
    } catch (err) {
      console.warn('[CommentaryEngine] Could not read badwords.txt, using built-in vocabulary.', err.message);
    }

    // Default fallback terms if file was empty or missing
    if (terms.size === 0) {
      ['otha', 'ommala', 'okkala oli', 'baadu', 'loosu koodhi', 'thevidiya', 'thayoli', 'poolu', 'soothu'].forEach(t => terms.add(t));
    }

    return Array.from(terms);
  }

  /**
   * Evaluates the move outcome and returns a synchronized commentary object or null.
   *
   * @param {Object} params
   * @param {string} params.playerName
   * @param {string} params.playerId
   * @param {Array} params.waves
   * @param {Object} params.oldState
   * @param {Object} params.newState
   * @returns {Object|null} { text, type, priority, player, major }
   */
  evaluateMove({ playerName, playerId, waves = [], oldState, newState }) {
    const isFinished = newState.status === 'finished';
    const winner = newState.winner;

    // 1. Victory (Priority 5 - Highest)
    if (isFinished && winner) {
      return this._pick({
        category: 'victory',
        priority: 5,
        major: true,
        player: winner.name,
        templates: [
          'OTHAAAA! {player} THAAN DA MASS WINNER-U!',
          'Dei dei dei, {player} vera level-la vachu senjitaan da!',
          'MASS DA! Motha lobby-um {player}-ku surrender aayiduchu!',
          'Ommala, champion vandhuttaan da {player}! Orama po!',
          'OTHAA, KING-U DA NEE {player}!',
          'Okkala oli, {player} kitta modhuna idhudhan gathi!',
          'Otha dei, motha board-ayum oru round katti thookitaan {player}!',
          'Baadu maari aadi kadaisila {player} thookitaan da!',
          'Ommala sambavam mudinjiduchu, {player} thaan da periya aalu!',
          'Thevidiya paiya maari aadi jeichitaan da {player}!',
          'Otha, game over! {player} munnaadi yaarume nikkave mudiyadhu!'
        ]
      });
    }

    // 2. Elimination (Priority 4)
    const oldAlive = (oldState?.players || []).filter(p => p.alive);
    const newAlive = (newState?.players || []).filter(p => p.alive);
    const eliminated = oldAlive.filter(p => !newAlive.some(np => np.id === p.id));

    if (eliminated.length > 0) {
      const victim = eliminated[0].name;
      return this._pick({
        category: 'elimination',
        priority: 4,
        major: true,
        player: victim,
        attacker: playerName,
        templates: [
          'AYYAYYOOO! {player} GAME-LENDHU KAALI DA!',
          'Otha, {player} kathai mudinjiduchu da, orama po!',
          'Dei {player}, un kundi-la thee vachitaan da {attacker}!',
          'Motha game-la irundhu exit-u {player}! Veetukku kelambu da!',
          'Ommala, comeback nu nenachom da {player}, aana thooki potutaanga!',
          'Okkala ozhi, {player}-a oru corner-la pottu aruthutaanga da!',
          'Baadu maari aadi {player} ippo orama ukkaandhu azhudhutu irukkaan!',
          'Dei {player}, un soothu kaali aayiduchu da, {attacker} thookitaan!',
          'Otha {player}, idhukku mela unnala onnum panna mudiyadhu, rest edu da!',
          'Thevidiya paiya maari {player}-a wipe out pannitaanga da!',
          'Pisasu maari vandhu {player}-a mothama azhichitaan da!'
        ]
      });
    }

    // 3. Major Chain Reaction (Priority 3)
    if (waves.length >= 2) {
      return this._pick({
        category: 'cascade_huge',
        priority: 3,
        major: true,
        player: playerName,
        wavesCount: waves.length,
        templates: [
          'OTHA! CHAIN REACTION DAWWW! {wavesCount} WAVES BLAST!',
          'Dei {player}, motha board-um vedichu sitharudhu da!',
          'Ommala, enna destruction da idhu?! Board-e katharudhu!',
          'Thala, oru move-la sambavam pannita {player}!',
          'Okkala ozhi, chain reaction-la motha perum bayandhutaanga!',
          'Ammaleh ganja gopaleh, idhu enna da nuclear attack-ah?!',
          'Otha {player}, semma damage da! Oru idathula kooda uyir illa!',
          'Dei dei dei, chain reaction-la mothama kaali aagudhu da!',
          'Otha, indha move-ku oru Oscar award kudunga da {player}-ku!',
          'Baadu maari oru move panni motha board-ayum thee vachitaan da {player}!'
        ]
      });
    }

    // 4. Territory Takeover / Single Wave Capture (Priority 2)
    const oldCounts = this._countPlayerOrbs(oldState?.grid, playerId);
    const newCounts = this._countPlayerOrbs(newState?.grid, playerId);
    const netGain = newCounts - oldCounts;

    if (waves.length === 1 && netGain >= 2) {
      return this._pick({
        category: 'capture',
        priority: 2,
        major: false,
        player: playerName,
        gain: netGain,
        templates: [
          'Ommala, territory takeover da {player}!',
          'Dei {player}, avan area-va mothama pudungita da!',
          'Otha, opponent-ku idhu romba personal aayiduchu da!',
          'Dei, avan veetukkulla vandhu soothu adi adikkuran {player}!',
          'Okkala oli, ore move-la avan orbs-a suruttitaane!',
          'Baadu maari wait panni motha cell-ayum thookitaan {player}!',
          'Otha, opponent empire motham damage da!',
          'Ennada rowdyism panra {player}, motha area-vum unnodadha?!'
        ]
      });
    }

    // 5. Terrible Move / Self Destruction (Priority 2)
    if (waves.length === 0 && oldCounts > 0 && newCounts < oldCounts) {
      return this._pick({
        category: 'bad_move',
        priority: 2,
        major: false,
        player: playerName,
        templates: [
          'Otha {player}, idhu enna da decision?!',
          'Dei {player}, konjam yosichitu move pannuda loosu koodhi maari!',
          'Indha mokka move-ku nee explanation kudukkanum da {player}!',
          'Thala, idhu strategy-ah illa direct suicide-ah?!',
          'Dei {player}, opponent-a vida neeye unna azhichikitta da!',
          'Ennada strategy idhu, soru thunriya illa pee thunriya dei?!',
          'Muttaa koodhi maari poi edhirla maattikittaye da {player}!'
        ]
      });
    }

    // 6. Ordinary Move (Priority 1)
    return this._pick({
      category: 'ordinary',
      priority: 1,
      major: false,
      player: playerName,
      templates: [
        'Dei {player}, idhu enna da mokka move-u?!',
        'Aiyayo, ivanukku game puriyudha illaya da?!',
        'Manda bathram da {player}, adutha move unnodadhu!',
        'Ennada panra {player}, summaa edho click panriya?!',
        'Otha, build-up lam bayangarama irukku, aana aatam mokka!',
        'Dei, oru corner-a pudichitu enna thavam irukkiya {player}?!',
        'Kaluthae maari move panna adutha round-la sethuruva da!',
        'Otha {player}, paathu aadu da, bayama irukku!',
        'Ennada strategic look-u vidra? Move mattum mokkaya irukku!'
      ]
    });
  }

  _pick({ category, priority, major, player, attacker, wavesCount, gain, templates }) {
    // Avoid repeating recently selected template
    const available = templates.filter(t => !this.recentPhrases.includes(t));
    const pool = available.length > 0 ? available : templates;
    const raw = pool[Math.floor(Math.random() * pool.length)];

    this.recentPhrases.push(raw);
    if (this.recentPhrases.length > 10) this.recentPhrases.shift();

    let text = raw
      .replace(/{player}/g, player || 'Ivan')
      .replace(/{attacker}/g, attacker || 'Avan')
      .replace(/{wavesCount}/g, String(wavesCount || 1))
      .replace(/{gain}/g, String(gain || 1));

    return {
      text,
      category,
      priority,
      major: Boolean(major),
      player: player || null,
      timestamp: Date.now()
    };
  }

  _countPlayerOrbs(grid, playerId) {
    if (!grid || !playerId) return 0;
    let count = 0;
    for (const row of grid) {
      for (const cell of row) {
        if (cell.owner === playerId) count += (cell.orbs || 0);
      }
    }
    return count;
  }
}

module.exports = CommentaryEngine;
