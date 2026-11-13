/* ============================================================
   HOME SCREEN ICONS — inline SVG, so they look the same on every platform (no emoji glyphs)
   ============================================================
   Stroke icons on a 24×24 grid, drawn in currentColor (white on the cards). Their size comes from the
   stylesheet (.home-icon), so the middle card can draw its icon a little larger.
*/

const SVG_NS = 'http://www.w3.org/2000/svg';

function icon(body: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', 'home-icon');
  svg.innerHTML = body;      // fixed markup from this file only
  return svg;
}

/** A globe: online play. */
export function globeIcon(): SVGSVGElement {
  return icon(
    '<circle cx="12" cy="12" r="9"/>' +
    '<path d="M3 12h18"/>' +
    '<path d="M4.6 7.5h14.8M4.6 16.5h14.8"/>' +
    '<path d="M12 3c-2.6 2.5-3.9 5.5-3.9 9s1.3 6.5 3.9 9"/>' +
    '<path d="M12 3c2.6 2.5 3.9 5.5 3.9 9s-1.3 6.5-3.9 9"/>'
  );
}

/** A play triangle: Survival. */
export function playIcon(): SVGSVGElement {
  return icon('<path d="M8 4.8v14.4a.6.6 0 0 0 .9.5l11.3-7.2a.6.6 0 0 0 0-1L8.9 4.3a.6.6 0 0 0-.9.5z"/>');
}

/* The two tools, drawn upright around their crossing point (0, 0) and then turned 45° each way. */
const HAMMER = 'M-1 -4V8a1 1 0 0 0 2 0V-4M-5.5 -7.2L-3.6 -8.4H4.6V-4H-3.6L-5.5 -5.2Z';
const WRENCH = 'M1 -2.95A3.4 3.4 0 0 0 1.2 -9.38V-6.6H-1.2V-9.38A3.4 3.4 0 0 0 -1 -2.95V8a1 1 0 0 0 2 0Z';
let toolsId = 0;

/** A hammer crossed over a wrench: Creative mode. The wrench is cut away where the hammer lies on top. */
export function toolsIcon(): SVGSVGElement {
  const id = 'mv-tools-cut-' + (++toolsId);
  return icon(
    '<mask id="' + id + '" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">' +
      '<rect width="24" height="24" fill="#fff"/>' +
      '<path transform="translate(12 12) rotate(-45) scale(1.08)" d="' + HAMMER + '" fill="#000" stroke="#000" stroke-width="3.2"/>' +
    '</mask>' +
    '<g mask="url(#' + id + ')"><path transform="translate(12 12) rotate(45) scale(1.08)" d="' + WRENCH + '"/></g>' +
    '<path transform="translate(12 12) rotate(-45) scale(1.08)" d="' + HAMMER + '"/>'
  );
}
