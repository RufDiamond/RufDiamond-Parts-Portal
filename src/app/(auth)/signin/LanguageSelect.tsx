"use client";

import { useEffect, useId, useRef, useState } from "react";
import styles from "./LanguageSelect.module.css";

export interface LanguageOption {
  value: string;
  label: string;
}

export interface LanguageSelectProps {
  id: string;
  value: string;
  options: LanguageOption[];
  placeholder: string;
  onChange: (value: string) => void;
}

/**
 * The language field on the login screen, drawn rather than delegated.
 *
 * A native `<select>` cannot be styled past its border: the closed control
 * keeps the platform's own arrow and the open list is painted by the operating
 * system, so on this screen it read as a stray macOS widget in the middle of
 * the deck's artwork. This is the same control built from a button and a
 * listbox, which the stylesheet can reach.
 *
 * Focus stays on the button throughout and the highlighted row is named by
 * `aria-activedescendant`, which is the combobox pattern a screen reader
 * expects — moving real focus into the list instead would make the control
 * announce itself as a menu the user had travelled into.
 */
export function LanguageSelect({
  id,
  value,
  options,
  placeholder,
  onChange,
}: LanguageSelectProps) {
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  /* Which row the keyboard is on. -1 while nothing has been reached yet. */
  const [active, setActive] = useState(-1);

  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = selectedIndex === -1 ? null : options[selectedIndex];

  /*
   * The screen clips its own overflow so the whole login fits one window, so a
   * list that opens downward near the bottom edge would be cut off rather than
   * scrolled to. Measure the room actually left and flip upward when there
   * isn't any.
   */
  function openList(from: number) {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      const needed = Math.min(options.length, 6) * rect.height + 16;
      setDropUp(
        window.innerHeight - rect.bottom < needed && rect.top > needed,
      );
    }
    setActive(from);
    setOpen(true);
  }

  function choose(index: number) {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    setOpen(false);
    buttonRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function onKeyDown(event: React.KeyboardEvent) {
    const last = options.length - 1;

    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        openList(selectedIndex === -1 ? 0 : selectedIndex);
      }
      return;
    }

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActive((current) => (current >= last ? 0 : current + 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActive((current) => (current <= 0 ? last : current - 1));
        break;
      case "Home":
        event.preventDefault();
        setActive(0);
        break;
      case "End":
        event.preventDefault();
        setActive(last);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        choose(active);
        break;
      case "Escape":
        event.preventDefault();
        setOpen(false);
        break;
      case "Tab":
        /* Let focus leave, but do not leave the list hanging open behind it. */
        setOpen(false);
        break;
    }
  }

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        id={id}
        ref={buttonRef}
        className={`${styles.control}${selected ? "" : ` ${styles.unset}`}`}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={
          open && active >= 0 ? `${listId}-${active}` : undefined
        }
        onClick={() =>
          open ? setOpen(false) : openList(selectedIndex === -1 ? 0 : selectedIndex)
        }
        onKeyDown={onKeyDown}
      >
        <span className={styles.value}>{selected ? selected.label : placeholder}</span>
        <span className={styles.chevron} aria-hidden="true" />
      </button>

      {open && (
        <ul
          className={`${styles.menu}${dropUp ? ` ${styles.menuUp}` : ""}`}
          id={listId}
          role="listbox"
          aria-label="Language"
        >
          {options.map((option, index) => (
            <li
              key={option.value}
              id={`${listId}-${index}`}
              className={`${styles.option}${index === active ? ` ${styles.active}` : ""}`}
              role="option"
              aria-selected={option.value === value}
              /*
               * Selecting on pointerdown would race the outside-click listener
               * above, which also fires on pointerdown. Click is the safe half
               * of the pair; the listener sees its own container and stands
               * down.
               */
              onClick={() => choose(index)}
              onPointerEnter={() => setActive(index)}
            >
              {option.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
