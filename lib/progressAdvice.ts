// 学习建议规则引擎（纯函数，无副作用，便于单测与规则迭代）。
// 输入为进度页聚合好的数据，输出按优先级排列的建议条目。

export interface AdviceItem {
  kind: 'due' | 'weak' | 'plan' | 'peak' | 'good';
  text: string;
  /** 可点击触发的动作（进度页据此绑定按钮） */
  action?: 'review' | 'practice';
}

export interface AdviceInput {
  dueNow: number;               // 当前到期待复习词数
  weakCount: number;            // 薄弱词数
  remainingNew: number;         // 词本剩余未学词数
  targetFinishDate: string | null; // ISO yyyy-mm-dd（用户设定的目标完成日期）
  avgDailyNew7d: number;        // 近 7 天日均新学词数
  dueNext3Days: number[];       // [明天, 后天, 大后天] 到期词数
  now: number;
}

const DAY = 24 * 60 * 60 * 1000;
const PEAK_THRESHOLD = 50;

function daysUntil(iso: string, now: number): number {
  // 按日历日差计算（目标日当天 = 0 天剩余缓冲，需当天完成）
  const target = new Date(`${iso}T00:00:00`).getTime();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today.getTime()) / DAY);
}

export function buildAdvice(input: AdviceInput): AdviceItem[] {
  const items: AdviceItem[] = [];

  // 1) 到期提醒
  if (input.dueNow > 0) {
    items.push({
      kind: 'due',
      text: `有 ${input.dueNow} 个单词已到复习时间，建议先完成复习再学新词`,
      action: 'review',
    });
  }

  // 2) 薄弱词加练
  if (input.weakCount > 0) {
    items.push({
      kind: 'weak',
      text: `有 ${input.weakCount} 个薄弱词需要加强，建议来一轮专项练习`,
      action: 'practice',
    });
  }

  // 3) 学习量规划（目标日期倒推 / 均速推算）
  if (input.remainingNew > 0) {
    if (input.targetFinishDate) {
      const left = daysUntil(input.targetFinishDate, input.now);
      if (left <= 0) {
        items.push({
          kind: 'plan',
          text: `目标完成日期已过，词本还剩 ${input.remainingNew} 个新词，建议重新设定目标日期`,
        });
      } else {
        const perDay = Math.ceil(input.remainingNew / left);
        const tomorrowDue = input.dueNext3Days[0] ?? 0;
        const mmdd = input.targetFinishDate.slice(5).replace('-', '月') + '日';
        items.push({
          kind: 'plan',
          text: `要在 ${mmdd} 完成词本，每天需新学约 ${perDay} 词${tomorrowDue > 0 ? `（明天另有约 ${tomorrowDue} 词到期复习）` : ''}，剩余 ${input.remainingNew} 词`,
        });
      }
    } else if (input.avgDailyNew7d > 0) {
      const days = Math.ceil(input.remainingNew / input.avgDailyNew7d);
      items.push({
        kind: 'plan',
        text: `按当前节奏（日均 ${Math.round(input.avgDailyNew7d)} 词），预计还需 ${days} 天学完本词本（剩 ${input.remainingNew} 词）`,
      });
    }
  }

  // 4) 复习高峰预警
  const dayLabels = ['明天', '后天', '大后天'];
  input.dueNext3Days.forEach((n, i) => {
    if (n > PEAK_THRESHOLD) {
      items.push({
        kind: 'peak',
        text: `${dayLabels[i]}将有 ${n} 个词到期复习，建议今天新词量适当控制，预留复习时间`,
      });
    }
  });

  // 5) 全绿
  if (items.length === 0) {
    items.push({ kind: 'good', text: '状态很好，保持当前学习节奏！' });
  }

  return items;
}
