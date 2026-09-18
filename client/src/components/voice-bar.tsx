import type { VoiceActivity } from '@oncue/shared';
import { Mic, MicOff } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { useConsoleStore } from '@/store/console-store';

const ACTIVITY: Record<VoiceActivity, { label: string; dot: string; text: string }> = {
  idle: { label: 'Voice off', dot: 'bg-console-600', text: 'text-console-500' },
  listening: { label: 'Listening', dot: 'bg-ready', text: 'text-ready' },
  processing: { label: 'Working', dot: 'bg-signal tally-live', text: 'text-signal' },
  speaking: { label: 'Speaking', dot: 'bg-preview tally-live', text: 'text-preview' },
  interrupted: { label: 'Held', dot: 'bg-program', text: 'text-program' },
};

/**
 * The voice surface, deliberately kept to one strip: state, the latest thing
 * said, and a typed fallback. No orb, no chat log.
 */
export function VoiceBar() {
  const [draft, setDraft] = useState('');
  const activity = useConsoleStore((s) => s.voiceActivity);
  const listening = useConsoleStore((s) => s.voiceListening);
  const supported = useConsoleStore((s) => s.voiceSupported);
  const error = useConsoleStore((s) => s.voiceError);
  const transcript = useConsoleStore((s) => s.transcript);
  const startListening = useConsoleStore((s) => s.startListening);
  const stopListening = useConsoleStore((s) => s.stopListening);
  const sendUtterance = useConsoleStore((s) => s.sendUtterance);

  const latest = transcript[0];
  const style = ACTIVITY[activity];

  const submit = (event: FormEvent) => {
    event.preventDefault();
    sendUtterance(draft);
    setDraft('');
  };

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-t border-console-700 bg-console-900 px-3 py-2">
      <Button
        variant={listening ? 'program' : 'outline'}
        active={listening}
        size="md"
        onClick={listening ? stopListening : startListening}
        disabled={!supported}
        title={supported ? undefined : 'This browser cannot capture speech'}
      >
        {listening ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
        {listening ? 'Listening' : 'Listen'}
      </Button>

      <span className={cn('flex items-center gap-1.5 text-[11px]', style.text)}>
        <span className={cn('h-1.5 w-1.5 rounded-full', style.dot)} />
        {style.label}
      </span>

      <p className="min-w-0 flex-1 truncate text-[12px]">
        {error ? (
          <span className="text-program">{error}</span>
        ) : latest ? (
          <>
            <span className="label-caps mr-1.5">{latest.role === 'oncue' ? 'OnCue' : 'You'}</span>
            <span className={latest.partial ? 'text-console-500 italic' : 'text-console-200'}>
              {latest.text}
            </span>
          </>
        ) : (
          <span className="text-console-500">
            Say &ldquo;hello OnCue&rdquo; once you are listening, or type a command.
          </span>
        )}
      </p>

      <form onSubmit={submit} className="flex items-center gap-1.5">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Type a command…"
          aria-label="Type a command to OnCue"
          className="h-8 w-44 rounded border border-console-600 bg-console-850 px-2 text-[12px] text-console-200 placeholder:text-console-500 focus:border-signal focus:outline-none sm:w-60"
        />
        <Button type="submit" variant="default" size="md" disabled={!draft.trim()}>
          Send
        </Button>
      </form>
    </div>
  );
}
