import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { IconCheck, IconChevronDown, IconSearch } from "@tabler/icons-react";
import { useI18n } from "@/hooks/useI18n";
import styles from "./SelectionControl.module.css";

export interface SelectOption {
  value: string;
  label: string;
  detail?: string;
  disabled?: boolean;
}

/** A discrete, searchable choice. Typing never changes the saved value. */
export function SearchSelect({ label, value, options, onChange, disabled = false, hint }: {
  label: string;
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  hint?: string;
}) {
  const { t } = useI18n();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);
  const selected = options.find(option => option.value === value);
  const visible = options.filter(option => `${option.label} ${option.detail ?? ""} ${option.value}`.toLocaleLowerCase().includes(query.toLocaleLowerCase().trim()));
  const close = () => { popup.current?.hidePopover(); setOpen(false); };
  const show = () => {
    if (disabled) return;
    setQuery("");
    setActive(-1);
    setOpen(true);
  };
  useLayoutEffect(() => {
    if (!open || !input.current || !popup.current) return;
    const position = () => {
      const field = input.current?.getBoundingClientRect();
      const surface = popup.current;
      if (!field || !surface) return;
      const viewport = window.visualViewport;
      const height = viewport?.height ?? window.innerHeight;
      const offset = viewport?.offsetTop ?? 0;
      const below = height + offset - field.bottom - 12;
      const above = field.top - offset - 12;
      const upwards = below < 200 && above > below;
      const available = Math.max(80, Math.min(320, upwards ? above : below));
      surface.style.left = `${Math.max(8, Math.min(field.left, window.innerWidth - field.width - 8))}px`;
      surface.style.width = `${Math.min(field.width, window.innerWidth - 16)}px`;
      surface.style.maxHeight = `${available}px`;
      surface.style.top = upwards ? "auto" : `${field.bottom + 6}px`;
      surface.style.bottom = upwards ? `${window.innerHeight - field.top + 6}px` : "auto";
    };
    position();
    popup.current.showPopover();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    window.visualViewport?.addEventListener("resize", position);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      window.visualViewport?.removeEventListener("resize", position);
    };
  }, [open]);
  useEffect(() => { if (disabled) close(); }, [disabled]);
  useEffect(() => {
    if (active >= 0) document.getElementById(`${id}-option-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, id]);
  const choose = (option: SelectOption) => {
    if (option.disabled) return;
    onChange(option.value);
    close();
  };
  return <div className={styles.field}>
    <label htmlFor={id}>{label}</label>
    <div className={styles.control} data-open={open || undefined}>
      <IconSearch size={17} aria-hidden="true" />
      <input ref={input} id={id} role="combobox" aria-expanded={open} aria-controls={`${id}-list`}
        aria-autocomplete="list" aria-activedescendant={open && active >= 0 && visible[active] ? `${id}-option-${active}` : undefined}
        aria-describedby={hint ? `${id}-hint` : undefined} autoComplete="off" disabled={disabled}
        title={selected?.detail ?? selected?.label ?? value} value={open ? query : selected?.label ?? value}
        placeholder={t("design.searchChoices")} onClick={() => { if (!open) show(); }}
        onChange={event => { setQuery(event.target.value); setActive(-1); setOpen(true); }}
        onBlur={event => { if (!popup.current?.contains(event.relatedTarget)) close(); }}
        onKeyDown={event => {
          if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); close(); }
          else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) { show(); return; }
            const step = event.key === "ArrowDown" ? 1 : -1;
            let next = active;
            for (let n = 0; n < visible.length; n++) {
              next = (next + step + visible.length) % visible.length;
              if (!visible[next]?.disabled) { setActive(next); break; }
            }
          } else if (event.key === "Enter" && open) {
            event.preventDefault();
            if (visible[active]) choose(visible[active]);
          } else if (event.key === "Tab") close();
        }} />
      <IconChevronDown size={16} aria-hidden="true" />
    </div>
    {hint && <p id={`${id}-hint`} className={styles.hint}>{hint}</p>}
    <div ref={popup} popover="auto" className={styles.popup} onToggle={event => { if (event.newState === "closed") setOpen(false); }}>
      <div id={`${id}-list`} role="listbox" aria-label={label}>
        {visible.map((option, index) => <div key={option.value} id={`${id}-option-${index}`} role="option"
          aria-selected={value === option.value} aria-disabled={option.disabled || undefined}
          data-active={index === active || undefined} className={styles.option}
          onMouseDown={event => event.preventDefault()} onClick={() => choose(option)}>
          <span><strong>{option.label}</strong>{option.detail && <small>{option.detail}</small>}</span>
          {value === option.value && <IconCheck size={18} aria-hidden="true" />}
        </div>)}
      </div>
      {visible.length === 0 && <p role="status" className={styles.empty}>{t("design.noMatches")}</p>}
    </div>
  </div>;
}
