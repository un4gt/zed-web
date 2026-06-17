import DOMPurify from 'dompurify';
import { marked } from 'marked';

marked.use({
  async: false,
  breaks: false,
  gfm: true,
});

export function renderMarkdownPreview(source) {
  const html = marked.parse(source || '');
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
  });
}
