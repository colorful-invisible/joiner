import p5 from "p5";
import { mediaPipe as handModel } from "./handsModel";
import { initializeCamCapture, updateFeedDimensions } from "./videoFeedUtils";
import { getLandmarks } from "./multiLandmarksHandler";
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

  // Frame-based debouncing variables
  let selectingFrameCount = 0;
  let releasedFrameCount = 0;
  let confirmedGesture = "released";
  let lastCentroid = null;
  const FRAME_THRESHOLD = 4; // Require 3 consistent frames before state change

  const developmentDuration = 750;
  const minSnapshotSize = 80; // Minimum dimesions in pixels for a valid snapshot
  const snapshotLimit = 20; // Maximum number of snapshots to keep
  const fadeEnabled = true;
  const fadeStartTime = 120000;
  const fadeDuration = 10000;

  const avg = createAveragePosition(6);

  function detectCloseHandGesture(LM) {
    const baseCentroidThreshold = 24; // Base threshold for centroid distance (camera distance relation)
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

      const debugInfo = {
        handSize: handSize.toFixed(1),
        dynamicThreshold: dynamicThreshold.toFixed(1),
        dThumb: dThumbToCentroid.toFixed(1),
        dIndex: dIndexToCentroid.toFixed(1),
        dMiddle: dMiddleToCentroid.toFixed(1),
        maxDistance: Math.max(
          dThumbToCentroid,
          dIndexToCentroid,
          dMiddleToCentroid
        ).toFixed(1),
      };

      if (
        dThumbToCentroid < dynamicThreshold &&
        dIndexToCentroid < dynamicThreshold &&
        dMiddleToCentroid < dynamicThreshold
      ) {
        return { gesture: "selecting", centroid, debugInfo };
      }

      return { gesture: "released", centroid, debugInfo };
    }
    return { gesture: "released", centroid: null, debugInfo: null };
  }

  function detectFarHandGesture(LM) {
    const gestureThreshold = 96;
    if (LM.X8_hand0 && LM.X8_hand1) {
      const X8_1 = avg("x8_hand1", LM.X8_hand0);
      const Y8_1 = avg("y8_hand1", LM.Y8_hand0);
      const X8_2 = avg("x8_hand2", LM.X8_hand1);
      const Y8_2 = avg("y8_hand2", LM.Y8_hand1);

      const centroid = {
        x: (X8_1 + X8_2) / 2,
        y: (Y8_1 + Y8_2) / 2,
      };

      const distance = sk.dist(X8_1, Y8_1, X8_2, Y8_2);

      if (distance < gestureThreshold) {
        return {
          gesture: "selecting",
          centroid,
          landmarks: { X8_1, Y8_1, X8_2, Y8_2 },
        };
      }

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
      // Close gesture: use universal handler for single hand
      const landmarksIndex = [4, 8, 12, 0];
      LM = getLandmarks(sk, handModel, camFeed, landmarksIndex, 1);
      gestureResult = detectCloseHandGesture(LM);
    } else {
      // Far gesture: use universal handler for multiple hands
      const landmarksIndex = [8];
      LM = getLandmarks(sk, handModel, camFeed, landmarksIndex, 2);
      gestureResult = detectFarHandGesture(LM);
    }

    const centroid = gestureResult.centroid;
    const gesture = gestureResult.gesture;
    const landmarks = gestureResult.landmarks;
    const debugInfo = gestureResult.debugInfo; // Extract debug info

    // Frame-based debouncing for gesture stability
    if (gesture === "selecting" && centroid) {
      selectingFrameCount++;
      releasedFrameCount = 0;
      lastCentroid = centroid; // Store the latest valid centroid
    } else if (gesture === "released") {
      releasedFrameCount++;
      selectingFrameCount = 0;
      // Keep last known centroid for a few frames to avoid jumpy behavior
      if (releasedFrameCount <= FRAME_THRESHOLD && lastCentroid) {
        // Use last known centroid for visual feedback during release debouncing
      }
    } else {
      // Handle case where gesture detection fails (no landmarks)
      // Don't immediately reset - this is likely a tracking glitch
      // Only reset if we've had several bad frames in a row
      if (selectingFrameCount > 0) {
        selectingFrameCount = Math.max(0, selectingFrameCount - 1);
      }
      if (releasedFrameCount > 0) {
        releasedFrameCount = Math.max(0, releasedFrameCount - 1);
      }
    }

    // Only change confirmed gesture state after threshold
    if (selectingFrameCount >= FRAME_THRESHOLD) {
      confirmedGesture = "selecting";
    } else if (releasedFrameCount >= FRAME_THRESHOLD) {
      confirmedGesture = "released";
    }
    // Otherwise keep the previous confirmed gesture state

    // Use confirmed gesture and appropriate centroid for logic
    const finalCentroid =
      confirmedGesture === "selecting"
        ? lastCentroid
        : releasedFrameCount <= FRAME_THRESHOLD
        ? lastCentroid
        : null;

    // Always show a centroid circle if we have any valid detection (raw or debounced)
    const displayCentroid = centroid || lastCentroid;

    if (
      confirmedGesture === "selecting" &&
      !isSelecting &&
      !isDeveloping &&
      finalCentroid
    ) {
      isSelecting = true;
      selectionStart = { ...finalCentroid };
      selectionEnd = { ...finalCentroid };
    } else if (
      confirmedGesture === "selecting" &&
      isSelecting &&
      finalCentroid
    ) {
      selectionEnd = { ...finalCentroid };
    } else if (confirmedGesture === "released" && isSelecting) {
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

    if (displayCentroid) {
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
      sk.ellipse(displayCentroid.x, displayCentroid.y, 24);
      sk.pop();
    }

    // Show hand landmarks for far gesture precision (both hands' index finger tips)
    // Use raw landmarks from gesture result, not the debounced version
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

    // Debug display for close hand gesture
    if (useCloseGesture && debugInfo) {
      sk.push();
      sk.fill(255, 255, 255, 200);
      sk.stroke(0);
      sk.strokeWeight(1);
      sk.rect(10, 10, 300, 140);

      sk.fill(0);
      sk.noStroke();
      sk.textAlign(sk.LEFT, sk.TOP);
      sk.textSize(12);

      let yPos = 25;
      sk.text(`Hand Size: ${debugInfo.handSize}`, 20, yPos);
      yPos += 15;
      sk.text(`Dynamic Threshold: ${debugInfo.dynamicThreshold}`, 20, yPos);
      yPos += 15;
      sk.text(`Thumb Distance: ${debugInfo.dThumb}`, 20, yPos);
      yPos += 15;
      sk.text(`Index Distance: ${debugInfo.dIndex}`, 20, yPos);
      yPos += 15;
      sk.text(`Middle Distance: ${debugInfo.dMiddle}`, 20, yPos);
      yPos += 15;
      sk.text(`Max Distance: ${debugInfo.maxDistance}`, 20, yPos);
      yPos += 15;
      sk.text(`Gesture: ${gesture}`, 20, yPos);
      yPos += 15;
      sk.text(`Confirmed: ${confirmedGesture}`, 20, yPos);

      sk.pop();
    }
  };

  sk.windowResized = () => {
    sk.resizeCanvas(window.innerWidth, window.innerHeight);
    updateFeedDimensions(sk, camFeed);
  };
});
