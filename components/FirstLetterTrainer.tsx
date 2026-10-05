// 首字母转练：选字母 → 快速浏览（纯浏览，可跳过）→ 释义选择 → 单词默写 → 完成汇总。
// 练习阶段可经 QuizRunner.skipTool 一键跳过尚未作答的已掌握单词（口径 repetitions >= 3）。
// 阶段词表在进入阶段时冻结；过滤只经 skipTool 剔除题目，不触发 QuizRunner 重载。
import { repo } from '@/lib/data';
import type { UserWordProgress, Word } from '@/lib/data';
import { countWordsByLetter, pickMasteredIds, wordsStartingWith } from '@/lib/firstLetter';
import { getLanguageByCode } from '@/lib/languages';
import { speakWord } from '@/lib/speech';
import { useSession } from '@/components/SessionProvider';
import QuizRunner from '@/components/QuizRunner';
import FlashCard from '@/components/FlashCard';
import useColors from '@/components/useColors';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const ENGLISH = getLanguageByCode('en');
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

type TrainerStage = 'pick' | 'review' | 'choice' | 'dictation' | 'done';

interface StageScore {
  correct: number;
  total: number;
}

export default function FirstLetterTrainer({ onExit }: { onExit: () => void }) {
  const colors = useColors();
  const { user, wordbook } = useSession();
  const [words, setWords] = useState<Word[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stage, setStage] = useState<TrainerStage>('pick');
  const [letter, setLetter] = useState<string | null>(null);
  const [reviewIdx, setReviewIdx] = useState(0);
  const [choiceWordIds, setChoiceWordIds] = useState<string[]>([]);
  const [dictationWordIds, setDictationWordIds] = useState<string[]>([]);
  const [choiceScore, setChoiceScore] = useState<StageScore | null>(null);
  const [dictationScore, setDictationScore] = useState<StageScore | null>(null);
  // 剔除集用 ref 同步累积：切换阶段时需立即读取最新值，state 更新是异步的
  const skippedRef = useRef<Set<string>>(new Set());

  const loadWords = useCallback(async () => {
    if (!user || !wordbook) {
      setLoadError('请先登录并选择词本');
      return;
    }
    setLoadError(null);
    setWords(null);
    try {
      setWords(await repo.getWordsByWordbook(wordbook.id));
    } catch {
      setLoadError('词表加载失败，请重试');
    }
  }, [user, wordbook]);

  useEffect(() => {
    loadWords();
  }, [loadWords]);

  const counts = useMemo(() => countWordsByLetter(words ?? []), [words]);
  const letterWords = useMemo(
    () => (letter ? wordsStartingWith(words ?? [], letter) : []),
    [words, letter],
  );

  const resetSkipped = () => {
    skippedRef.current = new Set();
  };

  const startLetter = (l: string) => {
    // 自动发音：必须在本点击手势内同步调用（iOS/移动端自动播放限制）。
    // 放到 useEffect 等手势外时机会被浏览器静默拦截，表现为完全无声。
    const first = wordsStartingWith(words ?? [], l)[0];
    if (first) speakWord(first.word, ENGLISH);
    resetSkipped();
    setLetter(l);
    setReviewIdx(0);
    setChoiceScore(null);
    setDictationScore(null);
    setStage('review');
  };

  const backToPick = () => {
    setStage('pick');
    setLetter(null);
    resetSkipped();
  };

  // 上一词/下一词：切换单词时同样在点击手势内同步发音
  const goPrevWord = () => {
    const prev = letterWords[reviewIdx - 1];
    if (!prev) return;
    speakWord(prev.word, ENGLISH);
    setReviewIdx(reviewIdx - 1);
  };

  const goNextWord = () => {
    const next = letterWords[reviewIdx + 1];
    if (!next) return;
    speakWord(next.word, ENGLISH);
    setReviewIdx(reviewIdx + 1);
  };

  // skipTool.resolve：实时读取剩余词进度判定已掌握，累积到 skippedRef 供后续阶段剔除
  const resolveRemaining = useCallback(
    async (remainingWordIds: string[]): Promise<string[]> => {
      if (!user || !wordbook) return [];
      const pairs: { id: string; progress: UserWordProgress | null }[] = [];
      for (const id of remainingWordIds) {
        pairs.push({ id, progress: await repo.getProgress(user.id, wordbook.id, id) });
      }
      const mastered = pickMasteredIds(pairs);
      if (mastered.length > 0) {
        const next = new Set(skippedRef.current);
        for (const id of mastered) next.add(id);
        skippedRef.current = next;
      }
      return mastered;
    },
    [user, wordbook],
  );

  // 尚未剔除的词 id（进入阶段时冻结为阶段词表；训练中途只增不减）
  const remainingIds = () =>
    letterWords.filter((w) => !skippedRef.current.has(w.id)).map((w) => w.id);

  const beginPractice = () => {
    const ids = remainingIds();
    if (ids.length === 0) {
      setStage('done');
      return;
    }
    setChoiceWordIds(ids);
    setStage('choice');
  };

  const afterChoice = (correct: number, total: number) => {
    setChoiceScore({ correct, total });
    const ids = remainingIds();
    if (ids.length === 0) {
      setStage('done');
      return;
    }
    setDictationWordIds(ids);
    setStage('dictation');
  };

  const afterDictation = (correct: number, total: number) => {
    setDictationScore({ correct, total });
    setStage('done');
  };

  // ===== 加载失败 =====
  if (loadError) {
    return (
      <View style={[styles.root, styles.centerWrap]}>
        <Text style={[styles.errorTitle, { color: colors.text }]}>加载失败了</Text>
        <Text style={[styles.errorSub, { color: colors.subtitle }]}>{loadError}</Text>
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: colors.tint }]}
          onPress={loadWords}
          activeOpacity={0.8}
        >
          <Text style={[styles.primaryBtnText, { color: colors.onTint }]}>重试</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.textBtn} onPress={onExit}>
          <Text style={[styles.textBtnText, { color: colors.subtitle }]}>返回练习</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ===== 加载中 =====
  if (words == null) {
    return (
      <View style={[styles.root, styles.centerWrap]}>
        <ActivityIndicator size="large" color={colors.tint} />
      </View>
    );
  }

  // ===== 空词本 =====
  if (words.length === 0) {
    return (
      <View style={[styles.root, styles.centerWrap]}>
        <Text style={[styles.errorSub, { color: colors.subtitle }]}>当前词本暂无单词</Text>
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: colors.tint }]}
          onPress={onExit}
          activeOpacity={0.8}
        >
          <Text style={[styles.primaryBtnText, { color: colors.onTint }]}>返回练习</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ===== ① 字母选择 =====
  if (stage === 'pick') {
    return (
      <View style={styles.root}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={onExit} hitSlop={8}>
            <FontAwesome name="chevron-left" size={16} color={colors.tint} />
            <Text style={[styles.backText, { color: colors.tint }]}>返回</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]}>首字母转练</Text>
          <View style={styles.topBarSpacer} />
        </View>
        <Text style={[styles.hint, { color: colors.pinyin }]}>
          选择首字母，先快速浏览，再集中练选择与默写
        </Text>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.gridContent}>
          <View style={styles.letterGrid}>
            {[...LETTERS, ...(counts.get('#') ? ['#'] : [])].map((l) => {
              const count = counts.get(l) ?? 0;
              const disabled = count === 0;
              return (
                <TouchableOpacity
                  key={l}
                  style={[
                    styles.letterCell,
                    { backgroundColor: colors.card, borderColor: colors.border },
                    disabled && styles.dimmed,
                  ]}
                  disabled={disabled}
                  onPress={() => startLetter(l)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.letterText, { color: colors.text }]}>{l}</Text>
                  <Text style={[styles.letterCount, { color: colors.subtitle }]}>{count}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      </View>
    );
  }

  // ===== ② 快速浏览 =====
  if (stage === 'review') {
    const current = letterWords[reviewIdx];
    if (!current) {
      // 防御：该字母无可浏览单词（正常流程不会出现，空字母在网格已禁用）
      return (
        <View style={[styles.root, styles.centerWrap]}>
          <Text style={[styles.errorSub, { color: colors.subtitle }]}>该字母暂无可浏览的单词</Text>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.tint }]}
            onPress={backToPick}
            activeOpacity={0.8}
          >
            <Text style={[styles.primaryBtnText, { color: colors.onTint }]}>返回</Text>
          </TouchableOpacity>
        </View>
      );
    }
    const isLast = reviewIdx + 1 >= letterWords.length;
    return (
      <View style={styles.root}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={backToPick} hitSlop={8}>
            <FontAwesome name="chevron-left" size={16} color={colors.tint} />
            <Text style={[styles.backText, { color: colors.tint }]}>返回</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]}>快速浏览 · {letter}</Text>
          <TouchableOpacity onPress={beginPractice} hitSlop={8}>
            <Text style={[styles.skipText, { color: colors.tint }]}>跳过复习</Text>
          </TouchableOpacity>
        </View>
        <Text style={[styles.hint, { color: colors.subtitle }]}>
          第 {reviewIdx + 1} / {letterWords.length} 词 · 点击卡片查看释义
        </Text>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.reviewBody}>
          <FlashCard key={current.id} word={current} language={ENGLISH} />
        </ScrollView>
        <View style={styles.reviewNav}>
          <TouchableOpacity
            style={[styles.navBtn, { borderColor: colors.border }, reviewIdx === 0 && styles.dimmed]}
            disabled={reviewIdx === 0}
            onPress={goPrevWord}
            activeOpacity={0.7}
          >
            <Text style={[styles.navBtnText, { color: colors.text }]}>上一词</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.navBtn, { backgroundColor: colors.tint, borderColor: colors.tint }]}
            onPress={isLast ? beginPractice : goNextWord}
            activeOpacity={0.8}
          >
            <Text style={[styles.navBtnText, { color: colors.onTint }]}>
              {isLast ? '开始练习' : '下一词'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ===== ③ 释义选择 / ④ 单词默写 =====
  if (stage === 'choice' || stage === 'dictation') {
    const isChoice = stage === 'choice';
    return (
      <View style={styles.root}>
        <Text style={[styles.stageTitle, { color: colors.text }]}>
          {isChoice ? '释义选择' : '单词默写'} · {letter ?? ''}
        </Text>
        <QuizRunner
          // 两阶段强制重挂：避免复用实例时残留上一阶段的题目与成绩
          key={isChoice ? 'first-letter-choice' : 'first-letter-dictation'}
          range="custom"
          opts={{ wordIds: isChoice ? choiceWordIds : dictationWordIds }}
          types={[isChoice ? 'choice' : 'dictation']}
          skipTool={{ label: '跳过已掌握', resolve: resolveRemaining }}
          onExit={(correct, total) => {
            if (correct === undefined) {
              // 中途退出（返回按钮确认）：回字母选择并重置本次剔除累积
              backToPick();
              return;
            }
            if (isChoice) afterChoice(correct, total ?? 0);
            else afterDictation(correct, total ?? 0);
          }}
        />
      </View>
    );
  }

  // ===== 完成汇总 =====
  const pctText = (score: StageScore | null) =>
    score && score.total > 0
      ? `${score.correct} / ${score.total} · ${Math.round((score.correct / score.total) * 100)}%`
      : '未进行';
  return (
    <View style={styles.root}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.doneBody}>
        <Text style={[styles.doneTitle, { color: colors.text }]}>
          首字母 {letter ?? ''} 训练完成
        </Text>
        <View style={[styles.scoreCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.scoreRow}>
            <Text style={[styles.scoreLabel, { color: colors.subtitle }]}>释义选择</Text>
            <Text style={[styles.scoreValue, { color: colors.text }]}>{pctText(choiceScore)}</Text>
          </View>
          <View style={[styles.scoreDivider, { backgroundColor: colors.border }]} />
          <View style={styles.scoreRow}>
            <Text style={[styles.scoreLabel, { color: colors.subtitle }]}>单词默写</Text>
            <Text style={[styles.scoreValue, { color: colors.text }]}>{pctText(dictationScore)}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: colors.tint }]}
          onPress={() => letter && startLetter(letter)}
          activeOpacity={0.8}
        >
          <Text style={[styles.primaryBtnText, { color: colors.onTint }]}>再练本字母</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.primaryBtn, { borderWidth: 1, borderColor: colors.border }]}
          onPress={() => setStage('pick')}
          activeOpacity={0.8}
        >
          <Text style={[styles.primaryBtnText, { color: colors.text }]}>换个字母</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.textBtn} onPress={onExit}>
          <Text style={[styles.textBtnText, { color: colors.subtitle }]}>返回练习</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingHorizontal: 20,
  },
  errorTitle: { fontSize: 18, fontWeight: '700' },
  errorSub: { fontSize: 14, textAlign: 'center' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 10,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 56 },
  backText: { fontSize: 15, fontWeight: '600' },
  title: { fontSize: 20, fontWeight: '700', flexShrink: 1 },
  topBarSpacer: { minWidth: 56 },
  skipText: { fontSize: 14, fontWeight: '600' },
  hint: { fontSize: 12.5, lineHeight: 18, paddingHorizontal: 20, marginBottom: 12 },
  scroll: { flex: 1 },
  gridContent: { paddingHorizontal: 20, paddingBottom: 40 },
  letterGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  letterCell: {
    flexBasis: '17%',
    flexGrow: 0,
    aspectRatio: 1,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  dimmed: { opacity: 0.35 },
  letterText: { fontSize: 18, fontWeight: '700' },
  letterCount: { fontSize: 11 },
  reviewBody: { paddingHorizontal: 20, paddingBottom: 8 },
  reviewNav: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingVertical: 14 },
  navBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  navBtnText: { fontSize: 15, fontWeight: '700' },
  stageTitle: {
    fontSize: 18,
    fontWeight: '700',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 2,
  },
  doneBody: { alignItems: 'center', gap: 12, padding: 24, paddingTop: 40 },
  doneTitle: { fontSize: 22, fontWeight: '800', marginBottom: 6, textAlign: 'center' },
  scoreCard: {
    width: '100%',
    maxWidth: 420,
    borderWidth: 1,
    borderRadius: 12,
    padding: 18,
    gap: 12,
    marginBottom: 8,
  },
  scoreRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  scoreLabel: { fontSize: 14 },
  scoreValue: { fontSize: 16, fontWeight: '700' },
  scoreDivider: { height: 1, width: '100%' },
  primaryBtn: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: { fontSize: 15, fontWeight: '700' },
  textBtn: { paddingVertical: 8 },
  textBtnText: { fontSize: 14, fontWeight: '600' },
});
