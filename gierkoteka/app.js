(function () {
  const board = document.querySelector("[data-board]");
  const statusLine = document.querySelector("[data-status]");
  const levelLabel = document.querySelector("[data-level-label]");
  const levelInput = document.querySelector("[data-level-input]");
  const leftCount = document.querySelector("[data-left-count]");
  const movesNode = document.querySelector("[data-moves]");
  const scoreNode = document.querySelector("[data-score]");
  const bestNode = document.querySelector("[data-best]");
  const streakNode = document.querySelector("[data-streak]");
  const difficultyButtons = Array.from(document.querySelectorAll("[data-difficulty]"));
  const actionButtons = Array.from(document.querySelectorAll("[data-action]"));

  const prefsKey = "gierkotekaArrowsPrefs";
  const directions = [
    { key: "up", dr: -1, dc: 0 },
    { key: "right", dr: 0, dc: 1 },
    { key: "down", dr: 1, dc: 0 },
    { key: "left", dr: 0, dc: -1 },
  ];

  const difficultyConfig = {
    easy: { label: "Spokojnie", countBoost: -2, sizeBoost: 0 },
    normal: { label: "Normalnie", countBoost: 0, sizeBoost: 0 },
    hard: { label: "Trudniej", countBoost: 4, sizeBoost: 1 },
  };

  const state = {
    level: 1,
    difficulty: "normal",
    size: 6,
    pieces: [],
    history: [],
    moves: 0,
    score: 0,
    streak: 0,
    removing: false,
    hintId: "",
    completed: false,
  };

  function readPrefs() {
    try {
      const value = JSON.parse(localStorage.getItem(prefsKey) || "{}");
      if (Number.isInteger(value.level)) {
        state.level = clamp(value.level, 1, 30);
      }
      if (difficultyConfig[value.difficulty]) {
        state.difficulty = value.difficulty;
      }
    } catch (_error) {
      state.level = 1;
      state.difficulty = "normal";
    }
  }

  function savePrefs() {
    localStorage.setItem(prefsKey, JSON.stringify({
      level: state.level,
      difficulty: state.difficulty,
    }));
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function seedFrom(text) {
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function randomFrom(seed) {
    let value = seed >>> 0;
    return function () {
      value += 0x6D2B79F5;
      let next = Math.imul(value ^ (value >>> 15), 1 | value);
      next ^= next + Math.imul(next ^ (next >>> 7), 61 | next);
      return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
    };
  }

  function cellKey(row, col) {
    return `${row}:${col}`;
  }

  function occupiedMap(pieces) {
    const map = new Map();
    pieces.forEach((piece) => {
      map.set(cellKey(piece.row, piece.col), piece);
    });
    return map;
  }

  function isInside(row, col, size) {
    return row >= 0 && row < size && col >= 0 && col < size;
  }

  function rayClear(row, col, direction, occupied, size) {
    let nextRow = row + direction.dr;
    let nextCol = col + direction.dc;
    while (isInside(nextRow, nextCol, size)) {
      if (occupied.has(cellKey(nextRow, nextCol))) {
        return false;
      }
      nextRow += direction.dr;
      nextCol += direction.dc;
    }
    return true;
  }

  function blocksExistingPiece(row, col, pieces) {
    return pieces.some((piece) => {
      const direction = directions.find((item) => item.key === piece.dir);
      if (!direction) {
        return false;
      }
      let nextRow = piece.row + direction.dr;
      let nextCol = piece.col + direction.dc;
      while (isInside(nextRow, nextCol, state.size)) {
        if (nextRow === row && nextCol === col) {
          return true;
        }
        nextRow += direction.dr;
        nextCol += direction.dc;
      }
      return false;
    });
  }

  function levelSize(level, difficulty) {
    const extra = difficultyConfig[difficulty].sizeBoost;
    if (level + extra >= 14) {
      return 7;
    }
    if (level + extra >= 6) {
      return 6;
    }
    return 5;
  }

  function targetCount(level, size, difficulty) {
    const boost = difficultyConfig[difficulty].countBoost;
    const base = Math.round(8 + level * 1.55 + boost);
    return clamp(base, 8, size * size - 6);
  }

  function generateLevel(level, difficulty) {
    const size = levelSize(level, difficulty);
    const count = targetCount(level, size, difficulty);
    const random = randomFrom(seedFrom(`${level}:${difficulty}:gierkoteka-arrows`));
    const pieces = [];

    for (let order = 0; order < count; order += 1) {
      const occupied = occupiedMap(pieces);
      const candidates = [];

      for (let row = 0; row < size; row += 1) {
        for (let col = 0; col < size; col += 1) {
          if (occupied.has(cellKey(row, col))) {
            continue;
          }

          directions.forEach((direction) => {
            if (!rayClear(row, col, direction, occupied, size)) {
              return;
            }

            candidates.push({
              row,
              col,
              dir: direction.key,
              blocks: blocksExistingPiece(row, col, pieces),
            });
          });
        }
      }

      if (!candidates.length) {
        break;
      }

      const blockers = candidates.filter((candidate) => candidate.blocks);
      const pool = blockers.length && random() < 0.72 ? blockers : candidates;
      const pick = pool[Math.floor(random() * pool.length)];
      pieces.push({
        id: `p${level}-${order}-${pick.row}-${pick.col}`,
        row: pick.row,
        col: pick.col,
        dir: pick.dir,
        color: Math.floor(random() * 6),
        order,
      });
    }

    return { size, pieces };
  }

  function snapshot() {
    return {
      pieces: state.pieces.map((piece) => ({ ...piece })),
      moves: state.moves,
      score: state.score,
      streak: state.streak,
      completed: state.completed,
    };
  }

  function restore(snapshotValue) {
    state.pieces = snapshotValue.pieces.map((piece) => ({ ...piece }));
    state.moves = snapshotValue.moves;
    state.score = snapshotValue.score;
    state.streak = snapshotValue.streak;
    state.completed = snapshotValue.completed;
    state.hintId = "";
    render();
    setStatus("Cofniete.");
  }

  function startLevel(level) {
    const generated = generateLevel(level, state.difficulty);
    state.level = level;
    state.size = generated.size;
    state.pieces = generated.pieces;
    state.history = [];
    state.moves = 0;
    state.score = 0;
    state.streak = 0;
    state.removing = false;
    state.hintId = "";
    state.completed = false;
    savePrefs();
    render();
    setStatus("Gotowe.");
  }

  function canExit(piece) {
    const direction = directions.find((item) => item.key === piece.dir);
    if (!direction) {
      return false;
    }
    const occupied = occupiedMap(state.pieces.filter((item) => item.id !== piece.id));
    return rayClear(piece.row, piece.col, direction, occupied, state.size);
  }

  function bestKey() {
    return `gierkotekaArrowsBest:${state.difficulty}:${state.level}`;
  }

  function currentBest() {
    const value = Number(localStorage.getItem(bestKey()) || 0);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  function updateBest() {
    const best = currentBest();
    if (!best || state.moves < best) {
      localStorage.setItem(bestKey(), String(state.moves));
    }
  }

  function setStatus(message) {
    if (statusLine) {
      statusLine.textContent = message;
    }
  }

  function pieceLabel(piece) {
    const labels = {
      up: "gora",
      right: "prawo",
      down: "dol",
      left: "lewo",
    };
    return `Strzalka ${labels[piece.dir] || piece.dir}`;
  }

  function render() {
    if (!board) {
      return;
    }

    const occupied = occupiedMap(state.pieces);
    board.style.setProperty("--size", String(state.size));
    board.innerHTML = "";

    for (let row = 0; row < state.size; row += 1) {
      for (let col = 0; col < state.size; col += 1) {
        const piece = occupied.get(cellKey(row, col));
        const cell = document.createElement("button");
        cell.className = "cell";
        cell.type = "button";

        if (!piece) {
          cell.disabled = true;
          cell.setAttribute("aria-hidden", "true");
        } else {
          cell.dataset.id = piece.id;
          cell.classList.add("has-piece", `dir-${piece.dir}`, `color-${piece.color}`);
          cell.classList.toggle("is-hint", piece.id === state.hintId);
          cell.setAttribute("aria-label", pieceLabel(piece));
          cell.innerHTML = '<span class="piece-core"><span class="arrow-shape" aria-hidden="true"></span></span>';
        }

        board.appendChild(cell);
      }
    }

    if (levelLabel) levelLabel.textContent = String(state.level);
    if (levelInput) levelInput.value = String(state.level);
    if (leftCount) leftCount.textContent = String(state.pieces.length);
    if (movesNode) movesNode.textContent = String(state.moves);
    if (scoreNode) scoreNode.textContent = String(state.score);
    if (streakNode) streakNode.textContent = String(state.streak);
    if (bestNode) bestNode.textContent = currentBest() ? String(currentBest()) : "--";

    difficultyButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.difficulty === state.difficulty);
      button.setAttribute("aria-pressed", button.dataset.difficulty === state.difficulty ? "true" : "false");
    });
  }

  function wrongMove(cell) {
    state.streak = 0;
    renderStatsOnly();
    if (cell) {
      cell.classList.add("is-blocked");
      window.setTimeout(() => cell.classList.remove("is-blocked"), 240);
    }
    setStatus("Zablokowana.");
    if (navigator.vibrate) {
      navigator.vibrate(25);
    }
  }

  function renderStatsOnly() {
    if (streakNode) streakNode.textContent = String(state.streak);
  }

  function completeLevel() {
    state.completed = true;
    updateBest();
    render();
    setStatus("Poziom czysty.");
  }

  async function removePiece(piece, cell) {
    state.history.push(snapshot());
    state.removing = true;
    state.hintId = "";
    cell.classList.add("is-flying");
    await new Promise((resolve) => window.setTimeout(resolve, 230));
    state.pieces = state.pieces.filter((item) => item.id !== piece.id);
    state.moves += 1;
    state.streak += 1;
    state.score += 10 + Math.min(12, state.streak * 2);
    state.removing = false;

    if (!state.pieces.length) {
      completeLevel();
      return;
    }

    render();
    setStatus(`${state.pieces.length} zostalo.`);
  }

  function handleBoardClick(event) {
    const cell = event.target instanceof Element ? event.target.closest(".cell.has-piece") : null;
    if (!cell || state.removing) {
      return;
    }

    const piece = state.pieces.find((item) => item.id === cell.dataset.id);
    if (!piece) {
      return;
    }

    if (!canExit(piece)) {
      wrongMove(cell);
      return;
    }

    removePiece(piece, cell).catch(() => {
      state.removing = false;
      render();
    });
  }

  function showHint() {
    if (state.removing || state.completed) {
      return;
    }

    const options = state.pieces.filter(canExit).sort((left, right) => right.order - left.order);
    if (!options.length) {
      setStatus("Brak wolnej strzalki.");
      return;
    }

    state.hintId = options[0].id;
    render();
    setStatus("Ta ma czysta droge.");
  }

  function undo() {
    if (state.removing || !state.history.length) {
      setStatus("Nie ma cofniecia.");
      return;
    }

    restore(state.history.pop());
  }

  function nextLevel() {
    startLevel(clamp(state.level + 1, 1, 30));
  }

  function action(name) {
    if (state.removing) {
      return;
    }
    if (name === "undo") undo();
    if (name === "restart") startLevel(state.level);
    if (name === "hint") showHint();
    if (name === "next") nextLevel();
  }

  if (board) {
    board.addEventListener("click", handleBoardClick);
  }

  actionButtons.forEach((button) => {
    button.addEventListener("click", () => action(button.dataset.action || ""));
  });

  difficultyButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (state.removing) {
        return;
      }
      const value = button.dataset.difficulty || "normal";
      if (!difficultyConfig[value] || value === state.difficulty) {
        return;
      }
      state.difficulty = value;
      startLevel(state.level);
    });
  });

  if (levelInput) {
    levelInput.addEventListener("change", () => {
      if (state.removing) {
        levelInput.value = String(state.level);
        return;
      }
      startLevel(clamp(Number(levelInput.value || 1), 1, 30));
    });
    levelInput.addEventListener("input", () => {
      if (levelLabel) {
        levelLabel.textContent = String(levelInput.value);
      }
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() === "h") {
      showHint();
    }
    if (event.key.toLowerCase() === "r") {
      action("restart");
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      undo();
    }
  });

  readPrefs();
  startLevel(state.level);
})();
