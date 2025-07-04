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

  // Config
  const developmentDuration = 2000;

  sk.setup = () => {
    sk.createCanvas(sk.windowWidth, sk.windowHeight);
    sk.background(0);
    sk.textSize(20);
    sk.textAlign(sk.CENTER, sk.CENTER);
    camFeed = initializeCamCapture(sk, mediaPipe);
  };

  // --- GESTURE MANAGEMENT FUNCTION ---
  // Returns "selecting" if thumb, index, and middle tips are close; "released" otherwise
  let gestureState = "released";
  function updateSelectionGesture(LM) {
    if (
      LM.X4 !== undefined &&
      LM.Y4 !== undefined &&
      LM.X8 !== undefined &&
      LM.Y8 !== undefined &&
      LM.X12 !== undefined &&
      LM.Y12 !== undefined
    ) {
      const dThumbIndex = Math.hypot(LM.X4 - LM.X8, LM.Y4 - LM.Y8);
      const dThumbMiddle = Math.hypot(LM.X4 - LM.X12, LM.Y4 - LM.Y12);
      const dIndexMiddle = Math.hypot(LM.X8 - LM.X12, LM.Y8 - LM.Y12);
      const closeThreshold = 48; // pixels, adjust as needed
      if (
        dThumbIndex < closeThreshold &&
        dThumbMiddle < closeThreshold &&
        dIndexMiddle < closeThreshold
      ) {
        if (gestureState !== "selecting") gestureState = "selecting";
        return "selecting";
      }
    }
    if (gestureState !== "released") gestureState = "released";
    return "released";
  }

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

    // --- SIMPLE GESTURE LOGIC USING updateSelectionGesture ---
    // Calculate centroid of thumb, index, and middle tips
    let centroid = null;
    if (LM.X4 !== undefined && LM.X8 !== undefined && LM.X12 !== undefined) {
      centroid = {
        x: (LM.X4 + LM.X8 + LM.X12) / 3,
        y: (LM.Y4 + LM.Y8 + LM.Y12) / 3,
      };
    }
    const gesture = updateSelectionGesture(LM);
    if (gesture === "selecting" && !isSelecting && !isDeveloping && centroid) {
      // Start selection at centroid
      isSelecting = true;
      selectionStart = { ...centroid };
      selectionEnd = { ...centroid };
    } else if (gesture === "selecting" && isSelecting && centroid) {
      // Continue selection
      selectionEnd = { ...centroid };
    } else if (gesture === "released" && isSelecting) {
      // Release: finalize selection
      isSelecting = false;
      isDeveloping = true;
      developmentStartTime = sk.millis();
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

    // Draw selection tip UI at centroid
    if (centroid) {
      sk.push();
      if (isSelecting) {
        // Full red circle when selecting
        sk.fill(255, 0, 0);
        sk.noStroke();
        sk.ellipse(centroid.x, centroid.y, 24);
      } else {
        // White circle outline when not selecting
        sk.noFill();
        sk.stroke(255);
        sk.strokeWeight(2);
        sk.ellipse(centroid.x, centroid.y, 24);
      }
      sk.pop();
    }

    // Draw landmarks (only thumb, index, middle tips)
    if (LM.X4 !== undefined && LM.X8 !== undefined && LM.X12 !== undefined) {
      sk.push();
      const tips = [
        { x: LM.X4, y: LM.Y4, label: "4", color: [0, 255, 0] }, // Thumb tip
        { x: LM.X8, y: LM.Y8, label: "8", color: [0, 255, 0] }, // Index tip
        { x: LM.X12, y: LM.Y12, label: "12", color: [0, 255, 0] }, // Middle tip
      ];
      // Draw tips
      for (const tip of tips) {
        if (tip.x !== undefined && tip.y !== undefined) {
          sk.fill(tip.color[0], tip.color[1], tip.color[2]);
          sk.noStroke();
          sk.ellipse(tip.x, tip.y, 12);
          sk.fill(255);
          sk.textSize(12);
          sk.text(tip.label, tip.x, tip.y - 16);
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
