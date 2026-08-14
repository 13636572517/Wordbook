// 产品锁定暗色主题：部分组件存在暗色硬编码值，系统浅色模式下会破版，
// 因此统一返回 'dark'，不再跟随系统外观。未来若要恢复浅色主题，
// 需先完成全站颜色 token 化再放开此限制。
export function useColorScheme(): 'dark' {
  return 'dark';
}
