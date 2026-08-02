import { ConnectionState } from './types.js';
import { StateError } from './errors.js';

/**
 * Valid state transitions for the connection lifecycle.
 *
 * A transition is allowed if the target state appears in the array
 * corresponding to the current state.
 */
const VALID_TRANSITIONS: Record<ConnectionState, ConnectionState[]> = {
  idle: ['scanning', 'connecting', 'disconnected'],
  scanning: ['idle', 'connecting', 'disconnected'],
  connecting: ['discovering-services', 'disconnected', 'reconnecting'],
  'discovering-services': ['connected', 'disconnected', 'reconnecting'],
  connected: ['disconnecting', 'disconnected', 'reconnecting'],
  disconnecting: ['disconnected', 'idle'],
  disconnected: ['idle', 'connecting'],
  reconnecting: ['connecting', 'disconnected', 'idle']
};

/**
 * Finite state machine for BLE connection lifecycle.
 *
 * Emits {@link Event} `statechange` on every transition.
 */
export class ConnectionStateMachine extends EventTarget {
  private _state: ConnectionState = 'idle';
  private _lastReason?: string;

  get state(): ConnectionState {
    return this._state;
  }

  get lastReason(): string | undefined {
    return this._lastReason;
  }

  /**
   * Attempt to transition to a new state.
   *
   * @throws {StateError} if the transition is not allowed.
   */
  transition(to: ConnectionState, reason?: string): void {
    if (!this.canTransition(to)) {
      throw new StateError(
        `Invalid state transition from "${this._state}" to "${to}"${reason ? ` (${reason})` : ''}`
      );
    }

    const from = this._state;
    this._state = to;
    this._lastReason = reason;

    this.dispatchEvent(
      new CustomEvent('statechange', {
        detail: { from, to, reason }
      })
    );
  }

  /**
   * Check whether a transition to the target state is allowed.
   */
  canTransition(to: ConnectionState): boolean {
    return VALID_TRANSITIONS[this._state].includes(to);
  }

  /**
   * Reset the machine back to `idle`.
   */
  reset(): void {
    this._state = 'idle';
    this._lastReason = undefined;
  }
}
