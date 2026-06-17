// ANOVA Calculator Frontend Script (MVP)

// Helper to format group names (e.g. 0.0 to Control)
function formatGroupName(name) {
    const nameStr = String(name).trim();
    if (nameStr === "0.0" || nameStr === "0") {
        return "Control";
    }
    return name;
}

// Helper to generate a chart base64 image with a solid white background
function getChartImageWithWhiteBackground(chart) {
    if (!chart) return "";
    const tempCanvas = document.createElement("canvas");
    const ctx = tempCanvas.getContext("2d");
    const chartCanvas = chart.canvas;
    
    tempCanvas.width = chartCanvas.width;
    tempCanvas.height = chartCanvas.height;
    
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    ctx.drawImage(chartCanvas, 0, 0);
    
    return tempCanvas.toDataURL("image/png");
}

let metadata = {};
let activeOneWayChart = null;
let activeTwoWayChart = null;
let twoWayPostHocData = {};
let lastOneWayData = null;
let currentGraphMode = 'dist'; // 'dist' or 'pub'

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

    // Listen to changes in graph view mode
    document.querySelectorAll('input[name="graphMode"]').forEach(radio => {
        radio.addEventListener("change", (e) => {
            currentGraphMode = e.target.id === 'mode-pub' ? 'pub' : 'dist';
            if (lastOneWayData) {
                drawOneWayScatterPlot(lastOneWayData);
            }
        });
    });

    // Download chart button listener
    const downloadBtn = document.getElementById("download-oneway-chart");
    if (downloadBtn) {
        downloadBtn.addEventListener("click", () => {
            if (!activeOneWayChart) return;
            
            const crop = document.getElementById("crop").value;
            const variable = document.getElementById("variable").value.replace(/\s+/g, "");
            const day = document.getElementById("day").value.replace(/\s+/g, "");
            
            let factorSuffix = "";
            const factor = document.getElementById("factor").value;
            if (factor === "Concentration") {
                factorSuffix = document.getElementById("biochar_filter").value.replace(/\s+/g, "");
            } else if (factor === "Biochar") {
                const concVal = document.getElementById("concentration_filter").value;
                factorSuffix = "Conc" + concVal.replace(".", "_");
            } else {
                factorSuffix = factor;
            }
            
            const filename = `${crop}_${variable}_${day}_${factorSuffix}.png`;
            
            const link = document.createElement('a');
            link.download = filename;
            link.href = getChartImageWithWhiteBackground(activeOneWayChart);
            link.click();
        });
    }

    // Download Excel Report button listener
    const downloadExcelBtn = document.getElementById("download-oneway-excel");
    if (downloadExcelBtn) {
        downloadExcelBtn.addEventListener("click", () => {
            if (!lastOneWayData) return;
            
            const originalText = downloadExcelBtn.textContent;
            downloadExcelBtn.disabled = true;
            downloadExcelBtn.textContent = "Generating Report...";
            
            const crop = document.getElementById("crop").value;
            const variable = document.getElementById("variable").value;
            const day = document.getElementById("day").value;
            const factor = document.getElementById("factor").value;
            const biochar = document.getElementById("biochar_filter").value;
            
            // Generate PNG base64 from active Chart.js instance with solid white background
            const chartImage = activeOneWayChart ? getChartImageWithWhiteBackground(activeOneWayChart) : "";
            
            // Build statistical interpretation text same as UI
            const isSignificant = lastOneWayData.anova_table.Significant;
            const alpha_val = lastOneWayData.alpha || 0.05;
            let inferenceSummary = "";
            if (isSignificant) {
                inferenceSummary = `Statistically Significant (p < ${alpha_val}). Reject null hypothesis H0. There is a statistically significant difference in mean ${lastOneWayData.variable} across different levels of ${lastOneWayData.factor}. Tukey HSD post-hoc test comparisons are valid.`;
            } else {
                inferenceSummary = `Not Statistically Significant (p >= ${alpha_val}). Fail to reject H0. There is no statistically significant difference in mean ${lastOneWayData.variable} across different levels of ${lastOneWayData.factor}.`;
            }
            
            const payload = {
                crop,
                variable,
                day,
                factor,
                biochar,
                alpha: alpha_val,
                summary_stats: lastOneWayData.summary_stats,
                anova_table: lastOneWayData.anova_table,
                eta_squared: lastOneWayData.eta_squared,
                eta_interpretation: lastOneWayData.eta_interpretation,
                levene_result: lastOneWayData.levene_result,
                shapiro_results: lastOneWayData.shapiro_results,
                tukey_results: lastOneWayData.tukey_results,
                tukey_letters: lastOneWayData.tukey_letters,
                control_response: lastOneWayData.control_response,
                inference_summary: inferenceSummary,
                chart_image: chartImage
            };
            
            fetch("/api/export-excel", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error("Failed to generate Excel report");
                }
                return response.blob();
            })
            .then(blob => {
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                
                let factorSuffix = "";
                if (factor === "Concentration") {
                    factorSuffix = biochar.replace(/\s+/g, "");
                } else if (factor === "Biochar") {
                    const concVal = document.getElementById("concentration_filter").value;
                    factorSuffix = "Conc" + concVal.replace(".", "_");
                } else {
                    factorSuffix = factor;
                }
                
                a.download = `${crop}_${variable.replace(/\s+/g, "")}_${day.replace(/\s+/g, "")}_${factorSuffix}_Report.xlsx`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
            })
            .catch(error => {
                showError("Excel Export Error: " + error.message);
            })
            .finally(() => {
                downloadExcelBtn.disabled = false;
                downloadExcelBtn.textContent = originalText;
            });
        });
    }

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
    const alpha = document.getElementById("alpha").value;

    const params = new URLSearchParams({
        crop,
        variable,
        day,
        factor,
        biochar_filter,
        concentration_filter,
        alpha
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
        const seVal = row.SE !== undefined ? row.SE : (row.SD / Math.sqrt(row.N));
        tr.innerHTML = `
            <td><strong>${formatGroupName(row.Group)}</strong></td>
            <td>${row.N}</td>
            <td>${row.Sum.toFixed(4)}</td>
            <td class="table-success fw-bold">${row.Mean.toFixed(4)}</td>
            <td>${row.Variance.toFixed(4)}</td>
            <td>${row.SD.toFixed(4)}</td>
            <td>${seVal.toFixed(4)}</td>
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
            <td class="fw-bold text-success">${between.p_value_display}</td>
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
    const alpha_val = data.alpha || 0.05;
    const inferenceDiv = document.getElementById("anova-inference");
    if (data.anova_table.Significant) {
        inferenceDiv.innerHTML = `<strong>Inference Summary:</strong> <span class="text-danger fw-bold">Statistically Significant (p < ${alpha_val}).</span> Reject null hypothesis H<sub>0</sub>. There is a statistically significant difference in mean ${data.variable} across different levels of ${data.factor}. Tukey HSD post-hoc test comparisons are valid.`;
    } else {
        inferenceDiv.innerHTML = `<strong>Inference Summary:</strong> <span class="text-secondary">Not Statistically Significant (p &ge; ${alpha_val}).</span> Fail to reject H<sub>0</sub>. There is no statistically significant difference in mean ${data.variable} across different levels of ${data.factor}.`;
    }

    // Render active alpha label
    const alphaLabel = document.getElementById("anova-alpha-label");
    if (alphaLabel) {
        alphaLabel.textContent = `Statistical hypothesis-test decisions evaluated at α = ${alpha_val}`;
    }

    // Effect Size (eta squared)
    document.getElementById("eta-squared-value").textContent = data.eta_squared !== undefined ? data.eta_squared.toFixed(4) : "N/A";
    document.getElementById("eta-squared-interpretation").textContent = data.eta_interpretation !== undefined ? data.eta_interpretation + " treatment effect detected" : "N/A";

    // 3. Shapiro-Wilk Table
    const shapiroBody = document.querySelector("#shapiro-table tbody");
    shapiroBody.innerHTML = "";
    data.shapiro_results.forEach(row => {
        const tr = document.createElement("tr");
        const normalText = row.Normal === null ? "N/A" : (row.Normal ? "<span class='text-success fw-bold'>Approximately normal</span>" : "<span class='text-warning fw-bold'>Possible deviation from normality</span>");
        const wStat = row.Statistic !== null ? row.Statistic.toFixed(4) : "-";
        const pValue = row.p_value_display || row.Note || "-";
        
        tr.innerHTML = `
            <td><strong>${formatGroupName(row.Group)}</strong></td>
            <td>${wStat}</td>
            <td>${pValue}</td>
            <td>${normalText}</td>
        `;
        shapiroBody.appendChild(tr);
    });

    // 4. Levene Test
    document.getElementById("levene-stat").textContent = data.levene_result.Statistic.toFixed(4);
    document.getElementById("levene-p").textContent = data.levene_result.p_value_display;
    
    const levAlert = document.getElementById("levene-alert");
    if (data.levene_result.Equal_Variance) {
        levAlert.className = "alert alert-success mb-0 py-2";
        levAlert.innerHTML = `<strong>Homogeneity of variance assumption satisfied.</strong><br><br><small><strong>Interpretation:</strong><br>Variances appear sufficiently equal across treatment groups. Standard ANOVA assumptions are met.</small>`;
    } else {
        levAlert.className = "alert alert-warning mb-0 py-2";
        levAlert.innerHTML = `<strong>Homogeneity of variance assumption may be violated.</strong><br><br><small><strong>Interpretation:</strong><br>Group variances differ significantly. ANOVA is generally robust to moderate variance differences when group sizes are equal, but results should be interpreted cautiously.</small>`;
    }

    // 5. Tukey HSD Table
    const tukeyBody = document.querySelector("#tukey-table tbody");
    tukeyBody.innerHTML = "";
    data.tukey_results.forEach(row => {
        const tr = document.createElement("tr");
        const sigText = row.reject ? "<span class='text-danger fw-bold'>Significant</span>" : "<span class='text-secondary'>Not Significant</span>";
        tr.innerHTML = `
            <td><strong>${formatGroupName(row.group1)} vs ${formatGroupName(row.group2)}</strong></td>
            <td>${row.meandiff.toFixed(4)}</td>
            <td>${(row.q_stat !== undefined && row.q_stat !== null) ? row.q_stat.toFixed(4) : "N/A"}</td>
            <td class="${row.reject ? 'text-success fw-bold' : ''}">${row.p_adj_display}</td>
            <td>[${row.lower.toFixed(4)}, ${row.upper.toFixed(4)}]</td>
            <td>${sigText}</td>
        `;
        tukeyBody.appendChild(tr);
    });

    // 5b. Significance Letter Groupings (Tukey CLD)
    const cldBody = document.querySelector("#cld-table tbody");
    cldBody.innerHTML = "";
    if (data.tukey_letters) {
        const sortedGroups = Object.keys(data.tukey_letters).sort((a, b) => {
            const meanA = data.summary_stats.find(s => formatGroupName(s.Group) === a)?.Mean || 0;
            const meanB = data.summary_stats.find(s => formatGroupName(s.Group) === b)?.Mean || 0;
            return meanB - meanA;
        });
        
        sortedGroups.forEach(gName => {
            const meanVal = data.summary_stats.find(s => formatGroupName(s.Group) === gName)?.Mean || 0;
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td><strong>${gName}</strong></td>
                <td>${meanVal.toFixed(4)}</td>
                <td><strong style="color: #212529; font-size: 1.1rem;">${data.tukey_letters[gName]}</strong></td>
            `;
            cldBody.appendChild(tr);
        });
    }

    // 5c. Control vs Treatment Response Summary
    const controlCard = document.getElementById("control-response-card");
    const controlBody = document.querySelector("#control-response-table tbody");
    controlBody.innerHTML = "";
    
    if (data.control_response && data.control_response.length > 0) {
        controlCard.style.display = "block";
        data.control_response.forEach(row => {
            const tr = document.createElement("tr");
            const pct = row.pct_change;
            const pctStr = pct >= 0 ? `+${pct.toFixed(1)}%` : `${pct.toFixed(1)}%`;
            
            let badgeClass = "text-secondary";
            if (row.interpretation.toLowerCase().includes("substantial growth improvement")) {
                badgeClass = "text-success fw-bold";
            } else if (row.interpretation.toLowerCase().includes("strong growth inhibition")) {
                badgeClass = "text-danger fw-bold";
            } else if (row.interpretation.toLowerCase().includes("slight growth inhibition")) {
                badgeClass = "text-warning fw-bold";
            } else if (row.interpretation.toLowerCase().includes("slight growth improvement")) {
                badgeClass = "text-info fw-bold";
            }
            
            tr.innerHTML = `
                <td><strong>${formatGroupName(row.treatment)}</strong></td>
                <td>${row.diff >= 0 ? '+' : ''}${row.diff.toFixed(4)}</td>
                <td><strong>${pctStr}</strong></td>
                <td><span class="${badgeClass}">${row.interpretation}</span></td>
            `;
            controlBody.appendChild(tr);
        });
    } else {
        controlCard.style.display = "none";
    }

    // 6. Exposed Hidden Debug details
    document.getElementById("oneway-debug-panel").textContent = JSON.stringify(data.debug_details, null, 2);

    // Save data for re-drawing
    lastOneWayData = data;

    // 7. Render Scatter Plot Chart
    drawOneWayScatterPlot(data);

    // Show the results section
    document.getElementById("oneway-results").style.display = "block";
}

