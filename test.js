let EAR_THRESHOLD = 0.25; // Eye Aspect Ratio threshold for drowsiness
let DROWSINESS_DURATION = 0.5; // Seconds of closed eyes to trigger alarm
const FPS = 30; // Estimated frames per second
let FRAMES_FOR_DROWSINESS = Math.round(DROWSINESS_DURATION * FPS);
const ALARM_DURATION = 3000; // Duration to show alert in milliseconds
const EAR_HISTORY_LENGTH = 60; // Number of EAR values to keep in history
const EAR_CHART_HEIGHT = 0.5; // Normalized height for chart (0-1)

// DOM elements
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const earValueElement = document.getElementById('ear-value');
const closedDurationElement = document.getElementById('closed-duration');
const statusElement = document.getElementById('status');
const fpsElement = document.getElementById('fps');
const alertElement = document.getElementById('alert');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const testSirenBtn = document.getElementById('testSirenBtn');
const stopSirenBtn = document.getElementById('stopSirenBtn');
const earStatusElement = document.getElementById('ear-status');
const thresholdSlider = document.getElementById('thresholdSlider');
const thresholdValue = document.getElementById('thresholdValue');
const durationSlider = document.getElementById('durationSlider');
const durationValue = document.getElementById('durationValue');
const earThresholdIndicator = document.getElementById('ear-threshold');
const meshToggle = document.getElementById('meshToggle');
const earChartCanvas = document.getElementById('earChart');

// Variables
let model = null;
let isRunning = false;
let closedFrames = 0;
let lastFrameTime = 0;
let frameCount = 0;
let fps = 0;
let animationId = null;
let audioContext = null;
let oscillator = null;
let gainNode = null;
let isSirenPlaying = false;
let earHistory = [];
let chartCtx = earChartCanvas.getContext('2d');
let showFaceMesh = true;

// Initialize the application
async function init() {
    try {
        statusElement.textContent = "Loading model...";
        
        // Load the face landmarks detection model
        model = await faceLandmarksDetection.load(
            faceLandmarksDetection.SupportedPackages.mediapipeFacemesh,
            { maxFaces: 1 }
        );
        
        statusElement.textContent = "Model loaded. Ready to start.";
        
        // Set up camera
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480 },
            audio: false
        });
        video.srcObject = stream;
        
        // Initialize Web Audio API
        initAudio();
        
        // Initialize chart
        initChart();
        
        // Set up event listeners
        startBtn.addEventListener('click', startDetection);
        stopBtn.addEventListener('click', stopDetection);
        testSirenBtn.addEventListener('click', testSiren);
        stopSirenBtn.addEventListener('click', stopSiren);
        thresholdSlider.addEventListener('input', updateThreshold);
        durationSlider.addEventListener('input', updateDuration);
        meshToggle.addEventListener('change', toggleFaceMesh);
        
        stopBtn.disabled = true;
        stopSirenBtn.disabled = true;
        
        // Set initial threshold indicator position
        updateThresholdIndicator();
        
    } catch (error) {
        console.error("Error initializing:", error);
        statusElement.textContent = "Error: " + error.message;
        statusElement.style.color = "var(--danger)";
    }
}

// Initialize Web Audio API
function initAudio() {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        gainNode = audioContext.createGain();
        gainNode.gain.value = 0;
        gainNode.connect(audioContext.destination);
    } catch (e) {
        console.error("Web Audio API not supported:", e);
        statusElement.textContent = "Audio not supported - visual alerts only";
    }
}

// Initialize the EAR history chart
function initChart() {
    earChartCanvas.width = earChartCanvas.offsetWidth;
    earChartCanvas.height = earChartCanvas.offsetHeight;
    
    // Fill the chart with empty data
    earHistory = Array(EAR_HISTORY_LENGTH).fill(0);
}

