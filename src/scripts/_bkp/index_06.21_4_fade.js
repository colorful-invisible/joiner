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

    // Draw the selection rectangle only when selecting
    if (isSelecting && selectionStart) {
      sk.push();
      sk.noFill();
      sk.stroke(255, 0, 0);
      sk.strokeWeight(2);

      // Calculate the coordinates and dimensions from the center to the border
      let centerX = selectionStart.x;
      let centerY = selectionStart.y;
      let edgeX = sk.mouseX;
      let edgeY = sk.mouseY;

      let halfWidth = Math.abs(edgeX - centerX);
      let halfHeight = Math.abs(edgeY - centerY);

      // Adjust the rectangle to start from center and expand outwards
      let rectX = centerX - halfWidth;
      let rectY = centerY - halfHeight;
      let rectWidth = 2 * halfWidth;
      let rectHeight = 2 * halfHeight;

      sk.rect(rectX, rectY, rectWidth, rectHeight);
      sk.pop();
    }
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

      // Convert canvas coordinates to video feed coordinates
      let videoX =
        (webcamFeed.width / webcamFeed.scaledWidth) * (sk.width - x - w);
      let videoY = (webcamFeed.height / webcamFeed.scaledHeight) * y;
      let videoW = (webcamFeed.width / webcamFeed.scaledWidth) * w;
      let videoH = (webcamFeed.height / webcamFeed.scaledHeight) * h;

      // Create a new graphics buffer and copy the selected area from the webcam feed
      let selectedImage = sk.createGraphics(w, h);
      selectedImage.push();
      selectedImage.scale(-1, 1); // Flip horizontally
      selectedImage.translate(-w, 0); // Adjust the position after flipping
      selectedImage.copy(
        webcamFeed,
        videoX,
        videoY,
        videoW,
        videoH,
        0,
        0,
        w,
        h
      );
      selectedImage.pop();

      // Store the selected area in the selections array with the current time and initial opacity
      selections.push({
        img: selectedImage,
        x,
        y,
        w,
        h,
        startTime: sk.millis() + delay,
      });

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
