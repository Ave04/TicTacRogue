// src/App.jsx
import { useEffect, useMemo, useState } from "react";
import Board, { calculateWinner } from "./components/board";
import "./styles.css";

const CARD_DEFS = {
  ERASE: { id: "ERASE", name: "Erase", cost: 1, target: "single" },
  SWAP: { id: "SWAP", name: "Swap", cost: 1, target: "double" },
  SHIELD: { id: "SHIELD", name: "Shield", cost: 1, target: "single" },
  // easy future adds:
  // PIERCE: { id: "PIERCE", name: "Pierce", cost: 1, target: "single" },
};

function tickLocks(locks) {
  const next = {};
  for (const key in Object.keys(locks)) {
    const i = Number(key);
    const t = locks[i] - 1;
    if (t > 0) next[i] = t;
  }
  return next;
}

function getPlayableEmpties(squares, locks) {
  const canPlay = [];
  for (let i = 0; i < squares.length; i++) {
    if (squares[i] === null && !locks[i]) canPlay.push(i);
  }
  return canPlay;
}

function findImmediateWinIndex(squares, N, locks, symbol) {
  const empties = getPlayableEmpties(squares, locks);
  for (const i of empties) {
    const copy = squares.slice();
    copy[i] = symbol;
    if (calculateWinner(copy, N) === symbol) return i;
  }
  return null;
}

function chooseEnemyMoveIndex(squares, N, locks, enemySymbol, playerSymbol) {
  const win = findImmediateWinIndex(squares, N, locks, enemySymbol);
  if (win !== null) return win;

  const block = findImmediateWinIndex(squares, N, locks, playerSymbol);
  if (block !== null) return block;

  const empties = getPlayableEmpties(squares, locks);
  if (empties.length === 0) return null;
  return empties[Math.floor(Math.random() * empties.length)];
}

function randomEmptyIndex(squares, locks) {
  const empties = getPlayableEmpties(squares, locks);
  if (empties.length === 0) return null;
  return empties[Math.floor(Math.random() * empties.length)];
}

// enemy passive (scales with floor via chance)
function applyEnemyPassive_THORNS({ squares, locks, enemySymbol, chance }) {
  if (Math.random() >= chance) return squares;
  const i = randomEmptyIndex(squares, locks);
  if (i === null) return squares;
  const next = squares.slice();
  next[i] = enemySymbol;
  return next;
}

// ---------- Rewards ----------
function makeRewardOptions(hand) {
  const options = [
    { type: "ENERGY_UP", label: "+1 Max Energy" },
    { type: "CHARGES_UP", label: "+1 Max Charges (random card)" },
    { type: "NEW_CARD", label: "Gain a New Card" },
  ];

  // If you already own all cards, replace NEW_CARD with another charges/energy option
  const owned = new Set(hand.map((c) => c.id));
  const all = Object.keys(CARD_DEFS);
  const hasAnyNew = all.some((id) => !owned.has(id));
  if (!hasAnyNew) {
    options[2] = { type: "CHARGES_UP", label: "+1 Max Charges (random card)" };
  }

  // Shuffle and take first 3
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return options.slice(0, 3);
}

function createInitialHand() {
  return [
    { id: "ERASE", charges: 1, maxCharges: 1 },
    { id: "SWAP", charges: 1, maxCharges: 1 },
    { id: "SHIELD", charges: 1, maxCharges: 1 },
  ];
}

function refillHandCharges(hand) {
  return hand.map((c) => ({ ...c, charges: c.maxCharges }));
}

function makeEmptyBoard(N) {
  return Array(N * N).fill(null);
}

