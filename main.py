#!/usr/bin/env python3
"""
VurusKoc — Tenis Vurus Analizi
Drop a video. Mirror a legend. Fix your swing.

Usage:
    python main.py              # Launch Gradio web UI
    python main.py --live       # Launch OpenCV live shadow mode
    python main.py --analyze VIDEO_PATH  # Analyze a video file from CLI
"""

import argparse
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))


def main():
    parser = argparse.ArgumentParser(description="VurusKoc — Tenis Vurus Analizi")
    parser.add_argument('--live', action='store_true',
                        help='Launch live shadow swing mode (OpenCV webcam)')
    parser.add_argument('--drill', action='store_true',
                        help='Launch focused drill mode (one metric at a time)')
    parser.add_argument('--analyze', type=str, default=None,
                        help='Analyze a video file from CLI')
    parser.add_argument('--hand', type=str, default='right', choices=['right', 'left'],
                        help='Playing hand (default: right)')
    parser.add_argument('--stroke', type=str, default='auto',
                        choices=['auto', 'forehand', 'backhand', 'serve'],
                        help='Force the stroke type instead of auto-detecting (default: auto)')
    parser.add_argument('--lang', type=str, default='tr', choices=['tr', 'en'],
                        help='Coaching report language (default: tr)')
    parser.add_argument('--port', type=int, default=7860,
                        help='Gradio server port (default: 7860)')
    parser.add_argument('--host', type=str, default='127.0.0.1',
                        help='Gradio bind address (use 0.0.0.0 to expose on the network)')
    parser.add_argument('--share', action='store_true',
                        help='Create a public Gradio share link')
    args = parser.parse_args()

    if args.drill:
        from modules.drill_mode import run_drill_mode
        run_drill_mode(playing_hand=args.hand)

    elif args.live:
        from modules.live_shadow import run_shadow_mode
        run_shadow_mode(playing_hand=args.hand)

    elif args.analyze:
        from core.pose_engine import PoseEngine
        from core.swing_classifier import SwingClassifier
        from core.coaching import CoachingEngine
        from utils import read_video
        import cv2

        T = {'tr': {'analyzing': 'Analiz ediliyor', 'stroke': 'Vuruş',
                    'contact': 'Temas karesi', 'loading': 'Yüklenme'},
             'en': {'analyzing': 'Analyzing', 'stroke': 'Stroke',
                    'contact': 'Contact frame', 'loading': 'Loading'}}[args.lang]

        print(f"{T['analyzing']}: {args.analyze}")

        cap = cv2.VideoCapture(args.analyze)
        fps = cap.get(cv2.CAP_PROP_FPS)
        cap.release()
        if not fps or fps <= 1 or fps > 240:
            fps = 30.0

        pose = PoseEngine()
        classifier = SwingClassifier(fps=fps)
        coach = CoachingEngine(lang=args.lang)

        frames = read_video(args.analyze, max_dim=1280, max_frames=900)
        if not frames:
            print("Error: Could not read video.")
            sys.exit(1)

        keypoints_seq = pose.extract_keypoints_batch(frames)
        velocities = pose.get_wrist_velocity(keypoints_seq, fps=fps)
        accelerations = pose.get_wrist_acceleration(velocities, fps=fps)
        phases = classifier.detect_phases(keypoints_seq, velocities, accelerations)

        stroke_hint = args.stroke
        contact_idx = classifier.find_contact_frame(
            keypoints_seq, velocities, phases, stroke_hint=stroke_hint, side=args.hand)
        if contact_idx is None:
            import numpy as np
            contact_idx = int(np.argmax(velocities))

        angles = pose.get_joint_angles(keypoints_seq[contact_idx], side=args.hand)
        loading_angles = classifier.best_loading_angles(
            pose, keypoints_seq, phases, side=args.hand)
        if args.stroke != 'auto':
            stroke = args.stroke
        else:
            stroke = classifier.classify_stroke(
                keypoints_seq[contact_idx], keypoints_seq, phases, side=args.hand)
        follow = classifier.detect_follow_through_completion(keypoints_seq, phases)
        scores = coach.score_swing(angles, stroke, follow, loading_angles=loading_angles)
        report = coach.generate_coaching_report(
            scores, angles, stroke, loading_angles=loading_angles)

        print(f"\n{T['stroke']}: {coach.stroke_name(stroke)}")
        print(f"{T['contact']}: {contact_idx}")
        if loading_angles:
            print(f"{T['loading']}:  " + "  ".join(f"{k}={v:.0f}" for k, v in loading_angles.items()))
        print(f"\n{report}")

        pose.release()

    else:
        from ui.app import build_app
        print("Starting VurusKoc...")
        print(f"Open http://localhost:{args.port} in your browser")
        app = build_app()
        app.launch(server_name=args.host, server_port=args.port, share=args.share)


if __name__ == "__main__":
    main()
