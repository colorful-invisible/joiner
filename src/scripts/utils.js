// ---- SINOIDAL PULSE
// -------------------
function pulse(sk, min, max, time) {
  const mid = (min + max) / 2;
  const amplitude = (max - min) / 2;
  return amplitude * sk.sin(sk.frameCount * (sk.TWO_PI / time)) + mid;
}

// ---- SIMPLE AVERAGE POSITION
// ----------------------------
// This function creates a simple average position function that maintains a queue of values for each key.
// Usage: const avg = createAveragePosition(4);
// avg(key, value)
// Example: let X22 = avg("x22", LM.X22);

function createAveragePosition(size = 3) {
  let queues = {};

  return (key, value) => {
    if (value === undefined || value === null) return value;

    if (!queues[key]) {
      queues[key] = [];
    }

    let queue = queues[key];
    queue.push(value);
    if (queue.length > size) {
      queue.shift();
    }

    // Calculate average
    let sum = queue.reduce((a, b) => a + b, 0);
    return sum / queue.length;
  };
}

// ---- TITLE SCREEN WITH FADE
// ---------------------------
// Creates a title screen that displays for a configurable time, then fades out
// Usage: const titleScreen = createTitleScreen("CHRONOTOPE", 2000, 1000);
// In draw(): const showExperience = titleScreen.update(sk, isExperienceReady);

function createTitleScreen(
  title = "CHRONOTOPE",
  displayDuration = 2000,
  fadeDuration = 1000
) {
  let startTime = null;
  let phase = "waiting"; // "waiting", "displaying", "fading", "complete"
  let experienceWasReady = false;

  return {
    update: (sk, isExperienceReady = true) => {
      // Initialize start time on first call
      if (startTime === null) {
        startTime = sk.millis();
      }

      const currentTime = sk.millis();
      const elapsed = currentTime - startTime;

      // Track if experience has ever been ready
      if (isExperienceReady) {
        experienceWasReady = true;
      }

      // State machine for title screen phases
      switch (phase) {
        case "waiting":
          // Wait for experience to be ready
          if (experienceWasReady) {
            phase = "displaying";
            startTime = currentTime; // Reset timer for display phase
          }
          break;

        case "displaying":
          // Display title for the specified duration
          if (elapsed >= displayDuration) {
            phase = "fading";
            startTime = currentTime; // Reset timer for fade phase
          }
          break;

        case "fading":
          // Fade out over the specified duration
          if (elapsed >= fadeDuration) {
            phase = "complete";
          }
          break;

        case "complete":
          // Title sequence is finished
          break;
      }

      // Render the title based on current phase
      if (phase === "waiting" || phase === "displaying") {
        sk.push();
        sk.fill(255);
        sk.textAlign(sk.CENTER, sk.CENTER);
        sk.textSize(48);
        sk.text(title, sk.width / 2, sk.height / 2);

        sk.pop();
      } else if (phase === "fading") {
        const fadeProgress = elapsed / fadeDuration;
        const opacity = sk.map(fadeProgress, 0, 1, 255, 0);

        sk.push();
        sk.fill(255, opacity);
        sk.textAlign(sk.CENTER, sk.CENTER);
        sk.textSize(48);
        sk.text(title, sk.width / 2, sk.height / 2);
        sk.pop();
      }

      // Return true when experience should be shown
      return phase === "complete";
    },

    reset: () => {
      startTime = null;
      phase = "waiting";
      experienceWasReady = false;
    },

    isComplete: () => phase === "complete",
    getCurrentPhase: () => phase,
  };
}

export { createAveragePosition, createTitleScreen };
