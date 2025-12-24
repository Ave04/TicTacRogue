function Square({ value, onSquareClick }) {
  return (
    <button className="square" onClick={onSquareClick}>
      {value}
    </button>
  );
}

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

function calculateWinner(squares, N) {
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

export default function Board({ N, squares, xIsNext, onPlay }) {
  const winner = calculateWinner(squares, N);

  function handleClick(i) {
    if (squares[i] || winner) return;

    const nextSquares = squares.slice();
    nextSquares[i] = xIsNext ? "X" : "O";
    onPlay(nextSquares);
  }

  return (
    <>
      <div className="status">
        {winner ? `Winner: ${winner}` : `Next player: ${xIsNext ? "X" : "O"}`}
      </div>

      <div
        className="board"
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${N}, 34px)`,
          width: "fit-content",
        }}
      >
        {squares.map((value, i) => (
          <Square key={i} value={value} onSquareClick={() => handleClick(i)} />
        ))}
      </div>
    </>
  );
}
