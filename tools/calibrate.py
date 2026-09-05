#!/usr/bin/env python3
"""
calibrate.py — Batch-run the swing pipeline over a labelled clip library and
report the metric distributions needed to re-tune core/coaching.py IDEAL_RANGES.

The scored metrics live in two phases:
    contact  -> elbow_angle, hip_rotation, contact_height_ratio
    loading  -> shoulder_angle, knee_angle, racket_lag

Usage:
    # Folder with per-stroke subdirs: <root>/forehand/*.mp4, <root>/backhand/*.mp4 ...
    python tools/calibrate.py --videos data/thetis --out calibration.csv

    # Flat folder, force one stroke label for every clip
    python tools/calibrate.py --videos clips/ --stroke forehand

    # No videos — just summarise the bundled pro reference JSONs
    python tools/calibrate.py --pros

Stroke label per clip is resolved as: --stroke flag > parent dir name > a
stroke word found in the filename > "unknown".
"""

import argparse
import csv
import glob
import json
import os
import re
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

CONTACT_METRICS = ['elbow_angle', 'hip_rotation', 'contact_height_ratio']
LOADING_METRICS = ['shoulder_angle', 'knee_angle', 'racket_lag']
STROKES = ('forehand', 'backhand', 'serve')
VIDEO_EXTS = ('.mp4', '.avi', '.mov', '.mkv', '.m4v')

# THETIS folder / filename tokens -> canonical stroke. Slices, volleys, smashes,
# 2-handed backhands and kick/slice serves are left out on purpose: their ideal
# mechanics differ from the flat groundstroke ranges coaching.py scores against.
THETIS_ALIASES = {
    'forehand_flat': 'forehand', 'foreflat': 'forehand',
    'backhand': 'backhand',
    'flat_service': 'serve', 'serflat': 'serve',
}

# THETIS: p1-p31 beginners, p32-p55 experts.
THETIS_EXPERT_MIN = 32


def resolve_stroke(path, forced):
    if forced:
        return forced
    parent = os.path.basename(os.path.dirname(path)).lower()
    name = os.path.basename(path).lower()
    for key, canon in THETIS_ALIASES.items():
        if key in parent or key in name:
            return canon
    if parent in STROKES:
        return parent
    for s in STROKES:
        if s in name:
            return s
    return 'unknown'


def resolve_tier(path):
    """THETIS player tier from a pNN token in the filename, else ''."""
    m = re.search(r'p(\d+)', os.path.basename(path).lower())
    if not m:
        return ''
    return 'expert' if int(m.group(1)) >= THETIS_EXPERT_MIN else 'beginner'


def iter_videos(root):
    for dirpath, _, files in os.walk(root):
        for fn in sorted(files):
            if os.path.splitext(fn)[1].lower() in VIDEO_EXTS:
                yield os.path.join(dirpath, fn)


