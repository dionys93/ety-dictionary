// CustomTextArea.jsx
import React from 'react';

export default function CustomTextArea({
  value,
  onChange,
  onKeyDown,
  placeholder = '',
  style = {},
  dir = 'ltr',
}) {

  function handleKeyDown(e) {
    const result = onKeyDown(e, value);

    if (result && result.preventDefault) {
      e.preventDefault();
    }

    if (result && result.newValue !== undefined) {
      const syntheticEvent = { target: { value: result.newValue } };
      onChange(syntheticEvent);

      if (result.handled) {
        return;
      }
    } else if (result && result.handled) {
      return;
    }
  }

  const handleChange = (e) => onChange(e);

  return (
    <textarea
      value={value}
      onKeyDown={handleKeyDown}
      onChange={handleChange}
      placeholder={placeholder}
      style={{ fontFamily: 'Noto Sans, Arial, sans-serif', ...style }}
      dir={dir}
    />
  );
}