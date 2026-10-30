const canvas = document.querySelector("#game-canvas");
const context = canvas.getContext("2d");
const video = document.querySelector("#webcam");
const webcamPlaceholder = document.querySelector("#webcam-placeholder");
const cameraButton = document.querySelector("#camera-button");
const cameraStatus = document.querySelector("#camera-status");
const trackingStatus = document.querySelector("#tracking-status");
const startScreen = document.querySelector("#start-screen");
const pauseScreen = document.querySelector("#pause-screen");
const gameOverScreen = document.querySelector("#game-over-screen");
const startButton = document.querySelector("#start-button");
const keyboardButton = document.querySelector("#keyboard-button");
const pauseButton = document.querySelector("#pause-button");
const resumeButton = document.querySelector("#resume-button");
const restartButton = document.querySelector("#restart-button");
const soundButton = document.querySelector("#sound-button");
const gameStatus = document.querySelector("#game-status");
const scoreValue = document.querySelector("#score-value");
const bestValue = document.querySelector("#best-value");
const livesValue = document.querySelector("#lives-value");
const finalScore = document.querySelector("#final-score");
const bestMessage = document.querySelector("#best-message");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const BEST_SCORE_KEY = "gesture-garden-best";
const keys = new Set();

const game = {
  mode: "menu",
  score: 0,
  best: loadBestScore(),
  bestAtStart: 0,
  lives: 3,
  combo: 0,
  elapsed: 0,
  starTimer: 0.5,
  bombTimer: 2,
  objects: [],
  particles: [],
  player: { x: WIDTH / 2, y: HEIGHT * 0.72, radius: 25 },
  magnetTimer: 0,
  magnetCooldown: 0,
  soundOn: true,
  lastFrame: 0,
};

let detector = null;
let cameraStream = null;
let audioContext = null;
let handTrackingEnabled = false;
let handSeen = false;
let pinching = false;
let lastVideoTime = -1;
let lastHandSeenAt = 0;
let animationFrameId = 0;
let handFrameId = 0;

function loadBestScore() {
  try {
    return Number(window.localStorage.getItem(BEST_SCORE_KEY)) || 0;
  } catch (error) {
    console.warn("Could not read the saved best score.", error);
    return 0;
  }
}

function saveBestScore() {
  if (game.score <= game.best) {
    return;
  }

  game.best = game.score;
  try {
    window.localStorage.setItem(BEST_SCORE_KEY, String(game.best));
  } catch (error) {
    console.warn("Could not save the best score.", error);
  }
}

function updateHud() {
  scoreValue.textContent = String(game.score);
  bestValue.textContent = String(game.best);
  livesValue.textContent = `${"♥ ".repeat(game.lives).trim()}${game.lives < 3 ? ` ${"♡ ".repeat(3 - game.lives).trim()}` : ""}`;
  livesValue.setAttribute("aria-label", `${game.lives} ${game.lives === 1 ? "life" : "lives"} remaining`);
}

function setCameraStatus(message, type = "neutral") {
  cameraStatus.textContent = message;
  cameraStatus.dataset.type = type;
}

function setTrackingStatus(message, active = false) {
  trackingStatus.textContent = message;
  trackingStatus.classList.toggle("is-live", active);
}

function playTone(frequency, duration = 0.1, type = "sine") {
  if (!game.soundOn) {
    return;
  }

  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextConstructor) {
    return;
  }

  audioContext ??= new AudioContextConstructor();
  if (audioContext.state === "suspended") {
    audioContext.resume();
  }

  const oscillator = audioContext.createOscillator();
  const volume = audioContext.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  volume.gain.setValueAtTime(0.06, audioContext.currentTime);
  volume.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
  oscillator.connect(volume);
  volume.connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + duration);
}

function setMode(mode) {
  game.mode = mode;
  startScreen.hidden = mode !== "menu";
  pauseScreen.hidden = mode !== "paused";
  gameOverScreen.hidden = mode !== "over";
  pauseButton.disabled = mode !== "playing";
}

function resetGame() {
  game.score = 0;
  game.bestAtStart = game.best;
  game.lives = 3;
  game.combo = 0;
  game.elapsed = 0;
  game.starTimer = 0.5;
  game.bombTimer = 2;
  game.objects = [];
  game.particles = [];
  game.player.x = WIDTH / 2;
  game.player.y = HEIGHT * 0.72;
  game.magnetTimer = 0;
  game.magnetCooldown = 0;
  updateHud();
  gameStatus.textContent = handTrackingEnabled
    ? "Move your hand to catch the stars"
    : "Move with the arrow keys or WASD";
}

