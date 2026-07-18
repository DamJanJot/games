(function () {
  const board = document.querySelector("[data-lines-board]");
  const nextNode = document.querySelector("[data-lines-next]");
  const statusNode = document.querySelector("[data-lines-status]");
  const scoreNode = document.querySelector("[data-lines-score]");
  const movesNode = document.querySelector("[data-lines-moves]");
  const freeNode = document.querySelector("[data-lines-free]");
  const targetNode = document.querySelector("[data-lines-target]");
  const bestNode = document.querySelector("[data-lines-best]");
  const clearedNode = document.querySelector("[data-lines-cleared]");
  const actionButtons = Array.from(document.querySelectorAll("[data-lines-action]"));
  const difficultyButtons = Array.from(document.querySelectorAll("[data-lines-difficulty]"));

  if (!board) {
    return;
  }

  const prefsKey = "gierkotekaLinesPrefs";
  const directions = [
    { dr: 0, dc: 1 },
    { dr: 1, dc: 0 },
    { dr: 1, dc: 1 },
    { dr: 1, dc: -1 },
  ];
  const walkDirections = [
    { dr: -1, dc: 0 },
    { dr: 0, dc: 1 },
    { dr: 1, dc: 0 },
    { dr: 0, dc: -1 },
  ];
  const difficultyConfig = {
    easy: { size: 7, target: 4, start: 5, spawn: 3 },
    normal: { size: 7, target: 5, start: 7, spawn: 3 },
    hard: { size: 8, target: 5, start: 10, spawn: 4 },
  };

  const state = {
    difficulty: "normal",
    size: 7,
    target: 5,
    spawn: 3,
    cells: [],
    next: [],
    selected: -1,
    hintFrom: -1,
    hintTo: -1,
    score: 0,
    moves: 0,
    cleared: 0,
    history: [],
    over: false,
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

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
    const config = difficultyConfig[state.difficulty];
    state.size = config.size;
    state.target = config.target;
    state.spawn = config.spawn;
  }

  function randomColor() {
    return Math.floor(Math.random() * 6);
  }

  function randomColors(count) {
    return Array.from({ length: count }, randomColor);
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

  function isInside(row, col) {
    return row >= 0 && row < state.size && col >= 0 && col < state.size;
  }

  function emptyCells(cells) {
    return cells
      .map((value, index) => (value === null ? index : -1))
      .filter((index) => index >= 0);
  }

  function pickRandom(items) {
    return items[Math.floor(Math.random() * items.length)];
  }

  function bestKey() {
    return `gierkotekaLinesBest:${state.difficulty}`;
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

  function setStatus(message) {
    if (statusNode) {
      statusNode.textContent = message;
    }
  }

  function snapshot() {
    return {
      cells: state.cells.slice(),
      next: state.next.slice(),
      selected: state.selected,
      score: state.score,
      moves: state.moves,
      cleared: state.cleared,
      over: state.over,
    };
  }

  function restore(value) {
    state.cells = value.cells.slice();
    state.next = value.next.slice();
    state.selected = value.selected;
    state.score = value.score;
    state.moves = value.moves;
    state.cleared = value.cleared;
    state.over = value.over;
    state.hintFrom = -1;
    state.hintTo = -1;
    render();
    setStatus("Cofniete.");
  }

  function placeRandomBalls(colors) {
    colors.forEach((color) => {
      const empties = emptyCells(state.cells);
      if (!empties.length) {
        return;
      }
      state.cells[pickRandom(empties)] = color;
    });
  }

  function startGame() {
    applyConfig();
    savePrefs();
    state.cells = Array.from({ length: state.size * state.size }, () => null);
    state.next = randomColors(state.spawn);
    state.selected = -1;
    state.hintFrom = -1;
    state.hintTo = -1;
    state.score = 0;
    state.moves = 0;
    state.cleared = 0;
    state.history = [];
    state.over = false;
    placeRandomBalls(randomColors(difficultyConfig[state.difficulty].start));
    render();
    setStatus("Wybierz kulke.");
  }

  function pathBetween(from, to, cells) {
    if (from === to || cells[to] !== null) {
      return [];
    }

    const queue = [from];
    const visited = new Set([from]);
    const previous = new Map();

    while (queue.length) {
      const current = queue.shift();
      if (current === to) {
        const path = [];
        let cursor = to;
        while (cursor !== undefined) {
          path.push(cursor);
          cursor = previous.get(cursor);
        }
        return path.reverse();
      }

      const row = rowOf(current);
      const col = colOf(current);
      walkDirections.forEach((direction) => {
        const nextRow = row + direction.dr;
        const nextCol = col + direction.dc;
        if (!isInside(nextRow, nextCol)) {
          return;
        }
        const nextIndex = indexOf(nextRow, nextCol);
        if (visited.has(nextIndex) || (cells[nextIndex] !== null && nextIndex !== from)) {
          return;
        }
        visited.add(nextIndex);
        previous.set(nextIndex, current);
        queue.push(nextIndex);
      });
    }

    return [];
  }

  function reachableTargets(from) {
    return emptyCells(state.cells).filter((target) => pathBetween(from, target, state.cells).length > 0);
  }

  function collectLineCells(index, color, cells) {
    const found = new Set();
    const row = rowOf(index);
    const col = colOf(index);

    directions.forEach((direction) => {
      const run = [index];

      [-1, 1].forEach((side) => {
        let nextRow = row + direction.dr * side;
        let nextCol = col + direction.dc * side;
        while (isInside(nextRow, nextCol)) {
          const nextIndex = indexOf(nextRow, nextCol);
          if (cells[nextIndex] !== color) {
            break;
          }
          run.push(nextIndex);
          nextRow += direction.dr * side;
          nextCol += direction.dc * side;
        }
      });

      if (run.length >= state.target) {
        run.forEach((cell) => found.add(cell));
      }
    });

    return found;
  }

  function clearLines() {
    const cleared = new Set();
    state.cells.forEach((color, index) => {
      if (color === null) {
        return;
      }
      collectLineCells(index, color, state.cells).forEach((cell) => cleared.add(cell));
    });

    if (!cleared.size) {
      return 0;
    }

    cleared.forEach((index) => {
      state.cells[index] = null;
    });
    state.cleared += cleared.size;
    state.score += cleared.size * 10 + Math.max(0, cleared.size - state.target) * 8;
    updateBest();
    return cleared.size;
  }

  function spawnNext() {
    const colors = state.next.slice();
    placeRandomBalls(colors);
    const removed = clearLines();
    state.next = randomColors(state.spawn);
    if (!emptyCells(state.cells).length) {
      state.over = true;
      updateBest();
    }
    return { added: colors.length, removed };
  }

  function finishIfFull() {
    if (!emptyCells(state.cells).length) {
      state.over = true;
      updateBest();
      return true;
    }
    return false;
  }

  function moveSelected(target) {
    if (state.selected < 0 || state.over) {
      return;
    }

    const path = pathBetween(state.selected, target, state.cells);
    if (!path.length) {
      board.classList.add("is-blocked");
      window.setTimeout(() => board.classList.remove("is-blocked"), 240);
      setStatus("Nie ma wolnej sciezki.");
      if (navigator.vibrate) {
        navigator.vibrate(25);
      }
      return;
    }

    state.history.push(snapshot());
    const color = state.cells[state.selected];
    state.cells[state.selected] = null;
    state.cells[target] = color;
    state.selected = -1;
    state.hintFrom = -1;
    state.hintTo = -1;
    state.moves += 1;
    state.score += 2;

    const removed = clearLines();
    let message = removed ? `Usuniete: ${removed}.` : "";

    if (!removed) {
      const spawned = spawnNext();
      if (spawned.removed) {
        message = `Nowe kulki domknely ${spawned.removed}.`;
      } else {
        message = `Dodane: ${spawned.added}.`;
      }
    }

    if (finishIfFull()) {
      message = "Koniec planszy.";
    }

    render();
    setStatus(message);
  }

  function selectCell(index) {
    if (state.over) {
      setStatus("Koniec gry. Zacznij nowa.");
      return;
    }

    const value = state.cells[index];
    if (value !== null) {
      state.selected = state.selected === index ? -1 : index;
      state.hintFrom = -1;
      state.hintTo = -1;
      render();
      setStatus(state.selected >= 0 ? "Wybierz wolne pole." : "Wybierz kulke.");
      return;
    }

    if (state.selected >= 0) {
      moveSelected(index);
      return;
    }

    setStatus("Najpierw wybierz kulke.");
  }

  function scoreMove(from, to) {
    const color = state.cells[from];
    const cells = state.cells.slice();
    cells[from] = null;
    cells[to] = color;
    return collectLineCells(to, color, cells).size;
  }

  function findHint() {
    let fallback = null;
    let best = null;

    state.cells.forEach((value, from) => {
      if (value === null) {
        return;
      }
      reachableTargets(from).forEach((to) => {
        if (!fallback) {
          fallback = { from, to, score: 0 };
        }
        const score = scoreMove(from, to);
        if (score >= state.target && (!best || score > best.score)) {
          best = { from, to, score };
        }
      });
    });

    return best || fallback;
  }

  function showHint() {
    if (state.over) {
      setStatus("Koniec gry.");
      return;
    }

    const hint = findHint();
    if (!hint) {
      setStatus("Brak ruchu.");
      return;
    }

    state.selected = hint.from;
    state.hintFrom = hint.from;
    state.hintTo = hint.to;
    render();
    setStatus(hint.score ? "Ten ruch domyka linie." : "Ta kulka ma przejscie.");
  }

  function undo() {
    if (!state.history.length) {
      setStatus("Nie ma cofniecia.");
      return;
    }
    restore(state.history.pop());
  }

  function action(name) {
    if (name === "undo") undo();
    if (name === "restart") startGame();
    if (name === "hint") showHint();
    if (name === "new") startGame();
  }

  function renderNext() {
    if (!nextNode) {
      return;
    }

    nextNode.innerHTML = "";
    state.next.forEach((color) => {
      const item = document.createElement("span");
      item.className = `next-ball color-${color}`;
      nextNode.appendChild(item);
    });
  }

  function render() {
    board.style.setProperty("--lines-size", String(state.size));
    board.innerHTML = "";

    state.cells.forEach((value, index) => {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "lines-cell";
      cell.dataset.index = String(index);
      cell.classList.toggle("is-selected", index === state.selected);
      cell.classList.toggle("is-hint-source", index === state.hintFrom);
      cell.classList.toggle("is-hint-target", index === state.hintTo);

      if (value !== null) {
        cell.classList.add("has-ball");
        cell.innerHTML = `<span class="line-ball color-${value}" aria-hidden="true"></span>`;
        cell.setAttribute("aria-label", `Kulka ${index + 1}`);
      } else {
        cell.setAttribute("aria-label", `Puste pole ${index + 1}`);
      }

      board.appendChild(cell);
    });

    renderNext();
    if (scoreNode) scoreNode.textContent = String(state.score);
    if (movesNode) movesNode.textContent = String(state.moves);
    if (freeNode) freeNode.textContent = String(emptyCells(state.cells).length);
    if (targetNode) targetNode.textContent = String(state.target);
    if (bestNode) bestNode.textContent = currentBest() ? String(currentBest()) : "--";
    if (clearedNode) clearedNode.textContent = String(state.cleared);

    difficultyButtons.forEach((button) => {
      const active = button.dataset.linesDifficulty === state.difficulty;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  board.addEventListener("click", (event) => {
    const cell = event.target instanceof Element ? event.target.closest("[data-index]") : null;
    if (cell) {
      selectCell(Number(cell.dataset.index || 0));
    }
  });

  actionButtons.forEach((button) => {
    button.addEventListener("click", () => action(button.dataset.linesAction || ""));
  });

  difficultyButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const value = button.dataset.linesDifficulty || "normal";
      if (!difficultyConfig[value] || value === state.difficulty) {
        return;
      }
      state.difficulty = value;
      startGame();
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      state.selected = -1;
      state.hintFrom = -1;
      state.hintTo = -1;
      render();
    }
    if (event.key.toLowerCase() === "h") {
      showHint();
    }
    if (event.key.toLowerCase() === "r") {
      startGame();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      undo();
    }
  });

  readPrefs();
  startGame();
})();
