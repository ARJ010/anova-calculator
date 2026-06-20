import sys
# Add codebase to path
sys.path.append('/home/arj010/Documents/Adithya/anova-calculator')

from app import app
client = app.test_client()

response = client.get('/api/one-way?crop=Onion&variable=Root%20Length&day=Day%207&factor=Concentration&biochar_filter=Acrostichum%20aureum&alpha=0.001')
data = response.get_json()

print("--- Pairwise Tukey HSD at Alpha = 0.001 ---")
for r in data['tukey_results']:
    g1 = r['group1']
    g2 = r['group2']
    meandiff = r['meandiff']
    lower = r['lower']
    upper = r['upper']
    reject = r['reject']
    print(f"{g1} vs {g2}: meandiff={meandiff:.4f}, bounds=[{lower:.4f}, {upper:.4f}], reject={reject}")
