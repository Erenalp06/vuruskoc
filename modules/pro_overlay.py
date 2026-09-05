"""
pro_overlay.py — render a "ghost" comparison video: the user's skeleton with a
pro's skeleton (from data/pros/*.json keypoint_sequence) transformed onto them
and time-aligned at the contact frame.

Only pros whose JSON carries a `keypoint_sequence` can be ghosted.
"""

import os
import json
import cv2
import numpy as np

from core.pose_engine import SKELETON_CONNECTIONS

PRO_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'pros')

# label -> json stem, for the pros that actually have a keypoint_sequence
GHOSTABLE_PROS = {
    'Djokovic (Forehand)': 'djokovic_forehand',
    'Djokovic (Backhand)': 'djokovic_backhand',
    'Sinner (Forehand)': 'sinner_forehand',
    'Pro Forehand (reference)': 'pro_forehand_1',
}

_JOINTS = ['nose', 'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
           'left_wrist', 'right_wrist', 'left_hip', 'right_hip',
           'left_knee', 'right_knee', 'left_ankle', 'right_ankle']


def load_pro_sequence(pro_key):
    path = os.path.join(PRO_DATA_DIR, f"{pro_key}.json")
    if not os.path.exists(path):
        return None
    with open(path) as f:
        d = json.load(f)
    seq = d.get('keypoint_sequence')
    if not seq:
        return None
    return {
        'name': d.get('player', pro_key),
        'hand': d.get('hand', 'right'),
        'fps': float(d.get('fps') or 30.0),
        'contact': int(d.get('contact_frame', len(seq) // 2)),
        'seq': [{k: (v['x'], v['y']) for k, v in (fr or {}).items() if k in _JOINTS}
                for fr in seq],
    }


def _center_scale(kp, get):
    """hip-center (x,y) and torso length (shoulder-mid to hip-mid) for a frame."""
    ls, rs = get(kp, 'left_shoulder'), get(kp, 'right_shoulder')
    lh, rh = get(kp, 'left_hip'), get(kp, 'right_hip')
    if None in (ls, rs, lh, rh):
        return None, None
    sh_mid = ((ls[0] + rs[0]) / 2, (ls[1] + rs[1]) / 2)
    hip_mid = ((lh[0] + rh[0]) / 2, (lh[1] + rh[1]) / 2)
    torso = np.hypot(sh_mid[0] - hip_mid[0], sh_mid[1] - hip_mid[1])
    return hip_mid, max(torso, 1.0)


def _u_get(kp, name):
    if kp is None or name not in kp:
        return None
    v = kp[name]
    return (v[0], v[1])


def _p_get(kp, name):
    return kp.get(name)


def render_overlay(user_frames, user_kps, user_contact, pro, side='right',
                   out_path=None, window_sec=2.0, phases=None, full=False):
    """Write the ghost-overlay mp4. Returns the path, or None if it can't align.

    full=True  -> render the entire clip (use when the clip is already trimmed
                  to one swing). Otherwise span the non-idle phases +/-0.3 s,
                  falling back to +/- window_sec around contact.
    """
    if pro is None or not user_frames:
        return None

    u_hipC, u_torso = _center_scale(user_kps[user_contact], _u_get)
    p_hipC, p_torso = _center_scale(pro['seq'][pro['contact']], _p_get)
    if u_hipC is None or p_hipC is None:
        return None

    scale = u_torso / p_torso
    mirror = -1.0 if pro['hand'] != side else 1.0

    def pro_to_user(pt):
        x = (pt[0] - p_hipC[0]) * scale * mirror + u_hipC[0]
        y = (pt[1] - p_hipC[1]) * scale + u_hipC[1]
        return int(x), int(y)

    h, w = user_frames[0].shape[:2]
    n = len(user_frames)
    pad = int(0.3 * 30)
    active = [i for i, p in enumerate(phases or []) if p != 'idle']
    if full:
        lo, hi = 0, n - 1
    elif active:
        lo = max(0, active[0] - pad)
        hi = min(n - 1, active[-1] + pad)
    else:
        win = int(window_sec * 30)
        lo = max(0, user_contact - win)
        hi = min(n - 1, user_contact + win)

    # Time-warp the pro onto the user's window: the user's pre-contact span maps
    # onto the pro's pre-contact span and post onto post, so both play their
    # whole swing over the same duration and meet at contact — independent of
    # either clip's fps. (Fixes the old fixed-fps mapping where a 60fps user clip
    # left the pro invisible for the first half.)
    pfps = pro['fps'] or 30.0
    pN = len(pro['seq'])
    pc = pro['contact']
    p_lo = max(0, pc - int(1.3 * pfps))
    p_hi = min(pN - 1, pc + int(1.1 * pfps))
    uc = max(lo + 1, min(hi - 1, user_contact))

    def pro_index(ui):
        if ui <= uc:
            frac = (ui - lo) / max(1, uc - lo)
            pi = p_lo + frac * (pc - p_lo)
        else:
            frac = (ui - uc) / max(1, hi - uc)
            pi = pc + frac * (p_hi - pc)
        pi = int(round(pi))
        # nudge off empty pro frames
        for d in (0, 1, -1, 2, -2, 3, -3):
            j = pi + d
            if 0 <= j < pN and len(pro['seq'][j]) >= 8:
                return j
        return max(0, min(pN - 1, pi))

    def draw(frame, pts, color, thick):
        for a, b in SKELETON_CONNECTIONS:
            if a in pts and b in pts:
                cv2.line(frame, pts[a], pts[b], color, thick)
        for p in pts.values():
            cv2.circle(frame, p, thick + 2, color, -1)

    fps_out = 20 if full else 24
    out_path = out_path or os.path.join('/tmp', f'ghost_{os.getpid()}.mp4')
    vw = cv2.VideoWriter(out_path, cv2.VideoWriter_fourcc(*'mp4v'), fps_out, (w, h))

    for ui in range(lo, hi + 1):
        frame = user_frames[ui].copy()
        o = ui - uc
        pi = pro_index(ui)

        if pro['seq'][pi]:
            ghost = {name: pro_to_user(pt) for name, pt in pro['seq'][pi].items()}
            overlay = frame.copy()
            draw(overlay, ghost, (255, 200, 0), 6)
            cv2.addWeighted(overlay, 0.5, frame, 0.5, 0, frame)

        uk = user_kps[ui]
        if uk is not None:
            upts = {n: (int(v[0]), int(v[1])) for n, v in uk.items()
                    if len(v) < 4 or v[3] > 0.5}
            draw(frame, upts, (0, 255, 120), 4)

        cv2.rectangle(frame, (0, 0), (w, 34), (16, 13, 10), -1)
        cv2.putText(frame, "SEN", (14, 23), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (120, 255, 140), 2)
        tw = cv2.getTextSize(pro['name'].upper(), cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)[0][0]
        cv2.putText(frame, pro['name'].upper(), (w - tw - 14, 23),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 210, 255), 2)
        if abs(o) <= 1:
            cv2.putText(frame, "TEMAS", (w // 2 - 40, 23),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        vw.write(frame)

    vw.release()
    return out_path
