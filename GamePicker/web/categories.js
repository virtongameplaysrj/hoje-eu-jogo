/* Grandes grupos exibidos na tela inicial (a ordem aqui é a ordem na tela). */
const CATEGORIES = [
  { key: 'fps',        label: 'Tiro (FPS)',              emoji: '🎯' },
  { key: 'action',     label: 'Ação & Aventura',         emoji: '⚔️' },
  { key: 'rpg',        label: 'RPG',                     emoji: '🧙' },
  { key: 'strategy',   label: 'Estratégia',              emoji: '♟️' },
  { key: 'simulation', label: 'Simulação',               emoji: '🏗️' },
  { key: 'survival',   label: 'Sobrevivência & Sandbox', emoji: '🪓' },
  { key: 'horror',     label: 'Terror',                  emoji: '👻' },
  { key: 'roguelike',  label: 'Roguelike',               emoji: '🎲' },
  { key: 'platformer', label: 'Plataforma',              emoji: '🍄' },
  { key: 'puzzle',     label: 'Puzzle',                  emoji: '🧩' },
  { key: 'racing',     label: 'Corrida & Esporte',       emoji: '🏎️' },
  { key: 'story',      label: 'Narrativa & Point-and-click', emoji: '📖' },
  { key: 'casual',     label: 'Casual & Relax',          emoji: '🌿' },
  { key: 'other',      label: 'Outros',                  emoji: '📦' },
];

/**
 * Decide em qual grande grupo um jogo aparece.
 *
 * @param {string[]} tags  Tags da Steam em inglês, ORDENADAS da mais votada para a menos
 *                         (ex.: Portal 2 → ["Singleplayer","Platformer","Puzzle","First-Person",…,"FPS",…]).
 *                         Para jogos só da GOG vêm as tags da GOG; jogos sem dados vêm com [].
 * @param {object}   game  O jogo inteiro (name, stores, minutes…), caso queira usar.
 * @returns {string|string[]}  Uma `key` de CATEGORIES (ou uma lista delas, se quiser
 *                             que o jogo apareça em mais de um grupo). 'other' se nada servir.
 */
function pickCategory(tags, game) {
  const scores = {};
  tags.forEach((tag, i) => {
    const hit = TAG_MAP[tag];
    if (!hit) return;
    const [cat, specificity] = hit;
    const position = Math.max(0.15, 1 - i / 15);   // tags do topo pesam mais
    scores[cat] = (scores[cat] || 0) + specificity * position;
  });
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (!ranked.length || ranked[0][1] < 0.8) return 'other';
  const [best, second] = ranked;
  // segundo grupo só quando quase empata: o jogo aparece nos dois
  return second && second[1] >= best[1] * 0.8 ? [best[0], second[0]] : best[0];
}

/* tag → [categoria, especificidade]. Tags genéricas (Action, Adventure) valem pouco. */
const TAG_MAP = {
  'FPS': ['fps', 3], 'Boomer Shooter': ['fps', 3], 'Arena Shooter': ['fps', 2.5], 'Hero Shooter': ['fps', 2.5],
  'Looter Shooter': ['fps', 2], 'Shooter': ['fps', 1.5], 'Third-Person Shooter': ['fps', 1.3], 'Tactical': ['fps', 0.8],
  'Action': ['action', 0.6], 'Adventure': ['action', 0.4], 'Action-Adventure': ['action', 1.5], 'Hack and Slash': ['action', 2.2],
  "Beat 'em up": ['action', 2.5], 'Fighting': ['action', 2.2], 'Stealth': ['action', 1.5], 'Open World': ['action', 0.8],
  'Souls-like': ['action', 1.6], 'Bullet Hell': ['action', 1.5], 'Twin Stick Shooter': ['action', 1.5], 'Arcade': ['action', 0.9],
  'Spectacle fighter': ['action', 2.5],
  'RPG': ['rpg', 2], 'Action RPG': ['rpg', 2.2], 'JRPG': ['rpg', 3], 'CRPG': ['rpg', 3], 'Party-Based RPG': ['rpg', 3],
  'MMORPG': ['rpg', 2.5], 'Dungeon Crawler': ['rpg', 2], 'Role-Playing': ['rpg', 2],
  'Strategy': ['strategy', 2], 'Turn-Based Strategy': ['strategy', 3], 'RTS': ['strategy', 3], 'Grand Strategy': ['strategy', 3],
  '4X': ['strategy', 3], 'Wargame': ['strategy', 3], 'Tower Defense': ['strategy', 2.5], 'Turn-Based Tactics': ['strategy', 2.5],
  'Auto Battler': ['strategy', 2.5], 'MOBA': ['strategy', 2], 'Card Game': ['strategy', 1.5], 'Deckbuilding': ['strategy', 1.5],
  'Board Game': ['strategy', 1.5], 'Real Time Tactics': ['strategy', 2.5],
  'Simulation': ['simulation', 1.8], 'City Builder': ['simulation', 3], 'Colony Sim': ['simulation', 3], 'Management': ['simulation', 2.5],
  'Automation': ['simulation', 2.5], 'Farming Sim': ['simulation', 3], 'Life Sim': ['simulation', 3], 'Flight': ['simulation', 3],
  'Space Sim': ['simulation', 3], 'Building': ['simulation', 1.5], 'Base Building': ['simulation', 1.3], 'Economy': ['simulation', 1.5],
  'Resource Management': ['simulation', 1.5], 'Job Simulator': ['simulation', 3],
  'Survival': ['survival', 2.5], 'Open World Survival Craft': ['survival', 3], 'Crafting': ['survival', 2], 'Sandbox': ['survival', 1.5],
  'Zombies': ['survival', 1],
  'Horror': ['horror', 2.5], 'Psychological Horror': ['horror', 3], 'Survival Horror': ['horror', 3], 'Lovecraftian': ['horror', 1.5],
  'Roguelike': ['roguelike', 2.5], 'Roguelite': ['roguelike', 2.5], 'Action Roguelike': ['roguelike', 3],
  'Roguelike Deckbuilder': ['roguelike', 3], 'Traditional Roguelike': ['roguelike', 3],
  'Platformer': ['platformer', 2], '2D Platformer': ['platformer', 2.5], '3D Platformer': ['platformer', 2.5],
  'Metroidvania': ['platformer', 3], 'Precision Platformer': ['platformer', 3],
  'Puzzle': ['puzzle', 2], 'Puzzle Platformer': ['puzzle', 1.5], 'Logic': ['puzzle', 2], 'Hidden Object': ['puzzle', 2.5],
  'Match 3': ['puzzle', 2.5],
  'Racing': ['racing', 3], 'Sports': ['racing', 2.5], 'Driving': ['racing', 1.5], 'Automobile Sim': ['simulation', 3],
  'Football (Soccer)': ['racing', 3], 'Golf': ['racing', 3], 'Skateboarding': ['racing', 3],
  'Point & Click': ['story', 3], 'Visual Novel': ['story', 3], 'Walking Simulator': ['story', 3], 'Interactive Fiction': ['story', 3],
  'Detective': ['story', 2], 'Story Rich': ['story', 1.2], 'Choices Matter': ['story', 1], 'Mystery': ['story', 1],
  'Casual': ['casual', 1.2], 'Relaxing': ['casual', 2], 'Cozy': ['casual', 2.5], 'Clicker': ['casual', 2.5],
  'Idler': ['casual', 2.5], 'Family Friendly': ['casual', 1], 'Cute': ['casual', 0.8],
};
