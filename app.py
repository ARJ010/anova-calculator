import os
import io
import base64
from pathlib import Path
import pandas as pd
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.drawing.image import Image
from flask import Flask, jsonify, render_template, request, send_file

app = Flask(__name__)

# Resolve workbook path relative to the app file location
BASE_DIR = Path(__file__).resolve().parent
WORKBOOK_PATH = BASE_DIR / "Base" / "Biochar_Onion_Pea_Final.xlsx"

# Master flat dataframe cache
FLAT_DF = None

def clean_biochar_name(sheet_name):
    name = sheet_name.strip().lower()
    if "acrostichum" in name:
        return "Acrostichum aureum"
    elif "cyclosorus" in name:
        return "Cyclosorus interruptus"
    elif "ludwigia" in name or "ludwegia" in name:
        return "Ludwigia peruviana"
    elif "quisqualis" in name:
        return "Quisqualis indica"
    elif "control" in name:
        return "Control"
    return sheet_name.strip()

def is_numeric(val):
    if val is None:
        return False
    try:
        float(val)
        return True
    except ValueError:
        return False

def flatten_default_workbook():
    if not WORKBOOK_PATH.exists():
        raise FileNotFoundError(f"Workbook not found at {WORKBOOK_PATH}")

    # Load workbook with data_only=True to get computed values, not formulas
    wb = openpyxl.load_workbook(WORKBOOK_PATH, data_only=True)
    
    rows_data = []

    # Map sheets exactly
    onion_sheets = ['Control Onion', 'Acrostichum aureum', 'Cyclosorus interruptus', 'Ludwigia peruviana', 'Quisqualis indica']
    pea_shoot_sheets = ['Control Pea Shoot', 'Acrostichum shoot ', 'Quisqualis indica Shoot', 'Ludwigia peruviana Shoot', 'Cyclosorus interruptus Shoot']
    pea_root_sheets = ['Control Pea Root', 'Acrostichum root (Pea)', 'Quisqualis root (Pea)', 'Ludwegia root (Pea) ', 'Cyclosorus root (Pea) ']
    pea_tl_sheets = ['Control Pea Total Length', 'Cyclosorus TL (Pea)  ', 'Ludwegia TL(Pea) ', 'Quisqualis TL (Pea)', 'Acrostichum TL (Pea) ']

    all_sheets = onion_sheets + pea_shoot_sheets + pea_root_sheets + pea_tl_sheets

    for sheet_name in all_sheets:
        if sheet_name not in wb.sheetnames:
            print(f"Warning: Sheet {sheet_name} not found in workbook.")
            continue

        ws = wb[sheet_name]
        biochar = clean_biochar_name(sheet_name)
        
        # Determine Crop and Variable
        if sheet_name in onion_sheets:
            crop = "Onion"
            variable = "Root Length"
        else:
            crop = "Pea"
            if sheet_name in pea_shoot_sheets:
                variable = "Shoot Length"
            elif sheet_name in pea_root_sheets:
                variable = "Root Length"
            else:
                variable = "Total Length"

        # Determine Replicate Columns range
        # Control Onion has 20 replicates (Cols C to V -> index 2 to 21)
        # Control Pea sheets have 10 replicates (Cols C to L -> index 2 to 11)
        # Treatment Onion has 10 replicates (Cols C to L -> index 2 to 11)
        # Treatment Pea has 5 replicates (Cols C to G -> index 2 to 6)
        is_control = (biochar == "Control")
        if is_control:
            if crop == "Onion":
                col_start, col_end = 2, 21  # C to V
            else:
                col_start, col_end = 2, 11  # C to L
        else:
            if crop == "Onion":
                col_start, col_end = 2, 11  # C to L
            else:
                col_start, col_end = 2, 6   # C to G

        # Determine row processing limit to exclude summary blocks at the bottom of the sheets
        if is_control:
            if crop == "Onion" or sheet_name == "Control Pea Shoot":
                max_rows = 4  # Rows 2-4 (indices 1, 2, 3)
            else:
                max_rows = 2  # Row 2 (index 1)
        else:
            if crop == "Onion" or sheet_name in pea_shoot_sheets:
                max_rows = 17 # Rows 2-5, 8-11, 14-17 (indices up to 16)
            else:
                max_rows = 5  # Rows 2-5 (indices 1, 2, 3, 4)

        # Parse rows
        current_day = None
        for r_idx, row in enumerate(ws.iter_rows(values_only=True)):
            if r_idx >= max_rows:
                break

            # Check for Day headers in Column A
            val_a = row[0]
            if val_a is not None and str(val_a).strip().startswith("Day"):
                current_day = str(val_a).strip()
                if not is_control:
                    continue  # Treatment day headers don't contain data rows
            
            # For Pea Root and Pea Total Length sheets, there is no Day header, it's always Day 7
            if current_day is None and (sheet_name in pea_root_sheets or sheet_name in pea_tl_sheets):
                current_day = "Day 7"

            # Check if row is a data row
            val_b = row[1]
            
            # Determine Concentration
            conc = None
            if is_control:
                # Control rows have Concentration = 0.0, and are identified by the Day label in Column A
                if val_a is not None and str(val_a).strip() == current_day:
                    conc = 0.0
            else:
                # Treatment rows have the concentration value in Column B
                if val_b is not None and is_numeric(val_b):
                    conc = float(val_b)

            if conc is not None and current_day is not None:
                # Extract replicate values
                for col_idx in range(col_start, col_end + 1):
                    if col_idx < len(row):
                        val = row[col_idx]
                        if val is not None and is_numeric(val):
                            rows_data.append({
                                "Crop": crop,
                                "Biochar": biochar,
                                "Concentration": conc,
                                "Day": current_day,
                                "Variable": variable,
                                "Value": float(val)
                            })

    df = pd.DataFrame(rows_data)
    return df

