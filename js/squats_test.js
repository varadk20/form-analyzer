let repCount = 0;
let stage = 'up';
let feedback = [];


let isFormOpen = false;

let repData = [];
let currentRepStartTime = null;
let maxAngleThisRep = 180;
let minAngleThisRep = 180;

let latestSuggestions = [];

let lastLeftHipY = null;
let lastRightHipY = null;
let hipVelocityBuffer = [];

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

function clamp01(x) {
    return Math.max(0, Math.min(1, x));
}

function computeRepScores(rep) {
    const {
        repDuration,
        maxKneeFlexion,
        minKneeExtension,
        avgKneeOffset,
        symmetryIssues,
        avgHipSpeed
    } = rep;

    // Time score (2-6 seconds optimal)
    let timeScore;
    if (repDuration < 2) {
        timeScore = clamp01(repDuration / 2);
    } else if (repDuration > 6) {
        timeScore = clamp01(1 - (repDuration - 6) / 2);
    } else {
        timeScore = 1;
    }

    // ROM score
    // FIXED ROM score - partial squats FAIL <0.7
let romScore = 1;

// Penalty for shallow squats: target <90°
if (maxKneeFlexion > 90) {
    romScore = clamp01((120 - maxKneeFlexion) / 30);  // 130°=0.33, 90°=1.0
}

// Penalty for poor lockout
if (minKneeExtension < 165) {
    romScore *= clamp01((minKneeExtension - 150) / 15);
}


    // Form score
    const kneeScore = clamp01(1 - (avgKneeOffset - 0.03) / 0.12);
    const symmetryScore = symmetryIssues > 0 ? clamp01(1 - symmetryIssues / 3) : 1;
    let formScore = kneeScore * symmetryScore;

    // ULTRA-BULLETPROOF momentum (perfect form passes)
    let momentumScore;
    if (avgHipSpeed <= 0.015) {
        momentumScore = 1;
    } else if (avgHipSpeed >= 0.045) {
        momentumScore = 0;
    } else {
        momentumScore = clamp01(1 - (avgHipSpeed - 0.015) / 0.03);
    }

    return { timeScore, romScore, formScore, momentumScore };
}

function analyzeSquatForm(kneeAngle, backAngle, leftKnee, rightKnee, leftHip, rightHip, leftShoulder, rightShoulder, landmarks) {
    feedback = [];

    const leftKneeAngle = calculateAngle(leftHip, leftKnee, landmarks[27]);
    const rightKneeAngle = calculateAngle(rightHip, rightKnee, landmarks[28]);

    const leftKneeForward = Math.abs(leftKnee.x - leftHip.x) > 0.12;
    const rightKneeForward = Math.abs(rightKnee.x - rightHip.x) > 0.12;

    if (leftKneeForward) {
        feedback.push({ type: 'warning', text: '⚠️ Keep left knee over foot, not past toes' });
    }
    if (rightKneeForward) {
        feedback.push({ type: 'warning', text: '⚠️ Keep right knee over foot, not past toes' });
    }

    if (backAngle > 25) {
        feedback.push({ type: 'warning', text: '⚠️ Keep chest more upright' });
    }

    if (stage === 'down') {
        if (kneeAngle > 100) {
            feedback.push({ type: 'warning', text: '⚠️ Go deeper - target at least 90° knee bend' });
        }
    } else if (stage === 'up') {
        if (kneeAngle < 150) {
            feedback.push({ type: 'warning', text: '⚠️ Stand up fully - lock knees at top' });
        }
    }

    if (Math.abs(leftKneeAngle - rightKneeAngle) > 25) {
        feedback.push({ type: 'error', text: '❌ Knees not symmetrical - balance your squat' });
    }

    if (feedback.length === 0) {
        feedback.push({ type: 'good', text: '✅ Perfect squat form!' });
    }
}

