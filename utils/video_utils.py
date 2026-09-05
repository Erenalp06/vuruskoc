import cv2

def read_video(video_path, max_dim=None, max_frames=None, stride=1):
    """Read a video into a list of BGR frames.

    max_dim:    if set, downscale so the longer side is <= max_dim (keeps aspect).
                Phone clips are often 4K/60 — decoding every full frame into a
                Python list will exhaust RAM, so callers analysing arbitrary
                uploads should pass e.g. max_dim=1280, max_frames=900.
    max_frames: stop after this many *kept* frames.
    stride:     keep every Nth frame (stride=2 halves 60fps footage to 30).
    """
    cap = cv2.VideoCapture(video_path)
    frames = []
    idx = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        if idx % stride == 0:
            if max_dim:
                h, w = frame.shape[:2]
                if max(h, w) > max_dim:
                    s = max_dim / max(h, w)
                    frame = cv2.resize(frame, (round(w * s), round(h * s)),
                                       interpolation=cv2.INTER_AREA)
            frames.append(frame)
            if max_frames and len(frames) >= max_frames:
                break
        idx += 1
    cap.release()
    return frames

def save_video(output_video_frames, output_video_path):
    fourcc = cv2.VideoWriter_fourcc(*'MJPG')
    out = cv2.VideoWriter(output_video_path, fourcc, 24, (output_video_frames[0].shape[1], output_video_frames[0].shape[0]))
    for frame in output_video_frames:
        out.write(frame)
    out.release()