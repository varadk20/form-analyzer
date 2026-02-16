let repCount = 0;
let stage = 'down';
let feedback = [];


let isFormOpen = false;


// Efficiency tracking
let repData = []; // per-rep metrics
let currentRepStartTime = null;
let maxAngleThisRep = 180;
let minAngleThisRep = 180;

let latestSuggestions = [];


// For crude momentum detection (shoulder vertical movement)
let lastLeftShoulderY = null;
let lastRightShoulderY = null;
let shoulderVelocityBuffer = []; // recent |dy| values

const TARGET_REPS = 10;

const videoElement = document.getElementById('video');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');
const loadingElement = document.getElementById('loading');

function calculateAngle(a, b, c) {
    const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs(radians * 180.0 / Math.PI);
    if (angle > 180.0) {
        angle = 360 - angle;
    }
    return angle;
}

// Simple helper to clamp value between 0 and 1
function clamp01(x) {
    return Math.max(0, Math.min(1, x));
}

// Compute scores for one rep (0–1 each)
function computeRepScores(rep) {
    const {
        repDuration,
        maxFlexion,
        minExtension,
        avgElbowOffset,
        symmetryIssues,
        avgShoulderSpeed
    } = rep;

    // 1) Time factor (2–8 seconds best)
    let timeScore;
    if (repDuration < 2) {
        timeScore = clamp01(repDuration / 2); // 0 → 2s
    } else if (repDuration > 8) {
        timeScore = clamp01(1 - (repDuration - 8) / 4); // 8→12s drop to 0
    } else {
        timeScore = 1; // ideal window
    }

    // 2) Range of motion factor
  console.log(`Rep analysis: maxFlexion=${maxFlexion?.toFixed(1)}°, minExtension=${minExtension?.toFixed(1)}°`);

let romScore = 1;
// Penalty for partial curls (>50° = too shallow)
if (maxFlexion > 50) {  
    romScore = clamp01((65 - maxFlexion) / 15);  // 30°=2.3→1.0, 50°=1.0, 54°=0.67, 65°=0
    console.log(`ROM penalty: ${maxFlexion}° → romScore=${romScore.toFixed(2)}`);
}
if (minExtension < 170) {
    romScore *= clamp01((minExtension - 165) / 5);
    console.log(`Extension penalty: ${minExtension}° → final romScore=${romScore.toFixed(2)}`);
}



    // 3) Form factor (elbow offset + symmetry)
    // avgElbowOffset: 0 is perfect, >0.15 is poor
    const elbowScore = clamp01(1 - (avgElbowOffset - 0.05) / 0.15); // 0.05→0.2
    const symmetryScore = symmetryIssues > 0 ? clamp01(1 - symmetryIssues / 3) : 1;
    let formScore = elbowScore * symmetryScore;


    
    // 4) Momentum factor (based on avgShoulderSpeed)
    // If average shoulder vertical speed is high, likely using momentum
    // 0–0.01 ≈ no momentum, >0.05 very swingy
    let momentumScore;
    if (avgShoulderSpeed <= 0.008) {
        momentumScore = 1;
    } else if (avgShoulderSpeed >= 0.03) {
        momentumScore = 0;
    } else {
        momentumScore = clamp01(1 - (avgShoulderSpeed - 0.008) / 0.022);
    }

    console.log(`Rep ${repCount} momentum: ${avgShoulderSpeed.toFixed(4)} → score: ${momentumScore?.toFixed(2)}`);


    return {
        timeScore,
        romScore,
        formScore,
        momentumScore
    };
}



function analyzeCurlForm(leftAngle, rightAngle, leftShoulder, leftElbow, rightShoulder, rightElbow) {
    feedback = [];

    // Check elbow position (should stay relatively stationary, close to body)
    const leftShoulderElbowDist = Math.abs(leftShoulder.x - leftElbow.x);
    const rightShoulderElbowDist = Math.abs(rightShoulder.x - rightElbow.x);

    if (leftShoulderElbowDist > 0.15) {
        feedback.push({ type: 'warning', text: '⚠️ Keep left elbow closer to body' });
    }
    if (rightShoulderElbowDist > 0.15) {
        feedback.push({ type: 'warning', text: '⚠️ Keep right elbow closer to body' });
    }

    // Angle-based form checks
    if (stage === 'up') {
        if (leftAngle > 50 && leftAngle < 160) {
            feedback.push({ type: 'warning', text: '⚠️ Curl left arm higher for full contraction' });
        }
        if (rightAngle > 50 && rightAngle < 160) {
            feedback.push({ type: 'warning', text: '⚠️ Curl right arm higher for full contraction' });
        }
    } else if (stage === 'down') {
        if (leftAngle < 150 && leftAngle > 50) {
            feedback.push({ type: 'warning', text: '⚠️ Extend left arm fully at bottom' });
        }
        if (rightAngle < 150 && rightAngle > 50) {
            feedback.push({ type: 'warning', text: '⚠️ Extend right arm fully at bottom' });
        }
    }

    // Symmetry check
    const angleDifference = Math.abs(leftAngle - rightAngle);
    if (angleDifference > 30) {
        feedback.push({ type: 'error', text: '❌ Arms not symmetrical - balance your form' });
    }

    // Good form feedback
    if (feedback.length === 0) {
        feedback.push({ type: 'good', text: '✅ Excellent form!' });
    }
}