function updateUI(kneeAngle, backAngle, efficiencyScore = null, suggestions = []) {
    document.getElementById('repCount').textContent = repCount;
    document.getElementById('stage').textContent = stage === 'down' ? 'Squat Down' : 'Standing';
    document.getElementById('leftAngle').textContent = Math.round(kneeAngle) + '°';
    document.getElementById('rightAngle').textContent = Math.round(backAngle) + '°';

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

function buildSuggestions(avgScores) {
    const { timeScore, romScore, formScore, momentumScore } = avgScores;
    const suggestions = [];

    if (timeScore < 0.7) {
        suggestions.push('Focus on controlled reps between 2–6 seconds. Try "3 seconds down, explode up".');
    }
    if (romScore < 0.7) {
        suggestions.push('Increase depth: squat until knees hit at least 90° while keeping chest up.');
    }
    if (formScore < 0.7) {
        suggestions.push('Keep knees tracking over toes and back upright. Imagine sitting back into a chair.');
    }
    if (momentumScore < 0.7) {
        suggestions.push('Reduce bounce: control the descent, pause briefly at bottom, then drive up powerfully.');
    }

    if (suggestions.length === 0) {
        suggestions.push('Excellent! Full depth, perfect form, and great control. Ready to add weight.');
    }

    return suggestions;
}

function computeAndShowEfficiency() {
    if (repData.length === 0) return;

    const factorSums = {
        timeScore: 0, romScore: 0, formScore: 0, momentumScore: 0
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

    const overall = avgScores.timeScore * 0.25 +
                   avgScores.romScore * 0.3 +
                   avgScores.formScore * 0.3 +
                   avgScores.momentumScore * 0.15;

    const efficiencyScore = overall * 100;
    latestSuggestions = buildSuggestions(avgScores);
    
    updateUI(
        parseFloat(document.getElementById('leftAngle').textContent) || 0,
        parseFloat(document.getElementById('rightAngle').textContent) || 0,
        efficiencyScore,
        latestSuggestions
    );

    window.isFormOpen = true;

    // 🔥 FORM OPENS HERE AFTER 10 REPS!
    window.computeRepScores = computeRepScores;
    if (typeof window.showCompletionForm === 'function') {
        window.showCompletionForm(repData, efficiencyScore);
    }
}

function onResults(results) {
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
        drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, { color: '#00B8D4', lineWidth: 4 });
        drawLandmarks(canvasCtx, results.poseLandmarks, { color: '#FF2C35', lineWidth: 2, radius: 6 });

        const landmarks = results.poseLandmarks;

        const leftHip = landmarks[23];
        const leftKnee = landmarks[25];
        const leftAnkle = landmarks[27];
        const rightHip = landmarks[24];
        const rightKnee = landmarks[26];
        const rightAnkle = landmarks[28];
        const leftShoulder = landmarks[11];
        const rightShoulder = landmarks[12];

        const leftKneeAngle = calculateAngle(leftHip, leftKnee, leftAnkle);
        const rightKneeAngle = calculateAngle(rightHip, rightKnee, rightAnkle);
        const kneeAngle = (leftKneeAngle + rightKneeAngle) / 2;

        const torsoHeight = Math.abs(leftShoulder.y - leftHip.y);
        const torsoLeanX = Math.abs(leftShoulder.x - leftHip.x);
        const backAngle = Math.min(90, (torsoLeanX / torsoHeight) * 90);

        const avgAngle = kneeAngle;

        maxAngleThisRep = Math.max(maxAngleThisRep, avgAngle);
        minAngleThisRep = Math.min(minAngleThisRep, avgAngle);

        // ULTRA-BULLETPROOF momentum filtering
        if (lastLeftHipY !== null && lastRightHipY !== null) {
            const dyLeft = Math.abs(leftHip.y - lastLeftHipY);
            const dyRight = Math.abs(rightHip.y - lastRightHipY);
            
            // Only count BIG movements (ignores 95% noise)
            if (dyLeft > 0.004 && dyRight > 0.004) {
                const avgDy = (dyLeft + dyRight) / 2 * 1.5;
                hipVelocityBuffer.push(avgDy);
            }
            
            if (hipVelocityBuffer.length > 10) {
                hipVelocityBuffer.shift();
            }
        }
        lastLeftHipY = leftHip.y;
        lastRightHipY = rightHip.y;

        const now = performance.now();

        if (kneeAngle > 165) {
            if (stage === 'down') {
                stage = 'up';
                repCount++;

                const repEndTime = now;
                const repDuration = currentRepStartTime ? (repEndTime - currentRepStartTime) / 1000 : 0;
                const kneeOffset = (Math.abs(leftKnee.x - leftAnkle.x) + Math.abs(rightKnee.x - rightAnkle.x)) / 2;
                const symmetryIssues = Math.abs(leftKneeAngle - rightKneeAngle) > 25 ? 1 : 0;

                let avgHipSpeed = 0;
                if (hipVelocityBuffer.length > 0) {
                    avgHipSpeed = hipVelocityBuffer.reduce((a, b) => a + b, 0) / hipVelocityBuffer.length;
                }

                repData.push({
                    repDuration,
                    maxKneeFlexion: minAngleThisRep,
                    minKneeExtension: maxAngleThisRep,
                    avgKneeOffset: kneeOffset,
                    symmetryIssues,
                    avgHipSpeed
                });

                // Per-rep feedback after every rep
                if (repCount >= 1) {
                    const scores = computeRepScores(repData[repData.length - 1]);
                    const suggestions = buildSuggestions(scores);
                    updateUI(kneeAngle, backAngle, null, suggestions);
                }

                currentRepStartTime = now;
                maxAngleThisRep = avgAngle;
                minAngleThisRep = avgAngle;
                hipVelocityBuffer = [];

                if (repCount >= TARGET_REPS) {
                    computeAndShowEfficiency();
                }
            }
        } else if (kneeAngle < 140) {
            if (stage === 'up') {
                stage = 'down';
                if (!currentRepStartTime) {
                    currentRepStartTime = now;
                }
            }
        }

        analyzeSquatForm(kneeAngle, backAngle, leftKnee, rightKnee, leftHip, rightHip, leftShoulder, rightShoulder, landmarks);

        let currentEfficiency = document.getElementById('efficiencyScore').textContent === '--%'
            ? null
            : parseFloat(document.getElementById('efficiencyScore').textContent);

        updateUI(kneeAngle, backAngle, currentEfficiency, latestSuggestions);

        const drawText = (text, x, y) => {
            canvasCtx.fillStyle = '#00B8D4';
            canvasCtx.font = 'bold 24px sans-serif';
            canvasCtx.strokeStyle = '#000';
            canvasCtx.lineWidth = 3;
            canvasCtx.strokeText(text, x * canvasElement.width, y * canvasElement.height);
            canvasCtx.fillText(text, x * canvasElement.width, y * canvasElement.height);
        };

        drawText(`${Math.round(kneeAngle)}°`, leftKnee.x, leftKnee.y - 0.05);
        drawText(`${Math.round(backAngle)}°`, leftHip.x, leftHip.y - 0.08);
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
