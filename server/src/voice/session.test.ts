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
  return { store, sent, session };
}

const spoken = (sent: ServerMessage[]) =>
  sent.filter((m): m is Extract<ServerMessage, { type: 'voice:say' }> => m.type === 'voice:say');

describe('voice session', () => {
  it('answers a greeting briefly', async () => {
    const { sent, session } = harness();
    await session.handleUtterance('Hello OnCue');

    const replies = spoken(sent);
    assert.equal(replies.length, 1);
    assert.equal(replies[0]?.text, 'OnCue here.');
    assert.ok(replies[0]!.text.split(' ').length <= 4, 'replies must stay terse');
  });

  it('emits a transcript entry for the operator and for itself', async () => {
    const { sent, session } = harness();
    await session.handleUtterance('hello');

    const transcripts = sent.filter((m) => m.type === 'transcript');
    assert.equal(transcripts.length, 2);
  });

  it('stops speaking the moment the operator barges in', () => {
    const { sent, session, store } = harness();
    session.interrupt('barge_in');

    assert.ok(sent.some((m) => m.type === 'voice:stop'));
    assert.equal(store.getState().cueEngine.held, false, 'barge-in must not freeze the show');
  });

  it('holds the show when the operator says hold', async () => {
    const { sent, session, store } = harness();
    await session.handleUtterance('actually hold');

    assert.equal(store.getState().cueEngine.held, true);
    assert.equal(spoken(sent)[0]?.text, 'Holding.');
  });

  it('keeps the session usable after an interruption', async () => {
    const { sent, session } = harness();
    session.interrupt('barge_in');
    await session.handleUtterance('hello OnCue');

    assert.equal(spoken(sent).at(-1)?.text, 'OnCue here.');
  });

  it('drops a stale turn when a newer one starts', async () => {
    const { sent, session } = harness();
    const first = session.handleUtterance('hello OnCue');
    session.interrupt('barge_in');
    await first;

    assert.equal(spoken(sent).length, 0, 'the interrupted turn must not speak');
  });

  it('reports activity transitions', async () => {
    const { sent, session } = harness();
    session.setListening(true);
    await session.handleUtterance('hello');

    const activities = sent
      .filter((m): m is Extract<ServerMessage, { type: 'voice:activity' }> => m.type === 'voice:activity')
      .map((m) => m.activity);

    assert.deepEqual(activities, ['listening', 'processing', 'speaking']);
  });
});
