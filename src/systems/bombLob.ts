/**
 * Normalized lob for the mega bomb. `t` is 0 at the handoff and 1 on impact.
 * The shadow travels the straight path; lift and scale peak together at the apex.
 */
export function bombLob(t: number): { lift: number; scale: number; shadow: number } {
  const u = Math.min(1, Math.max(0, t));
  const h = Math.sin(Math.PI * u);
  return {
    lift: h,
    scale: 0.78 + 0.87 * h,
    shadow: 1 - 0.45 * h,
  };
}