function startGame() {
  resetGame();
  setMode("playing");
  keys.clear();
  if (audioContext?.state === "suspended") {
    audioContext.resume();
  }
}

function pauseGame() {
  if (game.mode !== "playing") {
    return;
  }
  setMode("paused");
  keys.clear();
}

function resumeGame() {
  if (game.mode === "paused") {
    setMode("playing");
  }
}

function endGame() {
  if (game.mode !== "playing") {
    return;
  }

  const isNewBest = game.score > game.bestAtStart;
  saveBestScore();
  finalScore.textContent = String(game.score);
  bestMessage.textContent = isNewBest ? "A new personal best!" : `Your best is ${game.best} points.`;
  updateHud();
  gameStatus.textContent = "Game over";
  setMode("over");
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function spawnObject(type) {
  const radius = type === "star" ? 17 : 20;
  game.objects.push({
    type,
    x: 35 + Math.random() * (WIDTH - 70),
    y: -radius - 6,
    radius,
    speed: (145 + Math.random() * 100) * (1 + game.elapsed / 55),
    drift: (Math.random() - 0.5) * 55,
    rotation: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 2,
  });
}

function createBurst(x, y, color, amount = 14) {
  for (let index = 0; index < amount; index += 1) {
    const angle = (Math.PI * 2 * index) / amount + Math.random() * 0.4;
    const speed = 45 + Math.random() * 115;
    game.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.45 + Math.random() * 0.4,
      color,
      radius: 2 + Math.random() * 3,
    });
  }
}

function triggerMagnet() {
  if (game.mode !== "playing" || game.magnetCooldown > 0) {
    return;
  }
  game.magnetTimer = 1.6;
  game.magnetCooldown = 5;
  gameStatus.textContent = "Star magnet activated!";
  playTone(680, 0.2, "triangle");
}

function updatePlayer(dt) {
  const speed = 380;
  let dx = 0;
  let dy = 0;

  if (keys.has("ArrowLeft") || keys.has("KeyA")) dx -= 1;
  if (keys.has("ArrowRight") || keys.has("KeyD")) dx += 1;
  if (keys.has("ArrowUp") || keys.has("KeyW")) dy -= 1;
  if (keys.has("ArrowDown") || keys.has("KeyS")) dy += 1;

  if (dx !== 0 || dy !== 0) {
    const length = Math.hypot(dx, dy);
    game.player.x += (dx / length) * speed * dt;
    game.player.y += (dy / length) * speed * dt;
  }

  game.player.x = clamp(game.player.x, game.player.radius, WIDTH - game.player.radius);
  game.player.y = clamp(game.player.y, game.player.radius, HEIGHT - game.player.radius);
  game.magnetTimer = Math.max(0, game.magnetTimer - dt);
  game.magnetCooldown = Math.max(0, game.magnetCooldown - dt);
}

function collectObject(object) {
  if (object.type === "star") {
    game.combo += 1;
    game.score += 10 + Math.min(game.combo - 1, 10) * 2;
    gameStatus.textContent = game.combo > 1 ? `Star streak ×${game.combo}!` : "Nice catch!";
    createBurst(object.x, object.y, "#ffd782");
    playTone(750 + Math.min(game.combo, 8) * 45, 0.09, "sine");
  } else {
    game.lives -= 1;
    game.combo = 0;
    gameStatus.textContent = game.lives ? "Ouch! Watch out for bombs." : "No lives left";
    createBurst(object.x, object.y, "#ff718b", 20);
    playTone(150, 0.2, "sawtooth");
  }

  saveBestScore();
  updateHud();
  if (game.lives <= 0) {
    endGame();
  }
}