// // Render replication points and group means on Chart.js for One-Way
function drawOneWayScatterPlot(data) {
    if (activeOneWayChart) {
        activeOneWayChart.destroy();
    }

    const ctx = document.getElementById("boxplot-canvas").getContext("2d");
    const groupNames = data.summary_stats.map(s => formatGroupName(s.Group));
    
    // Axis label mapping
    let xAxisLabel = data.factor;
    if (data.factor === "Concentration") xAxisLabel = "Biochar Concentration (g/L)";
    else if (data.factor === "Biochar") xAxisLabel = "Biochar Type";
    else if (data.factor === "Day") xAxisLabel = "Measurement Day";

    // Calculate dynamic Y-axis ranges with padding for visual density
    const replicateValues = data.raw_data_points.map(pt => pt.Value);
    const minRepVal = replicateValues.length > 0 ? Math.min(...replicateValues) : 0;
    const maxRepVal = replicateValues.length > 0 ? Math.max(...replicateValues) : 10;
    
    const meansWithSE = data.summary_stats.map(s => s.Mean + (s.SE !== undefined ? s.SE : 0));
    const maxMeanWithSE = meansWithSE.length > 0 ? Math.max(...meansWithSE) : 10;
    
    const overallMax = Math.max(maxRepVal, maxMeanWithSE);
    const overallMin = minRepVal;
    const dataRange = overallMax - overallMin;
    const padding = dataRange * 0.1 || 1.0; // 10% padding
    
    const scatterYMin = Math.max(0, overallMin - padding);
    const scatterYMax = overallMax + padding;
    
    const barYMax = maxMeanWithSE * 1.15 || 1.0;

    // Custom error bars plugin (attaches strictly to category centers)
    const errorBarsPlugin = {
        id: 'errorBars',
        afterDatasetsDraw(chart) {
            const { ctx, scales: { x, y } } = chart;
            const isBar = chart.config.type === 'bar';
            const meanMeta = chart.getDatasetMeta(isBar ? 0 : 1);
            const meanDataset = chart.data.datasets[isBar ? 0 : 1];
            if (!meanDataset || !meanMeta || !meanMeta.data) return;

            ctx.save();
            ctx.lineWidth = 2.0; // Slightly thickened error bars
            ctx.strokeStyle = '#212529'; // Dark charcoal matching mean marker

            meanMeta.data.forEach((point, index) => {
                let meanVal;
                if (isBar) {
                    meanVal = meanDataset.data[index];
                } else {
                    meanVal = meanDataset.data[index].y;
                }
                
                const groupName = groupNames[index];
                const stat = data.summary_stats.find(s => formatGroupName(s.Group) === groupName);
                if (!stat) return;

                const se = stat.SE !== undefined ? stat.SE : 0;
                if (se <= 0) return; // Skip if zero-variance / zero SE

                const yMin = meanVal - se;
                const yMax = meanVal + se;

                const canvasX = point.x;
                const canvasYMin = y.getPixelForValue(yMin);
                const canvasYMax = y.getPixelForValue(yMax);

                // Draw vertical error bar line
                ctx.beginPath();
                ctx.moveTo(canvasX, canvasYMin);
                ctx.lineTo(canvasX, canvasYMax);
                ctx.stroke();

                // Draw horizontal caps
                const capWidth = 6;
                ctx.beginPath();
                ctx.moveTo(canvasX - capWidth, canvasYMin);
                ctx.lineTo(canvasX + capWidth, canvasYMin);
                ctx.moveTo(canvasX - capWidth, canvasYMax);
                ctx.lineTo(canvasX + capWidth, canvasYMax);
                ctx.stroke();

                // Draw Tukey CLD letters if they exist and we are in Publication View
                if (currentGraphMode === 'pub' && data.tukey_letters) {
                    const letter = data.tukey_letters[groupName];
                    if (letter) {
                        ctx.save();
                        ctx.font = 'bold 12px sans-serif';
                        ctx.fillStyle = '#212529'; // Charcoal
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'bottom';
                        // Draw letter 8 pixels above the top error bar cap
                        ctx.fillText(letter, canvasX, canvasYMax - 8);
                        ctx.restore();
                    }
                }
            });
            ctx.restore();
         }
     };

    if (currentGraphMode === 'pub') {
        // Mode 2: Publication View (Bar Chart with Mean + SE)
        const meanValues = data.summary_stats.map(s => s.Mean);

        activeOneWayChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: groupNames,
                datasets: [
                    {
                        label: 'Mean',
                        data: meanValues,
                        backgroundColor: 'rgba(74, 85, 104, 0.8)', // clean academic slate gray
                        borderColor: 'rgba(45, 55, 72, 1)', // charcoal border
                        borderWidth: 1.5,
                        barPercentage: 0.5
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: xAxisLabel,
                            color: '#2d3748',
                            font: {
                                size: 12,
                                weight: 'bold'
                            }
                        },
                        grid: {
                            display: false
                        },
                        border: {
                            display: true,
                            color: '#2d3748',
                            width: 1.5
                        },
                        ticks: {
                            color: '#2d3748',
                            font: {
                                size: 11
                            }
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: data.variable + ' (cm)',
                            color: '#2d3748',
                            font: {
                                size: 12,
                                weight: 'bold'
                            }
                        },
                        beginAtZero: true,
                        max: barYMax,
                        grid: {
                            color: '#f1f5f9',
                            drawTicks: true
                        },
                        border: {
                            display: true,
                            color: '#2d3748',
                            width: 1.5
                        },
                        ticks: {
                            color: '#2d3748',
                            font: {
                                size: 11
                            }
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return 'Group Mean: ' + context.raw.toFixed(4) + ' cm';
                            }
                        }
                    }
                }
            },
            plugins: [errorBarsPlugin]
        });
    } else {
        // Mode 1: Distribution View (Jittered Scatter + Mean + SE)
        // Prepare replicates dataset (with jitter)
        const scatterPoints = [];
        data.raw_data_points.forEach(pt => {
            const groupIdx = groupNames.indexOf(formatGroupName(pt.Group));
            if (groupIdx === -1) return;
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
                        label: 'Replicates',
                        data: scatterPoints,
                        backgroundColor: 'rgba(33, 115, 70, 0.21)', // reduced opacity from 0.3 to 0.21 for lighter weight
                        borderColor: 'rgba(33, 115, 70, 0.25)',      // reduced opacity from 0.6 to 0.25 to prevent heavy borders
                        borderWidth: 1,
                        pointRadius: 5,                            // slightly smaller for elegance
                        pointHoverRadius: 7
                    },
                    {
                        label: 'Mean',
                        data: meanPoints,
                        backgroundColor: '#212529', // dark charcoal mean marker
                        borderColor: '#212529',
                        borderWidth: 2.5,          // thickened border
                        pointRadius: 11,           // increased marker size from 10 to 11
                        pointStyle: 'rectRot',     // rotated square (diamond)
                        pointHoverRadius: 13
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
                            text: xAxisLabel,
                            color: '#2d3748',
                            font: {
                                size: 12,
                                weight: 'bold'
                            }
                        },
                        grid: {
                            display: false
                        },
                        border: {
                            display: true,
                            color: '#2d3748',
                            width: 1.5
                        },
                        ticks: {
                            stepSize: 1,
                            color: '#2d3748',
                            font: {
                                size: 11
                            },
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
                            text: data.variable + ' (cm)',
                            color: '#2d3748',
                            font: {
                                size: 12,
                                weight: 'bold'
                            }
                        },
                        min: scatterYMin,
                        max: scatterYMax,
                        grid: {
                            color: '#f1f5f9'
                        },
                        border: {
                            display: true,
                            color: '#2d3748',
                            width: 1.5
                        },
                        ticks: {
                            color: '#2d3748',
                            font: {
                                size: 11
                            }
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            boxWidth: 12,
                            font: {
                                size: 11
                            },
                            color: '#2d3748'
                        }
                    },
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
            },
            plugins: [errorBarsPlugin]
        });
    }
}

