const STORAGE_KEY = 'keypad_daily_v1';
const LOCKOUT_MS = 24 * 60 * 60 * 1000;
const MAX_LENGTH = 8;

const TAUNTS_WRONG = [
  "Wrong. The panel remembers. It will not tell you which digits were close.",
  "Incorrect. Somewhere, a vault is laughing at you.",
  "Nope. Come back tomorrow and be wrong again, probably.",
  "That was not it. It was never going to be that.",
  "Access denied. The panel does not do partial credit.",
];

const TAUNTS_CORRECT = [
  "Correct. Tomorrow's code just got longer.",
  "You cracked it. The panel is already generating something worse.",
  "Somehow that worked. Enjoy the twelve seconds of satisfaction.",
];

let gameState = null;
let guessBuffer = [];
let countdownHandle = null;

function randomDigit() { return Math.floor(Math.random() * 10); }
function generateCode(len) {
  const arr = [];
  for (let i = 0; i < len; i++) arr.push(randomDigit());
  return arr;
}

function freshState() {
  return {
    secret: generateCode(4),
    length: 4,
    lastAttemptAt: null,
    lastResult: null,
    wins: 0,
    attempts: 0,
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) throw new Error('no saved state');
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.secret)) throw new Error('bad state');
    gameState = parsed;
  } catch (e) {
    gameState = freshState();
    saveState();
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(gameState));
  } catch (e) {
    console.error('Could not save game state (storage may be disabled):', e);
  }
}

function msRemaining() {
  if (!gameState.lastAttemptAt) return 0;
  const unlockAt = new Date(gameState.lastAttemptAt).getTime() + LOCKOUT_MS;
  return unlockAt - Date.now();
}

function isLocked() { return msRemaining() > 0; }

function pad(n) { return String(n).padStart(2, '0'); }

function formatCountdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return pad(h) + ':' + pad(m) + ':' + pad(s);
}

function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function buildKeypad() {
  const layout = [1, 2, 3, 4, 5, 6, 7, 8, 9, 'clear', 0, 'del'];
  const kp = document.getElementById('keypad');
  kp.innerHTML = '';
  layout.forEach((v) => {
    const btn = document.createElement('button');
    btn.className = 'key';
    if (v === 'clear') {
      btn.classList.add('clear');
      btn.textContent = 'CLR';
      btn.addEventListener('click', () => { guessBuffer = []; renderScreen(); });
    } else if (v === 'del') {
      btn.classList.add('del');
      btn.textContent = 'DEL';
      btn.addEventListener('click', () => { guessBuffer.pop(); renderScreen(); });
    } else {
      btn.textContent = v;
      btn.addEventListener('click', () => {
        btn.classList.add('pressed');
        setTimeout(() => btn.classList.remove('pressed'), 90);
        if (guessBuffer.length < gameState.length) {
          guessBuffer.push(v);
          renderScreen();
        }
      });
    }
    kp.appendChild(btn);
  });
}

function setKeypadDisabled(disabled) {
  document.querySelectorAll('.key').forEach((k) => { k.disabled = disabled; });
}

function renderScreen() {
  const screen = document.getElementById('screen');
  const screenBody = document.getElementById('screenBody');
  const enterBtn = document.getElementById('enterBtn');
  const lockLed = document.getElementById('lockLed');
  const locked = isLocked();

  if (lockLed) lockLed.classList.toggle('active', locked);

  if (locked) {
    setKeypadDisabled(true);
    enterBtn.disabled = true;
    screenBody.innerHTML =
      '<div class="lock-line">' + (gameState.lastResult === 'wrong' ? 'Wrong guess. Try again in:' : 'Come back in:') + '</div>' +
      '<div class="lock-timer" id="lockTimer">' + formatCountdown(msRemaining()) + '</div>';
  } else {
    setKeypadDisabled(false);
    const placeholders = [];
    for (let i = 0; i < gameState.length; i++) {
      placeholders.push(i < guessBuffer.length ? guessBuffer[i] : '_');
    }
    screenBody.innerHTML = '<div class="code-display" id="codeDisplay">' + placeholders.join(' ') + '</div>';
    enterBtn.disabled = guessBuffer.length !== gameState.length;
  }
}

function renderStats() {
  const combos = Math.pow(10, gameState.length);
  const stats = [
    { label: 'ATTEMPTS', value: gameState.attempts },
    { label: 'WINS', value: gameState.wins },
    { label: 'CODE LENGTH', value: gameState.length + ' digits' },
    { label: 'POSSIBLE CODES', value: combos.toLocaleString() },
  ];
  const el = document.getElementById('stats');
  el.innerHTML = '';
  stats.forEach((s) => {
    const div = document.createElement('div');
    div.className = 'stat';
    div.innerHTML = '<div class="label">' + s.label + '</div><div class="value">' + s.value + '</div>';
    el.appendChild(div);
  });

  const taunt = document.getElementById('taunt');
  if (gameState.lastResult === 'correct') {
    taunt.textContent = pickRandom(TAUNTS_CORRECT);
  } else if (gameState.lastResult === 'wrong') {
    taunt.textContent = pickRandom(TAUNTS_WRONG);
  } else {
    taunt.textContent = 'At one guess a day, a 4-digit code takes years to brute-force. Good luck.';
  }
}

function submitGuess() {
  if (guessBuffer.length !== gameState.length || isLocked()) return;

  const correct = guessBuffer.every((d, i) => d === gameState.secret[i]);
  gameState.attempts += 1;
  gameState.lastAttemptAt = new Date().toISOString();

  if (correct) {
    gameState.wins += 1;
    gameState.lastResult = 'correct';
    gameState.length = Math.min(gameState.length + 1, MAX_LENGTH);
    gameState.secret = generateCode(gameState.length);
  } else {
    gameState.lastResult = 'wrong';
    const screen = document.getElementById('screen');
    screen.classList.remove('shake');
    void screen.offsetWidth;
    screen.classList.add('shake');
  }

  guessBuffer = [];
  saveState();
  renderScreen();
  renderStats();
  startCountdown();
}

function startCountdown() {
  if (countdownHandle) clearInterval(countdownHandle);
  countdownHandle = setInterval(() => {
    if (!isLocked()) {
      clearInterval(countdownHandle);
      countdownHandle = null;
      renderScreen();
      return;
    }
    const el = document.getElementById('lockTimer');
    if (el) el.textContent = formatCountdown(msRemaining());
  }, 1000);
}

function init() {
  loadState();
  buildKeypad();
  renderScreen();
  renderStats();
  document.getElementById('enterBtn').addEventListener('click', submitGuess);
  if (isLocked()) startCountdown();
}

init();