export default function Game() {
  const [floor, setFloor] = useState(1);
  const N = 2 + floor;

  // Player symbol is starter
  const [startSymbol] = useState("X");
  const playerSymbol = startSymbol;
  const enemySymbol = playerSymbol === "X" ? "O" : "X";

  // Game phase
  const [phase, setPhase] = useState("PLAYING"); // PLAYING | REWARD | GAMEOVER
  const [rewards, setRewards] = useState([]);

  // CORE board state
  const [xIsNext, setXIsNext] = useState(playerSymbol === "X");
  const [history, setHistory] = useState([makeEmptyBoard(N)]);
  const currentSquares = history[history.length - 1];

  // Roguelike systems
  const [hand, setHand] = useState(createInitialHand());
  const [selectedCard, setSelectedCard] = useState(null);
  const [targets, setTargets] = useState([]);

  const [maxEnergy, setMaxEnergy] = useState(1);
  const [energy, setEnergy] = useState(1);

  const [enemyPassive] = useState({ id: "THORNS" });
  const [locks, setLocks] = useState({});
  const [aiThinking, setAiThinking] = useState(false);

  // Enemy passive scaling with floor (gentle)
  const thornsChance = Math.min(0.1 + (floor - 1) * 0.04, 0.65);

  const winner = useMemo(
    () => calculateWinner(currentSquares, N),
    [currentSquares, N]
  );

  const isPlayersTurn =
    (xIsNext && playerSymbol === "X") || (!xIsNext && playerSymbol === "O");

  const isEnemyTurn =
    (xIsNext && enemySymbol === "X") || (!xIsNext && enemySymbol === "O");

  // ---------- Utility: commit a normal turn ----------
  function pushBoard(nextSquares) {
    setHistory((prev) => [...prev, nextSquares]);
    setXIsNext((prev) => !prev);
  }

  function resetFight(nextFloor) {
    const nextN = 2 + nextFloor;

    setSelectedCard(null);
    setTargets([]);
    setLocks({});
    setAiThinking(false);

    // Player always starts each fight
    setXIsNext(playerSymbol === "X");

    setHistory([makeEmptyBoard(nextN)]);

    // refill energy + card charges each new fight
    setEnergy(maxEnergy);
    setHand((prev) => refillHandCharges(prev));
  }

  function restartRun() {
    setFloor(1);
    setPhase("PLAYING");
    setRewards([]);
    setHand(createInitialHand());
    setMaxEnergy(1);
    setEnergy(1);
    setSelectedCard(null);
    setTargets([]);
    setLocks({});
    setAiThinking(false);
    setXIsNext(playerSymbol === "X");
    setHistory([makeEmptyBoard(3)]);
  }

  // ---------- End-of-fight handling ----------
  useEffect(() => {
    if (!winner) return;
    if (phase !== "PLAYING") return;

    setAiThinking(false);

    if (winner === playerSymbol) {
      // WIN -> reward
      setPhase("REWARD");
      setRewards(makeRewardOptions(hand));
    } else {
      // LOSE -> game over
      setPhase("GAMEOVER");
    }
  }, [winner, phase, playerSymbol, hand]);

  // ---------- Cards ----------
  function canPlayCard(cardId) {
    const def = CARD_DEFS[cardId];
    const card = hand.find((c) => c.id === cardId);

    if (phase !== "PLAYING") return false;
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

  // ---------- Click handler ----------
  function handleSquareClick(i) {
    if (phase !== "PLAYING") return;
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

    // Enemy passive triggers after player move
    if (enemyPassive.id === "THORNS") {
      next = applyEnemyPassive_THORNS({
        squares: next,
        locks: nextLocks,
        enemySymbol,
        chance: thornsChance,
      });
    }

    pushBoard(next);

    // Energy refills per player turn for now (simple)
    setEnergy(maxEnergy);
  }

  // ---------- Enemy AI turn ----------
  useEffect(() => {
    if (phase !== "PLAYING") return;
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

      const nextLocks = tickLocks(locks);
      setLocks(nextLocks);

      pushBoard(next);

      setAiThinking(false);
    }, 350);

    return () => clearTimeout(t);
  }, [
    phase,
    isEnemyTurn,
    winner,
    currentSquares,
    N,
    locks,
    enemySymbol,
    playerSymbol,
  ]);

  // ---------- Rewards ----------
  function applyReward(option) {
    if (phase !== "REWARD") return;

    if (option.type === "ENERGY_UP") {
      setMaxEnergy((m) => m + 1);
      setEnergy((e) => e + 1);
    }

    if (option.type === "CHARGES_UP") {
      setHand((prev) => {
        if (prev.length === 0) return prev;
        const pick = prev[Math.floor(Math.random() * prev.length)].id;
        return prev.map((c) =>
          c.id === pick
            ? { ...c, maxCharges: c.maxCharges + 1, charges: c.maxCharges + 1 }
            : c
        );
      });
    }

    if (option.type === "NEW_CARD") {
      setHand((prev) => {
        const owned = new Set(prev.map((c) => c.id));
        const all = Object.keys(CARD_DEFS).filter((id) => !owned.has(id));
        if (all.length === 0) return prev;
        const newId = all[Math.floor(Math.random() * all.length)];
        return [...prev, { id: newId, maxCharges: 1, charges: 1 }];
      });
    }

    // Advance to next floor with larger board
    const nextFloor = floor + 1;
    setFloor(nextFloor);
    setPhase("PLAYING");
    setRewards([]);

    // Reset fight for next floor AFTER floor updates (use nextFloor directly)
    resetFight(nextFloor);
  }

  const statusText =
    phase === "GAMEOVER"
      ? "Game Over"
      : winner
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
            Floor {floor} • Board {N}×{N} • Win to advance
          </div>
        </div>

        <div className="hud">
          <div className="pill">
            Energy: {energy}/{maxEnergy}
          </div>
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
                    <span className="cardName">{def?.name ?? c.id}</span>
                    <span className="pill">⚡{def?.cost ?? 1}</span>
                  </div>
                  <div className="small">
                    Charges: {c.charges}/{c.maxCharges}
                  </div>
                  {selected && def?.target === "double" && (
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
          <div className="boardWrap">
            <Board
              N={N}
              squares={currentSquares}
              locks={locks}
              onSquareClick={handleSquareClick}
              statusText={statusText}
            />

            {phase === "REWARD" && (
              <div
                style={{
                  marginTop: 12,
                  width: "min(520px, 90vw)",
                  background: "rgba(255,255,255,0.85)",
                  border: "1px solid rgba(15,23,42,0.12)",
                  borderRadius: 16,
                  padding: 14,
                  boxShadow: "0 12px 28px rgba(15,23,42,0.10)",
                }}
              >
                <div style={{ fontWeight: 900, marginBottom: 10 }}>
                  Choose a reward (Floor {floor} cleared)
                </div>

                <div style={{ display: "grid", gap: 10 }}>
                  {rewards.map((r, idx) => (
                    <button
                      key={idx}
                      className="card"
                      onClick={() => applyReward(r)}
                      style={{ margin: 0 }}
                    >
                      <div className="cardName">{r.label}</div>
                      <div className="small">
                        Pick one to advance to {N + 1}×{N + 1}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {phase === "GAMEOVER" && (
              <div
                style={{
                  marginTop: 12,
                  width: "min(520px, 90vw)",
                  background: "rgba(255,255,255,0.85)",
                  border: "1px solid rgba(15,23,42,0.12)",
                  borderRadius: 16,
                  padding: 14,
                  boxShadow: "0 12px 28px rgba(15,23,42,0.10)",
                  textAlign: "center",
                }}
              >
                <div style={{ fontWeight: 900, marginBottom: 10 }}>
                  Run ended on Floor {floor}
                </div>
                <button
                  className="card"
                  onClick={restartRun}
                  style={{ textAlign: "center" }}
                >
                  Restart Run
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
