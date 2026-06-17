import unittest
import numpy as np
import scipy.stats as stats
import statsmodels.stats.multicomp as mc
import sys
import os

# Add the project directory to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

class TestOneWayANOVA(unittest.TestCase):
    
    def setUp(self):
        # Sample normal datasets with known means and variances
        self.g1 = [1.2, 1.5, 1.8, 1.4, 1.6]
        self.g2 = [2.2, 2.5, 2.8, 2.4, 2.6]
        self.g3 = [3.2, 3.5, 3.8, 3.4, 3.6]
        self.all_groups = [self.g1, self.g2, self.g3]

    def test_standard_anova_calculation(self):
        # Perform standard ANOVA calculations manually/separately
        f_stat_expected, p_val_expected = stats.f_oneway(self.g1, self.g2, self.g3)
        
        # calculate sum of squares
        all_vals = self.g1 + self.g2 + self.g3
        grand_mean = np.mean(all_vals)
        ss_total = sum((x - grand_mean)**2 for x in all_vals)
        ss_between = len(self.g1)*(np.mean(self.g1) - grand_mean)**2 + \
                     len(self.g2)*(np.mean(self.g2) - grand_mean)**2 + \
                     len(self.g3)*(np.mean(self.g3) - grand_mean)**2
        ss_within = ss_total - ss_between
        
        df_between = 3 - 1
        df_within = 15 - 3
        
        ms_between = ss_between / df_between
        ms_within = ss_within / df_within
        f_stat = ms_between / ms_within
        
        self.assertAlmostEqual(f_stat, f_stat_expected)
        self.assertAlmostEqual(ss_total, ss_between + ss_within)
        self.assertEqual(df_between, 2)
        self.assertEqual(df_within, 12)

    def test_shapiro_wilk(self):
        # Shapiro-Wilk test on normal groups
        for idx, group in enumerate(self.all_groups):
            sh_stat, sh_p = stats.shapiro(group)
            self.assertTrue(sh_stat > 0)
            self.assertTrue(0 <= sh_p <= 1)

    def test_levene_test(self):
        # Levene's test on equal variances
        lev_stat, lev_p = stats.levene(self.g1, self.g2, self.g3)
        self.assertTrue(lev_stat >= 0)
        self.assertTrue(0 <= lev_p <= 1)

    def test_tukey_hsd(self):
        # Tukey HSD pairwise checks
        all_vals = self.g1 + self.g2 + self.g3
        all_labels = ["G1"]*5 + ["G2"]*5 + ["G3"]*5
        res = mc.pairwise_tukeyhsd(all_vals, all_labels, alpha=0.05)
        
        # Verify comparisons count
        self.assertEqual(len(res.meandiffs), 3)
        # Differences: G2-G1=1.0, G3-G1=2.0, G3-G2=1.0
        self.assertAlmostEqual(res.meandiffs[0], 1.0)
        self.assertAlmostEqual(res.meandiffs[1], 2.0)
        self.assertAlmostEqual(res.meandiffs[2], 1.0)

    def test_zero_variance_protection(self):
        # If a group has std == 0, we add a tiny epsilon to make variance positive
        zero_var_group = [2.0, 2.0, 2.0, 2.0, 2.0]
        
        # detect and apply protection
        if np.std(zero_var_group) == 0:
            zero_var_group = list(zero_var_group)
            zero_var_group[0] += 1e-6
            
        std_val = np.std(zero_var_group)
        self.assertTrue(std_val > 0)
        self.assertAlmostEqual(np.mean(zero_var_group), 2.0, places=5)

    def test_missing_values(self):
        # Drop NaNs without breaking alignment
        dirty_data = [1.2, None, 1.8, 1.4, np.nan, 1.6]
        clean_data = [float(x) for x in dirty_data if x is not None and not np.isnan(x)]
        
        self.assertEqual(len(clean_data), 4)
        self.assertEqual(clean_data, [1.2, 1.8, 1.4, 1.6])

    def test_effect_size_eta_squared(self):
        # We can calculate F-test and eta_squared manually for g1, g2, g3
        all_vals = self.g1 + self.g2 + self.g3
        grand_mean = np.mean(all_vals)
        ss_total = sum((x - grand_mean)**2 for x in all_vals)
        ss_between = len(self.g1)*(np.mean(self.g1) - grand_mean)**2 + \
                     len(self.g2)*(np.mean(self.g2) - grand_mean)**2 + \
                     len(self.g3)*(np.mean(self.g3) - grand_mean)**2
                     
        expected_eta = ss_between / ss_total
        
        # Now make an API call or check using the test client
        from app import app
        client = app.test_client()
        response = client.get('/api/one-way?crop=Onion&variable=Root%20Length&day=Day%207&factor=Concentration&biochar_filter=Acrostichum%20aureum')
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        
        # Verify eta_squared is present and between 0 and 1
        self.assertIn('eta_squared', data)
        self.assertIn('eta_interpretation', data)
        self.assertTrue(0 <= data['eta_squared'] <= 1)
        # Check interpretation category
        if data['eta_squared'] >= 0.14:
            self.assertEqual(data['eta_interpretation'], "Large")

        # Verify p-value display formatting fields exist
        self.assertIn('p_value_display', data['anova_table']['Between'])
        self.assertIn('p_value_display', data['shapiro_results'][0])
        self.assertIn('p_value_display', data['levene_result'])
        self.assertIn('p_adj_display', data['tukey_results'][0])

    def test_tukey_q_statistic(self):
        from app import app
        client = app.test_client()
        response = client.get('/api/one-way?crop=Onion&variable=Root%20Length&day=Day%207&factor=Concentration&biochar_filter=Acrostichum%20aureum')
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        
        # Verify that all tukey_results contain q_stat
        self.assertIn('tukey_results', data)
        for row in data['tukey_results']:
            self.assertIn('q_stat', row)
            self.assertTrue(row['q_stat'] >= 0)
            
            # Recalculate manually to verify Q = |mean1 - mean2| / SE_comp
            g1_name = row['group1']
            g2_name = row['group2']
            g1_vals = [pt['Value'] for pt in data['raw_data_points'] if pt['Group'] == g1_name]
            g2_vals = [pt['Value'] for pt in data['raw_data_points'] if pt['Group'] == g2_name]
            mean1 = np.mean(g1_vals)
            mean2 = np.mean(g2_vals)
            n1 = len(g1_vals)
            n2 = len(g2_vals)
            ms_within = data['anova_table']['Within']['MS']
            
            se_comparison = np.sqrt((ms_within / 2.0) * ((1.0 / n1) + (1.0 / n2)))
            expected_q = abs(mean1 - mean2) / se_comparison
            self.assertAlmostEqual(row['q_stat'], expected_q, places=2)

    def test_cld_letters_correctness(self):
        from app import app
        client = app.test_client()
        response = client.get('/api/one-way?crop=Onion&variable=Root%20Length&day=Day%207&factor=Concentration&biochar_filter=Acrostichum%20aureum')
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        
        # Verify tukey_letters are present
        self.assertIn('tukey_letters', data)
        letters = data['tukey_letters']
        
        # Group with the highest mean must have 'a'
        sorted_stats = sorted(data['summary_stats'], key=lambda s: s['Mean'], reverse=True)
        from app import format_group_name
        highest_group_formatted = format_group_name(sorted_stats[0]['Group'])
        self.assertIn(highest_group_formatted, letters)
        self.assertTrue(letters[highest_group_formatted].startswith('a'))
        
        # Letters must be lowercase strings containing alphabet letters
        for g, let in letters.items():
            self.assertTrue(let.islower())
            self.assertTrue(all('a' <= c <= 'z' for c in let))

    def test_control_response_and_null_state(self):
        from app import app
        client = app.test_client()
        
        # Case 1: Control group exists (Concentration factor grouped by Biochar)
        response1 = client.get('/api/one-way?crop=Onion&variable=Root%20Length&day=Day%207&factor=Concentration&biochar_filter=Acrostichum%20aureum')
        self.assertEqual(response1.status_code, 200)
        data1 = response1.get_json()
        self.assertIn('control_response', data1)
        self.assertIsNotNone(data1['control_response'])
        self.assertTrue(len(data1['control_response']) > 0)
        
        # Check that percent change is calculated correctly and interpretation matches
        for row in data1['control_response']:
            self.assertIn('treatment', row)
            self.assertIn('diff', row)
            self.assertIn('pct_change', row)
            self.assertIn('interpretation', row)
            
            # Verify interpretation based on pct_change
            pct = row['pct_change']
            interp = row['interpretation']
            if pct <= -10.0:
                self.assertEqual(interp, "Strong growth inhibition")
            elif pct < 0.0:
                self.assertEqual(interp, "Slight growth inhibition")
            elif pct < 10.0:
                self.assertEqual(interp, "Slight growth improvement")
            else:
                self.assertEqual(interp, "Substantial growth improvement")

        # Case 2: No Control group exists (e.g. Day factor grouped by Biochar and Concentration)
        response2 = client.get('/api/one-way?crop=Onion&variable=Root%20Length&factor=Day&biochar_filter=Acrostichum%20aureum&concentration_filter=0.5')
        self.assertEqual(response2.status_code, 200)
        data2 = response2.get_json()
        self.assertIn('control_response', data2)
        # Should be None/null because group names are Day 3, Day 5, Day 7 - no Control.
        self.assertIsNone(data2['control_response'])