function updateObjects(dt) {
  game.elapsed += dt;
  game.starTimer -= dt;
  game.bombTimer -= dt;

  if (game.starTimer <= 0) {
    spawnObject("star");
    game.starTimer = Math.max(0.38, 0.82 - game.elapsed * 0.003);
  }
  if (game.bombTimer <= 0) {
    spawnObject("bomb");
    game.bombTimer = Math.max(1.05, 2.2 - game.elapsed * 0.012);
  }

  for (let index = game.objects.length - 1; index >= 0; index -= 1) {
    const object = game.objects[index];
    object.y += object.speed * dt;
    object.x += object.drift * dt;
    object.rotation += object.spin * dt;

    if (game.magnetTimer > 0 && object.type === "star") {
      const dx = game.player.x - object.x;
      const dy = game.player.y - object.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 220 && distance > 0) {
        const pull = Math.min(280, 9000 / distance) * dt;
        object.x += (dx / distance) * pull;
        object.y += (dy / distance) * pull;
      }
    }

    const distance = Math.hypot(game.player.x - object.x, game.player.y - object.y);
    const catchRadius = game.player.radius + object.radius;
    if (distance < catchRadius) {
      game.objects.splice(index, 1);
      collectObject(object);
      if (game.mode !== "playing") {
        return;
      }
      continue;
    }

    if (object.y > HEIGHT + object.radius) {
      game.objects.splice(index, 1);
      if (object.type === "star") {
        game.combo = 0;
        updateHud();
      }
    }
  }
}

function updateParticles(dt) {
  for (let index = game.particles.length - 1; index >= 0; index -= 1) {
    const particle = game.particles[index];
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= 0.98;
    particle.vy *= 0.98;
    particle.life -= dt;
    if (particle.life <= 0) {
      game.particles.splice(index, 1);
    }
  }
}

function update(dt) {
  if (game.mode !== "playing") {
    return;
  }
  updatePlayer(dt);
  updateObjects(dt);
  updateParticles(dt);
}

function drawBackground() {
  const gradient = context.createLinearGradient(0, 0, WIDTH, HEIGHT);
  gradient.addColorStop(0, "#15233a");
  gradient.addColorStop(0.55, "#11192d");
  gradient.addColorStop(1, "#1c1936");
  context.fillStyle = gradient;
  context.fillRect(0, 0, WIDTH, HEIGHT);

  context.strokeStyle = "rgba(151, 185, 225, 0.055)";
  context.lineWidth = 1;
  for (let x = 0; x <= WIDTH; x += 48) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, HEIGHT);
    context.stroke();
  }
  for (let y = 0; y <= HEIGHT; y += 48) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(WIDTH, y);
    context.stroke();
  }

  for (let index = 0; index < 34; index += 1) {
    const x = (index * 173 + 61) % WIDTH;
    const y = (index * 97 + 33) % HEIGHT;
    context.beginPath();
    context.fillStyle = "rgba(225, 235, 255, 0.42)";
    context.arc(x, y, index % 4 === 0 ? 2 : 1, 0, Math.PI * 2);
    context.fill();
  }
}

