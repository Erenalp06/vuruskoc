"""
CoachingEngine — Scores swing metrics, compares to pro references,
and generates specific, actionable coaching feedback.
"""

import json
import os
import numpy as np

# Ideal ranges per metric = the expert p25–p75 band measured by THIS pipeline
# over THETIS (github.com/THETIS-dataset), forehand_flat / backhand / flat_service,
# 495 clips, expert = players p32–p55 (n=216). Bands are wide because a single
# no-ball practice clip is a noisy sample; the WEIGHTS below were then fit to
# rank experts over beginners. Regenerate with:
#   python tools/calibrate.py --videos data/thetis --out calibration.csv
#   python tools/fit_scoring.py --csv calibration.csv
IDEAL_RANGES = {
    'forehand': {
        'elbow_angle': (85, 142),
        'hip_rotation': (33, 120),
        'shoulder_angle': (35, 80),
        'knee_angle': (132, 172),
        'racket_lag': (83, 164),
        'contact_height_ratio': (1.1, 1.4),
    },
    'backhand': {
        'elbow_angle': (96, 159),
        'hip_rotation': (99, 114),
        'shoulder_angle': (33, 71),
        'knee_angle': (124, 153),
        'racket_lag': (91, 151),
        'contact_height_ratio': (1.0, 1.5),
    },
    'serve': {
        'elbow_angle': (159, 174),
        'hip_rotation': (96, 125),
        'shoulder_angle': (79, 162),
        'knee_angle': (135, 165),
        'racket_lag': (107, 171),
        'contact_height_ratio': (1.6, 4.5),
    },
}

# Fit by coordinate-ascent on pooled expert-vs-beginner AUC over the THETIS set
# above (tools/fit_scoring.py). racket lag + hip rotation carried the most
# signal; knee angle and shoulder angle at a single frame carried the least.
# Pooled AUC 0.69 -> 0.71 (backhand 0.71 -> 0.80). This scorer ranks good over
# bad; it is not a precise per-swing grade.
WEIGHTS = {
    'elbow_angle': 0.18,
    'hip_rotation': 0.23,
    'shoulder_angle': 0.07,
    'knee_angle': 0.05,
    'racket_lag': 0.31,
    'follow_through': 0.16,
}

# Labels for display — honest about what's estimated
METRIC_LABELS = {
    'elbow_angle': 'Elbow Extension',
    'hip_rotation': 'Hip Rotation (est.)',
    'shoulder_angle': 'Shoulder Turn',
    'knee_angle': 'Knee Bend',
    'racket_lag': 'Racket Lag',
    'follow_through': 'Follow-Through',
}

# ── i18n ─────────────────────────────────────────────────────────────
# The coaching report is the product's output — default it to Turkish.
DEFAULT_LANG = 'tr'

STROKE_NAMES = {
    'en': {'forehand': 'Forehand', 'backhand': 'Backhand', 'serve': 'Serve',
           'volley': 'Volley', 'unknown': 'Unknown'},
    'tr': {'forehand': 'Forehand', 'backhand': 'Backhand', 'serve': 'Servis',
           'volley': 'Vole', 'unknown': 'Bilinmiyor'},
}

