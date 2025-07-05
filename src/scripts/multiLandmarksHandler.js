export const getLandmarks = (
  sketch,
  mediaPipe,
  camFeed,
  indices,
  numHands = null
) => {
  const mappedLandmarks = {};

  if (mediaPipe.landmarks.length > 0) {
    // Determine how many hands to process
    const handsToProcess = numHands
      ? Math.min(numHands, mediaPipe.landmarks.length)
      : mediaPipe.landmarks.length;

    for (let handIndex = 0; handIndex < handsToProcess; handIndex++) {
      const hand = mediaPipe.landmarks[handIndex];
      if (hand) {
        indices.forEach((index) => {
          if (hand[index]) {
            // Format based on number of hands requested
            let LMX, LMY;
            if (numHands === 1) {
              // Single hand: X8, Y8
              LMX = `X${index}`;
              LMY = `Y${index}`;
            } else {
              // Multiple hands: X8_hand0, Y8_hand0, X8_hand1, Y8_hand1
              LMX = `X${index}_hand${handIndex}`;
              LMY = `Y${index}_hand${handIndex}`;
            }

            mappedLandmarks[LMX] = sketch.map(
              hand[index].x,
              1,
              0,
              0,
              camFeed.scaledWidth
            );

            mappedLandmarks[LMY] = sketch.map(
              hand[index].y,
              0,
              1,
              0,
              camFeed.scaledHeight
            );
          }
        });
      }
    }
  }

  return mappedLandmarks;
};
