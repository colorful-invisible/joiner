import p5 from "p5";
import { mediaPipe as poseModel } from "./poseModel";
import { initializeCamCapture, updateFeedDimensions } from "./videoFeedUtils";
import { getMappedLandmarks } from "./landmarksHandler";
import { createAveragePosition, createTitleScreen } from "./utils";
import fontUrl from "../assets/fonts/MonaspaceNeon-WideExtraLight.otf";

new p5((sk) => {
  // Configuration
  const FRAME_THRESHOLD = 12,
    developmentDuration = 750,
    minSnapshotSize = 80,
    snapshotLimit = 20;
  const fadeStartTime = 120000,
    fadeDuration = 10000,
    fadeEnabled = true;

  // Helpers
  const avg = createAveragePosition(12);
  let titleScreen;

  // State variables
  let camFeed,
    snapshots = [];
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
  let customFont;

  sk.preload = () => {
    customFont = sk.loadFont(fontUrl);
  };

  sk.setup = () => {
    sk.createCanvas(sk.windowWidth, sk.windowHeight);

    // Create title screen with custom font
    titleScreen = createTitleScreen(
      "CHRONOTOPE #1 - FRAGMENTS",
      1500,
      500,
      customFont
    );

    poseModel.initialize();
    camFeed = initializeCamCapture(sk, poseModel);
  };

  function processLandmarks(LM) {
    const gestureThreshold = 96;

    if (
      LM.X20 !== undefined &&
      LM.X11 !== undefined &&
      LM.X12 !== undefined &&
      LM.X19 !== undefined
    ) {
      // Apply averaging to all landmarks
      const landmarks = {
        X11: avg("X11", LM.X11),
        Y11: avg("Y11", LM.Y11),
        X12: avg("X12", LM.X12),
        Y12: avg("Y12", LM.Y12),
        X19: avg("X19", LM.X19),
        Y19: avg("Y19", LM.Y19),
        X20: avg("X20", LM.X20),
        Y20: avg("Y20", LM.Y20),
      };

      // Calculate centroid of points 11 and 12
      const actualCentroid = {
        x: (landmarks.X11 + landmarks.X12) / 2,
        y: (landmarks.Y11 + landmarks.Y12) / 2 + 80,
      };

      // Calculate distances from points 20 and 19 to centroid
      const d20ToCentroid = sk.dist(
        landmarks.X20,
        landmarks.Y20,
        actualCentroid.x,
        actualCentroid.y
      );
      const d19ToCentroid = sk.dist(
        landmarks.X19,
        landmarks.Y19,
        actualCentroid.x,
        actualCentroid.y
      );

      // Determine visual and interaction states
      const is20TouchingCentroid = d20ToCentroid < gestureThreshold;
      const is19TouchingCentroid = d19ToCentroid < gestureThreshold;
      const isPoint20Selection = is19TouchingCentroid && !is20TouchingCentroid;
      const isPoint19Selection = is20TouchingCentroid && !is19TouchingCentroid;

      let selectionPoint = null;
      let isSelecting = false;
      let gesture = "released";
      let centroid = actualCentroid;

      // When 20 is touching centroid, use 19 for selection
      if (is20TouchingCentroid) {
        selectionPoint = { x: landmarks.X19, y: landmarks.Y19 };
        isSelecting = true;
        gesture = "selecting";
        centroid = selectionPoint; // Use selection point as centroid for interaction
      }
      // When 19 is touching centroid, use 20 for selection
      else if (is19TouchingCentroid) {
        selectionPoint = { x: landmarks.X20, y: landmarks.Y20 };
        isSelecting = true;
        gesture = "selecting";
        centroid = selectionPoint; // Use selection point as centroid for interaction
      }

      return {
        gesture,
        centroid,
        landmarks: {
          ...landmarks,
          actualCentroid,
          selectionPoint,
        },
        visualStates: {
          is20TouchingCentroid,
          is19TouchingCentroid,
          isPoint20Selection,
          isPoint19Selection,
          d20ToCentroid,
          d19ToCentroid,
          gestureThreshold,
        },
      };
    }
    return {
      gesture: "released",
      centroid: null,
      landmarks: null,
      visualStates: null,
    };
  }

  function isExperienceReady() {
    const cam =
      camFeed &&
      camFeed.elt &&
      camFeed.elt.readyState >= 2 &&
      camFeed.elt.videoWidth > 0 &&
      camFeed.elt.videoHeight > 0 &&
      !camFeed.elt.paused;
    const model = poseModel && poseModel.isInitialized;
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

  function drawLandmarkVisualization(landmarks, visualStates) {
    if (!landmarks || !visualStates) return;

    const { X20, Y20, X19, Y19, actualCentroid } = landmarks;
    const {
      is20TouchingCentroid,
      is19TouchingCentroid,
      isPoint20Selection,
      isPoint19Selection,
    } = visualStates;

    const centroidX = actualCentroid.x;
    const centroidY = actualCentroid.y;
    const pulse = sk.sin(sk.millis() * 0.01) * 0.3 + 1.0;

    // Draw point 20
    if (X20 !== undefined && Y20 !== undefined) {
      sk.push();
      sk.noStroke();
      if (isPoint20Selection) {
        const w = selectionEnd
          ? Math.abs(selectionStart.x - selectionEnd.x)
          : 0;
        const h = selectionEnd
          ? Math.abs(selectionStart.y - selectionEnd.y)
          : 0;
        const isValid = w > minSnapshotSize || h > minSnapshotSize;
        sk.fill(isValid ? sk.color(255, 0, 0) : sk.color(255, 255, 0));
        sk.ellipse(X20, Y20, 12, 12);
      } else if (is20TouchingCentroid) {
        sk.fill(255);
        sk.ellipse(X20, Y20, 12 * pulse, 12 * pulse);
      } else {
        sk.fill(255);
        sk.ellipse(X20, Y20, 12, 12);
      }
      sk.pop();
    }

    // Draw point 19
    if (X19 !== undefined && Y19 !== undefined) {
      sk.push();
      sk.noStroke();
      if (isPoint19Selection) {
        const w = selectionEnd
          ? Math.abs(selectionStart.x - selectionEnd.x)
          : 0;
        const h = selectionEnd
          ? Math.abs(selectionStart.y - selectionEnd.y)
          : 0;
        const isValid = w > minSnapshotSize || h > minSnapshotSize;
        sk.fill(isValid ? sk.color(255, 0, 0) : sk.color(255, 255, 0));
        sk.ellipse(X19, Y19, 12, 12);
      } else if (is19TouchingCentroid) {
        sk.fill(255);
        sk.ellipse(X19, Y19, 12 * pulse, 12 * pulse);
      } else {
        sk.fill(255);
        sk.ellipse(X19, Y19, 12, 12);
      }
      sk.pop();
    }

    // Draw centroid
    if (centroidX !== undefined && centroidY !== undefined) {
      sk.push();
      sk.noStroke();
      sk.fill(255);
      const size =
        is20TouchingCentroid || is19TouchingCentroid ? 24 * pulse : 24;
      sk.ellipse(centroidX, centroidY, size, size);
      sk.pop();
    }

    // Draw connection lines
    if (is20TouchingCentroid) {
      sk.push();
      sk.stroke(255);
      sk.strokeWeight(2);
      sk.line(X20, Y20, centroidX, centroidY);
      sk.pop();
    } else if (is19TouchingCentroid) {
      sk.push();
      sk.stroke(255);
      sk.strokeWeight(2);
      sk.line(X19, Y19, centroidX, centroidY);
      sk.pop();
    }
  }

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

    // Check if landmark touches button
    const inButton =
      landmarks &&
      ((landmarks.X20 >= buttonX &&
        landmarks.X20 <= buttonX + buttonWidth &&
        landmarks.Y20 >= buttonY &&
        landmarks.Y20 <= buttonY + buttonHeight) ||
        (landmarks.X19 >= buttonX &&
          landmarks.X19 <= buttonX + buttonWidth &&
          landmarks.Y19 >= buttonY &&
          landmarks.Y19 <= buttonY + buttonHeight));

    // Draw button
    const opacity = inButton ? 255 : 5;

    sk.push();
    sk.stroke(255, opacity);
    sk.strokeWeight(2);
    sk.noFill();
    sk.rect(buttonX, buttonY, buttonWidth, buttonHeight);

    sk.fill(255, opacity);
    sk.noStroke();
    sk.textAlign(sk.CENTER, sk.CENTER);
    sk.text("UNDO", buttonX + buttonWidth / 2, buttonY + buttonHeight / 2);
    sk.pop();

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
    const ready = isExperienceReady();
    const experienceReady = titleScreen.update(sk, ready);
    if (!experienceReady) return;
    sk.image(camFeed, 0, 0, camFeed.scaledWidth, camFeed.scaledHeight);

    let LM, gestureResult;
    const landmarksIndex = [20, 11, 12, 19];
    LM = getMappedLandmarks(sk, poseModel, camFeed, landmarksIndex, 1);

    // Debug logging
    console.log(
      "Raw pose landmarks:",
      poseModel.landmarks.length > 0 ? poseModel.landmarks[0] : "No landmarks"
    );
    console.log("Mapped landmarks:", LM);

    gestureResult = processLandmarks(LM);

    const centroid = gestureResult.centroid;
    const gesture = gestureResult.gesture;
    const landmarks = gestureResult.landmarks;

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

    handleUndoFunctionality(landmarks);

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

    // Draw landmark visualization
    drawLandmarkVisualization(
      gestureResult.landmarks,
      gestureResult.visualStates
    );

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
