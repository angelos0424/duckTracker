import * as React from 'react';
import { DownloadRecord } from '../../shared/types';
import ConfirmDialog from './ConfirmDialog';
import UrlInputDialog from './UrlInputDialog';
import { useIPC, useIPCEvents } from '../hooks/useIPC';
import { useTranslation } from '../hooks/useTranslation';
import { extractUrlId } from '../../shared/utils/urlParser';

// MUI Imports
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import { Box, Button, Typography, LinearProgress, Chip, IconButton, Tooltip, Link, TextField } from '@mui/material';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

const CellBox: React.FC<{ children: React.ReactNode; alignItems?: 'flex-start' | 'center' | 'flex-end'; direction?: 'row' | 'column'; }> = ({ children, alignItems, direction }) => (
    <Box sx={{ display: 'flex', flexDirection: direction || 'column', alignItems: alignItems || 'flex-start', justifyContent: 'center', width: '100%', height: '100%', gap: 0.5 }}>
        {children}
    </Box>
);

const StatusFilter: React.FC<{ statusCounts: { [key: string]: number }; filterStatus: DownloadRecord['status'] | 'all'; setFilterStatus: (status: DownloadRecord['status'] | 'all') => void; t: (key: string, fallback?: string) => string; }> = ({ statusCounts, filterStatus, setFilterStatus, t }) => {
    const statuses: { key: DownloadRecord['status'] | 'all'; label: string }[] = [
        { key: 'all', label: t('history.filters.all', 'All') }, { key: 'downloading', label: t('history.filters.downloading', 'Downloading') }, { key: 'completed', label: t('history.filters.completed', 'Completed') }, { key: 'failed', label: t('history.filters.failed', 'Failed') },
        { key: 'pending', label: t('history.filters.pending', 'Pending') }, { key: 'cancelled', label: t('history.filters.cancelled', 'Cancelled') }, { key: 'queued', label: t('history.filters.queued', 'Queued') }, { key: 'check', label: t('history.filters.check', 'Check') }
    ];
    return (
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {statuses.map(({ key, label }) => {
                const variant: 'contained' | 'outlined' = filterStatus === key ? 'contained' : 'outlined';
                return (
                    <Button key={key} variant={variant} onClick={() => setFilterStatus(key)} size="small" sx={{ textTransform: 'none', minWidth: 'auto', px: 1, py: 0.5, borderRadius: 2 }}>
                        {label}
                        <Chip label={statusCounts[key]} size="small" sx={{ ml: 0.5, height: 18, fontSize: '0.7rem' }} />
                    </Button>
                );
            })}
        </Box>
    );
};

const DurationCell = React.memo(({ row }: { row: DownloadRecord }) => {
    const formatDuration = (startTime: string | Date, endTime?: string | Date) => {
        if (!endTime || !startTime) return '-';
        const duration = new Date(endTime).getTime() - new Date(startTime).getTime();
        if (duration < 0) return '-';
        const seconds = Math.floor(duration / 1000) % 60;
        const minutes = Math.floor(duration / (1000 * 60)) % 60;
        const hours = Math.floor(duration / (1000 * 60 * 60));
        if (hours > 0) return `${hours}h ${minutes}m`;
        if (minutes > 0) return `${minutes}m ${seconds}s`;
        return `${seconds}s`;
    };
    return <CellBox alignItems={'flex-end'}><Typography variant="body2" sx={{ fontSize: '0.75rem' }}>{formatDuration(row.startTime, row.endTime)}</Typography></CellBox>;
});

