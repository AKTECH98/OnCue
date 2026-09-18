import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { TOOL_NAMES } from '@oncue/shared';

import { BroadcastStore } from '../state/store.js';

import { runTool } from './execute.js';
import { allTools } from './registry.js';

/** The operationally meaningful slice of state — stable across clock ticks. */
function snapshot(store: BroadcastStore) {
  const state = store.getState();
  return JSON.stringify({
    program: state.video.programCamera,
    preview: state.video.previewCamera,
    active: state.speakers.activeGuestId,
    prepared: state.speakers.preparedGuestId,
    mics: state.audio.microphones.map((m) => [m.id, m.state]),
    music: state.audio.musicLevel,
    graphics: state.graphics,
    segments: state.show.runOfShow.map((s) => [s.id, s.status]),
    slide: state.presentation.currentSlide,
    media: [state.media.activeMediaId, state.media.state],
    guests: state.speakers.guests.map((g) => [g.id, g.name, g.title]),
  });
}

const fresh = () => new BroadcastStore();

describe('tool registry', () => {
  it('registers exactly the declared tool set', () => {
    const registered = allTools()
      .map((tool) => tool.name)
      .sort();
    assert.deepEqual(registered, [...TOOL_NAMES].sort());
  });

  it('gives every tool a description and a risk class', () => {
    for (const tool of allTools()) {
      assert.ok(tool.description.length > 10, `${tool.name} needs a usable description`);
      assert.ok(['low', 'normal', 'high'].includes(tool.risk), `${tool.name} needs a risk class`);
    }
  });
});

describe('camera tools', () => {
  it('prepares a camera into preview without touching program', () => {
    const store = fresh();
    const before = store.getState().video.programCamera;
    const { outcome } = runTool(store, 'prepare_camera', { camera: 3 });

    assert.equal(outcome.ok, true);
    assert.equal(store.getState().video.previewCamera, 3);
    assert.equal(store.getState().video.programCamera, before);
  });

  it('takes a camera to program', () => {
    const store = fresh();
    const { outcome } = runTool(store, 'take_camera', { camera: 3 });

    assert.equal(outcome.ok, true);
    assert.equal(store.getState().video.programCamera, 3);
    assert.match(outcome.message, /live/i);
  });

  it('accepts a camera number sent as a string', () => {
    const store = fresh();
    const { outcome } = runTool(store, 'take_camera', { camera: '2' });

    assert.equal(outcome.ok, true);
    assert.equal(store.getState().video.programCamera, 2);
  });

  it('rejects camera seven and leaves state untouched', () => {
    const store = fresh();
    const before = snapshot(store);
    const { outcome } = runTool(store, 'take_camera', { camera: 7 });

    assert.equal(outcome.ok, false);
    assert.equal(outcome.message, 'There are four cameras.');
    assert.equal(snapshot(store), before);
  });

  it('reports a redundant take instead of re-cutting', () => {
    const store = fresh();
    const program = store.getState().video.programCamera;
    const { outcome } = runTool(store, 'take_camera', { camera: program });

    assert.equal(outcome.ok, true);
    assert.equal(outcome.redundant, true);
    assert.match(outcome.message, /already live/i);
  });
});