I18N = {
    'en': {
        'no_pose': "Could not analyze swing — no pose detected at contact point.",
        'score_line': "SwingScore: {overall}/100",
        'verdict': {
            85: "Excellent swing mechanics! Minor refinements below.",
            70: "Solid foundation — focus on these corrections to level up.",
            50: "Good effort — several key areas need work.",
            0: "Let's rebuild from the ground up. Focus on the top 2 corrections.",
        },
        'correction_line': "{i}. {name}: {value:.1f}° (ideal: {lo}-{hi}°, score: {score:.0f}/100)",
        'pro_line': "   {pro}'s {name} is {pro_val:.1f}°. Yours is {diff:+.1f}° off.",
        'drill_prefix': "   Drill: ",
        'follow_incomplete': "Follow-through: Incomplete — your arm should cross your body after contact.",
        'follow_drill': "   Drill: Shadow 20 swings finishing with your racket over your opposite shoulder.",
        'injury_header': "INJURY WARNINGS:",
        'metric_names': {
            'elbow_angle': 'Elbow Angle', 'hip_rotation': 'Hip Rotation',
            'shoulder_angle': 'Shoulder Angle', 'knee_angle': 'Knee Angle',
            'racket_lag': 'Racket Lag',
        },
        'drills': {
            'elbow_angle': {
                'too_low': "Shadow 20 forehands focusing on extending your elbow through contact. Think 'reach and push'.",
                'too_high': "Your arm is too straight — add slight bend at contact. Relaxed, whip-like motion.",
            },
            'hip_rotation': {
                'too_low': "Stand sideways, coil your hips back, then drive forward. 20 reps, no racket.",
                'too_high': "You're over-rotating. Plant your front foot and let the hips stop at 90° to the net.",
            },
            'shoulder_angle': {
                'too_low': "Full unit turn — get your non-dominant shoulder pointing at the ball. 15 slow shadow swings.",
                'too_high': "You're opening up too early. Keep the shoulder coiled until the hip drives forward.",
            },
            'knee_angle': {
                'too_low': "You're sitting too deep. Stand taller and stay athletic, not in a squat.",
                'too_high': "Legs too straight — bend the knees. Drop into a mini-squat before every swing.",
            },
            'racket_lag': {
                'too_low': "Let the racket lag behind your elbow longer. Practice the 'waiter's tray' position.",
                'too_high': "Your racket is too far behind — you're losing control. Compact the backswing.",
            },
            'default': "Shadow 20 swings focusing on this movement pattern.",
        },
        'plain': {
            'elbow_angle': {
                'low': ("Reach through the ball", "Your arm stays too bent at contact — you lose power and reach."),
                'high': ("Don't lock your arm", "Your arm is fully straight — you lose the whip and control."),
            },
            'hip_rotation': {
                'low': ("Turn your hips more", "Your body barely rotates — the power isn't coming from the ground up."),
                'high': ("Don't over-rotate", "You spin too far — balance and timing suffer."),
            },
            'shoulder_angle': {
                'low': ("Coil your shoulders fully", "You don't turn back enough in the load — the swing has no windup."),
                'high': ("Stay coiled a beat longer", "Your shoulders open too early and leak power."),
            },
            'knee_angle': {
                'low': ("Stand a little taller", "You're squatting too deep — you can't push off cleanly."),
                'high': ("Bend your knees", "Your legs stay straight — no drive from the ground."),
            },
            'racket_lag': {
                'low': ("Let the racket lag more", "The racket head is ahead of your hand — you're pushing, not whipping."),
                'high': ("Shorten the backswing", "The racket drops way behind you — hard to time and control."),
            },
        },
        'injury': {
            'shoulder': "Shoulder impingement risk: your serving shoulder angle is too closed. "
                        "Open up your trophy position to reduce rotator cuff strain.",
            'lumbar': "Lumbar hyperextension risk: excessive hip tilt during serve. "
                      "Strengthen your core to keep a neutral spine through the motion.",
            'knee': "Knee stress warning: deep knee bend beyond 90° at contact increases "
                    "patellar tendon load. Keep a more athletic stance.",
        },
    },
    'tr': {
        'no_pose': "Vuruş analiz edilemedi — temas anında poz tespit edilemedi.",
        'score_line': "SwingScore: {overall}/100",
        'verdict': {
            85: "Mükemmel vuruş mekaniği! Aşağıda ufak rötuşlar var.",
            70: "Sağlam temel — seviye atlamak için şu düzeltmelere odaklan.",
            50: "İyi çaba — birkaç önemli nokta çalışma istiyor.",
            0: "Baştan inşa edelim. İlk 2 düzeltmeye odaklan.",
        },
        'correction_line': "{i}. {name}: {value:.1f}° (ideal: {lo}-{hi}°, puan: {score:.0f}/100)",
        'pro_line': "   {pro} için {name}: {pro_val:.1f}°. Seninki {diff:+.1f}° sapmış.",
        'drill_prefix': "   Alıştırma: ",
        'follow_incomplete': "Takip (follow-through): Eksik — vuruştan sonra kolun gövdeni çaprazlamalı.",
        'follow_drill': "   Alıştırma: 20 gölge vuruş, raketi karşı omzunun üzerinde bitir.",
        'injury_header': "SAKATLIK UYARILARI:",
        'metric_names': {
            'elbow_angle': 'Dirsek Açısı', 'hip_rotation': 'Kalça Rotasyonu',
            'shoulder_angle': 'Omuz Dönüşü', 'knee_angle': 'Diz Bükümü',
            'racket_lag': 'Raket Gecikmesi',
        },
        'drills': {
            'elbow_angle': {
                'too_low': "20 gölge forehand, vuruş boyunca dirseğini uzatmaya odaklan. 'Uzan ve it' diye düşün.",
                'too_high': "Kolun fazla düz — vuruş anında hafif bükük tut. Gevşek, kamçı gibi bir hareket çalış.",
            },
            'hip_rotation': {
                'too_low': "Yana dön, kalçanı geriye sar, sonra öne sür. Raketsiz 20 tekrar — sadece kalça rotasyonu.",
                'too_high': "Fazla dönüyorsun. Ön ayağını sabitle, kalçalar file'ye 90°'de dursun.",
            },
            'shoulder_angle': {
                'too_low': "Tam gövde dönüşü — dominant olmayan omzun topa baksın. 15 yavaş çekim gölge vuruş.",
                'too_high': "Çok erken açılıyorsun. Kalça öne sürene kadar omzu sarılı tut.",
            },
            'knee_angle': {
                'too_low': "Fazla çömelmişsin. Biraz daha dik dur — atletik kal, squat'a inme.",
                'too_high': "Dizlerin çok düz. Her vuruştan önce mini squat'a in. 20 split-step→vuruş.",
            },
            'racket_lag': {
                'too_low': "Raketi dirseğinin arkasında daha uzun beklet. Backswing sonunda 'garson tepsisi' pozisyonunu çalış.",
                'too_high': "Raket çok geride — kontrolü kaybediyorsun. Backswing'i toparla.",
            },
            'default': "Bu hareket kalıbına odaklanarak 20 gölge vuruş yap.",
        },
        'plain': {
            'elbow_angle': {
                'low': ("Kolunu vuruşta uzat", "Kolun temas anında fazla bükük — güç ve uzanım kaybediyorsun."),
                'high': ("Kolunu kilitleme", "Kol tamamen düz — kamçı etkisi ve kontrol azalıyor."),
            },
            'hip_rotation': {
                'low': ("Kalçanı daha çok çevir", "Gövden neredeyse hiç dönmüyor — güç yerden gelmiyor."),
                'high': ("Fazla dönme", "Çok fazla dönüyorsun — denge ve zamanlama bozuluyor."),
            },
            'shoulder_angle': {
                'low': ("Gövdeni tam sar", "Hazırlıkta yeterince geriye dönmüyorsun — yükleme yok."),
                'high': ("Omzu bir an daha sarılı tut", "Omuzların çok erken açılıyor, güç kaçıyor."),
            },
            'knee_angle': {
                'low': ("Biraz daha dik dur", "Fazla çömelmişsin — yerden temiz itiş yapamıyorsun."),
                'high': ("Dizlerini bük", "Bacakların düz kalıyor — yerden itiş gücü yok."),
            },
            'racket_lag': {
                'low': ("Raketi arkada daha çok beklet", "Raket kafası elinin önünde — itiyorsun, kamçılamıyorsun."),
                'high': ("Backswing'i kısalt", "Raket çok geriye düşüyor — zamanlaması ve kontrolü zor."),
            },
        },
        'injury': {
            'shoulder': "Omuz sıkışması riski: servis omuz açın çok kapalı. "
                        "Rotator cuff yükünü azaltmak için trophy pozisyonunu aç.",
            'lumbar': "Bel aşırı ekstansiyon riski: serviste aşırı kalça eğimi. "
                      "Hareket boyunca nötr omurga için karın kaslarını güçlendir.",
            'knee': "Diz yükü uyarısı: temas anında 90°'yi aşan derin diz bükümü "
                    "patellar tendon yükünü artırır. Daha atletik bir duruş koru.",
        },
    },
}

