// src/App.jsx
import { useEffect, useMemo, useState } from "react";
import Board, { calculateWinner } from "./components/board";
import "./styles.css";
import { Zap } from "lucide-react";

const CARD_DEFS = {
  ERASE: { id: "ERASE", name: "Erase", cost: 1, target: "single" },
  SWAP: { id: "SWAP", name: "Swap", cost: 1, target: "double" },
  SHIELD: { id: "SHIELD", name: "Shield", cost: 1, target: "single" },
};

const PASSIVE_DEFS = {
  THORNS: {
    id: "THORNS",
    name: "Thorns",
    desc: "After you play, chance to place an extra enemy mark.",
  },
  LOCKDOWN: {
    id: "LOCKDOWN",
    name: "Lockdown",
    desc: "After the enemy plays, locks a random empty square.",
  },
  CORRUPT: {
    id: "CORRUPT",
    name: "Corrupt",
    desc: "After the enemy plays, chance to erase one of your marks.",
  },
  DOUBLE_TAP: {
    id: "DOUBLE_TAP",
    name: "Double Tap",
    desc: "After the enemy plays, chance to immediately play again.",
  },
};

const BOSS_EVERY = 3;

const ENCOUNTER_DEFS = {
  // normals (1 passive)
  BRAMBLE: {
    id: "BRAMBLE",
    name: "Bramble",
    passiveIds: ["THORNS"],
    mods: { thornsBonus: 0.06 },
    isBoss: false,
  },
  WARDEN: {
    id: "WARDEN",
    name: "Warden",
    passiveIds: ["LOCKDOWN"],
    mods: { lockDuration: 2, lockCountBonus: 0 },
    isBoss: false,
  },
  ROTTER: {
    id: "ROTTER",
    name: "Rotter",
    passiveIds: ["CORRUPT"],
    mods: { corruptBonus: 0.05 },
    isBoss: false,
  },
  DUELIST: {
    id: "DUELIST",
    name: "Duelist",
    passiveIds: ["DOUBLE_TAP"],
    mods: { doubleTapBonus: 0.04 },
    isBoss: false,
  },

  // bosses (2 passives)
  BOSS_IRON_WARDEN: {
    id: "BOSS_IRON_WARDEN",
    name: "Iron Warden",
    passiveIds: ["LOCKDOWN", "DOUBLE_TAP"],
    mods: { lockDuration: 3, lockCountBonus: 1, doubleTapBonus: 0.06 },
    isBoss: true,
  },
  BOSS_PLAGUE_KING: {
    id: "BOSS_PLAGUE_KING",
    name: "Plague King",
    passiveIds: ["CORRUPT", "THORNS"],
    mods: { corruptBonus: 0.07, thornsBonus: 0.08 },
    isBoss: true,
  },
  BOSS_CHAOS_JESTER: {
    id: "BOSS_CHAOS_JESTER",
    name: "Chaos Jester",
    passiveIds: ["THORNS", "DOUBLE_TAP"],
    mods: { thornsBonus: 0.08, doubleTapBonus: 0.08 },
    isBoss: true,
  },
};

