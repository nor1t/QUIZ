import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  Vibration,
  ScrollView,
  Modal,
  Switch,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';

/* ---------------- Questions ---------------- */
const QUESTION_BANK = [
  { id: 1, question: 'What does "CPU" stand for?', options: ['Central Processing Unit', 'Computer Personal Unit', 'Core Performance Utility', 'Central Program Unit'], correctAnswer: 0, why: 'CPU executes instructions and performs arithmetic/logic operations.' },
  { id: 2, question: 'Which protocol secures web traffic with encryption?', options: ['HTTP', 'FTP', 'SSH', 'HTTPS'], correctAnswer: 3, why: 'HTTPS = HTTP over TLS/SSL, providing encryption and server authentication.' },
  { id: 3, question: 'In Git, which command copies a remote repository locally?', options: ['git pull', 'git clone', 'git fetch', 'git init'], correctAnswer: 1, why: 'git clone creates a new local copy with full history.' },
  { id: 4, question: 'Which database is document-oriented?', options: ['PostgreSQL', 'MySQL', 'MongoDB', 'SQLite'], correctAnswer: 2, why: 'MongoDB stores JSON-like documents (BSON).' },
  { id: 5, question: 'JavaScript runs primarily on…', options: ['The GPU', 'The browser and Node.js runtimes', 'The database engine', 'Only mobile devices'], correctAnswer: 1, why: 'JS executes in browsers and on servers via Node.js.' },
  { id: 6, question: 'Which HTTP method is typically idempotent?', options: ['POST', 'PATCH', 'PUT', 'OPTIONS'], correctAnswer: 2, why: 'PUT is defined as idempotent; repeated calls result in same state.' },
  { id: 7, question: 'What does CSS stand for?', options: ['Cascading Style Sheets', 'Creative Styling System', 'Custom Style Syntax', 'Computed Style Set'], correctAnswer: 0, why: 'CSS controls the presentation of HTML documents.' },
  { id: 8, question: 'Which data structure works on FIFO?', options: ['Stack', 'Queue', 'Tree', 'Graph'], correctAnswer: 1, why: 'Queue = First-In, First-Out. Stack is LIFO.' },
  { id: 9, question: 'Which cloud model gives you most control over VMs?', options: ['SaaS', 'PaaS', 'IaaS', 'FaaS'], correctAnswer: 2, why: 'IaaS exposes virtualized infrastructure (VMs, storage, networks).' },
  { id: 10, question: 'Which command lists open TCP/UDP ports on many systems?', options: ['top', 'netstat', 'ls', 'grep'], correctAnswer: 1, why: 'netstat (or ss) shows network connections and listening ports.' },
];

/* --------------- Utils --------------- */
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* --------------- Theme Colors --------------- */
function getPalette(isDark) {
  return isDark
    ? {
        bg: '#0F172A', card: '#0B1220', line: '#1E293B',
        text: '#E2E8F0', sub: '#94A3B8', accent: '#22C55E',
        accentText: '#052E1E', good: '#86EFAC', bad: '#FCA5A5',
        correctBg: '#052E1E', wrongBg: '#2A0D0D', idleBg: '#0B1220',
        track: '#1F2937', amber: '#FDE68A', overlay: 'rgba(15, 23, 42, 0.92)'
      }
    : {
        bg: '#F8FAFC', card: '#FFFFFF', line: '#E5E7EB',
        text: '#0F172A', sub: '#475569', accent: '#16A34A',
        accentText: '#F0FDF4', good: '#16A34A', bad: '#DC2626',
        correctBg: '#DCFCE7', wrongBg: '#FEE2E2', idleBg: '#FFFFFF',
        track: '#E5E7EB', amber: '#92400E', overlay: 'rgba(248, 250, 252, 0.92)'
      };
}

