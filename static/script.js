// ANOVA Calculator Frontend Script (MVP)

let metadata = {};
let activeOneWayChart = null;
let activeTwoWayChart = null;
let twoWayPostHocData = {};

document.addEventListener("DOMContentLoaded", () => {
    fetchMetadata();

    // Event Listeners
    document.getElementById("crop").addEventListener("change", handleCropChange);
    document.getElementById("factor").addEventListener("change", handleFactorChange);
    
    // ANOVA trigger buttons
    document.getElementById("run-oneway").addEventListener("click", handleOneWayRun);
    document.getElementById("run-twoway").addEventListener("click", handleTwoWayRun);
    
    // Post-hoc selector for Two-Way Simple Main Effects
    document.getElementById("posthoc-biochar-select").addEventListener("change", (e) => {
        renderTwoWayPostHocTable(e.target.value);
    });

    // Handle tab changes to dynamically hide/show sidebar filters
    document.querySelectorAll('button[data-bs-toggle="tab"]').forEach(tabEl => {
        tabEl.addEventListener('shown.bs.tab', event => {
            const tabId = event.target.id;
            if (tabId === 'oneway-tab') {
                handleFactorChange();
            } else if (tabId === 'twoway-tab') {
                // Two-Way uses all Biochars and Concentrations, so hide those filters
                document.getElementById("filter-biochar-group").style.display = "none";
                document.getElementById("filter-concentration-group").style.display = "none";
                document.getElementById("filter-day-group").style.display = "block";
            }
        });
    });
});

// Fetch configuration options from backend metadata API
function fetchMetadata() {
    fetch("/api/metadata")
        .then(response => response.json())
        .then(data => {
            if (data.status === "success") {
                metadata = data.metadata;
                // Initialize selectors for Onion (default selected)
                populateSelectors("Onion");
                handleFactorChange(); // Adjust initial filter visibility
            } else {
                showError("Failed to fetch metadata from server: " + data.message);
            }
        })
        .catch(error => {
            showError("Network error fetching metadata: " + error.message);
        });
}

// Populate dropdowns based on crop selection
function populateSelectors(crop) {
    const cropData = metadata[crop];
    if (!cropData) return;

    // Populate Variables
    const varSelect = document.getElementById("variable");
    varSelect.innerHTML = "";
    cropData.variables.forEach(v => {
        const opt = document.createElement("option");
        opt.value = v;
        opt.textContent = v;
        varSelect.appendChild(opt);
    });

    // Populate Biochars
    const biocharSelect = document.getElementById("biochar_filter");
    biocharSelect.innerHTML = "";
    // Add Control first, then treatments
    const ctrlOpt = document.createElement("option");
    ctrlOpt.value = "Control";
    ctrlOpt.textContent = "Control";
    biocharSelect.appendChild(ctrlOpt);
    
    cropData.biochars.forEach(b => {
        const opt = document.createElement("option");
        opt.value = b;
        opt.textContent = b;
        biocharSelect.appendChild(opt);
    });

    // Populate Days
    const daySelect = document.getElementById("day");
    daySelect.innerHTML = "";
    cropData.days.forEach(d => {
        const opt = document.createElement("option");
        opt.value = d;
        opt.textContent = d;
        daySelect.appendChild(opt);
    });

    // Populate Concentrations
    const concSelect = document.getElementById("concentration_filter");
    concSelect.innerHTML = "";
    cropData.concentrations.forEach(c => {
        const opt = document.createElement("option");
        opt.value = c;
        opt.textContent = c + " g/L";
        concSelect.appendChild(opt);
    });
}

function handleCropChange(e) {
    populateSelectors(e.target.value);
}

// Adjust filter dropdown visibilities depending on X-axis factor selection (One-Way only)
function handleFactorChange() {
    // Only apply if One-Way tab is active
    const activeTab = document.querySelector("#analysisTabs button.active");
    if (!activeTab || activeTab.id !== "oneway-tab") return;

    const factor = document.getElementById("factor").value;
    
    const biocharGroup = document.getElementById("filter-biochar-group");
    const dayGroup = document.getElementById("filter-day-group");
    const concGroup = document.getElementById("filter-concentration-group");

    if (factor === "Concentration") {
        biocharGroup.style.display = "block";
        dayGroup.style.display = "block";
        concGroup.style.display = "none";
    } else if (factor === "Biochar") {
        biocharGroup.style.display = "none";
        dayGroup.style.display = "block";
        concGroup.style.display = "block";
    } else if (factor === "Day") {
        biocharGroup.style.display = "block";
        dayGroup.style.display = "none";
        concGroup.style.display = "block";
    }
}