class TestTwoWayANOVA(unittest.TestCase):
    def setUp(self):
        # Create an artificial unbalanced two-way dataset
        # Factor A: Biochar (B1, B2)
        # Factor B: Concentration (C0, C1, C2)
        # Replicated control (C0) has N=6, treatments have N=3
        self.data = []
        
        # B1 cells
        self.data.extend([{"Biochar": "B1", "Concentration": 0.0, "Value": v} for v in [1.0, 1.1, 0.9, 1.0, 1.2, 0.8]]) # C0
        self.data.extend([{"Biochar": "B1", "Concentration": 0.5, "Value": v} for v in [1.5, 1.6, 1.4]])             # C1
        self.data.extend([{"Biochar": "B1", "Concentration": 1.0, "Value": v} for v in [2.0, 2.2, 2.1]])             # C2

        # B2 cells
        self.data.extend([{"Biochar": "B2", "Concentration": 0.0, "Value": v} for v in [1.0, 1.1, 0.9, 1.0, 1.2, 0.8]]) # C0 (replicated)
        self.data.extend([{"Biochar": "B2", "Concentration": 0.5, "Value": v} for v in [1.2, 1.3, 1.1]])             # C1
        self.data.extend([{"Biochar": "B2", "Concentration": 1.0, "Value": v} for v in [1.4, 1.5, 1.3]])             # C2
        
        import pandas as pd
        self.df = pd.DataFrame(self.data)

    def test_twoway_anova_type3(self):
        import statsmodels.api as sm
        from statsmodels.formula.api import ols
        
        # Fit model with Sum contrast coding
        model = ols('Value ~ C(Biochar, Sum) * C(Concentration, Sum)', data=self.df).fit()
        anova_table = sm.stats.anova_lm(model, typ=3)
        
        # Total sample size N = 6 (B1 C0) + 3 (B1 C1) + 3 (B1 C2) + 6 (B2 C0) + 3 (B2 C1) + 3 (B2 C2) = 24
        # df_total = 23
        df_Biochar = anova_table.loc['C(Biochar, Sum)', 'df']
        df_Concentration = anova_table.loc['C(Concentration, Sum)', 'df']
        df_Interaction = anova_table.loc['C(Biochar, Sum):C(Concentration, Sum)', 'df']
        df_Residual = anova_table.loc['Residual', 'df']
        
        self.assertEqual(df_Biochar, 1)        # 2 biochars - 1
        self.assertEqual(df_Concentration, 2)  # 3 concentrations - 1
        self.assertEqual(df_Interaction, 2)    # 1 * 2
        self.assertEqual(df_Residual, 18)      # 24 - 6 cells = 18 degrees of freedom for error
        
        df_sum = df_Biochar + df_Concentration + df_Interaction + df_Residual
        self.assertEqual(df_sum, 23)

