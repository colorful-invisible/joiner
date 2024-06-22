import p5 from "p5";
import { mediaPipe } from "./handsModelMediaPipe";
import { initializeCamCapture } from "./cameraUtils";
import { getMappedLandmarks } from "./landmarksHandler";
import { averageLandmarkPosition } from "./utils";

new p5((sk) => {
  let camFeed;
  let selections = [];
  let isSelecting = false;
  //
  const fadeDuration = 1000;
  const delayInSeconds = 20;
  const delay = delayInSeconds * 1000;
  //
  const avgPos = averageLandmarkPosition(4);

  sk.setup = () => {
    sk.createCanvas(sk.windowWidth, sk.windowHeight);
    sk.background(0, 0, 255);
    sk.textSize(20);
    sk.textAlign(sk.CENTER, sk.CENTER);

    camFeed = initializeCamCapture(sk, mediaPipe);
  };

  sk.draw = () => {
    sk.push();
    sk.scale(-1, 1);
    sk.image(
      camFeed,
      -camFeed.scaledWidth,
      0,
      camFeed.scaledWidth,
      camFeed.scaledHeight
    );
    sk.pop();

    // GET LANDMARKS
    const landmarksIndex = [4, 8];
    const landmarks = getMappedLandmarks(
      sk,
      mediaPipe,
      camFeed,
      landmarksIndex
    );

    const thumb1X = avgPos("t1X", landmarks.LM0_4X);
    const thumb1Y = avgPos("t1y", landmarks.LM0_4Y);
    const thumb2X = avgPos("t2X", landmarks.LM1_4X);
    const thumb2Y = avgPos("t2Y", landmarks.LM1_4Y);
    const index1X = avgPos("i1X", landmarks.LM0_8X);
    const index1Y = avgPos("i1Y", landmarks.LM0_8Y);
    const index2X = avgPos("i2X", landmarks.LM1_8X);
    const index2Y = avgPos("i2Y", landmarks.LM1_8Y);

    const centerTI1X = (thumb1X + index1X) / 2;
    const centerTI1Y = (thumb1Y + index1Y) / 2;
    const centerTI2X = (thumb2X + index2X) / 2;
    const centerTI2Y = (thumb2Y + index2Y) / 2;

    let distForSelection = Math.floor(
      sk.dist(centerTI1X, centerTI1Y, centerTI2X, centerTI2Y)
    );

    let distTI1 = Math.floor(sk.dist(thumb1X, thumb1Y, index1X, index1Y));
    let distTI2 = Math.floor(sk.dist(thumb2X, thumb2Y, index2X, index2Y));

    // Handle selection logic based on distance
    if (
      distForSelection < 60 &&
      distTI1 < 60 &&
      distTI2 < 60 &&
      60 &&
      !isSelecting
    ) {
      isSelecting = true;
    } else if (distTI1 > 60 && distTI2 > 40 && isSelecting) {
      isSelecting = false;
      let { x, y, w, h } = getSelectionBounds(
        centerTI1X,
        centerTI1Y,
        centerTI2X,
        centerTI2Y
      );
      captureSelection(x, y, w, h);
    }

    const distForClear1 = Math.floor(
      sk.dist(centerTI1X, centerTI1Y, sk.width, sk.height)
    );
    const distForClear2 = Math.floor(
      sk.dist(centerTI2X, centerTI2Y, sk.width, sk.height)
    );

    let currentTime = sk.millis();
    for (let i = selections.length - 1; i >= 0; i--) {
      let { img, x, y, w, h, startTime } = selections[i];
      let elapsed = currentTime - startTime;
      let opacity = sk.map(elapsed, 0, fadeDuration, 255, 0);

      if (distForClear1 < 100 || distForClear2 < 100) {
        opacity = 0;
      }

      if (opacity <= 0) {
        selections.splice(i, 1);
      } else {
        sk.push();
        sk.tint(255, 240, 240, opacity);
        sk.image(img, x, y, w, h);
        sk.pop();
      }
    }

    // Draw selection rectangle
    if (isSelecting) {
      sk.push();
      sk.noFill();
      sk.stroke(255, 0, 0);
      sk.strokeWeight(4);
      let { x, y, w, h } = getSelectionBounds(
        centerTI1X,
        centerTI1Y,
        centerTI2X,
        centerTI2Y
      );
      sk.rect(x, y, w, h);
      sk.pop();
    }

    sk.push();
    sk.fill(255, 255, 255, 255);
    sk.noStroke();
    sk.ellipse(centerTI1X, centerTI1Y, 24);
    sk.ellipse(centerTI2X, centerTI2Y, 24);
    sk.pop();

    sk.push();
    sk.fill(0);
    sk.text("1", centerTI1X, centerTI1Y);
    sk.text("2", centerTI2X, centerTI2Y);
    sk.text(`Selection: ${distForSelection}`, 20, 20);
    sk.pop();
  };

  const getSelectionBounds = (startX, startY, endX, endY) => {
    let x = Math.min(startX, endX);
    let y = Math.min(startY, endY);
    let w = Math.abs(startX - endX);
    let h = Math.abs(startY - endY);
    return { x, y, w, h };
  };

  const captureSelection = (x, y, w, h) => {
    let videoX = (camFeed.width / camFeed.scaledWidth) * (sk.width - x - w);
    let videoY = (camFeed.height / camFeed.scaledHeight) * y;
    let videoW = (camFeed.width / camFeed.scaledWidth) * w;
    let videoH = (camFeed.height / camFeed.scaledHeight) * h;

    let selectedImage = sk.createGraphics(w, h);
    selectedImage.push();
    selectedImage.scale(-1, 1);
    selectedImage.translate(-w, 0);
    selectedImage.copy(camFeed, videoX, videoY, videoW, videoH, 0, 0, w, h);
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
    if (camFeed) {
      camFeed = initializeCamCapture(sk, mediaPipe);
    }
  });
});
