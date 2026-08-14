// 布局与尺寸规范常量：新写的组件/页面统一从这里取值，
// 避免 padding 12/14/16/18/20/24、圆角 6/10/12/14/16/20 混用。
export const Layout = {
  // 桌面 Web 内容最大宽度，超出后居中留白
  maxContentWidth: 560,
  // 页面左右留白
  pagePadding: 20,
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
  },
  radius: {
    sm: 6,
    md: 10,
    lg: 14,
    xl: 20,
  },
};

export default Layout;
