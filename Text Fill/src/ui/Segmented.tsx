import { useRef, type CSSProperties, type ReactNode } from 'react';

interface Option<T extends string> { value: T; label: string; content?: ReactNode; width: number }
interface Props<T extends string> {
  label: string;
  value: T;
  options: readonly Option<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
}

export default function Segmented<T extends string>({ label, value, options, onChange, disabled }: Props<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(0, options.findIndex(option => option.value === value));
  const offset = options.slice(0, index).reduce((sum, option) => sum + option.width + 2, 0);
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      <span className="segment-indicator" aria-hidden="true" style={{ width: options[index].width, transform: `translateX(${offset}px)` }} />
      {options.map((option, i) => (
        <button key={option.value} type="button" role="radio" aria-checked={value === option.value}
          ref={element => { refs.current[i] = element; }}
          aria-label={option.label} title={option.label} tabIndex={i === index ? 0 : -1}
          disabled={disabled} style={{ '--segment-width': `${option.width}px` } as CSSProperties}
          onClick={() => onChange(option.value)}
          onKeyDown={event => {
            let next = index;
            if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % options.length;
            else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index + options.length - 1) % options.length;
            else if (event.key === 'Home') next = 0;
            else if (event.key === 'End') next = options.length - 1;
            else return;
            event.preventDefault(); onChange(options[next].value); refs.current[next]?.focus();
          }}>
          {option.content ?? option.label}
        </button>
      ))}
    </div>
  );
}
