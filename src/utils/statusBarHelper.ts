import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

let isOverlayConfigured = false;

/**
 * 平台安全的状态栏与沉浸式显示控制器
 * 支持 Android / iOS 原生端及 Web 端自适应联动
 */
export async function setupStatusBar(isDarkMode: boolean): Promise<void> {
  // 1. 同步 Web 端浏览器顶部主题色 meta 标签
  try {
    const metaThemeColor = document.getElementById('theme-color-meta');
    const color = isDarkMode ? '#141414' : '#ffffff';
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', color);
    } else {
      const meta = document.createElement('meta');
      meta.id = 'theme-color-meta';
      meta.name = 'theme-color';
      meta.content = color;
      document.head.appendChild(meta);
    }
  } catch (e) {
    // 忽略非 DOM 环境错误
  }

  // 2. 原生 App 端（Capacitor Android / iOS）沉浸式状态栏与图标反色
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  try {
    // 首次开启状态栏透明浮于 Web 视图上方（沉浸式 Edge-to-Edge）
    if (!isOverlayConfigured) {
      await StatusBar.setOverlaysWebView({ overlay: true });
      await StatusBar.setBackgroundColor({ color: '#00000000' });
      isOverlayConfigured = true;
    }

    // Style.Dark 表示白字白图标（适合深色背景）
    // Style.Light 表示深字深图标（适合浅色背景）
    await StatusBar.setStyle({
      style: isDarkMode ? Style.Dark : Style.Light,
    });
  } catch (error) {
    console.warn('[StatusBar] Failed to set native status bar style:', error);
  }
}
