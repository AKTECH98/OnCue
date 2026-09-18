import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ServerMessage } from '@oncue/shared';

import { createOrchestrator } from '../orchestration/orchestrator.js';
import { BroadcastStore } from '../state/store.js';

import { VoiceSession } from './session.js';

function harness() {
  const store = new BroadcastStore();
  const sent: ServerMessage[] = [];
  const session = new VoiceSession({
    store,
    orchestrate: createOrchestrator(store),
    send: (message) => sent.push(message),
  });

  const lastSpoken = () =>
    sent
      .filter((m): m is Extract<ServerMessage, { type: 'voice:say' }> => m.type === 'voice:say')
      .at(-1)?.text ?? null;

  return { store, session, lastSpoken };
}

describe('spoken tool calling', () => {
  it('Scenario A — "Ready three." puts camera 3 in preview', async () => {
    const { store, session, lastSpoken } = harness();
    await session.handleUtterance('Ready three.');

    assert.equal(store.getState().video.previewCamera, 3);
    assert.equal(store.getState().video.programCamera, 1, 'program must not move');
    assert.equal(lastSpoken(), 'Camera 3 ready.');
  });

  it('Scenario B — "Take three." cuts camera 3 to program', async () => {
    const { store, session, lastSpoken } = harness();
    await session.handleUtterance('Take three.');

    assert.equal(store.getState().video.programCamera, 3);
    assert.equal(lastSpoken(), 'Camera 3 live.');
  });

  it('Scenario C — "Daniel next." prepares Daniel', async () => {
    const { store, session, lastSpoken } = harness();
    await session.handleUtterance('Daniel next.');

    assert.equal(store.getState().speakers.preparedGuestId, 'daniel');
    assert.equal(store.getState().speakers.activeGuestId, 'sarah', 'program must not move');
    assert.equal(lastSpoken(), 'Daniel ready.');
  });

  it('Scenario D — "Take Daniel." runs the compound orchestration', async () => {
    const { store, session, lastSpoken } = harness();
    await session.handleUtterance('Take Daniel.');
    const state = store.getState();

    assert.equal(state.video.programCamera, 3);
    assert.equal(state.speakers.activeGuestId, 'daniel');
    assert.equal(state.audio.microphones.find((m) => m.id === 3)?.state, 'live');
    assert.equal(state.audio.microphones.find((m) => m.id === 1)?.state, 'muted');
    assert.equal(state.graphics.current?.name, 'Daniel Kim');
    assert.equal(lastSpoken(), 'Daniel live.');
  });

  it('runs all four scenarios back to back without a reset', async () => {
    const { store, session } = harness();

    await session.handleUtterance('Ready three');
    assert.equal(store.getState().video.previewCamera, 3);

    await session.handleUtterance('Take three');
    assert.equal(store.getState().video.programCamera, 3);

    await session.handleUtterance('Daniel next');
    assert.equal(store.getState().speakers.preparedGuestId, 'daniel');

    await session.handleUtterance('Take Daniel');
    assert.equal(store.getState().speakers.activeGuestId, 'daniel');
  });

  it('repeats reliably across five consecutive runs', async () => {
    for (let run = 0; run < 5; run += 1) {
      const { store, session } = harness();
      await session.handleUtterance('Ready three');
      await session.handleUtterance('Take three');
      await session.handleUtterance('Take Daniel');

      assert.equal(store.getState().speakers.activeGuestId, 'daniel', `run ${run + 1}`);
      assert.equal(store.getState().video.programCamera, 3, `run ${run + 1}`);
    }
  });

  it('speaks the validation failure for a camera that does not exist', async () => {
    const { store, session, lastSpoken } = harness();
    const programBefore = store.getState().video.programCamera;

    await session.handleUtterance('Take camera seven.');

    assert.equal(lastSpoken(), 'There are four cameras.');
    assert.equal(store.getState().video.programCamera, programBefore);
  });

  it('refuses an unknown guest without touching the show', async () => {
    const { store, session, lastSpoken } = harness();
    const activeBefore = store.getState().speakers.activeGuestId;

    await session.handleUtterance('Take John.');

    assert.match(lastSpoken() ?? '', /didn't catch that|don't have a speaker/i);
    assert.equal(store.getState().speakers.activeGuestId, activeBefore);
  });

  it('reads back the show status on request', async () => {
    const { session, lastSpoken } = harness();
    await session.handleUtterance("What's the status?");

    assert.match(lastSpoken() ?? '', /Sarah Interview is live, Product Video next/);
  });

  it('keeps every spoken reply short', async () => {
    const { session, lastSpoken } = harness();
    for (const utterance of ['Ready three', 'Take three', 'Daniel next', 'Take Daniel']) {
      await session.handleUtterance(utterance);
      const words = (lastSpoken() ?? '').split(' ').length;
      assert.ok(words <= 5, `"${lastSpoken()}" is too wordy for a live show`);
    }
  });
});
