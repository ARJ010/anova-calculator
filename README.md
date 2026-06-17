# Botanical & Agricultural ANOVA Scientific Calculator (v1.6.1)

A statistically rigorous, research-grade web calculator built specifically for analyzing botanical and agricultural seedling growth experiments. It supports standard **One-Way ANOVA** and **Type III Two-Way ANOVA** calculations directly from flattened experimental sheets, properly managing control-treatment imbalances, configurable significance levels, and zero-growth outliers.

---

## 🚀 Project Overview

In agricultural research, experimental treatments (e.g., biochar additions at various concentrations) often result in unbalanced group sizes or zero-variance treatment cells (e.g., where seeds fail to germinate). Standard automated tools often crash or produce incorrect outputs on such datasets. 

This calculator is designed to provide PG-level agricultural researchers with a statistically correct, self-contained suite for evaluating seedling growth metrics (e.g., root, shoot, and total lengths).

---

## ✨ Features

- **Data Pipeline**: Automatically parses and flattens structured multi-sheet agricultural Excel workbooks into a clean database format on startup.
- **Configurable Significance Level (α)**:
  * Supports selecting nominal significance levels $\alpha \in \{0.001, 0.01, 0.05\}$ from the sidebar.
  * Dynamically propagates the chosen $\alpha$ consistently across all hypothesis-test decisions (Shapiro-Wilk normality, Levene's homogeneity of variance, overall ANOVA F-test, Tukey HSD reject decisions, and Simple Main Effects Tukey).
  * Shifting $\alpha$ dynamically updates Tukey HSD confidence intervals (margin of error) and Compact Letter Display (CLD) groupings.
- **One-Way ANOVA**:
  * Computes standard F-ANOVA table (SS, df, MS, F-value, and p-value).
  * Validates assumptions using **Shapiro-Wilk** (normality of residuals) and **Levene's Test** (homogeneity of variances).
  * Performs **Tukey HSD** post-hoc pairwise comparisons with dynamic confidence boundaries.
  * Calculates **Compact Letter Display (CLD)** to group treatments.
  * Interactive scatter plot rendering with randomized horizontal jitter for individual replicate observations.
- **Type III Two-Way ANOVA (Factor A: Biochar Type × Factor B: Concentration)**:
  * Specifically designed for unbalanced experimental designs (e.g., $N=20$ shared control replicates vs. $N=10$ treatment replicates).
  * Utilizes **Sum contrast coding** (`C(factor, Sum)`) to ensure correct Type III Sums of Squares computation.
  * Automatically builds a **Cell Replication & Means Matrix**.
  * Renders **Dose-Response Interaction Curves** (parallelism check).
  * Performs **Simple Main Effects Tukey HSD** comparing concentration levels within individual biochars using the full-model error term ($MSE_{full}$ and $df_{error}$) to maintain statistical power.
- **Zero-Variance Protection**: Detects "fail-to-grow" treatment groups (zero variance) and introduces a tiny positive variance adjustment ($\epsilon = 10^{-6}$ to the first replicate) to prevent library crashes in Levene's and Tukey's tests without biasing mean outputs.
- **Excel Export Report**:
  * Merges Descriptive stats, ANOVA table, and Tukey results.
  * Includes a dedicated **Analysis Settings** block logging the provenance of the active analysis (selected significance level, test type, and post-hoc method).
  * Labels statistical significance dynamically based on the active $\alpha$ level (e.g. `Significant (p < 0.01)`).
- **User Interface**: Built on standard Bootstrap 5 with dynamic sidebar filters and detailed dark-themed statistical debug logs.

---

## 📁 Folder Structure

```text
anova-calculator/
├── app.py                      # Flask Application Server & Scientific APIs
├── requirements.txt            # Python Dependencies
├── render.yaml                 # Render Infrastructure-as-Code Configuration
├── Procfile                    # Web Server Startup Command
├── Base/
│   └── Biochar_Onion_Pea_Final.xlsx  # Embedded Default Agricultural Workbook
├── static/
│   ├── script.js               # Frontend Controllers, Event Handlers, & Chart.js Planners
│   └── style.css               # Theme styling
├── templates/
│   └── index.html              # UI Layout
├── tests/
│   └── statistical_tests.py    # Unit & Integration Tests (17 test cases)
└── README.md                   # Documentation
```

---

## 🛠️ Installation & Local Setup

### Prerequisites
- Python 3.10 or higher
- pip (Python package installer)

### Step 1: Clone the Repository
```bash
git clone <repository-url>
cd anova-calculator
```

### Step 2: Set Up Virtual Environment (Recommended)
```bash
python3 -m venv venv
source venv/bin/activate
```

### Step 3: Install Dependencies
```bash
pip install -r requirements.txt
```

### Step 4: Run Automated Tests
Verify statistical correctness in your environment:
```bash
python3 -m unittest tests/statistical_tests.py
```
*(All 17 tests should return `OK`)*

### Step 5: Start Local Server
```bash
python3 app.py
```
Open [http://127.0.0.1:5000](http://127.0.0.1:5000) in your web browser.

---

## 📊 Statistical Methodology Details

1. **Unbalanced Type III ANOVA**: Statsmodels' `anova_lm(..., typ=3)` requires that categorical variables be contrast-coded using sum-to-zero coding. The model is formulated as:
   $$\text{Value} \sim \text{C(Biochar, Sum)} \times \text{C(Concentration, Sum)}$$
   Standard treatment coding yields incorrect Type III Sum of Squares on unbalanced layouts.
2. **Simple Main Effects Standard Error**: Under the Two-Way model, the standard error for pairwise Tukey comparisons is computed as:
   $$SE = \sqrt{\frac{MSE_{full}}{2} \left(\frac{1}{n_1} + \frac{1}{n_2}\right)}$$
   where $MSE_{full}$ is the pooled Mean Square Error of the full OLS model, and $n_1, n_2$ are the sample sizes of the compared groups. Adjusted p-values are obtained using the Studentized Range survival function `scipy.stats.studentized_range.sf(q, c, df_err)`.
3. **Nominal Significance Level (α)**:
   * **Scope of $\alpha$**: Shifting $\alpha$ changes the rejection boundaries for statistical hypothesis tests, pairwise post-hoc test results, Tukey confidence interval margins of error, and CLD group letter listings.
   * **Invariance of Data**: Core descriptive metrics (sample size $N$, Means, Standard Deviations, Variances), raw p-values, and F-statistics are completely independent of $\alpha$.
   * **Invariant Significance Stars**: Standard publication significance stars are fixed to standard international scientific publication conventions ($p < 0.05 \rightarrow *$, $p < 0.01 \rightarrow **$, $p < 0.001 \rightarrow ***$, otherwise $\rightarrow$ ns) and are not affected by changes in $\alpha$.
4. **Scientific Interpretation Rule**: If the interaction term (Biochar &times; Concentration) is statistically significant ($p < \alpha$), global main effects are confounded. The interface warns users to bypass main effects and interpret Simple Main Effects comparisons instead.

---

## ⚠️ Known Limitations
- **File Format**: The MVP currently supports parsing the embedded `Biochar_Onion_Pea_Final.xlsx` template only. Dynamic multi-sheet uploads are not supported.
- **Parametric Fallbacks**: Welch's ANOVA and data transformations (e.g. log, square root) are not implemented. Homogeneity of variance violations should be reviewed carefully.

---

## ☁️ Deployment Notes (Render)

This application is ready for deployment on **Render**:
- **Environment**: Python
- **Build Command**: `pip install -r requirements.txt`
- **Start Command**: `gunicorn app:app`
- **Infrastructure File**: Configured in `render.yaml`