function updateUI(leftAngle, rightAngle, efficiencyScore = null, suggestions = []) {
    document.getElementById('repCount').textContent = repCount;
    document.getElementById('stage').textContent = stage === 'up' ? 'Curl Up' : 'Extended';
    document.getElementById('leftAngle').textContent = Math.round(leftAngle) + '°';
    document.getElementById('rightAngle').textContent = Math.round(rightAngle) + '°';

    const feedbackContainer = document.getElementById('feedbackContainer');
    feedbackContainer.innerHTML = '';
    feedback.forEach(fb => {
        const div = document.createElement('div');
        div.className = `feedback-item feedback-${fb.type}`;
        div.textContent = fb.text;
        feedbackContainer.appendChild(div);
    });

    if (efficiencyScore !== null) {
        document.getElementById('efficiencyScore').textContent = Math.round(efficiencyScore) + '%';
    }

    const suggestionsContainer = document.getElementById('suggestionsContainer');
    suggestionsContainer.innerHTML = '';
    suggestions.forEach(text => {
        const div = document.createElement('div');
        div.className = 'suggestion-item';
        div.textContent = text;
        suggestionsContainer.appendChild(div);
    });
}

// Build personal suggestions based on average factor scores
function buildSuggestions(avgScores) {
    const { timeScore, romScore, formScore, momentumScore } = avgScores;
    const suggestions = [];

    if (timeScore < 0.7) {
        suggestions.push('Focus on controlled reps between 2–8 seconds. Count “2 seconds up, 2 seconds down” to stay in the target time zone.');
    }
    if (romScore < 0.7) {
        suggestions.push('Increase your range of motion: fully extend your arms at the bottom and bring the weight closer to your shoulders at the top without swinging.');
    }
    if (formScore < 0.7) {
        suggestions.push('Keep your elbows fixed close to your sides and avoid letting one arm move differently from the other.');
    }
    if (momentumScore < 0.7) {
        suggestions.push('Reduce body swing: keep your shoulders stable, tighten your core, and use less weight if needed to avoid using momentum.');
    }

    if (suggestions.length === 0) {
        suggestions.push('Great job! Your time, range of motion, form, and control all look solid. You can safely increase weight gradually while maintaining this form.');
    }

    return suggestions;
}

function computeAndShowEfficiency() {
    if (repData.length === 0) return;

    const factorSums = {
        timeScore: 0,
        romScore: 0,
        formScore: 0,
        momentumScore: 0
    };

    repData.forEach(rep => {
        const scores = computeRepScores(rep);
        factorSums.timeScore += scores.timeScore;
        factorSums.romScore += scores.romScore;
        factorSums.formScore += scores.formScore;
        factorSums.momentumScore += scores.momentumScore;
    });

    const n = repData.length;
    const avgScores = {
        timeScore: factorSums.timeScore / n,
        romScore: factorSums.romScore / n,
        formScore: factorSums.formScore / n,
        momentumScore: factorSums.momentumScore / n
    };

    // Weighted overall efficiency
    // You can adjust weights here
    const overall =
        avgScores.timeScore * 0.25 +
        avgScores.romScore * 0.25 +
        avgScores.formScore * 0.25 +
        avgScores.momentumScore * 0.25;

    const efficiencyScore = overall * 100;
    const suggestions = buildSuggestions(avgScores);


    // Show final efficiency and suggestions
    latestSuggestions = suggestions;
    updateUI(
        parseFloat(document.getElementById('leftAngle').textContent) || 0,
        parseFloat(document.getElementById('rightAngle').textContent) || 0,
        efficiencyScore,
        latestSuggestions,
    );

    window.isFormOpen = true;

    // 🔥 FORM OPENS HERE AFTER 10 REPS!
    window.computeRepScores = computeRepScores;
    if (typeof window.showCompletionForm === 'function') {
        window.showCompletionForm(repData, efficiencyScore);
    }

}

