import Colors from './Colors';
import type { Grade } from '@/lib/sm2';

// 学习/复习评分按钮：学习页与进度页共用，避免重复定义
export interface GradeOption {
  grade: Grade;
  label: string;
  cn: string;
  color: string;
}

export const GRADES: GradeOption[] = [
  { grade: 0, label: 'Again', cn: '不会', color: Colors.dark.danger },
  { grade: 1, label: 'Hard', cn: '模糊', color: Colors.dark.warning },
  { grade: 2, label: 'Good', cn: '认识', color: Colors.dark.success },
  { grade: 3, label: 'Easy', cn: '很熟', color: Colors.dark.info },
];

export default GRADES;