describe('guest tools', () => {
  it('prepares a guest across camera, mic, graphics and run of show', () => {
    const store = fresh();
    const { outcome } = runTool(store, 'prepare_guest', { guest: 'Daniel' });
    const state = store.getState();

    assert.equal(outcome.ok, true);
    assert.equal(state.video.previewCamera, 3);
    assert.equal(state.speakers.preparedGuestId, 'daniel');
    assert.equal(state.audio.microphones.find((m) => m.id === 3)?.state, 'ready');
    assert.equal(state.graphics.prepared?.name, 'Daniel Kim');
    assert.equal(
      state.show.runOfShow.find((s) => s.id === 'daniel-interview')?.status,
      'ready',
    );
    assert.equal(state.video.programCamera, 1, 'program must not move on prepare');
  });

  it('takes a guest as one compound orchestration', () => {
    const store = fresh();
    const { outcome } = runTool(store, 'take_guest', { guest: 'daniel' });
    const state = store.getState();

    assert.equal(outcome.ok, true);
    assert.equal(state.video.programCamera, 3);
    assert.equal(state.speakers.activeGuestId, 'daniel');
    assert.equal(state.audio.microphones.find((m) => m.id === 3)?.state, 'live');
    assert.equal(state.audio.microphones.find((m) => m.id === 1)?.state, 'muted');
    assert.equal(state.graphics.current?.name, 'Daniel Kim');
    assert.equal(state.show.runOfShow.find((s) => s.id === 'daniel-interview')?.status, 'live');
    assert.equal(state.show.runOfShow.find((s) => s.id === 'sarah-interview')?.status, 'completed');
    assert.ok((outcome.changes?.length ?? 0) >= 4, 'compound action should report its changes');
  });

  it('resolves guests by surname and by role alias', () => {
    for (const reference of ['Kim', 'vp product', 'DANIEL KIM']) {
      const store = fresh();
      const { outcome } = runTool(store, 'prepare_guest', { guest: reference });
      assert.equal(outcome.ok, true, `"${reference}" should resolve`);
      assert.equal(store.getState().speakers.preparedGuestId, 'daniel');
    }
  });

  it('rejects an unknown guest and leaves state untouched', () => {
    const store = fresh();
    const before = snapshot(store);
    const { outcome } = runTool(store, 'take_guest', { guest: 'John' });

    assert.equal(outcome.ok, false);
    assert.equal(outcome.errorCode, 'unknown_guest');
    assert.equal(snapshot(store), before);
  });

  it('rejects a missing guest argument', () => {
    const store = fresh();
    const before = snapshot(store);
    const { outcome } = runTool(store, 'take_guest', {});

    assert.equal(outcome.ok, false);
    assert.equal(outcome.errorCode, 'invalid_arguments');
    assert.equal(snapshot(store), before);
  });
});

describe('audio tools', () => {
  it('sets a microphone state', () => {
    const store = fresh();
    const { outcome } = runTool(store, 'set_microphone', { microphone: 3, state: 'live' });

    assert.equal(outcome.ok, true);
    assert.equal(store.getState().audio.microphones.find((m) => m.id === 3)?.state, 'live');
  });

  it('rejects an unknown microphone state', () => {
    const store = fresh();
    const before = snapshot(store);
    const { outcome } = runTool(store, 'set_microphone', { microphone: 1, state: 'loud' });

    assert.equal(outcome.ok, false);
    assert.equal(snapshot(store), before);
  });

  it('rejects a negative music level', () => {
    const store = fresh();
    const before = snapshot(store);
    const { outcome } = runTool(store, 'set_music', { level: -10 });

    assert.equal(outcome.ok, false);
    assert.match(outcome.message, /zero to one hundred/i);
    assert.equal(snapshot(store), before);
  });

  it('rejects a music level above one hundred', () => {
    const store = fresh();
    const { outcome } = runTool(store, 'set_music', { level: 120 });
    assert.equal(outcome.ok, false);
  });

  it('takes music out', () => {
    const store = fresh();
    const { outcome } = runTool(store, 'set_music', { level: 0 });

    assert.equal(outcome.ok, true);
    assert.equal(store.getState().audio.musicLevel, 0);
    assert.equal(outcome.message, 'Music out.');
  });
});

describe('graphics tools', () => {
  it('shows and hides a lower third', () => {
    const store = fresh();
    runTool(store, 'show_lower_third', { guest: 'maya' });
    assert.equal(store.getState().graphics.current?.name, 'Maya Patel');

    const { outcome } = runTool(store, 'hide_lower_third', {});
    assert.equal(outcome.ok, true);
    assert.equal(store.getState().graphics.current, null);
  });

  it('corrects a title and updates the graphic already on screen', () => {
    const store = fresh();
    runTool(store, 'take_guest', { guest: 'daniel' });
    runTool(store, 'update_lower_third', { guest: 'daniel', title: 'CTO' });
    assert.equal(store.getState().graphics.current?.title, 'CTO');

    const { outcome } = runTool(store, 'update_lower_third', {
      guest: 'daniel',
      title: 'VP Product',
    });

    assert.equal(outcome.ok, true);
    assert.equal(store.getState().graphics.current?.title, 'VP Product');
    assert.equal(store.getState().speakers.guests.find((g) => g.id === 'daniel')?.title, 'VP Product');
  });

  it('rejects an update with nothing to change', () => {
    const store = fresh();
    const before = snapshot(store);
    const { outcome } = runTool(store, 'update_lower_third', { guest: 'daniel' });

    assert.equal(outcome.ok, false);
    assert.equal(snapshot(store), before);
  });
});

