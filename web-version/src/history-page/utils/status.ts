export function getStatusLabel(status: string | undefined): string {
    if (!status) {
        return 'unknown';
    }

    switch (status) {
        case 'completed':
            return '완료';
        case 'downloading':
            return '다운로드 중';
        case 'queued':
            return '대기 중';
        case 'error':
            return '오류';
        case 'format-select':
            return '포맷 선택 필요';
        case 'stop':
            return '중지됨';
        default:
            return status;
    }
}

