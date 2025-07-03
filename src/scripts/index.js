import p5 from "p5";
import { gesturePipe } from "./gestureRecognizer";
import { initializeCamCapture, updateFeedDimensions } from "./videoFeedUtils";

new p5((sk) => {
  let camFeed;
  let snapshots = [];
  let isSelecting = false;
  let flash = null;

  let hasFade = true;
  const fadeDuration = 1000;
  const delay = 20000;

  let selectionStart = null;
  let selectionEnd = null;
  let lastValidHandPos = null;

  sk.setup = () => {
    sk.createCanvas(sk.windowWidth, sk.windowHeight);
    sk.background(0);
    sk.textSize(20);
    sk.textAlign(sk.CENTER, sk.CENTER);
    camFeed = initializeCamCapture(sk, gesturePipe);
  };

  sk.draw = () => {
    try {
      sk.image(
        camFeed,
        camFeed.x,
        camFeed.y,
        camFeed.scaledWidth,
        camFeed.scaledHeight
      );

      const hand = gesturePipe.results.landmarks?.[0];
      if (!hand) return;

      const cx = sk.map(hand[0].x, 1, 0, 0, camFeed.scaledWidth);
      const cy = sk.map(hand[0].y, 0, 1, 0, camFeed.scaledHeight);
      lastValidHandPos = { x: cx, y: cy };

      const gestures = gesturePipe.results.gestures?.[0];
      const label = gestures?.[0]?.categoryName || "None";

      const isFist = label === "Closed_Fist";
      const isOpen = label === "Open_Palm";

      if (isFist && !isSelecting) {
        isSelecting = true;
        selectionStart = { ...lastValidHandPos };
      } else if (isSelecting && isOpen) {
        isSelecting = false;
        let { x, y, w, h } = getSelectionBounds(
          selectionStart.x,
          selectionStart.y,
          lastValidHandPos.x,
          lastValidHandPos.y
        );
        captureSelection(x, y, w, h);
        selectionStart = null;
        selectionEnd = null;
      } else if (isSelecting) {
        selectionEnd = { ...lastValidHandPos };
      }

      if (isSelecting && selectionStart && selectionEnd) {
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
      }

      let currentTime = sk.millis();
      for (let i = snapshots.length - 1; i >= 0; i--) {
        let { img, x, y, w, h, startTime } = snapshots[i];
        let opacity = hasFade
          ? sk.map(currentTime - startTime, 0, fadeDuration, 255, 0)
          : 255;
        if (opacity <= 0) snapshots.splice(i, 1);
        else {
          sk.push();
          sk.tint(255, opacity);
          sk.image(img, x, y, w, h);
          sk.pop();
        }
      }

      if (flash) {
        let elapsed = sk.millis() - flash.flashStartTime;
        if (elapsed < flash.flashDuration) {
          let opacity = sk.map(
            elapsed,
            0,
            flash.flashDuration,
            flash.flashOpacity,
            0
          );
          sk.fill(255, opacity);
          sk.noStroke();
          sk.rect(flash.x, flash.y, flash.w, flash.h);
        } else flash = null;
      }

      if (lastValidHandPos) {
        sk.fill(255);
        sk.noStroke();
        sk.ellipse(lastValidHandPos.x, lastValidHandPos.y, 28);
        sk.text(label, lastValidHandPos.x, lastValidHandPos.y);
      }
    } catch (err) {
      console.error("Draw loop error:", err);
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
    selectedImage.copy(camFeed, videoX, videoY, videoW, videoH, 0, 0, w, h);

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

  const flashFeedback = (x, y, w, h) => ({
    x,
    y,
    w,
    h,
    flashDuration: 500,
    flashStartTime: sk.millis(),
    flashOpacity: 124,
  });

  sk.windowResized = () => {
    sk.resizeCanvas(window.innerWidth, window.innerHeight);
    updateFeedDimensions(sk, camFeed);
  };
});

function strokeDash(sk, list) {
  sk.drawingContext.setLineDash(list);
}