function randomFrom(arr) {
  if (!arr || arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// lock square for shield passive
function tickLocks(locks) {
  const next = {};
  for (const key of Object.keys(locks)) {
    const i = Number(key);
    const t = locks[i] - 1;
    if (t > 0) next[i] = t;
  }
  return next;
}

// find list of empty squares for next moves (enemy)
function getPlayableEmpties(squares, locks) {
  const canPlay = [];
  for (let i = 0; i < squares.length; i++) {
    if (squares[i] === null && !locks[i]) canPlay.push(i);
  }
  return canPlay;
}

// determine winning square if 1 away from win (simulated using copy of squares array)
function findImmediateWinIndex(squares, N, locks, symbol) {
  const empties = getPlayableEmpties(squares, locks);
  for (const i of empties) {
    const copy = squares.slice();
    copy[i] = symbol;
    if (calculateWinner(copy, N) === symbol) return i;
  }
  return null;
}

// enemy move options, can "predict" self and player winning moves to win or block
function chooseEnemyMoveIndex(squares, N, locks, enemySymbol, playerSymbol) {
  const win = findImmediateWinIndex(squares, N, locks, enemySymbol);
  if (win !== null) return win;

  const block = findImmediateWinIndex(squares, N, locks, playerSymbol);
  if (block !== null) return block;

  const empties = getPlayableEmpties(squares, locks);
  if (empties.length === 0) return null;
  return empties[Math.floor(Math.random() * empties.length)];
}

function rollEnemyPassive(floor) {
  const pool = ["THORNS", "LOCKDOWN", "CORRUPT", "DOUBLE_TAP"];
  const id = pool[Math.floor(Math.random() * pool.length)];
  return { id };
}

function rollEncounter(floor) {
  const isBossFloor = floor % BOSS_EVERY === 0;
  const keys = Object.keys(ENCOUNTER_DEFS).filter(
    (k) => ENCOUNTER_DEFS[k].isBoss === isBossFloor
  );
  const pickKey = randomFrom(keys) || keys[0];
  return ENCOUNTER_DEFS[pickKey];
}

function hasPassive(encounter, id) {
  return encounter?.passiveIds?.includes(id);
}

// find random empty square
function randomEmptyIndex(squares, locks) {
  const empties = getPlayableEmpties(squares, locks);
  if (empties.length === 0) return null;
  return empties[Math.floor(Math.random() * empties.length)];
}

// randomly initialise one square with zap
function energySquareAssignment(squares, locks) {
  const empties = getPlayableEmpties(squares, locks);
  if (empties.length === 0) return null; // No empty squares, return nothing

  const randomIndex = Math.floor(Math.random() * empties.length);
  const energySquareIndex = empties[randomIndex];

  return energySquareIndex; // Returns index of zap square
}

// enemy passive (scales with floor via chance)
function applyPassive_THORNS_afterPlayerMove({
  squares,
  locks,
  enemySymbol,
  chance,
}) {
  if (Math.random() >= chance) return squares;
  const i = randomEmptyIndex(squares, locks);
  if (i === null) return squares;
  const next = squares.slice();
  next[i] = enemySymbol;
  return next;
}

function applyPassive_LOCKDOWN_afterEnemyMove({
  squares,
  locks,
  duration = 2,
  count = 1,
}) {
  const nextLocks = { ...locks };
  const empties = getPlayableEmpties(squares, nextLocks);

  // lock up to count different empties
  for (let k = 0; k < count; k++) {
    if (empties.length === 0) break;
    const pickIndex = Math.floor(Math.random() * empties.length);
    const i = empties.splice(pickIndex, 1)[0];
    nextLocks[i] = duration;
  }

  return nextLocks;
}

function applyPassive_CORRUPT_afterEnemyMove({
  squares,
  locks,
  playerSymbol,
  chance,
}) {
  if (Math.random() >= chance) return squares;

  // only erase player's marks, and avoid locked squares
  const candidates = [];
  for (let i = 0; i < squares.length; i++) {
    if (squares[i] === playerSymbol && !locks[i]) candidates.push(i);
  }

  const pick = randomFrom(candidates);
  if (pick === null) return squares;

  const next = squares.slice();
  next[pick] = null;
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
  0;
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

export default function App() {
  const [mode, setMode] = useState(null);

  if (mode === null) {
    return <ModeMenu onPick={(m) => setMode(m)} />;
  }

  // key forces remount when you go back then start again
  if (mode === "INFINITAC") {
    return <InfinitacGame key="INFINITAC" onExit={() => setMode(null)} />;
  }

  // (unused for now)
  return <ModeMenu onPick={(m) => setMode(m)} />;
}

function ModeMenu({ onPick }) {
  return (
    <div className="page">
      <div className="header">
        <div>
          <div className="title">TicTacRogue</div>
          <div className="subtitle">Choose a game mode</div>
        </div>
      </div>

      <div
        className="content"
        style={{
          gridTemplateColumns: "1fr",
          alignItems: "center",
          justifyItems: "center",
        }}
      >
        <div
          className="left"
          style={{
            width: "min(680px, 92vw)",
            textAlign: "center",
          }}
        >
          <div className="panelTitle" style={{ fontSize: 18 }}>
            Select Mode
          </div>

          <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
            {/*  Placeholder (no onclick yet) */}
            <button className="card" disabled style={{ margin: 0 }}>
              <div className="cardTop">
                <span className="cardName">RogueTac</span>
                <span className="pill">Coming soon</span>
              </div>
              <div className="small">More fun mode coming soon</div>
            </button>

            {/* current game */}
            <button
              className="card"
              style={{ margin: 0 }}
              onClick={() => onPick("INFINITAC")}
            >
              <div className="cardTop">
                <span className="cardName">InfiniTac</span>
                <span className="pill">Play</span>
              </div>
              <div className="small">
                Current mode: board grows every floor. Boss every 3 floors.
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfinitacGame({ onExit }) {
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
  const [energySquare, setEnergySquare] = useState(null);

  const [encounter, setEncounter] = useState(() => rollEncounter(1));
  const [locks, setLocks] = useState({});
  const [aiThinking, setAiThinking] = useState(false);

  // Scaling chances with floor (gentle base)
  const baseThorns = Math.min(0.3 + (floor - 1) * 0.04, 0.65);
  const baseCorrupt = Math.min(0.2 + (floor - 1) * 0.03, 0.55);
  const baseDouble = Math.min(0.18 + (floor - 1) * 0.02, 0.4);
  const baseLockCount = floor >= 6 ? 2 : 1;

  // Encounter mods (optional)
  const mods = encounter?.mods || {};
  const thornsChance = clamp(baseThorns + (mods.thornsBonus || 0), 0, 0.9);
  const corruptChance = clamp(baseCorrupt + (mods.corruptBonus || 0), 0, 0.9);
  const doubleTapChance = clamp(
    baseDouble + (mods.doubleTapBonus || 0),
    0,
    0.9
  );
  const lockdownCount = baseLockCount + (mods.lockCountBonus || 0);
  const lockdownDuration = mods.lockDuration || 2;

  useEffect(() => {
    if (floor > 1) {
      const energySquareIndex = energySquareAssignment(currentSquares, locks);
      setEnergySquare(energySquareIndex); // Assign the energy square to a random empty square
    }
  }, [floor, currentSquares, locks]);

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

    // reroll encounter after clearing a floor
    setEncounter(rollEncounter(nextFloor));

    // Player always starts each fight
    setXIsNext(playerSymbol === "X");

    setHistory([makeEmptyBoard(nextN)]);

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
    setEncounter(rollEncounter(1));
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
    if (energy < def.cost) return false; // Ensure energy is checked
    if (card.charges <= 0) return false;

    return true;
  }

  function spendCard(cardId) {
    const def = CARD_DEFS[cardId];

    setEnergy((prevEnergy) => prevEnergy - def.cost); // Reduce energy based on card cost
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
    if (locks[i]) return; // This prevents clicking locked squares
    if (currentSquares[i]) return;

    let next = currentSquares.slice();
    next[i] = playerSymbol;

    const nextLocks = tickLocks(locks);
    setLocks(nextLocks);

    // Apply passive effects after the player move
    if (hasPassive(encounter, "THORNS")) {
      next = applyPassive_THORNS_afterPlayerMove({
        squares: next,
        locks: nextLocks,
        enemySymbol,
        chance: thornsChance,
      });
    }

    // If player clicks on energy square, reward energy
    if (i === energySquare && energy < maxEnergy) {
      setEnergy(energy + 1); // Add energy charge to player
      setEnergySquare(null); // Clear the energy square after it’s used
    }

    pushBoard(next);
  }

  // ---------- Enemy AI turn ----------
  useEffect(() => {
    if (phase !== "PLAYING") return;
    if (winner) return;
    if (!isEnemyTurn) return;

    setAiThinking(true);

    const t = setTimeout(() => {
      let nextSquares = currentSquares.slice();
      let nextLocks = locks;

      // enemy move #1
      const move1 = chooseEnemyMoveIndex(
        nextSquares,
        N,
        nextLocks,
        enemySymbol,
        playerSymbol
      );
      if (move1 === null) {
        setAiThinking(false);
        return;
      }
      nextSquares[move1] = enemySymbol;

      // tick locks after move
      nextLocks = tickLocks(nextLocks);

      // If enemy already won, commit and stop
      if (calculateWinner(nextSquares, N) === enemySymbol) {
        setLocks(nextLocks);
        pushBoard(nextSquares);
        setAiThinking(false);
        return;
      }

      // passives after enemy move (can be multiple)
      if (hasPassive(encounter, "LOCKDOWN")) {
        nextLocks = applyPassive_LOCKDOWN_afterEnemyMove({
          squares: nextSquares,
          locks: nextLocks,
          duration: lockdownDuration,
          count: lockdownCount,
        });
      }

      if (hasPassive(encounter, "CORRUPT")) {
        nextSquares = applyPassive_CORRUPT_afterEnemyMove({
          squares: nextSquares,
          locks: nextLocks,
          playerSymbol,
          chance: corruptChance,
        });
      }

      if (
        hasPassive(encounter, "DOUBLE_TAP") &&
        Math.random() < doubleTapChance
      ) {
        const move2 = chooseEnemyMoveIndex(
          nextSquares,
          N,
          nextLocks,
          enemySymbol,
          playerSymbol
        );
        if (move2 !== null) {
          nextSquares = nextSquares.slice();
          nextSquares[move2] = enemySymbol;
          nextLocks = tickLocks(nextLocks);
        }
      }

      setLocks(nextLocks);
      pushBoard(nextSquares);
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
    encounter,
    thornsChance,
    corruptChance,
    doubleTapChance,
    lockdownCount,
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

  const passiveLabels = (encounter?.passiveIds || [])
    .map((id) => PASSIVE_DEFS[id]?.name || id)
    .join(" + ");

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
          <div className="title">TicTacRogue</div>
          <div className="subtitle">
            Floor {floor} • Board {N}×{N} •{" "}
            {floor % BOSS_EVERY === 0 ? "BOSS FIGHT" : "Fight"} • Win to advance
          </div>
        </div>

        <div className="hud">
          <div className="pill">
            Energy: {energy}/{maxEnergy}
          </div>
          <div className="pill">
            Enemy: {encounter?.name} {encounter?.isBoss ? "👑" : ""} •{" "}
            {passiveLabels}
          </div>
          <button
            className="pill"
            onClick={onExit}
            style={{ cursor: "pointer" }}
          >
            Back to menu
          </button>
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

          {/* passive descriptions (supports 2 passives on bosses) */}
          <div className="small" style={{ marginTop: 12 }}>
            <b>Enemy passives:</b>
            <ul style={{ margin: "8px 0 0 16px", padding: 0 }}>
              {(encounter?.passiveIds || []).map((pid) => (
                <li key={pid}>
                  <b>{PASSIVE_DEFS[pid]?.name ?? pid}:</b>{" "}
                  {PASSIVE_DEFS[pid]?.desc ?? ""}
                </li>
              ))}
            </ul>
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
              energySquare={energySquare}
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
