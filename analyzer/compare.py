#!/usr/bin/env python3
"""
analyzer/compare.py — render a full-swing ghost overlay of a user clip against a
pro's skeleton, hip-aligned + torso-scaled + time-synced at contact.

    python -m analyzer.compare CLIP.mp4 djokovic_forehand OUT.mp4 [--kpts CLIP.kpts.json]

Reuses the pose sidecar written by analyzer/run.py when present; otherwise it
re-extracts pose from the clip.
"""

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import cv2
import numpy as np

from modules.pro_overlay import GHOSTABLE_PROS, load_pro_sequence, render_overlay
from utils import read_video


def _kps_from_sidecar(path):
    d = json.load(open(path))
    kps = []
    for fr in d['frames']:
        kps.append(None if fr is None else {k: (v[0], v[1], v[2]) for k, v in fr.items()})
    return kps, d.get('fps', 30.0), int(d.get('contact_frame', len(kps) // 2)), d.get('hand', 'right')


def _kps_from_clip(path):
    from core.pose_engine import PoseEngine
    from core.swing_classifier import SwingClassifier

    cap = cv2.VideoCapture(path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    cap.release()
    if not fps or fps <= 1 or fps > 240:
        fps = 30.0
    frames = read_video(path, max_dim=1280, max_frames=900)
    pose = PoseEngine()
    kps = pose.extract_keypoints_batch(frames)
    vel = pose.get_wrist_velocity(kps, fps=fps)
    acc = pose.get_wrist_acceleration(vel, fps=fps)
    sc = SwingClassifier(fps=fps)
    phases = sc.detect_phases(kps, vel, acc)
    contact = sc.find_contact_frame(kps, vel, phases)
    if contact is None:
        contact = int(np.argmax(vel))
    pose.release()
    return kps, fps, contact, 'right'


def render(clip, pro_key, out_path, kpts_path=None):
    if pro_key not in {v for v in GHOSTABLE_PROS.values()} | set(GHOSTABLE_PROS):
        pro_key = GHOSTABLE_PROS.get(pro_key, pro_key)
    pro = load_pro_sequence(pro_key)
    if pro is None:
        return False

    if kpts_path and os.path.exists(kpts_path):
        kps, _fps, contact, hand = _kps_from_sidecar(kpts_path)
    else:
        kps, _fps, contact, hand = _kps_from_clip(clip)

    frames = read_video(clip, max_dim=1280, max_frames=900)
    if not frames or len(kps) != len(frames) or kps[contact] is None:
        # sidecar out of sync with clip, or no pose at contact
        if kpts_path:
            kps, _fps, contact, hand = _kps_from_clip(clip)
        if not frames or kps[contact] is None:
            return False

    tmp = out_path + '.tmp.mp4'
    res = render_overlay(frames, kps, contact, pro, side=hand, out_path=tmp, full=True)
    if not res:
        return False
    rc = os.system(f'ffmpeg -y -loglevel error -i "{tmp}" -c:v libx264 -pix_fmt yuv420p '
                   f'-movflags +faststart "{out_path}"')
    try:
        os.remove(tmp)
    except OSError:
        pass
    if rc != 0 and os.path.exists(tmp):
        os.rename(tmp, out_path)
    return os.path.exists(out_path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('clip')
    ap.add_argument('pro')
    ap.add_argument('out')
    ap.add_argument('--kpts', default=None)
    args = ap.parse_args()
    sys.exit(0 if render(args.clip, args.pro, args.out, args.kpts) else 1)


if __name__ == '__main__':
    main()
