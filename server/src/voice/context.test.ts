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

describe('contextual production language', () => {
  it('resolves "take him" to the guest just prepared', async () => {
    const { store, session, lastSpoken } = harness();

    await session.handleUtterance('Daniel next.');
    await session.handleUtterance('Take him.');

    assert.equal(store.getState().speakers.activeGuestId, 'daniel');
    assert.equal(store.getState().video.programCamera, 3);
    assert.equal(lastSpoken(), 'Daniel live.');
  });

  it('resolves "take it" to the camera just readied', async () => {
    const { store, session } = harness();

    await session.handleUtterance('Ready three.');
    await session.handleUtterance('Take it.');

    assert.equal(store.getState().video.programCamera, 3);
  });

  it('falls back to what is in preview when nothing was named', async () => {
    const { store, session } = harness();
    const preview = store.getState().video.previewCamera;

    await session.handleUtterance('Take it.');

    assert.equal(store.getState().video.programCamera, preview);
  });

  it('treats "stay on her" as an instruction to change nothing', async () => {
    const { store, session, lastSpoken } = harness();
    const before = JSON.stringify({
      program: store.getState().video.programCamera,
      active: store.getState().speakers.activeGuestId,
      mics: store.getState().audio.microphones.map((m) => m.state),
    });

    await session.handleUtterance('Stay on her.');

    const after = JSON.stringify({
      program: store.getState().video.programCamera,
      active: store.getState().speakers.activeGuestId,
      mics: store.getState().audio.microphones.map((m) => m.state),
    });
    assert.equal(after, before);
    assert.equal(lastSpoken(), 'Staying on Sarah.');
  });

  it('keeps the reference current as the conversation moves on', async () => {
    const { store, session } = harness();

    await session.handleUtterance('Daniel next.');
    await session.handleUtterance('Actually Maya next.');
    await session.handleUtterance('Take her.');

    assert.equal(store.getState().speakers.activeGuestId, 'maya');
  });

  it('prefers the prepared speaker when no one was named this session', async () => {
    const { store, session } = harness();
    store.update((draft) => {
      draft.speakers.preparedGuestId = 'daniel';
    });

    await session.handleUtterance('Take him.');

    assert.equal(store.getState().speakers.activeGuestId, 'daniel');
  });

  it('asks who is meant when a pronoun cannot be resolved', async () => {
    const { store, session, lastSpoken } = harness();
    store.update((draft) => {
      draft.speakers.activeGuestId = null;
      draft.speakers.preparedGuestId = null;
    });

    await session.handleUtterance('Ready him.');

    assert.equal(lastSpoken(), 'Who do you mean?');
  });

  it('prefers an explicit camera number over a pronoun', async () => {
    const { store, session } = harness();

    await session.handleUtterance('Daniel next.');
    await session.handleUtterance('Take camera two.');

    assert.equal(store.getState().video.programCamera, 2);
    assert.equal(store.getState().speakers.activeGuestId, 'sarah', 'guest state must not follow');
  });
});
