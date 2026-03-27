/** Solid backdrop only — zero animation, minimal GPU work. */
export type WowMode = 'idle' | 'finale' | 'question';

export function WowAmbience({ mode }: { mode: WowMode }) {
  const bg = mode === 'question' ? 'bg-[#050608]' : 'bg-[#0a0a0f]';
  return (
    <div className="pointer-events-none fixed inset-0 z-[1]" aria-hidden>
      <div className={`absolute inset-0 ${bg}`} />
    </div>
  );
}
