import DOMPurify from 'dompurify';
import hljs from 'highlight.js';

const escapeHtml = (code: string): string =>
  code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const highlightCodeHtml = (code: string, language: string): string => {
  if (language && hljs.getLanguage(language)) {
    try {
      const highlighted = hljs.highlight(code, { language, ignoreIllegals: true }).value;
      return typeof window !== 'undefined' ? DOMPurify.sanitize(highlighted) : highlighted;
    } catch {
      // Fallback to escaped text
    }
  }
  return escapeHtml(code);
};
