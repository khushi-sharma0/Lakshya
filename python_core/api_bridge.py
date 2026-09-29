"""
Lakshya ISRO PS 26169 - Python Execution Bridge
Provides stdin/stdout JSON protocol and direct invocation for Optical Tracking,
Kalman Filtering, Pointing PID, and Benchmark Analysis
"""

import sys
import json
import traceback
from optical_tracker import GaussianCentroidFit, KalmanTracker2D, PointingGimbalPID
from benchmark_evaluator import evaluate_run, ISRO_THRESHOLDS

tracker_instances = {}
pid_instances = {}

def get_tracker(track_id="primary"):
    if track_id not in tracker_instances:
        tracker_instances[track_id] = KalmanTracker2D()
    return tracker_instances[track_id]

def get_pid(pid_id="primary"):
    if pid_id not in pid_instances:
        pid_instances[pid_id] = PointingGimbalPID()
    return pid_instances[pid_id]

def handle_command(cmd_data):
    action = cmd_data.get("action", "")

    if action == "status":
        return {
            "status": "online",
            "runtime": "Python 3.10.12 (CPython)",
            "algorithms": ["GaussianCentroidFit", "KalmanTracker2D", "PointingGimbalPID", "ISRO_BenchmarkEvaluator"],
            "thresholds": ISRO_THRESHOLDS,
        }

    elif action == "track_step":
        """
        Processes one tracking step:
        Inputs: meas_x, meas_y, dt, is_detected, confidence, camera_cfg
        """
        tracker = get_tracker(cmd_data.get("track_id", "primary"))
        pid = get_pid(cmd_data.get("pid_id", "primary"))

        dt = float(cmd_data.get("dt", 1.0 / 30.0))
        is_detected = bool(cmd_data.get("is_detected", True))
        meas_x = float(cmd_data.get("meas_x", 320.0))
        meas_y = float(cmd_data.get("meas_y", 240.0))
        conf = float(cmd_data.get("confidence", 0.9))

        # 1. Kalman Predict
        pred_x, pred_y = tracker.predict(dt)

        # 2. Kalman Update
        if is_detected and conf > 0.2:
            kalman_state = tracker.update(meas_x, meas_y, conf)
        else:
            tracker.update_miss()
            kalman_state = tracker.get_state()

        # 3. PID Gimbal Output
        cam_cfg = cmd_data.get("camera_cfg", {})
        pid_out = pid.compute(
            target_cam_x=kalman_state["x"],
            target_cam_y=kalman_state["y"],
            target_vx=kalman_state["vx"],
            target_vy=kalman_state["vy"],
            fov_x_deg=float(cam_cfg.get("fovXDeg", 4.0)),
            fov_y_deg=float(cam_cfg.get("fovYDeg", 3.0)),
            res_w=float(cam_cfg.get("resolutionWidth", 640.0)),
            res_h=float(cam_cfg.get("resolutionHeight", 480.0)),
            dt=dt
        )

        return {
            "status": "success",
            "engine": "python3",
            "kalman": kalman_state,
            "pid": pid_out,
        }

    elif action == "evaluate_benchmark":
        frames = cmd_data.get("frames", [])
        return evaluate_run(frames)

    elif action == "reset":
        tracker_instances.clear()
        pid_instances.clear()
        return {"status": "reset_complete"}

    else:
        return {"status": "error", "message": f"Unknown action: {action}"}

if __name__ == "__main__":
    if len(sys.argv) > 1:
        # CLI invocation with argument string
        try:
            req = json.loads(sys.argv[1])
            res = handle_command(req)
            print(json.dumps(res))
        except Exception as e:
            print(json.dumps({"status": "error", "error": str(e), "traceback": traceback.format_exc()}))
    else:
        # Stdin mode
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            try:
                req = json.loads(line)
                res = handle_command(req)
                print(json.dumps(res))
                sys.stdout.flush()
            except Exception as e:
                print(json.dumps({"status": "error", "error": str(e)}))
                sys.stdout.flush()
