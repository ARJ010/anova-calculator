# Walkthrough - Two-Way ANOVA Development

This walkthrough documents the technical details, implementation steps, and validation results for completed tasks in the Two-Way ANOVA module.

---

## Priority 1: Assumption Diagnostics (Completed)

* **Residual Normality**: Added **Shapiro-Wilk test** on the OLS standardized residuals (`model.resid`) via `scipy.stats.shapiro`. Added robustness checks: minimum size check ($N \ge 3$) and catching warning flags for large sample sizes.
* **Homogeneity of Variance**: Added **Levene's test** centered on the median across valid cell combinations. Added validation ensuring $\ge 2$ valid cells exist.
* **UI Cards Layout**: Rendered Levene and Shapiro-Wilk side-by-side using Bootstrap columns with color-coded alerts and text interpretations.

---

## Priority 2: Biochar Subset Selection & Rendering Fix (Completed)

* **Infrastructure Reuse**: Reused the cached `metadata[crop].biochars` object loaded during startup rather than introducing a new backend endpoint. This provides instant, crop-wide list population without additional network requests.
* **Backend filtering**: In `/api/two-way` (`app.py`), the treatments dataframe is filtered using the `biochars` comma-separated query parameter:
  ```python
  if selected_biochars:
      treatments = treatments[treatments["Biochar"].isin(selected_biochars)]
  ```
  Validation returns a `400` error if fewer than 2 treatment biochars remain.
* **UI Controls**: Dynamically displays checked checkboxes for all biochars in `metadata[crop].biochars` (excluding "Control"). If fewer than 2 remain checked, the "Run" button is disabled and a clear validation banner is displayed.
* **Control (0.0 g/L) rendering fix**: Solved the key mismatch bug where integer concentrations (like `0.0`, `1.0`) returned by Python float string serialization (`"0.0"`, `"1.0"`) failed to match JavaScript integer number serialization (`"0"`, `"1"`). Updated the frontend lookup code to format indices:
  ```javascript
  const cell = row[parseFloat(c).toFixed(1)] || row[c.toString()] || row[c];
  ```

---

## Priority 2.5: Control Handling Modes (Completed)

* **Analysis Modes**: Added a selection UI in the Two-Way controls card with radio options:
  - **Include Independent Controls (Default)**: Preserves the baseline control replication strategy exactly.
  - **Exclude Shared Control**: Removes the control group (`Concentration == 0.0`) from the analysis dataset before model fitting. The complete statistical model (ANOVA table, Shapiro-Wilk, Levene, post-hoc Tukey, cell means, plot) is refit and recalculated from the reduced treatment-only dataset.
* **Dynamic Explanations**: Populates a dynamic scientific interpretation note under the radio buttons depending on selection:
  - *Include*: *"Use when each biochar species has its own independent untreated control group. This preserves the complete factorial experimental design."*
  - *Exclude*: *"Use when one untreated control group is shared across all biochar species. Excluding the shared control avoids pseudoreplication and produces a treatment-only factorial analysis."*
* **Result-status Banner**: Automatically displays a prominent notice at the top of the results panel when **Exclude Shared Control** is active:
  - *"Statistical Note: The shared control group was excluded before fitting the factorial model. Results therefore describe only treatment concentrations. Control-versus-treatment comparisons are intentionally omitted because the shared control was not part of the fitted statistical model."*
* **Tukey Post-Hoc Scope**: In *Exclude* mode, the Tukey table only displays comparisons among active treatment concentrations (e.g. `0.1 g/L vs 0.2 g/L`), completely omitting any comparisons to the control.
* **Analysis Provenance**: Returned `control_mode` and `control_mode_label` in the JSON response payload.

---

## Priority 3: Bidirectional Simple Main Effects (Completed)

* **Pooled Calculation Helper**: Implemented `calculate_simple_main_effects` helper in `app.py`. It computes pairwise Tukey HSD comparisons within each level of a grouping factor using the full fitted model's pooled residual variance ($MSE_{full}$) and residual degrees of freedom ($df_{error}$).
* **Bidirectional Payload**: The `/api/two-way` response returns a single canonical `simple_main_effects` object containing `within_biochar` and `within_concentration` sections.
* **Preformatted Comparison Strings**: Each comparison dictionary includes a preformatted `"comparison"` string (e.g., `"0.2 g/L vs 0.3 g/L"` or `"Acrostichum aureum vs Ludwigia peruviana"`) simplifying frontend rendering and downstream export tasks.
* **Dynamic Direction Switching**:
  - Replaced the single dropdown inside the Tukey card header with a direction toggle radio button pair ("Compare Concentrations within Biochar" and "Compare Biochars within Concentration").
  - Dynamically shows/hides the respective selector dropdown based on the active direction.

