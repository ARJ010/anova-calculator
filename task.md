- [x] Refactor `/api/two-way` route logic in `app.py` into a reusable `run_two_way_analysis(...)` helper function
- [x] Update `/api/two-way` to call `run_two_way_analysis(...)`
- [x] Implement the `POST /api/export-excel-twoway` endpoint in `app.py` using `openpyxl` with 8 worksheets and formatting
- [x] Add the "Download Excel Report (.xlsx)" button to templates/index.html next to the Interaction Plot title
- [x] Implement click listener in static/script.js to send parameters to `/api/export-excel-twoway` and download the file
- [x] Add unit tests in `tests/statistical_tests.py` verifying workbook structure, worksheets, and cell values in different control modes
- [x] Validate implementation and confirm all tests pass successfully

## Priority 5 - Production Hardening & Publication Polish (Completed)
- [x] Optimize dataset filtering using a direct boolean mask on `FLAT_DF`
- [x] Optimize cell means and plot coordinates generation using single-pass `groupby` caching
- [x] Standardize visible terminology in the Two-Way ANOVA module to: Biochar Species, Concentration, Control Handling Mode, Post-hoc Analysis of Simple Main Effects (Tukey HSD), Interaction Plot
- [x] Improve model fit exception handling and verify `model.df_resid <= 0` after fitting
- [x] Polish Excel worksheets formatting (borders, shading, column auto-fit, freeze panes) and update headers to unified terminology
- [x] Ensure flex wrap and layout responsiveness in Tukey card header
- [x] Add accessibility aria roles, aria-live, and link validation alerts to disabled run button
- [x] Confirm no statistical outputs are changed and that One-Way ANOVA module is untouched
