// The itch.io release's one rule about other hosts (validate.mjs, adapted
// from Alva's tools/itch/hosts.mjs): the game loads nothing from anywhere
// but its own folder. No script, style, image, font, sound or fetch from any
// http(s):// or ws(s):// address; everything it needs is in the ZIP.
//
// The only absolute addresses its page, stylesheet and script may contain
// are listed here, one by one, each with why it is not a host the game
// loads from:
//
// - XML_NAMESPACES: namespace names, which are identifiers, never fetched.
//   document.createElementNS() takes them to make SVG (the Home Screen's
//   icons, src/home/icons.ts) and HTML (three.js's canvas) elements.
// - OPENED_LINKS: links the player opens in their own browser, never loaded
//   by the game. Mavooli has none yet; a credit or a store link added to the
//   game goes here, exactly as written in the code.
//
// Nothing else is allowed. Kept apart from validate.mjs so the tests can
// hold the rule on its own (tests/itch/hosts.test.mjs).

// Any absolute web or WebSocket address in a text.
export const EXTERNAL_URL = /(?:https?|wss?):\/\/[^'"`\s)<>\\]+/g;

export const XML_NAMESPACES = Object.freeze(new Set([
  'http://www.w3.org/2000/svg',
  'http://www.w3.org/1999/xhtml',
]));

export const OPENED_LINKS = Object.freeze(new Set([]));

// Every address in `text` (from `file`) that is neither a namespace name
// nor a link the player opens: one problem each.
export function hostProblems(text, file, { namespaces = XML_NAMESPACES, approved = OPENED_LINKS } = {}) {
  const problems = [];
  for (const address of text.match(EXTERNAL_URL) ?? []) {
    if (namespaces.has(address) || approved.has(address)) continue;
    problems.push(`${file}: ${address} is another host (the game loads only its own files; ` +
      'a link the player opens goes in OPENED_LINKS, tools/itch/hosts.mjs)');
  }
  return problems;
}
