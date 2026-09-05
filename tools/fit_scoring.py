#!/usr/bin/env python3
"""
fit_scoring.py — derive IDEAL_RANGES + WEIGHTS for core/coaching.py from a
calibration.csv produced by tools/calibrate.py over a tier-labelled set
(THETIS: expert = better mechanics, beginner = worse).

Method:
  * ranges: each metric's ideal band = (p25, p75) of the EXPERT clips for that
    stroke, i.e. "what good players actually do" in this pipeline's own units.
  * weights: coordinate-ascent on the metric weights to maximise the pooled AUC
    of overall-score vs is_expert (how well the score ranks good over bad).

Prints paste-ready IDEAL_RANGES and WEIGHTS plus the before/after AUC and the
expert/beginner mean-score gap per stroke.

    python tools/fit_scoring.py --csv calibration.csv
"""

import argparse
import csv
import numpy as np

STROKES = ('forehand', 'backhand', 'serve')
CONTACT = ['elbow_angle', 'hip_rotation', 'contact_height_ratio']
LOADING = ['shoulder_angle', 'knee_angle', 'racket_lag']
SCORED = ['elbow_angle', 'hip_rotation', 'shoulder_angle', 'knee_angle', 'racket_lag']

# current coaching.py values, for the before/after comparison
CUR_RANGES = {
    'forehand': {'elbow_angle': (125, 165), 'hip_rotation': (45, 95), 'shoulder_angle': (55, 100),
                 'knee_angle': (105, 145), 'racket_lag': (70, 145), 'contact_height_ratio': (0.9, 1.3)},
    'backhand': {'elbow_angle': (135, 158), 'hip_rotation': (55, 90), 'shoulder_angle': (65, 100),
                 'knee_angle': (120, 150), 'racket_lag': (65, 105), 'contact_height_ratio': (0.9, 1.3)},
    'serve': {'elbow_angle': (158, 178), 'hip_rotation': (40, 75), 'shoulder_angle': (155, 178),
              'knee_angle': (108, 140), 'racket_lag': (110, 165), 'contact_height_ratio': (1.5, 2.5)},
}
CUR_WEIGHTS = {'elbow_angle': 0.10, 'hip_rotation': 0.10, 'shoulder_angle': 0.25,
               'knee_angle': 0.20, 'racket_lag': 0.25, 'follow_through': 0.10}


def score_metric(value, lo, hi):
    """Mirror of CoachingEngine.score_metric."""
    if np.isnan(value):
        return 50.0
    if lo <= value <= hi:
        mid = (lo + hi) / 2
        half = (hi - lo) / 2
        return 85.0 + 15.0 * (1.0 - abs(value - mid) / (half + 1e-8))
    dist = (lo - value) if value < lo else (value - hi)
    return max(0.0, 100.0 - min(dist * 3.3, 100))


def auc(scores, labels):
    """P(score_expert > score_beginner). 0.5 = no separation."""
    pos = scores[labels == 1]
    neg = scores[labels == 0]
    if len(pos) == 0 or len(neg) == 0:
        return float('nan')
    order = np.argsort(np.concatenate([pos, neg]), kind='mergesort')
    ranks = np.empty(len(order), float)
    ranks[order] = np.arange(1, len(order) + 1)
    r_pos = ranks[:len(pos)].sum()
    return (r_pos - len(pos) * (len(pos) + 1) / 2) / (len(pos) * len(neg))


def load(csv_path):
    rows = [r for r in csv.DictReader(open(csv_path)) if not r.get('error')]
    data = {}
    for s in STROKES:
        g = [r for r in rows if r['label_stroke'] == s and r.get('tier') in ('expert', 'beginner')]
        if not g:
            continue
        y = np.array([1 if r['tier'] == 'expert' else 0 for r in g])
        cols = {}
        for m in SCORED + ['contact_height_ratio']:
            src = 'c_' if m in CONTACT else 'l_'
            cols[m] = np.array([float(r[src + m]) if r.get(src + m) not in (None, '') else np.nan
                                for r in g])
        ft = np.array([float(r.get('score_follow_through', 100)) >= 50 for r in g], float) * 70 + 30
        data[s] = {'y': y, 'cols': cols, 'ft': ft, 'n': len(g)}
    return data


