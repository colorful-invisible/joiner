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
        frameRate: { ideal: 30, min: 24 },
      },
    },
    (stream) => {
      console.log("Camera initialized:", stream.getTracks()[0].getSettings());

      // Wait for video to be ready before setting dimensions
      const waitForVideo = () => {
        if (camFeed.width > 0 && camFeed.height > 0) {
          console.log(
            "Video dimensions available:",
            camFeed.width,
            "x",
            camFeed.height
          );
          updateFeedDimensions(sk, camFeed, false);
        } else {
          console.log("Waiting for video dimensions...");
          setTimeout(waitForVideo, 100);
        }
      };
      waitForVideo();

      // Wait for gesture recognizer to be ready before starting prediction
      const startPrediction = () => {
        if (gesturePipe.isInitialized) {
          console.log("Starting gesture prediction...");
          gesturePipe.predict(camFeed);
        } else {
          console.log("Waiting for gesture recognizer...");
          setTimeout(startPrediction, 100);
        }
      };
      startPrediction();
    }
  );

  camFeed.elt.setAttribute("playsinline", "");
  camFeed.hide(); // Hide the HTML video element, we'll draw it manually

  return camFeed;
}

export function updateFeedDimensions(sk, feed, fitToHeight = false) {
  if (!feed) {
    console.log("No feed provided to updateFeedDimensions");
    return;
  }

  console.log("Updating feed dimensions:", {
    feedWidth: feed.width,
    feedHeight: feed.height,
    canvasWidth: sk.width,
    canvasHeight: sk.height,
  });

  const canvasRatio = sk.width / sk.height;
  const videoRatio = feed.width / feed.height;

  let x = 0,
    y = 0,
    w = sk.width,
    h = sk.height;

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

  console.log("Feed dimensions set to:", {
    x: feed.x,
    y: feed.y,
    scaledWidth: feed.scaledWidth,
    scaledHeight: feed.scaledHeight,
  });
}
