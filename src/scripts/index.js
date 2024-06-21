import p5 from "p5";
import { initializeWebcamCapture } from "./cameraUtils";

new p5((sk) => {
  let webcamFeed;
  let selections = [];
  let selectionStart = null;
  let isSelecting = false;
  const fadeDuration = 1000;
  const delay = 20000;

  sk.setup = () => {
    sk.createCanvas(sk.windowWidth, sk.windowHeight);
    sk.background(0, 0, 255);
    webcamFeed = initializeWebcamCapture(sk);
  };

  sk.draw = () => {
    sk.push();
    sk.scale(-1, 1);
    sk.image(
      webcamFeed,
      -webcamFeed.scaledWidth,
      0,
      webcamFeed.scaledWidth,
      webcamFeed.scaledHeight
    );
    sk.pop();

    // Draw the stored selections with fade-out effect
    let currentTime = sk.millis();
    for (let i = selections.length - 1; i >= 0; i--) {
      // for (let i = 0; i < selections.length; i++) {
      let { img, x, y, w, h, startTime } = selections[i];
      let elapsed = currentTime - startTime;
      let opacity = sk.map(elapsed, 0, fadeDuration, 255, 0); // Fade from full opacity to zero

      if (opacity <= 0) {
        // Remove the selection if it's fully transparent
        selections.splice(i, 1);
      } else {
        sk.push();
        sk.tint(255, opacity); // Apply the opacity
        sk.image(img, x, y, w, h);
        sk.pop();
      }
    }

    // Draw selection rectangle
    if (isSelecting && selectionStart) {
      sk.push();
      sk.noFill();
      sk.stroke(255, 0, 0);
      sk.strokeWeight(4);
      let { x, y, w, h } = getSelectionBounds(sk.mouseX, sk.mouseY);
      sk.rect(x, y, w, h);
      sk.pop();
    }
  };

  sk.mousePressed = () => {
    selectionStart = sk.createVector(sk.mouseX, sk.mouseY);
    isSelecting = true;
  };

  sk.mouseReleased = () => {
    if (isSelecting) {
      isSelecting = false;
      let { x, y, w, h } = getSelectionBounds(sk.mouseX, sk.mouseY);
      captureSelection(x, y, w, h);
      selectionStart = null;
    }
  };

  const getSelectionBounds = (mouseX, mouseY) => {
    let centerX = selectionStart.x;
    let centerY = selectionStart.y;
    let halfWidth = Math.abs(mouseX - centerX);
    let halfHeight = Math.abs(mouseY - centerY);
    return {
      x: centerX - halfWidth,
      y: centerY - halfHeight,
      w: 2 * halfWidth,
      h: 2 * halfHeight,
    };
  };

  const captureSelection = (x, y, w, h) => {
    let videoX =
      (webcamFeed.width / webcamFeed.scaledWidth) * (sk.width - x - w);
    let videoY = (webcamFeed.height / webcamFeed.scaledHeight) * y;
    let videoW = (webcamFeed.width / webcamFeed.scaledWidth) * w;
    let videoH = (webcamFeed.height / webcamFeed.scaledHeight) * h;

    let selectedImage = sk.createGraphics(w, h);
    selectedImage.push();
    selectedImage.scale(-1, 1);
    selectedImage.translate(-w, 0);
    selectedImage.copy(webcamFeed, videoX, videoY, videoW, videoH, 0, 0, w, h);
    selectedImage.pop();

    selections.push({
      img: selectedImage,
      x,
      y,
      w,
      h,
      startTime: sk.millis() + delay,
    });
  };

  // RESIZE CANVAS WHEN WINDOW IS RESIZED
  window.addEventListener("resize", () => {
    sk.resizeCanvas(window.innerWidth, window.innerHeight);
    sk.background(0, 255, 255);
    if (webcamFeed) {
      webcamFeed = initializeWebcamCapture(sk);
    }
  });
});
