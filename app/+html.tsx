import { ScrollViewStyleReset } from 'expo-router/html';

// This file customizes the HTML shell for the web build (PWA support).
// It adds meta tags for iOS/Android "Add to Home Screen" experience.
export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
        />

        {/* PWA */}
        <meta name="theme-color" content="#0D0D0D" />
        <meta name="mobile-web-app-capable" content="yes" />

        {/* iOS PWA */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
        <meta name="apple-mobile-web-app-title" content="WordHoard" />
        <link rel="apple-touch-icon" href="/icon.png" />

        {/* Android PWA */}
        <meta name="application-name" content="WordHoard" />

        {/* Description */}
        <meta
          name="description"
          content="WordHoard - 智能背单词工具，支持多词本、SM-2 复习调度、薄弱词重练"
        />

        <ScrollViewStyleReset />
      </head>
      <body style={{ backgroundColor: '#0D0D0D', margin: 0 }}>
        {children}
      </body>
    </html>
  );
}
