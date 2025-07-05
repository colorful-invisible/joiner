import p5 from "p5";
import { mediaPipe as handModel } from "./handsModel";
import { initializeCamCapture, updateFeedDimensions } from "./videoFeedUtils";
import { getMappedLandmarks } from "./landmarksHandler";
import { getMultiHandLandmarks } from "./multiHandLandmarksHandler";
import { createAveragePosition } from "./utils";

new p5((sk) => {
  let camFeed;
  let snapshots = [];
  let isSelecting = false;
  let selectionStart = null;
  let selectionEnd = null;
  let isDeveloping = false;
  let developmentStartTime = null;
  let pendingCapture = null;
  let flash = null;
  let useCloseGesture = true; // true = close gesture (3-finger), false = far gesture (2-finger tips)

  const developmentDuration = 750;
  const minSnapshotSize = 80; // Minimum dimesions in pixels for a valid snapshot
  const snapshotLimit = 20; // Maximum number of snapshots to keep
  const fadeEnabled = true;
  const fadeStartTime = 120000;
  const fadeDuration = 10000;

  const avg = createAveragePosition(6);

  function detectCloseHandGesture(LM) {
    const baseCentroidThreshold = 32; // Base threshold for centroid distance (camera distance relation)
    const referenceHandSize = 128;

    if (
      LM.X4 !== undefined &&
      LM.X8 !== undefined &&
      LM.X12 !== undefined &&
      LM.X0 !== undefined
    ) {
      const handSize = sk.dist(LM.X0, LM.Y0, LM.X12, LM.Y12);
      const dynamicThreshold =
        (handSize / referenceHandSize) * baseCentroidThreshold;

      const centroid = {
        x: (LM.X4 + LM.X8 + LM.X12) / 3,
        y: (LM.Y4 + LM.Y8 + LM.Y12) / 3,
      };

      const dThumbToCentroid = sk.dist(LM.X4, LM.Y4, centroid.x, centroid.y);
      const dIndexToCentroid = sk.dist(LM.X8, LM.Y8, centroid.x, centroid.y);
      const dMiddleToCentroid = sk.dist(LM.X12, LM.Y12, centroid.x, centroid.y);

      if (
        dThumbToCentroid < dynamicThreshold &&
        dIndexToCentroid < dynamicThreshold &&
        dMiddleToCentroid < dynamicThreshold
      ) {
        return { gesture: "selecting", centroid };
      }

      return { gesture: "released", centroid };
    }
    return { gesture: "released", centroid: null };
  }

  function detectFarHandGesture(LM) {
    const handThreshold = 96; // Fixed threshold for far gesture - selecting when distance is LESS than this

    // Simple check: if we have both hands' index fingers
    if (LM.X8_hand0 && LM.X8_hand1) {
      // Average landmarks for stability
      const X8_1 = avg("x8_hand1", LM.X8_hand0);
      const Y8_1 = avg("y8_hand1", LM.Y8_hand0);
      const X8_2 = avg("x8_hand2", LM.X8_hand1);
      const Y8_2 = avg("y8_hand2", LM.Y8_hand1);

      // Use center point between both index finger tips as centroid
      const centroid = {
        x: (X8_1 + X8_2) / 2,
        y: (Y8_1 + Y8_2) / 2,
      };

      const distance = sk.dist(X8_1, Y8_1, X8_2, Y8_2);

      if (distance < handThreshold) {
        // When finger tips are close together = selecting
        return {
          gesture: "selecting",
          centroid,
          landmarks: { X8_1, Y8_1, X8_2, Y8_2 },
        };
      }

      // When finger tips are far apart = released
      return {
        gesture: "released",
        centroid,
        landmarks: { X8_1, Y8_1, X8_2, Y8_2 },
      };
    }
    return { gesture: "released", centroid: null, landmarks: null };
  }

  sk.setup = () => {
    sk.createCanvas(sk.windowWidth, sk.windowHeight);
    sk.background(0);
    sk.textSize(20);
    sk.textAlign(sk.CENTER, sk.CENTER);
    camFeed = initializeCamCapture(sk, handModel);
    const toggleSwitch = document.getElementById("checkboxInput");
    const toggleText = document.getElementById("toggleText");

    toggleSwitch.addEventListener("change", () => {
      useCloseGesture = !toggleSwitch.checked; // Inverted logic: unchecked = CLOSE, checked = FAR
      toggleText.textContent = useCloseGesture ? "CLOSE" : "FAR";
    });
  };

  sk.draw = () => {
    sk.background(0);

    if (!camFeed) {
      sk.fill(0);
      sk.text("LOADING", sk.width / 2, sk.height / 2);
      return;
    }

    sk.image(camFeed, 0, 0, camFeed.scaledWidth, camFeed.scaledHeight);

    let LM, gestureResult;

    if (useCloseGesture) {
      // Close gesture: use original handler for single hand
      const landmarksIndex = [4, 8, 12, 0];
      LM = getMappedLandmarks(sk, handModel, camFeed, landmarksIndex);
      gestureResult = detectCloseHandGesture(LM);
    } else {
      // Far gesture: use multi-hand handler for both hands
      const landmarksIndex = [8];
      LM = getMultiHandLandmarks(sk, handModel, camFeed, landmarksIndex);
      gestureResult = detectFarHandGesture(LM);
    }

    const centroid = gestureResult.centroid;
    const gesture = gestureResult.gesture;
    const landmarks = gestureResult.landmarks;

    if (gesture === "selecting" && !isSelecting && !isDeveloping && centroid) {
      isSelecting = true;
      selectionStart = { ...centroid };
      selectionEnd = { ...centroid };
    } else if (gesture === "selecting" && isSelecting && centroid) {
      selectionEnd = { ...centroid };
    } else if (gesture === "released" && isSelecting) {
      isSelecting = false;
      const w = Math.abs(selectionStart.x - selectionEnd.x);
      const h = Math.abs(selectionStart.y - selectionEnd.y);

      if (w > minSnapshotSize || h > minSnapshotSize) {
        isDeveloping = true;
        developmentStartTime = sk.millis();
        pendingCapture = {
          x: Math.min(selectionStart.x, selectionEnd.x),
          y: Math.min(selectionStart.y, selectionEnd.y),
          w,
          h,
        };
        flash = {
          ...pendingCapture,
          flashDuration: developmentDuration,
          flashStartTime: sk.millis(),
        };
      } else {
        // Reset immediately for small selections
        selectionStart = null;
        selectionEnd = null;
      }
    }

    for (let i = snapshots.length - 1; i >= 0; i--) {
      const { img, x, y, w, h, startTime } = snapshots[i];

      if (fadeEnabled) {
        const elapsed = sk.millis() - startTime;
        if (elapsed > fadeStartTime) {
          const fadeElapsed = elapsed - fadeStartTime;
          const opacity = sk.map(fadeElapsed, 0, fadeDuration, 255, 0);

          if (opacity <= 0) {
            snapshots.splice(i, 1);
            continue;
          }

          sk.tint(255, opacity);
          sk.image(img, x, y, w, h);
          sk.noTint();
        } else {
          sk.image(img, x, y, w, h);
        }
      } else {
        sk.image(img, x, y, w, h);
      }
    }

    if ((isSelecting || isDeveloping) && selectionStart) {
      sk.push();
      sk.noFill();
      sk.strokeWeight(2);
      sk.drawingContext.setLineDash([5, 5]);

      const bounds = pendingCapture || {
        x: Math.min(selectionStart.x, selectionEnd.x),
        y: Math.min(selectionStart.y, selectionEnd.y),
        w: Math.abs(selectionStart.x - selectionEnd.x),
        h: Math.abs(selectionStart.y - selectionEnd.y),
      };

      if (bounds.w < minSnapshotSize && bounds.h < minSnapshotSize) {
        sk.stroke(255, 255, 0); // Yellow
      } else {
        sk.stroke(255, 0, 0); // Red
      }

      sk.rect(bounds.x, bounds.y, bounds.w, bounds.h);
      sk.drawingContext.setLineDash([]);
      sk.pop();
    }

    if (flash) {
      const elapsed = sk.millis() - flash.flashStartTime;
      if (elapsed < flash.flashDuration) {
        const opacity = sk.map(elapsed, 0, flash.flashDuration, 240, 0);
        sk.fill(255, opacity);
        sk.noStroke();
        sk.rect(flash.x, flash.y, flash.w, flash.h);
      } else {
        flash = null;
      }
    }

    if (centroid) {
      sk.push();
      if (isSelecting) {
        const currentW = selectionEnd
          ? Math.abs(selectionStart.x - selectionEnd.x)
          : 0;
        const currentH = selectionEnd
          ? Math.abs(selectionStart.y - selectionEnd.y)
          : 0;

        if (currentW < minSnapshotSize && currentH < minSnapshotSize) {
          sk.fill(255, 255, 0);
        } else {
          sk.fill(255, 0, 0);
        }
        sk.noStroke();
      } else {
        sk.noFill();
        sk.stroke(255);
        sk.strokeWeight(2);
      }
      sk.ellipse(centroid.x, centroid.y, 24);
      sk.pop();
    }

    // Show hand landmarks for far gesture precision (both hands' index finger tips)
    if (!useCloseGesture && landmarks) {
      sk.push();
      sk.fill(0, 255, 0); // Green for landmark points
      sk.noStroke();
      sk.ellipse(landmarks.X8_1, landmarks.Y8_1, 12); // Hand 1 index finger tip
      sk.ellipse(landmarks.X8_2, landmarks.Y8_2, 12); // Hand 2 index finger tip

      // Draw line between landmarks
      sk.stroke(0, 255, 0);
      sk.strokeWeight(2);
      sk.line(landmarks.X8_1, landmarks.Y8_1, landmarks.X8_2, landmarks.Y8_2);
      sk.pop();
    }

    if (
      isDeveloping &&
      sk.millis() - developmentStartTime >= developmentDuration &&
      pendingCapture
    ) {
      const { x, y, w, h } = pendingCapture;

      const videoX = (camFeed.width / camFeed.scaledWidth) * x;
      const videoY = (camFeed.height / camFeed.scaledHeight) * y;
      const videoW = (camFeed.width / camFeed.scaledWidth) * w;
      const videoH = (camFeed.height / camFeed.scaledHeight) * h;

      const selectedImage = sk.createGraphics(w, h);
      selectedImage.copy(camFeed, videoX, videoY, videoW, videoH, 0, 0, w, h);

      snapshots.push({
        img: selectedImage,
        x,
        y,
        w,
        h,
        startTime: sk.millis(),
      });

      if (snapshots.length > snapshotLimit) {
        snapshots.shift();
      }

      isDeveloping = false;
      developmentStartTime = null;
      pendingCapture = null;
      selectionStart = null;
      selectionEnd = null;
    }
  };

  sk.windowResized = () => {
    sk.resizeCanvas(window.innerWidth, window.innerHeight);
    updateFeedDimensions(sk, camFeed);
  };
});
