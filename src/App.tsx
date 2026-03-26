import { lazy, Suspense } from 'react';
import './smarter-than-5th-grader.css';

const SmarterThan5thGraderApp = lazy(() => import('./SmarterThan5thGraderApp'));

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col items-center justify-center gap-4 text-white/80 font-mono text-sm">
      <div
        className="w-10 h-10 rounded-full border-2 border-white/20 border-t-emerald-400 animate-spin"
        aria-hidden
      />
      <span>Loading game…</span>
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <SmarterThan5thGraderApp />
    </Suspense>
  );
}