describe('run of show tools', () => {
  it('skips a segment and buys back its scheduled time', () => {
    const store = fresh();
    const delayBefore = store.getState().show.delaySec;
    const { outcome } = runTool(store, 'skip_segment', { segment: 'product-video' });
    const state = store.getState();

    assert.equal(outcome.ok, true);
    assert.equal(state.show.runOfShow.find((s) => s.id === 'product-video')?.status, 'skipped');
    assert.equal(outcome.data?.savedSec, 150);
    assert.ok(state.show.delaySec < delayBefore, 'skipping should reduce the delay');
  });

  it('skips the next segment when none is named', () => {
    const store = fresh();
    const { outcome } = runTool(store, 'skip_segment', {});

    assert.equal(outcome.ok, true);
    assert.equal(store.getState().show.runOfShow.find((s) => s.id === 'product-video')?.status, 'skipped');
  });

  it('advances to the next segment', () => {
    const store = fresh();
    const { outcome } = runTool(store, 'advance_run_of_show', {});
    const state = store.getState();

    assert.equal(outcome.ok, true);
    assert.equal(state.show.currentSegmentId, 'product-video');
    assert.equal(state.show.runOfShow.find((s) => s.id === 'sarah-interview')?.status, 'completed');
  });

  it('refuses to prepare a segment that already played', () => {
    const store = fresh();
    const before = snapshot(store);
    const { outcome } = runTool(store, 'prepare_segment', { segment: 'opening' });

    assert.equal(outcome.ok, false);
    assert.equal(outcome.errorCode, 'segment_finished');
    assert.equal(snapshot(store), before);
  });

  it('rejects an unknown segment', () => {
    const store = fresh();
    const { outcome } = runTool(store, 'skip_segment', { segment: 'halftime show' });
    assert.equal(outcome.ok, false);
    assert.equal(outcome.errorCode, 'unknown_segment');
  });
});

describe('media and presentation tools', () => {
  it('rolls and stops the product video', () => {
    const store = fresh();
    const play = runTool(store, 'play_video', {});
    assert.equal(play.outcome.ok, true);
    assert.equal(store.getState().media.state, 'playing');

    const stop = runTool(store, 'stop_video', {});
    assert.equal(stop.outcome.ok, true);
    assert.equal(store.getState().media.state, 'stopped');
  });

  it('rejects an unknown clip', () => {
    const store = fresh();
    const { outcome } = runTool(store, 'play_video', { media: 'halftime' });
    assert.equal(outcome.ok, false);
    assert.equal(outcome.errorCode, 'unknown_media');
  });

  it('moves through slides and stops at the ends', () => {
    const store = fresh();
    runTool(store, 'next_slide', {});
    assert.equal(store.getState().presentation.currentSlide, 2);

    runTool(store, 'previous_slide', {});
    const atFirst = runTool(store, 'previous_slide', {});
    assert.equal(store.getState().presentation.currentSlide, 1);
    assert.equal(atFirst.outcome.redundant, true);
  });
});

describe('status and reset', () => {
  it('reads back the show status without changing anything', () => {
    const store = fresh();
    const before = snapshot(store);
    const { outcome } = runTool(store, 'get_show_status', {});

    assert.equal(outcome.ok, true);
    assert.equal(snapshot(store), before);
    assert.equal(outcome.data?.currentSegment, 'Sarah Interview');
    assert.equal(outcome.data?.nextSegment, 'Product Video');
  });

  it('restores the rehearsal state', () => {
    const store = fresh();
    const pristine = snapshot(store);

    runTool(store, 'take_guest', { guest: 'daniel' });
    runTool(store, 'set_music', { level: 0 });
    assert.notEqual(snapshot(store), pristine);

    runTool(store, 'reset_show', {});
    assert.equal(snapshot(store), pristine);
  });

  it('rejects an unregistered tool', () => {
    const store = fresh();
    const before = snapshot(store);
    const { outcome } = runTool(store, 'launch_fireworks', {});

    assert.equal(outcome.ok, false);
    assert.equal(outcome.errorCode, 'tool_not_registered');
    assert.equal(snapshot(store), before);
  });
});
