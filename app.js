import { createGame, mergeGame } from './game.js?v=7';
import { FrogAudio } from './audio.js?v=7';
import { loadGame, saveGame } from './storage.js?v=7';
const $ = (id) => document.getElementById(id);
const audio = new FrogAudio();
const board = $('board');
const ghost = $('drag-ghost');
let { state, bestScore } = loadGame();
let selected = null;
let locked = false;
let gesture = null;
let animationTimer;
let scoreFrame;
let shownScore = state.score;
const sprite = (level) => `./frogs/${Math.min(level, 13)}.png`;
const tiles = Array.from({ length: 9 }, (_, i) => {
  const tile = document.createElement('button');
  tile.className = 'tile'; tile.dataset.index = i;
  tile.innerHTML = '<span class="level"></span><img class="frog" draggable="false" alt="">';
  tile.addEventListener('click', (event) => { if (event.detail === 0) { audio.unlock(); choose(i); } });
  board.append(tile); return tile;
});
function render() {
  tiles.forEach((tile, i) => {
    const level = state.board[i];
    tile.querySelector('img').src = sprite(level);
    tile.querySelector('.level').textContent = String(level);
    tile.setAttribute('aria-label', `Level ${level} frog, row ${Math.floor(i / 3) + 1}, column ${i % 3 + 1}`);
    tile.setAttribute('aria-pressed', String(selected === i));
    tile.disabled = state.status !== 'playing';
    tile.classList.toggle('selected', selected === i);
    tile.classList.toggle('valid-target', selected !== null && selected !== i && state.board[selected] === level);
  });
  $('best-score').textContent = bestScore.toLocaleString('en-US');
}
function animateScore() {
  cancelAnimationFrame(scoreFrame);
  const from = shownScore, start = performance.now(), target = state.score;
  function frame(now) {
    const t = Math.min(1, (now - start) / 280);
    shownScore = Math.round(from + (target - from) * (1 - (1 - t) ** 3));
    $('score').textContent = shownScore.toLocaleString('en-US');
    if (t < 1) scoreFrame = requestAnimationFrame(frame);
  }
  scoreFrame = requestAnimationFrame(frame);
}
function choose(i) {
  if (locked || state.status !== 'playing') return;
  if (selected === null) selected = i;
  else if (selected === i) selected = null;
  else if (state.board[selected] === state.board[i]) { merge(selected, i); return; }
  else selected = i;
  render();
  $('status').textContent = selected === null ? '' : `Select another level ${state.board[selected]} frog`;
}
function merge(source, target) {
  if (locked) return;
  const result = mergeGame(state, source, target);
  if (!result.success) return;
  locked = true; selected = null; state = result.state;
  persist(); render(); animateScore();
  tiles[target].classList.add('merging'); tiles[source].classList.add('spawning');
  audio.playMerge(result.newLevel);
  $('status').textContent = `+${result.points.toLocaleString('en-US')} points`;
  animationTimer = setTimeout(() => {
    tiles.forEach(tile => tile.classList.remove('merging', 'spawning'));
    locked = false;
    showGameOver();
  }, 340);
}
function cleanupGesture() {
  if (gesture) tiles[gesture.source].classList.remove('drag-source');
  gesture = null; ghost.hidden = true;
}
board.addEventListener('pointerdown', event => {
  const tile = event.target.closest('.tile');
  if (!tile || locked || state.status !== 'playing' || !event.isPrimary || event.button !== 0) return;
  audio.unlock();
  gesture = { source: Number(tile.dataset.index), x: event.clientX, y: event.clientY, dragging: false, pointerId: event.pointerId };
  tile.setPointerCapture(event.pointerId);
});
board.addEventListener('pointermove', event => {
  if (!gesture || gesture.pointerId !== event.pointerId) return;
  if (!gesture.dragging && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 8) {
    gesture.dragging = true; selected = gesture.source; render();
    ghost.querySelector('img').src = sprite(state.board[gesture.source]); ghost.hidden = false;
    tiles[gesture.source].classList.add('drag-source');
  }
  if (gesture.dragging) { ghost.style.left = `${event.clientX}px`; ghost.style.top = `${event.clientY}px`; }
});
board.addEventListener('pointerup', event => {
  if (!gesture || gesture.pointerId !== event.pointerId) return;
  const { source, dragging } = gesture;
  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.tile');
  cleanupGesture();
  if (!dragging) { choose(source); return; }
  selected = null; render();
  if (target && board.contains(target)) merge(source, Number(target.dataset.index));
});
board.addEventListener('pointercancel', () => { cleanupGesture(); selected = null; render(); });
window.addEventListener('blur', () => { cleanupGesture(); selected = null; render(); });
$('sound-toggle').addEventListener('click', () => {
  audio.setEnabled(!audio.enabled); audio.unlock();
  $('sound-toggle').setAttribute('aria-pressed', String(audio.enabled));
  $('sound-toggle').textContent = `Sound: ${audio.enabled ? 'on' : 'off'}`;
});
function reset() {
  clearTimeout(animationTimer); cancelAnimationFrame(scoreFrame); cleanupGesture();
  state = createGame(); selected = null; locked = false; shownScore = 0;
  tiles.forEach(tile => tile.classList.remove('merging', 'spawning'));
  $('score').textContent = '0'; $('game-over').close();
  $('status').textContent = ''; persist(); render();
}
$('new-game').addEventListener('click', reset);
$('restart').addEventListener('click', reset);
$('game-over').addEventListener('cancel', event => event.preventDefault());
function persist() {
  bestScore = Math.max(bestScore, state.score);
  saveGame(state, bestScore);
}
function showGameOver() {
  if (state.status !== 'game_over') return;
  $('final-score').textContent = `${state.score.toLocaleString('en-US')} points`;
  if (!$('game-over').open) $('game-over').showModal();
}
$('score').textContent = shownScore.toLocaleString('en-US');
persist();
render();
showGameOver();
