import { useEffect } from 'react';
import { App } from '@capacitor/app';

export type BackActionHandler = () => boolean;

interface RegisteredHandler {
  id: string;
  priority: number;
  handler: BackActionHandler;
}

const handlers: RegisteredHandler[] = [];
let lastBackPressTime = 0;
let exitToastTimer: ReturnType<typeof setTimeout> | null = null;
let isInitialized = false;

/**
 * 注册一个返回按键监听处理器
 * @param id 唯一标识符
 * @param priority 优先级数值（越大越先执行，例如浮层 100 > 弹窗 50 > 基础导航 10）
 * @param handler 返回 true 表示已消费此返回事件，阻断后续低优先级动作
 * @returns 销毁注销函数
 */
export function registerBackAction(
  id: string,
  priority: number,
  handler: BackActionHandler
): () => void {
  // 移除已有相同 ID 的项
  const existingIdx = handlers.findIndex((item) => item.id === id);
  if (existingIdx >= 0) {
    handlers.splice(existingIdx, 1);
  }

  handlers.push({ id, priority, handler });
  // 依 priority 降序排列
  handlers.sort((a, b) => b.priority - a.priority);

  return () => {
    const idx = handlers.findIndex((item) => item.id === id);
    if (idx >= 0) {
      handlers.splice(idx, 1);
    }
  };
}

/**
 * 触发全局返回逻辑：按优先级依序调用已注册的处理器，直至某一处理器消费返回事件
 * @returns 是否成功在 App 内消费了返回操作（关闭了弹窗、抽屉或浮层）
 */
export function handleGlobalBack(): boolean {
  for (const item of handlers) {
    try {
      if (item.handler()) {
        return true;
      }
    } catch (err) {
      console.error(`[BackButtonManager] Error running handler ${item.id}:`, err);
    }
  }
  return false;
}

/**
 * 在屏幕底部展示轻量级提示「再按一次退出栞」
 */
function showExitToast() {
  let toastEl = document.getElementById('shiori-back-exit-toast');
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.id = 'shiori-back-exit-toast';
    toastEl.className = 'shiori-back-exit-toast';
    toastEl.textContent = '再按一次退出栞';
    document.body.appendChild(toastEl);
  }

  toastEl.classList.add('visible');
  if (exitToastTimer) {
    clearTimeout(exitToastTimer);
  }
  exitToastTimer = setTimeout(() => {
    toastEl?.classList.remove('visible');
  }, 2000);
}

/**
 * 初始化 Capacitor 原生环境与 Web 环境下的手机返回键/手势返回事件监听
 */
export function initBackButtonManager(): () => void {
  if (isInitialized) {
    return () => {};
  }
  isInitialized = true;

  // 将全局分发句柄挂载到 window，供 Android 原生 evaluateJavascript 直接调用
  (window as any).handleAppBackButton = handleGlobalBack;

  // 1. 监听 Capacitor App 插件的 Android 原生返回键与边缘手势事件
  let appListenerRemove: (() => void) | null = null;
  try {
    App.addListener('backButton', () => {
      const handled = handleGlobalBack();
      if (handled) {
        return;
      }

      // 如果当前聚焦在输入框，优先收起键盘与失去焦点
      if (
        document.activeElement instanceof HTMLElement &&
        (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')
      ) {
        document.activeElement.blur();
        return;
      }

      // 无任何弹窗或焦点时，双击返回安全退出
      const now = Date.now();
      if (now - lastBackPressTime < 2000) {
        App.exitApp();
      } else {
        lastBackPressTime = now;
        showExitToast();
      }
    }).then((handle) => {
      appListenerRemove = () => handle.remove();
    }).catch(() => {
      // 非 Capacitor 原生环境（如浏览器预览）安全忽略
    });
  } catch {
    // 忽略
  }

  // 2. 监听标准 Cordova / Web 文档 backbutton 事件
  const docBackListener = (e: Event) => {
    e.preventDefault();
    handleGlobalBack();
  };
  document.addEventListener('backbutton', docBackListener);

  // 3. 监听自定义 appBackButton 事件
  const customBackListener = (e: Event) => {
    e.preventDefault();
    handleGlobalBack();
  };
  window.addEventListener('appBackButton', customBackListener);

  // 4. 监听键盘 Escape 键（在桌面或浏览器端测试时获得完全一致的返回体验）
  const keydownListener = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      const handled = handleGlobalBack();
      if (handled) {
        e.preventDefault();
      }
    }
  };
  window.addEventListener('keydown', keydownListener);

  return () => {
    if (appListenerRemove) appListenerRemove();
    document.removeEventListener('backbutton', docBackListener);
    window.removeEventListener('appBackButton', customBackListener);
    window.removeEventListener('keydown', keydownListener);
    isInitialized = false;
  };
}

/**
 * React 组件使用的便捷返回监听 Hook
 * 当 isOpen 为 true 时自动将 onClose 纳入返回栈；组件卸载或 isOpen 变为 false 时自动出栈
 */
export function useBackButton(
  id: string,
  isOpen: boolean,
  onClose: () => void,
  priority: number = 50
) {
  useEffect(() => {
    if (!isOpen) return;

    return registerBackAction(id, priority, () => {
      onClose();
      return true;
    });
  }, [id, isOpen, onClose, priority]);
}
