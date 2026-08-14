const goldAccent = '#D4A853';
const deepGold = '#C89B3C';

// 语义色：全站共用的状态色，禁止再散落硬编码
export const semantic = {
  success: '#30A46C',
  warning: '#F5A623',
  danger: '#E5484D',
  info: '#3B82F6',
};

// 产品锁定暗色主题（useColorScheme 强制返回 'dark'）。
// light 分支已移除：此前大量组件写死暗色值，浅色模式会破版。
const dark = {
  text: '#E8E0D4',
  background: '#0D0D0D',
  tint: goldAccent,
  tabIconDefault: '#4A4540',
  tabIconSelected: goldAccent,
  card: '#1A1814',
  border: '#2A2520',
  subtitle: '#8C8478',
  pinyin: '#9C9488',
  accent: deepGold,
  shadow: '#00000060',
  inputBackground: '#141210',
  // 金色主按钮上的文字色
  onTint: '#0D0D0D',
  ...semantic,
};

export default { dark };
