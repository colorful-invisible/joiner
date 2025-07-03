import p5 from "p5";
import { mediaPipe } from "./handsModel";
import { initializeCamCapture, updateFeedDimensions } from "./videoFeedUtils";
import { getMappedLandmarks } from "./landmarksHandler";

new p5((sk) => {
  // State
  let camFeed;
  let snapshots = [];
  let lastValidHandPos = null;
  let isSelecting = false;
  let selectionStart = null;
  let selectionEnd = null;
  let isDeveloping = false;
  let developmentStartTime = null;
  let pendingCapture = null;
  let flash = null;
  let lastGesture = null;
  let gestureStableFrames = 0;

  // Config
  const developmentDuration = 2000;
  const requiredStableFrames = 10; // Increased from 5 to 10 for more stability

  sk.setup = () => {
    sk.createCanvas(sk.windowWidth, sk.windowHeight);
    sk.background(0);
    sk.textSize(20);
    sk.textAlign(sk.CENTER, sk.CENTER);
    camFeed = initializeCamCapture(sk, mediaPipe);
  };

  sk.draw = () => {
    sk.background(0);

    // Check camera readiness
    if (!camFeed || camFeed.width <= 0 || camFeed.height <= 0) {
      sk.fill(255);
      sk.text("Loading camera...", sk.width / 2, sk.height / 2);
      return;
    }

    // Draw camera feed
    sk.image(camFeed, 0, 0, camFeed.scaledWidth, camFeed.scaledHeight);

    // Get landmarks
    const landmarksIndex = [4, 8, 9, 12, 16, 20, 3, 5, 13, 17];
    const LM = getMappedLandmarks(sk, mediaPipe, camFeed, landmarksIndex);

    // Update hand position
    if (LM.X9 !== undefined && LM.Y9 !== undefined) {
      lastValidHandPos = { x: LM.X9, y: LM.Y9 };
    }

    // Gesture detection
    let isFist = false;
    if (LM.X4 !== undefined && LM.Y4 !== undefined) {
      const getDistance = (x1, y1, x2, y2) =>
        Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);

      const thumbDist = getDistance(LM.X4, LM.Y4, LM.X3, LM.Y3);
      const indexDist = getDistance(LM.X8, LM.Y8, LM.X5, LM.Y5);
      const middleDist = getDistance(LM.X12, LM.Y12, LM.X9, LM.Y9);
      const ringDist = getDistance(LM.X16, LM.Y16, LM.X13, LM.Y13);
      const pinkyDist = getDistance(LM.X20, LM.Y20, LM.X17, LM.Y17);

      // More strict thresholds for better detection
      const fistThreshold = 35; // Stricter for fist detection
      const openThreshold = 70; // Higher threshold for open hand

      const fistCount = [
        thumbDist,
        indexDist,
        middleDist,
        ringDist,
        pinkyDist,
      ].filter((dist) => dist < fistThreshold).length;

      const openCount = [
        thumbDist,
        indexDist,
        middleDist,
        ringDist,
        pinkyDist,
      ].filter((dist) => dist > openThreshold).length;

      // Require 4+ fingers closed for fist, 3+ fingers open for open hand
      isFist = fistCount >= 4;
      const isOpen = openCount >= 3;

      // Add hysteresis - if we're currently selecting, require stronger open signal
      if (isSelecting) {
        isFist = fistCount >= 4 && openCount < 2; // Must be clearly closed
      }
    }

    // Handle gesture stability
    const currentGesture = isFist ? "fist" : "open";
    if (currentGesture === lastGesture) {
      gestureStableFrames++;
    } else {
      gestureStableFrames = 0;
      lastGesture = currentGesture;
    }

    const isStableGesture = gestureStableFrames >= requiredStableFrames;

    // Handle selection logic
    if (isStableGesture && isFist && !isSelecting && !isDeveloping) {
      // Start selection
      isSelecting = true;
      selectionStart = { ...lastValidHandPos };
      selectionEnd = { ...lastValidHandPos };
    } else if (isSelecting && isStableGesture && !isFist && !isDeveloping) {
      // End selection and start development - only if hand is clearly open
      const isOpen =
        LM.X4 !== undefined &&
        [
          Math.sqrt((LM.X4 - LM.X3) ** 2 + (LM.Y4 - LM.Y3) ** 2),
          Math.sqrt((LM.X8 - LM.X5) ** 2 + (LM.Y8 - LM.Y5) ** 2),
          Math.sqrt((LM.X12 - LM.X9) ** 2 + (LM.Y12 - LM.Y9) ** 2),
          Math.sqrt((LM.X16 - LM.X13) ** 2 + (LM.Y16 - LM.Y13) ** 2),
          Math.sqrt((LM.X20 - LM.X17) ** 2 + (LM.Y20 - LM.Y17) ** 2),
        ].filter((dist) => dist > 70).length >= 3;

      if (isOpen) {
        isDeveloping = true;
        developmentStartTime = sk.millis();
        isSelecting = false;

        const x = Math.min(selectionStart.x, selectionEnd.x);
        const y = Math.min(selectionStart.y, selectionEnd.y);
        const w = Math.abs(selectionStart.x - selectionEnd.x);
        const h = Math.abs(selectionStart.y - selectionEnd.y);

        pendingCapture = { x, y, w, h };
        flash = {
          x,
          y,
          w,
          h,
          flashDuration: developmentDuration,
          flashStartTime: sk.millis(),
        };
      }
    } else if (isSelecting && isFist) {
      // Update selection while fist is held
      selectionEnd = { ...lastValidHandPos };
    }

    // Draw snapshots
    for (let i = snapshots.length - 1; i >= 0; i--) {
      const { img, x, y, w, h } = snapshots[i];
      sk.image(img, x, y, w, h);
    }

    // Draw selection rectangle
    if ((isSelecting || isDeveloping) && selectionStart) {
      sk.push();
      sk.noFill();
      sk.stroke(255, 0, 0);
      sk.strokeWeight(2);
      sk.drawingContext.setLineDash([5, 5]);

      let bounds = pendingCapture || {
        x: Math.min(selectionStart.x, selectionEnd.x),
        y: Math.min(selectionStart.y, selectionEnd.y),
        w: Math.abs(selectionStart.x - selectionEnd.x),
        h: Math.abs(selectionStart.y - selectionEnd.y),
      };

      sk.rect(bounds.x, bounds.y, bounds.w, bounds.h);
      sk.pop();
    }

    // Draw flash effect
    if (flash) {
      const elapsed = sk.millis() - flash.flashStartTime;
      if (elapsed < flash.flashDuration) {
        const opacity = sk.map(elapsed, 0, flash.flashDuration, 255, 0);
        sk.fill(255, opacity);
        sk.noStroke();
        sk.rect(flash.x, flash.y, flash.w, flash.h);
      } else {
        flash = null;
      }
    }

    // Draw hand marker
    if (lastValidHandPos) {
      sk.push();
      if (isSelecting) {
        sk.fill(255, 0, 0);
        sk.noStroke();
      } else {
        sk.noFill();
        sk.stroke(255);
        sk.strokeWeight(2);
      }
      sk.ellipse(lastValidHandPos.x, lastValidHandPos.y, 28);
      sk.pop();
    }

    // Draw landmarks
    if (LM.X4 !== undefined) {
      sk.push();
      const landmarks = [
        { x: LM.X4, y: LM.Y4, label: "4", color: [0, 255, 0] },
        { x: LM.X8, y: LM.Y8, label: "8", color: [0, 255, 0] },
        { x: LM.X12, y: LM.Y12, label: "12", color: [0, 255, 0] },
        { x: LM.X16, y: LM.Y16, label: "16", color: [0, 255, 0] },
        { x: LM.X20, y: LM.Y20, label: "20", color: [0, 255, 0] },
        { x: LM.X3, y: LM.Y3, label: "3", color: [255, 0, 0] },
        { x: LM.X5, y: LM.Y5, label: "5", color: [255, 0, 0] },
        { x: LM.X9, y: LM.Y9, label: "9", color: [255, 0, 0] },
        { x: LM.X13, y: LM.Y13, label: "13", color: [255, 0, 0] },
        { x: LM.X17, y: LM.Y17, label: "17", color: [255, 0, 0] },
      ];

      for (const landmark of landmarks) {
        if (landmark.x !== undefined && landmark.y !== undefined) {
          sk.fill(landmark.color[0], landmark.color[1], landmark.color[2]);
          sk.noStroke();
          sk.ellipse(landmark.x, landmark.y, 8);
          sk.fill(255);
          sk.textSize(10);
          sk.text(landmark.label, landmark.x, landmark.y - 12);
        }
      }
      sk.pop();
    }

    // Check if development is complete
    if (isDeveloping && developmentStartTime) {
      const elapsed = sk.millis() - developmentStartTime;
      if (elapsed >= developmentDuration && pendingCapture) {
        // Capture the snapshot
        const { x, y, w, h } = pendingCapture;
        const adjustedX = x + 1,
          adjustedY = y + 1;
        const adjustedW = w - 2,
          adjustedH = h - 2;

        const relativeX = adjustedX,
          relativeY = adjustedY;
        const videoX = (camFeed.width / camFeed.scaledWidth) * relativeX;
        const videoY = (camFeed.height / camFeed.scaledHeight) * relativeY;
        const videoW = (camFeed.width / camFeed.scaledWidth) * adjustedW;
        const videoH = (camFeed.height / camFeed.scaledHeight) * adjustedH;

        const selectedImage = sk.createGraphics(adjustedW, adjustedH);
        selectedImage.copy(
          camFeed,
          videoX,
          videoY,
          videoW,
          videoH,
          0,
          0,
          adjustedW,
          adjustedH
        );

        snapshots.push({
          img: selectedImage,
          x: adjustedX,
          y: adjustedY,
          w: adjustedW,
          h: adjustedH,
          startTime: sk.millis(),
        });

        // Reset development state
        isDeveloping = false;
        developmentStartTime = null;
        pendingCapture = null;
        selectionStart = null;
        selectionEnd = null;
      }
    }
  };

  sk.windowResized = () => {
    sk.resizeCanvas(window.innerWidth, window.innerHeight);
    updateFeedDimensions(sk, camFeed);
  };
});
