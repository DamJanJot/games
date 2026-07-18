(function () {
  const board = document.querySelector("[data-sudoku-board]");
  const levelNode = document.querySelector("[data-sudoku-level]");
  const statusNode = document.querySelector("[data-sudoku-status]");
  const filledNode = document.querySelector("[data-sudoku-filled]");
  const errorsNode = document.querySelector("[data-sudoku-errors]");
  const numberButtons = Array.from(document.querySelectorAll("[data-number]"));
  const actionButtons = Array.from(document.querySelectorAll("[data-sudoku-action]"));

  const puzzles = [
    {
      puzzle: "1..4.4.22..3.3.1",
      solution: "1234341221434321",
    },
    {
      puzzle: ".1.34..1.2.43..2",
      solution: "2143432112343412",
    },
    {
      puzzle: "3..2.2.44..1.1.3",
      solution: "3412123443212143",
    },
  ];

  const state = {
    index: Number(localStorage.getItem("gierkotekaSudokuIndex") || 0) % puzzles.length,
    values: [],
    selected: -1,
    errors: 0,
  };

  function puzzle() {
    return puzzles[state.index];
  }

  function givens() {
    return puzzle().puzzle.split("");
  }

  function solution() {
    return puzzle().solution.split("");
  }

  function setStatus(message) {
    if (statusNode) {
      statusNode.textContent = message;
    }
  }

  function start(index) {
    state.index = (index + puzzles.length) % puzzles.length;
    state.values = givens().map((value) => (value === "." ? "" : value));
    state.selected = state.values.findIndex((value, cell) => value === "" && givens()[cell] === ".");
    state.errors = 0;
    localStorage.setItem("gierkotekaSudokuIndex", String(state.index));
    render();
    setStatus("Wybierz pole.");
  }

  function sameGroup(left, right) {
    const leftRow = Math.floor(left / 4);
    const rightRow = Math.floor(right / 4);
    const leftCol = left % 4;
    const rightCol = right % 4;
    const leftBox = Math.floor(leftRow / 2) * 2 + Math.floor(leftCol / 2);
    const rightBox = Math.floor(rightRow / 2) * 2 + Math.floor(rightCol / 2);
    return leftRow === rightRow || leftCol === rightCol || leftBox === rightBox;
  }

  function conflicts(cell) {
    const value = state.values[cell];
    if (!value) {
      return false;
    }
    return state.values.some((other, index) => index !== cell && other === value && sameGroup(cell, index));
  }

  function render() {
    if (!board) {
      return;
    }

    const given = givens();
    board.innerHTML = "";
    state.values.forEach((value, index) => {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "sudoku-cell";
      cell.dataset.cell = String(index);
      cell.classList.toggle("is-given", given[index] !== ".");
      cell.classList.toggle("is-selected", index === state.selected);
      cell.classList.toggle("is-peer", state.selected >= 0 && sameGroup(index, state.selected));
      cell.classList.toggle("is-error", conflicts(index));
      cell.textContent = value;
      cell.setAttribute("aria-label", `Pole ${index + 1}${value ? `, ${value}` : ""}`);
      board.appendChild(cell);
    });

    if (levelNode) levelNode.textContent = String(state.index + 1);
    if (filledNode) filledNode.textContent = String(state.values.filter(Boolean).length);
    if (errorsNode) errorsNode.textContent = String(state.errors);
  }

  function selectCell(index) {
    state.selected = index;
    render();
    setStatus(givens()[index] === "." ? "Wpisz cyfre." : "To pole jest stale.");
  }

  function writeNumber(value) {
    if (state.selected < 0 || givens()[state.selected] !== ".") {
      setStatus("Najpierw wybierz puste pole.");
      return;
    }

    state.values[state.selected] = value;
    if (value !== solution()[state.selected]) {
      state.errors += 1;
      setStatus("Jeszcze nie ta cyfra.");
    } else {
      setStatus("Pasuje.");
    }

    render();
    if (state.values.join("") === puzzle().solution) {
      setStatus("Sudoku gotowe.");
    }
  }

  function clearSelected() {
    if (state.selected >= 0 && givens()[state.selected] === ".") {
      state.values[state.selected] = "";
      render();
      setStatus("Wyczyszczone.");
    }
  }

  function hint() {
    if (state.selected < 0 || givens()[state.selected] !== ".") {
      const empty = state.values.findIndex((value, index) => !value && givens()[index] === ".");
      state.selected = empty;
    }
    if (state.selected >= 0) {
      state.values[state.selected] = solution()[state.selected];
      render();
      setStatus("Podpowiedz wpisana.");
    }
  }

  if (board) {
    board.addEventListener("click", (event) => {
      const cell = event.target instanceof Element ? event.target.closest("[data-cell]") : null;
      if (cell) {
        selectCell(Number(cell.dataset.cell || 0));
      }
    });
  }

  numberButtons.forEach((button) => {
    button.addEventListener("click", () => writeNumber(button.dataset.number || ""));
  });

  actionButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.sudokuAction || "";
      if (action === "clear") clearSelected();
      if (action === "hint") hint();
      if (action === "reset") start(state.index);
      if (action === "next") start(state.index + 1);
    });
  });

  start(state.index);
})();
