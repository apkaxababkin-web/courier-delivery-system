import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search } from 'lucide-react';

export type AppSelectValue = string | number | null;

export interface AppSelectOption {
  value: AppSelectValue;
  label: string;
  description?: string;
  disabled?: boolean;
}

interface AppSelectProps {
  value: AppSelectValue;
  options: AppSelectOption[];
  onChange: (value: AppSelectValue) => void;
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
  searchable?: boolean;
  compact?: boolean;
  className?: string;
  ariaLabel?: string;
}

type PanelPosition = {
  left: number;
  top?: number;
  bottom?: number;
  width: number;
  maxHeight: number;
};

export function AppSelect({
  value,
  options,
  onChange,
  placeholder = 'Не выбрано',
  emptyText = 'Нет вариантов',
  disabled = false,
  searchable,
  compact = false,
  className = '',
  ariaLabel,
}: AppSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [position, setPosition] = useState<PanelPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const selectedOption = options.find((option) => String(option.value) === String(value));
  const showSearch = searchable ?? options.length > 7;
  const filteredOptions = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('ru-RU');
    if (!query) return options;
    return options.filter((option) => `${option.label} ${option.description || ''}`.toLocaleLowerCase('ru-RU').includes(query));
  }, [options, search]);

  const updatePosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 12;
    const gap = 6;
    const preferredHeight = Math.min(360, Math.max(120, options.length * 44 + (showSearch ? 58 : 12)));
    const availableBelow = window.innerHeight - rect.bottom - viewportPadding - gap;
    const availableAbove = rect.top - viewportPadding - gap;
    const openAbove = availableBelow < Math.min(preferredHeight, 220) && availableAbove > availableBelow;
    const width = Math.min(Math.max(rect.width, 240), window.innerWidth - viewportPadding * 2);
    const left = Math.min(Math.max(rect.left, viewportPadding), window.innerWidth - width - viewportPadding);

    setPosition({
      left,
      width,
      maxHeight: Math.max(120, Math.min(preferredHeight, openAbove ? availableAbove : availableBelow)),
      ...(openAbove
        ? { bottom: window.innerHeight - rect.top + gap }
        : { top: rect.bottom + gap }),
    });
  };

  useEffect(() => {
    if (!open) return;

    updatePosition();
    const close = () => setOpen(false);
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      close();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    const handleScroll = (event: Event) => {
      if (panelRef.current?.contains(event.target as Node)) return;
      close();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', close);
    window.addEventListener('mig-close-floating-ui', close);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('mig-close-floating-ui', close);
    };
  }, [open, options.length, showSearch]);

  const toggle = () => {
    if (disabled) return;
    if (!open) {
      window.dispatchEvent(new Event('mig-close-floating-ui'));
      setSearch('');
    }
    setOpen((current) => !current);
  };

  const selectOption = (option: AppSelectOption) => {
    if (option.disabled) return;
    onChange(option.value);
    setOpen(false);
  };

  return (
    <div className={className}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={toggle}
        className={`flex w-full items-center justify-between gap-3 border border-slate-200 bg-slate-50 px-3.5 text-left text-sm outline-none transition hover:border-slate-300 hover:bg-white focus:border-slate-400 focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 ${compact ? 'h-10 rounded-xl' : 'h-11 rounded-2xl'}`}
      >
        <span className={`min-w-0 flex-1 truncate ${selectedOption ? 'text-slate-900' : 'text-slate-500'}`}>
          {selectedOption?.label || placeholder}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && position && createPortal(
        <div
          ref={panelRef}
          role="listbox"
          className="fixed z-[12000] overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-2xl shadow-slate-950/20"
          style={{ left: position.left, top: position.top, bottom: position.bottom, width: position.width }}
        >
          {showSearch && (
            <div className="relative mb-1.5">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                autoFocus
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Поиск..."
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none focus:border-slate-300 focus:bg-white"
              />
            </div>
          )}

          <div className="overflow-y-auto" style={{ maxHeight: position.maxHeight - (showSearch ? 48 : 0) }}>
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-slate-400">{emptyText}</div>
            ) : filteredOptions.map((option) => {
              const isSelected = String(option.value) === String(value);
              return (
                <button
                  key={`${typeof option.value}-${String(option.value)}`}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  disabled={option.disabled}
                  onClick={() => selectOption(option)}
                  className={`mt-0.5 flex w-full items-start gap-2 rounded-xl px-3 py-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-45 ${isSelected ? 'bg-slate-950 text-white' : 'text-slate-800 hover:bg-slate-100'}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{option.label}</span>
                    {option.description && <span className={`mt-0.5 block truncate text-xs ${isSelected ? 'text-white/65' : 'text-slate-400'}`}>{option.description}</span>}
                  </span>
                  {isSelected && <Check className="mt-0.5 h-4 w-4 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