---

## Two-Way ANOVA Polish Pass (Completed)

* **Post-hoc Section Title**: Consistently renamed "Simple Main Effects Post-Hoc (Tukey HSD)" to **Post-hoc Analysis of Simple Main Effects**.
* **Direction Explanations**: Added a dynamic, muted description paragraph immediately below the direction radio buttons:
  - *"Compare treatment concentrations separately within the selected biochar species."* (for `within_biochar`)
  - *"Compare biochar species separately at the selected concentration."* (for `within_concentration`)
* **Selector Label Renaming**: Renamed labels "View Biochar" -> **Select Biochar** and "View Concentration" -> **Select Concentration**.
* **Analysis Summary Card**: Added a new summary card immediately above the ANOVA table, dynamically presenting:
  - Factor A: *"Biochar Species"*
  - Factor B: *"Concentration"*
  - Number of Biochar Species (e.g. *"4"*)
  - Experimental Design and control handling mode (e.g. *"Complete factorial design / Include Independent Controls"*)
* **Contextual Tukey Table Heading**: Added a thin header bar above the Tukey table that dynamically reads the active group level being compared, e.g. *"Current Analysis: Concentration comparisons within Acrostichum aureum."* or *"Current Analysis: Biochar species comparisons within 0.3 g/L."*
* **Exclude-Control Banner Wording**: Refined the wording of the statistical note for clarity:
  - *"Statistical Note: The shared control group was excluded before fitting the factorial model. Results therefore describe only treatment concentrations. Control-versus-treatment comparisons are intentionally omitted because the shared control was not part of the fitted statistical model."*
* **Responsive border-right utility**: Added a `.border-md-end` class to `static/style.css` inside a `@media (min-width: 768px)` query to cleanly partition columns in the summary card without any browser rendering bugs.

---

## Priority 4: Publication-Quality Two-Way ANOVA Excel Export (Completed)

* **Single Source of Truth**: Refactored the Two-Way statistical pipeline into a shared helper function `run_two_way_analysis` returning `(response_dict, combined_df)`. Both `/api/two-way` and `/api/export-excel-twoway` consume this helper, guaranteeing identical results and eliminating duplicate statistical logic.
* **New Endpoint**: Created the `POST /api/export-excel-twoway` endpoint. It receives only parameter configuration (`crop`, `variable`, `day`, `biochars`, `control_mode`, `alpha`) from the client and completely regenerates the analysis on the backend, ensuring backend provenance and reproducibility.
* **Workbook Structure (8 Sheets)**:
  - **Sheet 1 — Analysis Summary**: Documents parameters, selected biochar species, control handling mode, design type, significance level, timestamp, software version, and a complete scientific interpretation summary.
  - **Sheet 2 — Experimental Design**: Outlines factor levels, replication metrics (including unbalanced labels where applicable), and sample sizes.
  - **Sheet 3 — Cell Means Matrix**: Reproduces the UI cell grid containing N, Mean, and SD in a multiline wrapped-text format.
  - **Sheet 4 — Type III ANOVA**: Generates the Type III Sum of Squares table with degrees of freedom, Mean Squares, F-value, and formatted p-value, appending the scientific inference summary.
  - **Sheet 5 — Assumption Diagnostics**: Lists Levene and Shapiro-Wilk statistics, p-values, decision statuses, and academic interpretations.
  - **Sheet 6 — Simple Main Effects**: Displays bidirectional post-hoc comparison tables (Section A: Compare Concentrations within Biochar Species; Section B: Compare Biochar Species within Concentration) with preformatted comparison strings, mean differences, adjusted p-values, confidence intervals, and significance indicators.
  - **Sheet 7 — Interaction Plot Data**: Exports the clean, sorted data points used to construct the interaction plot.
  - **Sheet 8 — Analysis Dataset**: Exports the exact filtered dataframe that entered the OLS model.
