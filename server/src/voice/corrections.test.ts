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
  return { store, sent, session, lastSpoken };
}

describe('mid-utterance correction', () => {
  it('"Take two—actually three" only ever puts camera three on program', async () => {
    const { store, session } = harness();

    await session.handleUtterance('Take two—actually three.');

    assert.equal(store.getState().video.programCamera, 3);
  });

  it('never routes camera two to program along the way', async () => {
    const { store, session } = harness();
    const programHistory: number[] = [];
    store.subscribe((state) => programHistory.push(state.video.programCamera));

    await session.handleUtterance('Take two, actually three');

    assert.ok(!programHistory.includes(2), 'camera two must not appear on program, even briefly');
    assert.equal(store.getState().video.programCamera, 3);
  });

  it('applies a correction to a ready command', async () => {
    const { store, session } = harness();

    await session.handleUtterance('Ready two—actually three.');

    assert.equal(store.getState().video.previewCamera, 3);
    assert.equal(store.getState().video.programCamera, 1, 'program must not move on a ready');
  });

  it('handles "no, make that" as a correction', async () => {
    const { store, session } = harness();

    await session.handleUtterance('Take Sarah, no make that Daniel');

    assert.equal(store.getState().speakers.activeGuestId, 'daniel');
  });

  it('runs the correction reliably five times in a row', async () => {
    for (let run = 0; run < 5; run += 1) {
      const { store, session } = harness();
      await session.handleUtterance('Take two—actually three.');
      assert.equal(store.getState().video.programCamera, 3, `run ${run + 1}`);
    }
  });
});

describe('metadata correction', () => {
  it('corrects a title mid-sentence and updates the graphic', async () => {
    const { store, session } = harness();
    await session.handleUtterance('Take Daniel.');

    await session.handleUtterance("Daniel's title is CTO—actually VP Product.");

    assert.equal(store.getState().graphics.current?.title, 'VP Product');
    assert.equal(store.getState().graphics.current?.name, 'Daniel Kim');
  });

  it('sets a title outright when there is no correction', async () => {
    const { store, session } = harness();

    await session.handleUtterance("Sarah's title is Founder");

    assert.equal(store.getState().speakers.guests.find((g) => g.id === 'sarah')?.title, 'Founder');
  });

  it('keeps known acronyms uppercase', async () => {
    const { store, session } = harness();

    await session.handleUtterance("Daniel's title is cto");

    assert.equal(store.getState().speakers.guests.find((g) => g.id === 'daniel')?.title, 'CTO');
  });
});

describe('hold and cancel', () => {
  it('stops speech, freezes pending cues and leaves program alone', async () => {
    const { store, sent, session } = harness();
    await session.handleUtterance('Daniel next.');
    const programBefore = store.getState().video.programCamera;

    await session.handleUtterance('Hold.');

    assert.equal(store.getState().cueEngine.held, true);
    assert.equal(store.getState().video.programCamera, programBefore);
    assert.equal(store.getState().video.previewCamera, 3, 'preview may stay prepared');
    assert.ok(sent.some((m) => m.type === 'voice:say' && m.text === 'Holding.'));
  });

  it('keeps conversational context through a hold', async () => {
    const { store, session } = harness();

    await session.handleUtterance('Daniel next.');
    await session.handleUtterance('Hold.');
    await session.handleUtterance('Take him.');

    assert.equal(store.getState().speakers.activeGuestId, 'daniel');
  });

  it('releases the hold on request', async () => {
    const { store, session, lastSpoken } = harness();
    await session.handleUtterance('Hold.');

    await session.handleUtterance('Go ahead.');

    assert.equal(store.getState().cueEngine.held, false);
    assert.equal(lastSpoken(), 'Back on.');
  });

  it('cancels the pending preparation on "cancel that"', async () => {
    const { store, session, lastSpoken } = harness();
    await session.handleUtterance('Daniel next.');
    assert.equal(store.getState().speakers.preparedGuestId, 'daniel');

    await session.handleUtterance('Cancel that.');
    const state = store.getState();

    assert.equal(state.speakers.preparedGuestId, null);
    assert.equal(state.graphics.prepared, null);
    assert.equal(state.show.runOfShow.find((s) => s.id === 'daniel-interview')?.status, 'upcoming');
    assert.equal(state.video.programCamera, 1, 'cancelling must not touch program');
    assert.equal(lastSpoken(), 'Cancelled.');
  });

  it('says so when there is nothing to cancel', async () => {
    const { session, lastSpoken } = harness();
    await session.handleUtterance('Cancel that.');
    assert.equal(lastSpoken(), 'Nothing pending.');
  });

  it('never lets a stale action execute after an interruption', async () => {
    const { store, session } = harness();
    const programBefore = store.getState().video.programCamera;

    const pending = session.handleUtterance('Take three.');
    session.interrupt('hold');
    await pending;

    assert.equal(store.getState().cueEngine.held, true);
    assert.ok(
      store.getState().video.programCamera === programBefore ||
        store.getState().video.programCamera === 3,
      'the action either completed before the interrupt or not at all',
    );
  });
});