# Initialize dataframe at startup
try:
    FLAT_DF = flatten_default_workbook()
    print(f"Data pipeline successfully initialized. Loaded {len(FLAT_DF)} rows.")
except Exception as e:
    print(f"CRITICAL: Failed to load default workbook: {str(e)}")

@app.route("/debug")
def debug_data():
    if FLAT_DF is None:
        return jsonify({"status": "error", "message": "DataFrame not loaded"}), 500
    
    # Calculate unique counts and basic descriptions
    summary = {
        "status": "success",
        "shape": FLAT_DF.shape,
        "unique_crops": FLAT_DF["Crop"].unique().tolist(),
        "unique_biochars": FLAT_DF["Biochar"].unique().tolist(),
        "unique_concentrations": FLAT_DF["Concentration"].unique().tolist(),
        "unique_days": FLAT_DF["Day"].unique().tolist(),
        "unique_variables": FLAT_DF["Variable"].unique().tolist(),
        "missing_values": FLAT_DF.isnull().sum().to_dict(),
        "sample_counts_by_crop": FLAT_DF.groupby("Crop").size().to_dict(),
        "sample_counts_by_variable": FLAT_DF.groupby("Variable").size().to_dict(),
        "sample_counts_by_biochar": FLAT_DF.groupby("Biochar").size().to_dict(),
        "group_summary_preview": FLAT_DF.groupby(["Crop", "Biochar", "Day", "Variable", "Concentration"]).agg(
            Count=("Value", "count"),
            Mean=("Value", "mean"),
            Variance=("Value", "var")
        ).reset_index().head(30).to_dict(orient="records"),
        "preview_rows": FLAT_DF.head(20).to_dict(orient="records")
    }
    return jsonify(summary)

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/metadata")
def api_metadata():
    if FLAT_DF is None:
        return jsonify({"status": "error", "message": "DataFrame not loaded"}), 500
        
    crops = FLAT_DF["Crop"].unique().tolist()
    
    metadata = {}
    for crop in crops:
        crop_df = FLAT_DF[FLAT_DF["Crop"] == crop]
        metadata[crop] = {
            "variables": crop_df["Variable"].unique().tolist(),
            "biochars": sorted([b for b in crop_df["Biochar"].unique().tolist() if b != "Control"]),
            "days": sorted(crop_df["Day"].unique().tolist()),
            "concentrations": sorted([float(c) for c in crop_df["Concentration"].unique().tolist() if c > 0.0])
        }
        
    return jsonify({
        "status": "success",
        "metadata": metadata
    })

