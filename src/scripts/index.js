import p5 from "p5";
import { initializeWebcamCapture } from "./cameraUtils";

new p5((sk) => {
  let webcamFeed;
  let selections = [];
  let selectionStart = null; // This will be the center of the selection
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

      // Calculate the coordinates and dimensions from the center to the border
      let centerX = selectionStart.x;
      let centerY = selectionStart.y;
      let edgeX = sk.mouseX;
      let edgeY = sk.mouseY;

      let halfWidth = Math.abs(edgeX - centerX);
      let halfHeight = Math.abs(edgeY - centerY);

      // Adjust the rectangle to start from center and expand outwards
      let rectX = centerX - halfWidth - 1;
      let rectY = centerY - halfHeight - 1;
      let rectWidth = 2 * halfWidth + 2;
      let rectHeight = 2 * halfHeight + 2;

      sk.rect(rectX, rectY, rectWidth, rectHeight);
      sk.pop();
    }

    // Draw the stored selections
    selections.forEach(({ img, x, y, w, h }) => {
      sk.image(img, x, y, w, h);
    });
  };

  sk.mousePressed = () => {
    selectionStart = sk.createVector(sk.mouseX, sk.mouseY); // Center point of the selection
    isSelecting = true;
  };

  sk.mouseReleased = () => {
    if (selectionStart) {
      isSelecting = false;

      let centerX = selectionStart.x;
      let centerY = selectionStart.y;
      let edgeX = sk.mouseX;
      let edgeY = sk.mouseY;

      let halfWidth = Math.abs(edgeX - centerX);
      let halfHeight = Math.abs(edgeY - centerY);

      // Calculate the top-left corner from the center for capturing
      let x = centerX - halfWidth;
      let y = centerY - halfHeight;
      let w = 2 * halfWidth;
      let h = 2 * halfHeight;

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

// REFERENCE:https://www.hockney.com/works/photos/photographic-collages
