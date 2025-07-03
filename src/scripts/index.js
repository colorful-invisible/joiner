import p5 from "p5";
import { mediaPipe } from "./handsModelMediaPipe";
import { initializeCamCapture, updateFeedDimensions } from "./videoFeedUtils";
import { getMappedLandmarks } from "./landmarksHandler";

new p5((sk) => {
  let camFeed;
  let snapshots = [];
  let isSelecting = false;
  let flash = null;
  //
  let hasFade = true;
  const fadeDuration = 1000;
  const delayInSeconds = 20;
  const delay = delayInSeconds * 1000;

  // State variables for selection and clear
  let selectionStart = null;
  let selectionEnd = null;
  let lastValidHandPos = null;
  let clearStartTime = null;
  const clearHoldDuration = 1000; // 1 second to trigger clear

  sk.setup = () => {
    sk.createCanvas(sk.windowWidth, sk.windowHeight);
    sk.background(0);
    sk.textSize(20);
    sk.textAlign(sk.CENTER, sk.CENTER);

    camFeed = initializeCamCapture(sk, mediaPipe);
  };

  sk.draw = () => {
    try {
      sk.push();
      sk.image(
        camFeed,
        camFeed.x,
        camFeed.y,
        camFeed.scaledWidth,
        camFeed.scaledHeight
      );
      sk.pop();

      // GET LANDMARKS - Include wrist (0) + fingertips for proper detection
      const landmarksIndex = [0, 4, 8, 12, 16, 20]; // Wrist, Thumb, Index, Middle, Ring, Pinky
      const LM = getMappedLandmarks(sk, mediaPipe, camFeed, landmarksIndex);

      // Safety check - if no landmarks, skip frame
      if (!LM || Object.keys(LM).length === 0) {
        return;
      }

      // Get finger positions (excluding wrist for finger count)
      let fingers = [
        { x: LM.X4, y: LM.Y4 }, // Thumb
        { x: LM.X8, y: LM.Y8 }, // Index
        { x: LM.X12, y: LM.Y12 }, // Middle
        { x: LM.X16, y: LM.Y16 }, // Ring
        { x: LM.X20, y: LM.Y20 }, // Pinky
      ];

      // Use wrist as fallback for hand center if needed
      let wrist = { x: LM.X0, y: LM.Y0 };

      // Calculate hand center from valid fingers, use wrist as fallback
      let validFingers = fingers.filter((f) => isFinite(f.x) && isFinite(f.y));

      let centerX, centerY;
      if (validFingers.length > 0) {
        centerX =
          validFingers.reduce((sum, f) => sum + f.x, 0) / validFingers.length;
        centerY =
          validFingers.reduce((sum, f) => sum + f.y, 0) / validFingers.length;
      } else if (isFinite(wrist.x) && isFinite(wrist.y)) {
        // Use wrist as fallback if no fingers detected
        centerX = wrist.x;
        centerY = wrist.y;
      }

      // Update last valid position
      if (isFinite(centerX) && isFinite(centerY)) {
        lastValidHandPos = { x: centerX, y: centerY };
      }

      // SIMPLE FIST DETECTION - Based on number of detected fingers
      let detectedFingers = validFingers.length;

      // More lenient hand state detection
      let isHandOpen = detectedFingers >= 3; // Open hand: 3+ fingers detected
      let isHandClosed = detectedFingers <= 1; // Closed fist: 1 or fewer fingers detected

      // Simple state tracking
      let wasHandOpen = true; // Always assume previous state was open for simplicity

      // Update state on the hand position object
      if (lastValidHandPos) {
        lastValidHandPos.wasOpen = isHandOpen;
        wasHandOpen = lastValidHandPos.wasOpen;
      }

      // SELECTION LOGIC - Simplified fist gesture
      if (isHandClosed && !isSelecting) {
        // Hand closed: Start selection
        isSelecting = true;
        selectionStart = { ...lastValidHandPos };
      } else if (isSelecting && isHandOpen) {
        // Hand opened: Take snapshot
        isSelecting = false;
        let { x, y, w, h } = getSelectionBounds(
          selectionStart.x,
          selectionStart.y,
          lastValidHandPos.x,
          lastValidHandPos.y
        );
        captureSelection(x, y, w, h);
        // Reset selection state
        selectionStart = null;
        selectionEnd = null;
      } else if (isSelecting) {
        // Update selection end position
        selectionEnd = { ...lastValidHandPos };
      }

      // CLEAR LOGIC
      let distForClear = lastValidHandPos
        ? Math.floor(
            sk.dist(lastValidHandPos.x, lastValidHandPos.y, 80, sk.height - 80)
          )
        : Infinity;

      if (isHandOpen && distForClear < 100) {
        if (!clearStartTime) {
          clearStartTime = sk.millis();
        } else if (sk.millis() - clearStartTime > clearHoldDuration) {
          snapshots = []; // Clear all snapshots
          clearStartTime = null; // Reset the timer
        }
      } else {
        clearStartTime = null; // Reset the timer if hand moves away or closes
      }

      // SNAPSHOT LOGIC
      let currentTime = sk.millis();
      for (let i = snapshots.length - 1; i >= 0; i--) {
        let { img, x, y, w, h, startTime } = snapshots[i];

        let opacity = 255;
        if (hasFade) {
          let elapsed = currentTime - startTime;
          opacity = sk.map(elapsed, 0, fadeDuration, 255, 0);
        }

        if (opacity <= 0) {
          snapshots.splice(i, 1);
        } else {
          sk.push();
          sk.tint(255, 250, 250, opacity);
          sk.image(img, x, y, w, h);
          sk.pop();
        }
      }

      // DRAW SELECTION RECTANGLE
      if (isSelecting && selectionStart && selectionEnd) {
        sk.push();
        sk.noFill();
        sk.stroke(255, 0, 0);
        sk.strokeWeight(2);
        strokeDash(sk, [5, 5]);

        let { x, y, w, h } = getSelectionBounds(
          selectionStart.x,
          selectionStart.y,
          selectionEnd.x,
          selectionEnd.y
        );

        sk.rect(x, y, w, h);
        sk.pop();
      }

      // FLASH EFFECT
      if (flash) {
        let currentTime = sk.millis();
        let elapsed = currentTime - flash.flashStartTime;
        if (elapsed < flash.flashDuration) {
          let opacity = sk.map(
            elapsed,
            0,
            flash.flashDuration,
            flash.flashOpacity,
            0
          );
          sk.push();
          sk.fill(255, 255, 255, opacity);
          sk.noStroke();
          sk.rect(flash.x, flash.y, flash.w, flash.h);
          sk.pop();
        } else {
          flash = null;
        }
      }

      // Draw hand position
      if (lastValidHandPos) {
        sk.push();
        sk.fill(255, 255, 255, 255);
        sk.noStroke();
        sk.ellipse(lastValidHandPos.x, lastValidHandPos.y, 28);
        sk.fill(0);
        sk.text(
          isSelecting ? "Selecting" : isHandClosed ? "Fist" : "Open",
          lastValidHandPos.x,
          lastValidHandPos.y
        );

        // Simple debug info
        sk.textSize(12);
        sk.text(
          `Fingers: ${detectedFingers}/5`,
          lastValidHandPos.x,
          lastValidHandPos.y + 15
        );
        sk.text(
          `States: O:${isHandOpen} C:${isHandClosed} Was:${wasHandOpen}`,
          lastValidHandPos.x,
          lastValidHandPos.y + 30
        );
        sk.textSize(20);
        sk.pop();
      }

      // CLEAR AREA ELEMENT
      sk.push();
      sk.fill(255, 255, 255, 40);
      sk.stroke(255);
      sk.strokeWeight(2);
      sk.ellipse(80, sk.height - 80, 120);
      sk.pop();

      sk.push();
      sk.fill(255);
      sk.noStroke();
      sk.text("CLEAR", 80, sk.height - 80);
      sk.pop();

      // Show clear progress
      if (clearStartTime) {
        let progress = (sk.millis() - clearStartTime) / clearHoldDuration;
        sk.push();
        sk.noFill();
        sk.stroke(255, 0, 0);
        sk.arc(
          80,
          sk.height - 80,
          140,
          140,
          -sk.HALF_PI,
          -sk.HALF_PI + progress * sk.TWO_PI
        );
        sk.pop();
      }
    } catch (error) {
      console.error("Error in draw loop:", error);
    }
  };

  const getSelectionBounds = (startX, startY, endX, endY) => {
    let x = Math.min(startX, endX);
    let y = Math.min(startY, endY);
    let w = Math.abs(startX - endX);
    let h = Math.abs(startY - endY);
    return { x, y, w, h };
  };

  const captureSelection = (x, y, w, h) => {
    let videoX = (camFeed.width / camFeed.scaledWidth) * x;
    let videoY = (camFeed.height / camFeed.scaledHeight) * y;
    let videoW = (camFeed.width / camFeed.scaledWidth) * w;
    let videoH = (camFeed.height / camFeed.scaledHeight) * h;

    let selectedImage = sk.createGraphics(w, h);
    selectedImage.push();
    selectedImage.copy(camFeed, videoX, videoY, videoW, videoH, 0, 0, w, h);
    selectedImage.pop();

    snapshots.push({
      img: selectedImage,
      x,
      y,
      w,
      h,
      startTime: sk.millis() + delay,
    });

    flash = flashFeedback(x, y, w, h);
  };

  const flashFeedback = (x, y, w, h) => {
    let flashDuration = 500;
    let flashOpacity = 124;
    let flashStartTime = sk.millis();

    return {
      x,
      y,
      w,
      h,
      flashDuration,
      flashStartTime,
      flashOpacity,
    };
  };

  sk.windowResized = () => {
    sk.resizeCanvas(window.innerWidth, window.innerHeight);
    updateFeedDimensions(sk, camFeed);
  };
});

function strokeDash(sk, list) {
  sk.drawingContext.setLineDash(list);
}
