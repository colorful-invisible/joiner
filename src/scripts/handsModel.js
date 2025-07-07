import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task";
const MODEL_URL_WASM =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";

const NUM_HANDS = 2;
const RUNNING_MODE = "VIDEO";

let handLandmarker;
let lastVideoTime = -1;

export const mediaPipe = {
  handednesses: [],
  landmarks: [],
  worldLandmarks: [],
  isInitialized: false,
  initialize: async () => {
    try {
      console.log("Starting MediaPipe initialization...");
      const vision = await FilesetResolver.forVisionTasks(MODEL_URL_WASM);
      handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MODEL_URL,
          delegate: "GPU",
        },
        runningMode: RUNNING_MODE,
        numHands: NUM_HANDS,
        minHandDetectionConfidence: 0.3, // Lower = more sensitive detection
        minHandPresenceConfidence: 0.2, // Lower = keeps tracking longer
        minTrackingConfidence: 0.3, // Lower = more tolerant of uncertain positions
      });
      mediaPipe.isInitialized = true;
      console.log("MediaPipe HandLandmarker initialized successfully");
    } catch (error) {
      console.error("Failed to initialize HandLandmarker:", error);
    }
  },
  predictWebcam: async (video) => {
    try {
      if (!mediaPipe.isInitialized) {
        console.log("MediaPipe not initialized yet, skipping prediction");
        window.requestAnimationFrame(() => mediaPipe.predictWebcam(video));
        return;
      }

      if (lastVideoTime !== video.elt.currentTime && handLandmarker) {
        lastVideoTime = video.elt.currentTime;
        const results = await handLandmarker.detectForVideo(
          video.elt,
          performance.now()
        );

        if (results) {
          mediaPipe.handednesses = results.handednesses || [];
          mediaPipe.landmarks = results.landmarks || [];
          mediaPipe.worldLandmarks = results.worldLandmarks || [];

          // Debug output when landmarks are detected
          if (mediaPipe.landmarks.length > 0) {
            console.log(
              "MediaPipe detected",
              mediaPipe.landmarks.length,
              "hands"
            );
          }
        }
      }

      window.requestAnimationFrame(() => mediaPipe.predictWebcam(video));
    } catch (error) {
      console.error("Failed to predict webcam:", error);
    }
  },
};

mediaPipe.initialize();
