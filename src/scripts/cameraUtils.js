export function initializeWebcamCapture(sketch) {
  const webcamFeed = sketch.createCapture(
    {
      audio: false,
      video: { facingMode: "user" },
    },
    () => {
      adjustWebcamFeedDimensions(sketch, webcamFeed);
    }
  );
  webcamFeed.elt.setAttribute("playsinline", "");
  webcamFeed.hide();
  return webcamFeed;
}

function adjustWebcamFeedDimensions(sketch, webcamFeed) {
  const aspectRatio = webcamFeed.width / webcamFeed.height;
  const canvasAspectRatio = sketch.width / sketch.height;

  if (aspectRatio > canvasAspectRatio) {
    webcamFeed.scaledHeight = sketch.height;
    webcamFeed.scaledWidth = webcamFeed.scaledHeight * aspectRatio;
  } else {
    webcamFeed.scaledWidth = sketch.width;
    webcamFeed.scaledHeight = webcamFeed.scaledWidth / aspectRatio;
  }
}
