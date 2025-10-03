## 목적
- 현재 프로젝트의 구조를 개선하고자 합니다. 아래 태스크를 순서대로 진행해주세요.
- 아래 태스크를 순차적으로 진행하면서 하나가 종료되면 종료 표시를 해주고 간략하게 작업 내역을 추가해주세요
- 라이브러리의 추가가 필요한 경우, 사용 여부를 물어보고 진행해주세요

### task 1 ✅
- src/index.ts:1 한 파일에서 설정 초기화, HTTP 라우팅, 파일 스트리밍, WebSocket 브로드캐스트, DB 접근까지 모두 다루고 있어 유지·보수가 어렵습니다.
  config, http/router, handlers/history, services/downloads, websocket 등으로 모듈을 쪼개고, 엔트리에서는 서버 부트스트랩만 담당하도록 분리하는 편이 좋습니다.
- 완료: `src/index.ts`를 부트스트랩 전용으로 축소하고 `src/http/**`, `src/history/files.ts`, `src/websocket/message-handler.ts`로 라우팅과 히스토리 로직을 분리했습니다.

### task 2 ✅
- 히스토리 페이지 컴포넌트가 서버 렌더링 버전(src/history-page/components/
  AddDownloadDialog.tsx:1)과 클라이언트 버전(src/history-page/client/
  components/AddDownloadDialog.tsx:1)으로 거의 동일한 JSX를 중복 보유합니다.
  공통 UI를 shared/components로 올리고, 클라이언트 전용 훅·상태만 래핑하는 방식으로 중복을 줄이면 번들 크기와 유지 비용을 함께 낮출 수 있습니다.
- 완료: `src/history-page/shared/components/AddDownloadDialog.tsx`에 공통 UI를 두고 서버/클라이언트 컴포넌트는 래퍼로 단순화했습니다.

### task 3 ✅
- 정적 자산 로더가 src/history-page-assets.ts:13에서 경로 후보 배열을 반복 선언하고 fs.existsSync 체크를 여러 번 수행합니다. 빌드 단계에서 dist/, history/assets 같은 고정 폴더에 CSS/JS를 모으고, 런타임에는 단일 경로만 참조하도록 리팩터링하면 로딩 경로가 명확해지고 esbuild 의존성이 서버 실행 시점에 필요하지 않게 됩니다.
- 완료: 빌드 스크립트에서 `dist/history/assets/`로 JS·CSS를 정리하고 런타임 로더는 해당 폴더만 읽도록 단순화했습니다.

### task 4 ✅
- src/utils는 현재 비어 있고, 루트에 .DS_Store, 실행 산출물 디렉터리 (downloads/)가 그대로 남아 있습니다. 사용하지 않는 디렉터리는 제거하고, .gitignore(예: 서버 레벨에 추가)로 OS 산출물과 런타임 파일을 배제해 저장소를 정리해 주세요.
- 완료: 비어 있던 `src/utils/`를 제거하고 `.gitignore`에 `.DS_Store`, `downloads/`를 추가해 불필요한 산출물을 배제했습니다.
