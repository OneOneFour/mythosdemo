#!/usr/bin/env node
/* Comments-only diff check for `.claude/commands/tidy.md` phase 3.
   NOT an AST parser -- there is no parser dependency in this project ("no
   runtime dependencies", and adding `acorn` as a devDependency to check a
   comment-tidy pass would outweigh the pass). Instead: strip both line and
   block comments from both files with a small state machine that tracks
   whether it is inside a string, template literal or regex literal (so a
   comment marker inside one of those is not mistaken for a real comment),
   then diff the stripped text byte-for-byte. Byte-identical stripped output
   is a strong but not airtight guarantee of "comments only changed" -- it
   would miss a change that also altered whitespace-insensitive token spacing
   in a way that happens to restripe identically, which does not occur in
   practice for a comment-only edit. */
import { readFileSync } from 'node:fs';

function stripComments(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  let inStr = null;      // ' " ` or null
  let inRegexCtx = true; // true if a following '/' could start a regex, not divide
  while (i < n) {
    const c = src[i];
    if (inStr) {
      out += c;
      if (c === '\\') { out += src[i + 1] ?? ''; i += 2; continue; }
      if (c === inStr) inStr = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      inStr = c;
      out += c;
      i++;
      inRegexCtx = false;
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (c === '/' && inRegexCtx) {
      // best-effort regex-literal skip, so a '//' or '/*' inside one is not
      // mistaken for a comment marker.
      let j = i + 1;
      let inClass = false;
      while (j < n && (inClass || src[j] !== '/')) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === '[') inClass = true;
        else if (src[j] === ']') inClass = false;
        else if (src[j] === '\n') break;
        j++;
      }
      if (j < n && src[j] === '/') {
        out += src.slice(i, j + 1);
        i = j + 1;
        inRegexCtx = false;
        continue;
      }
    }
    out += c;
    // a '/' can start a regex after most punctuation/keywords but not after
    // an identifier, number or closing bracket -- approximate with "was the
    // last non-space char alnum, ), ] or _/$".
    if (!/\s/.test(c)) inRegexCtx = !/[\w)\]]/.test(c);
    i++;
  }
  return out;
}

/* A line that was ENTIRELY a comment strips to pure whitespace, so deleting
   or adding a whole such line shifts every later line number without
   changing any code -- normalize by dropping blank/whitespace-only lines and
   trailing whitespace before the byte compare, or a comment-only edit that
   happens to remove or insert a whole comment line would falsely report
   CODE CHANGED. */
const normalize = s => s.split('\n').map(l => l.trimEnd()).filter(l => l !== '').join('\n');

const [a, b] = process.argv.slice(2);
if (!a || !b) {
  console.error('usage: node tools/ast-same.mjs <old.js> <new.js>');
  process.exit(2);
}
const sa = normalize(stripComments(readFileSync(a, 'utf8')));
const sb = normalize(stripComments(readFileSync(b, 'utf8')));
if (sa === sb) {
  console.log('COMMENTS ONLY:', a, b);
  process.exit(0);
} else {
  console.log('CODE CHANGED:', a, b);
  process.exit(1);
}