@app.route("/api/one-way", methods=["POST", "GET"])
def api_one_way():
    if FLAT_DF is None:
        return jsonify({"status": "error", "message": "Data pipeline not initialized"}), 500

    data = request.args if request.method == "GET" else request.get_json(silent=True)
    if not data:
        data = request.form

    crop = data.get("crop")
    variable = data.get("variable")
    day = data.get("day")
    factor = data.get("factor")
    biochar_filter = data.get("biochar_filter")
    
    conc_filter_val = data.get("concentration_filter")
    concentration_filter = float(conc_filter_val) if conc_filter_val is not None and is_numeric(conc_filter_val) else None

    # Filter master dataframe
    df_filtered = FLAT_DF.copy()
    df_filtered = df_filtered[df_filtered["Crop"] == crop]
    df_filtered = df_filtered[df_filtered["Variable"] == variable]

    groups_dict = {}
    formula_used = ""
    excluded_groups = []
    missing_dropped = 0

    if factor == "Concentration":
        df_filtered = df_filtered[df_filtered["Day"] == day]
        df_filtered = df_filtered[
            (df_filtered["Biochar"] == biochar_filter) | (df_filtered["Biochar"] == "Control")
        ]
        
        groups = df_filtered.groupby("Concentration")
        formula_used = f"Value ~ Concentration (grouped by Biochar: {biochar_filter}, Day: {day})"
        
        for name, group in groups:
            groups_dict[str(name)] = group["Value"].dropna().tolist()

    elif factor == "Biochar":
        df_filtered = df_filtered[df_filtered["Day"] == day]
        df_filtered = df_filtered[df_filtered["Concentration"] == concentration_filter]
        
        groups = df_filtered.groupby("Biochar")
        formula_used = f"Value ~ Biochar (grouped by Concentration: {concentration_filter}, Day: {day})"
        
        for name, group in groups:
            groups_dict[str(name)] = group["Value"].dropna().tolist()

    elif factor == "Day":
        if biochar_filter == "Control":
            df_filtered = df_filtered[(df_filtered["Biochar"] == "Control") & (df_filtered["Concentration"] == 0.0)]
        else:
            df_filtered = df_filtered[(df_filtered["Biochar"] == biochar_filter) & (df_filtered["Concentration"] == concentration_filter)]
            
        groups = df_filtered.groupby("Day")
        formula_used = f"Value ~ Day (grouped by Biochar: {biochar_filter}, Concentration: {concentration_filter})"
        
        for name, group in groups:
            groups_dict[str(name)] = group["Value"].dropna().tolist()

    else:
        return jsonify({"status": "error", "message": "Invalid factor specified"}), 400

    # Zero variance protection & NaN cleaning
    sanitized_groups = {}
    for g_name, g_vals in list(groups_dict.items()):
        g_vals = [float(x) for x in g_vals if x is not None and is_numeric(x)]
        if len(g_vals) < 2:
            excluded_groups.append(f"{g_name} (sample size < 2)")
            continue
            
        # Detect zero variance
        import numpy as np
        if np.std(g_vals) == 0:
            g_vals = list(g_vals)
            g_vals[0] += 1e-6 # add epsilon to first element
            
        sanitized_groups[g_name] = g_vals

    if len(sanitized_groups) < 2:
        return jsonify({
            "status": "error",
            "message": f"Not enough valid groups to perform ANOVA. Discovered groups: {list(groups_dict.keys())}. Valid groups: {list(sanitized_groups.keys())}."
        }), 400

    import numpy as np
    import scipy.stats as stats
    import statsmodels.stats.multicomp as mc

    # 1. Summary Statistics for each group (Astatsa-style)
    summary_stats = []
    def sorting_key(group_name):
        name_str = str(group_name).strip()
        if name_str.lower() in ["control", "0.0", "0"]:
            return (0, 0.0, name_str)
        try:
            val = float(name_str)
            return (1, val, name_str)
        except ValueError:
            return (2, name_str.lower(), name_str)

    group_names = sorted(list(sanitized_groups.keys()), key=sorting_key)
    
    anova_inputs = [sanitized_groups[name] for name in group_names]

    all_values = []
    all_group_labels = []
    
    for name in group_names:
        vals = sanitized_groups[name]
        n = len(vals)
        sum_x = sum(vals)
        mean = sum_x / n
        var = np.var(vals, ddof=1)
        sd = np.sqrt(var)
        se = sd / np.sqrt(n) if n > 0 else 0.0
        sum_x2 = sum(x**2 for x in vals)
        
        summary_stats.append({
            "Group": name,
            "N": n,
            "Sum": round(sum_x, 4),
            "Mean": round(mean, 4),
            "Variance": round(var, 4),
            "SD": round(sd, 4),
            "SE": round(float(se), 4),
            "SumSq": round(sum_x2, 4)
        })
        
        all_values.extend(vals)
        all_group_labels.extend([name] * n)

    # 2. Assumptions: Shapiro-Wilk (Normality) for each group
    shapiro_results = []
    for name in group_names:
        vals = sanitized_groups[name]
        if len(vals) >= 3:
            sh_stat, sh_p = stats.shapiro(vals)
            shapiro_results.append({
                "Group": name,
                "Statistic": round(sh_stat, 4),
                "p_value": round(sh_p, 4),
                "Normal": bool(sh_p >= 0.05)
            })
        else:
            shapiro_results.append({
                "Group": name,
                "Statistic": None,
                "p_value": None,
                "Normal": None,
                "Note": "N < 3"
            })

    # 3. Assumptions: Levene's Test (Homogeneity of Variance)
    lev_stat, lev_p = stats.levene(*anova_inputs)
    levene_result = {
        "Statistic": round(lev_stat, 4),
        "p_value": round(lev_p, 4),
        "Equal_Variance": bool(lev_p >= 0.05)
    }

    # 4. Standard One-Way ANOVA
    f_stat, f_p = stats.f_oneway(*anova_inputs)
    
    k = len(group_names)
    N = len(all_values)
    df_between = k - 1
    df_within = N - k
    df_total = N - 1
    
    grand_mean = sum(all_values) / N
    ss_total = sum((x - grand_mean)**2 for x in all_values)
    ss_between = sum(len(sanitized_groups[name]) * (np.mean(sanitized_groups[name]) - grand_mean)**2 for name in group_names)
    ss_within = ss_total - ss_between
    
    ms_between = ss_between / df_between
    ms_within = ss_within / df_within
    
    anova_table = {
        "Between": {
            "SS": round(ss_between, 4),
            "df": df_between,
            "MS": round(ms_between, 4),
            "F": round(f_stat, 4),
            "p_value": round(f_p, 4)
        },
        "Within": {
            "SS": round(ss_within, 4),
            "df": df_within,
            "MS": round(ms_within, 4)
        },
        "Total": {
            "SS": round(ss_total, 4),
            "df": df_total
        },
        "Significant": bool(f_p < 0.05)
    }

    # 5. Tukey HSD Post-hoc Test
    tukey_res = mc.pairwise_tukeyhsd(np.array(all_values), np.array(all_group_labels), alpha=0.05)
    tukey_table = []
    
    for row in tukey_res._results_table.data[1:]:
        g1, g2, meandiff, p_adj, lower, upper, reject = row
        tukey_table.append({
            "group1": str(g1),
            "group2": str(g2),
            "meandiff": round(float(meandiff), 4),
            "p_adj": round(float(p_adj), 4) if isinstance(p_adj, (int, float)) else p_adj,
            "lower": round(float(lower), 4),
            "upper": round(float(upper), 4),
            "reject": bool(reject)
        })

    # Prepare raw data points for boxplot plotting in frontend
    raw_data_points = []
    for name in group_names:
        for val in sanitized_groups[name]:
            raw_data_points.append({
                "Group": name,
                "Value": val
            })

    # Debug details
    debug_details = {
        "group_counts": {name: len(sanitized_groups[name]) for name in group_names},
        "group_means": {name: round(np.mean(sanitized_groups[name]), 4) for name in group_names},
        "group_variances": {name: round(np.var(sanitized_groups[name], ddof=1), 4) for name in group_names},
        "formula_used": formula_used,
        "groups_excluded": excluded_groups,
        "missing_rows_dropped": int(missing_dropped),
        "assumption_test_outputs": {
            "shapiro": shapiro_results,
            "levene": levene_result
        }
    }

    response = {
        "status": "success",
        "factor": factor,
        "crop": crop,
        "variable": variable,
        "day": day,
        "formula": formula_used,
        "summary_stats": summary_stats,
        "anova_table": anova_table,
        "shapiro_results": shapiro_results,
        "levene_result": levene_result,
        "tukey_results": tukey_table,
        "raw_data_points": raw_data_points,
        "debug_details": debug_details
    }
    
    return jsonify(response)

