import { describe, it, expect, vi } from 'vitest';
import { ConnectionStateMachine } from '../../src/state-machine.js';
import { StateError } from '../../src/errors.js';

describe('ConnectionStateMachine', () => {
  it('starts in idle state', () => {
    const sm = new ConnectionStateMachine();
    expect(sm.state).toBe('idle');
  });

  it('allows valid transitions', () => {
    const sm = new ConnectionStateMachine();
    sm.transition('scanning');
    expect(sm.state).toBe('scanning');
    sm.transition('connecting');
    expect(sm.state).toBe('connecting');
    sm.transition('discovering-services');
    expect(sm.state).toBe('discovering-services');
    sm.transition('connected');
    expect(sm.state).toBe('connected');
  });

  it('dispatches statechange events with detail', () => {
    const sm = new ConnectionStateMachine();
    const listener = vi.fn();
    sm.addEventListener('statechange', listener);

    sm.transition('scanning', 'user click');

    expect(listener).toHaveBeenCalledTimes(1);
    const detail = listener.mock.calls[0][0].detail;
    expect(detail.from).toBe('idle');
    expect(detail.to).toBe('scanning');
    expect(detail.reason).toBe('user click');
  });

  it('rejects invalid transitions', () => {
    const sm = new ConnectionStateMachine();
    expect(() => sm.transition('connected')).toThrow(StateError);
  });

  it('canTransition returns correct result', () => {
    const sm = new ConnectionStateMachine();
    expect(sm.canTransition('scanning')).toBe(true);
    expect(sm.canTransition('connected')).toBe(false);
  });

  it('reset returns to idle', () => {
    const sm = new ConnectionStateMachine();
    sm.transition('scanning');
    sm.reset();
    expect(sm.state).toBe('idle');
  });
});
