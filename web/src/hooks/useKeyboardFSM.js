import { useState } from "react";

/* ────────────────────────────────
   Constants
──────────────────────────────── */

const DEFAULT_IGNORED_KEYS = [
  "Enter", "Shift", "CapsLock", "Meta", "Alt", "Control",
  "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown",
];

const DEFAULT_IDLE_KEYS = ["Backspace", "Delete"];

export const FSMState = {
  IDLE: "IDLE",
  TRANSFORM_PENDING: "TRANSFORM_PENDING",
};

/* ────────────────────────────────
   Hook
──────────────────────────────── */

export function useKeyboardFSM(config) {
  const {
    transformations,
    ignoredKeys = DEFAULT_IGNORED_KEYS,
    idleKeys = DEFAULT_IDLE_KEYS,
  } = config;

  const [text, setText] = useState("");
  const [fsmState, setFSMState] = useState(FSMState.IDLE);

  // Permitted single-line arrow function
  const isTransformable = (char) => !!transformations[char];

  function transition(state, input) {
    const { currentKey, beforeCursor, afterCursor, prevChar } = input;

    if (ignoredKeys.includes(currentKey)) {
      return { state, output: null };
    }

    if (idleKeys.includes(currentKey)) {
      return { state: FSMState.IDLE, output: null };
    }

    const transformed = transformations[prevChar]?.[currentKey];
    if (transformed) {
      return {
        state: FSMState.IDLE,
        output: beforeCursor.slice(0, -1) + transformed + afterCursor,
      };
    }

    const output = beforeCursor + currentKey + afterCursor;
    const nextState = isTransformable(currentKey) ? FSMState.TRANSFORM_PENDING : FSMState.IDLE;

    return { state: nextState, output };
  }

  function handleKeyDown(e) {
    const { selectionStart, selectionEnd } = e.currentTarget;
    const input = {
      currentKey: e.key,
      beforeCursor: text.slice(0, selectionStart),
      afterCursor: text.slice(selectionEnd),
      prevChar: text.slice(selectionStart - 1, selectionStart),
    };

    const { state: nextState, output } = transition(fsmState, input);

    if (output !== null) {
      e.preventDefault();
      setText(output);
    }

    setFSMState(nextState);
  }

  return {
    text,
    setText,
    fsmState,
    handleKeyDown,
  };
}