const ActionsCell = React.memo(({ row, onOpenFile, onRetry, ipc, handleSingleDelete, t }: { row: DownloadRecord; onOpenFile: (filePath: string) => void; onRetry: (id: string) => void; ipc: ReturnType<typeof useIPC>; handleSingleDelete: (id: string, title: string) => void; t: (key: string, fallback?: string) => string; }) => (
    <CellBox direction={"row"} alignItems={"center"}>
        {row.status === 'completed' && row.filePath && <Tooltip title={t('history.tooltips.open_location', 'Open file location' )}><IconButton size="small" onClick={() => onOpenFile(row.filePath!)}><FolderOpenIcon fontSize="small" /></IconButton></Tooltip>}
        {(row.status === 'pending' || row.status === 'downloading' || row.status === 'queued') && <Tooltip title={t('history.tooltips.stop_download', 'Stop download' )}><IconButton size="small" onClick={() => ipc.stopDownload(row.urlId)}><StopIcon fontSize="small" /></IconButton></Tooltip>}
        {!(row.status === 'pending' || row.status === 'downloading' || row.status === 'queued') && <Tooltip title={t('history.tooltips.retry_download', 'Retry download' )}><IconButton size="small" onClick={() => onRetry(row.id)}><PlayArrowIcon fontSize="small" /></IconButton></Tooltip>}
        <Tooltip title={t('history.tooltips.open_in_browser', 'Open URL in browser' )}><IconButton size="small" onClick={() => ipc.openExternalUrl(row.url)}><OpenInNewIcon fontSize="small" /></IconButton></Tooltip>
        <Tooltip title={t('history.tooltips.delete', 'Delete from history' )}><IconButton size="small" onClick={() => handleSingleDelete(row.id, row.title || '')}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
    </CellBox>
));

interface DownloadHistoryProps {
  downloads: DownloadRecord[];
  onDelete: (ids: string[]) => void;
  onOpenFile: (filePath: string) => void;
  onRetry: (id: string) => void;
  onRefresh: () => void;
}

