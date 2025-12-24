import { useState, useMemo } from "react";
import Board, { calculateWinner } from "./components/board";

const CARD_DEFS = {
  ERASE: { id: "ERASE", name: "Erase", cost: 1, target: "single" },
  SWAP: { id: "SWAP", name: "Swap", cost: 1, target: "double" },
  SHIELD: { id: "SHIELD", name: "Shield", cost: 1, target: "single" },
};

function tickLocks(locks) {
  const next = {};
  for (const key of Object.keys(locks)) {
    const i = Number(key);
    const t = locks[i] - 1;
    if (t > 0) next[i] = t;
  }
  return next;
}

function randomEmptyIndex(squares, locks) {
  const empties = [];
  for (let i = 0; i < squares.length; i++) {
    if (squares[i] === null && !locks[i]) empties.push(i);
  }
  if (empties.length === 0) return null;
  return empties[Math.floor(Math.random() * empties.length)];
}

function applyEnemyPassive_THORNS({ squares, locks, enemySymbol }) {
  // 25% chance to place an enemy mark in a random empty square
  if (Math.random() >= 0.25) return squares;
  const i = randomEmptyIndex(squares, locks);
  if (i === null) return squares;
  const next = squares.slice();
  next[i] = enemySymbol;
  return next;
}

export default function Game() {
  // basic grid for core game
  const N = 10;

  const [startSymbol] = useState("X");
  const playerSymbol = startSymbol;
  const enemySymbol = playerSymbol === "X" ? "O" : "X";

  const [xIsNext, setXIsNext] = useState(true);
  const [history, setHistory] = useState([Array(N * N).fill(null)]);
  const currentSquares = history[history.length - 1];

  // ROGUELIKE ELEMENTS
  const [hand, setHand] = useState([
    { id: "ERASE", charges: 1 },
    { id: "SWAP", charges: 1 },
    { id: "SHIELD", charges: 1 },
  ]);
  const [selectedCard, setSelectedCard] = useState(null);
  const [targets, setTargets] = useState([]);
  const [energy, setEnergy] = useState(1);
  const [enemyPassive] = useState({ id: "THORNS" });
  const [locks, setLocks] = useState({});

  const winner = useMemo(
    () => calculateWinner(currentSquares, N),
    [currentSquares, N]
  );
  const isPlayersTurn =
    (xIsNext && playerSymbol === "X") || (!xIsNext && playerSymbol === "O");

  function setBoard(nextSquares) {
    setHistory([...history, nextSquares]);
    setXIsNext(!xIsNext);
  }

  function canPlayCard(cardId) {
    const def = CARD_DEFS[cardId];
    const card = hand.find((c) => c.id === cardId);
    if (!def || !card) return false;
    if (!isPlayersTurn) return false;
    if (winner) return false;
    if (energy < def.cost) return false;
    if (card.charges <= 0) return false;
    return true;
  }

  function spendCard(cardId) {
    const def = CARD_DEFS[cardId];
    setEnergy((e) => e - def.cost);
    setHand((prev) =>
      prev.map((c) => (c.id === cardId ? { ...c, charges: c.charges - 1 } : c))
    );
    setSelectedCard(null);
    setTargets([]);
  }

  function applyCardSingle(cardId, i, squares) {
    if (locks[i]) return { ok: false, squares };

    if (cardId === "ERASE") {
      if (squares[i] === null) return { ok: false, squares };
      const next = squares.slice();
      next[i] = null;
      return { ok: true, squares: next };
    }

    if (cardId === "SHIELD") {
      setLocks((prev) => ({ ...prev, [i]: 2 }));
      return { ok: true, squares };
    }

    return { ok: false, squares };
  }

  function applyCardSwap(i1, i2, squares) {
    if (i1 === i2) return { ok: false, squares };
    if (locks[i1] || locks[i2]) return { ok: false, squares };
    const next = squares.slice();
    const tmp = next[i1];
    next[i1] = next[i2];
    next[i2] = tmp;
    return { ok: true, squares: next };
  }

  function handleSquareClick(i) {
    if (winner) return;

    // Card targeting mode
    if (selectedCard) {
      if (!canPlayCard(selectedCard)) return;

      const def = CARD_DEFS[selectedCard];
      if (def.target === "single") {
        const { ok, squares: after } = applyCardSingle(
          selectedCard,
          i,
          currentSquares
        );
        if (ok) {
          // SHIELD might not change squares; ERASE might
          if (after !== currentSquares) setHistory([...history, after]);
          spendCard(selectedCard);
        }
        return;
      }

      if (def.target === "double") {
        const nextTargets = [...targets, i];
        setTargets(nextTargets);
        if (nextTargets.length === 2) {
          const { ok, squares: after } = applyCardSwap(
            nextTargets[0],
            nextTargets[1],
            currentSquares
          );
          if (ok) {
            setHistory([...history, after]);
            spendCard(selectedCard);
          } else {
            setTargets([]);
          }
        }
        return;
      }
    }

    // Normal move mode
    if (!isPlayersTurn) return;
    if (locks[i]) return;
    if (currentSquares[i]) return;

    // place player's symbol
    let next = currentSquares.slice();
    next[i] = isPlayersTurn ? playerSymbol : enemySymbol;

    // tick locks after a move
    const nextLocks = tickLocks(locks);
    setLocks(nextLocks);

    // enemy passive triggers after player move (chaos)
    if (enemyPassive.id === "THORNS") {
      next = applyEnemyPassive_THORNS({
        squares: next,
        locks: nextLocks,
        enemySymbol,
      });
    }

    setBoard(next);

    // Simple energy regen each turn for now
    setEnergy(1);
  }

  const statusText = winner
    ? `Winner: ${winner}`
    : `${isPlayersTurn ? "Your" : "Enemy"} turn (${
        isPlayersTurn ? playerSymbol : enemySymbol
      })`;

  return (
    <div className="page">
      <div className="header">
        <div>
          <div className="title">RogueTac</div>
          <div className="subtitle">Phase 1: Cards + Enemy Passive</div>
        </div>

        <div className="hud">
          <div className="pill">Energy: {energy}</div>
          <div className="pill">Enemy passive: {enemyPassive.id}</div>
        </div>
      </div>

      <div className="content">
        <div className="left">
          <div className="panelTitle">Cards</div>
          <div className="cards">
            {hand.map((c) => {
              const def = CARD_DEFS[c.id];
              const playable = canPlayCard(c.id);
              const selected = selectedCard === c.id;

              return (
                <button
                  key={c.id}
                  className={`card ${selected ? "selected" : ""}`}
                  disabled={!playable}
                  onClick={() => {
                    setTargets([]);
                    setSelectedCard((prev) => (prev === c.id ? null : c.id));
                  }}
                >
                  <div className="cardTop">
                    <span className="cardName">{def.name}</span>
                    <span className="pill">⚡{def.cost}</span>
                  </div>
                  <div className="small">Charges: {c.charges}</div>
                  {selected && def.target === "double" && (
                    <div className="small">
                      Pick 2 squares ({targets.length}/2)
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="center">
          <Board
            N={N}
            squares={currentSquares}
            locks={locks}
            onSquareClick={handleSquareClick}
            statusText={statusText}
          />
        </div>
      </div>
    </div>
  );
}
