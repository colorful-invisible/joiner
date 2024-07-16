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

    let thumb1X = avgPos("t1X", landmarks.LM0_4X);
    let thumb1Y = avgPos("t1y", landmarks.LM0_4Y);
    let thumb2X = avgPos("t2X", landmarks.LM1_4X);
    let thumb2Y = avgPos("t2Y", landmarks.LM1_4Y);
    let index1X = avgPos("i1X", landmarks.LM0_8X);
    let index1Y = avgPos("i1Y", landmarks.LM0_8Y);
    let index2X = avgPos("i2X", landmarks.LM1_8X);
    let index2Y = avgPos("i2Y", landmarks.LM1_8Y);

    let centerTI1X = (thumb1X + index1X) / 2;
    let centerTI1Y = (thumb1Y + index1Y) / 2;
    let centerTI2X = (thumb2X + index2X) / 2;
    let centerTI2Y = (thumb2Y + index2Y) / 2;

    let distForSelection = Math.floor(
      sk.dist(centerTI1X, centerTI1Y, centerTI2X, centerTI2Y)
    );

    let distTI1 = Math.floor(sk.dist(thumb1X, thumb1Y, index1X, index1Y));
    let distTI2 = Math.floor(sk.dist(thumb2X, thumb2Y, index2X, index2Y));

    let distForClear1 = Math.floor(
      sk.dist(centerTI1X, centerTI1Y, 80, sk.height - 80)
    );
    let distForClear2 = Math.floor(
      sk.dist(centerTI2X, centerTI2Y, 80, sk.height - 80)
    );

    // SELECTION LOGIC
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

    // SNAPSHOT LOGIC
    let currentTime = sk.millis();
    for (let i = snapshots.length - 1; i >= 0; i--) {
      let { img, x, y, w, h, startTime } = snapshots[i];

      let opacity = 255;
      if (hasFade) {
        let elapsed = currentTime - startTime;
        opacity = sk.map(elapsed, 0, fadeDuration, 255, 0);
      }

      if (distForClear1 < 60 || distForClear2 < 60) {
        opacity = 0;
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
    if (isSelecting) {
      sk.push();
      sk.noFill();
      sk.stroke(255, 0, 0);
      sk.strokeWeight(2);
      strokeDash(sk, [5, 5]);

      let { x, y, w, h } = getSelectionBounds(
        centerTI1X,
        centerTI1Y,
        centerTI2X,
        centerTI2Y
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

    sk.push();
    sk.fill(255, 255, 255, 255);
    sk.noStroke();
    sk.ellipse(centerTI1X, centerTI1Y, 28);
    sk.ellipse(centerTI2X, centerTI2Y, 28);
    sk.pop();

    sk.push();
    sk.fill(0);
    sk.text("1", centerTI1X, centerTI1Y);
    sk.text("2", centerTI2X, centerTI2Y);
    sk.pop();

    // CLEAR AREA ELEMENT
    if (distForClear1 < 180 || distForClear2 < 180) {
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
    sk.background(255, 0, 0);
    sk.resizeCanvas(window.innerWidth, window.innerHeight);
    calculateVideoDimensions(sk, camFeed);
  };
});

function strokeDash(sk, list) {
  sk.drawingContext.setLineDash(list);
}
