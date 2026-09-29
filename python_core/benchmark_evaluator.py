"""
Lakshya ISRO PS 26169 - Performance Benchmark Evaluator in Python
Evaluates tracking telemetry against official ISRO criteria:
1. Target Acquisition Time <= 2.0 s
2. Centroid Tracking Error <= 10.0 px (Post-Lock)
3. Target Loss Rate < 5.0 %
4. Re-Acquisition Time <= 1.0 s
5. Frame Processing Rate >= 20.0 FPS
6. Lock Retention Rate >= 85.0 %
"""

import math
import sys
import json
from typing import Dict, List, Any

# Official ISRO PS 26169 Thresholds
ISRO_THRESHOLDS = {
    "acquisition_time_max_sec": 2.0,
    "tracking_error_max_px": 10.0,
    "target_loss_rate_max_pct": 5.0,
    "reacquisition_time_max_sec": 1.0,
    "min_frame_rate_fps": 20.0,
    "lock_retention_min_pct": 85.0,
}

def evaluate_run(frame_logs: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Evaluates simulation frames according to strict post-lock criteria
    """
    if not frame_logs:
        return {
            "status": "empty",
            "all_passed": False,
            "metrics": {},
            "verdicts": {},
        }

    total_frames = len(frame_logs)
    first_lock_index = -1
    acquisition_time_sec = 0.0

    # 1. Measure initial acquisition time (from start until first confirmed lock)
    for idx, f in enumerate(frame_logs):
        state = f.get("state", "SEARCHING")
        if state in ["TRACKING", "ACQUIRED"]:
            first_lock_index = idx
            acquisition_time_sec = f.get("timestampSec", idx * 0.033)
            break

    # 2. Compute tracking error exclusively post-lock
    post_lock_errors = []
    locked_frames_count = 0
    loss_events_count = 0
    in_loss_event = False
    reacquisition_durations = []
    loss_start_time = 0.0

    for idx in range(max(0, first_lock_index), total_frames):
        f = frame_logs[idx]
        state = f.get("state", "SEARCHING")
        err = f.get("trackingErrorPx", 0.0)
        ts = f.get("timestampSec", idx * 0.033)

        if state in ["TRACKING", "ACQUIRED"]:
            if in_loss_event:
                # Reacquisition completed
                reacq_time = ts - loss_start_time
                reacquisition_durations.append(reacq_time)
                in_loss_event = False
            locked_frames_count += 1
            if math.isfinite(err):
                post_lock_errors.append(err)
        elif state in ["COASTING", "REACQUIRING", "LOST", "SEARCHING"]:
            if not in_loss_event and first_lock_index >= 0:
                in_loss_event = True
                loss_start_time = ts
                loss_events_count += 1

    post_lock_count = total_frames - max(0, first_lock_index) if first_lock_index >= 0 else 0

    # Average and RMS error post-lock
    if post_lock_errors:
        avg_error_px = sum(post_lock_errors) / len(post_lock_errors)
        rms_error_px = math.sqrt(sum(e * e for e in post_lock_errors) / len(post_lock_errors))
        max_error_px = max(post_lock_errors)
    else:
        avg_error_px = 0.0
        rms_error_px = 0.0
        max_error_px = 0.0

    # Lock retention and loss rate
    if post_lock_count > 0:
        lock_retention_pct = (locked_frames_count / post_lock_count) * 100.0
        target_loss_rate_pct = ((post_lock_count - locked_frames_count) / post_lock_count) * 100.0
    else:
        lock_retention_pct = 0.0
        target_loss_rate_pct = 100.0

    # Reacquisition time
    reacquisition_time_sec = (sum(reacquisition_durations) / len(reacquisition_durations)) if reacquisition_durations else 0.0

    # FPS calculation
    fps_list = [f.get("fps", 30.0) for f in frame_logs if math.isfinite(f.get("fps", 30.0))]
    avg_fps = (sum(fps_list) / len(fps_list)) if fps_list else 30.0

    # Metric thresholds evaluation
    verdicts = {
        "acquisition_time_pass": (first_lock_index >= 0) and (acquisition_time_sec <= ISRO_THRESHOLDS["acquisition_time_max_sec"]),
        "tracking_error_pass": (len(post_lock_errors) > 0) and (avg_error_px <= ISRO_THRESHOLDS["tracking_error_max_px"]),
        "target_loss_rate_pass": target_loss_rate_pct <= ISRO_THRESHOLDS["target_loss_rate_max_pct"],
        "reacquisition_time_pass": reacquisition_time_sec <= ISRO_THRESHOLDS["reacquisition_time_max_sec"],
        "frame_rate_pass": avg_fps >= ISRO_THRESHOLDS["min_frame_rate_fps"],
        "lock_retention_pass": lock_retention_pct >= ISRO_THRESHOLDS["lock_retention_min_pct"],
    }

    all_passed = all(verdicts.values())
    passed_count = sum(1 for v in verdicts.values() if v)

    return {
        "status": "success",
        "all_passed": all_passed,
        "passed_count": passed_count,
        "total_criteria": len(verdicts),
        "metrics": {
            "acquisition_time_sec": round(acquisition_time_sec, 3),
            "avg_error_px": round(avg_error_px, 2),
            "rms_error_px": round(rms_error_px, 2),
            "max_error_px": round(max_error_px, 2),
            "target_loss_rate_pct": round(target_loss_rate_pct, 1),
            "reacquisition_time_sec": round(reacquisition_time_sec, 3),
            "avg_fps": round(avg_fps, 1),
            "lock_retention_pct": round(lock_retention_pct, 1),
            "total_frames": total_frames,
            "locked_frames": locked_frames_count,
            "loss_events": loss_events_count,
        },
        "verdicts": verdicts,
        "thresholds": ISRO_THRESHOLDS,
    }

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--test":
        # Self-test with synthetic test scenario
        synthetic_frames = []
        for i in range(120):
            state = "SEARCHING" if i < 15 else "TRACKING"
            err = 80.0 if i < 15 else (3.2 + math.sin(i * 0.1) * 1.5)
            synthetic_frames.append({
                "frameIndex": i,
                "timestampSec": i * 0.033,
                "state": state,
                "trackingErrorPx": err,
                "fps": 30.0,
            })
        report = evaluate_run(synthetic_frames)
        print(json.dumps(report, indent=2))