// Trigger One-Way ANOVA computation
function handleOneWayRun() {
    hideError();
    document.getElementById("oneway-results").style.display = "none";

    const crop = document.getElementById("crop").value;
    const variable = document.getElementById("variable").value;
    const day = document.getElementById("day").value;
    const factor = document.getElementById("factor").value;
    const biochar_filter = document.getElementById("biochar_filter").value;
    const concentration_filter = document.getElementById("concentration_filter").value;

    const params = new URLSearchParams({
        crop,
        variable,
        day,
        factor,
        biochar_filter,
        concentration_filter
    });

    const runBtn = document.getElementById("run-oneway");
    const originalText = runBtn.textContent;
    runBtn.disabled = true;
    runBtn.textContent = "Running calculations...";

    fetch("/api/one-way?" + params.toString())
        .then(response => {
            if (!response.ok) {
                return response.json().then(err => { throw new Error(err.message || "Server error"); });
            }
            return response.json();
        })
        .then(data => {
            if (data.status === "success") {
                renderOneWayResults(data);
            } else {
                showError(data.message);
            }
        })
        .catch(error => {
            showError("Error: " + error.message);
        })
        .finally(() => {
            runBtn.disabled = false;
            runBtn.textContent = originalText;
        });
}

// Display One-Way results in the UI
function renderOneWayResults(data) {
    // 1. Descriptive statistics
    const summaryBody = document.querySelector("#summary-table tbody");
    summaryBody.innerHTML = "";
    data.summary_stats.forEach(row => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><strong>${row.Group}</strong></td>
            <td>${row.N}</td>
            <td>${row.Sum.toFixed(4)}</td>
            <td class="table-success fw-bold">${row.Mean.toFixed(4)}</td>
            <td>${row.Variance.toFixed(4)}</td>
            <td>${row.SD.toFixed(4)}</td>
            <td>${row.SumSq.toFixed(4)}</td>
        `;
        summaryBody.appendChild(tr);
    });

    // 2. ANOVA Table
    const anovaBody = document.querySelector("#anova-table tbody");
    anovaBody.innerHTML = "";
    
    const between = data.anova_table.Between;
    const within = data.anova_table.Within;
    const total = data.anova_table.Total;
    
    // Significance stars
    let sigStar = "ns";
    if (between.p_value < 0.001) sigStar = "***";
    else if (between.p_value < 0.01) sigStar = "**";
    else if (between.p_value < 0.05) sigStar = "*";

    anovaBody.innerHTML = `
        <tr>
            <td><strong>Between Groups (Treatment)</strong></td>
            <td>${between.SS.toFixed(4)}</td>
            <td>${between.df}</td>
            <td>${between.MS.toFixed(4)}</td>
            <td>${between.F.toFixed(4)}</td>
            <td class="fw-bold text-success">${between.p_value.toFixed(4)}</td>
            <td><span class="badge bg-success">${sigStar}</span></td>
        </tr>
        <tr>
            <td><strong>Within Groups (Error)</strong></td>
            <td>${within.SS.toFixed(4)}</td>
            <td>${within.df}</td>
            <td>${within.MS.toFixed(4)}</td>
            <td>-</td>
            <td>-</td>
            <td>-</td>
        </tr>
        <tr class="table-secondary">
            <td><strong>Total</strong></td>
            <td>${total.SS.toFixed(4)}</td>
            <td>${total.df}</td>
            <td>-</td>
            <td>-</td>
            <td>-</td>
            <td>-</td>
        </tr>
    `;

    // ANOVA Inference summary
    const inferenceDiv = document.getElementById("anova-inference");
    if (data.anova_table.Significant) {
        inferenceDiv.innerHTML = `<strong>Inference Summary:</strong> <span class="text-danger fw-bold">Statistically Significant (p < 0.05).</span> Reject null hypothesis H<sub>0</sub>. There is a statistically significant difference in mean ${data.variable} across different levels of ${data.factor}. Tukey HSD post-hoc test comparisons are valid.`;
    } else {
        inferenceDiv.innerHTML = `<strong>Inference Summary:</strong> <span class="text-secondary">Not Statistically Significant (p &ge; 0.05).</span> Fail to reject H<sub>0</sub>. There is no statistically significant difference in mean ${data.variable} across different levels of ${data.factor}.`;
    }

    // 3. Shapiro-Wilk Table
    const shapiroBody = document.querySelector("#shapiro-table tbody");
    shapiroBody.innerHTML = "";
    data.shapiro_results.forEach(row => {
        const tr = document.createElement("tr");
        const normalText = row.Normal === null ? "N/A" : (row.Normal ? "<span class='text-success fw-bold'>Yes</span>" : "<span class='text-danger fw-bold'>No</span>");
        const wStat = row.Statistic !== null ? row.Statistic.toFixed(4) : "-";
        const pValue = row.p_value !== null ? row.p_value.toFixed(4) : row.Note || "-";
        
        tr.innerHTML = `
            <td><strong>${row.Group}</strong></td>
            <td>${wStat}</td>
            <td>${pValue}</td>
            <td>${normalText}</td>
        `;
        shapiroBody.appendChild(tr);
    });

    // 4. Levene Test
    document.getElementById("levene-stat").textContent = data.levene_result.Statistic.toFixed(4);
    document.getElementById("levene-p").textContent = data.levene_result.p_value.toFixed(4);
    
    const levAlert = document.getElementById("levene-alert");
    if (data.levene_result.Equal_Variance) {
        levAlert.className = "alert alert-success mb-0 py-2";
        levAlert.innerHTML = `<strong>Assumption Met:</strong> Variance homogeneity satisfied (p &ge; 0.05). Standard ANOVA calculations are scientifically valid.`;
    } else {
        levAlert.className = "alert alert-warning mb-0 py-2";
        levAlert.innerHTML = `<strong>Assumption Violated:</strong> Heteroscedasticity detected (p < 0.05). Variances are unequal. Standard ANOVA robustness is reduced.`;
    }

    // 5. Tukey HSD Table
    const tukeyBody = document.querySelector("#tukey-table tbody");
    tukeyBody.innerHTML = "";
    data.tukey_results.forEach(row => {
        const tr = document.createElement("tr");
        const sigText = row.reject ? "<span class='text-danger fw-bold'>Significant</span>" : "<span class='text-secondary'>Not Significant</span>";
        tr.innerHTML = `
            <td><strong>${row.group1} vs ${row.group2}</strong></td>
            <td>${row.meandiff.toFixed(4)}</td>
            <td class="${row.reject ? 'text-success fw-bold' : ''}">${row.p_adj.toFixed(4)}</td>
            <td>[${row.lower.toFixed(4)}, ${row.upper.toFixed(4)}]</td>
            <td>${sigText}</td>
        `;
        tukeyBody.appendChild(tr);
    });

    // 6. Exposed Hidden Debug details
    document.getElementById("oneway-debug-panel").textContent = JSON.stringify(data.debug_details, null, 2);

    // 7. Render Scatter Plot Chart
    drawOneWayScatterPlot(data);

    // Show the results section
    document.getElementById("oneway-results").style.display = "block";
}

// Render replication points and group means on Chart.js for One-Way
function drawOneWayScatterPlot(data) {
    if (activeOneWayChart) {
        activeOneWayChart.destroy();
    }

    const ctx = document.getElementById("boxplot-canvas").getContext("2d");
    
    const groupNames = data.summary_stats.map(s => s.Group);
    
    // Prepare replicates dataset (with jitter)
    const scatterPoints = [];
    data.raw_data_points.forEach(pt => {
        const groupIdx = groupNames.indexOf(pt.Group);
        const jitter = (Math.random() - 0.5) * 0.22;
        scatterPoints.push({
            x: groupIdx + jitter,
            y: pt.Value
        });
    });

    // Prepare Means dataset (no jitter, larger marker)
    const meanPoints = data.summary_stats.map((s, idx) => ({
        x: idx,
        y: s.Mean
    }));

    activeOneWayChart = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [
                {
                    label: 'Replicate Observations',
                    data: scatterPoints,
                    backgroundColor: 'rgba(25, 135, 84, 0.4)',
                    borderColor: 'rgba(25, 135, 84, 0.7)',
                    borderWidth: 1,
                    pointRadius: 6,
                    pointHoverRadius: 8
                },
                {
                    label: 'Group Mean',
                    data: meanPoints,
                    backgroundColor: '#d9480f',
                    borderColor: '#b23b07',
                    borderWidth: 2,
                    pointRadius: 10,
                    pointStyle: 'rectRot',
                    pointHoverRadius: 12
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'linear',
                    position: 'bottom',
                    title: {
                        display: true,
                        text: 'Grouping Levels (' + data.factor + ')'
                    },
                    ticks: {
                        stepSize: 1,
                        callback: function(value, index, values) {
                            if (value >= 0 && value < groupNames.length && Number.isInteger(value)) {
                                return groupNames[value];
                            }
                            return '';
                        }
                    },
                    min: -0.5,
                    max: groupNames.length - 0.5
                },
                y: {
                    title: {
                        display: true,
                        text: data.variable + ' (cm)'
                    }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            if (context.datasetIndex === 1) {
                                return 'Group Mean: ' + context.raw.y.toFixed(4) + ' cm';
                            }
                            const groupLabel = groupNames[Math.round(context.raw.x)];
                            return `Group ${groupLabel}: ${context.raw.y.toFixed(4)} cm`;
                        }
                    }
                }
            }
        }
    });
}

// Trigger Two-Way ANOVA computation
function handleTwoWayRun() {
    hideError();
    document.getElementById("twoway-results").style.display = "none";

    const crop = document.getElementById("crop").value;
    const variable = document.getElementById("variable").value;
    const day = document.getElementById("day").value;

    const params = new URLSearchParams({
        crop,
        variable,
        day
    });

    const runBtn = document.getElementById("run-twoway");
    const originalText = runBtn.textContent;
    runBtn.disabled = true;
    runBtn.textContent = "Running calculations...";

    fetch("/api/two-way?" + params.toString())
        .then(response => {
            if (!response.ok) {
                return response.json().then(err => { throw new Error(err.message || "Server error"); });
            }
            return response.json();
        })
        .then(data => {
            if (data.status === "success") {
                renderTwoWayResults(data);
            } else {
                showError(data.message);
            }
        })
        .catch(error => {
            showError("Error: " + error.message);
        })
        .finally(() => {
            runBtn.disabled = false;
            runBtn.textContent = originalText;
        });
}

// Display Two-Way results in the UI
function renderTwoWayResults(data) {
    // 1. Render Cell Replication & Means Grid
    const thead = document.querySelector("#twoway-means-table thead");
    thead.innerHTML = "";
    const tbody = document.querySelector("#twoway-means-table tbody");
    tbody.innerHTML = "";

    const concs = data.debug_details.factor_levels.Concentration;
    
    // Header Row
    const headerTr = document.createElement("tr");
    headerTr.innerHTML = `<th class="bg-light">Biochar Type</th>`;
    concs.forEach(c => {
        headerTr.innerHTML += `<th class="bg-light text-center">${c === 0 ? "Control (0.0 g/L)" : c + " g/L"}</th>`;
    });
    thead.appendChild(headerTr);

    // Data Rows
    data.cell_means.forEach(row => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td class="fw-bold">${row.Biochar}</td>`;
        concs.forEach(c => {
            const cell = row[c.toString()] || row[c];
            if (cell && cell.N > 0) {
                const isControlCell = (c === 0);
                const cellBgClass = isControlCell ? "table-light" : "";
                tr.innerHTML += `
                    <td class="text-center ${cellBgClass}">
                        <div class="fw-bold text-success">${cell.Mean.toFixed(4)}</div>
                        <div class="text-muted" style="font-size: 0.75rem;">SD: ${cell.SD.toFixed(4)} (N=${cell.N})</div>
                    </td>
                `;
            } else {
                tr.innerHTML += `<td class="text-muted text-center">-</td>`;
            }
        });
        tbody.appendChild(tr);
    });

    // 2. Render Type III ANOVA Table
    const anovaBody = document.querySelector("#twoway-anova-table tbody");
    anovaBody.innerHTML = "";

    const keyLabels = {
        "Intercept": "Intercept",
        "C(Biochar, Sum)": "Biochar Type (Factor A)",
        "C(Concentration, Sum)": "Concentration (Factor B)",
        "C(Biochar, Sum):C(Concentration, Sum)": "Biochar &times; Concentration (Interaction)",
        "Residual": "Error (Residuals)"
    };

    let calculatedTotalSS = 0;
    let calculatedTotalDf = 0;

    Object.keys(keyLabels).forEach(key => {
        const row = data.anova_table[key];
        if (!row) return;

        const isResidual = (key === "Residual");
        const isIntercept = (key === "Intercept");

        if (!isIntercept) {
            calculatedTotalSS += row.SS;
            calculatedTotalDf += row.df;
        }

        const ssStr = row.SS.toFixed(4);
        const dfStr = row.df;
        const msStr = row.MS.toFixed(4);
        const fStr = typeof row.F === 'number' ? row.F.toFixed(4) : "-";
        
        let pStr = "-";
        let sigStar = "-";
        if (typeof row.p_value === 'number') {
            pStr = row.p_value.toFixed(6);
            if (row.p_value < 0.001) sigStar = "***";
            else if (row.p_value < 0.01) sigStar = "**";
            else if (row.p_value < 0.05) sigStar = "*";
            else sigStar = "ns";
        }

        const tr = document.createElement("tr");
        if (key === "C(Biochar, Sum):C(Concentration, Sum)") {
            tr.className = "table-info-subtle";
        }
        
        tr.innerHTML = `
            <td><strong>${keyLabels[key]}</strong></td>
            <td>${ssStr}</td>
            <td>${dfStr}</td>
            <td>${msStr}</td>
            <td>${fStr}</td>
            <td class="${typeof row.p_value === 'number' && row.p_value < 0.05 ? 'text-success fw-bold' : ''}">${pStr}</td>
            <td><span class="badge ${sigStar === 'ns' || sigStar === '-' ? 'bg-secondary' : 'bg-success'}">${sigStar}</span></td>
        `;
        anovaBody.appendChild(tr);
    });

    // Total Row
    const totalTr = document.createElement("tr");
    totalTr.className = "table-secondary";
    totalTr.innerHTML = `
        <td><strong>Total (Corrected)</strong></td>
        <td>${calculatedTotalSS.toFixed(4)}</td>
        <td>${calculatedTotalDf}</td>
        <td>-</td>
        <td>-</td>
        <td>-</td>
        <td>-</td>
    `;
    anovaBody.appendChild(totalTr);

    // 3. Render Two-Way Inference Summary
    const inferenceDiv = document.getElementById("twoway-inference");
    const p_A = data.anova_table["C(Biochar, Sum)"]?.p_value;
    const p_B = data.anova_table["C(Concentration, Sum)"]?.p_value;
    const p_AB = data.anova_table["C(Biochar, Sum):C(Concentration, Sum)"]?.p_value;

    const sigA = p_A !== undefined && p_A < 0.05;
    const sigB = p_B !== undefined && p_B < 0.05;
    const sigAB = p_AB !== undefined && p_AB < 0.05;

    let inferenceHtml = `<strong>Inference Summary:</strong><ul class="mb-0 mt-1">`;
    inferenceHtml += `<li><strong>Factor A (Biochar):</strong> ${sigA ? `<span class="text-success fw-bold">Significant (p = ${p_A.toFixed(4)})</span>. Biochar types differ in their general effect.` : `<span class="text-muted">Not Significant (p = ${p_A.toFixed(4)})</span>.`}</li>`;
    inferenceHtml += `<li><strong>Factor B (Concentration):</strong> ${sigB ? `<span class="text-success fw-bold">Significant (p = ${p_B.toFixed(4)})</span>. Biochar concentrations differ in their general effect.` : `<span class="text-muted">Not Significant (p = ${p_B.toFixed(4)})</span>.`}</li>`;
    inferenceHtml += `<li><strong>Interaction (Biochar &times; Concentration):</strong> ${sigAB ? `<span class="text-danger fw-bold">Significant (p = ${p_AB.toFixed(4)})</span>. The response curves are non-parallel.` : `<span class="text-muted">Not Significant (p = ${p_AB.toFixed(4)})</span>.`}</li>`;
    inferenceHtml += `</ul>`;

    if (sigAB) {
        inferenceHtml += `
            <div class="alert alert-warning mt-3 mb-0 py-2" style="font-size: 0.85rem;">
                <strong>Scientific Interpretation Rule:</strong> Because the interaction effect is statistically significant (p < 0.05), you <strong>cannot</strong> interpret the main effects of Biochar or Concentration directly. Focus instead on the **Simple Main Effects** post-hoc Tukey comparisons shown below.
            </div>
        `;
    } else {
        inferenceHtml += `
            <div class="alert alert-success mt-3 mb-0 py-2" style="font-size: 0.85rem;">
                <strong>Scientific Interpretation Rule:</strong> Because the interaction effect is not significant, the main effects can be interpreted directly. Main effects indicate consistent trends across all groups.
            </div>
        `;
    }
    inferenceDiv.innerHTML = inferenceHtml;

    // 4. Plot Interaction Line Chart
    drawTwoWayInteractionPlot(data);

    // 5. Setup Simple Main Effects Post-Hoc comparisons
    twoWayPostHocData = data.posthoc_results;
    
    const biocharSelect = document.getElementById("posthoc-biochar-select");
    biocharSelect.innerHTML = "";
    
    const treatmentBiochars = Object.keys(twoWayPostHocData);
    treatmentBiochars.forEach(b => {
        const opt = document.createElement("option");
        opt.value = b;
        opt.textContent = b;
        biocharSelect.appendChild(opt);
    });

    if (treatmentBiochars.length > 0) {
        biocharSelect.value = treatmentBiochars[0];
        renderTwoWayPostHocTable(treatmentBiochars[0]);
        document.getElementById("twoway-posthoc-card").style.display = "block";
    } else {
        document.getElementById("twoway-posthoc-card").style.display = "none";
    }

    // 6. Output Debug details
    document.getElementById("twoway-debug-panel").textContent = JSON.stringify(data.debug_details, null, 2);

    // Show results section
    document.getElementById("twoway-results").style.display = "block";
}