// Update the chart with new EAR values
function updateChart(ear) {
    // Add new EAR value to history
    earHistory.push(ear);
    if (earHistory.length > EAR_HISTORY_LENGTH) {
        earHistory.shift();
    }
    
    // Clear the chart
    chartCtx.clearRect(0, 0, earChartCanvas.width, earChartCanvas.height);
    
    // Draw grid lines
    chartCtx.strokeStyle = "rgba(108, 117, 125, 0.2)";
    chartCtx.lineWidth = 1;
    
    // Draw threshold line
    chartCtx.beginPath();
    const thresholdY = earChartCanvas.height * (1 - (EAR_THRESHOLD / EAR_CHART_HEIGHT));
    chartCtx.moveTo(0, thresholdY);
    chartCtx.lineTo(earChartCanvas.width, thresholdY);
    chartCtx.strokeStyle = "rgba(247, 37, 133, 0.5)";
    chartCtx.stroke();
    
    // Draw EAR line
    chartCtx.beginPath();
    const step = earChartCanvas.width / (EAR_HISTORY_LENGTH - 1);
    
    for (let i = 0; i < earHistory.length; i++) {
        const x = i * step;
        // Normalize EAR value to fit within chart height
        const normalizedEAR = Math.min(earHistory[i], EAR_CHART_HEIGHT) / EAR_CHART_HEIGHT;
        const y = earChartCanvas.height * (1 - normalizedEAR);
        
        if (i === 0) {
            chartCtx.moveTo(x, y);
        } else {
            chartCtx.lineTo(x, y);
        }
    }
    
    chartCtx.strokeStyle = "var(--primary)";
    chartCtx.lineWidth = 2;
    chartCtx.stroke();
}

// Create siren sound
function playSiren() {
    if (!audioContext || isSirenPlaying) return;
    
    isSirenPlaying = true;
    stopSirenBtn.disabled = false;
    
    oscillator = audioContext.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(1600, audioContext.currentTime + 0.5);
    oscillator.connect(gainNode);
    
    gainNode.gain.value = 0.5;
    oscillator.start();
    
    // Create siren effect by oscillating frequency
    const interval = setInterval(() => {
        if (!isSirenPlaying) {
            clearInterval(interval);
            return;
        }
        
        const now = audioContext.currentTime;
        oscillator.frequency.cancelScheduledValues(now);
        oscillator.frequency.setValueAtTime(1600, now);
        oscillator.frequency.exponentialRampToValueAtTime(800, now + 0.5);
        
        setTimeout(() => {
            if (!isSirenPlaying) return;
            const now = audioContext.currentTime;
            oscillator.frequency.cancelScheduledValues(now);
            oscillator.frequency.setValueAtTime(800, now);
            oscillator.frequency.exponentialRampToValueAtTime(1600, now + 0.5);
        }, 500);
    }, 1000);
}

function stopSiren() {
    if (!audioContext || !isSirenPlaying) return;
    
    isSirenPlaying = false;
    stopSirenBtn.disabled = true;
    
    // Smooth fade out to avoid clicks
    gainNode.gain.setValueAtTime(gainNode.gain.value, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.5);
    
    setTimeout(() => {
        if (oscillator) {
            oscillator.stop();
            oscillator.disconnect();
            oscillator = null;
        }
    }, 500);
}

function testSiren() {
    playSiren();
    setTimeout(stopSiren, 2000);
}

// Update EAR threshold from slider
function updateThreshold() {
    EAR_THRESHOLD = parseFloat(thresholdSlider.value);
    thresholdValue.textContent = EAR_THRESHOLD.toFixed(2);
    updateThresholdIndicator();
}

// Update duration threshold from slider
function updateDuration() {
    DROWSINESS_DURATION = parseFloat(durationSlider.value);
    durationValue.textContent = DROWSINESS_DURATION.toFixed(1);
    FRAMES_FOR_DROWSINESS = Math.round(DROWSINESS_DURATION * FPS);
}

// Update the threshold indicator position
function updateThresholdIndicator() {
    const percentage = (EAR_THRESHOLD / 0.4) * 100; // 0.4 is max threshold in slider
    earThresholdIndicator.style.left = `${percentage}%`;
}

// Toggle face mesh visualization
function toggleFaceMesh() {
    showFaceMesh = meshToggle.checked;
}

// Start the detection process
function startDetection() {
    if (!model || isRunning) return;
    
    isRunning = true;
    startBtn.disabled = true;
    stopBtn.disabled = false;
    statusElement.textContent = "Detection running...";
    closedFrames = 0;
    
    // Start processing frames
    lastFrameTime = performance.now();
    processFrame();
}

// Stop the detection process
function stopDetection() {
    isRunning = false;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    statusElement.textContent = "Detection stopped.";
    
    // Clear any pending animation frame
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    earValueElement.textContent = "0.00";
    closedDurationElement.textContent = "0.00";
    alertElement.style.display = "none";
    earStatusElement.className = "badge badge-success";
    earStatusElement.textContent = "Eyes Open";
    
    // Stop siren if playing
    stopSiren();
}

