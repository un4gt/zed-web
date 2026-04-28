function FileIcon({ className = '', label = '', src }) {
  const preserveColors = /^(?:data:|blob:)/i.test(src ?? '');

  return (
    <span
      aria-hidden={label ? undefined : true}
      aria-label={label || undefined}
      className={`file-icon ${preserveColors ? 'file-icon-image' : ''} ${className}`.trim()}
      role={label ? 'img' : undefined}
      style={preserveColors ? { '--file-icon-image': `url("${src}")` } : { '--file-icon-url': `url("${src}")` }}
    />
  );
}

export default FileIcon;