export default function App() {
  /* --------------- Settings --------------- */
  const [isDark, setIsDark] = useState(true);
  const C = useMemo(() => getPalette(isDark), [isDark]);

  const [soundOn, setSoundOn] = useState(true);
  const [hardMode, setHardMode] = useState(false); // 15s when true
  const START_TIME = hardMode ? 15 : 30;

  /* --------------- Quiz State --------------- */
  const [questions, setQuestions] = useState(() => shuffle(QUESTION_BANK));
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [score, setScore] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [isAnswered, setIsAnswered] = useState(false);

  // Timer/pause
  const [timeLeft, setTimeLeft] = useState(START_TIME);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef(null);

  // Streaks
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);

  // Lifelines
  const [usedFifty, setUsedFifty] = useState(false);
  const [usedSkip, setUsedSkip] = useState(false);
  const [usedPlusTime, setUsedPlusTime] = useState(false);
  const [hiddenIndices, setHiddenIndices] = useState(new Set());

  // Review + persistence
  const [userAnswers, setUserAnswers] = useState([]);
  const [highScore, setHighScore] = useState(0);
  const [allTimeBestStreak, setAllTimeBestStreak] = useState(0);

  // Settings modal
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Sounds
  const correctSoundRef = useRef(new Audio.Sound());
  const wrongSoundRef = useRef(new Audio.Sound());
  const [soundReady, setSoundReady] = useState(false);

  // Derived
  const question = questions[currentQuestion];
  const progress = useMemo(
    () => Math.round((currentQuestion / questions.length) * 100),
    [currentQuestion, questions.length]
  );

  /* --------------- Load/save persistent data --------------- */
  useEffect(() => {
    (async () => {
      try {
        const hs = await AsyncStorage.getItem('quiz_high_score');
        const bs = await AsyncStorage.getItem('quiz_best_streak');
        if (hs) setHighScore(Number(hs));
        if (bs) setAllTimeBestStreak(Number(bs));
      } catch {}
    })();
  }, []);

  useEffect(() => {
    if (!showResult) return;
    (async () => {
      try {
        if (score > highScore) {
          setHighScore(score);
          await AsyncStorage.setItem('quiz_high_score', String(score));
        }
        if (bestStreak > allTimeBestStreak) {
          setAllTimeBestStreak(bestStreak);
          await AsyncStorage.setItem('quiz_best_streak', String(bestStreak));
        }
      } catch {}
    })();
  }, [showResult]);

  /* --------------- Sounds setup --------------- */
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // Using different, more reliable sound sources
        // Correct sound: positive beep
        await correctSoundRef.current.loadAsync(
          { uri: 'https://assets.mixkit.co/sfx/preview/mixkit-correct-answer-tone-2870.mp3' },
          { volume: 0.7, shouldPlay: false }
        );
        // Wrong sound: negative beep
        await wrongSoundRef.current.loadAsync(
          { uri: 'https://assets.mixkit.co/sfx/preview/mixkit-wrong-answer-fail-notification-946.mp3' },
          { volume: 0.7, shouldPlay: false }
        );
        if (mounted) setSoundReady(true);
      } catch (error) {
        console.log('Sound loading error:', error);
        // Fallback to local sounds if needed - you can add these files to your assets
        try {
          // Uncomment these lines and add sound files to your project if online sounds fail
          // await correctSoundRef.current.loadAsync(require('./assets/correct.mp3'));
          // await wrongSoundRef.current.loadAsync(require('./assets/wrong.mp3'));
          // if (mounted) setSoundReady(true);
        } catch {
          if (mounted) setSoundReady(false);
        }
      }
    })();
    return () => {
      mounted = false;
      correctSoundRef.current.unloadAsync().catch(()=>{});
      wrongSoundRef.current.unloadAsync().catch(()=>{});
    };
  }, []);

  const playCorrect = async () => {
    if (!soundOn || !soundReady) return;
    try {
      await correctSoundRef.current.setPositionAsync(0);
      await correctSoundRef.current.playAsync();
    } catch {}
  };
  
  const playWrong = async () => {
    if (!soundOn || !soundReady) return;
    try {
      await wrongSoundRef.current.setPositionAsync(0);
      await wrongSoundRef.current.playAsync();
    } catch {}
  };

  /* --------------- Timer --------------- */
  useEffect(() => {
    if (showResult || isAnswered || isPaused) return;
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          Vibration.vibrate(50);
          handleTimeout();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [currentQuestion, isAnswered, showResult, isPaused]);

  const resetTimer = () => {
    clearInterval(timerRef.current);
    setTimeLeft(START_TIME);
  };

  const handleAnswer = (index) => {
    if (isAnswered) return;
    setSelectedIndex(index);
    setIsAnswered(true);
    resetTimer();

    const correct = index === question.correctAnswer;
    setUserAnswers((a) => [...a, index]);

    if (correct) {
      setScore((s) => s + 1);
      setStreak((st) => {
        const next = st + 1;
        setBestStreak((b) => (next > b ? next : b));
        return next;
      });
      playCorrect();
    } else {
      setStreak(0);
      Vibration.vibrate(40);
      playWrong();
    }
  };

  const handleTimeout = () => {
    if (isAnswered) return;
    setIsAnswered(true);
    setSelectedIndex(null);
    setUserAnswers((a) => [...a, null]);
    setStreak(0);
    playWrong();
  };

  const next = () => {
    if (!isAnswered) return;
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion((q) => q + 1);
      setSelectedIndex(null);
      setIsAnswered(false);
      setHiddenIndices(new Set());
      setTimeLeft(START_TIME);
      setIsPaused(false);
    } else {
      setShowResult(true);
      setIsPaused(true);
    }
  };

  const reset = () => {
    setQuestions(shuffle(QUESTION_BANK));
    setCurrentQuestion(0);
    setScore(0);
    setShowResult(false);
    setSelectedIndex(null);
    setIsAnswered(false);
    setTimeLeft(START_TIME);
    setStreak(0);
    setBestStreak(0);
    setUsedFifty(false);
    setUsedSkip(false);
    setUsedPlusTime(false);
    setHiddenIndices(new Set());
    setUserAnswers([]);
    setIsPaused(false);
  };

  // Lifelines
  const useFifty = () => {
    if (usedFifty || isAnswered) return;
    const wrong = question.options.map((_, i) => i).filter((i) => i !== question.correctAnswer);
    const pick = shuffle(wrong).slice(0, 2);
    setHiddenIndices(new Set(pick));
    setUsedFifty(true);
  };

  const useSkip = () => {
    if (usedSkip || isAnswered) return;
    resetTimer();
    setUsedSkip(true);
    setUserAnswers((a) => [...a, null]);
    setIsAnswered(true);
    next();
  };

  const usePlusTime = () => {
    if (usedPlusTime || isAnswered) return;
    setTimeLeft((t) => t + 10);
    setUsedPlusTime(true);
  };

  const togglePause = () => setIsPaused((p) => !p);

  return (
    <View style={[styles.screen, { backgroundColor: C.bg }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={styles.container}>
        <Text style={[styles.title, { color: C.text }]}>IT Quiz</Text>

        {/* Top bar: progress, timer, streak, pause & settings */}
        {!showResult && (
          <View style={styles.topRow}>
            <View style={{ flex: 1 }}>
              <View style={[styles.progressTrack, { backgroundColor: C.track }]}>
                <View style={[styles.progressFill, { backgroundColor: C.accent, width: `${progress}%` }]} />
              </View>
              <Text style={[styles.muted, { color: C.sub }]}>
                {currentQuestion + 1} / {questions.length}
              </Text>
            </View>

            <View style={[styles.timerPill, { backgroundColor: C.card, borderColor: C.line, marginLeft: 12 }]}>
              <Text style={[styles.timerText, { color: C.amber }]}>{isPaused ? 'Paused' : `${timeLeft}s`}</Text>
            </View>

            <View style={[styles.streakPill, { backgroundColor: C.card, borderColor: C.line, marginLeft: 12 }]}>
              <Text style={[styles.streakText, { color: C.good }]}>🔥 {streak} (best {bestStreak})</Text>
            </View>

            <Pressable
              onPress={togglePause}
              style={[styles.smallBtn, { marginLeft: 12, backgroundColor: C.card, borderColor: C.line }]}
            >
              <Text style={[styles.smallBtnText, { color: C.text }]}>{isPaused ? 'Resume' : 'Pause'}</Text>
            </Pressable>

            <Pressable
              onPress={() => setSettingsOpen(true)}
              style={[styles.smallBtn, { marginLeft: 8, backgroundColor: C.card, borderColor: C.line }]}
            >
              <Text style={[styles.smallBtnText, { color: C.text }]}>⚙️</Text>
            </Pressable>
          </View>
        )}

        {!showResult ? (
          <>
            {/* Pause Overlay - Only shown when paused */}
            {isPaused && !isAnswered && (
              <View style={[styles.pauseOverlay, { backgroundColor: C.overlay }]}>
                <View style={[styles.pauseCard, { backgroundColor: C.card }]}>
                  <Text style={[styles.pauseIcon, { color: C.accent }]}>⏸️</Text>
                  <Text style={[styles.pauseText, { color: C.text }]}>Quiz Paused</Text>
                  <Text style={[styles.pauseSubText, { color: C.sub }]}>
                    Timer is stopped. Continue when ready.
                  </Text>
                  <Pressable
                    onPress={togglePause}
                    style={[styles.resumeBtn, { backgroundColor: C.accent }]}
                  >
                    <Text style={[styles.resumeBtnText, { color: C.accentText }]}>▶️ Resume Quiz</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* Question - Blurred when paused */}
            <View style={[
              styles.card, 
              { backgroundColor: C.card, borderColor: C.line },
              isPaused && styles.blurredContent
            ]}>
              <Text style={[styles.questionText, { color: C.text }]}>{question.question}</Text>
            </View>

           {/* Lifelines */}
<View style={[styles.lifelineRow, isPaused && styles.blurredContent]}>
  <View style={{ flex: 1, marginRight: 10 }}>
    <Pressable
      onPress={useFifty}
      disabled={usedFifty || isAnswered}
      style={[
        styles.lifelineBtn,
        { backgroundColor: C.card, borderColor: C.line },
        (usedFifty || isAnswered) && styles.btnDisabled,
      ]}
    >
      <Text style={styles.lifelineEmoji}>❌❌</Text>
      <Text style={[styles.lifelineTitle, { color: C.text }]}>50/50</Text>
   
    </Pressable>
  </View>
  <View style={{ flex: 1, marginRight: 10 }}>
    <Pressable
      onPress={useSkip}
      disabled={usedSkip || isAnswered}
      style={[
        styles.lifelineBtn,
        { backgroundColor: C.card, borderColor: C.line },
        (usedSkip || isAnswered) && styles.btnDisabled,
      ]}
    >
      <Text style={styles.lifelineEmoji}>⏭️</Text>
      <Text style={[styles.lifelineTitle, { color: C.text }]}>Skip</Text>

    </Pressable>
  </View>
  <View style={{ flex: 1 }}>
    <Pressable
      onPress={usePlusTime}
      disabled={usedPlusTime || isAnswered}
      style={[
        styles.lifelineBtn,
        { backgroundColor: C.card, borderColor: C.line },
        (usedPlusTime || isAnswered) && styles.btnDisabled,
      ]}
    >
      <Text style={styles.lifelineEmoji}>⏱️➕</Text>
      <Text style={[styles.lifelineTitle, { color: C.text }]}>+10s</Text>
   
    </Pressable>
  </View>
</View>

            {/* Options - Blurred when paused */}
            <View style={[styles.optionsWrap, isPaused && styles.blurredContent]}>
              {question.options.map((option, index) => {
                if (hiddenIndices.has(index)) {
                  return (
                    <View key={index} style={[styles.optionBase, styles.optionHidden, { backgroundColor: C.idleBg, borderColor: C.line }]}>
                      <Text style={[styles.optionText, styles.optionHiddenText, { color: C.sub }]}>Hidden</Text>
                    </View>
                  );
                }

                const isCorrect = index === question.correctAnswer;
                const isSelected = index === selectedIndex;

                const bgStyle =
                  isAnswered && isSelected && isCorrect
                    ? { backgroundColor: C.correctBg }
                    : isAnswered && isSelected && !isCorrect
                    ? { backgroundColor: C.wrongBg }
                    : { backgroundColor: C.idleBg };

                const borderStyle =
                  isAnswered && isCorrect
                    ? { borderColor: C.accent }
                    : isAnswered && isSelected && !isCorrect
                    ? { borderColor: '#EF4444' }
                    : { borderColor: C.line };

                return (
                  <Pressable
                    key={index}
                    onPress={() => handleAnswer(index)}
                    disabled={isAnswered || isPaused}
                    style={({ pressed }) => [
                      styles.optionBase,
                      bgStyle,
                      borderStyle,
                      pressed && !isAnswered && !isPaused && styles.pressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        { color: C.text },
                        isAnswered && isCorrect ? styles.optionTextStrong : null,
                        isDark ? {} : { color: '#0F172A' },
                      ]}
                    >
                      {option}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Next - Blurred when paused */}
            <Pressable
              onPress={next}
              disabled={!isAnswered}
              style={[
                styles.primaryBtn,
                { backgroundColor: C.accent },
                !isAnswered && styles.primaryBtnDisabled,
                isPaused && styles.blurredContent
              ]}
            >
              <Text style={[styles.primaryBtnText, { color: C.accentText }]}>
                {currentQuestion === questions.length - 1 ? 'Finish' : 'Next'}
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            {/* Results */}
            <View style={[styles.resultCard, { backgroundColor: C.card, borderColor: C.line }]}>
              <Text style={[styles.resultTitle, { color: C.text }]}>All done! 🎉</Text>
              <Text style={[styles.resultScore, { color: C.text }]}>
                Score: {score} / {questions.length}
              </Text>
              <Text style={[styles.resultDetail, { color: C.sub }]}>
                {score === questions.length
                  ? 'Perfect! You crushed it.'
                  : score >= Math.ceil(questions.length * 0.7)
                  ? 'Great job—solid IT fundamentals!'
                  : 'Nice effort—run it again to improve.'}
              </Text>
              <Text style={[styles.muted, { color: C.sub, textAlign: 'center', marginTop: 8 }]}>
                Best streak this run: {bestStreak}
              </Text>
              <Text style={[styles.muted, { color: C.sub, textAlign: 'center', marginTop: 2 }]}>
                High score (all time): {highScore} • Best streak (all time): {allTimeBestStreak}
              </Text>
            </View>

            {/* Review */}
            <ScrollView style={[styles.reviewList, { backgroundColor: C.card, borderColor: C.line }]} contentContainerStyle={{ paddingBottom: 20 }}>
              {questions.map((q, i) => {
                const picked = userAnswers[i];
                const correctIdx = q.correctAnswer;
                const gotIt = picked === correctIdx;
                return (
                  <View key={q.id} style={[styles.reviewItem, { borderBottomColor: C.line }]}>
                    <Text style={[styles.reviewQ, { color: C.text }]}>
                      {i + 1}. {q.question}
                    </Text>
                    <Text style={[styles.reviewA, { color: gotIt ? C.good : C.bad }]}>
                      Your answer: {picked === null ? '—' : q.options[picked]}
                    </Text>
                    <Text style={[styles.reviewA, { color: C.text }]}>
                      Correct: <Text style={{ color: C.good }}>{q.options[correctIdx]}</Text>
                    </Text>
                    <Text style={[styles.reviewWhy, { color: C.sub }]}>{q.why}</Text>
                  </View>
                );
              })}
            </ScrollView>

            <Pressable onPress={reset} style={[styles.secondaryBtn, { backgroundColor: C.card, borderColor: C.line }]}>
              <Text style={[styles.secondaryBtnText, { color: C.text }]}>Play Again (Shuffle)</Text>
            </Pressable>
          </>
        )}

        {/* Settings Modal */}
        <Modal visible={settingsOpen} transparent animationType="fade" onRequestClose={() => setSettingsOpen(false)}>
          <View style={styles.modalWrap}>
            <View style={[styles.modalCard, { backgroundColor: C.card, borderColor: C.line }]}>
              <Text style={[styles.modalTitle, { color: C.text }]}>Settings</Text>

              <View style={styles.modalRow}>
                <Text style={[styles.modalLabel, { color: C.text }]}>Dark theme</Text>
                <Switch value={isDark} onValueChange={setIsDark} />
              </View>

              <View style={styles.modalRow}>
                <Text style={[styles.modalLabel, { color: C.text }]}>Sound</Text>
                <Switch value={soundOn} onValueChange={setSoundOn} />
              </View>

              <View style={styles.modalRow}>
                <Text style={[styles.modalLabel, { color: C.text }]}>Hard mode (15s)</Text>
                <Switch
                  value={hardMode}
                  onValueChange={(v) => {
                    setHardMode(v);
                    // If running, clamp current time to new max
                    setTimeLeft((t) => Math.min(t, v ? 15 : 30));
                  }}
                />
              </View>

              <Pressable onPress={() => setSettingsOpen(false)} style={[styles.primaryBtn, { backgroundColor: C.accent, marginTop: 16 }]}>
                <Text style={[styles.primaryBtnText, { color: C.accentText }]}>Close</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </View>
    </View>
  );
}

/* ---------------- Styles ---------------- */
const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 20, paddingTop: 60, paddingBottom: 24 },
  container: { flex: 1, maxWidth: 800, width: '100%', alignSelf: 'center' },

  title: { fontSize: 32, fontWeight: '800', textAlign: 'center', marginBottom: 12 },

  topRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  progressTrack: { height: 10, borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: '100%' },
  muted: { fontSize: 12, marginTop: 6 },

  timerPill: { borderWidth: 1, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12 },
  timerText: { fontWeight: '700' },
  streakPill: { borderWidth: 1, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12 },

  smallBtn: {
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallBtnText: { 
    fontWeight: '700'
   },

  card: { 
    borderWidth: 1, 
    padding: 22, 
    borderRadius: 14, 
    marginBottom: 14 
  },
  questionText: {
     fontSize: 20, 
     lineHeight: 28, 
     textAlign: 'center'
     },

  // Pause overlay styles
  pauseOverlay: {
    position: 'absolute',
    top: 90,
    left: 20,
    right: 20,
    bottom: 0,
    zIndex: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pauseCard: {
    position: 'absolute',
    top: 90,
    left: 20,
    right: 20,
    bottom: 265,
    zIndex: 10,
    padding: 28,
    borderRadius: 20,
    alignItems: 'center',
    width: '90%',
    maxWidth: 350,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  pauseIcon: {
    fontSize: 60,
    marginBottom: 16,
  },
  pauseText: {
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 10,
    textAlign: 'center',
  },
  pauseSubText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
  },
  resumeBtn: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 14,
    alignItems: 'center',
    width: '100%',
  },
  resumeBtnText: {
    fontSize: 18,
    fontWeight: '700',
  },
  blurredContent: {
    opacity: 0.10, 
  },

// Lifeline styles
lifelineRow: { 
  flexDirection: 'row', 
  marginBottom: 50,
  height: 45, 
},
lifelineBtn: { 
  flex: 1, 
  borderWidth: 1, 
  borderRadius: 14, 
  paddingVertical: 12,
  paddingHorizontal: 8,
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 80, 
},
lifelineEmoji: {
  fontSize: 24,
  marginBottom: 4,
},
lifelineTitle: { 
  fontSize: 14, 
  fontWeight: '700',
  marginBottom: 2,
  textAlign: 'center',
},
lifelineDesc: {
  fontSize: 11,
  textAlign: 'center',
},
btnDisabled: { 
  opacity: 0.3,
},
  optionsWrap: { 
    marginTop: 6,
    marginBottom: 18 
  },
  optionBase: { 
    paddingVertical: 14, 
    paddingHorizontal: 16, 
    borderRadius: 12, 
    marginBottom: 10, 
    borderWidth: 1 
  },
  optionHidden: { 
    opacity: 0.5 
  },
  optionHiddenText: { 
    fontStyle: 'italic' 
  },
  optionText: { 
    fontSize: 16 
  },
  optionTextStrong: { 
    fontWeight: '700' 
  },
  pressed: { 
    opacity: 0.8, 
    transform: [{ scale: 0.99 }] 
  },

  primaryBtn: { 
    paddingVertical: 14, 
    borderRadius: 12, 
    alignItems: 'center'
   },
  primaryBtnDisabled: { 
    opacity: 0.5 
  },
  primaryBtnText: { 
    fontSize: 16, 
    fontWeight: '700'
   },

  resultCard: { 
    borderWidth: 1, 
    padding: 22, 
    borderRadius: 14, 
    marginBottom: 16
   },
  resultTitle: { 
    fontSize: 24, 
    fontWeight: '800', 
    marginBottom: 6, 
    textAlign: 'center' 
  },
  resultScore: { 
    fontSize: 18, 
    fontWeight: '700', 
    textAlign: 'center'
   },
  resultDetail: { 
    fontSize: 14, 
    textAlign: 'center', 
    marginTop: 6 
  },

  secondaryBtn: { 
    borderWidth: 1, 
    paddingVertical: 14, 
    borderRadius: 12, 
    alignItems: 'center' 
  },
  secondaryBtnText: { 
    fontSize: 16, 
    fontWeight: '700'
   },

  reviewList: { 
    borderWidth: 1, 
    borderRadius: 12, 
    padding: 12, 
    marginBottom: 12, 
    maxHeight: 360 
  },
  reviewItem: { 
    borderBottomWidth: 1, 
    paddingVertical: 10 
  },
  reviewQ: { 
    fontSize: 14, 
    fontWeight: '700', 
    marginBottom: 4 
  },
  reviewA: { 
    fontSize: 13 
  },
  reviewWhy: { 
    fontSize: 12, 
    marginTop: 4,
   },

  modalWrap: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: { 
    width: '100%', 
    maxWidth: 420, 
    borderWidth: 1, 
    borderRadius: 16, 
    padding: 16 
  },
  modalTitle: { 
    fontSize: 20, 
    fontWeight: '800', 
    marginBottom: 12, 
    textAlign: 'center'
   },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingVertical: 12,
    borderBottomColor: '#1E293B',
    justifyContent: 'space-between',
  },
  modalLabel: { 
    fontSize: 16 
  },
});