* **Professional Typography & Styling**:
  - **Font**: Set to Arial throughout.
  - **Theme Colors**: Forest Green title rows (`#1B5E20`) and Dark Gray table headers (`#343A40`) with white bold text.
  - **Panes and Columns**: Enabled freeze panes on appropriate rows and auto-fit column widths dynamically (handling multiline formatting and ignoring cell strings with lengths $>50$ to avoid excessive spacing).
  - **Significance Formatting**: High-precision formatting (4 decimal places for statistics, 6 decimal places for raw p-values, and displaying p-values $<0.0001$ as `"< 0.0001"`). Soft pink highlights (`#FFEBEE`) are applied to significant post-hoc comparison rows.
* **Frontend Excel Button**: Installed a **Download Excel Report (.xlsx)** button in the header of the Two-Way Interaction Plot card. When clicked, it POSTs the active analysis state parameters to `/api/export-excel-twoway` and triggers a native browser download.

---

## Priority 5: Production Hardening & Publication Polish (Completed)

* **Code Quality & Safe Performance Improvements**:
  - **Direct Boolean Mask Slicing**: Replaced the repetitive multi-step cloning and filtering of `FLAT_DF` with a single, direct, index-based slice mask, saving memory allocations.
  - **Single-Pass Groupby Caching**: Extracted all cell counts, means, and standard deviations in a single pass of `combined_df.groupby(["Biochar", "Concentration"])`, caching them in `stats_dict`. Cell matrices, interaction plot coordinate arrays, and Levene data lists are built from this cache in $O(1)$ lookups, eliminating redundant $O(N)$ nested dataframe filters.
* **Unified Terminology System**: Standardized all headings, dropdowns, buttons, cards, summaries, and Excel sheet names in the Two-Way ANOVA module to use:
  - **"Biochar Species"** (e.g. *"Select Biochar Species:"*, *"Factor A: Biochar Species"*, *"Biochar Species Count"*, *"Compare Concentrations within Biochar Species"*, *"Compare Biochar Species within Concentration"*)
  - **"Concentration"**
  - **"Control Handling Mode"**
  - **"Post-hoc Analysis of Simple Main Effects (Tukey HSD)"**
  - **"Interaction Plot"**
* **Pre-fit Validation & Post-fit Residuals Check**:
  - Encapsulated `ols().fit()` in a try-except block, raising clear, descriptive errors if singular/ill-conditioned matrices are encountered.
  - Added verification `if model.df_resid <= 0:` after model fitting. If true, it yields a researcher-friendly `ValueError` explaining the residual degrees of freedom constraint.
* **Excel Export Terminology Alignment**: Updated all worksheet headers, parameters summary cells, and section titles in the 8 generated sheets of `/api/export-excel-twoway` to match the standardized terminology system exactly.
* **Responsive Layout Enhancements**: Integrated Bootstrap responsive flex rules (`flex-column flex-md-row`, `gap-2 gap-md-3`, `border-md-start ps-md-3`) inside the Tukey post-hoc card header, allowing direction toggles to wrap gracefully on mobile and tablet displays without clipping or text overlapping.
* **Accessibility Enhancements**:
  - Linked checkbox checklist and control radio button groups using `role="radiogroup"` and `aria-labelledby` tags.
  - Configured the disabled run button to link to the active checklist warning using `aria-describedby="twoway-validation-alert"`.
  - Added a descriptive `title` attribute to the run button when disabled to explain exactly why the action cannot proceed.
  - Tagged the validation banner with `aria-live="polite"` and `role="alert"` so screen readers immediately announce checklist validation updates.

---

## Validation & Testing

### Regression/Full-Set Identity
* Verified that selecting all biochars in `replicated` mode produces **identical results** to the baseline calculations. The automated test `test_twoway_full_set_identity` compares all statistics and asserts exact matches.
* Verified that the "Concentrations within Biochar" direction (`within_biochar`) matches the legacy post-hoc calculations exactly.
* Verified that updating the text/labels returns the same statistical calculations.

### Automated Test Suite
* Confirmed that `test_twoway_bidirectional_sme` test case, `test_twoway_excel_export_structure`, `test_twoway_excel_export_exclude_control` and all other 23 test cases in `tests/statistical_tests.py` under the `TestTwoWaySubsetSelection` suite pass without errors.
* **Execution**:
  ```bash
  python3 -m unittest tests/statistical_tests.py
  ```
  Result: **26 tests passed successfully** (all existing and new tests OK).

### Protection of Frozen Baseline
* Confirmed that the One-Way ANOVA module remains completely untouched.