const DownloadHistory: React.FC<DownloadHistoryProps> = React.memo(({ downloads, onDelete, onOpenFile, onRetry, onRefresh }) => {
    const [confirmDialog, setConfirmDialog] = React.useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void; type: 'danger' | 'warning' | 'info'; }>({ isOpen: false, title: '', message: '', onConfirm: () => {}, type: 'warning' });
    const [isUrlInputDialogOpen, setIsUrlInputDialogOpen] = React.useState(false);
    const [filterStatus, setFilterStatus] = React.useState<DownloadRecord['status'] | 'all'>('all');
    const [searchQuery, setSearchQuery] = React.useState('');
    const ipc = useIPC();
    const { t } = useTranslation();

    const statusCounts = React.useMemo(() => {
        const counts: Record<DownloadRecord['status'] | 'all', number> = { all: downloads.length, pending: 0, downloading: 0, completed: 0, failed: 0, cancelled: 0, queued: 0, check: 0 };
        downloads.forEach(d => { counts[d.status]++; });
        return counts;
    }, [downloads]);

    const handleAddDownload = React.useCallback(async (url: string) => {
        try {
            const urlInfo = extractUrlId(url);
            await ipc.startDownload(url, urlInfo.urlId);
        } catch (error) {
            console.error('Failed to start download:', error);
        } 
    }, [ipc]);

    const handleSingleDelete = React.useCallback((id: string, title: string) => {
        setConfirmDialog({
            isOpen: true,
            title: t('history.dialogs.delete_title', 'Delete Download'),
            message: t('history.dialogs.delete_message', 'Are you sure you want to delete "{title}"?').replace('{title}', title || t('history.status.unknown', 'Untitled')),
            onConfirm: () => {
                onDelete([id]);
                setConfirmDialog(prev => ({ ...prev, isOpen: false }));
            },
            type: 'danger'
        });
    }, [onDelete, t]);

    const filteredDownloads = React.useMemo(() => {
        let results = downloads;

        if (filterStatus !== 'all') {
            results = results.filter(download => download.status === filterStatus);
        }

        if (searchQuery) {
            const lowercasedQuery = searchQuery.toLowerCase();
            results = results.filter(download =>
                (download.title && download.title.toLowerCase().includes(lowercasedQuery)) ||
                (download.url && download.url.toLowerCase().includes(lowercasedQuery))
            );
        }

        return results;
    }, [downloads, filterStatus, searchQuery]);

    const columns: GridColDef<DownloadRecord>[] = React.useMemo(() => [
        { field: 'id', headerName: t('history.columns.id', 'ID'), width: 30, align: 'center', renderCell: (params) => <CellBox alignItems={'center'}><Tooltip title={params.value}><Typography variant="body2" sx={{ fontSize: '0.75rem' }}>{params.value}</Typography></Tooltip></CellBox> },
        { field: 'title', headerName: t('history.columns.title', 'Title'), flex: 1, minWidth: 300, renderCell: (params) => <CellBox><Tooltip title={params.value}><Typography variant="body2" sx={{ fontWeight: 'medium', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>{params.value || t('history.status.unknown', 'Untitled')}</Typography></Tooltip><Tooltip title={params.row.url}><Typography variant="caption" color="text.secondary" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}><Link component="button" onClick={(e) => { e.preventDefault(); ipc.openExternalUrl(params.row.url); }} sx={{ color: 'inherit', textDecoration: 'none', textAlign: 'left' }}>{params.row.url}</Link></Typography></Tooltip></CellBox> },
        { field: 'status', headerName: t('history.columns.status', 'Status'), width: 100, renderCell: (params) => { const s = params.value || t('history.status.unknown', 'Unknown'); let c: any; switch (s) { case 'completed': c = 'success'; break; case 'downloading': c = 'info'; break; case 'failed': c = 'error'; break; case 'pending': c = 'warning'; break; default: c = 'default'; } return <CellBox alignItems={'center'}><Chip label={s} color={c} size="small" sx={{ fontSize: '0.7rem', height: 20 }} /></CellBox>; } },
        { field: 'progress', headerName: t('history.columns.progress', 'Progress'), width: 150, align: 'center', renderCell: (params) => <CellBox alignItems={'center'} direction={"row"}><LinearProgress variant="determinate" value={params.value || 0} sx={{ flexGrow: 1, height: 8, borderRadius: 4 }} /><Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem', minWidth: '35px', textAlign: 'right' }}>{`${params.value?.toFixed(1) || 0.0}%`}</Typography></CellBox> },
        { field: 'startTime', headerName: t('history.columns.started', 'Started'), width: 160, type: 'string', renderCell: (params) => <CellBox><Typography variant="body2" sx={{ fontSize: '0.75rem' }}>{params.value ? new Date(params.value).toLocaleString() : '-'}</Typography></CellBox> },
        { field: 'endTime', headerName: t('history.columns.duration', 'Duration'), width: 80, sortable: false, filterable: false, renderCell: (params) => <DurationCell row={params.row} /> },
        { field: 'fileSize', headerName: t('history.columns.size', 'Size'), width: 80, type: 'number', renderCell: (params) => { const size = params.value || 0; const formatted = size < 1e9 ? `${(size / 1e6).toFixed(1)} ${t('history.units.mb', 'MB')}` : `${(size / 1e9).toFixed(1)} ${t('history.units.gb', 'GB')}`; return <CellBox alignItems={'flex-end'}><Tooltip title={`${size} ${t('history.units.bytes', 'bytes')}`}><Typography variant="body2" sx={{ fontSize: '0.75rem' }}>{formatted}</Typography></Tooltip></CellBox>; } },
        { field: 'actions', headerName: t('history.columns.actions', 'Actions'), sortable: false, filterable: false, minWidth: 200, renderCell: (params) => <ActionsCell row={params.row} onOpenFile={onOpenFile} onRetry={onRetry} ipc={ipc} handleSingleDelete={handleSingleDelete} t={t} /> },
    ], [onOpenFile, onRetry, handleSingleDelete, ipc, t]);

    return (
        <Box sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 2 }}>
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                    <StatusFilter statusCounts={statusCounts} filterStatus={filterStatus} setFilterStatus={setFilterStatus} t={t} />
                    <TextField
                        label={t('history.search_placeholder', 'Search Title or URL')}
                        variant="outlined"
                        size="small"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        sx={{ minWidth: 300 }}
                    />
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button variant="contained" onClick={() => setIsUrlInputDialogOpen(true)} startIcon={<PlayArrowIcon />}>{t('history.buttons.add_new', 'Add New')}</Button>
                    <Button variant="outlined" onClick={onRefresh} startIcon={<RefreshIcon />}>{t('history.buttons.refresh', 'Refresh')}</Button>
                </Box>
            </Box>
            <UrlInputDialog isOpen={isUrlInputDialogOpen} onClose={() => setIsUrlInputDialogOpen(false)} onConfirm={handleAddDownload} />
            <Box sx={{ height: 'calc(100vh - 220px)', width: '100%' }}>
                <DataGrid rows={filteredDownloads} columns={columns} pageSizeOptions={[10, 25, 50, 100]} disableRowSelectionOnClick getRowId={(row) => row.id} />
            </Box>
            <ConfirmDialog isOpen={confirmDialog.isOpen} title={confirmDialog.title} message={confirmDialog.message} onConfirm={confirmDialog.onConfirm} onCancel={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))} type={confirmDialog.type} />
        </Box>
    );
});
export default DownloadHistory;
