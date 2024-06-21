import p5 from "p5";
import { initializeWebcamCapture } from "./cameraUtils";

new p5((sk) => {
  let webcamFeed;
  let selections = [];
  let selectionStart = null;
  let isSelecting = false;

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

    // Draw the selection rectangle only when selecting
    if (isSelecting && selectionStart) {
      sk.push();
      sk.noFill();
      sk.stroke(255, 0, 0);
      sk.rect(
        selectionStart.x,
        selectionStart.y,
        sk.mouseX - selectionStart.x,
        sk.mouseY - selectionStart.y
      );
      sk.pop();
    }

    // Draw the stored selections
    selections.forEach(({ img, x, y, w, h }) => {
      sk.image(img, x, y, w, h);
    });
  };

  sk.mousePressed = () => {
    selectionStart = sk.createVector(sk.mouseX, sk.mouseY);
    isSelecting = true;
  };

  sk.mouseReleased = () => {
    if (selectionStart) {
      let selectionEnd = sk.createVector(sk.mouseX, sk.mouseY);
      isSelecting = false;

      let x = Math.min(selectionStart.x, selectionEnd.x);
      let y = Math.min(selectionStart.y, selectionEnd.y);
      let w = Math.abs(selectionStart.x - selectionEnd.x);
      let h = Math.abs(selectionStart.y - selectionEnd.y);

      // Capture the selected area directly from the canvas
      let selectedImage = sk.get(x, y, w, h);

      // Store the selected area in the selections array
      selections.push({ img: selectedImage, x, y, w, h });

      selectionStart = null;
    }
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
