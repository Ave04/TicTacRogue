export default function Square({ value, onSquareClick, isLocked }) {
  return (
    <button
      className={`square ${isLocked ? "locked" : ""}`}
      onClick={onSquareClick}
    >
      {value}
    </button>
  );
}
