// The link envelope: `version ~ payload ~ checksum`.
//
// This file knows nothing about scenarios. It only knows how to wrap an already-encoded
// payload string so that a damaged link is refused rather than half-read, and how to read
// the version out of a link WITHOUT understanding the payload — which is what lets an old
// build recognise a newer link and say so honestly instead of guessing (FORMAT.md §3).
//
// No dependencies. base64url is built from `btoa`/`atob`, which exist in browsers and in
// Node, and UTF-8 conversion uses TextEncoder/TextDecoder, likewise. See FORMAT.md §7 for
// why compression is deliberately absent from version 1.

export const FIELD_SEPARATOR = '~';

/** Characters legal in a base64url payload. Checked before `atob`, which is lenient. */
const BASE64URL = /^[A-Za-z0-9_-]+$/;

export function textToBase64url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  // Chunked so a very long scenario cannot overflow the argument list.
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Returns null when the input is not a well-formed base64url string. */
export function base64urlToText(encoded: string): string | null {
  if (!BASE64URL.test(encoded)) return null;
  // A base64 group is 2, 3 or 4 characters; a remainder of 1 is impossible.
  if (encoded.length % 4 === 1) return null;
  const padded = encoded.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (encoded.length % 4)) % 4);
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    return null;
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  try {
    // fatal:true — a byte sequence that is not valid UTF-8 is a corrupt link, not a
    // string full of replacement characters.
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/**
 * 32-bit FNV-1a over the payload text, written in base 36 (about six characters).
 *
 * An INTEGRITY check, not a security one: it exists to catch a link that a chat client cut
 * short or that a user copied incompletely, because a truncated base64 payload can still
 * decode to something readable. It makes no attempt to resist a deliberately forged link,
 * and nothing in this product depends on a link being trustworthy.
 */
export function checksum(payload: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

export interface SplitEnvelope {
  version: number;
  payloadField: string;
  checksumField: string;
}

/**
 * Step one: split a link into its three fields and read the version — and NOTHING else.
 *
 * This is separate from verifying the payload on purpose. The version must be readable
 * without understanding, or even validating, anything that follows it. That is what lets a
 * build from last year look at a version-2 link and say "this was made with a newer version
 * of the site" instead of "this link is damaged" — which would be the wrong sentence, and
 * would send the user off asking for the link to be re-sent when re-sending cannot help.
 *
 * The three-field envelope, the `~` separator, and the FNV-1a/base36 checksum are therefore
 * FIXED ACROSS ALL VERSIONS. Only the payload's meaning is versioned.
 */
export function splitEnvelope(
  link: string,
): { ok: true; envelope: SplitEnvelope } | { ok: false; failure: 'empty' | 'malformed' } {
  const trimmed = link.trim();
  if (trimmed === '') return { ok: false, failure: 'empty' };

  const fields = trimmed.split(FIELD_SEPARATOR);
  if (fields.length !== 3) return { ok: false, failure: 'malformed' };

  const [versionField, payloadField, checksumField] = fields;
  if (!/^[0-9]+$/.test(versionField)) return { ok: false, failure: 'malformed' };
  const version = Number(versionField);
  if (!Number.isSafeInteger(version)) return { ok: false, failure: 'malformed' };
  if (payloadField === '' || checksumField === '') return { ok: false, failure: 'malformed' };

  return { ok: true, envelope: { version, payloadField, checksumField } };
}

/** Step two, run only once the version is one this build understands. */
export function openPayload(
  envelope: SplitEnvelope,
): { ok: true; payload: string } | { ok: false; failure: 'checksum-mismatch' | 'not-base64' } {
  if (checksum(envelope.payloadField) !== envelope.checksumField) {
    return { ok: false, failure: 'checksum-mismatch' };
  }
  const text = base64urlToText(envelope.payloadField);
  if (text === null) return { ok: false, failure: 'not-base64' };
  return { ok: true, payload: text };
}

export function sealEnvelope(version: number, payloadText: string): string {
  const payload = textToBase64url(payloadText);
  return `${version}${FIELD_SEPARATOR}${payload}${FIELD_SEPARATOR}${checksum(payload)}`;
}
