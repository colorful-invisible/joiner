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
      -webcamFeed.width,
      0,
      webcamFeed.width,
      webcamFeed.height
    );
    sk.pop();

    // Draw selections with fade-out effect
    let currentTime = sk.millis();
    selections = selections.filter(({ startTime, img, x, y, w, h }) => {
      let elapsed = currentTime - startTime;
      let opacity = sk.map(elapsed, 0, fadeDuration, 255, 0);

      if (opacity > 0) {
        sk.push();
        sk.tint(255, opacity);
        sk.image(img, x, y, w, h);
        sk.pop();
        return true;
      }
      return false;
    });

    // Draw selection rectangle
    if (isSelecting && selectionStart) {
      sk.push();
      sk.noFill();
      sk.stroke(255, 0, 0);
      sk.strokeWeight(2);
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

  window.addEventListener("resize", () => {
    sk.resizeCanvas(window.innerWidth, window.innerHeight);
    sk.background(0, 255, 255);
    if (webcamFeed) {
      webcamFeed = initializeWebcamCapture(sk);
    }
  });
});
