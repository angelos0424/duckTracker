YouTube 페이지 구조

## 공통경로 - 현재 페이지의 내용에서, 동영상, 숏츠 등은 아래 경로로 접근.
// 페이지 이동 시 기존 ytd-browse는 hidden 처리 되고 현재 페이지와 관련된 ytd-browse가 추가됨.
// 검색 결과는 ytd-browse가 아니라 ytd-search
- ytd-app > div#content > ytd-page-manager#page-manager

## 페이지별
1. 메인 페이지(https://www.youtube.com/) : querySelector(공통경로 > ytd-browse:not([hidden]) div#contents) // 스크롤 시 div#contents에 동영상, 숏츠, 재생목록등이 추가됨.
   2. 동영상 : 메인페이지.querySelectorAll(ytd-rich-item-renderer ytd-thumbnail > a#thumbnail)
   3. 숏츠 : 메인페이지.querySelectorAll('ytd-rich-section-renderer ytd-rich-item-renderer ytm-shorts-lockup-view-model > a')
   4. 재생목록||믹스 : 메인페이지.querySelectorAll(ytd-rich-item-renderer > div#content > yt-lockup-view-model > div > a)
2. 검색 페이지(https://www.youtube.com/results) : querySelector(공통경로 > ytd-search ytd-item-section-renderer) 
   1. 동영상 ytd-video-renderer > div#dismissible > ytd-thumbnail > a#thumbnail.href
   2. 숏츠 ytd-reel-shelf-renderer ytm-shorts-lockup-view-model-v2 > ytm-shorts-lockup-view-model > a.href
   3. 재생목록||믹스 yt-lockup-view-model > div > a.href

3. 동영상 단일 페이지(https://www.youtube.com/watch) querySelector(공통경로 > ytd-watch-flexy.video-id) (다른데선 video-id가 없고 hidden임)
4. 숏츠 단일 페이지(https://www.youtube.com/shorts) querySelector(공통경로 > ytd-shorts > div#shorts-container ytd-reel-video-renderer#reel-video-renderer ytd-player#player a.ytp-title-link.href)
5. 재생목록(https://www.youtube.com/feed/playlists) querySelectorAll(공통경로 > ytd-rich-item-renderer > div#content > yt-lockup-view-model > div > a.href)
6. 채널 메인 페이지(https://www.youtube.com/@{channel_name}) > 일부러 안함.
   7. 동영상탭 (https://www.youtube.com/@{channel_name}/videos)
   8. 숏츠 (https://www.youtube.com/@{channel_name}/shorts)
7. 시청기록(https://www.youtube.com/feed/history) :: Todo