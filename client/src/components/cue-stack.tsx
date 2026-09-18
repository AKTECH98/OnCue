import type { Cue, CueState } from '@oncue/shared';

import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import { cn } from '@/lib/cn';
import { useConsoleStore } from '@/store/console-store';

const GROUPS: { key: string; label: string; states: CueState[] }[] = [
  { key: 'ready', label: 'Ready', states: ['ready', 'executing'] },
  { key: 'waiting', label: 'Waiting', states: ['waiting'] },
  { key: 'done', label: 'Done', states: ['completed', 'cancelled'] },
];

/**
 * The visible contract between what the operator said and what OnCue intends
 * to do. Pending actions should be understandable without reading a transcript.
 */
export function CueStack() {
  const cues = useConsoleStore((s) => s.state?.cueEngine.cues ?? []);
  const held = useConsoleStore((s) => s.state?.cueEngine.held ?? false);
  const invoke = useConsoleStore((s) => s.invoke);

  const pending = cues.filter((cue) => cue.state === 'ready' || cue.state === 'waiting');

  return (
    <Panel
      title="Cue Stack"
      action={
        <div className="flex items-center gap-1.5">
          {held ? (
            <span className="text-[9px] font-semibold uppercase tracking-wider text-preview">
              Held
            </span>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            disabled={pending.length === 0}
            onClick={() => void invoke('cancel_pending')}
          >
            Cancel
          </Button>
        </div>
      }
      bodyClassName="p-2"
    >
      {cues.length === 0 ? (
        <p className="px-1 py-2 text-[12px] text-console-500">
          Nothing cued. Multi-part instructions land here — try &ldquo;Daniel next, music out
          after Sarah, then take three.&rdquo;
        </p>
      ) : (
        <div className="space-y-2.5">
          {GROUPS.map((group) => {
            const groupCues = cues.filter((cue) => group.states.includes(cue.state));
            if (groupCues.length === 0) return null;

            return (
              <section key={group.key}>
                <h3 className="label-caps mb-1 px-1">{group.label}</h3>
                <ul className="space-y-1">
                  {groupCues.map((cue) => (
                    <CueRow key={cue.id} cue={cue} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

const STATE_STYLE: Record<CueState, { bar: string; text: string }> = {
  ready: { bar: 'bg-ready', text: 'text-console-200' },
  waiting: { bar: 'bg-preview', text: 'text-console-200' },
  executing: { bar: 'bg-signal tally-live', text: 'text-white' },
  completed: { bar: 'bg-console-600', text: 'text-console-500' },
  cancelled: { bar: 'bg-console-700', text: 'text-console-500 line-through' },
};

function CueRow({ cue }: { cue: Cue }) {
  const style = STATE_STYLE[cue.state];

  return (
    <li className="flex gap-2 rounded bg-console-850 px-2 py-1.5">
      <span className={cn('w-0.5 shrink-0 rounded-full', style.bar)} />
      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-[12px] leading-tight', style.text)}>{cue.description}</p>
        {cue.trigger.type !== 'immediate' ? (
          <p className="truncate text-[10px] text-preview/80">{cue.trigger.description}</p>
        ) : null}
        {cue.note ? <p className="truncate text-[10px] text-console-500">{cue.note}</p> : null}
      </div>
    </li>
  );
}
