(function () {
  const board = document.querySelector("[data-blocks-board]");
  const trayNode = document.querySelector("[data-blocks-tray]");
  const statusNode = document.querySelector("[data-blocks-status]");
  const scoreNode = document.querySelector("[data-blocks-score]");
  const linesNode = document.querySelector("[data-blocks-lines]");
  const movesNode = document.querySelector("[data-blocks-moves]");
  const sizeNode = document.querySelector("[data-blocks-size]");
  const bestNode = document.querySelector("[data-blocks-best]");
  const setNode = document.querySelector("[data-blocks-set]");
  const actionButtons = Array.from(document.querySelectorAll("[data-blocks-action]"));
  const difficultyButtons = Array.from(document.querySelectorAll("[data-blocks-difficulty]"));

  if (!board) {
    return;
  }

  const prefsKey = "gierkotekaBlocksPrefs";
  const difficultyConfig = {
    easy: { size: 8, pool: 9 },
    normal: { size: 8, pool: 16 },
    hard: { size: 9, pool: 24 },
  };
  const shapes = [
    { name: "Punkt", cells: [[0, 0]] },
    { name: "Dwa poziom", cells: [[0, 0], [0, 1]] },
    { name: "Dwa pion", cells: [[0, 0], [1, 0]] },
    { name: "Trzy poziom", cells: [[0, 0], [0, 1], [0, 2]] },
    { name: "Trzy pion", cells: [[0, 0], [1, 0], [2, 0]] },
    { name: "Kwadrat", cells: [[0, 0], [0, 1], [1, 0], [1, 1]] },
    { name: "Male L", cells: [[0, 0], [1, 0], [1, 1]] },
    { name: "Male L 2", cells: [[0, 1], [1, 0], [1, 1]] },
    { name: "Cztery poziom", cells: [[0, 0], [0, 1], [0, 2], [0, 3]] },
    { name: "Cztery pion", cells: [[0, 0], [1, 0], [2, 0], [3, 0]] },
    { name: "T", cells: [[0, 0], [0, 1], [0, 2], [1, 1]] },
    { name: "Z", cells: [[0, 0], [0, 1], [1, 1], [1, 2]] },
    { name: "S", cells: [[0, 1], [0, 2], [1, 0], [1, 1]] },
    { name: "Duzy L", cells: [[0, 0], [1, 0], [2, 0], [2, 1]] },
    { name: "Duzy L 2", cells: [[0, 1], [1, 1], [2, 0], [2, 1]] },
    { name: "Plus", cells: [[0, 1], [1, 0], [1, 1], [1, 2], [2, 1]] },
    { name: "Piatka poziom", cells: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]] },
    { name: "Piatka pion", cells: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]] },
    { name: "Rog", cells: [[0, 0], [0, 1], [0, 2], [1, 0], [2, 0]] },
    { name: "Schodek", cells: [[0, 0], [1, 0], [1, 1], [2, 1], [2, 2]] },
    { name: "Trzy na trzy", cells: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2]] },
    { name: "U", cells: [[0, 0], [0, 2], [1, 0], [1, 1], [1, 2]] },
    { name: "C", cells: [[0, 0], [0, 1], [1, 0], [2, 0], [2, 1]] },
    { name: "Maly blok", cells: [[0, 0], [0, 1], [1, 0], [2, 0]] },
  ];

  const state = {
    difficulty: "normal",
    size: 8,
    cells: [],
    tray: [],
    selectedSlot: 0,
    hintCells: [],
    score: 0,
    lines: 0,
    moves: 0,
    set: 1,
    over: false,
  };

  function readPrefs() {
    try {
      const value = JSON.parse(localStorage.getItem(prefsKey) || "{}");
      if (difficultyConfig[value.difficulty]) {
        state.difficulty = value.difficulty;
      }
    } catch (_error) {
      state.difficulty = "normal";
    }
  }

  function savePrefs() {
    localStorage.setItem(prefsKey, JSON.stringify({ difficulty: state.difficulty }));
  }

  function applyConfig() {
    state.size = difficultyConfig[state.difficulty].size;
  }

  function setStatus(message) {
    if (statusNode) {
      statusNode.textContent = message;
    }
  }

  function bestKey() {
    return `gierkotekaBlocksBest:${state.difficulty}`;
  }

  function currentBest() {
    const value = Number(localStorage.getItem(bestKey()) || 0);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  function updateBest() {
    const best = currentBest();
    if (state.score > best) {
      localStorage.setItem(bestKey(), String(state.score));
    }
  }

  function indexOf(row, col) {
    return row * state.size + col;
  }

  function rowOf(index) {
    return Math.floor(index / state.size);
  }

  function colOf(index) {
    return index % state.size;
  }

  function normalize(cells) {
    const minRow = Math.min(...cells.map((cell) => cell[0]));
    const minCol = Math.min(...cells.map((cell) => cell[1]));
    return cells
      .map((cell) => [cell[0] - minRow, cell[1] - minCol])
      .sort((left, right) => (left[0] - right[0]) || (left[1] - right[1]));
  }

  function rotateCells(cells) {
    return normalize(cells.map((cell) => [cell[1], -cell[0]]));
  }

  function bounds(cells) {
    return {
      rows: Math.max(...cells.map((cell) => cell[0])) + 1,
      cols: Math.max(...cells.map((cell) => cell[1])) + 1,
    };
  }

  function randomShape() {
    const config = difficultyConfig[state.difficulty];
    const pool = shapes.slice(0, config.pool);
    const base = pool[Math.floor(Math.random() * pool.length)];
    return {
      id: `${Date.now()}-${Math.random()}`,
      name: base.name,
      cells: normalize(base.cells),
      color: Math.floor(Math.random() * 6),
    };
  }

  function refillTray(incrementSet) {
    state.tray = [randomShape(), randomShape(), randomShape()];
    state.selectedSlot = 0;
    state.hintCells = [];
    if (incrementSet) {
      state.set += 1;
    }
  }

  function startGame() {
    applyConfig();
    savePrefs();
    state.cells = Array.from({ length: state.size * state.size }, () => null);
    state.selectedSlot = 0;
    state.hintCells = [];
    state.score = 0;
    state.lines = 0;
    state.moves = 0;
    state.set = 1;
    state.over = false;
    refillTray(false);
    render();
    setStatus("Wybierz klocek.");
  }

  function placementCells(shape, origin) {
    const row = rowOf(origin);
    const col = colOf(origin);
    return shape.cells.map((cell) => [row + cell[0], col + cell[1]]);
  }

  function canPlace(shape, origin, cells) {
    return placementCells(shape, origin).every((cell) => {
      const row = cell[0];
      const col = cell[1];
      return row >= 0 && row < state.size && col >= 0 && col < state.size && cells[indexOf(row, col)] === null;
    });
  }

  function fullLines(cells) {
    const rows = [];
    const cols = [];

    for (let row = 0; row < state.size; row += 1) {
      let full = true;
      for (let col = 0; col < state.size; col += 1) {
        if (cells[indexOf(row, col)] === null) {
          full = false;
          break;
        }
      }
      if (full) {
        rows.push(row);
      }
    }

    for (let col = 0; col < state.size; col += 1) {
      let full = true;
      for (let row = 0; row < state.size; row += 1) {
        if (cells[indexOf(row, col)] === null) {
          full = false;
          break;
        }
      }
      if (full) {
        cols.push(col);
      }
    }

    return { rows, cols };
  }

  function clearFullLines() {
    const lines = fullLines(state.cells);
    const clearedCells = new Set();

    lines.rows.forEach((row) => {
      for (let col = 0; col < state.size; col += 1) {
        clearedCells.add(indexOf(row, col));
      }
    });

    lines.cols.forEach((col) => {
      for (let row = 0; row < state.size; row += 1) {
        clearedCells.add(indexOf(row, col));
      }
    });

    clearedCells.forEach((index) => {
      state.cells[index] = null;
    });

    const lineCount = lines.rows.length + lines.cols.length;
    if (lineCount) {
      state.lines += lineCount;
      state.score += lineCount * 35 + clearedCells.size * 3;
      updateBest();
    }

    return { lineCount, cellCount: clearedCells.size };
  }

  function selectedShape() {
    return state.tray[state.selectedSlot] || null;
  }

  function firstAvailableSlot() {
    return state.tray.findIndex(Boolean);
  }

  function anyMove() {
    return state.tray.some((shape) => {
      if (!shape) {
        return false;
      }
      return state.cells.some((_cell, index) => canPlace(shape, index, state.cells));
    });
  }

  function evaluatePlacement(shape, origin) {
    const cells = state.cells.slice();
    placementCells(shape, origin).forEach((cell) => {
      cells[indexOf(cell[0], cell[1])] = shape.color;
    });
    const lines = fullLines(cells);
    return lines.rows.length + lines.cols.length;
  }

  function bestPlacement() {
    let best = null;
    state.tray.forEach((shape, slot) => {
      if (!shape) {
        return;
      }
      state.cells.forEach((_cell, index) => {
        if (!canPlace(shape, index, state.cells)) {
          return;
        }
        const clearScore = evaluatePlacement(shape, index);
        const value = clearScore * 100 + shape.cells.length;
        if (!best || value > best.value) {
          best = { slot, index, value, clearScore };
        }
      });
    });
    return best;
  }

  function placeShape(origin) {
    if (state.over) {
      setStatus("Koniec gry. Zacznij nowa.");
      return;
    }

    const shape = selectedShape();
    if (!shape) {
      setStatus("Wybierz klocek.");
      return;
    }

    if (!canPlace(shape, origin, state.cells)) {
      board.classList.add("is-blocked");
      window.setTimeout(() => board.classList.remove("is-blocked"), 240);
      setStatus("Tu sie nie miesci.");
      if (navigator.vibrate) {
        navigator.vibrate(25);
      }
      return;
    }

    placementCells(shape, origin).forEach((cell) => {
      state.cells[indexOf(cell[0], cell[1])] = shape.color;
    });
    state.score += shape.cells.length * 4;
    state.moves += 1;
    state.tray[state.selectedSlot] = null;
    state.hintCells = [];

    const cleared = clearFullLines();
    const nextSlot = firstAvailableSlot();
    if (nextSlot >= 0) {
      state.selectedSlot = nextSlot;
    } else {
      refillTray(true);
    }

    if (!anyMove()) {
      state.over = true;
      updateBest();
      render();
      setStatus("Koniec gry.");
      return;
    }

    updateBest();
    render();
    setStatus(cleared.lineCount ? `Wyczyszczone linie: ${cleared.lineCount}.` : "Klocek polozony.");
  }

  function rotateSelected() {
    const shape = selectedShape();
    if (!shape || state.over) {
      return;
    }
    shape.cells = rotateCells(shape.cells);
    state.hintCells = [];
    render();
    setStatus("Klocek obrocony.");
  }

  function showHint() {
    if (state.over) {
      setStatus("Koniec gry.");
      return;
    }

    const placement = bestPlacement();
    if (!placement) {
      state.over = true;
      updateBest();
      render();
      setStatus("Brak miejsca.");
      return;
    }

    state.selectedSlot = placement.slot;
    state.hintCells = placementCells(state.tray[placement.slot], placement.index).map((cell) => indexOf(cell[0], cell[1]));
    render();
    setStatus(placement.clearScore ? "Ten ruch czysci linie." : "Tu klocek pasuje.");
  }

  function action(name) {
    if (name === "rotate") rotateSelected();
    if (name === "restart") startGame();
    if (name === "hint") showHint();
    if (name === "new") startGame();
  }

  function renderBoard() {
    board.style.setProperty("--blocks-size", String(state.size));
    board.innerHTML = "";

    state.cells.forEach((value, index) => {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "block-cell";
      cell.dataset.index = String(index);
      cell.classList.toggle("is-hint", state.hintCells.includes(index));
      cell.setAttribute("aria-label", `Pole ${index + 1}`);

      if (value !== null) {
        cell.classList.add("has-block");
        cell.innerHTML = `<span class="block-cube color-${value}" aria-hidden="true"></span>`;
      }

      board.appendChild(cell);
    });
  }

  function renderTray() {
    if (!trayNode) {
      return;
    }

    trayNode.innerHTML = "";
    state.tray.forEach((shape, slot) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "block-piece";
      button.dataset.slot = String(slot);
      button.classList.toggle("is-selected", slot === state.selectedSlot && Boolean(shape));
      button.classList.toggle("is-empty", !shape);

      if (!shape) {
        button.disabled = true;
        button.setAttribute("aria-label", "Puste miejsce");
        trayNode.appendChild(button);
        return;
      }

      const size = bounds(shape.cells);
      button.style.setProperty("--piece-rows", String(size.rows));
      button.style.setProperty("--piece-cols", String(size.cols));
      button.setAttribute("aria-label", shape.name);
      shape.cells.forEach((cell) => {
        const item = document.createElement("span");
        item.className = `mini-block color-${shape.color}`;
        item.style.gridRow = String(cell[0] + 1);
        item.style.gridColumn = String(cell[1] + 1);
        button.appendChild(item);
      });

      trayNode.appendChild(button);
    });
  }

  function render() {
    renderBoard();
    renderTray();
    if (scoreNode) scoreNode.textContent = String(state.score);
    if (linesNode) linesNode.textContent = String(state.lines);
    if (movesNode) movesNode.textContent = String(state.moves);
    if (sizeNode) sizeNode.textContent = String(state.size);
    if (bestNode) bestNode.textContent = currentBest() ? String(currentBest()) : "--";
    if (setNode) setNode.textContent = String(state.set);

    difficultyButtons.forEach((button) => {
      const active = button.dataset.blocksDifficulty === state.difficulty;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  board.addEventListener("click", (event) => {
    const cell = event.target instanceof Element ? event.target.closest("[data-index]") : null;
    if (cell) {
      placeShape(Number(cell.dataset.index || 0));
    }
  });

  if (trayNode) {
    trayNode.addEventListener("click", (event) => {
      const piece = event.target instanceof Element ? event.target.closest("[data-slot]") : null;
      if (!piece) {
        return;
      }
      const slot = Number(piece.dataset.slot || 0);
      if (!state.tray[slot]) {
        return;
      }
      state.selectedSlot = slot;
      state.hintCells = [];
      render();
      setStatus("Wybierz miejsce na planszy.");
    });
  }

  actionButtons.forEach((button) => {
    button.addEventListener("click", () => action(button.dataset.blocksAction || ""));
  });

  difficultyButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const value = button.dataset.blocksDifficulty || "normal";
      if (!difficultyConfig[value] || value === state.difficulty) {
        return;
      }
      state.difficulty = value;
      startGame();
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() === "h") {
      showHint();
    }
    if (event.key.toLowerCase() === "r") {
      startGame();
    }
    if (event.key === " ") {
      event.preventDefault();
      rotateSelected();
    }
  });

  readPrefs();
  startGame();
})();
