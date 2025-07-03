// gestureRecognizer.js
import { GestureRecognizer, FilesetResolver } from "@mediapipe/tasks-vision";

const MODEL_PATH =
  "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/latest/gesture_recognizer.task";
const WASM_PATH =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";

let gestureRecognizer;
let lastVideoTime = -1;

export const gesturePipe = {
  results: {},
  initialize: async () => {
    const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
    gestureRecognizer = await GestureRecognizer.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MODEL_PATH,
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numHands: 2, // Now recognizes both hands
    });
  },
  predict: async (video) => {
    if (lastVideoTime !== video.elt.currentTime && gestureRecognizer) {
      lastVideoTime = video.elt.currentTime;
      const results = await gestureRecognizer.recognizeForVideo(
        video.elt,
        performance.now()
      );
      gesturePipe.results = results;
    }

    window.requestAnimationFrame(() => gesturePipe.predict(video));
  },
};

gesturePipe.initialize();
