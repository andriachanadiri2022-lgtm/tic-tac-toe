# Gesture Garden

Gesture Garden is a browser arcade game controlled by your hand. Catch falling stars, avoid bombs, build a streak, and pinch your thumb and index finger to activate a short-lived star magnet.

## Play

Open `index.html` in a modern browser, or serve this folder from a local web server. Camera access requires HTTPS or `localhost`.

- **Hand tracking:** Select **Enable hand tracking**, allow camera access, and move your index finger around the game field.
- **Magnet:** Pinch your thumb and index finger together.
- **Keyboard:** Use the arrow keys or **WASD** to move and **Space** to activate the magnet. You can also move the pointer over the game field.
- Catch stars for points and avoid bombs. The game ends when you lose all three lives.

Hand tracking uses TensorFlow.js Hand Pose Detection and MediaPipe Hands in your browser. The video stream is not recorded or uploaded. Camera access is optional; the game also works with keyboard and pointer controls.

## Run locally

For example, with Python installed:

```powershell
python -m http.server 8000
```

Then open <http://localhost:8000> in your browser. The hand-tracking libraries and model are loaded from their CDNs, so an internet connection is needed to enable the camera.
