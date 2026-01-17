import Square from "./square";
import { useRef, useEffect, useState } from "react";

function makeLines(N) {
  const lines = [];
  const idx = (r, c) => r * N + c;

  for (let r = 0; r < N; r++) {
    const row = [];
    for (let c = 0; c < N; c++) row.push(idx(r, c));
    lines.push(row);
  }

  for (let c = 0; c < N; c++) {
    const col = [];
    for (let r = 0; r < N; r++) col.push(idx(r, c));
    lines.push(col);
  }

  const dright = [];
  for (let r = 0; r < N; r++) dright.push(idx(r, r));
  lines.push(dright);

  const dleft = [];
  for (let r = 0; r < N; r++) dleft.push(idx(r, N - (r + 1)));
  lines.push(dleft);

  return lines;
}

export function calculateWinner(squares, N) {
  const lines = makeLines(N);

  for (const line of lines) {
    const first = squares[line[0]];
    if (!first) continue;

    let allSame = true;
    for (const idx of line) {
      if (squares[idx] !== first) {
        allSame = false;
        break;
      }
    }

    if (allSame) return first;
  }
  return null;
}

// src/components/board.jsx
export default function Board({
  N,
  squares,
  locks,
  onSquareClick,
  statusText,
  energySquare,
  scorePop,
  specialSquares,
}) {
  const boardRef = useRef(null);
  const squareRefs = useRef([]);
  const [pops, setPops] = useState([]);

  useEffect(() => {
    if (!scorePop || !boardRef.current) return;

    const sq = squareRefs.current[scorePop.index];
    const br = boardRef.current;

    if (!sq) return;

    const brRect = br.getBoundingClientRect();
    const sqRect = sq.getBoundingClientRect();

    const x = sqRect.left - brRect.left + sqRect.width / 2;
    const y = sqRect.top - brRect.top + sqRect.height / 2;

    const pop = {
      id: scorePop.id,
      x,
      y,
      text: `+${scorePop.delta}`,
      symbol: scorePop.symbol,
    };

    setPops((prev) => [...prev, pop]);

    const t = setTimeout(() => {
      setPops((prev) => prev.filter((p) => p.id !== pop.id));
    }, 900);

    return () => clearTimeout(t);
  }, [scorePop?.id]); // only react to new pop ids

  return (
    <div className="boardWrap">
      <div className="status">{statusText}</div>

      {/* IMPORTANT: this must be the positioning parent */}
      <div className="boardStage" style={{ position: "relative" }}>
        {/* floating pops live ABOVE the grid, relative to it */}
        <div className="popLayer" aria-hidden="true">
          {pops.map((p) => (
            <div
              key={p.id}
              className={`scorePop ${
                p.symbol === "O" ? "enemyPop" : "playerPop"
              }`}
              style={{ left: p.x, top: p.y }}
            >
              {p.text}
            </div>
          ))}
        </div>

        {/* the grid itself */}
        <div
          ref={boardRef} // ✅ attach ref here
          className="board"
          style={{
            gridTemplateColumns: `repeat(${N}, 36px)`,
            gridTemplateRows: `repeat(${N}, 36px)`,
          }}
        >
          {squares.map((value, i) => {
            const isLocked = !!locks?.[i];
            const isEnergy = i === energySquare;

            // ✅ new: read special square type (see step 2 below)
            const special = specialSquares?.[i]; // "BRIBE" | "TRAP" | undefined

            return (
              <div
                key={i}
                ref={(el) => (squareRefs.current[i] = el)} // ✅ needed for positioning pops
                className={[
                  "square",
                  isLocked ? "locked" : "",
                  isEnergy ? "energySquare" : "",
                  special === "BRIBE" ? "bribeSquare" : "",
                  special === "TRAP" ? "trapSquare" : "",
                ].join(" ")}
                onClick={() => {
                  if (isLocked) return;
                  onSquareClick(i);
                }}
                aria-disabled={isLocked}
                data-special={special || ""} // optional debugging hook
              >
                {value}

                {/* optional: tiny marker if empty */}
                {!value && special === "BRIBE" && (
                  <span className="tileIcon">💰</span>
                )}
                {!value && special === "TRAP" && (
                  <span className="tileIcon">🪤</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
