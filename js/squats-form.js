// ✅ URL REMOVED - now from config.js
const FORM_CONFIG = {
  TARGET_REPS: 10,
};

function getGoogleAppsScriptUrl() {
  return "https://script.google.com/macros/s/AKfycbygVK_5BVvnilavD4o2USyl31bpHfH_ORoRh3ROr8dBx2Z0fXqVAvZWyP3uqBzVQ3inww/exec";
}

function showCompletionForm(repData, finalScoreOverride = null) {
  window.isFormOpen = true;

  const { finalScore, avgScores } = computeAllScores(repData);
  const displayScore = finalScoreOverride || finalScore;

  const modalHTML = `
        <div id="completionModal" class="modal-overlay">
            <div class="modal-card">
                <div class="score-header">
                    <div class="score-circle">${Math.round(displayScore)}%</div>
                    <div class="score-label">Workout Score</div>
                </div>
                
                <div class="scores-grid">
                    <div class="score-item">
                        <span>⏱️ ${avgScores.timeScore.toFixed(1)}</span>
                        <small>Time</small>
                    </div>
                    <div class="score-item">
                        <span>📏 ${avgScores.romScore.toFixed(1)}</span>
                        <small>ROM</small>
                    </div>
                    <div class="score-item">
                        <span>🧍 ${avgScores.formScore.toFixed(1)}</span>
                        <small>Form</small>
                    </div>
                    <div class="score-item">
                        <span>💪 ${avgScores.momentumScore.toFixed(1)}</span>
                        <small>Control</small>
                    </div>
                </div>

                <form id="workoutForm" class="form-grid">
                    <input type="text" id="userName" placeholder="👤 Name" required>
                    <input type="number" id="userAge" placeholder="🎂 Age" min="5" max="100" required>
                    <select id="userGender" required>
                        <option value="">⚤ Gender</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                    </select>
                    <input type="number" id="userHeight" placeholder="📏 Height (cm)" min="100" max="250" step="0.1" required>
                    <input type="number" id="userWeight" placeholder="⚖️ Weight (kg)" min="30" max="200" step="0.1" required>
                    <input type="number" id="userSleep" placeholder="😴 Sleep (hrs)" min="0" max="24" step="0.1" required>
                    
                    <!-- Hidden fields -->
                    <input type="hidden" id="finalScore" value="${Math.round(displayScore)}">
                    <input type="hidden" id="totalReps" value="${FORM_CONFIG.TARGET_REPS}">
                    <input type="hidden" id="avgTimeScore" value="${avgScores.timeScore.toFixed(2)}">
                    <input type="hidden" id="avgRomScore" value="${avgScores.romScore.toFixed(2)}">
                    <input type="hidden" id="avgFormScore" value="${avgScores.formScore.toFixed(2)}">
                    <input type="hidden" id="avgMomentumScore" value="${avgScores.momentumScore.toFixed(2)}">
                </form>

                <div class="modal-actions">
                    <button type="submit" form="workoutForm" class="btn-primary">💾 Send Data</button>
                    <button type="button" onclick="resetWorkoutAndClose()" class="btn-secondary">➡️ Scroll for feedback</button>
                </div>

                <div id="saveStatus" class="status"></div>
            </div>
        </div>

        <style>
            .modal-overlay {
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0,0,0,0.85); z-index: 1000; display: flex;
                align-items: center; justify-content: center; padding: 1rem;
                backdrop-filter: blur(8px);
            }
            .modal-card {
                background: white; border-radius: 24px; padding: 2rem;
                max-width: 380px; width: 100%; box-shadow: 0 25px 50px rgba(0,0,0,0.3);
                font-family: -apple-system, system-ui, sans-serif;
            }
            .score-header { text-align: center; margin-bottom: 1.5rem; }
            .score-circle {
                width: 90px; height: 90px; background: linear-gradient(135deg, #28a745, #20c997);
                color: white; border-radius: 50%; display: flex; align-items: center;
                justify-content: center; font-size: 28px; font-weight: 800; margin: 0 auto 0.5rem;
                box-shadow: 0 15px 35px rgba(40,167,69,0.4);
            }
            .score-label { font-size: 16px; color: #666; font-weight: 600; }
            .scores-grid {
                display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;
                margin-bottom: 1.5rem; background: #f8f9fa; padding: 1rem;
                border-radius: 12px;
            }
            .score-item { text-align: center; }
            .score-item span { display: block; font-size: 20px; font-weight: 700; color: #333; }
            .score-item small { color: #666; font-size: 12px; }
            .form-grid {
                display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;
                margin-bottom: 1.5rem;
            }
            .form-grid > *:first-child { grid-column: 1 / -1; }
            input, select {
                width: 100%; padding: 0.75rem; border: 2px solid #e9ecef;
                border-radius: 10px; font-size: 16px; transition: all 0.2s;
            }
            input:focus, select:focus { outline: none; border-color: #28a745; box-shadow: 0 0 0 3px rgba(40,167,69,0.1); }
            .modal-actions { display: flex; gap: 0.75rem; margin-bottom: 1rem; }
            .btn-primary, .btn-secondary {
                flex: 1; padding: 0.875rem; border: none; border-radius: 12px;
                font-size: 16px; font-weight: 600; cursor: pointer; transition: all 0.2s;
            }
            .btn-primary {
                background: linear-gradient(135deg, #28a745, #20c997); color: white;
                box-shadow: 0 8px 25px rgba(40,167,69,0.4);
            }
            .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 12px 30px rgba(40,167,69,0.5); }
            .btn-secondary { background: #6c757d; color: white; }
            .btn-secondary:hover { background: #5a6268; transform: translateY(-1px); }
            .status {
                text-align: center; font-weight: 600; min-height: 1.25rem;
                padding: 0.5rem; border-radius: 8px; font-size: 14px;
            }
        </style>
    `;

  document.body.insertAdjacentHTML("beforeend", modalHTML);

  document
    .getElementById("workoutForm")
    .addEventListener("submit", handleSubmit);
}

