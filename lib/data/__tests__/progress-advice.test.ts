import assert from 'node:assert';
import { buildAdvice } from '../../progressAdvice';
import type { AdviceInput } from '../../progressAdvice';

const DAY = 86400000;
const NOW = Date.parse('2026-08-11T12:00:00Z');

function base(over: Partial<AdviceInput> = {}): AdviceInput {
  return {
    dueNow: 0, weakCount: 0, remainingNew: 0,
    targetFinishDate: null, avgDailyNew7d: 0,
    dueNext3Days: [0, 0, 0], now: NOW,
    ...over,
  };
}

// 1) 全绿 → good
{
  const items = buildAdvice(base({}));
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].kind, 'good');
}

// 2) 到期提醒
{
  const items = buildAdvice(base({ dueNow: 5 }));
  const due = items.find((i) => i.kind === 'due');
  assert.ok(due, 'should have due advice');
  assert.ok(due!.text.includes('5'));
  assert.strictEqual(due!.action, 'review');
}

// 3) 薄弱词加练
{
  const items = buildAdvice(base({ weakCount: 3 }));
  const weak = items.find((i) => i.kind === 'weak');
  assert.ok(weak, 'should have weak advice');
  assert.ok(weak!.text.includes('3'));
  assert.strictEqual(weak!.action, 'practice');
}

// 4) 目标日期倒推：剩 100 词，5 天后到期 → 每天 20
{
  const target = new Date(NOW + 5 * DAY).toISOString().slice(0, 10);
  const items = buildAdvice(base({ remainingNew: 100, targetFinishDate: target, dueNext3Days: [10, 0, 0] }));
  const plan = items.find((i) => i.kind === 'plan');
  assert.ok(plan, 'should have plan advice');
  assert.ok(plan!.text.includes('20'), `expected 20/day in: ${plan!.text}`);
}

// 5) 目标日期已过但仍有剩余 → 提示已过
{
  const target = new Date(NOW - 2 * DAY).toISOString().slice(0, 10);
  const items = buildAdvice(base({ remainingNew: 50, targetFinishDate: target }));
  const plan = items.find((i) => i.kind === 'plan');
  assert.ok(plan);
  assert.ok(plan!.text.includes('已过') || plan!.text.includes('剩余'));
}

// 6) 无目标日期按均速：剩 100 词、日均 10 → 还需 10 天
{
  const items = buildAdvice(base({ remainingNew: 100, avgDailyNew7d: 10 }));
  const plan = items.find((i) => i.kind === 'plan');
  assert.ok(plan);
  assert.ok(plan!.text.includes('10'));
}

// 7) 复习高峰预警：后天 60 词到期
{
  const items = buildAdvice(base({ dueNext3Days: [0, 60, 0] }));
  const peak = items.find((i) => i.kind === 'peak');
  assert.ok(peak, 'should have peak advice');
  assert.ok(peak!.text.includes('60'));
}

console.log('progress-advice.test.ts PASS');