// Render Simple Main Effects pairwise comparison table for chosen Biochar
function renderTwoWayPostHocTable(biochar) {
    const tbody = document.querySelector("#twoway-posthoc-table tbody");
    tbody.innerHTML = "";

    const comparisons = twoWayPostHocData[biochar];
    if (!comparisons || comparisons.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">No comparisons available</td></tr>`;
        return;
    }

    comparisons.forEach(row => {
        const tr = document.createElement("tr");
        const sigText = row.reject ? "<span class='text-danger fw-bold'>Significant</span>" : "<span class='text-secondary'>Not Significant</span>";
        tr.innerHTML = `
            <td><strong>${row.group1} vs ${row.group2}</strong></td>
            <td>${row.meandiff.toFixed(4)}</td>
            <td class="${row.reject ? 'text-success fw-bold' : ''}">${row.p_adj.toFixed(6)}</td>
            <td>[${row.lower.toFixed(4)}, ${row.upper.toFixed(4)}]</td>
            <td>${sigText}</td>
        `;
        tbody.appendChild(tr);
    });
}

// Draw dose response interaction curves using Chart.js
function drawTwoWayInteractionPlot(data) {
    if (activeTwoWayChart) {
        activeTwoWayChart.destroy();
    }

    const ctx = document.getElementById("interaction-canvas").getContext("2d");
    const plotData = data.interaction_plot_data;
    
    // Curated sleek botanical theme colors
    const colors = [
        '#198754', // Forest Green
        '#0d6efd', // Royal Blue
        '#d63384', // Magenta Pink
        '#fd7e14', // Warm Orange
        '#6f42c1', // Deep Purple
        '#20c997'  // Teal
    ];

    const datasets = [];
    let colorIdx = 0;

    Object.keys(plotData).forEach(biochar => {
        // Sort coordinate points by concentration (x)
        const sortedPoints = plotData[biochar].sort((a, b) => a.x - b.x);
        
        const color = colors[colorIdx % colors.length];
        colorIdx++;

        datasets.push({
            label: biochar,
            data: sortedPoints,
            borderColor: color,
            backgroundColor: color,
            borderWidth: 3,
            pointRadius: 6,
            pointHoverRadius: 8,
            tension: 0.1, // slight smoothing curve
            fill: false
        });
    });

    activeTwoWayChart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'linear',
                    position: 'bottom',
                    title: {
                        display: true,
                        text: 'Biochar Concentration (g/L)'
                    },
                    ticks: {
                        // explicitly display measured concentration ticks
                        stepSize: 0.5,
                        callback: function(value) {
                            return value === 0 ? "0.0 (Ctrl)" : value.toFixed(1) + " g/L";
                        }
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Mean ' + data.variable + ' (cm)'
                    }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label} (${context.raw.x} g/L): ${context.raw.y.toFixed(4)} cm`;
                        }
                    }
                }
            }
        }
    });
}

function toggleDebug(type) {
    const debugDiv = document.getElementById(type + "-debug-container");
    debugDiv.style.display = debugDiv.style.display === "none" ? "block" : "none";
}

function showError(msg) {
    const errorDiv = document.getElementById("error-banner");
    errorDiv.textContent = msg;
    errorDiv.style.display = "block";
    errorDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideError() {
    const errorDiv = document.getElementById("error-banner");
    if (errorDiv) {
        errorDiv.style.display = "none";
    }
}
