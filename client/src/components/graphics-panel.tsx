import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import { useConsoleStore } from '@/store/console-store';

export function GraphicsPanel() {
  const current = useConsoleStore((s) => s.state?.graphics.current ?? null);
  const prepared = useConsoleStore((s) => s.state?.graphics.prepared ?? null);
  const guests = useConsoleStore((s) => s.state?.speakers.guests ?? []);
  const invoke = useConsoleStore((s) => s.invoke);

  return (
    <Panel
      title="Graphics"
      action={
        <Button
          size="sm"
          variant="ghost"
          disabled={!current}
          onClick={() => void invoke('hide_lower_third')}
        >
          Clear
        </Button>
      }
      bodyClassName="space-y-2 p-3"
    >
      <Slot label="On air" tone="program" name={current?.name} detail={detail(current)} />
      <Slot label="Prepared" tone="preview" name={prepared?.name} detail={detail(prepared)} />

      <div className="flex flex-wrap gap-1 border-t border-console-800 pt-2">
        {guests.map((guest) => (
          <Button
            key={guest.id}
            size="sm"
            variant="outline"
            active={current?.guestId === guest.id}
            onClick={() => void invoke('show_lower_third', { guest: guest.id })}
          >
            {guest.name.split(' ')[0]}
          </Button>
        ))}
      </div>
    </Panel>
  );
}

function detail(lowerThird: { title: string; organization: string } | null): string | undefined {
  return lowerThird ? `${lowerThird.title} · ${lowerThird.organization}` : undefined;
}

function Slot({
  label,
  tone,
  name,
  detail: detailText,
}: {
  label: string;
  tone: 'program' | 'preview';
  name?: string;
  detail?: string;
}) {
  return (
    <div
      className={`rounded border-l-2 bg-console-850 px-2.5 py-1.5 ${
        tone === 'program' ? 'border-program' : 'border-preview'
      }`}
    >
      <p className="label-caps">{label}</p>
      {name ? (
        <>
          <p className="text-[13px] leading-tight text-console-200">{name}</p>
          <p className="text-[11px] leading-tight text-console-500">{detailText}</p>
        </>
      ) : (
        <p className="text-[12px] text-console-500">Empty</p>
      )}
    </div>
  );
}
