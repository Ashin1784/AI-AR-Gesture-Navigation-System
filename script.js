/*********************************
 * GLOBAL STATE
 *********************************/
let isMarkerActive = false;
let isNavigationActive = false;
let currentMode = "navigation"; // default

const canvas = document.getElementById("gestureCanvas");
const ctx = canvas.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

window.addEventListener("resize", () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
});

/*********************************
 * MEDIAPIPE HANDS SETUP
 *********************************/
const hands = new Hands({
  locateFile: (file) =>
    `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
});

hands.setOptions({
  maxNumHands: 1,
  modelComplexity: 1,
  minDetectionConfidence: 0.85,   // increase from 0.7
  minTrackingConfidence: 0.85     // increase from 0.7
});

hands.onResults((results) => {

  if (currentMode !== "gesture") {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!results.multiHandLandmarks) return;

  for (const landmarks of results.multiHandLandmarks) {

    // ✅ Bounding box validation
    const xs = landmarks.map(p => p.x);
    const ys = landmarks.map(p => p.y);

    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);

    if (width < 0.1 || height < 0.1) {
      continue;   // skip noise
    }

    // ✅ Draw connections
    drawConnectors(ctx, landmarks, HAND_CONNECTIONS, {
      color: "#00FF00",
      lineWidth: 3
    });

    // ✅ Draw points
    drawLandmarks(ctx, landmarks, {
      color: "#FF0000",
      lineWidth: 2
    });

    const gesture = recognizeGesture(landmarks);

    ctx.fillStyle = "lime";
    ctx.font = "30px Arial";
    ctx.fillText(`Gesture: ${gesture}`, 20, 50);

    handleGestureSpeech(gesture);
  }
});
function recognizeGesture(lm) {

  const palm = lm[0];
  const tips = [4, 8, 12, 16, 20].map(i => lm[i]);

  const extended = tips.map(t =>
    Math.hypot(t.x - palm.x, t.y - palm.y) > 0.25
  );

  if (extended[0] && !extended.slice(1).some(Boolean)) return "YES";
  if (extended.slice(1).every(Boolean)) return "HELLO";
  if (!extended.some(Boolean)) return "STOP";
  if (extended[1] && !extended[2]) return "ONE";
  if (extended[1] && extended[2]) return "TWO";

  return "UNKNOWN";
}
let lastGesture = "";
let lastGestureTime = 0;
const GESTURE_DELAY = 2000;

function handleGestureSpeech(gesture) {

  const now = Date.now();

  if (
    gesture !== "UNKNOWN" &&
    gesture !== lastGesture &&
    now - lastGestureTime > GESTURE_DELAY
  ) {
    speechSynthesis.cancel();

    const utter = new SpeechSynthesisUtterance(gesture);
    utter.lang = "en-IN";
    speechSynthesis.speak(utter);

    lastGesture = gesture;
    lastGestureTime = now;
  }
}
function switchMode(mode) {

  currentMode = mode;

  isNavigationActive = false;

  document.getElementById("navigationDisplay").innerText =
    "Navigation instructions will appear here...";
  document.getElementById("extractedText").innerText =
    "Extracted text will appear here...";

  if (mode === "gesture") {
  }

  console.log("Switched to mode:", mode);
}
const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

let recognition = null;

/*********************************
 * ROUTES
 *********************************/
const indoorRoutes = {
  Entrance_to_Casualty: [
    "Go straight for ten meters",
    "Turn right",
    "You have reached the casualty ward",
  ],
  Entrance_to_ICU: [
    "Go straight for fifteen meters",
    "Turn left",
    "You have reached the ICU",
  ],
  Entrance_to_Pharmacy: [
    "Go straight for eight meters",
    "Turn right",
    "You have reached the pharmacy",
  ],
};

/*********************************
 * VOICE NAVIGATION
 *********************************/
function startVoiceNavigation() {

  if (!SpeechRecognition) {
    alert("Speech recognition not supported");
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = "en-IN";
  recognition.continuous = true;      // 🔥 important
  recognition.interimResults = false;

  document.getElementById("voiceStatus").innerText = "Listening...";

  let finalTranscript = "";

  recognition.onresult = function(event) {

    finalTranscript = event.results[event.results.length - 1][0].transcript
      .toLowerCase()
      .trim();

    document.getElementById("voiceStatus").innerText =
      "Heard: " + finalTranscript;
  };

  recognition.onend = function() {

    if (finalTranscript.length > 0) {
      console.log("FINAL COMMAND:", finalTranscript);
      handleNavigationCommand(finalTranscript);
    }

    recognition.stop();
  };

  recognition.start();

  // Auto stop after 4 seconds (so user can finish sentence)
  setTimeout(() => {
    recognition.stop();
  }, 4000);
}
/*********************************
 * HANDLE NAVIGATION COMMAND
 *********************************/
function handleNavigationCommand(cmd) {

  cmd = cmd.toLowerCase().trim();

  // CASUALTY
  if (
    cmd.includes("casualty") ||
    cmd.includes("casual") ||
    cmd.includes("cash")
  ) {
    startIndoorNavigation("Entrance_to_Casualty");
    return;
  }

  // ICU
  if (cmd.includes("icu")) {
    startIndoorNavigation("Entrance_to_ICU");
    return;
  }

  // PHARMACY
  if (
    cmd.includes("pharmacy") ||
    cmd.includes("medical") ||
    cmd.includes("medicine")
  ) {
    startIndoorNavigation("Entrance_to_Pharmacy");
    return;
  }

  speechSynthesis.cancel();
  speechSynthesis.speak(
    new SpeechSynthesisUtterance(
      "Please say navigate to casualty, ICU, or pharmacy"
    )
  );
}

/*********************************
 * NAVIGATION ENGINE
 *********************************/
/*********************************
 * NAVIGATION ENGINE
 *********************************/
let navigationTimeouts = [];

function startIndoorNavigation(key) {
  if (isNavigationActive) return; 
  isNavigationActive = true;

  const route = indoorRoutes[key];
  const display = document.getElementById("navigationDisplay");

  if (!route) {
    isNavigationActive = false;
    return;
  }

  // Clear previous state
  speechSynthesis.cancel();
  navigationTimeouts.forEach(t => clearTimeout(t));
  navigationTimeouts = [];

  display.innerText = "Starting navigation...";

  route.forEach((step, i) => {
    const timeout = setTimeout(() => {
      // 1. Update the sidebar text
      display.innerText = step;

      // 2. TRIGGER THE AR ROTATION
      updateARVisuals(step); 

      // 3. Voice Output
      const utter = new SpeechSynthesisUtterance(step);
      utter.lang = "en-IN";
      utter.onend = () => {
        if (i === route.length - 1) {
          isNavigationActive = false;
        }
      };
      speechSynthesis.speak(utter);

    }, i * 3500);

    navigationTimeouts.push(timeout);
  });
}

/*********************************
 * AR VISUAL LOGIC (MOVE TO BOTTOM)
 *********************************/
function updateARVisuals(stepText) {
  // Use IDs to match your HTML exactly
  const hud = document.getElementById("arHUD") || document.querySelector(".ar-direction-overlay");
  const arrow = document.getElementById("arArrow") || document.querySelector(".ar-arrow");
  const label = document.getElementById("ar-instruction");
  
  if (!hud || !arrow) return;

  const text = stepText.toLowerCase();

  // Make sure it is visible
  hud.style.display = "block";
  hud.style.opacity = "1";

  // Reset Arrow to default
  arrow.innerHTML = "↑";
  arrow.style.color = "#00f2ff";

  // Rotation Logic
  if (text.includes("right")) {
    arrow.style.transform = "rotate(90deg)";
    if(label) label.innerText = "Turn Right";
  } 
  else if (text.includes("left")) {
    arrow.style.transform = "rotate(-90deg)";
    if(label) label.innerText = "Turn Left";
  } 
  else if (text.includes("straight") || text.includes("meters")) {
    arrow.style.transform = "rotate(0deg)";
    if(label) label.innerText = "Go Straight";
  } 
  
  // REACHED STATE
  if (text.includes("reached") || text.includes("arrived")) {
    arrow.innerHTML = "📍"; 
    arrow.style.transform = "rotate(0deg) scale(1.3)";
    arrow.style.color = "#10b981"; // Success Green
    if(label) label.innerText = "Arrived!";
    
    // Auto-hide HUD after 5 seconds
    setTimeout(() => {
      hud.style.opacity = "0";
      setTimeout(() => { hud.style.display = "none"; }, 500);
    }, 5000);
  }
}
/*********************************
 * CAMERA
 *********************************/
const videoElement = document.getElementById("cameraView");

navigator.mediaDevices.getUserMedia({
  video: {
    facingMode: "environment",
    width: { ideal: 1280 },
    height: { ideal: 720 }
  }
}).then((stream) => {
  videoElement.srcObject = stream;
  videoElement.play();
});
requestAnimationFrame(processFrame);

async function processFrame() {
  if (videoElement.readyState === 4) {
    await hands.send({ image: videoElement });
  }
  requestAnimationFrame(processFrame);
}
/*********************************
 * OCR API (OCR.space)
 *********************************/
const API_KEY = "K82237622588957";

async function captureAndRead() {

  const canvas = document.createElement("canvas");
  canvas.width = videoElement.videoWidth;
  canvas.height = videoElement.videoHeight;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(videoElement, 0, 0);

  const base64Image = canvas.toDataURL("image/jpeg");

  try {
    const response = await fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      headers: {
        apikey: API_KEY,
      },
      body: new URLSearchParams({
        base64Image: base64Image,
        language: "eng",
        isOverlayRequired: false,
      }),
    });

    const result = await response.json();

    const text = result?.ParsedResults?.[0]?.ParsedText || "";

    if (!text.trim()) {
      document.getElementById("extractedText").innerText =
        "No readable text found.";
      return;
    }

    document.getElementById("extractedText").innerText = text;

    speechSynthesis.cancel();
    speakText(text);

  } catch (error) {
    console.error("OCR error:", error);
    document.getElementById("extractedText").innerText =
      "OCR API failed.";
  }
}

/*********************************
 * SPEAK TEXT
 *********************************/
function speakText(text) {

  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "en-IN";
  speechSynthesis.speak(utter);
}
/*********************************
 * AR VISUAL LOGIC
 *********************************/
function updateARVisuals(stepText) {
  const hud = document.getElementById("arHUD");
  const arrow = document.getElementById("arArrow");
  const label = document.getElementById("ar-instruction");
  const text = stepText.toLowerCase();

  // 1. Show HUD if hidden
  hud.style.display = "block";

  // 2. Logic for Arrow Rotation & Labels
  if (text.includes("right")) {
    arrow.style.transform = "rotate(90deg)";
    label.innerText = "Turn Right";
  } 
  else if (text.includes("left")) {
    arrow.style.transform = "rotate(-90deg)";
    label.innerText = "Turn Left";
  } 
  else if (text.includes("straight") || text.includes("meters")) {
    arrow.style.transform = "rotate(0deg)";
    label.innerText = "Go Straight";
  } 
  else if (text.includes("reached") || text.includes("pharmacy") || text.includes("icu")) {
    // 3. Reached State
    arrow.innerHTML = "📍"; // Change icon to a pin
    arrow.style.transform = "rotate(0deg) scale(1.2)";
    arrow.style.color = "#10b981"; // Success Green
    label.innerText = "You have Arrived!";
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
      hud.style.display = "none";
      arrow.innerHTML = "↑"; // Reset for next time
      arrow.style.color = "#00f2ff";
    }, 5000);
  }
}