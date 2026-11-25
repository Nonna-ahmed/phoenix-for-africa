import numpy as np, math
def held(blockfn, nI, nJ):
    II, JJ = np.meshgrid(np.arange(nI), np.arange(nJ), indexing='ij'); b = blockfn(II, JJ)
    ub = np.unique(b); rng = np.random.RandomState(7)
    h = set(rng.choice(ub, size=len(ub) // 4, replace=False).tolist()); return np.isin(b, list(h))

def test_pilot_split_identical_to_original_formula():
    """Original train.py: block=(II//4)*10+(JJ//4). Generalized: (II//bs)*10000+(JJ//bs), bs=round(1/step)."""
    W, S, E, N, step = 24.8, -13.0, 29.0, -8.2, 0.25
    nI = int(math.ceil((E - W) / step)); nJ = int(math.ceil((N - S) / step)); bs = round(1 / step)
    assert bs == 4 and nJ // 4 + 1 < 10          # old formula has no id collisions on the pilot grid
    old = held(lambda I, J: (I // 4) * 10 + (J // 4), nI, nJ)
    new = held(lambda I, J: (I // bs) * 10000 + (J // bs), nI, nJ)
    assert (old == new).all() and int(old.sum()) == 84   # 84 = held_out_cells in the shipped results.json
