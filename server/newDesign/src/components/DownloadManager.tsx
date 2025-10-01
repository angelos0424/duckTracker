import { useState, useMemo } from "react";
import { SearchHeader } from "./SearchHeader";
import { DownloadTable, DownloadItem } from "./DownloadTable";
import { DownloadCard } from "./DownloadCard";
import { Button } from "./ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

// 모의 데이터
const mockDownloads: DownloadItem[] = [
  {
    id: '1',
    title: '[4K 페이스캠 하이라이트] fromis_9 (프로미스나인) 송하영 \'LIKE YOU BETTER\' (fromis_9 SONG HA YOUNG FACECAM) | 하이 업데이트!',
    url: 'https://youtu.be/Vq1JqH6Y2al=VXWuvSXkdhBUC',
    status: 'completed',
    progress: 100,
    requestDate: '2025-09-30\n12:09:33',
    createdDate: '2025-09-30\n12:09:59'
  },
  {
    id: '2',
    title: '프나형 성장 그래프 그래픽 사절 ? ㅓㅣ | 마라 7주년 국보만 젊 본다녕 | #프로미스나인 #fromis_9 | 서뇸따커3 [9xCPpX3PewM].webm',
    url: 'https://youtu.be/9xCPpX3PewMfalv=jUVR8X_D855MnSh',
    status: 'completed',
    progress: 100,
    requestDate: '2025-09-30\n11:40:32',
    createdDate: '2025-09-30\n12:26:00'
  },
  {
    id: '3',
    title: '[웹미앙엔 입덕 영상] ❤ 물라도 ❤ 빅치챙 ❤ 아이스끼어 ❤ 물라도 ❤ 빅치챙 ❤ 아이스끼어 [1T9M5XBhZW4].webm',
    url: 'https://www.youtube.com/watch?v=1T9M5XBhZW4',
    status: 'completed',
    progress: 100,
    requestDate: '2025-09-30\n09:54:10',
    createdDate: '2025-09-30\n12:05:03'
  },
  {
    id: '4',
    title: '어제 아니광 열음 보고 졸피웍 일분 뇨갠번 #nagyung #leenagyung #fromis_9 #fromis9 [athe구름HDi].webm',
    url: 'https://www.youtube.com/shorts/atheYEVEiDk',
    status: 'completed',
    progress: 100,
    requestDate: '2025-09-30\n09:53:36',
    createdDate: '2025-09-30\n10:50:00'
  },
  {
    id: '5',
    title: '[4K] 250923 프로미스나인 송하영 ぬんでもないや (아무것도 아니야) 직캠 @2025 fromis_9 WORLD TOUR [NOW TOMORROW.] IN JAPAN [나_일]',
    url: 'https://www.youtube.com/watch?v=U_-FOQgdels',
    status: 'downloading',
    progress: 65,
    requestDate: '2025-09-30\n09:52:43',
    createdDate: '2025-09-30\n10:50:00'
  },
  {
    id: '6',
    title: '[프로미스나인 직캠] LOVE BOMB 러브밤 fromis_9 구글 여름축제 2024',
    url: 'https://www.youtube.com/watch?v=example6',
    status: 'pending',
    progress: 0,
    requestDate: '2025-09-30\n08:30:15',
    createdDate: '2025-09-30\n08:30:15'
  },
  {
    id: '7',
    title: '프로미스나인 (fromis_9) - DM 뮤직비디오 메이킹 필름',
    url: 'https://www.youtube.com/watch?v=example7',
    status: 'failed',
    progress: 0,
    requestDate: '2025-09-29\n15:22:10',
    createdDate: '2025-09-29\n15:22:10'
  }
];

export function DownloadManager() {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // 검색 필터링
  const filteredItems = useMemo(() => {
    return mockDownloads.filter(item =>
      item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.url.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [searchTerm]);

  // 페이지네이션
  const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedItems = filteredItems.slice(startIndex, startIndex + itemsPerPage);

  const handlePlay = (id: string) => {
    console.log('Play download:', id);
  };

  const handlePause = (id: string) => {
    console.log('Pause download:', id);
  };

  const handleDelete = (id: string) => {
    console.log('Delete download:', id);
  };

  const handleRefresh = () => {
    console.log('Refresh downloads');
  };

  const handleAddDownload = () => {
    console.log('Add new download');
  };

  return (
    <div className="max-w-7xl mx-auto p-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">다운로드 관리</h1>
        <p className="text-gray-600">파일 다운로드 상태를 관리하고 모니터링합니다.</p>
      </div>

      <SearchHeader
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        onRefresh={handleRefresh}
        onAddDownload={handleAddDownload}
      />

      <DownloadTable
        items={paginatedItems}
        onPlay={handlePlay}
        onPause={handlePause}
        onDelete={handleDelete}
      />

      <DownloadCard
        items={paginatedItems}
        onPlay={handlePlay}
        onPause={handlePause}
        onDelete={handleDelete}
      />

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <div className="text-sm text-gray-600">
            총 {filteredItems.length}건 중 {startIndex + 1}-{Math.min(startIndex + itemsPerPage, filteredItems.length)}건 표시
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="w-4 h-4" />
              이전
            </Button>
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                <Button
                  key={page}
                  variant={currentPage === page ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCurrentPage(page)}
                  className="w-8 h-8 p-0"
                >
                  {page}
                </Button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
            >
              다음
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}