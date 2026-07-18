(function () {
  const modeMenu = document.querySelector("[data-solitaire-menu]");
  const gameRoot = document.querySelector("[data-solitaire-game]");
  const board = document.querySelector("[data-solitaire-board]");
  const foundationRoot = document.querySelector("[data-solitaire-foundations]");
  const stockSlot = document.querySelector("[data-solitaire-stock]");
  const wasteSlot = document.querySelector("[data-solitaire-waste]");
  const statusNode = document.querySelector("[data-solitaire-status]");
  const modeNode = document.querySelector("[data-solitaire-mode]");
  const movesNode = document.querySelector("[data-solitaire-moves]");
  const doneNode = document.querySelector("[data-solitaire-done]");
  const stockNode = document.querySelector("[data-solitaire-stock-count]");
  const resetButton = document.querySelector("[data-solitaire-reset]");
  const startButtons = Array.from(document.querySelectorAll("[data-solitaire-start]"));

  const suits = [
    { key: "S", symbol: "\u2660", label: "pik", red: false },
    { key: "H", symbol: "\u2665", label: "kier", red: true },
    { key: "D", symbol: "\u2666", label: "karo", red: true },
    { key: "C", symbol: "\u2663", label: "trefl", red: false },
  ];

  const modes = {
    easy: { label: "Easy", short: "1", draw: 1, redeals: -1 },
    medium: { label: "Medium", short: "3", draw: 3, redeals: -1 },
    hard: { label: "Hard", short: "H", draw: 3, redeals: 1 },
  };

  const rankLabels = {
    1: "A",
    11: "J",
    12: "Q",
    13: "K",
  };

  const state = {
    mode: "easy",
    columns: [],
    stock: [],
    waste: [],
    foundations: {},
    selected: null,
    moves: 0,
    redealsLeft: -1,
  };

  function rankLabel(rank) {
    return rankLabels[rank] || String(rank);
  }

  function suitInfo(suit) {
    return suits.find((item) => item.key === suit) || suits[0];
  }

  function setStatus(message) {
    if (statusNode) {
      statusNode.textContent = message;
    }
  }

  function shuffle(cards) {
    for (let index = cards.length - 1; index > 0; index -= 1) {
      const next = Math.floor(Math.random() * (index + 1));
      const temp = cards[index];
      cards[index] = cards[next];
      cards[next] = temp;
    }
    return cards;
  }

  function buildDeck() {
    const deck = [];
    suits.forEach((suit) => {
      for (let rank = 1; rank <= 13; rank += 1) {
        deck.push({
          id: `${suit.key}-${rank}`,
          suit: suit.key,
          rank,
          label: rankLabel(rank),
          faceUp: false,
        });
      }
    });
    return shuffle(deck);
  }

  function deal(mode) {
    const config = modes[mode] || modes.easy;
    const deck = buildDeck();
    state.mode = mode;
    state.columns = Array.from({ length: 7 }, () => []);
    state.stock = [];
    state.waste = [];
    state.foundations = Object.fromEntries(suits.map((suit) => [suit.key, []]));
    state.selected = null;
    state.moves = 0;
    state.redealsLeft = config.redeals;

    for (let col = 0; col < 7; col += 1) {
      for (let index = 0; index <= col; index += 1) {
        const card = deck.pop();
        card.faceUp = index === col;
        state.columns[col].push(card);
      }
    }

    state.stock = deck;
    if (modeMenu) modeMenu.hidden = true;
    if (gameRoot) gameRoot.hidden = false;
    setStatus("Dobierz karte albo rusz kolumne.");
    render();
  }

  function cardHtml(card, down) {
    if (!card || down || !card.faceUp) {
      return '<span class="card-back-mark"></span>';
    }
    const suit = suitInfo(card.suit);
    const colorClass = suit.red ? "is-red" : "is-black";
    return `
      <span class="card-corner top ${colorClass}">
        <strong>${card.label}</strong>
        <span>${suit.symbol}</span>
      </span>
      <span class="card-center ${colorClass}">${suit.symbol}</span>
      <span class="card-corner bottom ${colorClass}">
        <strong>${card.label}</strong>
        <span>${suit.symbol}</span>
      </span>
    `;
  }

  function isRed(card) {
    return suitInfo(card.suit).red;
  }

  function topFoundation(suit) {
    const pile = state.foundations[suit] || [];
    return pile[pile.length - 1] || null;
  }

  function canPlaceOnFoundation(card, suit) {
    if (!card || card.suit !== suit) {
      return false;
    }
    const top = topFoundation(suit);
    return top ? card.rank === top.rank + 1 : card.rank === 1;
  }

  function canPlaceOnColumn(cards, column) {
    if (!cards.length) {
      return false;
    }
    const first = cards[0];
    const top = column[column.length - 1] || null;
    if (!top) {
      return first.rank === 13;
    }
    return top.faceUp && top.rank === first.rank + 1 && isRed(top) !== isRed(first);
  }

  function isTableauRun(cards) {
    if (!cards.length || cards.some((card) => !card.faceUp)) {
      return false;
    }
    for (let index = 1; index < cards.length; index += 1) {
      const prev = cards[index - 1];
      const card = cards[index];
      if (prev.rank !== card.rank + 1 || isRed(prev) === isRed(card)) {
        return false;
      }
    }
    return true;
  }

  function flipTop(column) {
    const top = column[column.length - 1];
    if (top && !top.faceUp) {
      top.faceUp = true;
    }
  }

  function selectedCards() {
    if (!state.selected) {
      return [];
    }
    if (state.selected.source === "waste") {
      const card = state.waste[state.waste.length - 1];
      return card ? [card] : [];
    }
    if (state.selected.source === "tableau") {
      return state.columns[state.selected.col].slice(state.selected.index);
    }
    return [];
  }

  function clearSelection(message) {
    state.selected = null;
    if (message) {
      setStatus(message);
    }
    render();
  }

  function drawStock() {
    const config = modes[state.mode] || modes.easy;
    if (state.stock.length) {
      for (let count = 0; count < config.draw && state.stock.length; count += 1) {
        const card = state.stock.pop();
        card.faceUp = true;
        state.waste.push(card);
      }
      state.selected = null;
      state.moves += 1;
      setStatus(config.draw === 1 ? "Odkryto karte." : "Odkryto karty.");
      render();
      return;
    }

    if (!state.waste.length) {
      setStatus("Brak kart do odnowienia.");
      return;
    }
    if (state.redealsLeft === 0) {
      setStatus("W tym trybie nie ma juz obiegu talii.");
      return;
    }
    if (state.redealsLeft > 0) {
      state.redealsLeft -= 1;
    }
    state.stock = state.waste.reverse().map((card) => ({ ...card, faceUp: false }));
    state.waste = [];
    state.selected = null;
    state.moves += 1;
    setStatus("Stos odwrocony od nowa.");
    render();
  }

  function moveToFoundation(suit) {
    const cards = selectedCards();
    if (cards.length !== 1 || !canPlaceOnFoundation(cards[0], suit)) {
      setStatus("Na baze idzie as, potem ten sam kolor po kolei.");
      return false;
    }

    const card = cards[0];
    if (state.selected.source === "waste") {
      state.waste.pop();
    } else {
      const column = state.columns[state.selected.col];
      column.splice(state.selected.index, 1);
      flipTop(column);
    }
    state.foundations[suit].push(card);
    state.selected = null;
    state.moves += 1;
    render();
    setStatus(card.rank === 13 ? "Kolor zamkniety." : "Karta na bazie.");
    return true;
  }

  function moveToColumn(targetCol) {
    const cards = selectedCards();
    const target = state.columns[targetCol];
    if (!canPlaceOnColumn(cards, target)) {
      setStatus("Na kolumne kladziesz nizsza karte w przeciwnym kolorze.");
      return false;
    }

    if (state.selected.source === "waste") {
      state.waste.pop();
    } else {
      const source = state.columns[state.selected.col];
      if (state.selected.col === targetCol) {
        clearSelection("Anulowano.");
        return true;
      }
      source.splice(state.selected.index);
      flipTop(source);
    }
    target.push(...cards);
    state.selected = null;
    state.moves += 1;
    render();
    setStatus("Przeniesione.");
    return true;
  }

  function selectWaste() {
    const card = state.waste[state.waste.length - 1];
    if (!card) {
      setStatus("Brak odkrytej karty.");
      return;
    }
    state.selected = { source: "waste" };
    render();
    setStatus(`${card.label} ${suitInfo(card.suit).label} wybrane.`);
  }

  function selectTableau(col, index) {
    const cards = state.columns[col].slice(index);
    if (!isTableauRun(cards)) {
      setStatus("Mozesz ruszac tylko odkryty, poprawny ciag.");
      return;
    }
    state.selected = { source: "tableau", col, index };
    render();
    const card = cards[0];
    setStatus(`${card.label} ${suitInfo(card.suit).label} wybrane.`);
  }

  function autoFoundationFrom(source, col, index) {
    if (source === "waste") {
      const card = state.waste[state.waste.length - 1];
      if (!card) return false;
      state.selected = { source: "waste" };
      return moveToFoundation(card.suit);
    }
    const column = state.columns[col];
    const card = column[index];
    if (!card || index !== column.length - 1) {
      return false;
    }
    state.selected = { source: "tableau", col, index };
    return moveToFoundation(card.suit);
  }

  function completedCount() {
    return suits.reduce((sum, suit) => sum + (state.foundations[suit.key] || []).length, 0);
  }

  function renderPileButton(button, card, options) {
    if (!button) {
      return;
    }
    const opts = options || {};
    button.className = `card-slot ${opts.className || ""}`.trim();
    button.innerHTML = "";
    if (card) {
      const cardNode = document.createElement("span");
      cardNode.className = `playing-card is-pile ${isRed(card) ? "is-red" : "is-black"}`;
      cardNode.classList.toggle("is-down", !card.faceUp);
      cardNode.innerHTML = cardHtml(card);
      button.appendChild(cardNode);
      return;
    }
    const empty = document.createElement("span");
    empty.className = "empty-slot";
    empty.textContent = opts.empty || "";
    button.appendChild(empty);
  }

  function renderFoundations() {
    if (!foundationRoot) {
      return;
    }
    foundationRoot.innerHTML = "";
    suits.forEach((suit) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "card-slot foundation-slot";
      button.dataset.foundation = suit.key;
      const top = topFoundation(suit.key);
      if (top) {
        const cardNode = document.createElement("span");
        cardNode.className = `playing-card is-pile ${suit.red ? "is-red" : "is-black"}`;
        cardNode.innerHTML = cardHtml(top);
        button.appendChild(cardNode);
      } else {
        const empty = document.createElement("span");
        empty.className = `empty-slot ${suit.red ? "is-red" : "is-black"}`;
        empty.textContent = suit.symbol;
        button.appendChild(empty);
      }
      foundationRoot.appendChild(button);
    });
  }

  function render() {
    if (!board) {
      return;
    }
    board.innerHTML = "";
    state.columns.forEach((column, col) => {
      const node = document.createElement("section");
      node.className = "solitaire-column";
      node.dataset.column = String(col);
      column.forEach((card, index) => {
        const cardNode = document.createElement("button");
        cardNode.type = "button";
        cardNode.className = `playing-card ${isRed(card) ? "is-red" : "is-black"}`;
        cardNode.dataset.column = String(col);
        cardNode.dataset.index = String(index);
        cardNode.classList.toggle("is-down", !card.faceUp);
        cardNode.classList.toggle("is-selected", Boolean(state.selected && state.selected.source === "tableau" && state.selected.col === col && index >= state.selected.index));
        cardNode.style.setProperty("--stack", String(index));
        cardNode.setAttribute("aria-label", card.faceUp ? `${card.label} ${suitInfo(card.suit).label}` : "Karta zakryta");
        cardNode.innerHTML = cardHtml(card, !card.faceUp);
        node.appendChild(cardNode);
      });
      board.appendChild(node);
    });

    const wasteTop = state.waste[state.waste.length - 1] || null;
    const stockTop = state.stock.length ? { faceUp: false } : null;
    renderPileButton(stockSlot, stockTop, { className: "stock-slot", empty: state.waste.length ? "\u21bb" : "" });
    renderPileButton(wasteSlot, wasteTop, { className: `waste-slot${state.selected?.source === "waste" ? " is-selected" : ""}`, empty: "" });
    renderFoundations();

    const mode = modes[state.mode] || modes.easy;
    if (modeNode) modeNode.textContent = mode.short;
    if (movesNode) movesNode.textContent = String(state.moves);
    if (doneNode) doneNode.textContent = `${completedCount()}/52`;
    if (stockNode) stockNode.textContent = `${state.stock.length}/${state.waste.length}`;
    if (completedCount() === 52) {
      setStatus("Pasjans ulozony.");
    }
  }

  if (stockSlot) {
    stockSlot.addEventListener("click", drawStock);
  }

  if (wasteSlot) {
    wasteSlot.addEventListener("click", selectWaste);
    wasteSlot.addEventListener("dblclick", () => autoFoundationFrom("waste"));
  }

  if (foundationRoot) {
    foundationRoot.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target.closest("[data-foundation]") : null;
      if (target) {
        moveToFoundation(target.dataset.foundation || "");
      }
    });
  }

  if (board) {
    board.addEventListener("click", (event) => {
      const columnNode = event.target instanceof Element ? event.target.closest("[data-column]") : null;
      if (!columnNode) {
        return;
      }
      const col = Number(columnNode.dataset.column || 0);
      if (state.selected) {
        const moved = moveToColumn(col);
        if (moved) {
          return;
        }
      }
      const cardNode = event.target instanceof Element ? event.target.closest(".playing-card") : null;
      if (!cardNode) {
        return;
      }
      const index = Number(cardNode.dataset.index || 0);
      const card = state.columns[col][index];
      if (!card || !card.faceUp) {
        setStatus("Karta jest zakryta.");
        return;
      }
      selectTableau(col, index);
    });

    board.addEventListener("dblclick", (event) => {
      const cardNode = event.target instanceof Element ? event.target.closest(".playing-card") : null;
      if (!cardNode) {
        return;
      }
      autoFoundationFrom("tableau", Number(cardNode.dataset.column || 0), Number(cardNode.dataset.index || 0));
    });
  }

  startButtons.forEach((button) => {
    button.addEventListener("click", () => deal(button.dataset.solitaireStart || "easy"));
  });

  if (resetButton) {
    resetButton.addEventListener("click", () => {
      if (modeMenu) modeMenu.hidden = false;
      if (gameRoot) gameRoot.hidden = true;
      state.selected = null;
      render();
    });
  }

  const requestedMode = new URLSearchParams(window.location.search).get("mode") || window.location.hash.slice(1);
  if (modes[requestedMode]) {
    deal(requestedMode);
  }
})();
