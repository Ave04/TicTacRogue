// src/App.jsx
import { useEffect, useMemo, useState } from "react";
import Board, { calculateWinner } from "./components/board";
import "./styles.css";

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

function getPlayableEmpties(squares, locks) {
  const out = [];
  for (let i = 0; i < squares.length; i++) {
    if (squares[i] === null && !locks[i]) out.push(i);
  }
  return out;
}

function findImmediateWinIndex(squares, N, locks, symbol) {
  const empties = getPlayableEmpties(squares, locks);

  for (const i of empties) {
    const test = squares.slice();
    test[i] = symbol;
    if (calculateWinner(test, N) === symbol) return i;
  }
  return null;
}

function chooseEnemyMoveIndex(squares, N, locks, enemySymbol, playerSymbol) {
  // 1) Enemy wins if possible
  const win = findImmediateWinIndex(squares, N, locks, enemySymbol);
  if (win !== null) return win;

  // 2) Block player if they can win
  const block = findImmediateWinIndex(squares, N, locks, playerSymbol);
  if (block !== null) return block;

  // 3) Otherwise random empty
  const empties = getPlayableEmpties(squares, locks);
  if (empties.length === 0) return null;
  return empties[Math.floor(Math.random() * empties.length)];
}

function randomEmptyIndex(squares, locks) {
  const empties = getPlayableEmpties(squares, locks);
  if (empties.length === 0) return null;
  return empties[Math.floor(Math.random() * empties.length)];
}

function applyEnemyPassive_THORNS({ squares, locks, enemySymbol }) {
  if (Math.random() >= 0.35) return squares;
  const i = randomEmptyIndex(squares, locks);
  if (i === null) return squares;
  const next = squares.slice();
  next[i] = enemySymbol;
  return next;
}

export default function Game() {
  const N = 5;

  // Player is the starter symbol (can later toggle startSymbol)
  const [startSymbol] = useState("X");
  const playerSymbol = startSymbol;
  const enemySymbol = playerSymbol === "X" ? "O" : "X";

  // CORE
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
  const [aiThinking, setAiThinking] = useState(false);

  const winner = useMemo(
    () => calculateWinner(currentSquares, N),
    [currentSquares, N]
  );

  const isPlayersTurn =
    (xIsNext && playerSymbol === "X") || (!xIsNext && playerSymbol === "O");

  const isEnemyTurn =
    (xIsNext && enemySymbol === "X") || (!xIsNext && enemySymbol === "O");

  function pushBoard(nextSquares) {
    setHistory((prev) => [...prev, nextSquares]);
    setXIsNext((prev) => !prev);
  }

  function canPlayCard(cardId) {
    const def = CARD_DEFS[cardId];
    const card = hand.find((c) => c.id === cardId);

    if (!def || !card) return false;
    if (!isPlayersTurn) return false;
    if (winner) return false;
    if (aiThinking) return false;
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
    if (aiThinking) return;

    // --- Card targeting mode ---
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
          // Only push history if board actually changed (ERASE)
          if (after !== currentSquares) setHistory((prev) => [...prev, after]);
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
            setHistory((prev) => [...prev, after]);
            spendCard(selectedCard);
          } else {
            setTargets([]);
          }
        }
        return;
      }
    }

    // --- Normal move mode ---
    if (!isPlayersTurn) return;
    if (locks[i]) return;
    if (currentSquares[i]) return;

    let next = currentSquares.slice();
    next[i] = playerSymbol;

    const nextLocks = tickLocks(locks);
    setLocks(nextLocks);

    // Trigger enemy passive after player move (chaos)
    if (enemyPassive.id === "THORNS") {
      next = applyEnemyPassive_THORNS({
        squares: next,
        locks: nextLocks,
        enemySymbol,
      });
    }

    pushBoard(next);

    // Simple refill per player turn for now
    setEnergy(1);
  }

  // Enemy takes a move automatically on its turn
  useEffect(() => {
    if (winner) return;
    if (!isEnemyTurn) return;

    setAiThinking(true);

    const t = setTimeout(() => {
      const i = chooseEnemyMoveIndex(
        currentSquares,
        N,
        locks,
        enemySymbol,
        playerSymbol
      );

      if (i === null) {
        setAiThinking(false);
        return;
      }

      let next = currentSquares.slice();
      next[i] = enemySymbol;

      // Tick locks after enemy move too
      const nextLocks = tickLocks(locks);
      setLocks(nextLocks);

      pushBoard(next);

      setAiThinking(false);
    }, 350);

    return () => clearTimeout(t);
  }, [
    isEnemyTurn,
    winner,
    currentSquares,
    N,
    locks,
    enemySymbol,
    playerSymbol,
  ]);

  const statusText = winner
    ? `Winner: ${winner}`
    : aiThinking
    ? "Enemy is thinking..."
    : `${isPlayersTurn ? "Your" : "Enemy"} turn (${
        isPlayersTurn ? playerSymbol : enemySymbol
      })`;

  return (
    <div className="page">
      <div className="header">
        <div>
          <div className="title">RogueTac</div>
          <div className="subtitle">
            Phase 1.1: Cards + Enemy Passive + AI Move
          </div>
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
