const CACHE_NAME = 'nuldam-cx-v1';

// 캐시할 정적 자원 (앱 셸)
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/apple-touch-icon.png',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
];

// 설치: 정적 자원 캐시
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] 정적 자원 캐싱 중...');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// 활성화: 이전 캐시 정리
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// 요청 가로채기: Network-first 전략 (CX 데이터는 항상 최신이어야 하므로)
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // API 요청은 항상 네트워크 우선
  if (request.url.includes('/api/')) {
    event.respondWith(
      fetch(request).catch(() => {
        return new Response(
          JSON.stringify({ error: '오프라인 상태입니다. 네트워크를 확인해주세요.' }),
          { headers: { 'Content-Type': 'application/json' }, status: 503 }
        );
      })
    );
    return;
  }

  // 페이지/정적 자원: Network-first, 실패 시 캐시
  event.respondWith(
    fetch(request)
      .then((response) => {
        // 성공하면 캐시에도 저장
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // 네트워크 실패 시 캐시에서 가져오기
        return caches.match(request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;

          // 페이지 요청인 경우 메인 페이지 캐시 반환
          if (request.mode === 'navigate') {
            return caches.match('/');
          }

          return new Response('오프라인', { status: 503 });
        });
      })
  );
});
