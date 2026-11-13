// Run with node --test (no dependencies). The itch.io release's rule about
// other hosts (tools/itch/hosts.mjs): the game loads only its own files, and
// the only absolute addresses allowed are the ones listed there.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EXTERNAL_URL, OPENED_LINKS, XML_NAMESPACES, hostProblems } from '../../tools/itch/hosts.mjs';

test('the XML namespace names are allowed: identifiers, never fetched', () => {
  const js = 'document.createElementNS(`http://www.w3.org/2000/svg`,`svg`);createElementNS("http://www.w3.org/1999/xhtml","canvas")';
  assert.deepEqual(hostProblems(js, 'assets/index.js'), []);
  assert.deepEqual([...XML_NAMESPACES].sort(), ['http://www.w3.org/1999/xhtml', 'http://www.w3.org/2000/svg']);
});

test('any other address is a problem: scripts, styles, images, fonts, sockets', () => {
  for (const address of [
    'https://cdn.example.com/three.min.js',
    'http://example.com/a.png',
    'https://fonts.googleapis.com/css2?family=Inter',
    'wss://rooms.example.com/socket',
    'ws://localhost:8080',
    'https://www.w3.org/2000/svg',            // not the namespace name: https
    'http://www.w3.org/2000/svg/extra.svg',   // not the namespace name: a path under it
  ]) {
    const problems = hostProblems(`fetch("${address}")`, 'assets/index.js');
    assert.equal(problems.length, 1, address);
    assert.match(problems[0], /another host/);
  }
});

test('a link the player opens is allowed only once listed', () => {
  const link = 'https://hiyroscript.itch.io/';
  assert.equal(hostProblems(`href="${link}"`, 'index.html').length, 1);
  assert.deepEqual(hostProblems(`href="${link}"`, 'index.html', { approved: new Set([link]) }), []);
  assert.equal(OPENED_LINKS.size, 0, 'Mavooli opens no links yet');
});

test('an address ends at a quote, a bracket or white space', () => {
  const text = 'a("https://a.example/x.js") b(\'https://b.example/y\') url(https://c.example/z.png) <https://d.example/>';
  assert.deepEqual(text.match(EXTERNAL_URL), ['https://a.example/x.js', 'https://b.example/y', 'https://c.example/z.png', 'https://d.example/']);
});