// Trigger Two-Way ANOVA computation
function handleTwoWayRun() {
    hideError();
    document.getElementById("twoway-results").style.display = "none";

    const crop = document.getElementById("crop").value;
    const variable = document.getElementById("variable").value;
    const day = document.getElementById("day").value;
    const alpha = document.getElementById("alpha").value;

    const params = new URLSearchParams({
        crop,
        variable,
        day,
        alpha
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

    const alpha_val = data.alpha || 0.05;
    const sigA = p_A !== undefined && p_A < alpha_val;
    const sigB = p_B !== undefined && p_B < alpha_val;
    const sigAB = p_AB !== undefined && p_AB < alpha_val;

    let inferenceHtml = `<strong>Inference Summary:</strong><ul class="mb-0 mt-1">`;
    inferenceHtml += `<li><strong>Factor A (Biochar):</strong> ${sigA ? `<span class="text-success fw-bold">Significant (p = ${p_A.toFixed(4)})</span>. Biochar types differ in their general effect.` : `<span class="text-muted">Not Significant (p = ${p_A.toFixed(4)})</span>.`}</li>`;
    inferenceHtml += `<li><strong>Factor B (Concentration):</strong> ${sigB ? `<span class="text-success fw-bold">Significant (p = ${p_B.toFixed(4)})</span>. Biochar concentrations differ in their general effect.` : `<span class="text-muted">Not Significant (p = ${p_B.toFixed(4)})</span>.`}</li>`;
    inferenceHtml += `<li><strong>Interaction (Biochar &times; Concentration):</strong> ${sigAB ? `<span class="text-danger fw-bold">Significant (p = ${p_AB.toFixed(4)})</span>. The response curves are non-parallel.` : `<span class="text-muted">Not Significant (p = ${p_AB.toFixed(4)})</span>.`}</li>`;
    inferenceHtml += `</ul>`;

    if (sigAB) {
        inferenceHtml += `
            <div class="alert alert-warning mt-3 mb-0 py-2" style="font-size: 0.85rem;">
                <strong>Scientific Interpretation Rule:</strong> Because the interaction effect is statistically significant (p < ${alpha_val}), you <strong>cannot</strong> interpret the main effects of Biochar or Concentration directly. Focus instead on the **Simple Main Effects** post-hoc Tukey comparisons shown below.
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

    // Render active alpha label
    const twowayAlphaLabel = document.getElementById("twoway-alpha-label");
    if (twowayAlphaLabel) {
        twowayAlphaLabel.textContent = `Statistical hypothesis-test decisions evaluated at α = ${alpha_val}`;
    }

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
                        text: 'Biochar Concentration (g/L)',
                        color: '#2d3748',
                        font: {
                            size: 12,
                            weight: 'bold'
                        }
                    },
                    grid: {
                        display: false
                    },
                    border: {
                        display: true,
                        color: '#2d3748',
                        width: 1.5
                    },
                    ticks: {
                        stepSize: 0.5,
                        color: '#2d3748',
                        font: {
                            size: 11
                        },
                        callback: function(value) {
                            return value === 0 ? "0.0 (Ctrl)" : value.toFixed(1) + " g/L";
                        }
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Mean ' + data.variable + ' (cm)',
                        color: '#2d3748',
                        font: {
                            size: 12,
                            weight: 'bold'
                        }
                    },
                    grid: {
                        color: '#f1f5f9'
                    },
                    border: {
                        display: true,
                        color: '#2d3748',
                        width: 1.5
                    },
                    ticks: {
                        color: '#2d3748',
                        font: {
                            size: 11
                        }
                    }
                }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        boxWidth: 12,
                        font: {
                            size: 11
                        },
                        color: '#2d3748'
                    }
                },
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
