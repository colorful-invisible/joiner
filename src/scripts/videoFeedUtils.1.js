// Version 2.1 - 03.07.2025 - Gesture Recognizer
export function initializeCamCapture(sk, gesturePipe) {
  console.log("Initializing camera capture...");

  const camFeed = sk.createCapture(
    {
      flipped: true,
      audio: false,
      video: {
        width: { ideal: 1920, min: 1280 },
        height: { ideal: 1080, min: 720 },
        frameRate: { ideal: 30, min: 15 },
      },
    },
    (stream) => {
      console.log("Camera stream started successfully");
      updateFeedDimensions(sk, camFeed, false);
      if (gesturePipe && gesturePipe.isInitialized) {
        gesturePipe.predictWebcam(camFeed);
      }
    }
  );

  // Add error handling
  camFeed.elt.addEventListener("loadeddata", () => {
    console.log(
      "Camera data loaded, dimensions:",
      camFeed.elt.videoWidth,
      "x",
      camFeed.elt.videoHeight
    );
  });

  camFeed.elt.addEventListener("error", (e) => {
    console.error("Camera error:", e);
  });

  camFeed.elt.addEventListener("canplay", () => {
    console.log("Camera ready to play");
    // Start MediaPipe prediction once camera is ready
    if (gesturePipe && gesturePipe.isInitialized) {
      gesturePipe.predictWebcam(camFeed);
    }
  });

  camFeed.elt.setAttribute("playsinline", "");
  camFeed.hide();
  return camFeed;
}

export function updateFeedDimensions(sk, feed, fitToHeight = false) {
  if (!feed) return;

  const canvasRatio = sk.width / sk.height;
  const videoRatio = feed.width / feed.height;

  let x = 0;
  let y = 0;
  let w = sk.width;
  let h = sk.height;

  if (canvasRatio > videoRatio) {
    if (fitToHeight) {
      w = sk.height * videoRatio;
      x = (sk.width - w) / 2;
    } else {
      h = sk.width / videoRatio;
      y = (sk.height - h) / 2;
    }
  } else {
    w = sk.height * videoRatio;
    x = (sk.width - w) / 2;
  }

  feed.scaledWidth = w;
  feed.scaledHeight = h;
  feed.x = x;
  feed.y = y;
}