function drawStar(object) {
  context.save();
  context.translate(object.x, object.y);
  context.rotate(object.rotation);
  context.beginPath();
  for (let point = 0; point < 10; point += 1) {
    const radius = point % 2 === 0 ? object.radius : object.radius * 0.43;
    const angle = (point * Math.PI) / 5 - Math.PI / 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (point === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
  context.fillStyle = "#ffd782";
  context.shadowColor = "#ffca69";
  context.shadowBlur = 20;
  context.fill();
  context.restore();
}

function drawBomb(object) {
  context.save();
  context.translate(object.x, object.y);
  context.rotate(object.rotation * 0.35);
  context.beginPath();
  context.arc(0, 2, object.radius * 0.77, 0, Math.PI * 2);
  context.fillStyle = "#fa667e";
  context.shadowColor = "rgba(250, 102, 126, 0.85)";
  context.shadowBlur = 18;
  context.fill();
  context.shadowBlur = 0;
  context.strokeStyle = "#ffd2d9";
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(4, -object.radius * 0.7);
  context.quadraticCurveTo(10, -object.radius - 8, 17, -object.radius - 4);
  context.stroke();
  context.beginPath();
  context.arc(18, -object.radius - 5, 3, 0, Math.PI * 2);
  context.fillStyle = "#ffd782";
  context.fill();
  context.restore();
}

function drawObjects() {
  for (const object of game.objects) {
    if (object.type === "star") drawStar(object);
    else drawBomb(object);
  }
}

function drawPlayer() {
  const { x, y, radius } = game.player;
  context.save();
  context.beginPath();
  context.arc(x, y, radius + 9, 0, Math.PI * 2);
  context.strokeStyle = game.magnetTimer > 0 ? "rgba(255, 215, 130, 0.8)" : "rgba(163, 236, 218, 0.65)";
  context.lineWidth = game.magnetTimer > 0 ? 4 : 3;
  context.shadowColor = game.magnetTimer > 0 ? "#ffd782" : "#86e2d0";
  context.shadowBlur = 18;
  context.stroke();
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fillStyle = "rgba(117, 213, 194, 0.22)";
  context.fill();
  context.shadowBlur = 0;
  context.fillStyle = "#eafff8";
  context.font = "700 22px Segoe UI, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("✦", x, y + 1);

  if (game.magnetTimer > 0) {
    context.beginPath();
    context.arc(x, y, 85 + Math.sin(game.elapsed * 12) * 8, 0, Math.PI * 2);
    context.strokeStyle = "rgba(255, 215, 130, 0.32)";
    context.lineWidth = 2;
    context.stroke();
  }
  context.restore();
}

function drawParticles() {
  for (const particle of game.particles) {
    context.globalAlpha = Math.max(0, particle.life);
    context.fillStyle = particle.color;
    context.beginPath();
    context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
}

function drawCanvasHint() {
  context.fillStyle = "rgba(234, 241, 255, 0.65)";
  context.font = "600 14px Segoe UI, sans-serif";
  context.textAlign = "left";
  context.fillText(
    game.magnetTimer > 0
      ? "MAGNET ACTIVE"
      : game.magnetCooldown > 0
        ? `MAGNET ${game.magnetCooldown.toFixed(1)}s`
        : "PINCH OR PRESS SPACE FOR MAGNET",
    24,
    HEIGHT - 22,
  );
  if (handTrackingEnabled && !handSeen) {
    context.textAlign = "right";
    context.fillStyle = "#ffd782";
    context.fillText("SHOW YOUR HAND TO THE CAMERA", WIDTH - 24, HEIGHT - 22);
  }
}

function draw() {
  drawBackground();
  drawParticles();
  drawObjects();
  drawPlayer();
  drawCanvasHint();
}

function gameLoop(timestamp) {
  const dt = game.lastFrame ? Math.min((timestamp - game.lastFrame) / 1000, 0.035) : 0;
  game.lastFrame = timestamp;
  update(dt);
  draw();
  animationFrameId = window.requestAnimationFrame(gameLoop);
}

function getCanvasPosition(event) {
  const bounds = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - bounds.left) / bounds.width) * WIDTH,
    y: ((event.clientY - bounds.top) / bounds.height) * HEIGHT,
  };
}

function handlePointerMove(event) {
  if (handSeen || game.mode === "paused") {
    return;
  }
  const position = getCanvasPosition(event);
  game.player.x = clamp(position.x, game.player.radius, WIDTH - game.player.radius);
  game.player.y = clamp(position.y, game.player.radius, HEIGHT - game.player.radius);
}

function handleKeyboard(event) {
  const keyCodes = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"];
  if (keyCodes.includes(event.code)) {
    event.preventDefault();
  }

  if (event.type === "keydown") {
    keys.add(event.code);
    if (event.code === "Space" && !event.repeat) {
      triggerMagnet();
    }
    if (event.code === "Escape") {
      if (game.mode === "playing") pauseGame();
      else if (game.mode === "paused") resumeGame();
    }
  } else {
    keys.delete(event.code);
  }
}

function getPoint(hand, name) {
  return hand.keypoints.find((point) => point.name === name);
}

function updateHandInput(hand) {
  const indexTip = getPoint(hand, "index_finger_tip");
  const thumbTip = getPoint(hand, "thumb_tip");
  if (!indexTip || !thumbTip || !video.videoWidth || !video.videoHeight) {
    return;
  }

  game.player.x = clamp((1 - indexTip.x / video.videoWidth) * WIDTH, game.player.radius, WIDTH - game.player.radius);
  game.player.y = clamp((indexTip.y / video.videoHeight) * HEIGHT, game.player.radius, HEIGHT - game.player.radius);
  handSeen = true;
  lastHandSeenAt = performance.now();

  const pinchDistance = Math.hypot(indexTip.x - thumbTip.x, indexTip.y - thumbTip.y);
  const isPinching = pinchDistance < Math.min(video.videoWidth, video.videoHeight) * 0.075;
  if (isPinching && !pinching) {
    triggerMagnet();
  }
  pinching = isPinching;
  setTrackingStatus("LIVE", true);
  if (game.mode === "playing") {
    gameStatus.textContent = game.magnetTimer > 0
      ? "Star magnet active!"
      : isPinching
        ? "Pinch detected · magnet recharging"
        : "Hand detected · catch the stars";
  }
}

