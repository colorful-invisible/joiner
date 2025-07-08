// Creates a pulsing effect based on sine wave
// sk: p5 instance, min: minimum value, max: maximum value, time: duration of one pulse cycle

const pulse = (sk, min, max, time) => {
  const mid = (min + max) / 2;
  const amplitude = (max - min) / 2;
  return amplitude * sk.sin(sk.frameCount * (sk.TWO_PI / time)) + mid;
};

// Creates an average position calculator
// Usage: const avg = createAveragePosition(4);
// avg("key", landmarkInput);
// const myLandmark = avg("x8_hand1", LM.X8_hand0);

const createAveragePosition = (size = 3) => {
  const queues = {};
  return (key, value) => {
    if (value == null) return value;
    if (!queues[key]) queues[key] = [];
    const queue = queues[key];
    queue.push(value);
    if (queue.length > size) queue.shift();
    return queue.reduce((a, b) => a + b, 0) / queue.length;
  };
};

// Creates title screen with configurable display and fade durations
// Usage: const titleScreen = createTitleScreen("My Game", 3000, 1500, font);
const createTitleScreen = (
  title = "CHRONOTOPE",
  displayDuration = 2000,
  fadeDuration = 500,
  font = null
) => {
  let startTime = null,
    phase = "waiting",
    experienceWasReady = false;

  const renderTitle = (sk, opacity = 255) => {
    sk.push();
    sk.fill(255, opacity);
    sk.textAlign(sk.CENTER, sk.CENTER);
    sk.textSize(32);
    if (font) sk.textFont(font);
    sk.text(title, sk.width / 2, sk.height / 2);
    sk.pop();
  };

  return {
    update: (sk, isExperienceReady = true) => {
      if (startTime === null) startTime = sk.millis();
      const currentTime = sk.millis();
      let elapsed = currentTime - startTime;

      if (isExperienceReady) experienceWasReady = true;

      switch (phase) {
        case "waiting":
          if (experienceWasReady) {
            phase = "displaying";
            startTime = currentTime;
            elapsed = 0;
          }
          break;
        case "displaying":
          if (elapsed >= displayDuration) {
            phase = "fading";
            startTime = currentTime;
            elapsed = 0;
          }
          break;
        case "fading":
          if (elapsed >= fadeDuration) phase = "complete";
          break;
      }

      if (phase === "waiting" || phase === "displaying") {
        renderTitle(sk);
      } else if (phase === "fading") {
        renderTitle(sk, sk.map(elapsed, 0, fadeDuration, 255, 0));
      }

      return phase === "complete";
    },
    reset: () => (
      (startTime = null), (phase = "waiting"), (experienceWasReady = false)
    ),
    isComplete: () => phase === "complete",
    getCurrentPhase: () => phase,
  };
};

export { createAveragePosition, createTitleScreen };
