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

  // Font loading
  let customFont;

  // Helpers
  const avg = createAveragePosition(6);
  let titleScreen;

  sk.preload = () => {
    customFont = sk.loadFont(fontUrl);
  };

  sk.setup = () => {
    sk.createCanvas(sk.windowWidth, sk.windowHeight);
    sk.textSize(20);
    sk.textAlign(sk.CENTER, sk.CENTER);

    // Create title screen with custom font
    titleScreen = createTitleScreen(
      "CHRONOTOPE #1 - FRAGMENTS",
      2000,
      500,
      customFont
    );

    poseModel.initialize();
    camFeed = initializeCamCapture(sk, poseModel);
  };

  function detectPoseGesture(LM) {
    const gestureThreshold = 50;

    if (
      LM.X20 !== undefined &&
      LM.X11 !== undefined &&
      LM.X12 !== undefined &&
      LM.X19 !== undefined
    ) {
      // Calculate centroid of points 11 and 12
      const centroid = {
        x: (LM.X11 + LM.X12) / 2,
        y: (LM.Y11 + LM.Y12) / 2,
      };

      // Calculate distances from points 20 and 19 to centroid
      const d20ToCentroid = sk.dist(LM.X20, LM.Y20, centroid.x, centroid.y);
      const d19ToCentroid = sk.dist(LM.X19, LM.Y19, centroid.x, centroid.y);

      let selectionPoint = null;
      let isSelecting = false;

      // When 20 is touching centroid, use 19 for selection
      if (d20ToCentroid < gestureThreshold) {
        selectionPoint = { x: LM.X19, y: LM.Y19 };
        isSelecting = true;
      }
      // When 19 is touching centroid, use 20 for selection
      else if (d19ToCentroid < gestureThreshold) {
        selectionPoint = { x: LM.X20, y: LM.Y20 };
        isSelecting = true;
      }

      if (isSelecting) {
        return {
          gesture: "selecting",
          centroid: selectionPoint, // Use the selection point as the centroid for interaction
          landmarks: {
            X20: LM.X20,
            Y20: LM.Y20,
            X11: LM.X11,
            Y11: LM.Y11,
            X12: LM.X12,
            Y12: LM.Y12,
            X19: LM.X19,
            Y19: LM.Y19,
            actualCentroid: centroid, // Keep the actual centroid for reference
            selectionPoint: selectionPoint,
          },
        };
      }

      return {
        gesture: "released",
        centroid,
        landmarks: {
          X20: LM.X20,
          Y20: LM.Y20,
          X11: LM.X11,
          Y11: LM.Y11,
          X12: LM.X12,
          Y12: LM.Y12,
          X19: LM.X19,
          Y19: LM.Y19,
        },
      };
    }
    return { gesture: "released", centroid: null, landmarks: null };
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
    console.log("X20:", LM.X20, "Y20:", LM.Y20);
    console.log("X19:", LM.X19, "Y19:", LM.Y19);
    console.log("X11:", LM.X11, "Y11:", LM.Y11);
    console.log("X12:", LM.X12, "Y12:", LM.Y12);

    gestureResult = detectPoseGesture(LM);

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

    // Handle undo functionality (draw on top of snapshots)
    handleUndoFunctionality(LM);

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

    // Draw points 20, 19, and the centroid between 11 and 12
    if (LM && landmarks) {
      sk.push();
      sk.noStroke();

      // Directly use LM values (no averaging) for debug visibility
      const X20 = LM.X20;
      const Y20 = LM.Y20;
      const X19 = LM.X19;
      const Y19 = LM.Y19;
      const X11 = LM.X11;
      const Y11 = LM.Y11;
      const X12 = LM.X12;
      const Y12 = LM.Y12;

      // Centroid between 11 and 12
      const centroidX = (X11 + X12) / 2;
      const centroidY = (Y11 + Y12) / 2;

      // Calculate distances to determine which point is touching centroid
      const d20ToCentroid = sk.dist(X20, Y20, centroidX, centroidY);
      const d19ToCentroid = sk.dist(X19, Y19, centroidX, centroidY);
      const gestureThreshold = 50;

      // Determine visual states based on gesture logic
      const is20TouchingCentroid = d20ToCentroid < gestureThreshold;
      const is19TouchingCentroid = d19ToCentroid < gestureThreshold;
      const isPoint20Selection = is19TouchingCentroid && !is20TouchingCentroid; // 20 is selection when 19 touches
      const isPoint19Selection = is20TouchingCentroid && !is19TouchingCentroid; // 19 is selection when 20 touches

      // Draw point 20 (red, with different styles based on state)
      if (X20 !== undefined && Y20 !== undefined) {
        sk.stroke(0);
        sk.strokeWeight(4);
        if (is20TouchingCentroid) {
          // Point 20 is touching centroid - bright red with thick outline
          sk.fill(255, 50, 50);
          sk.strokeWeight(6);
        } else if (isPoint20Selection) {
          // Point 20 is the selection point - pulsing red
          const pulse = sk.sin(sk.millis() * 0.01) * 0.3 + 0.7;
          sk.fill(255 * pulse, 0, 0);
          sk.strokeWeight(5);
        } else {
          // Point 20 is neutral
          sk.fill(255, 0, 0);
        }
        sk.ellipse(X20, Y20, 28, 28);
      }

      // Draw point 19 (green, with different styles based on state)
      if (X19 !== undefined && Y19 !== undefined) {
        sk.stroke(0);
        sk.strokeWeight(4);
        if (is19TouchingCentroid) {
          // Point 19 is touching centroid - bright green with thick outline
          sk.fill(50, 255, 50);
          sk.strokeWeight(6);
        } else if (isPoint19Selection) {
          // Point 19 is the selection point - pulsing green
          const pulse = sk.sin(sk.millis() * 0.01) * 0.3 + 0.7;
          sk.fill(0, 255 * pulse, 0);
          sk.strokeWeight(5);
        } else {
          // Point 19 is neutral
          sk.fill(0, 255, 0);
        }
        sk.ellipse(X19, Y19, 28, 28);
      }

      // Draw centroid between 11 and 12 (blue, larger when being touched)
      if (centroidX !== undefined && centroidY !== undefined) {
        sk.stroke(0);
        sk.strokeWeight(4);
        if (is20TouchingCentroid || is19TouchingCentroid) {
          // Centroid is being touched - larger and brighter
          sk.fill(100, 200, 255);
          sk.strokeWeight(6);
          sk.ellipse(centroidX, centroidY, 36, 36);
        } else {
          // Centroid is neutral
          sk.fill(0, 128, 255);
          sk.ellipse(centroidX, centroidY, 28, 28);
        }
      }

      // Draw connection lines to show the gesture state
      if (is20TouchingCentroid && isPoint19Selection) {
        // Draw line from 20 to centroid (touching) and highlight 19 as selection
        sk.stroke(255, 100, 100);
        sk.strokeWeight(3);
        sk.line(X20, Y20, centroidX, centroidY);
      } else if (is19TouchingCentroid && isPoint20Selection) {
        // Draw line from 19 to centroid (touching) and highlight 20 as selection
        sk.stroke(100, 255, 100);
        sk.strokeWeight(3);
        sk.line(X19, Y19, centroidX, centroidY);
      }

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
