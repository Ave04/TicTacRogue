import Square from "./square";

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
}) {
  return (
    <div className="boardWrap">
      <div className="status">{statusText}</div>

      <div
        className="board"
        style={{
          gridTemplateColumns: `repeat(${N}, 36px)`,
          gridTemplateRows: `repeat(${N}, 36px)`,
        }}
      >
        {squares.map((value, i) => {
          const isLocked = !!locks?.[i];
          const isEnergy = i === energySquare;

          return (
            <div
              key={i}
              className={[
                "square",
                isLocked ? "locked" : "",
                isEnergy ? "energySquare" : "",
              ].join(" ")}
              onClick={() => {
                if (isLocked) return; // stops hover/click “feeling” interactive
                onSquareClick(i);
              }}
              aria-disabled={isLocked}
            >
              {value}
            </div>
          );
        })}
      </div>
    </div>
  );
}
