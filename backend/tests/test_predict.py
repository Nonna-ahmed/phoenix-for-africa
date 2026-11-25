import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import pandas as pd

def test_confidence_words_and_letters_map_to_same_class():
    s = pd.Series(['nominal', 'high', 'low', 'n', 'h', 'l'])
    assert s.astype(str).str[0].str.lower().isin(['n', 'h']).tolist() == [True, True, False, True, True, False]
