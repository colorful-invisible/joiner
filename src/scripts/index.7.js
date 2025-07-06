import p5 from "p5";
import { mediaPipe as handModel } from "./handsModel";
import { initializeCamCapture, updateFeedDimensions } from "./videoFeedUtils";
import { getLandmarks } from "./multiLandmarksHandler";
import { createAveragePosition } from "./utils";

new p5((sk) => {
  const FRAME_THRESHOLD = 8;
  const developmentDuration = 750;
  const minSnapshotSize = 80;
  const snapshotLimit = 20;
  const fadeEnabled = true;
  const fadeStartTime = 120000;
  const fadeDuration = 10000;

  let camFeed;
  let snapshots = [];
  let useCloseGesture = true;
  let selectingFrameCount = 0;
  let releasedFrameCount = 0;
  let confirmedGesture = "released";
  let lastCentroid = null;
  let isSelecting = false;
  let selectionStart = null;
  let selectionEnd = null;
  let isDeveloping = false;
  let developmentStartTime = null;
  let pendingCapture = null;
  let flash = null;

  const avg = createAveragePosition(6);

  function detectCloseHandGesture(LM) {
    const baseCentroidThreshold = 24;
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
      useCloseGesture = !toggleSwitch.checked;
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
      const landmarksIndex = [4, 8, 12, 0];
      LM = getLandmarks(sk, handModel, camFeed, landmarksIndex, 1);
      gestureResult = detectCloseHandGesture(LM);
    } else {
      const landmarksIndex = [8];
      LM = getLandmarks(sk, handModel, camFeed, landmarksIndex, 2);
      gestureResult = detectFarHandGesture(LM);
    }

    const centroid = gestureResult.centroid;
    const gesture = gestureResult.gesture;
    const landmarks = gestureResult.landmarks;

    // Frame-based debouncing
    if (gesture === "selecting" && centroid) {
      selectingFrameCount++;
      releasedFrameCount = 0;
      lastCentroid = centroid;
    } else if (gesture === "released") {
      releasedFrameCount++;
      selectingFrameCount = 0;
    } else {
      if (selectingFrameCount > 0) {
        selectingFrameCount = Math.max(0, selectingFrameCount - 1);
      }
      if (releasedFrameCount > 0) {
        releasedFrameCount = Math.max(0, releasedFrameCount - 1);
      }
    }

    if (selectingFrameCount >= FRAME_THRESHOLD) {
      confirmedGesture = "selecting";
    } else if (releasedFrameCount >= FRAME_THRESHOLD) {
      confirmedGesture = "released";
    }

    const finalCentroid =
      confirmedGesture === "selecting"
        ? lastCentroid
        : releasedFrameCount <= FRAME_THRESHOLD
        ? lastCentroid
        : null;

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
        sk.stroke(255, 255, 0);
      } else {
        sk.stroke(255, 0, 0);
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

    if (!useCloseGesture && landmarks) {
      sk.push();

      // Draw line first, but stop before centroid
      if (displayCentroid) {
        const centroidRadius = 12; // Half of the centroid circle diameter (24)
        const dx = landmarks.X8_2 - landmarks.X8_1;
        const dy = landmarks.Y8_2 - landmarks.Y8_1;
        const lineLength = Math.sqrt(dx * dx + dy * dy);

        // Calculate unit vector along the line
        const unitX = dx / lineLength;
        const unitY = dy / lineLength;

        // Calculate distances from each finger to centroid
        const dist1 = sk.dist(
          landmarks.X8_1,
          landmarks.Y8_1,
          displayCentroid.x,
          displayCentroid.y
        );
        const dist2 = sk.dist(
          landmarks.X8_2,
          landmarks.Y8_2,
          displayCentroid.x,
          displayCentroid.y
        );

        // Calculate new endpoints that stop before the centroid
        const stopDistance = centroidRadius; // 4 pixels gap
        const newX1 = landmarks.X8_1 + unitX * (dist1 - stopDistance);
        const newY1 = landmarks.Y8_1 + unitY * (dist1 - stopDistance);
        const newX2 = landmarks.X8_2 - unitX * (dist2 - stopDistance);
        const newY2 = landmarks.Y8_2 - unitY * (dist2 - stopDistance);

        sk.stroke(255);
        sk.strokeWeight(2);
        sk.line(landmarks.X8_1, landmarks.Y8_1, newX1, newY1);
        sk.line(newX2, newY2, landmarks.X8_2, landmarks.Y8_2);
      } else {
        // If no centroid, draw full line
        sk.stroke(255);
        sk.strokeWeight(2);
        sk.line(landmarks.X8_1, landmarks.Y8_1, landmarks.X8_2, landmarks.Y8_2);
      }

      // Draw finger tip circles
      sk.fill(255);
      sk.noStroke();
      sk.ellipse(landmarks.X8_1, landmarks.Y8_1, 12);
      sk.ellipse(landmarks.X8_2, landmarks.Y8_2, 12);

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
