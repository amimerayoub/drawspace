import React, { useState } from 'react';
import { Copy, Check, ExternalLink, Sparkles, HelpCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

interface BlogMarkdownProps {
  content: string;
  pathFor?: (path: string) => string;
}

export interface HeadingItem {
  id: string;
  text: string;
  level: number;
}

export function extractHeadings(content: string): HeadingItem[] {
  const headings: HeadingItem[] = [];
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('## ')) {
      const raw = trimmed.replace(/^##\s+/, '').replace(/\{#[^}]+\}/, '').trim();
      const customIdMatch = trimmed.match(/\{#([^}]+)\}/);
      const id = customIdMatch ? customIdMatch[1] : slugify(raw);
      headings.push({ id, text: raw, level: 2 });
    } else if (trimmed.startsWith('### ')) {
      const raw = trimmed.replace(/^###\s+/, '').replace(/\{#[^}]+\}/, '').trim();
      const customIdMatch = trimmed.match(/\{#([^}]+)\}/);
      const id = customIdMatch ? customIdMatch[1] : slugify(raw);
      headings.push({ id, text: raw, level: 3 });
    }
  }
  return headings;
}

export function extractFaqs(content: string): Array<{ question: string; answer: string }> {
  const faqs: Array<{ question: string; answer: string }> = [];
  const lines = content.split('\n');
  let inFaq = false;
  let currentQ = '';
  let currentA: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.match(/^##\s+.*Frequently Asked Questions/i)) {
      inFaq = true;
      continue;
    }
    if (inFaq && line.startsWith('## ') && !line.match(/Frequently Asked Questions/i)) {
      if (currentQ && currentA.length > 0) {
        faqs.push({ question: currentQ, answer: currentA.join(' ').trim() });
      }
      break;
    }
    if (inFaq) {
      if (line.startsWith('### ')) {
        if (currentQ && currentA.length > 0) {
          faqs.push({ question: currentQ, answer: currentA.join(' ').trim() });
          currentA = [];
        }
        currentQ = line.replace(/^###\s+/, '').replace(/\{#[^}]+\}/, '').trim();
      } else if (currentQ && line && !line.startsWith('---')) {
        currentA.push(line);
      }
    }
  }
  if (inFaq && currentQ && currentA.length > 0) {
    faqs.push({ question: currentQ, answer: currentA.join(' ').trim() });
  }
  return faqs;
}

function slugify(text: string): string {
  return text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Stored markdown is rendered into real anchors, so the href scheme is an
// injection surface: javascript:, data: and vbscript: URLs all execute.
const SAFE_EXTERNAL_HREF = /^(?:https?:|mailto:)/i;

// A leading "//" is a protocol-relative external URL, not a site route.
const DRAWSPACE_HOST = /^https?:\/\/(?:www\.)?drawspace\.cloud(?=\/|$)/i;
const isInternalHref = (href: string): boolean =>
  (href.startsWith('/') && !href.startsWith('//')) || DRAWSPACE_HOST.test(href);

function formatInline(text: string, pathFor: (path: string) => string = (p) => p): React.ReactNode[] {
  // Regex for links [text](url), bold **text**, code `code`, italic *text*
  const tokens: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining) {
    // 1. Link [text](url)
    const linkMatch = remaining.match(/\[([^\]]+)\]\(([^)]+)\)/);
    // 2. Bold **text**
    const boldMatch = remaining.match(/\*\*([^*]+)\*\*/);
    // 3. Inline code `code`
    const codeMatch = remaining.match(/`([^`]+)`/);
    // 4. Italic *text*
    const italicMatch = remaining.match(/\*([^*]+)\*/);

    let firstMatchIndex = remaining.length;
    let matchType: 'link' | 'bold' | 'code' | 'italic' | null = null;
    let matchResult: RegExpMatchArray | null = null;

    if (linkMatch && linkMatch.index !== undefined && linkMatch.index < firstMatchIndex) {
      firstMatchIndex = linkMatch.index;
      matchType = 'link';
      matchResult = linkMatch;
    }
    if (boldMatch && boldMatch.index !== undefined && boldMatch.index < firstMatchIndex) {
      firstMatchIndex = boldMatch.index;
      matchType = 'bold';
      matchResult = boldMatch;
    }
    if (codeMatch && codeMatch.index !== undefined && codeMatch.index < firstMatchIndex) {
      firstMatchIndex = codeMatch.index;
      matchType = 'code';
      matchResult = codeMatch;
    }
    if (italicMatch && italicMatch.index !== undefined && italicMatch.index < firstMatchIndex) {
      firstMatchIndex = italicMatch.index;
      matchType = 'italic';
      matchResult = italicMatch;
    }

    if (!matchType || !matchResult || matchResult.index === undefined) {
      tokens.push(remaining);
      break;
    }

    if (matchResult.index > 0) {
      tokens.push(remaining.substring(0, matchResult.index));
    }

    if (matchType === 'link') {
      const label = matchResult[1];
      const href = matchResult[2].trim();
      if (isInternalHref(href)) {
        const routePath = href.replace(DRAWSPACE_HOST, '') || '/';
        tokens.push(
          <Link key={key++} to={pathFor(routePath)} className="blog-link accent">
            {label}
          </Link>
        );
      } else if (SAFE_EXTERNAL_HREF.test(href)) {
        tokens.push(
          <a key={key++} href={href} target="_blank" rel="noopener noreferrer" className="blog-link accent">
            {label} <ExternalLink size={11} className="inline-icon" />
          </a>
        );
      } else {
        tokens.push(<React.Fragment key={key++}>{label}</React.Fragment>);
      }
    } else if (matchType === 'bold') {
      tokens.push(<strong key={key++} className="blog-bold">{matchResult[1]}</strong>);
    } else if (matchType === 'code') {
      tokens.push(<code key={key++} className="blog-inline-code">{matchResult[1]}</code>);
    } else if (matchType === 'italic') {
      tokens.push(<em key={key++} className="blog-italic">{matchResult[1]}</em>);
    }

    remaining = remaining.substring(matchResult.index + matchResult[0].length);
  }

  return tokens;
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard.writeText(code.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="blog-code-container panel">
      <div className="blog-code-header">
        <span className="blog-code-badge">Copy-Ready Word List</span>
        <button type="button" onClick={handleCopy} className="btn btn-sm btn-outline copy-btn" title="Copy to clipboard">
          {copied ? (
            <>
              <Check size={13} className="accent" /> <span className="accent">Copied!</span>
            </>
          ) : (
            <>
              <Copy size={13} /> <span>Copy List</span>
            </>
          )}
        </button>
      </div>
      <pre className="blog-code-body">
        <code>{code.trim()}</code>
      </pre>
    </div>
  );
}

export function BlogMarkdown({ content, pathFor = (p) => p }: BlogMarkdownProps) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;
  let elementKey = 0;

  while (i < lines.length) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    // Skip empty lines
    if (!line) {
      i++;
      continue;
    }

    // Horizontal Rule
    if (line === '---' || line === '***') {
      elements.push(<hr key={elementKey++} className="blog-divider" />);
      i++;
      continue;
    }

    // Fenced Code Block
    if (line.startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      elements.push(<CodeBlock key={elementKey++} code={codeLines.join('\n')} />);
      continue;
    }

    // Table detection: line contains '|'
    if (line.startsWith('|') && line.endsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        tableLines.push(lines[i].trim());
        i++;
      }

      if (tableLines.length >= 2) {
        const headerRow = tableLines[0].split('|').slice(1, -1).map((c) => c.trim());
        const bodyRows = tableLines.slice(2).map((row) => row.split('|').slice(1, -1).map((c) => c.trim()));

        elements.push(
          <div key={elementKey++} className="blog-table-wrapper panel">
            <table className="blog-table">
              <thead>
                <tr>
                  {headerRow.map((h, colIdx) => (
                    <th key={colIdx}>{formatInline(h, pathFor)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bodyRows.map((row, rowIdx) => (
                  <tr key={rowIdx}>
                    {row.map((cell, cellIdx) => (
                      <td key={cellIdx}>{formatInline(cell, pathFor)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        continue;
      }
    }

    // Blockquote
    if (line.startsWith('> ')) {
      const quoteText = line.replace(/^>\s+/, '');
      elements.push(
        <blockquote key={elementKey++} className="blog-callout">
          <Sparkles size={16} className="callout-icon accent" />
          <div className="callout-content">{formatInline(quoteText, pathFor)}</div>
        </blockquote>
      );
      i++;
      continue;
    }

    // H1 Heading (ignore first H1 if already rendered in article title, otherwise render)
    if (line.startsWith('# ')) {
      // Typically rendered by page template; if encountered, render as subtle lead or skip
      i++;
      continue;
    }

    // H2 Heading
    if (line.startsWith('## ')) {
      const headingText = line.replace(/^##\s+/, '').replace(/\{#[^}]+\}/, '').trim();
      const customIdMatch = line.match(/\{#([^}]+)\}/);
      const id = customIdMatch ? customIdMatch[1] : slugify(headingText);

      elements.push(
        <h2 key={elementKey++} id={id} className="blog-h2">
          <a href={`#${id}`} className="blog-anchor-link">
            {formatInline(headingText, pathFor)}
          </a>
        </h2>
      );
      i++;
      continue;
    }

    // H3 Heading
    if (line.startsWith('### ')) {
      const headingText = line.replace(/^###\s+/, '').replace(/\{#[^}]+\}/, '').trim();
      const customIdMatch = line.match(/\{#([^}]+)\}/);
      const id = customIdMatch ? customIdMatch[1] : slugify(headingText);

      elements.push(
        <h3 key={elementKey++} id={id} className="blog-h3">
          {formatInline(headingText, pathFor)}
        </h3>
      );
      i++;
      continue;
    }

    // Unordered List
    if (line.startsWith('* ') || line.startsWith('- ')) {
      const listItems: string[] = [];
      while (i < lines.length && (lines[i].trim().startsWith('* ') || lines[i].trim().startsWith('- '))) {
        listItems.push(lines[i].trim().replace(/^[\*\-]\s+/, ''));
        i++;
      }
      elements.push(
        <ul key={elementKey++} className="blog-list">
          {listItems.map((item, itemIdx) => (
            <li key={itemIdx}>{formatInline(item, pathFor)}</li>
          ))}
        </ul>
      );
      continue;
    }

    // Ordered List
    if (/^\d+\.\s+/.test(line)) {
      const listItems: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        listItems.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i++;
      }
      elements.push(
        <ol key={elementKey++} className="blog-ordered-list">
          {listItems.map((item, itemIdx) => (
            <li key={itemIdx}>{formatInline(item, pathFor)}</li>
          ))}
        </ol>
      );
      continue;
    }

    // Normal Paragraph
    elements.push(
      <p key={elementKey++} className="blog-p">
        {formatInline(line, pathFor)}
      </p>
    );
    i++;
  }

  return <div className="blog-article-content">{elements}</div>;
}
