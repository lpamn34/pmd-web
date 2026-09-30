// 실행 환경: 내 컴퓨터에서 테스트(개발) / 실제 사이트(서비스)
// 개발 중에 만든 테스트 계정·구조 요청이 실제 플레이어 쪽에 섞이지 않도록, 온라인 기능은 환경마다 다른 Firebase 프로젝트에 연결한다.
'use strict';

const ENV = location.protocol === 'file:' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) ? 'dev' : 'prod';

// Firebase 설정: 프로젝트를 만든 뒤 콘솔의 "웹 앱 설정" 값을 붙여 넣는다 (이 값은 공개되어도 되는 값이다)
// 둘 다 무료 요금제(Spark)로만 사용한다. Blaze로 업그레이드하지 않는다.
const FIREBASE_CONFIG = {
  // 개발용 프로젝트 (localhost / 파일로 열었을 때)
  dev: {
    apiKey: 'AIzaSyC9ojnyB6RGPNrFN7oX0tnev6XHUXjUV88',
    authDomain: 'pmd-web-dev.firebaseapp.com',
    projectId: 'pmd-web-dev',
    storageBucket: 'pmd-web-dev.firebasestorage.app',
    messagingSenderId: '616176015485',
    appId: '1:616176015485:web:80eda5ff81f6226700b914',
  },
  // 서비스용 프로젝트 (GitHub Pages 사이트)
  prod: {
    apiKey: 'AIzaSyC7P5xmsOcNr0ruNpDKxCY_cZySwhUNNKA',
    authDomain: 'pmd-web-43713.firebaseapp.com',
    projectId: 'pmd-web-43713',
    storageBucket: 'pmd-web-43713.firebasestorage.app',
    messagingSenderId: '955480535200',
    appId: '1:955480535200:web:10b20c39b5c857153619c5',
  },
};
const ONLINE_CONFIG = FIREBASE_CONFIG[ENV];
