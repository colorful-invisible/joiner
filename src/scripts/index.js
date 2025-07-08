import p5 from "p5";
import { mediaPipe as handModel } from "./handsModel";
import { initializeCamCapture, updateFeedDimensions } from "./videoFeedUtils";
import { getLandmarks } from "./multiLandmarksHandler";
import { createAveragePosition, createTitleScreen } from "./utils";

new p5((sk) => {
  // Configuration
  const FRAME_THRESHOLD = 12,
    developmentDuration = 750,
    minSnapshotSize = 80,
    snapshotLimit = 20;
  const fadeStartTime = 120000,
    fadeDuration = 10000,
    fadeEnabled = true;

  // State variables
  let camFeed,
    snapshots = [],
    useCloseGesture = true;
  let selectingFrameCount = 0,
    releasedFrameCount = 0,
    confirmedGesture = "released";
  let lastCentroid = null,
    isSelecting = false,
    selectionStart = null,
    selectionEnd = null;
  let isDeveloping = false,
    developmentStartTime = null,
    pendingCapture = null,
    flash = null;

  // Helpers
  const avg = createAveragePosition(6);
  const titleScreen = createTitleScreen("CHRONOTOPE #1 - Fragments", 2000, 500);

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
    sk.textSize(20);
    sk.textAlign(sk.CENTER, sk.CENTER);
    handModel.initialize();
    camFeed = initializeCamCapture(sk, handModel);
    const toggleSwitch = document.getElementById("checkboxInput");
    const toggleText = document.getElementById("toggleText");
    toggleSwitch.addEventListener("change", () => {
      useCloseGesture = !toggleSwitch.checked;
      toggleText.textContent = useCloseGesture ? "NEAR" : "FAR";
    });
  };

  function isExperienceReady() {
    const cam =
      camFeed &&
      camFeed.elt &&
      camFeed.elt.readyState >= 2 &&
      camFeed.elt.videoWidth > 0 &&
      camFeed.elt.videoHeight > 0 &&
      !camFeed.elt.paused;
    const model = handModel && handModel.isInitialized;
    return cam && model;
  }

  function drawSnapshots() {
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
  }

  function drawSelectionRect() {
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
      sk.stroke(
        bounds.w < minSnapshotSize && bounds.h < minSnapshotSize
          ? sk.color(255, 255, 0)
          : sk.color(255, 0, 0)
      );
      sk.rect(bounds.x, bounds.y, bounds.w, bounds.h);
      sk.drawingContext.setLineDash([]);
      sk.pop();
    }
  }

  // Simple undo button
  function handleUndoFunctionality(landmarks) {
    // State management
    if (!handleUndoFunctionality.triggered)
      handleUndoFunctionality.triggered = false;
    if (!handleUndoFunctionality.frameCount)
      handleUndoFunctionality.frameCount = 0;

    // Button setup

    sk.textSize(20);
    const buttonWidth = sk.textWidth("UNDO") + 16;
    const buttonHeight = 32;
    const buttonX = 20;
    const buttonY = sk.height - 52;
    sk.textAlign(sk.CENTER, sk.CENTER);
    sk.fill(255);
    sk.text("UNDO", buttonX + buttonWidth / 2, buttonY + buttonHeight / 2);
    sk.pop();

    sk.push();
    sk.stroke(255);
    sk.strokeWeight(2);
    sk.noFill();
    sk.rect(buttonX, buttonY, buttonWidth, buttonHeight);
    sk.pop();

    // Check if landmark touches button
    const inButton =
      landmarks &&
      ((useCloseGesture &&
        ((landmarks.X4 >= buttonX &&
          landmarks.X4 <= buttonX + buttonWidth &&
          landmarks.Y4 >= buttonY &&
          landmarks.Y4 <= buttonY + buttonHeight) ||
          (landmarks.X8 >= buttonX &&
            landmarks.X8 <= buttonX + buttonWidth &&
            landmarks.Y8 >= buttonY &&
            landmarks.Y8 <= buttonY + buttonHeight) ||
          (landmarks.X12 >= buttonX &&
            landmarks.X12 <= buttonX + buttonWidth &&
            landmarks.Y12 >= buttonY &&
            landmarks.Y12 <= buttonY + buttonHeight))) ||
        (!useCloseGesture &&
          ((landmarks.X8_hand0 >= buttonX &&
            landmarks.X8_hand0 <= buttonX + buttonWidth &&
            landmarks.Y8_hand0 >= buttonY &&
            landmarks.Y8_hand0 <= buttonY + buttonHeight) ||
            (landmarks.X8_hand1 >= buttonX &&
              landmarks.X8_hand1 <= buttonX + buttonWidth &&
              landmarks.Y8_hand1 >= buttonY &&
              landmarks.Y8_hand1 <= buttonY + buttonHeight))));

    // Trigger undo
    if (inButton && !handleUndoFunctionality.triggered) {
      handleUndoFunctionality.frameCount++;
      if (handleUndoFunctionality.frameCount >= FRAME_THRESHOLD) {
        if (snapshots.length > 0) snapshots.pop();
        handleUndoFunctionality.triggered = true;
        handleUndoFunctionality.frameCount = 0;
      }
    } else if (!inButton) {
      handleUndoFunctionality.triggered = false;
      handleUndoFunctionality.frameCount = 0;
    }
  }

  sk.draw = () => {
    sk.background(0);
    // const ready = isExperienceReady();
    // const experienceReady = titleScreen.update(sk, ready);
    // if (!experienceReady) return;
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

    // Handle undo functionality
    handleUndoFunctionality(LM);

    if (gesture === "selecting" && centroid) {
      selectingFrameCount++;
      releasedFrameCount = 0;
      lastCentroid = centroid;
    } else if (gesture === "released") {
      releasedFrameCount++;
      selectingFrameCount = 0;
    } else {
      if (selectingFrameCount > 0)
        selectingFrameCount = Math.max(0, selectingFrameCount - 1);
      if (releasedFrameCount > 0)
        releasedFrameCount = Math.max(0, releasedFrameCount - 1);
    }

    if (selectingFrameCount >= FRAME_THRESHOLD) confirmedGesture = "selecting";
    else if (releasedFrameCount >= FRAME_THRESHOLD)
      confirmedGesture = "released";

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

    drawSnapshots();
    drawSelectionRect();

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
        sk.fill(
          currentW < minSnapshotSize && currentH < minSnapshotSize
            ? sk.color(255, 255, 0)
            : sk.color(255, 0, 0)
        );
        sk.noStroke();
      } else {
        sk.noFill();
        sk.stroke(255);
        sk.strokeWeight(2);
      }
      sk.ellipse(displayCentroid.x, displayCentroid.y, 24);
      sk.pop();
    }

    // Draw individual landmarks for close gesture mode
    if (useCloseGesture && LM) {
      sk.push();
      sk.fill(255);
      sk.noStroke();

      // Apply averaging to reduce jitter
      const X4 = avg("x4_close", LM.X4);
      const Y4 = avg("y4_close", LM.Y4);
      const X8 = avg("x8_close", LM.X8);
      const Y8 = avg("y8_close", LM.Y8);
      const X12 = avg("x12_close", LM.X12);
      const Y12 = avg("y12_close", LM.Y12);

      // Draw finger landmarks with smoothing
      const landmarks = [
        { x: X4, y: Y4 }, // Thumb
        { x: X8, y: Y8 }, // Index
        { x: X12, y: Y12 }, // Middle
      ];

      landmarks.forEach(({ x, y }) => {
        if (x !== undefined && y !== undefined) {
          sk.ellipse(x, y, 12);
        }
      });

      sk.pop();
    }

    if (!useCloseGesture && landmarks) {
      sk.push();
      if (displayCentroid) {
        const centroidRadius = 12;
        const dx = landmarks.X8_2 - landmarks.X8_1;
        const dy = landmarks.Y8_2 - landmarks.Y8_1;
        const lineLength = Math.sqrt(dx * dx + dy * dy);
        const unitX = dx / lineLength;
        const unitY = dy / lineLength;
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
        const stopDistance = centroidRadius;
        const newX1 = landmarks.X8_1 + unitX * (dist1 - stopDistance);
        const newY1 = landmarks.Y8_1 + unitY * (dist1 - stopDistance);
        const newX2 = landmarks.X8_2 - unitX * (dist2 - stopDistance);
        const newY2 = landmarks.Y8_2 - unitY * (dist2 - stopDistance);
        sk.stroke(255);
        sk.strokeWeight(2);
        sk.line(landmarks.X8_1, landmarks.Y8_1, newX1, newY1);
        sk.line(newX2, newY2, landmarks.X8_2, landmarks.Y8_2);
      } else {
        sk.stroke(255);
        sk.strokeWeight(2);
        sk.line(landmarks.X8_1, landmarks.Y8_1, landmarks.X8_2, landmarks.Y8_2);
      }
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
      if (snapshots.length > snapshotLimit) snapshots.shift();
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