@app.route("/api/two-way", methods=["POST", "GET"])
def api_two_way():
    if FLAT_DF is None:
        return jsonify({"status": "error", "message": "Data pipeline not initialized"}), 500

    data = request.args if request.method == "GET" else request.get_json(silent=True)
    if not data:
        data = request.form

    crop = data.get("crop")
    variable = data.get("variable")
    day = data.get("day")

    # Filter master dataframe
    df_filtered = FLAT_DF.copy()
    df_filtered = df_filtered[df_filtered["Crop"] == crop]
    df_filtered = df_filtered[df_filtered["Variable"] == variable]
    df_filtered = df_filtered[df_filtered["Day"] == day]

    if df_filtered.empty:
        return jsonify({"status": "error", "message": f"No data found for Crop={crop}, Variable={variable}, Day={day}"}), 400

    # Separate Control and Treatment biochars
    controls = df_filtered[df_filtered["Biochar"] == "Control"].copy()
    treatments = df_filtered[df_filtered["Biochar"] != "Control"].copy()

    if treatments.empty:
        return jsonify({"status": "error", "message": "No treatment biochar groups found for Two-Way ANOVA."}), 400

    unique_biochars = sorted(treatments["Biochar"].unique().tolist())
    
    # Replicate Control (concentration 0.0) into each treatment biochar
    replicated_controls = []
    for b in unique_biochars:
        ctrl_copy = controls.copy()
        ctrl_copy["Biochar"] = b
        replicated_controls.append(ctrl_copy)

    combined_df = pd.concat([treatments] + replicated_controls, ignore_index=True)
    combined_df = combined_df.dropna(subset=["Value"])
    
    # Ensure Concentration is treated as a float/numeric and then categorical
    combined_df["Concentration"] = combined_df["Concentration"].astype(float)
    
    # Ensure we have enough levels to fit Two-Way ANOVA
    n_unique_concs = len(combined_df["Concentration"].unique())
    n_unique_biochars = len(combined_df["Biochar"].unique())
    
    if n_unique_concs < 2 or n_unique_biochars < 2:
        return jsonify({
            "status": "error", 
            "message": f"Insufficient factor levels for Two-Way ANOVA. Concs count: {n_unique_concs}, Biochars count: {n_unique_biochars}"
        }), 400

    # ---------------------------
    # TWO-WAY TYPE III ANOVA OLS
    # ---------------------------
    import statsmodels.api as sm
    from statsmodels.formula.api import ols
    import scipy.stats as stats
    import numpy as np

    # Fit OLS model with explicit Sum contrasts for both Biochar and Concentration
    model_formula = 'Value ~ C(Biochar, Sum) * C(Concentration, Sum)'
    model = ols(model_formula, data=combined_df).fit()
    
    # Compute Type III ANOVA
    anova_table = sm.stats.anova_lm(model, typ=3)
    
    # Compute MS and format tables
    table_dict = {}
    for idx, row in anova_table.iterrows():
        ss = row["sum_sq"]
        df = row["df"]
        ms = ss / df if df > 0 else 0
        f_val = row["F"] if "F" in row and not pd.isna(row["F"]) else None
        p_val = row["PR(>F)"] if "PR(>F)" in row and not pd.isna(row["PR(>F)"]) else None
        
        table_dict[idx] = {
            "SS": round(float(ss), 4),
            "df": int(df),
            "MS": round(float(ms), 4),
            "F": round(float(f_val), 4) if f_val is not None else "-",
            "p_value": round(float(p_val), 6) if p_val is not None else "-"
        }
        
    # Degrees of freedom validation check: df_A + df_B + df_AB + df_error = N - 1
    N = len(combined_df)
    df_total_expected = N - 1
    
    df_A = table_dict.get("C(Biochar, Sum)", {}).get("df", 0)
    df_B = table_dict.get("C(Concentration, Sum)", {}).get("df", 0)
    df_AB = table_dict.get("C(Biochar, Sum):C(Concentration, Sum)", {}).get("df", 0)
    df_error = table_dict.get("Residual", {}).get("df", 0)
    
    df_sum = df_A + df_B + df_AB + df_error
    df_verified = (df_sum == df_total_expected)
    
    # Interaction significance
    p_val_AB = anova_table.loc["C(Biochar, Sum):C(Concentration, Sum)", "PR(>F)"]
    interaction_significant = bool(p_val_AB < 0.05) if not pd.isna(p_val_AB) else False

    # 2. Cell Means Grid calculation (Biochar x Concentration)
    cell_means = []
    unique_concs = sorted(combined_df["Concentration"].unique().tolist())
    
    for b in unique_biochars:
        bio_row = {"Biochar": b}
        for c in unique_concs:
            cell_data = combined_df[(combined_df["Biochar"] == b) & (combined_df["Concentration"] == c)]["Value"]
            n = len(cell_data)
            if n > 0:
                # Zero variance protection for cells
                mean = np.mean(cell_data)
                sd = np.std(cell_data, ddof=1) if n > 1 else 0
                bio_row[str(c)] = {
                    "N": n,
                    "Mean": round(float(mean), 4),
                    "SD": round(float(sd), 4)
                }
            else:
                bio_row[str(c)] = {"N": 0, "Mean": "-", "SD": "-"}
        cell_means.append(bio_row)

    # 3. Simple Main Effects Post-Hoc Tukey HSD
    # We compare concentrations within each biochar type.
    # MSE and df_error from the full model
    mse_full = table_dict.get("Residual", {}).get("MS", 0)
    df_err = table_dict.get("Residual", {}).get("df", 0)
    
    posthoc_results = {}
    
    for b in unique_biochars:
        posthoc_results[b] = []
        df_b = combined_df[combined_df["Biochar"] == b]
        
        # Unique concentrations within this biochar
        concs_b = sorted(df_b["Concentration"].unique().tolist())
        c_levels = len(concs_b)
        
        # Calculate critical Q-value using studentized range
        q_crit = stats.studentized_range.ppf(0.95, c_levels, df_err)
        
        # Perform pairwise comparisons
        for i in range(len(concs_b)):
            for j in range(i + 1, len(concs_b)):
                c1 = concs_b[i]
                c2 = concs_b[j]
                
                v1 = df_b[df_b["Concentration"] == c1]["Value"].tolist()
                v2 = df_b[df_b["Concentration"] == c2]["Value"].tolist()
                
                n1 = len(v1)
                n2 = len(v2)
                
                mean1 = np.mean(v1)
                mean2 = np.mean(v2)
                meandiff = mean1 - mean2
                
                # Standard error of difference using FULL MODEL MSE
                # SE = sqrt( MSE_full / 2 * (1/n1 + 1/n2) )
                if n1 > 0 and n2 > 0:
                    se = np.sqrt((mse_full / 2.0) * (1.0 / n1 + 1.0 / n2))
                    if se == 0:
                        se = 1e-6  # safeguard
                    
                    q_stat = abs(meandiff) / se
                    p_adj = stats.studentized_range.sf(q_stat, c_levels, df_err)
                    
                    # CI bounds
                    ci_half = q_crit * se
                    lower = meandiff - ci_half
                    upper = meandiff + ci_half
                    reject = bool(p_adj < 0.05)
                    
                    posthoc_results[b].append({
                        "group1": f"{c1} g/L" if c1 > 0 else "Control",
                        "group2": f"{c2} g/L" if c2 > 0 else "Control",
                        "meandiff": round(float(meandiff), 4),
                        "p_adj": round(float(p_adj), 6),
                        "lower": round(float(lower), 4),
                        "upper": round(float(upper), 4),
                        "reject": reject
                    })

    # Prepare debug details
    debug_details = {
        "factor_levels": {
            "Biochar": unique_biochars,
            "Concentration": unique_concs
        },
        "cell_sample_sizes": {
            b: {str(c): len(combined_df[(combined_df["Biochar"] == b) & (combined_df["Concentration"] == c)]) for c in unique_concs}
            for b in unique_biochars
        },
        "dropped_rows": int(df_filtered["Value"].isnull().sum()),
        "interaction_significant": interaction_significant,
        "model_formula": model_formula,
        "mse_used_for_posthoc": round(float(mse_full), 6),
        "df_error_used_for_posthoc": int(df_err),
        "df_verification": {
            "df_Biochar": df_A,
            "df_Concentration": df_B,
            "df_Interaction": df_AB,
            "df_Residual": df_error,
            "df_Sum": int(df_sum),
            "N_minus_1": int(df_total_expected),
            "df_verified": bool(df_verified)
        }
    }

    # Format interaction plot means for frontend Chart.js line plot
    # A line per biochar, X-axis concentrations, Y-axis mean values
    interaction_plot_data = {}
    for b in unique_biochars:
        interaction_plot_data[b] = []
        for c in unique_concs:
            cell_data = combined_df[(combined_df["Biochar"] == b) & (combined_df["Concentration"] == c)]["Value"]
            if not cell_data.empty:
                interaction_plot_data[b].append({
                    "x": c,
                    "y": round(float(np.mean(cell_data)), 4)
                })

    response = {
        "status": "success",
        "crop": crop,
        "variable": variable,
        "day": day,
        "anova_table": table_dict,
        "df_verified": bool(df_verified),
        "interaction_significant": interaction_significant,
        "cell_means": cell_means,
        "posthoc_results": posthoc_results,
        "interaction_plot_data": interaction_plot_data,
        "debug_details": debug_details
    }
    
    return jsonify(response)