class TestAPIRoutes(unittest.TestCase):
    def setUp(self):
        from app import app
        self.client = app.test_client()
        self.client.testing = True

    def test_metadata_endpoint(self):
        response = self.client.get('/api/metadata')
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data['status'], 'success')
        self.assertIn('Onion', data['metadata'])
        self.assertIn('Pea', data['metadata'])

    def test_oneway_endpoint(self):
        response = self.client.get('/api/one-way?crop=Onion&variable=Root%20Length&day=Day%207&factor=Concentration&biochar_filter=Acrostichum%20aureum')
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data['status'], 'success')
        self.assertIn('summary_stats', data)
        self.assertIn('anova_table', data)
        self.assertIn('tukey_results', data)

    def test_twoway_endpoint(self):
        response = self.client.get('/api/two-way?crop=Onion&variable=Root%20Length&day=Day%207')
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data['status'], 'success')
        self.assertIn('anova_table', data)
        self.assertIn('cell_means', data)
        self.assertIn('posthoc_results', data)
        self.assertIn('interaction_plot_data', data)

    def test_export_excel_endpoint(self):
        # 1. Get stats from one-way endpoint
        oneway_resp = self.client.get('/api/one-way?crop=Onion&variable=Root%20Length&day=Day%207&factor=Concentration&biochar_filter=Acrostichum%20aureum')
        self.assertEqual(oneway_resp.status_code, 200)
        oneway_data = oneway_resp.get_json()

        # 2. Build payload with a minimal mock 1x1 pixel PNG in base64
        mock_png_base64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
        
        payload = {
            "crop": "Onion",
            "variable": "Root Length",
            "day": "Day 7",
            "factor": "Concentration",
            "biochar": "Acrostichum aureum",
            "summary_stats": oneway_data.get("summary_stats", []),
            "anova_table": oneway_data.get("anova_table", {}),
            "levene_result": oneway_data.get("levene_result", {}),
            "shapiro_results": oneway_data.get("shapiro_results", []),
            "tukey_results": oneway_data.get("tukey_results", []),
            "inference_summary": "Statistically Significant",
            "chart_image": mock_png_base64
        }

        # 3. Call export endpoint
        response = self.client.post('/api/export-excel', json=payload)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.mimetype, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        
        # Verify it's a valid zip file structure (which Excel files are)
        import zipfile
        from io import BytesIO
        try:
            zip_file = zipfile.ZipFile(BytesIO(response.data))
            # Verify basic Excel internal files are present
            self.assertIn('[Content_Types].xml', zip_file.namelist())
            self.assertIn('xl/workbook.xml', zip_file.namelist())
        except Exception as zip_err:
            self.fail(f"Exported Excel file is not a valid zip archive: {str(zip_err)}")

    def test_configurable_alpha_oneway(self):
        # 1. Test default alpha
        resp_def = self.client.get('/api/one-way?crop=Onion&variable=Root%20Length&day=Day%207&factor=Concentration&biochar_filter=Acrostichum%20aureum')
        self.assertEqual(resp_def.status_code, 200)
        data_def = resp_def.get_json()
        self.assertEqual(data_def['alpha'], 0.05)

        # 2. Test valid alpha values
        for a in [0.001, 0.01, 0.05]:
            resp = self.client.get(f'/api/one-way?crop=Onion&variable=Root%20Length&day=Day%207&factor=Concentration&biochar_filter=Acrostichum%20aureum&alpha={a}')
            self.assertEqual(resp.status_code, 200)
            data = resp.get_json()
            self.assertEqual(data['alpha'], a)
            
            # F-statistic and raw p-values must remain identical to default
            self.assertEqual(data['anova_table']['Between']['F'], data_def['anova_table']['Between']['F'])
            self.assertEqual(data['anova_table']['Between']['p_value'], data_def['anova_table']['Between']['p_value'])

        # 3. Test invalid alpha falls back to 0.05
        resp_inv = self.client.get('/api/one-way?crop=Onion&variable=Root%20Length&day=Day%207&factor=Concentration&biochar_filter=Acrostichum%20aureum&alpha=0.25')
        self.assertEqual(resp_inv.status_code, 200)
        data_inv = resp_inv.get_json()
        self.assertEqual(data_inv['alpha'], 0.05)

        # 4. Test that 0.10 is now rejected and falls back to 0.05
        resp_10 = self.client.get('/api/one-way?crop=Onion&variable=Root%20Length&day=Day%207&factor=Concentration&biochar_filter=Acrostichum%20aureum&alpha=0.10')
        self.assertEqual(resp_10.status_code, 200)
        data_10 = resp_10.get_json()
        self.assertEqual(data_10['alpha'], 0.05)

    def test_configurable_alpha_twoway(self):
        # 1. Test default alpha
        resp_def = self.client.get('/api/two-way?crop=Onion&variable=Root%20Length&day=Day%207')
        self.assertEqual(resp_def.status_code, 200)
        data_def = resp_def.get_json()
        self.assertEqual(data_def['alpha'], 0.05)

        # 2. Test valid alpha values
        for a in [0.001, 0.01, 0.05]:
            resp = self.client.get(f'/api/two-way?crop=Onion&variable=Root%20Length&day=Day%207&alpha={a}')
            self.assertEqual(resp.status_code, 200)
            data = resp.get_json()
            self.assertEqual(data['alpha'], a)
            
            # F-value and raw p-value must remain identical
            row_key = "C(Biochar, Sum):C(Concentration, Sum)"
            self.assertEqual(data['anova_table'][row_key]['F'], data_def['anova_table'][row_key]['F'])
            self.assertEqual(data['anova_table'][row_key]['p_value'], data_def['anova_table'][row_key]['p_value'])

        # 3. Test invalid alpha falls back to 0.05
        resp_inv = self.client.get('/api/two-way?crop=Onion&variable=Root%20Length&day=Day%207&alpha=invalid')
        self.assertEqual(resp_inv.status_code, 200)
        data_inv = resp_inv.get_json()
        self.assertEqual(data_inv['alpha'], 0.05)

        # 4. Test that 0.10 is now rejected and falls back to 0.05
        resp_10 = self.client.get('/api/two-way?crop=Onion&variable=Root%20Length&day=Day%207&alpha=0.10')
        self.assertEqual(resp_10.status_code, 200)
        data_10 = resp_10.get_json()
        self.assertEqual(data_10['alpha'], 0.05)

if __name__ == "__main__":
    unittest.main()

