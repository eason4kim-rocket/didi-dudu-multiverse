import type { Actuator, ControlState } from "../../control/commands";
import type { Bb8Body } from "../bb8-body";
import type { Bb8Head } from "../bb8-head";

/** Turns shared commands into simulated drive torque. Head pose is visual-only. */
export class SimAdapter implements Actuator {
  constructor(
    private readonly body: Bb8Body,
    private readonly head: Bb8Head,
  ) {}

  apply(state: ControlState, dt: number): void {
    this.body.applyControl(state, dt);
  }

  syncVisuals(state: ControlState, dt: number): void {
    this.body.syncMesh();
    this.head.sync(this.body, state, dt);
  }
}
