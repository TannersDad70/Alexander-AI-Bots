/* Alexander Bots — tiny offline markdown renderer (no dependencies).
 * Usage: window.renderMarkdown(md) -> safe HTML string.
 * Supports: fenced code blocks ```lang, inline `code`, headings #–###,
 * **bold**, *italic*, [links](url), - / * unordered lists, 1. numbered
 * lists, > blockquotes, --- hr, paragraphs.
 * HTML in the source is escaped first so raw tags can never execute. */

(function () {
  'use strict';

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Inline transforms run AFTER escaping, so `&lt;` sequences stay inert.
  function inline(src) {
    // Inline code — protect code spans from further transforms.
    var codeSpans = [];
    src = src.replace(/`([^`\n]+)`/g, function (_, c) {
      codeSpans.push(c);
      return '\u0000' + (codeSpans.length - 1) + '\u0000';
    });
    // Images ! [alt](url)
    src = src.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, function (_, alt, url) {
      return '<img src="' + url + '" alt="' + alt + '"/>';
    });
    // Links [text](url) — only http(s)/mailto, anything else is dropped.
    src = src.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (_, text, url) {
      if (/^(https?:\/\/|mailto:)/i.test(url)) {
        return '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + text + '</a>';
      }
      return text;
    });
    // Bold, then italic (avoid clashing with already-rendered bold).
    src = src.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    src = src.replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    // Wiki-links [[id]] -> clickable hook for the vault reader.
    src = src.replace(/\[\[([a-z0-9\-_]+)\]\]/gi, function (_, id) {
      return '<a href="#" data-wiki="' + id + '">' + id.replace(/-/g, ' ') + '</a>';
    });
    // Restore code spans.
    src = src.replace(/\u0000(\d+)\u0000/g, function (_, i) {
      return '<code>' + codeSpans[+i] + '</code>';
    });
    return src;
  }

  function renderMarkdown(md) {
    var lines = String(md == null ? '' : md).replace(/\r\n?/g, '\n').split('\n');
    var html = [];
    var inCode = false, codeLang = '', codeBuf = [];
    var inUl = false, inOl = false, inQuote = false;

    function closeLists() {
      if (inUl) { html.push('</ul>'); inUl = false; }
      if (inOl) { html.push('</ol>'); inOl = false; }
    }
    function closeQuote() {
      if (inQuote) { html.push('</blockquote>'); inQuote = false; }
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];

      // Fenced code blocks.
      var fence = line.match(/^```(\w*)\s*$/);
      if (fence) {
        if (inCode) {
          html.push('<pre><code' + (codeLang ? ' class="lang-' + codeLang + '"' : '') +
            '>' + codeBuf.join('\n') + '</code></pre>');
          inCode = false; codeLang = ''; codeBuf = [];
        } else {
          closeLists(); closeQuote();
          inCode = true; codeLang = fence[1] || '';
        }
        continue;
      }
      if (inCode) { codeBuf.push(escapeHtml(line)); continue; }

      var trimmed = line.trim();

      // Horizontal rule.
      if (/^(---|\*\*\*|___)\s*$/.test(trimmed)) {
        closeLists(); closeQuote();
        html.push('<hr/>');
        continue;
      }

      // Headings.
      var h = trimmed.match(/^(#{1,6})\s+(.*)$/);
      if (h) {
        closeLists(); closeQuote();
        var lvl = Math.min(h[1].length, 3);
        html.push('<h' + lvl + '>' + inline(escapeHtml(h[2])) + '</h' + lvl + '>');
        continue;
      }

      // Blockquote.
      var q = line.match(/^\s*>\s?(.*)$/);
      if (q) {
        closeLists();
        if (!inQuote) { html.push('<blockquote>'); inQuote = true; }
        var qt = q[1].trim();
        html.push(qt ? '<p>' + inline(escapeHtml(qt)) + '</p>' : '');
        continue;
      }
      closeQuote();

      // Unordered list.
      var ul = trimmed.match(/^[-*]\s+(.*)$/);
      if (ul) {
        if (inOl) { html.push('</ol>'); inOl = false; }
        if (!inUl) { html.push('<ul>'); inUl = true; }
        html.push('<li>' + inline(escapeHtml(ul[1])) + '</li>');
        continue;
      }

      // Ordered list.
      var ol = trimmed.match(/^\d+[.)]\s+(.*)$/);
      if (ol) {
        if (inUl) { html.push('</ul>'); inUl = false; }
        if (!inOl) { html.push('<ol>'); inOl = true; }
        html.push('<li>' + inline(escapeHtml(ol[1])) + '</li>');
        continue;
      }
      closeLists();

      // Blank line ends paragraphs.
      if (!trimmed) { continue; }

      html.push('<p>' + inline(escapeHtml(trimmed)) + '</p>');
    }

    closeLists(); closeQuote();
    if (inCode) {
      html.push('<pre><code' + (codeLang ? ' class="lang-' + codeLang + '"' : '') +
        '>' + codeBuf.join('\n') + '</code></pre>');
    }
    return html.join('\n');
  }

  window.renderMarkdown = renderMarkdown;
})();
