#!/usr/bin/env node
/* Proves an edit changed nothing but comments. Despite the name there is no
   parser: both files are stripped by a state machine tracking strings,
   templates and regex literals, then compared byte for byte. */
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
      // Best-effort regex-literal skip, so a '//' inside one is not read as a
      // comment marker.
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
    // A '/' starts a regex after punctuation or a keyword but not after an
    // identifier, number or closing bracket.
    if (!/\s/.test(c)) inRegexCtx = !/[\w)\]]/.test(c);
    i++;
  }
  return out;
}

/* A whole-line comment strips to an empty line, so blank lines and trailing
   whitespace are dropped before the byte compare. */
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
