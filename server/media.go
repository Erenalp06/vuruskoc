package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"strconv"
	"time"
)

type probeInfo struct {
	DurationSec float64
	Width       int
	Height      int
	FPS         float64
}

// ffprobe a file for duration / resolution / frame rate.
func ffprobe(ctx context.Context, path string) (probeInfo, error) {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, "ffprobe", "-v", "error",
		"-select_streams", "v:0",
		"-show_entries", "stream=width,height,avg_frame_rate:format=duration",
		"-of", "json", path).Output()
	if err != nil {
		return probeInfo{}, fmt.Errorf("ffprobe: %w", err)
	}
	var raw struct {
		Streams []struct {
			Width, Height int
			AvgFrameRate  string `json:"avg_frame_rate"`
		}
		Format struct {
			Duration string
		}
	}
	if err := json.Unmarshal(out, &raw); err != nil {
		return probeInfo{}, err
	}
	pi := probeInfo{}
	if len(raw.Streams) > 0 {
		pi.Width = raw.Streams[0].Width
		pi.Height = raw.Streams[0].Height
		if n, d, ok := parseRatio(raw.Streams[0].AvgFrameRate); ok && d != 0 {
			pi.FPS = n / d
		}
	}
	pi.DurationSec, _ = strconv.ParseFloat(raw.Format.Duration, 64)
	return pi, nil
}

func parseRatio(s string) (num, den float64, ok bool) {
	for i := 0; i < len(s); i++ {
		if s[i] == '/' {
			n, e1 := strconv.ParseFloat(s[:i], 64)
			d, e2 := strconv.ParseFloat(s[i+1:], 64)
			return n, d, e1 == nil && e2 == nil
		}
	}
	n, e := strconv.ParseFloat(s, 64)
	return n, 1, e == nil
}

// trimClip cuts [start,end] from src, strips audio, downscales the long side to
// 1280 and re-encodes to H.264 so the analyzer and browsers agree on it.
func trimClip(ctx context.Context, src, dst string, start, end float64) error {
	ctx, cancel := context.WithTimeout(ctx, 3*time.Minute)
	defer cancel()
	dur := end - start
	if dur <= 0 {
		return fmt.Errorf("bad trim range: start=%.3f end=%.3f", start, end)
	}
	args := []string{
		"-y", "-loglevel", "error",
		"-ss", strconv.FormatFloat(start, 'f', 3, 64),
		"-i", src,
		"-t", strconv.FormatFloat(dur, 'f', 3, 64),
		"-an",
		"-vf", "scale='if(gt(iw,ih),1280,-2)':'if(gt(iw,ih),-2,1280)',fps=30",
		"-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast",
		"-movflags", "+faststart",
		dst,
	}
	out, err := exec.CommandContext(ctx, "ffmpeg", args...).CombinedOutput()
	if err != nil {
		return fmt.Errorf("ffmpeg trim: %w: %s", err, string(out))
	}
	return nil
}
