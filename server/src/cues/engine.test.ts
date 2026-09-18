import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ServerMessage } from '@oncue/shared';

import { createOrchestrator } from '../orchestration/orchestrator.js';
import { BroadcastStore } from '../state/store.js';
import { VoiceSession } from '../voice/session.js';

import { CueEngine } from './engine.js';

function harness() {
  const store = new BroadcastStore();
  const orchestrate = createOrchestrator(store);
  const cues = new CueEngine(store, orchestrate);
  const sent: ServerMessage[] = [];
  const session = new VoiceSession({
    store,
    orchestrate,
    cues,
    send: (message) => sent.push(message),
  });
  const lastSpoken = () =>
    sent
      .filter((m): m is Extract<ServerMessage, { type: 'voice:say' }> => m.type === 'voice:say')
      .at(-1)?.text ?? null;
  const cueList = () => store.getState().cueEngine.cues;

  return { store, cues, session, cueList, lastSpoken };
}

/** The cue engine fires from a store subscription, so give it a tick to run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

describe('cue stack', () => {
  it('turns a multi-part instruction into visible cues', async () => {
    const { session, cueList } = harness();

    await session.handleUtterance('Daniel next, music out after Sarah, then take three.');
    const cues = cueList();

    assert.equal(cues.length, 3);
    assert.deepEqual(
      cues.map((c) => c.description),
      ['Ready Daniel', 'Fade music', 'Take camera 3'],
    );
  });

  it('fires immediate cues and holds triggered ones', async () => {
    const { store, session, cueList } = harness();

    await session.handleUtterance('Daniel next, music out after Sarah, then take three.');
    const cues = cueList();

    assert.equal(cues[0]?.state, 'completed', 'the immediate step runs at once');
    assert.equal(store.getState().speakers.preparedGuestId, 'daniel');

    assert.equal(cues[1]?.state, 'waiting');
    assert.equal(cues[1]?.trigger.description, 'Sarah finishes');
    assert.equal(cues[2]?.state, 'waiting', 'a "then" clause inherits the trigger');
    assert.equal(store.getState().audio.musicLevel, 12, 'music must not fade yet');
    assert.equal(store.getState().video.programCamera, 1, 'camera must not cut yet');
  });

  it('fires the waiting cues when the trigger moment arrives', async () => {
    const { store, session, cueList } = harness();
    await session.handleUtterance('Daniel next, music out after Sarah, then take three.');

    await session.handleUtterance('Take Daniel.');
    await settle();

    assert.equal(store.getState().audio.musicLevel, 0, 'music faded once Sarah was off');
    assert.equal(store.getState().video.programCamera, 3);
    assert.ok(cueList().every((cue) => cue.state === 'completed'));
  });

  it('pauses cue execution while the show is held', async () => {
    const { store, session, cueList } = harness();
    await session.handleUtterance('Music out after Sarah.');
    await session.handleUtterance('Hold.');

    await session.handleUtterance('Take Daniel.');
    await settle();

    assert.equal(store.getState().cueEngine.held, true);
    assert.equal(cueList()[0]?.state, 'waiting', 'the cue waits rather than firing');
    assert.equal(store.getState().audio.musicLevel, 12, 'music must not fade during a hold');
  });

  it('resumes held cues once the hold is released', async () => {
    const { store, session } = harness();
    await session.handleUtterance('Music out after Sarah.');
    await session.handleUtterance('Hold.');
    await session.handleUtterance('Take Daniel.');
    await settle();

    await session.handleUtterance('Go ahead.');
    await settle();

    assert.equal(store.getState().audio.musicLevel, 0);
  });

  it('cancels pending cues on "cancel that"', async () => {
    const { store, session, cueList } = harness();
    await session.handleUtterance('Music out after Sarah, then take three.');

    await session.handleUtterance('Cancel that.');

    assert.ok(cueList().every((cue) => cue.state === 'cancelled'));

    await session.handleUtterance('Take Daniel.');
    await settle();

    assert.equal(store.getState().audio.musicLevel, 12, 'a cancelled cue must never fire');
    assert.equal(store.getState().video.programCamera, 3, 'from taking Daniel, not the cue');
  });

  it('reports how many cues are waiting', async () => {
    const { session, lastSpoken } = harness();
    await session.handleUtterance('Daniel next, music out after Sarah, then take three.');

    assert.equal(lastSpoken(), 'Two cued.');
  });

  it('runs a single command directly rather than cueing it', async () => {
    const { session, cueList, lastSpoken } = harness();
    await session.handleUtterance('Take three.');

    assert.equal(cueList().length, 0, 'one instruction is not a plan');
    assert.equal(lastSpoken(), 'Camera 3 live.');
  });
});