def analyse_clip(path, forced_stroke, hand, engines):
    import cv2
    pose, classifier, coach = engines
    from utils import read_video

    label = resolve_stroke(path, forced_stroke)

    cap = cv2.VideoCapture(path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    cap.release()
    if not fps or fps <= 1 or fps > 240:
        fps = 30.0

    frames = read_video(path)
    if not frames:
        return {'file': path, 'label_stroke': label, 'error': 'unreadable'}

    kps = pose.extract_keypoints_batch(frames)
    detect_rate = sum(k is not None for k in kps) / len(kps)
    vel = pose.get_wrist_velocity(kps, fps=fps)
    acc = pose.get_wrist_acceleration(vel, fps=fps)
    phases = classifier.detect_phases(kps, vel, acc)

    hint = label if label in STROKES else 'auto'
    contact_idx = classifier.find_contact_frame(kps, vel, phases, stroke_hint=hint, side=hand)
    contact_angles = pose.get_joint_angles(kps[contact_idx], side=hand) if kps[contact_idx] else None
    loading_angles = classifier.best_loading_angles(pose, kps, phases, side=hand)
    auto_stroke = classifier.classify_stroke(kps[contact_idx], kps, phases, side=hand) \
        if kps[contact_idx] else 'unknown'
    follow = classifier.detect_follow_through_completion(kps, phases)

    score_stroke = label if label in STROKES else auto_stroke
    scores = coach.score_swing(contact_angles, score_stroke, follow, loading_angles=loading_angles)

    row = {
        'file': os.path.relpath(path),
        'label_stroke': label,
        'tier': resolve_tier(path),
        'auto_stroke': auto_stroke,
        'n_frames': len(frames),
        'fps': round(fps, 2),
        'pose_detect_rate': round(detect_rate, 3),
        'contact_idx': contact_idx,
        'follow_through': int(follow),
    }
    for m in CONTACT_METRICS:
        row[f'c_{m}'] = round(contact_angles[m], 2) if contact_angles and m in contact_angles else ''
    for m in LOADING_METRICS:
        row[f'l_{m}'] = round(loading_angles[m], 2) if loading_angles and m in loading_angles else ''
    if scores:
        for m in CONTACT_METRICS[:2] + LOADING_METRICS + ['follow_through', 'overall']:
            if m in scores:
                row[f'score_{m}'] = round(scores[m], 1)
    return row


def pctl_table(values):
    a = np.asarray(values, dtype=float)
    a = a[~np.isnan(a)]
    if a.size == 0:
        return None
    p = np.percentile(a, [10, 25, 50, 75, 90])
    return {'n': a.size, 'p10': p[0], 'p25': p[1], 'p50': p[2], 'p75': p[3], 'p90': p[4],
            'min': a.min(), 'max': a.max()}


def summarise(rows, tier=None):
    """Group by label_stroke, print per-metric percentiles + a paste-ready range block.

    tier: if set ('expert'/'beginner'), only rows with that tier feed the bands —
    calibrate IDEAL_RANGES from experts, then check beginners score lower.
    """
    by_stroke = {}
    for r in rows:
        if r.get('error'):
            continue
        if tier and r.get('tier') and r['tier'] != tier:
            continue
        by_stroke.setdefault(r['label_stroke'], []).append(r)

    metric_cols = [('c_' + m, m, 'contact') for m in CONTACT_METRICS] + \
                  [('l_' + m, m, 'loading') for m in LOADING_METRICS]

    scope = f" [{tier} only]" if tier else ""
    for stroke, group in sorted(by_stroke.items()):
        tiers = {}
        for g in group:
            tiers[g.get('tier') or '?'] = tiers.get(g.get('tier') or '?', 0) + 1
        print(f"\n{'=' * 64}\n{stroke.upper()}{scope}  (n={len(group)} clips, {dict(tiers)})\n{'=' * 64}")
        low_med = f"  mean pose-detect rate: " \
                  f"{np.mean([g['pose_detect_rate'] for g in group]):.2f}"
        print(low_med)
        suggested = {}
        for col, metric, phase in metric_cols:
            vals = [g[col] for g in group if isinstance(g.get(col), (int, float))]
            t = pctl_table(vals) if vals else None
            if not t:
                print(f"  {metric:<22} ({phase:<7}) — no data")
                continue
            print(f"  {metric:<22} ({phase:<7}) n={t['n']:<3} "
                  f"min={t['min']:6.1f}  p10={t['p10']:6.1f}  p50={t['p50']:6.1f}  "
                  f"p90={t['p90']:6.1f}  max={t['max']:6.1f}")
            if metric != 'contact_height_ratio':
                suggested[metric] = (int(round(t['p10'])), int(round(t['p90'])))
            else:
                suggested[metric] = (round(float(t['p10']), 1), round(float(t['p90']), 1))
        if suggested and stroke in STROKES:
            print(f"\n  # paste into core/coaching.py IDEAL_RANGES  (p10–p90 band)")
            print(f"  '{stroke}': {{")
            for m in CONTACT_METRICS + LOADING_METRICS:
                if m in suggested:
                    print(f"      '{m}': {suggested[m]},")
            print("  },")


def summarise_pros():
    from core.coaching import PRO_DATA_DIR
    rows = []
    for f in sorted(glob.glob(os.path.join(PRO_DATA_DIR, '*.json'))):
        d = json.load(open(f))
        r = {'file': os.path.basename(f), 'label_stroke': d.get('stroke', 'unknown'),
             'auto_stroke': '', 'pose_detect_rate': 1.0}
        for m in CONTACT_METRICS:
            r[f'c_{m}'] = (d.get('contact_angles') or {}).get(m, '')
        for m in LOADING_METRICS:
            r[f'l_{m}'] = (d.get('loading_angles') or {}).get(m, '')
        rows.append(r)
    print(f"Loaded {len(rows)} pro reference files from {PRO_DATA_DIR}")
    summarise(rows)
    print("\nNOTE: several pro JSONs are hand-authored single samples — treat the "
          "bands above as a sanity check, not ground truth.")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--videos', help='root folder of labelled clips')
    ap.add_argument('--stroke', choices=STROKES, help='force this stroke label for every clip')
    ap.add_argument('--hand', default='right', choices=['right', 'left'])
    ap.add_argument('--out', default='calibration.csv', help='CSV output path')
    ap.add_argument('--pros', action='store_true', help='summarise data/pros/*.json instead')
    ap.add_argument('--limit', type=int, default=0, help='process at most N clips (0 = all)')
    ap.add_argument('--tier', choices=['expert', 'beginner'],
                    help='only use clips of this THETIS tier for the suggested ranges')
    args = ap.parse_args()

    if args.pros and not args.videos:
        summarise_pros()
        return
    if not args.videos:
        ap.error('pass --videos DIR (or --pros)')

    from core.pose_engine import PoseEngine
    from core.swing_classifier import SwingClassifier
    from core.coaching import CoachingEngine

    vids = list(iter_videos(args.videos))
    if args.limit:
        vids = vids[:args.limit]
    if not vids:
        ap.error(f'no video files under {args.videos}')
    print(f"Found {len(vids)} clips under {args.videos}")

    engines = (PoseEngine(), SwingClassifier(), CoachingEngine())
    rows = []
    for i, v in enumerate(vids, 1):
        try:
            row = analyse_clip(v, args.stroke, args.hand, engines)
        except Exception as e:  # noqa: BLE001 - keep the batch going
            row = {'file': os.path.relpath(v), 'label_stroke': resolve_stroke(v, args.stroke),
                   'error': repr(e)}
        rows.append(row)
        tag = row.get('error', f"{row.get('label_stroke')}/{row.get('auto_stroke')} "
                               f"score={row.get('score_overall', '?')}")
        print(f"  [{i}/{len(vids)}] {os.path.basename(v)} -> {tag}")
    engines[0].release()

    head = ['file', 'label_stroke', 'tier', 'auto_stroke']
    fields = head + sorted({k for r in rows for k in r} - set(head))
    with open(args.out, 'w', newline='') as fh:
        w = csv.DictWriter(fh, fieldnames=fields)
        w.writeheader()
        for r in rows:
            w.writerow(r)
    print(f"\nWrote {len(rows)} rows -> {args.out}")

    n_err = sum(1 for r in rows if r.get('error'))
    if n_err:
        print(f"({n_err} clips errored — see the 'error' column)")

    summarise(rows, tier=args.tier)
    if not args.tier and any(r.get('tier') for r in rows):
        for t in ('expert', 'beginner'):
            print(f"\n\n########## {t.upper()} SUBSET ##########")
            summarise(rows, tier=t)


if __name__ == '__main__':
    main()