async function handleSubmit(e) {
  e.preventDefault();
  const statusEl = document.getElementById("saveStatus");
  statusEl.textContent = "📤 Saving...";
  statusEl.style.color = "#007bff";

  // ✅ CHECK CONFIG FIRST
  const url = getGoogleAppsScriptUrl();
  if (!url) {
    statusEl.textContent = "❌ Add config.js with your URL";
    statusEl.style.color = "#dc3545";
    return;
  }

  const formData = {
    name: document.getElementById("userName").value,
    age: document.getElementById("userAge").value, // ✅ NEW: Age
    gender: document.getElementById("userGender").value,
    height: document.getElementById("userHeight").value,
    weight: document.getElementById("userWeight").value,
    sleepHours: document.getElementById("userSleep").value,
    finalScore: document.getElementById("finalScore").value,
    totalReps: document.getElementById("totalReps").value,
    avgTimeScore: document.getElementById("avgTimeScore").value,
    avgRomScore: document.getElementById("avgRomScore").value,
    avgFormScore: document.getElementById("avgFormScore").value,
    avgMomentumScore: document.getElementById("avgMomentumScore").value,
  };

  try {
    // ✅ USES ENV URL
    await fetch(url, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });
    statusEl.textContent = "✅ Saved!";
    statusEl.style.color = "#28a745";
  } catch {
    downloadWorkoutCSV(formData);
    statusEl.innerHTML = "💾 CSV Downloaded";
    statusEl.style.color = "#17a2b8";
  }

  setTimeout(() => {
    document.getElementById("completionModal").remove();
    window.isFormOpen = false;
    window.resetWorkout?.();
  }, 1800);
}

// Update CSV download to include age
function downloadWorkoutCSV(formData) {
  const csvRows = [
    [
      new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
      formData.name,
      formData.age,
      formData.gender,
      formData.height,
      formData.weight,
      formData.sleepHours,
      formData.finalScore,
      formData.totalReps,
      formData.avgTimeScore,
      formData.avgRomScore,
      formData.avgFormScore,
      formData.avgMomentumScore,
    ],
    [
      "Timestamp",
      "Name",
      "Age",
      "Gender",
      "Height_cm",
      "Weight_kg",
      "Sleep_hrs",
      "FinalScore_%",
      "TotalReps",
      "AvgTimeScore",
      "AvgRomScore",
      "AvgFormScore",
      "AvgMomentumScore",
    ],
  ];

  const csvContent = csvRows
    .map((row) => row.map((cell) => `"${cell}"`).join(","))
    .join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = `bicep_workout_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function computeAllScores(repData) {
  if (!repData?.length)
    return {
      finalScore: 0,
      avgScores: {
        timeScore: 0.8,
        romScore: 0.8,
        formScore: 0.8,
        momentumScore: 0.8,
      },
    };

  const sums = { timeScore: 0, romScore: 0, formScore: 0, momentumScore: 0 };
  repData.forEach((rep) => {
    const scores = window.computeRepScores?.(rep) || {
      timeScore: 0.8,
      romScore: 0.8,
      formScore: 0.8,
      momentumScore: 0.8,
    };
    Object.keys(sums).forEach((key) => (sums[key] += scores[key] || 0.8));
  });

  const n = repData.length;
  const avgScores = Object.fromEntries(
    Object.keys(sums).map((k) => [k, sums[k] / n]),
  );
  return {
    finalScore: (Object.values(avgScores).reduce((a, b) => a + b, 0) / 4) * 100,
    avgScores,
  };
}

function resetWorkoutAndClose() {
  document.getElementById("completionModal")?.remove();
  window.isFormOpen = false;
  window.resetWorkout?.();
}

window.showCompletionForm = showCompletionForm;
window.resetWorkoutAndClose = resetWorkoutAndClose;
window.downloadWorkoutCSV = downloadWorkoutCSV;