function onResults(results) {

    // 🔥 PREVENT PROCESSING WHEN INSTRUCTIONS VISIBLE
    if (document.getElementById('instructionModal').style.display !== 'none') {
        return; // Skip all processing
    }

    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    // 🔥 ADD THESE 2 form LINES HERE:
if (window.isFormOpen) {
    canvasCtx.restore();
    return;
}

    if (results.poseLandmarks) {
        drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS,
            { color: '#00B8D4', lineWidth: 4 });
        drawLandmarks(canvasCtx, results.poseLandmarks,
            { color: '#FF2C35', lineWidth: 2, radius: 6 });

        const landmarks = results.poseLandmarks;

        const leftShoulder = landmarks[11];
        const leftElbow = landmarks[13];
        const leftWrist = landmarks[15];
        const rightShoulder = landmarks[12];
        const rightElbow = landmarks[14];
        const rightWrist = landmarks[16];

        const leftAngle = calculateAngle(leftShoulder, leftElbow, leftWrist);
        const rightAngle = calculateAngle(rightShoulder, rightElbow, rightWrist);
        const avgAngle = (leftAngle + rightAngle) / 2;

        // Track min/max angles within a rep
        maxAngleThisRep = Math.max(maxAngleThisRep, avgAngle);
        minAngleThisRep = Math.min(minAngleThisRep, avgAngle);

        // Momentum: shoulder vertical movement
        if (lastLeftShoulderY !== null && lastRightShoulderY !== null) {
            const dyLeft = Math.abs(leftShoulder.y - lastLeftShoulderY);
            const dyRight = Math.abs(rightShoulder.y - lastRightShoulderY);
            const avgDy = (dyLeft + dyRight) / 2 * 4;
            shoulderVelocityBuffer.push(avgDy);
            if (shoulderVelocityBuffer.length > 30) {
                shoulderVelocityBuffer.shift();
            }
        }
        lastLeftShoulderY = leftShoulder.y;
        lastRightShoulderY = rightShoulder.y;

        const now = performance.now();

        // Rep counting with hysteresis
        if (avgAngle > 160) {
            if (stage === 'up') {
                stage = 'down';
                repCount++;

                const repEndTime = now;
                const repDuration = currentRepStartTime
                    ? (repEndTime - currentRepStartTime) / 1000
                    : 0;

                // Average elbow offset from body (approx using x distance)
                const elbowOffset = (Math.abs(leftShoulder.x - leftElbow.x) +
                    Math.abs(rightShoulder.x - rightElbow.x)) / 2;

                // Symmetry issues in this rep (rough proxy: if angles often very different)
                // For simplicity, mark 0 or 1 issue based on current frame
                const symmetryIssues = Math.abs(leftAngle - rightAngle) > 30 ? 1 : 0;

                // Avg shoulder speed during this rep
                let avgShoulderSpeed = 0;
                if (shoulderVelocityBuffer.length > 0) {
                    avgShoulderSpeed =
                        shoulderVelocityBuffer.reduce((a, b) => a + b, 0) /
                        shoulderVelocityBuffer.length;
                }

                repData.push({
                    repDuration,
                    maxFlexion: minAngleThisRep,
                    minExtension: maxAngleThisRep,
                    avgElbowOffset: elbowOffset,
                    symmetryIssues,
                    avgShoulderSpeed
                });

                // console.log(`Rep ${repCount}: min=${Math.round(minAngleThisRep)}°, max=${Math.round(maxAngleThisRep)}°`);

                // Reset per-rep trackers
                currentRepStartTime = now;
                maxAngleThisRep = avgAngle;
                minAngleThisRep = avgAngle;
                shoulderVelocityBuffer = [];

                if (repCount >= TARGET_REPS) {
                    // Stop counting further reps and compute efficiency
                    computeAndShowEfficiency();
                }
            }
        } else if (avgAngle < 90) {
            if (stage === 'down') {
                stage = 'up';
                // Start of a new rep
                if (!currentRepStartTime) {
                    currentRepStartTime = now;
                }
            }
        }

        // Analyze form (live)
        analyzeCurlForm(leftAngle, rightAngle, leftShoulder, leftElbow, rightShoulder, rightElbow);

        // If efficiency already computed, do not overwrite suggestions
        let currentEfficiency =
            document.getElementById('efficiencyScore').textContent === '--%'
                ? null
                : parseFloat(document.getElementById('efficiencyScore').textContent);

        updateUI(leftAngle, rightAngle, currentEfficiency, latestSuggestions);

        const drawText = (text, x, y) => {
            canvasCtx.fillStyle = '#00B8D4';
            canvasCtx.font = 'bold 24px sans-serif';
            canvasCtx.strokeStyle = '#000';
            canvasCtx.lineWidth = 3;
            canvasCtx.strokeText(text, x * canvasElement.width, y * canvasElement.height);
            canvasCtx.fillText(text, x * canvasElement.width, y * canvasElement.height);
        };

        drawText(`${Math.round(leftAngle)}°`, leftElbow.x, leftElbow.y - 0.05);
        drawText(`${Math.round(rightAngle)}°`, rightElbow.x, rightElbow.y - 0.05);
    }

    canvasCtx.restore();
}

const pose = new Pose({
    locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
    }
});

pose.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    enableSegmentation: false,
    smoothSegmentation: false,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

pose.onResults(onResults);

const camera = new Camera(videoElement, {
    onFrame: async () => {
        await pose.send({ image: videoElement });
    },
    width: 1280,
    height: 720
});

camera.start().then(() => {
    loadingElement.style.display = 'none';
}).catch(err => {
    loadingElement.textContent = 'Error: Could not access camera. Please allow camera permissions.';
    console.error('Camera error:', err);
});