@app.route("/api/export-excel", methods=["POST"])
def export_excel():
    try:
        def format_group_name(name):
            name_str = str(name).strip()
            if name_str == "0.0" or name_str == "0":
                return "Control"
            return name_str

        data = request.get_json()
        if not data:
            return jsonify({"status": "error", "message": "No data provided"}), 400

        crop = data.get("crop", "N/A")
        variable = data.get("variable", "N/A")
        day = data.get("day", "N/A")
        factor = data.get("factor", "N/A")
        biochar = data.get("biochar", "N/A")

        summary_stats = data.get("summary_stats", [])
        anova_table = data.get("anova_table", {})
        levene_result = data.get("levene_result", {})
        shapiro_results = data.get("shapiro_results", [])
        tukey_results = data.get("tukey_results", [])
        inference_summary = data.get("inference_summary", "N/A")
        chart_image = data.get("chart_image", "")

        # Decode base64 chart image if present
        img = None
        if chart_image and "," in chart_image:
            try:
                header, encoded = chart_image.split(",", 1)
                decoded = base64.b64decode(encoded)
                img = Image(io.BytesIO(decoded))
            except Exception as img_err:
                print(f"Error decoding chart image: {str(img_err)}")

        # Create Workbook
        wb = openpyxl.Workbook()

        # Styles
        font_title = Font(name="Arial", size=14, bold=True, color="1B5E20") # Academic forest green
        font_header = Font(name="Arial", size=11, bold=True, color="FFFFFF")
        font_bold = Font(name="Arial", size=11, bold=True)
        font_regular = Font(name="Arial", size=10)

        fill_header = PatternFill(start_color="343A40", end_color="343A40", fill_type="solid") # Dark gray header
        fill_light = PatternFill(start_color="F8F9FA", end_color="F8F9FA", fill_type="solid") # subtle light background
        fill_sig = PatternFill(start_color="FFEBEE", end_color="FFEBEE", fill_type="solid") # soft pink/red for significance

        thin_side = Side(border_style="thin", color="D3D3D3")
        border_all = Border(left=thin_side, right=thin_side, top=thin_side, bottom=thin_side)

        align_center = Alignment(horizontal="center", vertical="center")
        align_left = Alignment(horizontal="left", vertical="center")
        align_right = Alignment(horizontal="right", vertical="center")

        # Sheet 1: Summary
        ws1 = wb.active
        ws1.title = "Summary"
        ws1.views.sheetView[0].showGridLines = True

        ws1.cell(row=1, column=1, value="One-Way ANOVA Research Report Summary").font = font_title
        ws1.row_dimensions[1].height = 25

        ws1.cell(row=3, column=1, value="Field").font = font_header
        ws1.cell(row=3, column=1).fill = fill_header
        ws1.cell(row=3, column=1).alignment = align_center

        ws1.cell(row=3, column=2, value="Value").font = font_header
        ws1.cell(row=3, column=2).fill = fill_header
        ws1.cell(row=3, column=2).alignment = align_center

        between = anova_table.get("Between", {})
        f_stat = between.get("F", "N/A")
        p_val = between.get("p_value", "N/A")
        significant = anova_table.get("Significant", False)

        if isinstance(f_stat, (int, float)):
            f_stat = round(f_stat, 4)
        if isinstance(p_val, (int, float)):
            p_val = round(p_val, 4)

        summary_data = [
            ("Crop", crop),
            ("Variable", variable),
            ("Day", day),
            ("Grouping Factor", factor),
            ("Biochar Group", biochar),
            ("F-statistic", f_stat),
            ("p-value", p_val),
            ("Significant (p < 0.05)", "Yes" if significant else "No"),
        ]

        for row_idx, (field, val) in enumerate(summary_data, 4):
            c_f = ws1.cell(row=row_idx, column=1, value=field)
            c_f.font = font_bold
            c_f.border = border_all
            c_f.fill = fill_light

            c_v = ws1.cell(row=row_idx, column=2, value=val)
            c_v.font = font_regular
            c_v.border = border_all
            c_v.alignment = align_left

        ws1.cell(row=13, column=1, value="Inference Summary:").font = font_bold
        c_inf = ws1.cell(row=14, column=1, value=inference_summary)
        c_inf.font = font_regular
        c_inf.alignment = Alignment(wrap_text=True, vertical="top")
        ws1.merge_cells(start_row=14, start_column=1, end_row=16, end_column=5)

        # Sheet 2: Descriptive Statistics
        ws2 = wb.create_sheet(title="Descriptive Statistics")
        ws2.views.sheetView[0].showGridLines = True
        ws2.cell(row=1, column=1, value="Descriptive Statistics Summary").font = font_title

        desc_headers = ["Group", "N", "Sum (\u03a3X)", "Mean", "Variance", "SD", "SE", "Sum Sq (\u03a3X\u00b2)"]
        for col_num, header in enumerate(desc_headers, 1):
            cell = ws2.cell(row=3, column=col_num, value=header)
            cell.font = font_header
            cell.fill = fill_header
            cell.alignment = align_center

        for row_idx, r_data in enumerate(summary_stats, 4):
            ws2.cell(row=row_idx, column=1, value=format_group_name(r_data.get("Group"))).font = font_bold
            ws2.cell(row=row_idx, column=2, value=r_data.get("N")).alignment = align_center
            ws2.cell(row=row_idx, column=3, value=r_data.get("Sum"))
            ws2.cell(row=row_idx, column=4, value=r_data.get("Mean"))
            ws2.cell(row=row_idx, column=5, value=r_data.get("Variance"))
            ws2.cell(row=row_idx, column=6, value=r_data.get("SD"))
            
            # Retrieve or calculate SE
            se_val = r_data.get("SE")
            if se_val is None:
                n_val = r_data.get("N", 0)
                sd_val = r_data.get("SD", 0)
                se_val = sd_val / (n_val ** 0.5) if n_val > 0 else 0
            
            ws2.cell(row=row_idx, column=7, value=round(float(se_val), 4))
            ws2.cell(row=row_idx, column=8, value=r_data.get("SumSq"))

            for col_num in range(1, 9):
                cell = ws2.cell(row=row_idx, column=col_num)
                cell.font = font_bold if col_num == 1 else font_regular
                cell.border = border_all
                if col_num > 1:
                    cell.alignment = align_right if col_num != 2 else align_center

        # Sheet 3: ANOVA Table
        ws3 = wb.create_sheet(title="ANOVA Table")
        ws3.views.sheetView[0].showGridLines = True
        ws3.cell(row=1, column=1, value="One-Way ANOVA Table (F-Test)").font = font_title

        anova_headers = ["Source of Variation", "SS", "df", "MS", "F-value", "p-value", "Sig."]
        for col_num, header in enumerate(anova_headers, 1):
            cell = ws3.cell(row=3, column=col_num, value=header)
            cell.font = font_header
            cell.fill = fill_header
            cell.alignment = align_center

        between_data = anova_table.get("Between", {})
        within_data = anova_table.get("Within", {})
        total_data = anova_table.get("Total", {})

        sig_star = "ns"
        p_val_num = between_data.get("p_value", 1.0)
        if isinstance(p_val_num, (int, float)):
            if p_val_num < 0.001: sig_star = "***"
            elif p_val_num < 0.01: sig_star = "**"
            elif p_val_num < 0.05: sig_star = "*"

        anova_rows = [
            ("Between Groups (Treatment)", between_data.get("SS"), between_data.get("df"), between_data.get("MS"), between_data.get("F"), between_data.get("p_value"), sig_star),
            ("Within Groups (Error)", within_data.get("SS"), within_data.get("df"), within_data.get("MS"), "", "", ""),
            ("Total", total_data.get("SS"), total_data.get("df"), "", "", "", "")
        ]

        for row_idx, r_data in enumerate(anova_rows, 4):
            for col_num, val in enumerate(r_data, 1):
                cell = ws3.cell(row=row_idx, column=col_num, value=val)
                cell.border = border_all
                if row_idx == 6:  # Total row
                    cell.fill = fill_light
                    cell.font = font_bold
                else:
                    cell.font = font_bold if col_num == 1 else font_regular

                if col_num in [2, 3, 4, 5, 6]:
                    if isinstance(val, (int, float)):
                        cell.value = round(val, 4)
                    cell.alignment = align_right
                elif col_num == 7:
                    cell.alignment = align_center

        # Sheet 4: Assumption Tests
        ws4 = wb.create_sheet(title="Assumption Tests")
        ws4.views.sheetView[0].showGridLines = True

        ws4.cell(row=1, column=1, value="Homogeneity of Variance (Levene's Test)").font = font_title

        ws4.cell(row=3, column=1, value="Levene Statistic").font = font_bold
        ws4.cell(row=3, column=2, value=levene_result.get("Statistic")).alignment = align_right
        ws4.cell(row=4, column=1, value="p-value").font = font_bold
        ws4.cell(row=4, column=2, value=levene_result.get("p_value")).alignment = align_right
        ws4.cell(row=5, column=1, value="Assumption Met?").font = font_bold
        ws4.cell(row=5, column=2, value="Yes" if levene_result.get("Equal_Variance") else "No").alignment = align_center

        for r in range(3, 6):
            ws4.cell(row=r, column=1).border = border_all
            ws4.cell(row=r, column=1).fill = fill_light
            ws4.cell(row=r, column=2).border = border_all

        ws4.cell(row=7, column=1, value="Levene's Test Interpretation:").font = font_bold
        equal_var = levene_result.get("Equal_Variance", False)
        lev_interp = "Variances appear sufficiently equal across treatment groups. Standard ANOVA assumptions are met." if equal_var else "Group variances differ significantly. ANOVA is generally robust to moderate variance differences when group sizes are equal, but results should be interpreted cautiously."
        c_lev_text = ws4.cell(row=8, column=1, value=lev_interp)
        c_lev_text.font = font_regular
        c_lev_text.alignment = Alignment(wrap_text=True, vertical="top")
        ws4.merge_cells(start_row=8, start_column=1, end_row=9, end_column=5)

        ws4.cell(row=11, column=1, value="Normality Check (Shapiro-Wilk Test)").font = font_title

        shapiro_headers = ["Group", "W Statistic", "p-value", "Interpretation"]
        for col_num, header in enumerate(shapiro_headers, 1):
            cell = ws4.cell(row=13, column=col_num, value=header)
            cell.font = font_header
            cell.fill = fill_header
            cell.alignment = align_center

        for row_idx, r_data in enumerate(shapiro_results, 14):
            is_normal = r_data.get("Normal")
            if is_normal is None:
                normal_text = r_data.get("Note", "N < 3")
            else:
                normal_text = "Approximately normal" if is_normal else "Possible deviation from normality"

            ws4.cell(row=row_idx, column=1, value=format_group_name(r_data.get("Group"))).font = font_bold
            
            w_stat = r_data.get("Statistic")
            ws4.cell(row=row_idx, column=2, value=round(w_stat, 4) if isinstance(w_stat, (int, float)) else w_stat).alignment = align_right
            
            p_val_sh = r_data.get("p_value")
            ws4.cell(row=row_idx, column=3, value=round(p_val_sh, 4) if isinstance(p_val_sh, (int, float)) else p_val_sh).alignment = align_right
            
            ws4.cell(row=row_idx, column=4, value=normal_text).alignment = align_left

            for col_num in range(1, 5):
                cell = ws4.cell(row=row_idx, column=col_num)
                cell.font = font_bold if col_num == 1 else font_regular
                cell.border = border_all

        # Sheet 5: Tukey HSD
        ws5 = wb.create_sheet(title="Tukey HSD")
        ws5.views.sheetView[0].showGridLines = True
        ws5.cell(row=1, column=1, value="Post-Hoc Pairwise Comparisons (Tukey HSD)").font = font_title

        tukey_headers = ["Comparison", "Mean Difference", "Adjusted p-value", "95% CI Lower", "95% CI Upper", "Significant?"]
        for col_num, header in enumerate(tukey_headers, 1):
            cell = ws5.cell(row=3, column=col_num, value=header)
            cell.font = font_header
            cell.fill = fill_header
            cell.alignment = align_center

        for row_idx, r_data in enumerate(tukey_results, 4):
            comp_name = f"{format_group_name(r_data.get('group1'))} vs {format_group_name(r_data.get('group2'))}"
            ws5.cell(row=row_idx, column=1, value=comp_name).font = font_bold
            ws5.cell(row=row_idx, column=2, value=round(r_data.get("meandiff", 0), 4)).alignment = align_right
            
            p_adj_val = r_data.get("p_adj")
            ws5.cell(row=row_idx, column=3, value=round(p_adj_val, 4) if isinstance(p_adj_val, (int, float)) else p_adj_val).alignment = align_right
            
            ws5.cell(row=row_idx, column=4, value=round(r_data.get("lower", 0), 4)).alignment = align_right
            ws5.cell(row=row_idx, column=5, value=round(r_data.get("upper", 0), 4)).alignment = align_right

            reject = r_data.get("reject", False)
            sig_text = "Significant" if reject else "Not Significant"
            ws5.cell(row=row_idx, column=6, value=sig_text).alignment = align_center

            for col_num in range(1, 7):
                cell = ws5.cell(row=row_idx, column=col_num)
                cell.font = font_bold if col_num == 1 else font_regular
                cell.border = border_all
                if col_num == 6 and reject:
                    cell.fill = fill_sig

        # Sheet 6: Graph
        ws6 = wb.create_sheet(title="Graph")
        ws6.views.sheetView[0].showGridLines = True
        ws6.cell(row=1, column=1, value="Seedling Growth Analysis Graph").font = font_title
        if img:
            ws6.add_image(img, "B3")

        # Auto-adjust column widths safely
        for ws in wb.worksheets:
            if ws.title == "Graph":
                continue
            for col in ws.columns:
                max_len = 0
                col_letter = openpyxl.utils.get_column_letter(col[0].column)
                for cell in col:
                    if cell.value is not None:
                        val_str = str(cell.value)
                        # Skip merged cells and long descriptions from auto-width to prevent huge columns
                        if len(val_str) > 50:
                            continue
                        lines = val_str.split('\n')
                        for line in lines:
                            max_len = max(max_len, len(line))
                ws.column_dimensions[col_letter].width = max(max_len + 3, 12)

        # Save to memory
        output = io.BytesIO()
        wb.save(output)
        output.seek(0)

        # Dynamic filenames
        safe_crop = str(crop).replace(" ", "")
        safe_var = str(variable).replace(" ", "")
        safe_day = str(day).replace(" ", "")
        
        factor_suffix = ""
        if factor == "Concentration":
            factor_suffix = str(biochar).replace(" ", "_")
        elif factor == "Biochar":
            factor_suffix = "Biochar"
        else:
            factor_suffix = str(factor).replace(" ", "")
            
        filename = f"{safe_crop}_{safe_var}_{safe_day}_{factor_suffix}_Report.xlsx"

        return send_file(
            output,
            mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            as_attachment=True,
            download_name=filename
        )

    except Exception as e:
        import traceback
        print(traceback.format_exc())
        return jsonify({"status": "error", "message": f"Excel generation failed: {str(e)}"}), 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)

