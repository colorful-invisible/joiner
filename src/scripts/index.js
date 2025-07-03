import p5 from "p5";
import { gesturePipe } from "./gestureRecognizer";
import { initializeCamCapture, updateFeedDimensions } from "./videoFeedUtils";

new p5((sk) => {
  // ---- CONFIGURATION
  const countdownDuration = 2000;
  const hasFade = false;
  const fadeDuration = 30000;

  // ---- STATE VARIABLES

  // Core app state
  let camFeed;
  let snapshots = [];
  let lastValidHandPos = null;

  // Selection state
  let isSelecting = false;
  let selectionStart = null;
  let selectionEnd = null;

  // Countdown state
  let countdownActive = false;
  let countdownStartTime = null;

  // Visual effects
  let flash = null;

  // ---- SETUP
  sk.setup = () => {
    sk.createCanvas(sk.windowWidth, sk.windowHeight);
    sk.background(0);
    sk.textSize(20);
    sk.textAlign(sk.CENTER, sk.CENTER);
    camFeed = initializeCamCapture(sk, gesturePipe);
  };

  // ---- MAIN DRAW LOOP
  sk.draw = () => {
    try {
      sk.background(0);

      // 1. Check camera readiness
      if (!isCameraReady()) {
        drawLoadingMessage();
        return;
      }

      // 2. Draw camera feed
      drawCameraFeed();

      // 3. Process hand tracking
      updateHandTracking();

      // 4. Handle gesture recognition
      handleGestures();

      // 5. Draw UI elements
      drawCountdown();
      drawSnapshots();
      drawSelectionRectangle();
      drawFlashEffect();
      drawHandMarker();
    } catch (err) {
      console.error("Draw loop error:", err);
    }
  };

  // ---- CAMERA AND DRAWING FUNCTIONS
  const isCameraReady = () => {
    return camFeed && camFeed.width > 0 && camFeed.height > 0;
  };

  const drawLoadingMessage = () => {
    sk.fill(255);
    sk.text("Loading camera...", sk.width / 2, sk.height / 2);
  };

  const drawCameraFeed = () => {
    const drawX = camFeed.x || 0;
    const drawY = camFeed.y || 0;
    const drawWidth = camFeed.scaledWidth || camFeed.width || sk.width;
    const drawHeight = camFeed.scaledHeight || camFeed.height || sk.height;
    sk.image(camFeed, drawX, drawY, drawWidth, drawHeight);
  };

  // ---- HAND TRACKING AND GESTURE RECOGNITION
  const updateHandTracking = () => {
    const hand = gesturePipe.results.landmarks?.[0];
    if (hand) {
      const cx = sk.map(hand[9].x, 1, 0, 0, camFeed.scaledWidth);
      const cy = sk.map(hand[9].y, 0, 1, 0, camFeed.scaledHeight);
      lastValidHandPos = { x: cx, y: cy };
    }
  };

  const getCurrentGesture = () => {
    const gestures = gesturePipe.results.gestures?.[0];
    const label = gestures?.[0]?.categoryName || "None";
    const isFist = label === "Closed_Fist";
    return { label, isFist };
  };

  const handleGestures = () => {
    const { label, isFist } = getCurrentGesture();

    if (isFist && !isSelecting && !countdownActive) {
      startSelection();
    } else if (isSelecting && !isFist && !countdownActive) {
      triggerCountdown();
    } else if (isSelecting && isFist) {
      updateSelection();
    }
  };

  const startSelection = () => {
    isSelecting = true;
    selectionStart = { ...lastValidHandPos };
    selectionEnd = { ...lastValidHandPos };
  };

  const triggerCountdown = () => {
    if (!sk._snapshotTimeout) {
      const frozenSelectionEnd = { ...selectionEnd };
      countdownActive = true;
      countdownStartTime = sk.millis();
      isSelecting = false;

      sk._snapshotTimeout = setTimeout(() => {
        countdownActive = false;
        const { x, y, w, h } = getSelectionBounds(
          selectionStart.x,
          selectionStart.y,
          frozenSelectionEnd.x,
          frozenSelectionEnd.y
        );
        captureSelection(x, y, w, h);
        resetSelection();
        sk._snapshotTimeout = null;
      }, countdownDuration);
    }
  };

  const updateSelection = () => {
    selectionEnd = { ...lastValidHandPos };
  };

  const resetSelection = () => {
    selectionStart = null;
    selectionEnd = null;
  };

  // ---- UI DRAWING FUNCTIONS
  const drawCountdown = () => {
    if (!countdownActive || !countdownStartTime) return;

    const elapsed = sk.millis() - countdownStartTime;
    const remaining = countdownDuration - elapsed;
    const countdownNumber = Math.ceil(remaining / 1000) + 1;

    if (countdownNumber >= 2 && countdownNumber <= 3) {
      sk.push();
      sk.textSize(32);
      sk.textAlign(sk.CENTER, sk.CENTER);
      sk.stroke(255);
      sk.strokeWeight(2);
      sk.noFill();
      sk.ellipse(50, 50, 60);
      sk.fill(255);
      sk.noStroke();
      sk.text(countdownNumber, 50, 50);
      sk.pop();
    }
  };

  const drawSnapshots = () => {
    const currentTime = sk.millis();
    for (let i = snapshots.length - 1; i >= 0; i--) {
      const { img, x, y, w, h, startTime } = snapshots[i];
      const opacity = hasFade
        ? sk.map(currentTime - startTime, 0, fadeDuration, 255, 0)
        : 255;

      if (hasFade && opacity <= 0) {
        snapshots.splice(i, 1);
      } else {
        sk.push();
        sk.tint(255, opacity);
        sk.image(img, x, y, w, h);
        sk.pop();
      }
    }
  };

  const drawSelectionRectangle = () => {
    if (!(isSelecting || countdownActive) || !selectionStart || !selectionEnd)
      return;

    sk.push();
    sk.noFill();
    sk.stroke(255, 0, 0);
    sk.strokeWeight(2);
    strokeDash(sk, [5, 5]);

    const { x, y, w, h } = getSelectionBounds(
      selectionStart.x,
      selectionStart.y,
      selectionEnd.x,
      selectionEnd.y
    );

    sk.rect(x, y, w, h);
    sk.pop();
  };

  const drawFlashEffect = () => {
    if (!flash) return;

    const elapsed = sk.millis() - flash.flashStartTime;
    if (elapsed < flash.flashDuration) {
      const opacity = sk.map(elapsed, 0, flash.flashDuration, 124, 0);
      sk.fill(255, opacity);
      sk.noStroke();
      sk.rect(flash.x, flash.y, flash.w, flash.h);
    } else {
      flash = null;
    }
  };

  const drawHandMarker = () => {
    if (!lastValidHandPos) return;

    sk.push();
    if (isSelecting) {
      // Red filled circle when selecting
      sk.fill(255, 0, 0);
      sk.noStroke();
    } else {
      // White outline circle when not selecting
      sk.noFill();
      sk.stroke(255);
      sk.strokeWeight(2);
    }
    sk.ellipse(lastValidHandPos.x, lastValidHandPos.y, 28);
    sk.pop();
  };

  // ---- UTILITY FUNCTIONS
  const getSelectionBounds = (startX, startY, endX, endY) => {
    const x = Math.min(startX, endX);
    const y = Math.min(startY, endY);
    const w = Math.abs(startX - endX);
    const h = Math.abs(startY - endY);
    return { x, y, w, h };
  };

  const captureSelection = (x, y, w, h) => {
    // Calculate video coordinates for accurate capture
    const videoX = (camFeed.width / camFeed.scaledWidth) * x;
    const videoY = (camFeed.height / camFeed.scaledHeight) * y;
    const videoW = (camFeed.width / camFeed.scaledWidth) * w;
    const videoH = (camFeed.height / camFeed.scaledHeight) * h;

    // Create snapshot graphics
    const selectedImage = sk.createGraphics(w, h);
    selectedImage.copy(camFeed, videoX, videoY, videoW, videoH, 0, 0, w, h);

    // Add to snapshots array
    snapshots.push({
      img: selectedImage,
      x,
      y,
      w,
      h,
      startTime: sk.millis(),
    });

    // Trigger flash effect
    flash = createFlashEffect(x, y, w, h);
  };

  const createFlashEffect = (x, y, w, h) => ({
    x,
    y,
    w,
    h,
    flashDuration: 500,
    flashStartTime: sk.millis(),
  });

  const strokeDash = (sk, dashPattern) => {
    sk.drawingContext.setLineDash(dashPattern);
  };

  // ---- WINDOW RESIZE HANDLER
  sk.windowResized = () => {
    sk.resizeCanvas(window.innerWidth, window.innerHeight);
    updateFeedDimensions(sk, camFeed);
  };
});
