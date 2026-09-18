import { ChevronLeft, ChevronRight, Play, Square } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import { cn } from '@/lib/cn';
import { useConsoleStore } from '@/store/console-store';

export function MediaPanel() {
  const media = useConsoleStore((s) => s.state?.media ?? null);
  const presentation = useConsoleStore((s) => s.state?.presentation ?? null);
  const invoke = useConsoleStore((s) => s.invoke);

  if (!media || !presentation) return null;

  const activeItem = media.library.find((item) => item.id === media.activeMediaId);
  const rolling = media.state === 'playing';
  const slideTitle = presentation.slideTitles[presentation.currentSlide - 1];

  return (
    <Panel title="Media & Slides" bodyClassName="space-y-2.5 p-3">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'h-1.5 w-1.5 shrink-0 rounded-full',
            rolling ? 'bg-program tally-live' : 'bg-console-600',
          )}
        />
        <span className="min-w-0 flex-1 truncate text-[12px] text-console-200">
          {activeItem?.title ?? 'Nothing rolling'}
        </span>
        <Button
          size="sm"
          variant="program"
          active={rolling}
          onClick={() => void invoke('play_video', {})}
        >
          <Play className="h-3 w-3" />
          Roll
        </Button>
        <Button size="sm" variant="default" disabled={!rolling} onClick={() => void invoke('stop_video', {})}>
          <Square className="h-3 w-3" />
        </Button>
      </div>

      <div className="flex items-center gap-2 border-t border-console-800 pt-2.5">
        <span className="font-mono text-[11px] text-console-500">
          {presentation.currentSlide}/{presentation.totalSlides}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12px] text-console-200">{slideTitle}</span>
        <Button
          size="icon"
          variant="outline"
          aria-label="Previous slide"
          onClick={() => void invoke('previous_slide', {})}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="outline"
          aria-label="Next slide"
          onClick={() => void invoke('next_slide', {})}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </Panel>
  );
}
