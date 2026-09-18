import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BroadcastStore } from '../state/store.js';
import { runTool } from '../tools/execute.js';

import { createOrchestrator } from './orchestrator.js';

function operationalSnapshot(store: BroadcastStore) {
  const state = store.getState();
  return JSON.stringify({
    program: state.video.programCamera,
    preview: state.video.previewCamera,
    active: state.speakers.activeGuestId,
    prepared: state.speakers.preparedGuestId,
    mics: state.audio.microphones.map((m) => [m.id, m.state]),
    graphics: state.graphics,
    segments: state.show.runOfShow.map((s) => [s.id, s.status]),
  });
}

describe('orchestration graph', () => {
  it('walks the full node path for a valid action', async () => {
    const store = new BroadcastStore();
    const orchestrate = createOrchestrator(store);

    const result = await orchestrate('prepare_camera', { camera: 3 }, 'voice');

    assert.equal(result.ok, true);
    assert.deepEqual(result.path, [
      'validate_input',
      'read_state',
      'check_safety',
      'resolve_operation',
      'execute',
      'return_result',
    ]);
    assert.equal(store.getState().video.previewCamera, 3);
  });

  it('short-circuits an invalid action at validation', async () => {
    const store = new BroadcastStore();
    const orchestrate = createOrchestrator(store);
    const before = operationalSnapshot(store);

    const result = await orchestrate('take_camera', { camera: 7 }, 'voice');

    assert.equal(result.ok, false);
    assert.equal(result.message, 'There are four cameras.');
    assert.deepEqual(result.path, ['validate_input', 'return_result']);
    assert.equal(operationalSnapshot(store), before);
  });

  it('rejects an unknown entity without executing', async () => {
    const store = new BroadcastStore();
    const orchestrate = createOrchestrator(store);
    const before = operationalSnapshot(store);

    const result = await orchestrate('take_guest', { guest: 'John' }, 'voice');

    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'unknown_guest');
    assert.ok(!result.path.includes('return_result:redundant'));
    assert.equal(operationalSnapshot(store), before);
  });

  it('marks a redundant action instead of re-cutting', async () => {
    const store = new BroadcastStore();
    const orchestrate = createOrchestrator(store);
    const program = store.getState().video.programCamera;

    const result = await orchestrate('take_camera', { camera: program }, 'voice');

    assert.equal(result.ok, true);
    assert.match(result.message, /already live/i);
    assert.ok(result.path.includes('return_result:redundant'));
  });

  it('produces the same state as direct execution for a compound action', async () => {
    const viaGraph = new BroadcastStore();
    const direct = new BroadcastStore();

    await createOrchestrator(viaGraph)('take_guest', { guest: 'daniel' }, 'voice');
    runTool(direct, 'take_guest', { guest: 'daniel' });

    assert.equal(operationalSnapshot(viaGraph), operationalSnapshot(direct));
  });

  it('routes a high-risk spoken request to confirmation', async () => {
    const store = new BroadcastStore();
    const orchestrate = createOrchestrator(store);
    await orchestrate('take_guest', { guest: 'daniel' }, 'voice');
    const changed = operationalSnapshot(store);

    const asked = await orchestrate('reset_show', {}, 'voice');

    assert.equal(asked.ok, false);
    assert.equal(asked.errorCode, 'confirmation_required');
    assert.ok(asked.path.includes('request_confirmation'));
    assert.equal(operationalSnapshot(store), changed, 'nothing may change before confirmation');

    const confirmed = await orchestrate('reset_show', {}, 'voice', { confirmed: true });
    assert.equal(confirmed.ok, true);
    assert.notEqual(operationalSnapshot(store), changed);
  });

  it('lets manual controls run high-risk actions directly', async () => {
    const store = new BroadcastStore();
    const orchestrate = createOrchestrator(store);

    const result = await orchestrate('reset_show', {}, 'manual');

    assert.equal(result.ok, true);
    assert.ok(result.path.includes('execute'));
  });

  it('blocks audience-visible actions while the show is held', async () => {
    const store = new BroadcastStore();
    const orchestrate = createOrchestrator(store);
    store.update((draft) => {
      draft.cueEngine.held = true;
    });
    const before = operationalSnapshot(store);

    const blocked = await orchestrate('take_camera', { camera: 3 }, 'voice');
    assert.equal(blocked.ok, false);
    assert.equal(blocked.errorCode, 'on_hold');
    assert.equal(operationalSnapshot(store), before);

    const allowed = await orchestrate('prepare_camera', { camera: 3 }, 'voice');
    assert.equal(allowed.ok, true, 'preview work stays available during a hold');
  });

  it('stays fast enough for live production', async () => {
    const store = new BroadcastStore();
    const orchestrate = createOrchestrator(store);

    const startedAt = Date.now();
    for (let i = 0; i < 20; i += 1) {
      await orchestrate('get_show_status', {}, 'voice');
    }
    const averageMs = (Date.now() - startedAt) / 20;

    assert.ok(averageMs < 25, `orchestration averaged ${averageMs}ms per call`);
  });
});
