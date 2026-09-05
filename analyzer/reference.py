#!/usr/bin/env python3
"""
analyzer/reference.py — render a short looping slow-motion skeleton clip of a pro
doing the motion a given coaching metric is about, with the relevant joints lit.

    python -m analyzer.reference forehand racket_lag out.mp4

Used by the backend to illustrate each drill ("yavaş çekimde böyle yapmalısın").
Pure geometry from data/pros/*.json keypoint_sequence — no model, no user video.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import cv2
import numpy as np

from core.pose_engine import SKELETON_CONNECTIONS
from modules.pro_overlay import load_pro_sequence

# which pro sequence illustrates each stroke
STROKE_SOURCE = {
    'forehand': 'djokovic_forehand',
    'backhand': 'djokovic_backhand',
    'serve': 'djokovic_forehand',  # no serve sequence available; closest motion
}

# metric -> (phase window relative to contact, joints to highlight, tr title, tr cue)
SPECS = {
    'racket_lag': ((-46, -4), ['right_shoulder', 'right_elbow', 'right_wrist'],
                   'Raket gecikmesi', 'Raket, el one giderken arkada bekler'),
    'shoulder_angle': ((-50, -6), ['left_shoulder', 'right_shoulder', 'left_hip', 'right_hip'],
                       'Omuz donusu', 'Govde tam doner, on omuz arkaya bakar'),
    'knee_angle': ((-46, -2), ['left_hip', 'right_hip', 'left_knee', 'right_knee',
                               'left_ankle', 'right_ankle'],
                   'Diz bukumu', 'Dizler bukulur, govde alcalir'),
    'elbow_angle': ((-14, 14), ['right_shoulder', 'right_elbow', 'right_wrist'],
                    'Dirsek uzanimi', 'Vurus aninda kol topa dogru uzanir'),
    'hip_rotation': ((-16, 12), ['left_shoulder', 'right_shoulder', 'left_hip', 'right_hip'],
                     'Kalca rotasyonu', 'Kalca ve omuz birlikte one surulur'),
}

CANVAS = 540
SLOW = 4       # each source frame repeated -> ~4x slow motion
OUT_FPS = 24


def render(stroke, metric, out_path):
    src = STROKE_SOURCE.get(stroke, 'djokovic_forehand')
    pro = load_pro_sequence(src)
    spec = SPECS.get(metric)
    if pro is None or spec is None:
        return False
    (lo_off, hi_off), hot, title, cue = spec
    hot = set(hot)

    n = len(pro['seq'])
    c = pro['contact']
    lo = max(0, c + lo_off)
    hi = min(n - 1, c + hi_off)
    frames_idx = [i for i in range(lo, hi + 1) if len(pro['seq'][i]) >= 8]
    if len(frames_idx) < 4:
        return False

    # scale/translate the skeleton bbox over the whole window into the canvas
    xs, ys = [], []
    for i in frames_idx:
        for x, y in pro['seq'][i].values():
            xs.append(x)
            ys.append(y)
    minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
    span = max(maxx - minx, maxy - miny) or 1.0
    scale = (CANVAS - 130) / span
    ox = (CANVAS - (maxx - minx) * scale) / 2 - minx * scale
    oy = (CANVAS - (maxy - miny) * scale) / 2 - miny * scale + 8

    def T(pt):
        return int(pt[0] * scale + ox), int(pt[1] * scale + oy)

    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    tmp = out_path + '.tmp.mp4'
    vw = cv2.VideoWriter(tmp, cv2.VideoWriter_fourcc(*'mp4v'), OUT_FPS, (CANVAS, CANVAS))
    if not vw.isOpened():
        return False
    for i in frames_idx:
        kp = {k: T(v) for k, v in pro['seq'][i].items()}
        base = np.empty((CANVAS, CANVAS, 3), np.uint8)
        base[:] = (22, 18, 13)  # matches app panel
        cv2.rectangle(base, (0, 0), (CANVAS, 40), (32, 27, 20), -1)
        cv2.rectangle(base, (0, CANVAS - 34), (CANVAS, CANVAS), (32, 27, 20), -1)
        for a, b in SKELETON_CONNECTIONS:
            if a in kp and b in kp:
                lit = a in hot and b in hot
                cv2.line(base, kp[a], kp[b], (60, 255, 120) if lit else (74, 82, 96),
                         9 if lit else 4, cv2.LINE_AA)
        for name, p in kp.items():
            lit = name in hot
            cv2.circle(base, p, 8 if lit else 5, (60, 255, 120) if lit else (96, 106, 122), -1, cv2.LINE_AA)
        rel = i - c
        tag = "TEMAS ANI" if abs(rel) <= 1 else ("HAZIRLIK" if rel < 0 else "TAKIP")
        cv2.putText(base, f"{title.upper()}  -  {pro['name']}", (16, 27),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (225, 228, 234), 1, cv2.LINE_AA)
        cv2.putText(base, tag, (CANVAS - 150, 27),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (150, 220, 90), 1, cv2.LINE_AA)
        cv2.putText(base, cue, (16, CANVAS - 12),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.52, (180, 235, 130), 1, cv2.LINE_AA)
        for _ in range(SLOW):
            vw.write(base)
    vw.release()

    rc = os.system(f'ffmpeg -y -loglevel error -i "{tmp}" -c:v libx264 -pix_fmt yuv420p '
                   f'-movflags +faststart "{out_path}"')
    try:
        os.remove(tmp)
    except OSError:
        pass
    return rc == 0 and os.path.exists(out_path)


def main():
    if len(sys.argv) != 4:
        print("usage: python -m analyzer.reference <stroke> <metric> <out.mp4>", file=sys.stderr)
        sys.exit(2)
    ok = render(sys.argv[1], sys.argv[2], sys.argv[3])
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