def overall(data_s, ranges, weights):
    cols, ft = data_s['cols'], data_s['ft']
    tot = np.zeros(len(ft))
    wsum = 0.0
    for m in SCORED:
        lo, hi = ranges[m]
        sm = np.array([score_metric(v, lo, hi) for v in cols[m]])
        tot += weights[m] * sm
        wsum += weights[m]
    tot += weights['follow_through'] * ft
    wsum += weights['follow_through']
    return tot / wsum


def fit_weights(data, ranges, seed=0):
    keys = SCORED + ['follow_through']
    w = np.array([CUR_WEIGHTS[k] for k in keys], float)
    w /= w.sum()

    def pooled_auc(wv):
        wd = dict(zip(keys, wv))
        ss, yy = [], []
        for s, d in data.items():
            ss.append(overall(d, ranges[s], wd))
            yy.append(d['y'])
        return auc(np.concatenate(ss), np.concatenate(yy))

    best, best_auc = w.copy(), pooled_auc(w)
    rng = np.random.default_rng(seed)
    for _ in range(4000):
        cand = np.clip(best + rng.normal(0, 0.05, len(best)), 0.01, None)
        cand /= cand.sum()
        a = pooled_auc(cand)
        if a > best_auc:
            best, best_auc = cand, a
    return dict(zip(keys, best)), best_auc, pooled_auc


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--csv', default='calibration.csv')
    args = ap.parse_args()
    data = load(args.csv)

    # ranges from expert p25-p75
    ranges = {}
    for s, d in data.items():
        exp = d['y'] == 1
        r = {}
        for m in SCORED:
            v = d['cols'][m][exp]
            v = v[~np.isnan(v)]
            p25, p75 = np.percentile(v, [25, 75])
            r[m] = (int(round(p25)), int(round(p75)))
        v = d['cols']['contact_height_ratio'][exp]
        v = v[~np.isnan(v)]
        r['contact_height_ratio'] = (round(float(np.percentile(v, 25)), 1),
                                     round(float(np.percentile(v, 75)), 1))
        ranges[s] = r

    weights, fitted_auc, pooled_auc = fit_weights(data, ranges)

    cur_auc = pooled_auc(np.array([CUR_WEIGHTS[k] for k in SCORED + ['follow_through']])
                         / sum(CUR_WEIGHTS.values()))

    print("=" * 68)
    print("per-stroke expert vs beginner  (mean overall score)")
    print("=" * 68)
    for s, d in data.items():
        cur = overall(d, CUR_RANGES[s], {k: CUR_WEIGHTS[k] / sum(CUR_WEIGHTS.values())
                                         for k in CUR_WEIGHTS})
        new = overall(d, ranges[s], weights)
        for tag, sc in (('current', cur), ('fitted ', new)):
            e, b = sc[d['y'] == 1].mean(), sc[d['y'] == 0].mean()
            print(f"  {s:<9} {tag}: expert {e:5.1f}   beginner {b:5.1f}   gap {e - b:+5.1f}"
                  f"   AUC {auc(sc, d['y']):.3f}")
    print(f"\npooled AUC:  current {cur_auc:.3f}  ->  fitted {fitted_auc:.3f}")

    print("\n" + "=" * 68)
    print("IDEAL_RANGES  (expert p25-p75, THETIS)")
    print("=" * 68)
    for s in STROKES:
        if s not in ranges:
            continue
        print(f"    '{s}': {{")
        for m in CONTACT + LOADING:
            print(f"        '{m}': {ranges[s][m]},")
        print("    },")

    print("\n" + "=" * 68)
    print("WEIGHTS  (coordinate-ascent on pooled AUC)")
    print("=" * 68)
    print("WEIGHTS = {")
    for k in SCORED + ['follow_through']:
        print(f"    '{k}': {weights[k]:.2f},")
    print("}")


if __name__ == '__main__':
    main()
