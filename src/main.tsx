import { StrictMode, useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { DebugInspector } from './components/Debug/DebugInspector.tsx';
import { initAsyncFontLoading } from './utils/fontLoader.ts';

// 启动异步平滑字体加载（确保首屏秒开不卡顿，后台空闲自动就绪）
initAsyncFontLoading();

function Root() {
  const isDebugUrl = () => {
    if (typeof window === 'undefined') return false;
    const hash = window.location.hash.toLowerCase();
    return hash === '#/debug' || hash === '#debug' || window.location.search.includes('debug=true');
  };

  const [isDebug, setIsDebug] = useState(isDebugUrl());

  useEffect(() => {
    const handleHashChange = () => {
      setIsDebug(isDebugUrl());
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  if (isDebug) {
    return <DebugInspector />;
  }

  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
