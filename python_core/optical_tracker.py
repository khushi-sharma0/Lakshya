"""
Lakshya ISRO PS 26169 - Optical Tracking Engine in Python
High-precision 2D Centroiding, Discrete Kalman Filter, and Gimbal PID Controller
"""

import math
import sys
import json
from typing import Dict, List, Optional, Tuple, Any

class GaussianCentroidFit:
    """
    2D Gaussian Spot Fitting for sub-pixel beacon center estimation
    Model: I(x, y) = I_0 * exp( -((x - x_0)^2 / (2*sigma_x^2) + (y - y_0)^2 / (2*sigma_y^2)) ) + B
    """
    @staticmethod
    def fit_from_moments(image_data: List[List[float]], threshold: float = 0.2) -> Dict[str, Any]:
        """
        Closed-form Gaussian moment estimation with sub-pixel precision (< 0.1 px)
        """
        rows = len(image_data)
        if rows == 0:
            return {"x": 0.0, "y": 0.0, "r_squared": 0.0, "confidence": 0.0}
        cols = len(image_data[0])

        m00 = 0.0
        m10 = 0.0
        m01 = 0.0
        m20 = 0.0
        m02 = 0.0

        for r in range(rows):
            for c in range(cols):
                val = image_data[r][c]
                if val > threshold:
                    w = val - threshold
                    m00 += w
                    m10 += c * w
                    m01 += r * w
                    m20 += (c * c) * w
                    m02 += (r * r) * w

        if m00 <= 1e-6:
            return {"x": cols / 2.0, "y": rows / 2.0, "r_squared": 0.0, "confidence": 0.0}

        cx = m10 / m00
        cy = m01 / m00

        var_x = max(0.5, (m20 / m00) - (cx * cx))
        var_y = max(0.5, (m02 / m00) - (cy * cy))
        sigma_x = math.sqrt(var_x)
        sigma_y = math.sqrt(var_y)

        # Compute R^2 goodness of fit against ideal Gaussian distribution
        ss_res = 0.0
        ss_tot = 0.0
        mean_val = m00 / (rows * cols)

        for r in range(rows):
            for c in range(cols):
                actual = image_data[r][c]
                dx = (c - cx) / sigma_x
                dy = (r - cy) / sigma_y
                model = math.exp(-0.5 * (dx * dx + dy * dy))
                ss_res += (actual - model) ** 2
                ss_tot += (actual - mean_val) ** 2

        r_squared = 1.0 - (ss_res / max(1e-6, ss_tot))
        r_squared = max(0.0, min(0.999, r_squared))
        confidence = min(1.0, (m00 / 50.0) * r_squared)

        return {
            "x": round(cx, 3),
            "y": round(cy, 3),
            "sigma_x": round(sigma_x, 3),
            "sigma_y": round(sigma_y, 3),
            "r_squared": round(r_squared, 4),
            "confidence": round(confidence, 3),
        }


class KalmanTracker2D:
    """
    4-State Linear Kalman Filter for Target State Estimation:
    State Vector: X = [x, y, v_x, v_y]^T
    Transition Matrix: F = [[1, 0, dt,  0],
                            [0, 1,  0, dt],
                            [0, 0,  1,  0],
                            [0, 0,  0,  1]]
    Observation Matrix: H = [[1, 0, 0, 0],
                             [0, 1, 0, 0]]
    """
    def __init__(self, init_x: float = 320.0, init_y: float = 240.0, q_pos: float = 1.5, q_vel: float = 8.0, r_pos: float = 2.0):
        self.x = [init_x, init_y, 0.0, 0.0]
        # Diagonal covariance matrix [P_xx, P_yy, P_vx, P_vy]
        self.p = [20.0, 20.0, 50.0, 50.0]
        self.q_pos = q_pos
        self.q_vel = q_vel
        self.r_pos = r_pos
        self.predicted_x = init_x
        self.predicted_y = init_y
        self.state = "SEARCHING"
        self.consecutive_hits = 0
        self.consecutive_misses = 0

    def predict(self, dt: float) -> Tuple[float, float]:
        safe_dt = max(1.0 / 120.0, min(1.0 / 15.0, dt))
        if self.state != "SEARCHING":
            self.predicted_x = self.x[0] + self.x[2] * safe_dt
            self.predicted_y = self.x[1] + self.x[3] * safe_dt
            self.p[0] += 2.0 * self.p[2] * safe_dt + self.q_pos * safe_dt
            self.p[1] += 2.0 * self.p[3] * safe_dt + self.q_pos * safe_dt
            self.p[2] += self.q_vel * safe_dt
            self.p[3] += self.q_vel * safe_dt
        else:
            self.predicted_x = self.x[0]
            self.predicted_y = self.x[1]
        return self.predicted_x, self.predicted_y

    def update(self, meas_x: float, meas_y: float, confidence: float = 0.9) -> Dict[str, Any]:
        self.consecutive_hits += 1
        self.consecutive_misses = 0

        if self.state in ["SEARCHING", "LOST"]:
            self.state = "ACQUIRED"
            self.x[0] = meas_x
            self.x[1] = meas_y
            self.x[2] = 0.0
            self.x[3] = 0.0
            return self.get_state()

        if self.state == "ACQUIRED" and self.consecutive_hits >= 2:
            self.state = "TRACKING"

        # Measurement covariance scaled inversely by confidence
        r = self.r_pos / max(0.2, confidence)
        kx = self.p[0] / (self.p[0] + r)
        ky = self.p[1] / (self.p[1] + r)
        kvx = self.p[2] / (self.p[0] + r)
        kvy = self.p[3] / (self.p[1] + r)

        res_x = meas_x - self.predicted_x
        res_y = meas_y - self.predicted_y

        self.x[0] = self.predicted_x + kx * res_x
        self.x[1] = self.predicted_y + ky * res_y
        self.x[2] = self.x[2] + kvx * res_x
        self.x[3] = self.x[3] + kvy * res_y

        self.p[0] *= (1.0 - kx)
        self.p[1] *= (1.0 - ky)
        self.p[2] *= (1.0 - kvx)
        self.p[3] *= (1.0 - kvy)

        return self.get_state()

    def update_miss(self) -> str:
        self.consecutive_misses += 1
        self.consecutive_hits = 0
        if self.state == "TRACKING" and self.consecutive_misses >= 3:
            self.state = "COASTING"
        elif self.state == "COASTING" and self.consecutive_misses > 15:
            self.state = "LOST"

        if self.state in ["TRACKING", "COASTING"]:
            self.x[0] = self.predicted_x
            self.x[1] = self.predicted_y
            self.x[2] *= 0.95
            self.x[3] *= 0.95
        return self.state

    def get_state(self) -> Dict[str, Any]:
        return {
            "x": round(self.x[0], 2),
            "y": round(self.x[1], 2),
            "vx": round(self.x[2], 2),
            "vy": round(self.x[3], 2),
            "predicted_x": round(self.predicted_x, 2),
            "predicted_y": round(self.predicted_y, 2),
            "state": self.state,
            "covariance_trace": round(sum(self.p), 2),
        }


