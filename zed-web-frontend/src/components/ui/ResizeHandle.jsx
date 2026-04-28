function ResizeHandle({ direction, label, onPointerDown }) {
  const orientation = direction === 'vertical' ? 'vertical' : 'horizontal';

  return (
    <div
      aria-label={label}
      aria-orientation={orientation}
      className={`resize-handle resize-handle-${direction}`}
      onPointerDown={onPointerDown}
      role="separator"
      tabIndex={0}
    />
  );
}

export default ResizeHandle;
