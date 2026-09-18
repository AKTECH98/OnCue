import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { BroadcastState, ServerMessage } from '@oncue/shared';

import { CueEngine } from '../cues/engine.js';
import { createOrchestrator } from '../orchestration/orchestrator.js';
import { BroadcastStore } from '../state/store.js';

import { VoiceSession } from './session.js';

function harness() {
  const store = new BroadcastStore();
  const orchestrate = createOrchestrator(store);
  const sent: ServerMessage[] = [];
  const session = new VoiceSession({
    store,
    orchestrate,
    cues: new CueEngine(store, orchestrate),
    send: (message) => sent.push(message),
  });
  return { store, session };
}

/** The distinct areas of production a single instruction touched. */
function changedAspects(before: BroadcastState, after: BroadcastState): string[] {
  const aspects: string[] = [];
  if (before.video.programCamera !== after.video.programCamera) aspects.push('program camera');
  if (before.speakers.activeGuestId !== after.speakers.activeGuestId) aspects.push('active speaker');
  if (
    JSON.stringify(before.audio.microphones.map((m) => m.state)) !==
    JSON.stringify(after.audio.microphones.map((m) => m.state))
  ) {
    aspects.push('microphones');
  }
  if (JSON.stringify(before.graphics) !== JSON.stringify(after.graphics)) aspects.push('graphics');
  if (
    JSON.stringify(before.show.runOfShow.map((s) => s.status)) !==
    JSON.stringify(after.show.runOfShow.map((s) => s.status))
  ) {
    aspects.push('run of show');
  }
  if (before.audio.musicLevel !== after.audio.musicLevel) aspects.push('music');
  if (before.media.state !== after.media.state) aspects.push('media');
  return aspects;
}

describe('compound orchestration', () => {
  it('"Take Daniel" changes at least four aspects of production', async () => {
    const { store, session } = harness();
    const before = structuredClone(store.getState());

    await session.handleUtterance('Take Daniel.');

    const aspects = changedAspects(before, store.getState());
    assert.ok(
      aspects.length >= 4,
      `expected four or more aspects to change, got: ${aspects.join(', ')}`,
    );
    assert.ok(aspects.includes('program camera'));
    assert.ok(aspects.includes('microphones'));
    assert.ok(aspects.includes('graphics'));
    assert.ok(aspects.includes('run of show'));
  });

  it('"Move to Q and A" coordinates the show, cameras, mics and graphics', async () => {
    const { store, session } = harness();
    const before = structuredClone(store.getState());

    await session.handleUtterance('Move to Q and A.');
    const state = store.getState();

    assert.equal(state.show.currentSegmentId, 'qa');
    assert.equal(state.video.programCamera, 2, 'host camera');
    assert.equal(state.speakers.activeGuestId, 'maya');
    assert.equal(state.graphics.current?.name, 'Maya Patel');
    assert.equal(
      state.audio.microphones.find((m) => m.id === 2)?.state,
      'live',
      'host mic live',
    );
    assert.equal(
      state.audio.microphones.find((m) => m.id === 3)?.state,
      'ready',
      'guests must be able to answer',
    );
    assert.ok(changedAspects(before, state).length >= 4);
  });

  it('"Go to break" rolls the bumper, closes mics and readies what comes back', async () => {
    const { store, session } = harness();

    await session.handleUtterance('Go to break.');
    const state = store.getState();

    assert.equal(state.media.activeMediaId, 'break-bumper');
    assert.equal(state.media.state, 'playing');
    assert.ok(state.audio.microphones.every((m) => m.state === 'muted'));
    assert.equal(state.audio.musicLevel, 45);
    assert.equal(state.graphics.current, null);
    assert.ok(state.show.runOfShow.some((s) => s.status === 'ready'));
  });

  it('"Skip the video" drops the right segment', async () => {
    const { store, session } = harness();

    await session.handleUtterance('Skip the video.');

    assert.equal(store.getState().show.runOfShow.find((s) => s.id === 'product-video')?.status, 'skipped');
  });

  it('reports the coordinated changes it made', async () => {
    const { store, session } = harness();

    await session.handleUtterance('Take Daniel.');

    const changes = store.getState().system.latestToolResult;
    assert.equal(changes?.ok, true);
    assert.equal(changes?.tool, 'take_guest');
  });

  it('does not mistake a camera number for a segment', async () => {
    const { store, session } = harness();

    await session.handleUtterance('Go to three.');

    assert.equal(store.getState().video.programCamera, 3);
    assert.equal(store.getState().show.currentSegmentId, 'sarah-interview');
  });
});
