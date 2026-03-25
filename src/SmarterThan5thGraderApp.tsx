import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Users, Trash2, Home, Timer as TimerIcon, Settings2 } from 'lucide-react';
import confetti from 'canvas-confetti';

import { cn } from './lib/utils';
import type { GameState, Grade, Player, Prize, Question, Subject } from './types';
import {
  appendLogLine,
  buildTextFileContent,
  clearPersistedSession,
  deserializeGameState,
  downloadTextFile,
  loadPersistedSession,
  randomSessionName,
  savePersistedSession,
  serializeGameState,
  type PersistedSession,
} from './gameSessionLog';

const SUBJECTS: Subject[] = [
  'Maths',
  'World History',
  'Sub-continent History',
  'Geography',
  'World Religion & Mythology',
  'General Science',
  'Islam',
  'Cricket',
  'Pop Culture & Sex Ed',
  'Sports',
  'World Politics',
  'Tech',
];

const GRADES: Grade[] = [1, 2, 3, 4, 5, 6];
const QUESTIONS_PER_SUBJECT = 5;

const PRIZE_TABLE: Prize[] = [
  { id: 'p1', name: 'Golden Pen', description: 'A high-quality writing instrument.' },
  { id: 'p2', name: 'Smart Watch', description: 'A sleek digital companion.' },
  { id: 'p3', name: 'Gift Card', description: 'A $20 shopping spree.' },
  { id: 'p4', name: 'Chocolate Box', description: 'Premium assorted treats.' },
  { id: 'p5', name: 'Notebook', description: 'A leather-bound journal.' },
  { id: 'p6', name: 'Wireless Earbuds', description: 'Crystal clear sound.' },
  { id: 'p7', name: 'Coffee Mug', description: 'A custom-designed mug.' },
  { id: 'p8', name: 'Backpack', description: 'Durable and stylish.' },
];

import { getFactsForSubjectGrade, getQuestionPoolSize } from './questionBank';

const toSlug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-');

const deterministicShuffle = (items: string[], seed: number): string[] => {
  const out = [...items];
  let state = seed;
  for (let i = out.length - 1; i > 0; i -= 1) {
    state = (state * 1664525 + 1013904223) % 4294967296;
    const j = state % (i + 1);
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
};


/** Spreads pool access so the same random index ≠ same fact across grades (less “duplicate” feel). */
const factIndexForPool = (subject: Subject, grade: Grade, index: number, poolLen: number): number => {
  const subjSalt =
    subject.split('').reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7) % 1009;
  const n = Math.max(1, poolLen);
  return (index + grade * 7919 + subjSalt) % n;
};

const createOfflineQuestion = (subject: Subject, grade: Grade, index: number): Question => {
  const facts = getFactsForSubjectGrade(subject, grade);
  const n = Math.max(1, facts.length);
  const fi = factIndexForPool(subject, grade, index, n);
  const fact = facts[fi];

  return {
    id: `${toSlug(subject)}-${grade}-${index}`,
    subject,
    grade,
    question: fact.clue,
    answer: fact.answer,
    options: deterministicShuffle([fact.answer, ...fact.distractors], index + grade * 1000),
  };
};

const questionIdForIndex = (subject: Subject, grade: Grade, index: number) =>
  `${toSlug(subject)}-${grade}-${index}`;

/** Random unused question; if pool exhausted, allows repeats but avoids `mustDifferFromId` when possible. */
const pickRandomQuestion = (
  subject: Subject,
  grade: Grade,
  usedIds: Set<string>,
  mustDifferFromId?: string | null,
): Question => {
  const poolSize = getQuestionPoolSize(subject, grade);
  const candidates: number[] = [];
  for (let i = 0; i < poolSize; i += 1) {
    const id = questionIdForIndex(subject, grade, i);
    if (usedIds.has(id)) continue;
    if (mustDifferFromId && id === mustDifferFromId) continue;
    candidates.push(i);
  }
  if (candidates.length === 0) {
    for (let i = 0; i < poolSize; i += 1) {
      const id = questionIdForIndex(subject, grade, i);
      if (mustDifferFromId && id === mustDifferFromId) continue;
      candidates.push(i);
    }
  }
  if (candidates.length === 0) {
    const i = Math.floor(Math.random() * poolSize);
    return createOfflineQuestion(subject, grade, i);
  }
  const idx = candidates[Math.floor(Math.random() * candidates.length)];
  return createOfflineQuestion(subject, grade, idx);
};

/** Grade N = N points. Chooser wrong: -1. Others wrong: 0. */
const pointsForCorrect = (grade: Grade): number => grade;
const CHOOSER_WRONG_PENALTY = -1;

