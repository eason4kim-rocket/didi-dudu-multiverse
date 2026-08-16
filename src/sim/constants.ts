// Screen-used BB-8: ball 508mm, head 295mm, height 670mm (starwars.com /
// rimstar.org). Sim unit scale: 1 unit = 462mm, so ratios match the film.
export const BODY_RADIUS = 0.55;
export const HEAD_RADIUS = 0.32;
export const HEAD_BASE_CONE_H = 0.043;
export const HEAD_BASE_BAND_H = 0.067;
export const HEAD_SIT = 0.02;

export const SHELL_MASS = 1.7;
export const IDU_MASS = 6.8;
export const PENDULUM_LENGTH = 0.3;

/** 真实质量: assembled 真身零件 add heft — 变真=变重. Capped so it stays drivable. */
export const LOAD_MAX = 6;
export const LOAD_MASS_GAIN = 0.22; // shell mass ×(1 + 0.22·parts); 6 parts ≈ 2.3×

export const DRIVE_FORCE = 34;
export const WHEEL_TORQUE = 5.6;
export const TURN_RATE = 2.6;
/** Steers velocity toward heading while driving (exponential rate, 1/s). */
export const LATERAL_GRIP = 30;
/** Aligns the rolling axis to the heading while driving (rate, 1/s). */
export const ROLL_ALIGN = 30;
/** Damps pendulum swing vs the shell; brake value stops rebound roll-back. */
export const PENDULUM_DAMP = 2.5;
export const PENDULUM_DAMP_BRAKE = 11;
export const CENTER_SPRING = 16;
export const BRAKE_SPRING = 26;
export const MAX_SPEED = 3.6;
export const DRIVE_LINEAR_DAMP = 0.1;
export const DRIVE_ANGULAR_DAMP = 0.16;
export const BRAKE_LINEAR_DAMP = 0.58;
export const BRAKE_ANGULAR_DAMP = 0.72;
export const SPIN_TORQUE = 2.1;

export const MAX_LOOK_YAW = 0.7;
export const MAX_LOOK_PITCH = 0.35;
export const LOOK_SPEED = 8;
export const HEAD_LEAN_GAIN = 0.7;
export const HEAD_LEAN_MAX = 0.22;
export const HEAD_POS_SMOOTH = 14;