async function detectHands() {
  if (!detector || !handTrackingEnabled) {
    return;
  }

  try {
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      const hands = await detector.estimateHands(video, { flipHorizontal: false });
      if (hands.length > 0) {
        updateHandInput(hands[0]);
      } else if (performance.now() - lastHandSeenAt > 700) {
        handSeen = false;
        pinching = false;
        setTrackingStatus("SEARCHING");
      }
    }
  } catch (error) {
    console.error("Hand tracking stopped after a detection error.", error);
    setCameraStatus(`Hand tracking stopped: ${error.message}`, "error");
    setTrackingStatus("ERROR");
    stopHandTracking();
    return;
  }

  handFrameId = window.requestAnimationFrame(detectHands);
}

function stopHandTracking() {
  handTrackingEnabled = false;
  handSeen = false;
  pinching = false;
  if (handFrameId) {
    window.cancelAnimationFrame(handFrameId);
    handFrameId = 0;
  }
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }
  video.srcObject = null;
  video.hidden = true;
  webcamPlaceholder.hidden = false;
  if (detector) {
    detector.dispose();
    detector = null;
  }
  cameraButton.textContent = "Enable hand tracking";
  cameraButton.disabled = false;
  setTrackingStatus("OFF");
  setCameraStatus("Camera is optional. Your video stays on this device.");
}

async function enableHandTracking() {
  if (handTrackingEnabled) {
    stopHandTracking();
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    setCameraStatus("Camera access requires HTTPS or localhost in a supported browser.", "error");
    setTrackingStatus("UNAVAILABLE");
    return;
  }
  if (!window.tf || !window.handPoseDetection) {
    setCameraStatus("The hand-tracking model did not load. Check your connection and reload.", "error");
    setTrackingStatus("MODEL ERROR");
    return;
  }

  cameraButton.disabled = true;
  cameraButton.textContent = "Loading hand tracking…";
  setCameraStatus("Requesting camera access and loading the hand model…");
  setTrackingStatus("LOADING");

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
    });
    video.srcObject = cameraStream;
    await video.play();

    await window.tf.setBackend("webgl");
    await window.tf.ready();
    detector = await window.handPoseDetection.createDetector(
      window.handPoseDetection.SupportedModels.MediaPipeHands,
      {
        runtime: "mediapipe",
        modelType: "full",
        maxHands: 1,
        solutionPath: "https://cdn.jsdelivr.net/npm/@mediapipe/hands",
      },
    );

    handTrackingEnabled = true;
    video.hidden = false;
    webcamPlaceholder.hidden = true;
    cameraButton.disabled = false;
    cameraButton.textContent = "Stop hand tracking";
    setCameraStatus("Hand tracking is on. Video stays on this device.", "success");
    setTrackingStatus("SEARCHING");
    handFrameId = window.requestAnimationFrame(detectHands);
  } catch (error) {
    console.error("Could not enable hand tracking.", error);
    stopHandTracking();
    const detail = error.name === "NotAllowedError"
      ? "Allow camera access in your browser to use hand tracking."
      : error.name === "NotFoundError"
        ? "No camera was found. You can still play with the keyboard."
        : `Could not start hand tracking: ${error.message}`;
    setCameraStatus(detail, "error");
    setTrackingStatus("CAMERA ERROR");
  }
}

function handleVisibilityChange() {
  if (document.hidden && game.mode === "playing") {
    pauseGame();
  }
}

function initialize() {
  updateHud();
  setMode("menu");
  startButton.addEventListener("click", startGame);
  keyboardButton.addEventListener("click", startGame);
  restartButton.addEventListener("click", startGame);
  pauseButton.addEventListener("click", pauseGame);
  resumeButton.addEventListener("click", resumeGame);
  cameraButton.addEventListener("click", enableHandTracking);
  soundButton.addEventListener("click", () => {
    game.soundOn = !game.soundOn;
    soundButton.textContent = game.soundOn ? "Sound on" : "Sound off";
    soundButton.setAttribute("aria-pressed", String(game.soundOn));
    if (game.soundOn) playTone(520, 0.08);
  });
  canvas.addEventListener("pointermove", handlePointerMove);
  window.addEventListener("keydown", handleKeyboard);
  window.addEventListener("keyup", handleKeyboard);
  window.addEventListener("blur", () => keys.clear());
  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("pagehide", stopHandTracking);
  animationFrameId = window.requestAnimationFrame(gameLoop);
}

initialize();