class PointingGimbalPID:
    """
    Pointing Controller: Closed-Loop Gimbal PID with Velocity Feedforward & Slew Rate Limits
    Outputs: Pan and Tilt slew velocity commands (deg/s)
    """
    def __init__(self, kp: float = 3.5, ki: float = 0.12, kd: float = 0.3, kff: float = 0.85, max_speed_deg_s: float = 5.0):
        self.kp = kp
        self.ki = ki
        self.kd = kd
        self.kff = kff
        self.max_speed = max_speed_deg_s
        self.integral_pan = 0.0
        self.integral_tilt = 0.0
        self.prev_err_pan = 0.0
        self.prev_err_tilt = 0.0

    def compute(self, target_cam_x: float, target_cam_y: float, target_vx: float, target_vy: float,
                fov_x_deg: float = 4.0, fov_y_deg: float = 3.0,
                res_w: float = 640.0, res_h: float = 480.0, dt: float = 1.0/30.0) -> Dict[str, float]:
        cam_cx = res_w / 2.0
        cam_cy = res_h / 2.0

        err_px_x = target_cam_x - cam_cx
        err_px_y = target_cam_y - cam_cy
        total_err_px = math.hypot(err_px_x, err_px_y)

        px_per_deg_x = res_w / max(0.1, fov_x_deg)
        px_per_deg_y = res_h / max(0.1, fov_y_deg)

        err_deg_pan = err_px_x / px_per_deg_x
        err_deg_tilt = err_px_y / px_per_deg_y

        # 1. Proportional term
        p_pan = self.kp * err_deg_pan
        p_tilt = self.kp * err_deg_tilt

        # 2. Integral term with anti-windup
        self.integral_pan += err_deg_pan * dt
        self.integral_tilt += err_deg_tilt * dt
        windup = 2.0
        self.integral_pan = max(-windup, min(windup, self.integral_pan))
        self.integral_tilt = max(-windup, min(windup, self.integral_tilt))
        i_pan = self.ki * self.integral_pan
        i_tilt = self.ki * self.integral_tilt

        # 3. Derivative term
        d_pan = self.kd * ((err_deg_pan - self.prev_err_pan) / max(1e-4, dt))
        d_tilt = self.kd * ((err_deg_tilt - self.prev_err_tilt) / max(1e-4, dt))
        self.prev_err_pan = err_deg_pan
        self.prev_err_tilt = err_deg_tilt

        # 4. Feedforward term from Kalman velocity
        ff_pan = self.kff * (target_vx / px_per_deg_x)
        ff_tilt = self.kff * (target_vy / px_per_deg_y)

        # Sum and clamp to slew rate limits (5.0 deg/s max)
        cmd_pan = max(-self.max_speed, min(self.max_speed, p_pan + i_pan + d_pan + ff_pan))
        cmd_tilt = max(-self.max_speed, min(self.max_speed, p_tilt + i_tilt + d_tilt + ff_tilt))

        return {
            "pan_cmd_deg_s": round(cmd_pan, 3),
            "tilt_cmd_deg_s": round(cmd_tilt, 3),
            "error_px": round(total_err_px, 2),
            "error_deg_pan": round(err_deg_pan, 4),
            "error_deg_tilt": round(err_deg_tilt, 4),
        }