# Pro reference data directory
PRO_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'pros')


class CoachingEngine:
    def __init__(self, lang=DEFAULT_LANG):
        self.lang = lang if lang in I18N else DEFAULT_LANG
        self.L = I18N[self.lang]
        self.pro_data = {}
        self._load_pro_data()

    def set_lang(self, lang):
        self.lang = lang if lang in I18N else DEFAULT_LANG
        self.L = I18N[self.lang]

    def stroke_name(self, stroke_type):
        return STROKE_NAMES.get(self.lang, STROKE_NAMES['en']).get(stroke_type, stroke_type)

    def _load_pro_data(self):
        """Load pre-extracted pro player keypoint data from JSON files."""
        if not os.path.exists(PRO_DATA_DIR):
            return
        for fname in os.listdir(PRO_DATA_DIR):
            if fname.endswith('.json'):
                key = fname.replace('.json', '')
                with open(os.path.join(PRO_DATA_DIR, fname)) as f:
                    self.pro_data[key] = json.load(f)

    def score_metric(self, value, ideal_range):
        """Score a single metric 0-100 based on distance from ideal range.
        Penalty: -3.3 points per degree outside the range.
        30° off = 0 score. Inside the range = 100.
        """
        low, high = ideal_range
        if low <= value <= high:
            # Bonus: score higher near the middle of the range
            mid = (low + high) / 2
            range_half = (high - low) / 2
            dist_from_mid = abs(value - mid)
            # 100 at center, 85 at edges of range
            return 85.0 + 15.0 * (1.0 - dist_from_mid / (range_half + 1e-8))

        if value < low:
            dist = low - value
        else:
            dist = value - high

        # -3.3 points per degree outside the range (0 at 30° off)
        penalty = min(dist * 3.3, 100)
        return max(0.0, 100.0 - penalty)

    def score_swing(self, contact_angles, stroke_type='forehand',
                     follow_through_complete=True, loading_angles=None):
        """Score a swing using angles from the CORRECT phase for each metric.

        - elbow_angle, hip_rotation: measured at CONTACT (arm extension, hip drive)
        - shoulder_angle, knee_angle, racket_lag: measured at LOADING (coil, bend, lag)
        - follow_through: measured post-contact

        If loading_angles not provided, all metrics use contact_angles.
        """
        if contact_angles is None:
            return None

        ideals = IDEAL_RANGES.get(stroke_type, IDEAL_RANGES['forehand'])
        scores = {}

        # Metrics scored at CONTACT
        for metric in ['elbow_angle', 'hip_rotation']:
            if metric in contact_angles and metric in ideals:
                scores[metric] = self.score_metric(contact_angles[metric], ideals[metric])
            else:
                scores[metric] = 50.0

        # Metrics scored at LOADING (use loading_angles if available)
        load_src = loading_angles if loading_angles is not None else contact_angles
        for metric in ['shoulder_angle', 'knee_angle', 'racket_lag']:
            if metric in load_src and metric in ideals:
                scores[metric] = self.score_metric(load_src[metric], ideals[metric])
            else:
                scores[metric] = 50.0

        scores['follow_through'] = 100.0 if follow_through_complete else 30.0

        overall = sum(scores[m] * WEIGHTS[m] for m in WEIGHTS if m in scores)
        scores['overall'] = round(overall, 1)

        return scores

    # phase each metric is read in — drives which reference clip to show
    METRIC_PHASE = {
        'elbow_angle': 'contact', 'hip_rotation': 'contact',
        'shoulder_angle': 'loading', 'knee_angle': 'loading', 'racket_lag': 'loading',
    }

    def top_corrections(self, scores, contact_angles, stroke_type='forehand',
                        loading_angles=None, top=2):
        """Structured version of the report's ranked fix list, for the API/UI.

        Returns a list of dicts: metric, name, phase, value, ideal (lo,hi),
        score, direction ('low'/'high'), drill.
        """
        if not scores or contact_angles is None:
            return []
        merged = dict(contact_angles)
        for m in ('shoulder_angle', 'knee_angle', 'racket_lag'):
            if loading_angles and m in loading_angles:
                merged[m] = loading_angles[m]
        ideals = IDEAL_RANGES.get(stroke_type, IDEAL_RANGES['forehand'])

        plain = self.L.get('plain', {})
        ranked = []
        for m in ['elbow_angle', 'hip_rotation', 'shoulder_angle', 'knee_angle', 'racket_lag']:
            sc = scores.get(m)
            if sc is None or m not in merged or m not in ideals:
                continue
            lo, hi = ideals[m]
            val = merged[m]
            # only a real problem: clearly off the ideal band
            if lo <= val <= hi or sc >= 82:
                continue
            direction = 'low' if val < lo else 'high'
            pl = plain.get(m, {}).get(direction, ('', ''))
            ranked.append({
                'metric': m,
                'name': self.L['metric_names'].get(m, m),
                'headline': pl[0],
                'why': pl[1],
                'phase': self.METRIC_PHASE.get(m, 'contact'),
                'value': round(float(val), 1),
                'ideal': [lo, hi],
                'target_dir': 'up' if direction == 'low' else 'down',
                'score': round(float(sc), 1),
                'direction': direction,
                'drill': self._get_drill(m, val, (lo, hi)),
                'impact': WEIGHTS.get(m, 0.1) * (100 - sc),
            })
        ranked.sort(key=lambda x: -x['impact'])
        for r in ranked:
            r.pop('impact', None)
        return ranked[:top]

    def compare_to_pro(self, user_angles, pro_name, stroke_type='forehand'):
        """Compare user angles to a pro player's reference data.
        Returns dict with per-joint differences and textual comparison.
        """
        pro_key = f"{pro_name}_{stroke_type}"
        if pro_key not in self.pro_data:
            return None

        pro_angles = self.pro_data[pro_key].get('contact_angles', {})
        comparison = {}

        for metric in user_angles:
            if metric in pro_angles:
                diff = user_angles[metric] - pro_angles[metric]
                comparison[metric] = {
                    'user': round(user_angles[metric], 1),
                    'pro': round(pro_angles[metric], 1),
                    'diff': round(diff, 1),
                    'pro_name': pro_name.capitalize(),
                }
        return comparison

    def generate_coaching_report(self, scores, contact_angles, stroke_type='forehand',
                                  pro_comparison=None, loading_angles=None):
        """Generate a human-readable coaching report.
        Uses the correct angle source for each metric's phase.
        """
        L = self.L
        if scores is None or contact_angles is None:
            return L['no_pose']

        # Build a merged angle dict that uses the right phase for each metric
        angles = dict(contact_angles)
        if loading_angles:
            for m in ['shoulder_angle', 'knee_angle', 'racket_lag']:
                if m in loading_angles:
                    angles[m] = loading_angles[m]

        lines = [L['score_line'].format(overall=scores['overall']), ""]

        # Verdict
        for threshold in (85, 70, 50, 0):
            if scores['overall'] >= threshold:
                lines.append(L['verdict'][threshold])
                break
        lines.append("")

        # Rank corrections by impact (lowest score * highest weight)
        ideals = IDEAL_RANGES.get(stroke_type, IDEAL_RANGES['forehand'])
        corrections = []
        for metric in ['elbow_angle', 'hip_rotation', 'shoulder_angle', 'knee_angle', 'racket_lag']:
            if metric in scores and scores[metric] < 90:
                impact = WEIGHTS.get(metric, 0.1) * (100 - scores[metric])
                corrections.append((metric, scores[metric], impact, angles.get(metric, 0)))

        corrections.sort(key=lambda x: -x[2])

        # Top 2 corrections
        for i, (metric, score, impact, value) in enumerate(corrections[:2]):
            ideal = ideals.get(metric, (0, 0))
            name = L['metric_names'].get(metric, metric.replace('_', ' ').title())

            lines.append(L['correction_line'].format(
                i=i + 1, name=name, value=value, lo=ideal[0], hi=ideal[1], score=score))

            if pro_comparison and metric in pro_comparison:
                pc = pro_comparison[metric]
                lines.append(L['pro_line'].format(
                    pro=pc['pro_name'], name=name.lower(), pro_val=pc['pro'], diff=pc['diff']))

            lines.append(L['drill_prefix'] + self._get_drill(metric, value, ideal))
            lines.append("")

        # Follow-through note
        if scores.get('follow_through', 100) < 50:
            lines.append(L['follow_incomplete'])
            lines.append(L['follow_drill'])

        return "\n".join(lines)

    def _get_drill(self, metric, value, ideal_range):
        """Return a language-specific drill string for a metric being off-range."""
        low, high = ideal_range
        drills = self.L['drills']
        direction = 'too_low' if value < low else 'too_high'
        return drills.get(metric, {}).get(direction, drills['default'])

    def get_injury_warnings(self, angles, stroke_type='serve'):
        """Flag mechanics that could increase injury risk (language-specific)."""
        warnings = []
        if angles is None:
            return warnings
        inj = self.L['injury']

        if stroke_type == 'serve' and angles.get('shoulder_angle', 999) < 140:
            warnings.append(inj['shoulder'])

        if stroke_type == 'serve' and angles.get('hip_rotation', 0) > 100:
            warnings.append(inj['lumbar'])

        if angles.get('knee_angle', 999) < 90:
            warnings.append(inj['knee'])

        return warnings
