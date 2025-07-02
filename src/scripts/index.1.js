import p5 from "p5";
import { mediaPipe } from "./handsModelMediaPipe";
import { initializeCamCapture, calculateVideoDimensions } from "./cameraUtils";
import { getMappedLandmarks } from "./landmarksHandler";
import { averageLandmarkPosition } from "./utils";

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
  //
  const avgPos = averageLandmarkPosition(4);

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
    sk.push();
    sk.image(camFeed, 0, 0, camFeed.scaledWidth, camFeed.scaledHeight);
    sk.pop();

    // GET LANDMARKS
    const landmarksIndex = [4, 8];
    const landmarks = getMappedLandmarks(
      sk,
      mediaPipe,
      camFeed,
      landmarksIndex
    );

    let thumbX = avgPos("tX", landmarks.LM0_4X);
    let thumbY = avgPos("tY", landmarks.LM0_4Y);
    let indexX = avgPos("iX", landmarks.LM0_8X);
    let indexY = avgPos("iY", landmarks.LM0_8Y);

    let centerX = (thumbX + indexX) / 2;
    let centerY = (thumbY + indexY) / 2;

    // Update last valid position
    if (isFinite(centerX) && isFinite(centerY)) {
      lastValidHandPos = { x: centerX, y: centerY };
    }

    // Calculate distance between thumb and index finger
    let distThumbIndex = Math.floor(sk.dist(thumbX, thumbY, indexX, indexY));

    // Determine if fingers are pinched or released
    let isPinched = distThumbIndex < 50; // Adjust this threshold as needed
    let isReleased = distThumbIndex > 100; // Adjust this threshold as needed

    // SELECTION LOGIC
    if (!isSelecting && isPinched) {
      isSelecting = true;
      selectionStart = { ...lastValidHandPos };
    } else if (isSelecting) {
      selectionEnd = { ...lastValidHandPos };

      if (isReleased) {
        isSelecting = false;
        let { x, y, w, h } = getSelectionBounds(
          selectionStart.x,
          selectionStart.y,
          selectionEnd.x,
          selectionEnd.y
        );
        captureSelection(x, y, w, h);
        // Reset selection state
        selectionStart = null;
        selectionEnd = null;
      }
    }

    // CLEAR LOGIC
    let distForClear = lastValidHandPos
      ? Math.floor(
          sk.dist(lastValidHandPos.x, lastValidHandPos.y, 80, sk.height - 80)
        )
      : Infinity;

    if (isReleased && distForClear < 100) {
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
        isSelecting ? "Selecting" : isPinched ? "Pinched" : "Released",
        lastValidHandPos.x,
        lastValidHandPos.y
      );
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
    calculateVideoDimensions(sk, camFeed);
  };
});

function strokeDash(sk, list) {
  sk.drawingContext.setLineDash(list);
}
