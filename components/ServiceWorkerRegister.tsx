'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          console.log('[PWA] 서비스워커 등록 성공:', registration.scope);
        })
        .catch((error) => {
          console.log('[PWA] 서비스워커 등록 실패:', error);
        });
    }
  }, []);

  return null;
}
