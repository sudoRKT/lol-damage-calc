// Area F — the scenario <-> link encoder.
//
// The URL is the ONLY persistence mechanism in this product: no accounts, no database, no
// server-side state (SPECIFICATION §1, §12, §14). A link that decodes into something subtly
// different from what was shared is the same class of failure as a wrong damage number, so
// every failure here is a visible refusal and never a quiet substitution.
//
// The format, and the reasoning behind each decision, is written down in ./FORMAT.md.

import type { Scenario } from '../types/scenario';
import { openPayload, sealEnvelope, splitEnvelope } from './envelope';
import { V1, readV1Payload } from './v1';
import { V2, checkScenario, readV2Payload, writeV2Payload } from './v2';

export { V1_STEP_KINDS } from './v1';
export { V2_STEP_KINDS } from './v2';
export * from './resolve';

/**
 * The version this build WRITES. Every version ever published stays READABLE (FORMAT.md §3),
 * which is why `DECODERS` below still holds version 1 and always will.
 *
 * Bumped to 2 on 2026-08-14 so the combo step can carry `hitCounts` — see v2.ts.
 */
export const CURRENT_URL_VERSION = V2;

/**
 * Every version this build can READ, newest first. A version is added here and never removed:
 * a link shared in a video two years ago must still open (FORMAT.md §3).
 */
const DECODERS: Record<number, (payload: unknown) => ReturnType<typeof readV2Payload>> = {
  [V2]: readV2Payload,
  [V1]: readV1Payload,
};

/** The fragment parameter the scenario lives in: `https://site/#s=...`. */
export const FRAGMENT_KEY = 's';

export type DecodeErrorCode =
  | 'empty'
  | 'malformed'
  | 'unknown-version'
  | 'checksum-mismatch'
  | 'not-base64'
  | 'not-json'
  | 'shape';

export interface DecodeError {
  code: DecodeErrorCode;
  /** A sentence that can be shown to a person as-is. */
  message: string;
  /** Which field of the scenario was wrong, for a `shape` failure — e.g. `attacker.level`. */
  path?: string;
  /** The version number found in the link, when one was readable at all. */
  foundVersion?: number;
}

export type DecodeResult = { ok: true; scenario: Scenario } | { ok: false; error: DecodeError };

/** Thrown when a scenario contains something a link cannot carry. That is a caller bug. */
export class ScenarioEncodeError extends Error {
  readonly path: string;
  constructor(path: string, reason: string) {
    super(`Cannot share this scenario: ${path} ${reason}.`);
    this.name = 'ScenarioEncodeError';
    this.path = path;
  }
}

const DAMAGED =
  "This link is damaged and can't be opened. It was probably cut short when it was copied or posted — ask for it again.";

/**
 * Scenario -> link text (`1~payload~checksum`).
 *
 * Throws rather than returning a partial link: producing a link that does not carry the
 * whole scenario is the one outcome this module exists to prevent.
 */
export function encodeScenario(scenario: Scenario): string {
  const complaint = checkScenario(scenario);
  if (complaint) throw new ScenarioEncodeError(complaint.path, complaint.reason);
  return sealEnvelope(CURRENT_URL_VERSION, writeV2Payload(scenario));
}

/**
 * Link text -> scenario, or a stated reason why not. Never throws, and never fills in a
 * value the link did not carry.
 */
export function decodeScenario(link: string): DecodeResult {
  const split = splitEnvelope(link);
  if (!split.ok) {
    return split.failure === 'empty'
      ? { ok: false, error: { code: 'empty', message: 'There is no scenario in this link.' } }
      : { ok: false, error: { code: 'malformed', message: DAMAGED } };
  }

  const { version } = split.envelope;

  // The version is judged BEFORE the payload is verified. A newer link must be reported as
  // newer even if a future version also changed how the payload itself is written — telling
  // someone their link is damaged when it is merely new sends them to ask for a re-send that
  // cannot possibly help.
  const decode = DECODERS[version];
  if (!decode) {
    return {
      ok: false,
      error: {
        code: 'unknown-version',
        foundVersion: version,
        message:
          `This link was made with a different version of the site (link format ${version}; ` +
          `this page understands up to ${CURRENT_URL_VERSION}). Reload the page to get the latest version, then try again.`,
      },
    };
  }

  const opened = openPayload(split.envelope);
  if (!opened.ok) {
    return { ok: false, error: { code: opened.failure, message: DAMAGED, foundVersion: version } };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(opened.payload);
  } catch {
    return { ok: false, error: { code: 'not-json', message: DAMAGED, foundVersion: version } };
  }

  const read = decode(parsed);
  if (!read.ok) {
    return {
      ok: false,
      error: {
        code: 'shape',
        message: DAMAGED,
        path: read.complaint.path,
        foundVersion: version,
      },
    };
  }
  return { ok: true, scenario: read.scenario };
}

/**
 * The full shareable link. The scenario goes in the FRAGMENT, so it is never transmitted to
 * a server, never written into a CDN access log, and never truncated by a proxy that has
 * opinions about query-string length (FORMAT.md §2).
 */
export function scenarioToUrl(baseUrl: string, scenario: Scenario): string {
  const encoded = encodeScenario(scenario);
  const url = new URL(baseUrl);
  url.hash = `${FRAGMENT_KEY}=${encoded}`;
  return url.toString();
}

/** Pulls the scenario out of a full link, a bare fragment, or the raw link text. */
export function scenarioFromUrl(url: string): DecodeResult {
  const extracted = readFragmentScenario(url);
  if (extracted === null) {
    return { ok: false, error: { code: 'empty', message: 'There is no scenario in this link.' } };
  }
  return decodeScenario(extracted);
}

function readFragmentScenario(url: string): string | null {
  const hashAt = url.indexOf('#');
  if (hashAt === -1) return null;
  const fragment = url.slice(hashAt + 1);
  if (fragment === '') return null;

  for (const part of fragment.split('&')) {
    if (part.startsWith(`${FRAGMENT_KEY}=`)) {
      const raw = part.slice(FRAGMENT_KEY.length + 1);
      if (raw === '') return null;
      // Some chat clients percent-encode a link they rewrite. Nothing in the alphabet this
      // format uses is a `%`, so undoing that is always safe and never changes a good link.
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
  }
  return null;
}
