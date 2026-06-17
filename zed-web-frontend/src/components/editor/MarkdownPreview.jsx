import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { renderMarkdownPreview } from '../../lib/markdownPreview';
import { bufferRuntime } from '../../store/bufferRuntime';

function MarkdownPreview({ path }) {
  const [content, setContent] = useState(() => bufferRuntime.getContent(path));
  const deferredContent = useDeferredValue(content);
  const html = useMemo(() => renderMarkdownPreview(deferredContent), [deferredContent]);

  useEffect(() => {
    setContent(bufferRuntime.getContent(path));
    return bufferRuntime.subscribe(path, ({ content: nextContent }) => {
      setContent(nextContent);
    });
  }, [path]);

  return (
    <article
      className="markdown-preview"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export default MarkdownPreview;