/** Londa poll: half of normal correct points for that grade (e.g. G3 → 1.5). */
const pointsForCorrectWithLonda = (
  grade: Grade,
  playerId: string,
  londaPollPlayerId: string | null,
): number => {
  const base = pointsForCorrect(grade);
  if (playerId === londaPollPlayerId) return Math.round(base * 0.5 * 10) / 10;
  return base;
};

const formatScore = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export default function SmarterThan5thGraderApp() {
  const [gameState, setGameState] = useState<GameState>({
    players: [],
    categoryChooserId: null,
    currentSubject: null,
    currentGrade: null,
    currentQuestion: null,
    gamePhase: 'SETUP',
    prizes: PRIZE_TABLE,
    selectedPrize: null,
    usedQuestionIds: new Set<string>(),
    questionsAnsweredInSubject: 0,
    hiddenOptions: [],
    uneesBeesActive: false,
    uneesBeesSelections: [],
    londaPollPlayerId: null,
  });

  const [newPlayerName, setNewPlayerName] = useState('');
  const [showAnswer, setShowAnswer] = useState(false);
  const [timeLeft, setTimeLeft] = useState(30);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [selectedGrade, setSelectedGrade] = useState<Grade | null>(null);
  const [sessionName, setSessionName] = useState<string | null>(null);
  const persistedSessionRef = useRef<PersistedSession | null>(null);
  const [resumeOffered, setResumeOffered] = useState(false);
  const [resumeSessionName, setResumeSessionName] = useState<string | null>(null);
  /** Host taps an answer to show correct (green) vs wrong (red); resets each question. */
  const [hostRevealAll, setHostRevealAll] = useState(false);
  const resetQuestionUI = () => {
    setHostRevealAll(false);
  };

  useEffect(() => {
    const saved = loadPersistedSession();
    if (saved?.gameState && saved.sessionName) {
      persistedSessionRef.current = saved;
      // Defer state updates to avoid synchronous setState-in-effect lint warnings.
      // requestAnimationFrame runs after the current render cycle.
      requestAnimationFrame(() => {
        setResumeOffered(true);
        setResumeSessionName(saved.sessionName);
      });
    }
  }, []);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (isTimerRunning && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            setIsTimerRunning(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTimerRunning, timeLeft]);

  const persistNow = (gs: GameState, name: string | null) => {
    if (!name || !persistedSessionRef.current) return;
    const s = persistedSessionRef.current;
    s.gameState = serializeGameState(gs);
    savePersistedSession(s);
  };

  useEffect(() => {
    if (sessionName) persistNow(gameState, sessionName);
  }, [gameState, sessionName]);

  useEffect(() => {
    const onLeave = () => {
      if (sessionName && persistedSessionRef.current) {
        persistedSessionRef.current.gameState = serializeGameState(gameState);
        savePersistedSession(persistedSessionRef.current);
      }
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [gameState, sessionName]);

  const logScoreEvent = (line: string) => {
    if (!persistedSessionRef.current) return;
    appendLogLine(persistedSessionRef.current, line);
    savePersistedSession(persistedSessionRef.current);
  };

  const addPlayer = () => {
    if (newPlayerName.trim() && gameState.players.length < 7) {
      const newPlayer: Player = {
        id: Math.random().toString(36).slice(2, 11),
        name: newPlayerName.trim(),
        totalScore: 0,
        subjectScore: 0,
        hasUsedUneesBees: false,
        hasUsedLondaPoll: false,
      };
      setGameState((prev) => ({ ...prev, players: [...prev.players, newPlayer] }));
      setNewPlayerName('');
    }
  };

  const selectGrade = (grade: Grade) => {
    if (!gameState.currentSubject) return;
    setSelectedGrade(grade);

    setGameState((prev) => {
      const q = pickRandomQuestion(prev.currentSubject!, grade, prev.usedQuestionIds);
      return {
        ...prev,
        currentGrade: grade,
        currentQuestion: q,
        gamePhase: 'QUESTION',
        usedQuestionIds: new Set(prev.usedQuestionIds).add(q.id),
        hiddenOptions: [],
        uneesBeesActive: false,
        uneesBeesSelections: [],
        londaPollPlayerId: null,
      };
    });
    setShowAnswer(false);
    resetQuestionUI();
    setTimeLeft(30);
    setIsTimerRunning(true);
  };

  const nextQuestionSameRound = () => {
    setGameState((prev) => {
      if (!prev.currentSubject || !prev.currentGrade) return prev;
      const q = pickRandomQuestion(
        prev.currentSubject,
        prev.currentGrade,
        prev.usedQuestionIds,
        prev.currentQuestion?.id,
      );
      return {
        ...prev,
        currentQuestion: q,
        usedQuestionIds: new Set(prev.usedQuestionIds).add(q.id),
        uneesBeesActive: false,
        uneesBeesSelections: [],
        londaPollPlayerId: null,
      };
    });
    setShowAnswer(false);
    resetQuestionUI();
    setTimeLeft(30);
    setIsTimerRunning(true);
    logScoreEvent('Next question (random)');
  };

  const alternateQuestion = () => {
    setGameState((prev) => {
      if (!prev.currentSubject || !prev.currentGrade || !prev.currentQuestion) return prev;
      const q = pickRandomQuestion(
        prev.currentSubject,
        prev.currentGrade,
        prev.usedQuestionIds,
        prev.currentQuestion.id,
      );
      return {
        ...prev,
        currentQuestion: q,
        usedQuestionIds: new Set(prev.usedQuestionIds).add(q.id),
        uneesBeesActive: false,
        uneesBeesSelections: [],
        londaPollPlayerId: null,
      };
    });
    setShowAnswer(false);
    resetQuestionUI();
    setTimeLeft(30);
    setIsTimerRunning(true);
    logScoreEvent('Alternate question (different prompt)');
  };

  const handleScore = (playerId: string, isCorrect: boolean) => {
    const grade = gameState.currentGrade ?? 1;
    const isCategoryChooser = playerId === gameState.categoryChooserId;
    const pts = pointsForCorrectWithLonda(grade, playerId, gameState.londaPollPlayerId);

    if (isCorrect) {
      confetti({ particleCount: 80, spread: 60, origin: { y: 0.6 } });
    }

    setIsTimerRunning(false);

    const playerName = gameState.players.find((p) => p.id === playerId)?.name ?? playerId;
    if (isCorrect) {
      const londaNote = playerId === gameState.londaPollPlayerId ? ' [Londa ½]' : '';
      logScoreEvent(`${playerName}: CORRECT (+${pts}) [grade ${grade}]${londaNote}`);
    } else if (isCategoryChooser) {
      logScoreEvent(`${playerName}: WRONG (${CHOOSER_WRONG_PENALTY}) [chooser]`);
    } else {
      logScoreEvent(`${playerName}: WRONG (0) [non-chooser]`);
    }

    setGameState((prev) => {
      const newPlayers = prev.players.map((p) => {
        if (p.id !== playerId) return p;
        let scoreChange = 0;
        if (isCorrect) scoreChange = pts;
        else if (isCategoryChooser) scoreChange = CHOOSER_WRONG_PENALTY;
        return {
          ...p,
          totalScore: p.totalScore + scoreChange,
          subjectScore: p.subjectScore + scoreChange,
        };
      });

      const nextQuestionsAnswered = prev.questionsAnsweredInSubject + 1;
      if (nextQuestionsAnswered >= QUESTIONS_PER_SUBJECT) {
        return {
          ...prev,
          players: newPlayers,
          gamePhase: 'SUBJECT_RESULTS',
          questionsAnsweredInSubject: nextQuestionsAnswered,
          uneesBeesActive: false,
          londaPollPlayerId: null,
        };
      }

      return {
        ...prev,
        players: newPlayers,
        gamePhase: 'GRADE_SELECTION',
        questionsAnsweredInSubject: nextQuestionsAnswered,
        currentQuestion: null,
        uneesBeesActive: false,
        londaPollPlayerId: null,
      };
    });
    setShowAnswer(false);
  };

  const activateUneesBees = (playerId: string) => {
    if (!gameState.currentQuestion) return;
    const p = gameState.players.find((x) => x.id === playerId);
    if (!p || p.hasUsedUneesBees === true) return;
    setGameState((prev) => ({
      ...prev,
      players: prev.players.map((p) => (p.id === playerId ? { ...p, hasUsedUneesBees: true } : p)),
      uneesBeesActive: true,
      uneesBeesSelections: [],
    }));
  };

  const toggleUneesBeesSelection = (option: string) => {
    setGameState((prev) => {
      const isSelected = prev.uneesBeesSelections.includes(option);
      if (isSelected) return { ...prev, uneesBeesSelections: prev.uneesBeesSelections.filter((o) => o !== option) };
      if (prev.uneesBeesSelections.length < 2) return { ...prev, uneesBeesSelections: [...prev.uneesBeesSelections, option] };
      return prev;
    });
  };

  const activateLondaPoll = (playerId: string) => {
    if (!gameState.currentQuestion) return;
    const p = gameState.players.find((x) => x.id === playerId);
    if (!p || p.hasUsedLondaPoll === true || gameState.londaPollPlayerId != null) return;
    logScoreEvent(`Londa poll called by ${p.name} (½ pts if correct)`);
    setGameState((prev) => ({
      ...prev,
      londaPollPlayerId: playerId,
      players: prev.players.map((pl) =>
        pl.id === playerId ? { ...pl, hasUsedLondaPoll: true } : pl,
      ),
    }));
  };

  const resetGame = () => {
    clearPersistedSession();
    persistedSessionRef.current = null;
    setSessionName(null);
    setGameState({
      players: [],
      categoryChooserId: null,
      currentSubject: null,
      currentGrade: null,
      currentQuestion: null,
      gamePhase: 'SETUP',
      prizes: PRIZE_TABLE,
      selectedPrize: null,
      usedQuestionIds: new Set<string>(),
      questionsAnsweredInSubject: 0,
      hiddenOptions: [],
      uneesBeesActive: false,
      uneesBeesSelections: [],
      londaPollPlayerId: null,
    });
  };

  const resumeSession = () => {
    const s = persistedSessionRef.current ?? loadPersistedSession();
    if (!s) return;
    persistedSessionRef.current = s;
    setSessionName(s.sessionName);
    setGameState(deserializeGameState(s.gameState));
    setResumeOffered(false);
  };

  const dismissResume = () => {
    setResumeOffered(false);
    clearPersistedSession();
    persistedSessionRef.current = null;
  };

  const exportSessionLog = () => {
    const s = persistedSessionRef.current ?? loadPersistedSession();
    if (!s) return;
    const text = buildTextFileContent(s);
    downloadTextFile(`${s.sessionName}.txt`, text);
  };

  const [hostPanelOpen, setHostPanelOpen] = useState(false);

  /** Host-only: adjust total points (e.g. rule breaks). Does not auto-change subject-round score. */
  const hostAdjustTotal = (playerId: string, delta: number) => {
    const name = gameState.players.find((p) => p.id === playerId)?.name ?? playerId;
    logScoreEvent(`HOST ADJUST total: ${name} ${delta >= 0 ? '+' : ''}${delta}`);
    setGameState((prev) => ({
      ...prev,
      players: prev.players.map((p) =>
        p.id === playerId ? { ...p, totalScore: Math.max(0, p.totalScore + delta) } : p,
      ),
    }));
  };

  const subjectWinner = [...gameState.players].sort((a, b) => b.subjectScore - a.subjectScore)[0];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-brutal-black font-sans selection:bg-neon-green selection:text-brutal-black">
      {resumeOffered && resumeSessionName && (
        <div className="bg-amber-100 border-b-4 border-amber-500 px-4 py-3 flex flex-wrap items-center justify-between gap-3 max-w-7xl mx-auto">
          <p className="font-mono text-sm font-bold">
            Recover previous game &quot;{resumeSessionName}&quot;?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={resumeSession}
              className="px-4 py-2 bg-brutal-black text-white font-mono text-xs font-bold uppercase rounded-lg border-2 border-brutal-black"
            >
              Resume
            </button>
            <button
              type="button"
              onClick={dismissResume}
              className="px-4 py-2 bg-white font-mono text-xs font-bold uppercase rounded-lg border-2 border-brutal-black"
            >
              Start fresh
            </button>
          </div>
        </div>
      )}
      <header className="border-b-4 border-brutal-black bg-gradient-to-r from-[#0052cc] to-electric-blue text-gallery-white sticky top-0 z-50 shadow-md">
        <div className="max-w-7xl mx-auto px-6 py-6 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="bg-neon-green p-3 border-4 border-brutal-black brutal-shadow">
              <Trophy className="w-8 h-8 text-brutal-black" />
            </div>
            <div>
              <h1 className="text-4xl font-display uppercase leading-none tracking-tighter">
                Smarter Than a 5th Grader
              </h1>
              <p className="text-sm font-mono uppercase tracking-widest text-neon-green font-bold">
                Hosted by Hamza
              </p>
              <p className="text-xs font-mono text-white/80 mt-1 max-w-md">
                Host-only: you run the show, reveal answers, and score. Contestants use the screen only.
              </p>
            </div>
          </div>

          {gameState.gamePhase !== 'SETUP' && (
            <div className="flex flex-wrap items-center gap-3 justify-end">
              <button
                type="button"
                onClick={() => setHostPanelOpen((o) => !o)}
                className="flex items-center gap-2 px-3 py-2 bg-black/30 border-2 border-white/80 text-white font-mono font-bold uppercase text-xs rounded-lg"
                title="Adjust totals if someone breaks rules"
              >
                <Settings2 className="w-4 h-4" />
                Host scores
              </button>
              {sessionName && (
                <span className="hidden sm:inline font-mono text-xs uppercase text-neon-green/90 max-w-[200px] truncate" title={sessionName}>
                  {sessionName}
                </span>
              )}
              {sessionName && (
                <button
                  type="button"
                  onClick={exportSessionLog}
                  className="px-3 py-2 bg-gallery-white text-brutal-black border-2 border-gallery-white font-mono font-bold uppercase text-xs rounded-lg"
                >
                  Save log (.txt)
                </button>
              )}
              <button
                onClick={() => {
                  resetGame();
                }}
                className="flex items-center gap-2 px-4 py-2 bg-brutal-black text-neon-green border-4 border-brutal-black font-mono font-bold uppercase text-xs brutal-shadow-sm rounded-lg"
              >
                <Home className="w-4 h-4" /> Home
              </button>
              <div className="flex items-center gap-3 bg-brutal-black px-6 py-3 border-2 border-gallery-white brutal-shadow rounded-lg">
                <Users className="w-5 h-5 text-neon-green" />
                <span className="text-lg font-black uppercase tracking-tighter">
                  {gameState.players.length} Players
                </span>
              </div>
            </div>
          )}
        </div>
        {gameState.gamePhase !== 'SETUP' && gameState.players.length > 0 && (
          <div className="max-w-7xl mx-auto px-6 pb-4">
            <div className="flex flex-wrap gap-3 text-xs font-mono font-bold text-white/95">
              {gameState.players.map((p) => (
                <span key={p.id} className="bg-black/25 px-3 py-1 rounded border border-white/30">
                  {p.name}: {formatScore(p.totalScore)} total · {formatScore(p.subjectScore)} this round
                </span>
              ))}
            </div>
            <p className="mt-2 text-[11px] font-mono text-white/80 max-w-3xl">
              Scoring: correct = grade value (G1 → +1 … G6 → +6). Lounda poll: ½ pts for caller. Unees Bees: pick 2 answers. Chooser wrong: −1. Others wrong: 0. Lifelines: once per player per game.
            </p>
          </div>
        )}
      </header>

      <main className="max-w-6xl mx-auto px-6 py-16">
        <AnimatePresence mode="wait">
          {gameState.gamePhase === 'SETUP' && (
            <motion.div
              key="setup"
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center"
            >
              <div className="space-y-8">
                <h2 className="text-8xl font-display uppercase leading-[0.85] tracking-tighter">
                  Ready to <span className="text-electric-blue">Host</span>?
                </h2>
                <div className="bg-neon-green/20 p-4 border-l-8 border-neon-green">
                  <p className="font-mono text-sm font-bold uppercase">
                    Offline questions loaded. Start the show!
                  </p>
                </div>
              </div>

              <div className="bg-gallery-white border-8 border-brutal-black p-10 brutal-shadow-blue space-y-10">
                <div className="flex gap-4">
                  <input
                    type="text"
                    value={newPlayerName}
                    onChange={(e) => setNewPlayerName(e.target.value)}
                    placeholder="PLAYER NAME..."
                    className="flex-1 bg-white border-4 border-brutal-black px-6 py-5 text-2xl font-black focus:outline-none"
                  />
                  <button
                    onClick={addPlayer}
                    className="bg-brutal-black text-gallery-white px-10 py-5 text-2xl font-black uppercase transition-all"
                  >
                    Add
                  </button>
                </div>

                <div className="space-y-4">
                  {gameState.players.map((player) => (
                    <div
                      key={player.id}
                      className="flex items-center justify-between bg-white border-4 border-brutal-black p-5 group hover:bg-neon-green"
                    >
                      <span className="text-3xl font-black uppercase tracking-tighter">{player.name}</span>
                      <button
                        onClick={() =>
                          setGameState((prev) => ({ ...prev, players: prev.players.filter((p) => p.id !== player.id) }))
                        }
                      >
                        <Trash2 className="w-6 h-6" />
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => {
                    if (gameState.players.length < 1) return;
                    const next: GameState = { ...gameState, gamePhase: 'CATEGORY_SELECTION' };
                    setGameState(next);
                    const name = randomSessionName();
                    const session: PersistedSession = {
                      sessionName: name,
                      startedAt: Date.now(),
                      updatedAt: Date.now(),
                      logLines: [],
                      gameState: serializeGameState(next),
                    };
                    appendLogLine(session, `Session "${name}" started`);
                    next.players.forEach((p) => appendLogLine(session, `Player: ${p.name} (total 0)`));
                    persistedSessionRef.current = session;
                    setSessionName(name);
                    savePersistedSession(session);
                  }}
                  disabled={gameState.players.length < 1}
                  className="w-full bg-electric-blue text-gallery-white py-8 text-5xl font-display uppercase brutal-shadow disabled:opacity-60"
                >
                  Start Show
                </button>
              </div>
            </motion.div>
          )}

          {gameState.gamePhase === 'CATEGORY_SELECTION' && (
            <motion.div key="cat" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="space-y-16">
              <h2 className="text-9xl font-display uppercase tracking-tighter text-center">
                Who's <span className="text-stroke">Choosing?</span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8">
                {gameState.players.map((player) => (
                  <button
                    key={player.id}
                    onClick={() =>
                      setGameState((prev) => ({
                        ...prev,
                        categoryChooserId: player.id,
                        gamePhase: 'GRADE_SELECTION',
                      }))
                    }
                    className="p-10 bg-white border-8 border-brutal-black text-4xl font-display uppercase brutal-shadow"
                  >
                    {player.name}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {gameState.gamePhase === 'GRADE_SELECTION' && (
            <motion.div key="grade" initial={{ opacity: 0, y: 100 }} animate={{ opacity: 1, y: 0 }} className="space-y-16">
              <div className="flex justify-between items-end">
                <h2 className="text-8xl font-display uppercase tracking-tighter">
                  Pick the <span className="text-electric-blue">Battle</span>
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {SUBJECTS.map((subject) => (
                  <button
                    key={subject}
                    onClick={() => setGameState((prev) => ({ ...prev, currentSubject: subject }))}
                    className={cn(
                      'p-6 border-4 rounded-xl border-brutal-black text-xl font-black uppercase brutal-shadow transition-transform duration-150 active:scale-95',
                      gameState.currentSubject === subject ? 'bg-electric-blue text-gallery-white' : 'bg-white hover:bg-neon-green',
                    )}
                  >
                    {subject}
                  </button>
                ))}
              </div>

              {gameState.currentSubject && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 pt-8">
                  {GRADES.map((grade) => (
                    <button
                      key={grade}
                      onClick={() => selectGrade(grade)}
                      className={cn(
                        'min-h-32 bg-white border-8 rounded-2xl border-brutal-black flex flex-col items-center justify-center gap-2 brutal-shadow transition-all duration-150 active:scale-95 hover:-translate-y-0.5 hover:bg-electric-blue hover:text-gallery-white',
                        selectedGrade === grade && 'bg-electric-blue text-gallery-white',
                      )}
                    >
                      <span className="text-6xl font-display leading-none">{grade}</span>
                      <span className="text-sm font-mono font-bold uppercase tracking-wide">Grade</span>
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {gameState.gamePhase === 'QUESTION' && gameState.currentQuestion && (
            <motion.div key="q" initial={{ opacity: 0, scale: 1.1 }} animate={{ opacity: 1, scale: 1 }} className="space-y-12">
              <div className="flex justify-between items-center border-b-8 border-brutal-black pb-8">
                <p className="text-electric-blue font-display text-4xl uppercase">{gameState.currentSubject}</p>
                <div
                  className={cn(
                    'flex items-center gap-3 px-6 py-3 border-4 border-brutal-black brutal-shadow',
                    timeLeft <= 10 ? 'bg-red-500 text-white animate-pulse' : 'bg-neon-green',
                  )}
                >
                  <TimerIcon className="w-6 h-6" />
                  <span className="text-3xl font-black font-mono">{timeLeft}s</span>
                </div>
              </div>

              <div className="bg-white border-8 border-brutal-black p-8 md:p-12 brutal-shadow-blue relative">
                <p className="text-sm font-mono text-brutal-black/60 mb-2 uppercase tracking-widest">
                  Grade {gameState.currentGrade ?? '?'} · +{formatScore(pointsForCorrect(gameState.currentGrade ?? 1))} pts
                  {gameState.londaPollPlayerId &&
                    ` · Lounda: ${gameState.players.find((x) => x.id === gameState.londaPollPlayerId)?.name ?? '?'} (½ pts)`}
                </p>

                <h3 className="text-4xl md:text-5xl lg:text-6xl font-display leading-tight tracking-tight mb-10">
                  {gameState.currentQuestion.question}
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                  {gameState.currentQuestion.options.map((option, idx) => {
                    const isCorrectOpt = option === gameState.currentQuestion!.answer;
                    const uneesOn = gameState.uneesBeesActive;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          if (uneesOn) toggleUneesBeesSelection(option);
                          else setHostRevealAll(true);
                        }}
                        className={cn(
                          'p-5 md:p-6 border-4 border-brutal-black text-xl md:text-2xl font-black text-left relative transition-colors rounded-xl',
                          hostRevealAll
                            ? isCorrectOpt
                              ? 'bg-green-500 text-white border-green-800'
                              : 'bg-red-500 text-white border-red-800'
                            : uneesOn
                              ? gameState.uneesBeesSelections.includes(option)
                                ? 'bg-neon-green'
                                : 'bg-gallery-white'
                              : 'bg-gallery-white hover:bg-neutral-100',
                        )}
                      >
                        <span className="text-electric-blue mr-3 font-mono">{String.fromCharCode(65 + idx)}.</span>
                        {option}
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center gap-3 mb-6">
                  <button
                    type="button"
                    onClick={() => setHostRevealAll(true)}
                    className="px-4 py-2 bg-brutal-black text-gallery-white font-mono text-xs font-bold uppercase rounded-lg border-2 border-brutal-black"
                  >
                    Show correct / wrong
                  </button>
                  <button onClick={() => setShowAnswer(!showAnswer)} className="px-4 py-2 bg-electric-blue text-gallery-white font-mono text-xs font-bold uppercase rounded-lg border-2 border-electric-blue">
                    {showAnswer ? 'Hide Answer' : 'Reveal Answer'}
                  </button>
                  <button
                    type="button"
                    onClick={nextQuestionSameRound}
                    className="px-4 py-2 bg-gallery-white border-2 border-brutal-black font-mono font-bold uppercase text-xs rounded-lg"
                  >
                    Next question
                  </button>
                  <button
                    type="button"
                    onClick={alternateQuestion}
                    className="px-4 py-2 bg-neon-green text-brutal-black border-2 border-brutal-black font-mono font-bold uppercase text-xs rounded-lg"
                  >
                    Alternate
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsTimerRunning(false);
                      setGameState((prev) => ({
                        ...prev,
                        gamePhase: 'GRADE_SELECTION',
                        currentQuestion: null,
                        uneesBeesActive: false,
                        uneesBeesSelections: [],
                        londaPollPlayerId: null,
                      }));
                    }}
                    className="px-4 py-2 bg-gallery-white border-2 border-brutal-black font-mono font-bold uppercase text-xs rounded-lg"
                  >
                    Back
                  </button>
                </div>

                {showAnswer && (
                  <div className="text-4xl md:text-5xl font-display uppercase text-neon-green bg-brutal-black px-8 py-4 mb-6 rounded-xl inline-block">
                    {gameState.currentQuestion.answer}
                  </div>
                )}

              </div>

              <div className="mt-8 rounded-2xl border-4 border-brutal-black bg-gradient-to-br from-neon-green/20 to-electric-blue/10 p-5 md:p-6">
                <h2 className="text-xl font-display uppercase tracking-tight text-brutal-black mb-4">
                  Lifelines
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <p className="font-mono text-xs font-bold text-brutal-black/70 mb-2 uppercase">
                      Unees Bees — contestant picks two answers (once/game)
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {gameState.players.map((p) =>
                        p.hasUsedUneesBees !== true ? (
                          <button
                            key={`unees-${p.id}`}
                            type="button"
                            onClick={() => activateUneesBees(p.id)}
                            className="px-4 py-2 bg-electric-blue text-gallery-white border-2 border-brutal-black font-mono text-xs font-bold uppercase rounded-lg hover:brightness-110"
                          >
                            {p.name}
                          </button>
                        ) : null,
                      )}
                      {gameState.players.every((p) => p.hasUsedUneesBees === true) && (
                        <p className="font-mono text-xs text-brutal-black/50">All used</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <p className="font-mono text-xs font-bold text-brutal-black/70 mb-2 uppercase">
                      Lounda poll — ask the room, ½ pts for caller (once/game)
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {gameState.players.map((p) => {
                        const canUse =
                          p.hasUsedLondaPoll !== true && gameState.londaPollPlayerId == null;
                        if (!canUse) return null;
                        return (
                          <button
                            key={`londa-${p.id}`}
                            type="button"
                            onClick={() => activateLondaPoll(p.id)}
                            className="px-4 py-2 bg-brutal-black text-neon-green border-2 border-neon-green font-mono text-xs font-bold uppercase rounded-lg hover:brightness-110"
                          >
                            {p.name}
                          </button>
                        );
                      })}
                      {gameState.londaPollPlayerId != null && (
                        <p className="font-mono text-xs font-bold text-electric-blue">
                          Active: {gameState.players.find((x) => x.id === gameState.londaPollPlayerId)?.name ?? '?'}
                        </p>
                      )}
                      {gameState.players.every((p) => p.hasUsedLondaPoll === true) &&
                        gameState.londaPollPlayerId == null && (
                          <p className="font-mono text-xs text-brutal-black/50">All used</p>
                        )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                {gameState.players.map((player) => (
                  <div key={player.id} className="space-y-4">
                    <button
                      type="button"
                      onClick={() => handleScore(player.id, true)}
                      className={cn(
                        'w-full p-8 border-4 border-brutal-black text-2xl font-black uppercase brutal-shadow rounded-xl min-h-[56px] active:scale-[0.99]',
                        player.id === gameState.categoryChooserId ? 'bg-electric-blue text-white' : 'bg-white hover:bg-neon-green',
                      )}
                    >
                      {player.name} (+
                      {formatScore(
                        pointsForCorrectWithLonda(
                          gameState.currentGrade ?? 1,
                          player.id,
                          gameState.londaPollPlayerId,
                        ),
                      )}
                      )
                    </button>

                    {player.id === gameState.categoryChooserId && (
                      <button
                        type="button"
                        onClick={() => handleScore(player.id, false)}
                        className="w-full py-4 bg-brutal-black text-red-400 border-4 border-brutal-black font-display uppercase rounded-xl"
                      >
                        Wrong (−1 chooser)
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {gameState.gamePhase === 'SUBJECT_RESULTS' && subjectWinner && (
            <motion.div key="res" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} className="text-center space-y-16 py-12">
              <h2 className="text-9xl font-display uppercase tracking-tighter">
                Subject <span className="text-electric-blue">Hero</span>
              </h2>
              <div className="bg-brutal-black text-gallery-white p-16 brutal-shadow-green inline-block">
                <h3 className="text-8xl font-display uppercase mb-4">{subjectWinner.name}</h3>
                <p className="text-3xl font-mono font-bold text-neon-green uppercase">
                  {formatScore(subjectWinner.subjectScore)} Points
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  logScoreEvent('--- Round end / Next subject ---');
                  setGameState((prev) => ({
                    ...prev,
                    players: prev.players.map((p) => ({ ...p, subjectScore: 0 })),
                    gamePhase: 'CATEGORY_SELECTION',
                    currentSubject: null,
                    currentGrade: null,
                    currentQuestion: null,
                    categoryChooserId: null,
                    questionsAnsweredInSubject: 0,
                    uneesBeesActive: false,
                    uneesBeesSelections: [],
                  }));
                }}
                className="block mx-auto bg-brutal-black text-gallery-white px-20 py-8 text-5xl font-display uppercase brutal-shadow rounded-2xl"
              >
                Next Subject
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {hostPanelOpen && gameState.players.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-[60] max-h-[55vh] overflow-y-auto border-t-4 border-brutal-black bg-gallery-white shadow-[0_-8px_30px_rgba(0,0,0,0.15)]">
          <div className="max-w-7xl mx-auto px-4 py-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-2xl font-display uppercase">Host · adjust totals</h2>
              <button
                type="button"
                onClick={() => setHostPanelOpen(false)}
                className="px-4 py-2 bg-brutal-black text-white font-mono text-xs font-bold uppercase rounded-lg"
              >
                Close
              </button>
            </div>
            <p className="text-sm font-mono text-brutal-black/80">
              Use this if someone breaks rules. Changes apply to <strong>total game score</strong> only (logged in session file).
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {gameState.players.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-col gap-2 border-4 border-brutal-black rounded-xl p-4 bg-white"
                >
                  <div className="font-black uppercase text-lg">
                    {p.name}{' '}
                    <span className="text-electric-blue font-mono text-base">({formatScore(p.totalScore)} total)</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => hostAdjustTotal(p.id, -1)}
                      className="px-3 py-2 bg-red-500 text-white font-mono text-xs font-bold uppercase rounded-lg border-2 border-brutal-black min-h-[44px]"
                    >
                      −1
                    </button>
                    <button
                      type="button"
                      onClick={() => hostAdjustTotal(p.id, -2)}
                      className="px-3 py-2 bg-red-600 text-white font-mono text-xs font-bold uppercase rounded-lg border-2 border-brutal-black min-h-[44px]"
                    >
                      −2
                    </button>
                    <button
                      type="button"
                      onClick={() => hostAdjustTotal(p.id, -5)}
                      className="px-3 py-2 bg-red-700 text-white font-mono text-xs font-bold uppercase rounded-lg border-2 border-brutal-black min-h-[44px]"
                    >
                      −5
                    </button>
                    <button
                      type="button"
                      onClick={() => hostAdjustTotal(p.id, 1)}
                      className="px-3 py-2 bg-neon-green text-brutal-black font-mono text-xs font-bold uppercase rounded-lg border-2 border-brutal-black min-h-[44px]"
                    >
                      +1 fix
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

