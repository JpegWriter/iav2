import { cn, getScoreColor, getScoreBgColor } from '@/lib/utils';

interface ScoreCircleProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  label?: string;
}

export function ScoreCircle({ score, size = 'md', showLabel = false, label }: ScoreCircleProps) {
  const sizes = {
    sm: { container: 'w-10 h-10', text: 'text-sm', label: 'text-xs' },
    md: { container: 'w-14 h-14', text: 'text-lg', label: 'text-xs' },
    lg: { container: 'w-20 h-20', text: 'text-2xl', label: 'text-sm' },
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={cn(
          'rounded-full flex items-center justify-center font-bold',
          sizes[size].container,
          sizes[size].text,
          getScoreBgColor(score),
          getScoreColor(score)
        )}
      >
        {score}
      </div>
      {showLabel && label && (
        <span className={cn('text-slate-500', sizes[size].label)}>{label}</span>
      )}
    </div>
  );
}

interface ScoreBarProps {
  score: number;
  label: string;
  maxScore?: number;
}

export function ScoreBar({ score, label, maxScore = 100 }: ScoreBarProps) {
  const percentage = (score / maxScore) * 100;

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-slate-600">{label}</span>
        <span className={cn('font-medium', getScoreColor(score))}>{score}%</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', {
            'bg-green-500': score >= 80,
            'bg-lime-500': score >= 60 && score < 80,
            'bg-amber-500': score >= 40 && score < 60,
            'bg-red-500': score < 40,
          })}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
