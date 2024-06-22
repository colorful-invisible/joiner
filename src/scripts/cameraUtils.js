export function initializeCamCapture(sketch, mediaPipeHandler) {
  const camFeed = sketch.createCapture(
    {
      audio: false,
      video: { facingMode: "user" },
    },
    (stream) => {
      console.log(stream.getTracks()[0].getSettings());
      adjustCamFeedDimensions(sketch, camFeed);
      mediaPipeHandler.predictWebcam(camFeed); // Assuming a prediction handling function
    }
  );
  camFeed.elt.setAttribute("playsinline", "");
  camFeed.hide();
  return camFeed;
}

function adjustCamFeedDimensions(sketch, camFeed) {
  const aspectRatio = camFeed.width / camFeed.height;
  const canvasAspectRatio = sketch.width / sketch.height;

  if (aspectRatio > canvasAspectRatio) {
    camFeed.scaledHeight = sketch.height;
    camFeed.scaledWidth = camFeed.scaledHeight * aspectRatio;
  } else {
    camFeed.scaledWidth = sketch.width;
    camFeed.scaledHeight = camFeed.scaledWidth / aspectRatio;
  }
}
