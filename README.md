# duckTracker

유튜브 영상 저장 및 저장 여부 확인 가능한 크롬 익스텐션

### server
- Todo
  - [ ] env 추가 : 저장 경로, 선호 format 등 설정
  - [ ] websocket 사용 

### extension
- Todo
  - [ ] 디자인 변경
  - [ ] 사이드 패널 추가 (다운로드 현황 및 이력 목록)
  - [ ] option 삭제, popup에서 옵션 설정하도록 수정
    - 저장 방식 변경 가능하도록 수정 (local / sync)
  - Toolbar
    - [ ] 검색 결과 페이지 적용
    - [ ] 간헐적으로 추가 안되는 이슈 확인


### ISSUES

25.07.07 - 쿠키 사용 필수
- 17:39분부터 쿠키를 사용하지 않는 경우, title이 비정상적으로 적용됨.
- solution for mac
  - ~/.config/yt-dlp/config 파일 >>  --cookies-from-browser chrome (browser에 따라 다름.)
