"""
SwingClassifier — Detects swing phases and classifies stroke type.
Uses wrist velocity/acceleration curves from PoseEngine to segment:
  Preparation → Loading → Contact → Follow-through
"""

import numpy as np


# Swing phases
PHASES = ['idle', 'preparation', 'loading', 'contact', 'follow_through']

# Acceleration threshold for phase transitions (px/s²)
ACCEL_THRESHOLD = 800

# Stroke type detection thresholds
SERVE_WRIST_HEIGHT_RATIO = 0.6  # wrist above 60% of body height = likely serve


class SwingClassifier:
    def __init__(self, fps=30):
        self.fps = fps

    def detect_phases(self, keypoints_sequence, wrist_velocities, wrist_accelerations):
        """Segment a swing into phases based on wrist dynamics.
        Returns list of phase labels (same length as input).
        """
        n = len(keypoints_sequence)
        phases = ['idle'] * n

        if n < 5:
            return phases

        # Find the contact frame: peak wrist velocity
        peak_idx = int(np.argmax(wrist_velocities))
        if wrist_velocities[peak_idx] < 50:  # no significant motion
            return phases

        # Walk backward from peak to find loading start (acceleration crosses threshold)
        loading_start = peak_idx
        for i in range(peak_idx - 1, -1, -1):
            if abs(wrist_accelerations[i]) < ACCEL_THRESHOLD * 0.3:
                loading_start = i
                break

        # Preparation starts even earlier (low velocity phase before loading)
        prep_start = loading_start
        for i in range(loading_start - 1, -1, -1):
            if wrist_velocities[i] < wrist_velocities[loading_start] * 0.1:
                prep_start = i
                break

        # Follow-through: after peak velocity until velocity drops below 20% of peak
        follow_end = peak_idx
        peak_vel = wrist_velocities[peak_idx]
        for i in range(peak_idx + 1, n):
            if wrist_velocities[i] < peak_vel * 0.2:
                follow_end = i
                break
        else:
            follow_end = n - 1

        # Assign phases
        for i in range(n):
            if i < prep_start:
                phases[i] = 'idle'
            elif i < loading_start:
                phases[i] = 'preparation'
            elif i < peak_idx:
                phases[i] = 'loading'
            elif i == peak_idx:
                phases[i] = 'contact'
            elif i <= follow_end:
                phases[i] = 'follow_through'
            else:
                phases[i] = 'idle'

        return phases

    @staticmethod
    def _torso_len(kp):
        """Vertical shoulder->hip distance in px (rotation-tolerant scale reference)."""
        sh_y = (kp['left_shoulder'][1] + kp['right_shoulder'][1]) / 2
        hip_y = (kp['left_hip'][1] + kp['right_hip'][1]) / 2
        return abs(hip_y - sh_y) + 1e-6

    @classmethod
    def _wrist_above_ratio(cls, kp, side='right'):
        """How far the wrist sits above the shoulder line, in torso lengths.
        >0 = above the shoulders, <0 = below. ~0.15+ sustained means overhead.
        """
        return (kp[f'{side}_shoulder'][1] - kp[f'{side}_wrist'][1]) / cls._torso_len(kp)

    def classify_stroke(self, keypoints_at_contact, keypoints_sequence=None,
                        phases=None, side='right'):
        """Classify stroke type: 'forehand', 'backhand', 'serve', 'volley', 'unknown'.

        When keypoints_sequence + phases are supplied, the serve test requires the
        hand to stay overhead across most of the swing (not just one stray frame),
        which avoids calling a loopy groundstroke finish a "serve".
        """
        if keypoints_at_contact is None:
            return 'unknown'

        kp = keypoints_at_contact
        s = side

        # --- serve test ---
        if keypoints_sequence is not None and phases is not None:
            swing = [keypoints_sequence[i] for i, p in enumerate(phases)
                     if p in ('loading', 'contact', 'follow_through')
                     and keypoints_sequence[i] is not None]
            if len(swing) >= 4:
                elevated = sum(1 for k in swing if self._wrist_above_ratio(k, s) > 0.15)
                if elevated / len(swing) > 0.6:
                    return 'serve'
            elif self._wrist_above_ratio(kp, s) > 0.35:
                return 'serve'
        else:
            # legacy single-frame fallback
            body_height = kp[f'{s}_hip'][1] - kp['nose'][1]
            if (kp[f'{s}_shoulder'][1] - kp[f'{s}_wrist'][1]) > body_height * 0.3:
                return 'serve'

        # Forehand vs backhand: check which side of body the wrist is on
        r_shoulder_x = kp['right_shoulder'][0]
        l_shoulder_x = kp['left_shoulder'][0]
        r_wrist_x = kp['right_wrist'][0]

        # For right-handed: if wrist is on the right side of body center = forehand
        body_center_x = (r_shoulder_x + l_shoulder_x) / 2

        # Determine facing direction from hip-shoulder relationship
        r_hip_x = kp['right_hip'][0]
        l_hip_x = kp['left_hip'][0]
        facing_right = r_shoulder_x > l_shoulder_x

        if facing_right:
            if r_wrist_x > body_center_x:
                return 'forehand'
            else:
                return 'backhand'
        else:
            if r_wrist_x < body_center_x:
                return 'forehand'
            else:
                return 'backhand'

    def get_contact_frame_index(self, phases):
        """Return the frame index of the contact phase."""
        for i, p in enumerate(phases):
            if p == 'contact':
                return i
        return None

    @staticmethod
    def best_loading_angles(pose_engine, keypoints_sequence, phases, side='right'):
        """Pull the metric-defining moments from the loading phase.

        shoulder_angle / knee_angle / racket_lag are meant to be read at their
        loading extreme (peak coil, deepest knee bend, max racket lag), not at
        the contact frame. Falls back to the last 30% of the preparation phase
        when no loading frames were segmented. Returns None if nothing usable.
        """
        load_idx = [i for i, p in enumerate(phases) if p == 'loading']
        if not load_idx:
            prep = [i for i, p in enumerate(phases) if p == 'preparation']
            if prep:
                load_idx = prep[int(len(prep) * 0.7):]
        if not load_idx:
            return None

        best = {'shoulder_angle': 0.0, 'knee_angle': 180.0, 'racket_lag': 0.0}
        found = False
        for fi in load_idx:
            if keypoints_sequence[fi] is None:
                continue
            a = pose_engine.get_joint_angles(keypoints_sequence[fi], side=side)
            if not a:
                continue
            found = True
            best['shoulder_angle'] = max(best['shoulder_angle'], a['shoulder_angle'])
            best['knee_angle'] = min(best['knee_angle'], a['knee_angle'])  # lower = more bent
            best['racket_lag'] = max(best['racket_lag'], a['racket_lag'])
        return best if found else None

    def find_contact_frame(self, keypoints_sequence, velocities, phases,
                           stroke_hint='auto', side='right'):
        """Pick the contact frame without relying on a ball.

        Peak wrist speed alone is unreliable for practice clips (THETIS etc.):
        an amateur's fastest wrist moment is often the upward whip of the finish,
        not contact. This scores frames in the swing window instead:

          - groundstroke: hand reaching out to the side, near shoulder/hip
            height, moving fast; frames with the hand well overhead are pushed
            down so the finish isn't mistaken for contact.
          - serve: highest hand that is still moving fast.

        Falls back to argmax(velocities) when there's nothing usable.
        """
        n = len(keypoints_sequence)
        if n == 0:
            return 0
        peak_idx = int(np.argmax(velocities)) if len(velocities) else 0

        window = [i for i, p in enumerate(phases)
                  if p in ('loading', 'contact', 'follow_through')]
        if not window:
            lo, hi = max(0, peak_idx - 8), min(n, peak_idx + 9)
            window = list(range(lo, hi))
        valid = [i for i in window if keypoints_sequence[i] is not None]
        if not valid:
            return peak_idx

        vmax = max(velocities) or 1.0

        if stroke_hint == 'serve':
            return max(valid, key=lambda i: (
                0.7 * self._wrist_above_ratio(keypoints_sequence[i], side)
                + 0.3 * velocities[i] / vmax
            ))

        def score(i):
            kp = keypoints_sequence[i]
            center_x = (kp['left_shoulder'][0] + kp['right_shoulder'][0]) / 2
            sh_w = abs(kp['right_shoulder'][0] - kp['left_shoulder'][0]) + 1e-6
            ext = min(abs(kp[f'{side}_wrist'][0] - center_x) / sh_w, 2.0) / 2.0
            above = self._wrist_above_ratio(kp, side)
            s = 0.4 * (velocities[i] / vmax) + 0.6 * ext
            if above > 0.15:  # hand overhead -> not a groundstroke contact
                s -= 2.0 * (above - 0.15)
            return s

        return max(valid, key=score)

    def detect_follow_through_completion(self, keypoints_sequence, phases):
        """Check if the arm crosses the body during follow-through.
        Returns True if follow-through is complete.
        """
        follow_frames = [i for i, p in enumerate(phases) if p == 'follow_through']
        if not follow_frames or keypoints_sequence[follow_frames[-1]] is None:
            return False

        last_kp = keypoints_sequence[follow_frames[-1]]
        r_wrist_x = last_kp['right_wrist'][0]
        l_shoulder_x = last_kp['left_shoulder'][0]
        r_shoulder_x = last_kp['right_shoulder'][0]
        body_center_x = (l_shoulder_x + r_shoulder_x) / 2

        # Follow-through is complete if wrist crosses past body center to opposite side
        facing_right = r_shoulder_x > l_shoulder_x
        if facing_right:
            return r_wrist_x < body_center_x
        else:
            return r_wrist_x > body_center_x
