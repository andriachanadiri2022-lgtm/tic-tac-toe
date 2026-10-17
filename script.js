const cells = Array.from(document.querySelectorAll(".cell"));
const statusText = document.querySelector("#status-text");
const turnIndicator = document.querySelector("#turn-indicator");
const playerXCard = document.querySelector("#player-x-card");
const playerOCard = document.querySelector("#player-o-card");
const scoreXDisplay = document.querySelector("#score-x");
const scoreODisplay = document.querySelector("#score-o");
const newGameButton = document.querySelector("#new-game");
const resetScoreButton = document.querySelector("#reset-score");

const winningCombinations = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

const board = Array(9).fill("");
const scores = { X: 0, O: 0 };
let currentPlayer = "X";
let roundOver = false;

function updateTurnDisplay() {
  const isPlayerX = currentPlayer === "X";
  playerXCard.classList.toggle("active", isPlayerX);
  playerOCard.classList.toggle("active", !isPlayerX);
  turnIndicator.textContent = isPlayerX ? "×" : "○";
  turnIndicator.classList.toggle("is-o", !isPlayerX);
  turnIndicator.classList.remove("is-win");
}

function finishRound(message, winningCombination = []) {
  roundOver = true;
  statusText.textContent = message;
  turnIndicator.textContent = "✦";
  turnIndicator.classList.remove("is-o");
  turnIndicator.classList.add("is-win");
  playerXCard.classList.remove("active");
  playerOCard.classList.remove("active");

  cells.forEach((cell, index) => {
    cell.disabled = true;
    if (winningCombination.includes(index)) {
      cell.classList.add("winning-cell");
    }
  });
}

function playTurn(event) {
  const cell = event.currentTarget;
  const index = Number(cell.dataset.cell);

  if (roundOver || board[index] !== "") {
    return;
  }

  board[index] = currentPlayer;
  cell.textContent = currentPlayer === "X" ? "×" : "○";
  cell.classList.add(currentPlayer === "X" ? "mark-x" : "mark-o");
  cell.setAttribute(
    "aria-label",
    `${cell.getAttribute("aria-label").split(",")[0]}, ${currentPlayer === "X" ? "cross" : "circle"}`,
  );
  cell.disabled = true;

  const winningCombination = winningCombinations.find((combination) =>
    combination.every((cellIndex) => board[cellIndex] === currentPlayer),
  );

  if (winningCombination) {
    scores[currentPlayer] += 1;
    scoreXDisplay.textContent = String(scores.X);
    scoreODisplay.textContent = String(scores.O);
    finishRound(`Player ${currentPlayer === "X" ? "1" : "2"} wins!`, winningCombination);
    return;
  }

  if (board.every((value) => value !== "")) {
    finishRound("It's a draw! Nice game.");
    return;
  }

  currentPlayer = currentPlayer === "X" ? "O" : "X";
  updateTurnDisplay();
  statusText.textContent = `Player ${currentPlayer === "X" ? "1" : "2"}'s turn`;
}

function startNewRound() {
  board.fill("");
  currentPlayer = "X";
  roundOver = false;

  cells.forEach((cell, index) => {
    const positions = [
      "Top left",
      "Top middle",
      "Top right",
      "Middle left",
      "Center",
      "Middle right",
      "Bottom left",
      "Bottom middle",
      "Bottom right",
    ];
    cell.textContent = "";
    cell.disabled = false;
    cell.classList.remove("mark-x", "mark-o", "winning-cell");
    cell.setAttribute("aria-label", `${positions[index]}, empty`);
  });

  statusText.textContent = "Player 1's turn";
  updateTurnDisplay();
}

function resetScores() {
  scores.X = 0;
  scores.O = 0;
  scoreXDisplay.textContent = "0";
  scoreODisplay.textContent = "0";
  startNewRound();
}

cells.forEach((cell) => cell.addEventListener("click", playTurn));
newGameButton.addEventListener("click", startNewRound);
resetScoreButton.addEventListener("click", resetScores);
