import { useState } from "react";
import Board from "./components/board";

export default function Game() {
  const N = 5;
  const [xIsNext, setXIsNext] = useState(true);
  const [history, setHistory] = useState([Array(N * N).fill(null)]);
  const currentSquares = history[history.length - 1];

  function handlePlay(nextSquares) {
    setHistory([...history, nextSquares]);
    setXIsNext(!xIsNext);
  }

  return (
    <Board
      N={N}
      squares={currentSquares}
      xIsNext={xIsNext}
      onPlay={handlePlay}
      winLength={N}
    />
  );
}