// Process each video frame
async function processFrame() {
    if (!isRunning) return;
    
    // Calculate FPS
    const now = performance.now();
    frameCount++;
    
    if (now - lastFrameTime >= 1000) {
        fps = Math.round((frameCount * 1000) / (now - lastFrameTime));
        fpsElement.textContent = `${fps} FPS`;
        frameCount = 0;
        lastFrameTime = now;
    }
    
    // Detect faces
    const predictions = await model.estimateFaces({
        input: video,
        returnTensors: false,
        flipHorizontal: false,
        predictIrises: true
    });
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (predictions.length > 0) {
        const keypoints = predictions[0].scaledMesh;
        
        // Draw facial landmarks if enabled
        if (showFaceMesh) {
            for (let i = 0; i < keypoints.length; i++) {
                const [x, y] = keypoints[i];
                
                ctx.beginPath();
                ctx.arc(x, y, 1, 0, 2 * Math.PI);
                ctx.fillStyle = 'rgba(67, 97, 238, 0.8)';
                ctx.fill();
            }
        }
        
        // Calculate Eye Aspect Ratio (EAR)
        const ear = calculateEAR(keypoints);
        earValueElement.textContent = ear.toFixed(2);
        
        // Update chart
        updateChart(ear);
        
        // Check for drowsiness
        if (ear < EAR_THRESHOLD) {
            closedFrames++;
            const closedSeconds = (closedFrames / fps).toFixed(2);
            closedDurationElement.textContent = `${closedSeconds}s`;
            
            // Update EAR status
            earStatusElement.className = "badge badge-danger";
            earStatusElement.textContent = "Eyes Closed";
            
            if (closedFrames >= FRAMES_FOR_DROWSINESS) {
                // Drowsiness detected
                alertElement.style.display = "flex";
                statusElement.textContent = "Drowsiness detected!";
                playSiren();
                
                // Reset counter after triggering alarm
                closedFrames = 0;
                
                // Hide alert after duration
                setTimeout(() => {
                    alertElement.style.display = "none";
                }, ALARM_DURATION);
            }
        } else {
            closedFrames = 0;
            closedDurationElement.textContent = "0.00s";
            alertElement.style.display = "none";
            statusElement.textContent = "Detection running...";
            
            // Update EAR status
            if (ear < EAR_THRESHOLD + 0.05) {
                earStatusElement.className = "badge badge-warning";
                earStatusElement.textContent = "Eyes Tired";
            } else {
                earStatusElement.className = "badge badge-success";
                earStatusElement.textContent = "Eyes Open";
            }
            
            // Stop siren if eyes are open again
            if (isSirenPlaying) {
                stopSiren();
            }
        }
    } else {
        earValueElement.textContent = "0.00";
        closedDurationElement.textContent = "0.00s";
        statusElement.textContent = "No face detected";
        
        // Reset counters when no face is detected
        closedFrames = 0;
        
        // Update EAR status
        earStatusElement.className = "badge";
        earStatusElement.textContent = "No Face";
    }
    
    // Continue processing frames
    animationId = requestAnimationFrame(processFrame);
}

// Calculate Eye Aspect Ratio (EAR)
function calculateEAR(keypoints) {
    // Indices for left and right eye landmarks
    // These indices are specific to the facemesh model
    const LEFT_EYE = [33, 160, 158, 133, 153, 144];
    const RIGHT_EYE = [362, 385, 387, 263, 373, 380];
    
    // Get the points for left eye
    const leftEyePoints = LEFT_EYE.map(index => keypoints[index]);
    
    // Calculate EAR for left eye
    const leftEAR = getEAR(leftEyePoints);
    
    // Get the points for right eye
    const rightEyePoints = RIGHT_EYE.map(index => keypoints[index]);
    
    // Calculate EAR for right eye
    const rightEAR = getEAR(rightEyePoints);
    
    // Average the EAR values for both eyes
    return (leftEAR + rightEAR) / 2;
}

// Helper function to calculate EAR for a single eye
function getEAR(eyePoints) {
    // Compute the vertical distances
    const A = distance(eyePoints[1], eyePoints[5]);
    const B = distance(eyePoints[2], eyePoints[4]);
    
    // Compute the horizontal distance
    const C = distance(eyePoints[0], eyePoints[3]);
    
    // Return the eye aspect ratio
    return (A + B) / (2 * C);
}

// Helper function to calculate Euclidean distance between two points
function distance(point1, point2) {
    const [x1, y1] = point1;
    const [x2, y2] = point2;
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}

// Initialize the app when the page loads
window.addEventListener('DOMContentLoaded', init);