#!/usr/bin/env python3
"""
analyzer/run.py — headless swing analysis for the Go backend.

Input:  a short, already-trimmed clip.
Output: JSON on stdout (scores, angles, contact frame, coaching report) and,
        unless --no-video, an annotated mp4 written to --out-video.

    python -m analyzer.run CLIP.mp4 --hand right --stroke auto --lang tr \
        --out-video annotated.mp4
"""

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import cv2
import numpy as np

from core.pose_engine import PoseEngine
from core.swing_classifier import SwingClassifier
from core.coaching import CoachingEngine
from utils import read_video


_KP_JOINTS = ['nose', 'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
              'left_wrist', 'right_wrist', 'left_hip', 'right_hip',
              'left_knee', 'right_knee', 'left_ankle', 'right_ankle']


def _write_kpts(kps, fps, contact_idx, hand, out_path):
    """Sidecar so the pro-overlay step can reuse pose instead of re-inferring."""
    frames = []
    for k in kps:
        if k is None:
            frames.append(None)
        else:
            frames.append({j: [round(k[j][0], 1), round(k[j][1], 1), round(k[j][3], 2)]
                           for j in _KP_JOINTS if j in k})
    with open(out_path, 'w') as f:
        json.dump({'fps': fps, 'contact_frame': contact_idx, 'hand': hand,
                   'frames': frames}, f)


def analyze(path, hand='right', stroke='auto', lang='tr',
            out_video=None, out_kpts=None, max_dim=1280, max_frames=900):
    cap = cv2.VideoCapture(path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    cap.release()
    if not fps or fps <= 1 or fps > 240:
        fps = 30.0

    pose = PoseEngine()
    classifier = SwingClassifier(fps=fps)
    coach = CoachingEngine(lang=lang)

    frames = read_video(path, max_dim=max_dim, max_frames=max_frames)
    if not frames:
        pose.release()
        raise ValueError("could not read video")

    kps = pose.extract_keypoints_batch(frames)
    detect_rate = sum(k is not None for k in kps) / len(kps)
    vel = pose.get_wrist_velocity(kps, fps=fps)
    acc = pose.get_wrist_acceleration(vel, fps=fps)
    phases = classifier.detect_phases(kps, vel, acc)

    hint = stroke if stroke != 'auto' else 'auto'
    contact_idx = classifier.find_contact_frame(kps, vel, phases, stroke_hint=hint, side=hand)
    if contact_idx is None:
        contact_idx = int(np.argmax(vel))

    contact_angles = pose.get_joint_angles(kps[contact_idx], side=hand) if kps[contact_idx] else None
    loading_angles = classifier.best_loading_angles(pose, kps, phases, side=hand)
    if stroke != 'auto':
        stroke_type = stroke
    else:
        stroke_type = classifier.classify_stroke(kps[contact_idx], kps, phases, side=hand) \
            if kps[contact_idx] else 'unknown'
    follow = classifier.detect_follow_through_completion(kps, phases)

    scores = coach.score_swing(contact_angles, stroke_type, follow, loading_angles=loading_angles)
    report = coach.generate_coaching_report(
        scores, contact_angles, stroke_type, loading_angles=loading_angles)
    corrections = coach.top_corrections(
        scores, contact_angles, stroke_type, loading_angles=loading_angles, top=2)
    warnings = coach.get_injury_warnings(
        {**(contact_angles or {}), **(loading_angles or {})}, stroke_type)

    if out_video:
        _write_annotated(pose, frames, kps, phases, contact_idx, vel, out_video)
    if out_kpts:
        _write_kpts(kps, fps, contact_idx, hand, out_kpts)

    pose.release()

    merged = dict(contact_angles or {})
    if loading_angles:
        merged.update(loading_angles)

    return {
        'ok': True,
        'fps': round(fps, 2),
        'n_frames': len(frames),
        'pose_detect_rate': round(detect_rate, 3),
        'stroke': stroke_type,
        'stroke_forced': stroke != 'auto',
        'contact_frame': contact_idx,
        'contact_time_sec': round(contact_idx / fps, 3),
        'follow_through_complete': bool(follow),
        'angles': {k: round(float(v), 1) for k, v in merged.items()},
        'contact_angles': {k: round(float(v), 1) for k, v in (contact_angles or {}).items()},
        'loading_angles': {k: round(float(v), 1) for k, v in (loading_angles or {}).items()},
        'scores': {k: round(float(v), 1) for k, v in (scores or {}).items()},
        'swing_score': round(float(scores['overall']), 1) if scores else None,
        'corrections': corrections,
        'report': report,
        'injury_warnings': warnings,
        'phase_counts': {p: phases.count(p) for p in set(phases)},
        'lang': lang,
        'hand': hand,
    }


def _write_annotated(pose, frames, kps, phases, contact_idx, vel, out_path):
    h, w = frames[0].shape[:2]
    tmp = out_path + '.tmp.mp4'
    vw = cv2.VideoWriter(tmp, cv2.VideoWriter_fourcc(*'mp4v'), 24, (w, h))
    for i, (f, k) in enumerate(zip(frames, kps)):
        fr = pose.draw_skeleton(f.copy(), k)
        ph = phases[i] if i < len(phases) else 'idle'
        cv2.putText(fr, f"f{i}  {ph}  v={vel[i]:.0f}", (10, 26),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
        if i == contact_idx:
            cv2.putText(fr, "CONTACT", (10, 54), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 0, 255), 2)
        vw.write(fr)
    vw.release()
    # transcode to h264 so browsers can play it
    rc = os.system(f'ffmpeg -y -loglevel error -i "{tmp}" -c:v libx264 -pix_fmt yuv420p '
                   f'-movflags +faststart "{out_path}"')
    try:
        os.remove(tmp)
    except OSError:
        pass
    if rc != 0 or not os.path.exists(out_path):
        os.rename(tmp, out_path) if os.path.exists(tmp) else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('clip')
    ap.add_argument('--hand', default='right', choices=['right', 'left'])
    ap.add_argument('--stroke', default='auto', choices=['auto', 'forehand', 'backhand', 'serve'])
    ap.add_argument('--lang', default='tr', choices=['tr', 'en'])
    ap.add_argument('--out-video', default=None)
    ap.add_argument('--out-kpts', default=None)
    ap.add_argument('--no-video', action='store_true')
    args = ap.parse_args()

    try:
        result = analyze(args.clip, hand=args.hand, stroke=args.stroke, lang=args.lang,
                         out_video=None if args.no_video else args.out_video,
                         out_kpts=args.out_kpts)
    except Exception as e:  # noqa: BLE001 - report as JSON for the caller
        print(json.dumps({'ok': False, 'error': f'{type(e).__name__}: {e}'}))
        sys.exit(1)

    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
