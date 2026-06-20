import sys
import os
import numpy as np

# Add codebase to path
sys.path.append('/home/arj010/Documents/Adithya/anova-calculator')

from app import app

client = app.test_client()

print("--- Running Two-Way ANOVA Verification (Crop: Onion, Day: Day 7, Variable: Root Length) ---")

alphas = [0.001, 0.01, 0.05, 0.10]
results = {}

for a in alphas:
    response = client.get(f'/api/two-way?crop=Onion&variable=Root%20Length&day=Day%207&alpha={a}')
    if response.status_code != 200:
        print(f"Error calling API for alpha={a}")
        sys.exit(1)
    results[a] = response.get_json()

# Look at the ANOVA table for default alpha = 0.05
res_05 = results[0.05]
model_formula = res_05['debug_details']['model_formula']
print(f"\nModel Formula: {model_formula}")

# Compare ANOVA table F-values and p-values
for factor_key in ["C(Biochar, Sum)", "C(Concentration, Sum)", "C(Biochar, Sum):C(Concentration, Sum)"]:
    print(f"\nFactor: {factor_key}")
    f_05 = res_05['anova_table'][factor_key]['F']
    p_05 = res_05['anova_table'][factor_key]['p_value']
    print(f"  [Alpha = 0.05] F: {f_05}, p: {p_05}")
    
    for a in [0.001, 0.01, 0.10]:
        res_a = results[a]
        f_a = res_a['anova_table'][factor_key]['F']
        p_a = res_a['anova_table'][factor_key]['p_value']
        
        # Check matching
        match_f = np.isclose(f_05, f_a) if isinstance(f_05, (int, float)) and isinstance(f_a, (int, float)) else f_05 == f_a
        match_p = np.isclose(p_05, p_a) if isinstance(p_05, (int, float)) and isinstance(p_a, (int, float)) else p_05 == p_a
        print(f"  [Alpha = {a}] F matches: {match_f}, p matches: {match_p}")

# Let's inspect how posthoc reject decisions change
print("\n--- Post-Hoc Comparisons (Acrostichum aureum, first 3 comparisons) ---")
biochar_key = "Acrostichum aureum"
comps_05 = res_05['posthoc_results'][biochar_key][:3]

for comp_idx, c_05 in enumerate(comps_05):
    g1 = c_05['group1']
    g2 = c_05['group2']
    meandiff = c_05['meandiff']
    p_adj = c_05['p_adj']
    print(f"\nComparison: {g1} vs {g2} (meandiff: {meandiff:.4f}, p_adj: {p_adj:.6f})")
    print(f"  [Alpha = 0.05] reject: {c_05['reject']} (lower: {c_05['lower']:.4f}, upper: {c_05['upper']:.4f})")
    
    for a in [0.001, 0.01, 0.10]:
        c_a = results[a]['posthoc_results'][biochar_key][comp_idx]
        print(f"  [Alpha = {a}] reject: {c_a['reject']} (lower: {c_a['lower']:.4f}, upper: {c_a['upper']:.4f})")

print("\nVerification done.")
