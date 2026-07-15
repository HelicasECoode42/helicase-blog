// ============================================
// HELICASE — Arc Position Calculator
// Parabolic concave-down arc for album covers.
// y = -a * x² + depth
// ============================================

export interface CoverPosition {
  x: number;
  y: number;
  rotate: number;
  scale: number;
}

/**
 * Calculate positions for N covers on a concave-down arc.
 * @param count Total number of covers
 * @param arcWidth Total width of the arc in px
 * @param arcDepth How deep the arc dips in px
 * @param coverSize Size of each cover thumbnail in px
 * @param gap Gap between covers in px
 */
export function calculateArc(
  count: number,
  arcWidth: number = 360,
  arcDepth: number = 40,
  coverSize: number = 56,
  gap: number = 10,
): CoverPosition[] {
  const positions: CoverPosition[] = [];
  const span = (count - 1) * (coverSize + gap);

  for (let i = 0; i < count; i++) {
    const t = count > 1 ? i / (count - 1) - 0.5 : 0; // -0.5 to 0.5
    const x = t * span;

    // Parabola: y = -a * x² + depth, where a = 4*depth / span²
    const a = span > 0 ? (4 * arcDepth) / (span * span) : 0;
    const y = -a * x * x + arcDepth;

    // Rotation: maximum at edges (±12°), zero at center
    const maxRotate = 12;
    const rotate = -maxRotate * 2 * t;

    // Scale: 1.0 at center, 0.85 at edges
    const scale = 1 - 0.15 * Math.abs(t) * 2;

    positions.push({ x, y, rotate, scale });
  }

  return positions;
}
