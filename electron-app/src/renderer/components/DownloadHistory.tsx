import * as React from 'react';
import { DownloadRecord } from '../../shared/types';
import ConfirmDialog from './ConfirmDialog';
import UrlInputDialog from './UrlInputDialog';
import { useIPC, useIPCEvents } from '../hooks/useIPC';
import { extractUrlId } from '../../shared/utils/urlParser';

// MUI Imports
import {
  DataGrid,
  GridColDef,
  GridRenderCellParams,
  GridRowSelectionModel
} from '@mui/x-data-grid';
import { Box, Button, Typography, LinearProgress, Chip, IconButton, Tooltip, Link } from '@mui/material';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import {useEffect} from "react";

const CellBox: React.FC<{
  children: React.ReactNode;
  alignItems?: 'flex-start' | 'center' | 'flex-end';
  direction?: 'row' | 'column';
}> = ({children, alignItems, direction}) => {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: direction || 'column',
        alignItems: alignItems || 'flex-start', // 왼쪽 정렬
        justifyContent: 'center', // 세로 중앙 정렬
        width: '100%',
        height: '100%',
        gap: 0.5 // 요소 간 간격
      }}
    >
      {children}
    </Box>
  );
};

const StatusFilter: React.FC<{
  statusCounts: { [key: string]: number };
  filterStatus: string;
  setFilterStatus: (status: DownloadRecord['status'] | 'all') => void;
}> = ({ statusCounts, filterStatus, setFilterStatus }) => {
  const statuses: { key: DownloadRecord['status'] | 'all'; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'downloading', label: 'Downloading' },
    { key: 'completed', label: 'Completed' },
    { key: 'failed', label: 'Failed' },
    { key: 'pending', label: 'Pending' },
    { key: 'cancelled', label: 'Cancelled' },
    { key: 'queued', label: 'Queued' },
    { key: 'check', label: 'Check' }
  ];

  return (
    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap'}}>
      {statuses.map(({ key, label }) => (
        <Button
          key={key}
          variant={filterStatus === key ? 'contained' : 'outlined'}
          onClick={() => setFilterStatus(key)}
          size="small"
          sx={{
            textTransform: 'none',
            minWidth: 'auto',
            px: 1,
            py: 0.5,
            borderRadius: 2,
            borderColor: filterStatus === key ? 'primary.main' : 'grey.400',
            color: filterStatus === key ? 'white' : 'text.primary',
            backgroundColor: filterStatus === key ? 'primary.main' : 'grey.100',
            '&:hover': {
              backgroundColor: filterStatus === key ? 'primary.dark' : 'grey.200',
            },
          }}
        >
          {label}
          <Chip
            label={statusCounts[key]}
            size="small"
            sx={{
              ml: 0.5,
              height: 18,
              fontSize: '0.7rem',
              backgroundColor: filterStatus === key ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.1)',
              color: filterStatus === key ? 'white' : 'text.secondary',
            }}
          />
        </Button>
      ))}
    </Box>
  );
};

// Memoized Cell Components for performance optimization
const DurationCell = React.memo(({ row }: { row: DownloadRecord }) => {
  // If you need to debug, add console.log here. It will only fire for the specific cell that re-renders.
  // console.log('Rendering DurationCell for:', row.id);
  const formatDuration = (startTime: string | Date, endTime?: string | Date) => {
    if (!endTime || !startTime) return '-';
    try {
      const start = new Date(startTime).getTime();
      const end = new Date(endTime).getTime();
      if (isNaN(start) || isNaN(end)) return '-';

      const duration = end - start;
      if (duration < 0) return '-';

      const seconds = Math.floor(duration / 1000) % 60;
      const minutes = Math.floor(duration / (1000 * 60)) % 60;
      const hours = Math.floor(duration / (1000 * 60 * 60));

      if (hours > 0) {
        return `${hours}h ${minutes}m`;
      } else if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
      } else {
        return `${seconds}s`;
      }
    } catch (e) {
      console.error('Error formatting duration:', e);
      return '-';
    }
  };

  return (
    <CellBox alignItems={'flex-end'}>
      <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
        {formatDuration(row.startTime, row.endTime)}
      </Typography>
    </CellBox>
  );
});

const ActionsCell = React.memo(({
  row,
  onOpenFile,
  onRetry,
  ipc,
  handleSingleDelete
}: {
  row: DownloadRecord;
  onOpenFile: (filePath: string) => void;
  onRetry: (id: string) => void;
  ipc: ReturnType<typeof useIPC>;
  handleSingleDelete: (id: string, title: string) => void;
}) => {
  return (
    <CellBox direction={"row"} alignItems={"center"}>
      {row.status === 'completed' && row.filePath && (
        <Tooltip title="Open file location">
          <IconButton size="small" onClick={() => onOpenFile(row.filePath!)}>
            <FolderOpenIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      {(row.status === 'pending' || row.status === 'downloading' || row.status === 'queued') && (
        <Tooltip title="Stop download">
          <IconButton size="small" onClick={() => ipc.stopDownload(row.urlId)}>
            <StopIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      {!(row.status === 'pending' || row.status === 'downloading' || row.status === 'queued') && (
        <Tooltip title="Retry download">
          <IconButton size="small" onClick={() => onRetry(row.id)}>
            <PlayArrowIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      <Tooltip title="Open URL in browser">
        <IconButton size="small" onClick={() => ipc.openExternalUrl(row.url)}>
          <OpenInNewIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Delete from history">
        <IconButton size="small" onClick={() => handleSingleDelete(row.id, row.title || '')}>
          <DeleteIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </CellBox>
  );
});

interface DownloadHistoryProps {
  downloads: DownloadRecord[];
  onRefresh: () => void;
  onDelete: (ids: string[]) => void;
  onOpenFile: (filePath: string) => void;
  onRetry: (id: string) => void;
}

const DownloadHistory: React.FC<DownloadHistoryProps> = React.memo(({
  downloads: initialDownloads,
  onRefresh,
  onDelete,
  onOpenFile,
  onRetry
}) => {
  const [downloads, setDownloads] = React.useState(initialDownloads);
  const ipcEvents = useIPCEvents();

  React.useEffect(() => {
    setDownloads(initialDownloads);
  }, [initialDownloads]);

  React.useEffect(() => {
    const handleDownloadUpdate = (record: DownloadRecord) => {
      // console.log('Download update received:', record);
      setDownloads(prevDownloads => {
        const existing = prevDownloads.find(d => d.id === record.id);
        if (existing) {
          // console.log('Updating existing download:', record.id);
          return prevDownloads.map(d => d.id === record.id ? record : d);
        } else {
          // console.log('Adding new download:', record.id);
          return [...prevDownloads, record];
        }
      });
    };

    const cleanupUpdated = ipcEvents.onDownloadUpdated(handleDownloadUpdate);
    const cleanupRetried = ipcEvents.onDownloadRetried(handleDownloadUpdate);

    return () => {
      cleanupUpdated();
      cleanupRetried();
    };
  }, [ipcEvents]);

  const [selectedRowIds, setSelectedRowIds] = React.useState<string[]>([]);
  const [rowSelectionModel, setRowSelectionModel] =
    React.useState<GridRowSelectionModel>({ type: 'include', ids: new Set() });

  const [confirmDialog, setConfirmDialog] = React.useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    type: 'danger' | 'warning' | 'info';
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    type: 'warning'
  });
  const [isUrlInputDialogOpen, setIsUrlInputDialogOpen] = React.useState(false);
  const ipc = useIPC();
  const [filterStatus, setFilterStatus] = React.useState<DownloadRecord['status'] | 'all'>('all');
  const [paginationModel, setPaginationModel] = React.useState({
    pageSize: 10,
    page: 0,
  });

  const statusCounts = React.useMemo(() => {
    const counts: Record<DownloadRecord['status'] | 'all', number> = {
      all: downloads.length,
      pending: 0,
      downloading: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      queued: 0,
      check: 0,
    };
    downloads.forEach(d => {
      counts[d.status]++;
    });
    return counts;
  }, [downloads]);

  const handleAddDownload = React.useCallback(async (url: string) => {
    try {
      const urlInfo = extractUrlId(url);
      await ipc.startDownload(url, urlInfo.urlId);
    } catch (error) {
      console.error('Failed to start download:', error);
      // TODO: Show error to user
    }
  }, [ipc]);

  const handleBulkDelete = React.useCallback(() => {
    if (selectedRowIds.length > 0) {
      setConfirmDialog({
        isOpen: true,
        title: 'Delete Downloads',
        message: `Are you sure you want to delete ${selectedRowIds.length} download${selectedRowIds.length > 1 ? 's' : ''} from history? This action cannot be undone.`,
        onConfirm: () => {
          onDelete(selectedRowIds);
          setSelectedRowIds([]);
          setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        },
        type: 'danger'
      });
    }
  }, [onDelete, selectedRowIds]);

  const handleSingleDelete = React.useCallback((id: string, title: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Download',
      message: `Are you sure you want to delete "${title || 'Untitled'}" from history? This action cannot be undone.`,
      onConfirm: () => {
        onDelete([id]);
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
      },
      type: 'danger'
    });
  }, [onDelete]);

  const handleDialogCancel = React.useCallback(() => {
    setConfirmDialog(prev => ({ ...prev, isOpen: false }));
  }, []);

  const filteredDownloads = React.useMemo(() => {
    if (filterStatus === 'all') {
      return downloads;
    }
    return downloads.filter(download => download.status === filterStatus);
  }, [downloads, filterStatus]);

  const columns: GridColDef<DownloadRecord>[] = React.useMemo(() => [
    {
      field: 'id',
      headerName: 'ID',
      width: 30,
      align: 'center',
      type: 'string',
      renderCell: (params: GridRenderCellParams<DownloadRecord, string>) => {
        return (
          <CellBox alignItems={'center'}>
            <Tooltip title={params.value}>
              <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>{params.value}</Typography>
            </Tooltip>
          </CellBox>
        )
      }
    },
    { field: 'title', headerName: 'Title', flex: 1, minWidth: 300,
      renderCell: (params: GridRenderCellParams<DownloadRecord, string>) => (
        <CellBox>
          <Tooltip title={params.value}>
            <Typography
              variant="body2"
              sx={{
                fontWeight: 'medium',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                width: '100%'
              }}
            >
              {params.value || 'Untitled'}
            </Typography>
          </Tooltip>
          <Tooltip title={params.row.url}>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                width: '100%'
              }}
            >
              <Link
                component="button"
                onClick={(e) => {
                  e.preventDefault();
                  ipc.openExternalUrl(params.row.url);
                }}
                sx={{
                  color: 'inherit',
                  textDecoration: 'none',
                  textAlign: 'left'
                }}
              >
                {params.row.url}
              </Link>
            </Typography>
          </Tooltip>
        </CellBox>
      )
    },
    { field: 'status', headerName: 'Status', width: 100,
      renderCell: (params: GridRenderCellParams<DownloadRecord, DownloadRecord['status']>) => {
        const status = params.value || 'Unknown';
        let color: string;
        let text: string;
        switch (status) {
          case 'completed': color = 'success'; text = 'Completed'; break;
          case 'downloading': color = 'info'; text = 'Downloading'; break;
          case 'failed': color = 'error'; text = 'Failed'; break;
          case 'pending': color = 'warning'; text = 'Pending'; break;
          case 'queued': color = 'default'; text = 'Queued'; break;
          case 'cancelled': color = 'default'; text = 'Cancelled'; break;
          case 'check': color = 'default'; text = 'Check'; break;
          default: color = 'default'; text = status; break;
        }
        return (
          <CellBox alignItems={'center'}>
            <Chip label={text} color={color as any} size="small" sx={{ fontSize: '0.7rem', height: 20 }} />
          </CellBox>
        );
      }
    },
    { field: 'progress',
      headerName: 'Progress', width: 150,
      align: 'center',
      type: 'number',
      renderCell: (params: GridRenderCellParams<DownloadRecord, number>) => {
        return (
          <CellBox alignItems={'center'} direction={"row"}>
            <LinearProgress variant="determinate" value={params.value || 0} sx={{ flexGrow: 1, height: 8, borderRadius: 4 }} />
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem', minWidth: '35px', textAlign: 'right' }}>
              {`${params.value?.toFixed(1) || 0.0}%`}
            </Typography>
          </CellBox>
        )
      }
    },
    { field: 'startTime', headerName: 'Started', width: 160, type: 'dateTime',
      valueFormatter: (value: Date) => {
        if (value == null) {
          return '';
        }
        return value.toLocaleString();
      },
      renderCell: (params: GridRenderCellParams<DownloadRecord, Date>) => (
        <CellBox>
          <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
            {params.value ? new Date(params.value).toLocaleString() : '-'}
          </Typography>
        </CellBox>
      )
    },
    { field: 'endTime', headerName: 'Duration', width: 80, sortable: false, filterable: false,
      renderCell: (params: GridRenderCellParams<DownloadRecord>) => <DurationCell row={params.row} />
    },
    { field: 'fileSize', headerName: 'Size', width: 80, type: 'number',
      renderCell: (params: GridRenderCellParams<DownloadRecord, number>) => {
        const fileSize = params.value || 0;

        //Todo OS 별 계산법 체크. MAC에서는 1024가 아닌 1000 으로 계산.
        const mbUnit = 1000 * 1000;
        const gbUnit = 1000 * 1000 * 1000;
        const formattedFileSize = fileSize < gbUnit ? `${(fileSize / mbUnit).toFixed(1)} MB` : `${(fileSize / gbUnit).toFixed(1)} GB`;

        return (
          <CellBox alignItems={'flex-end'}>
            <Tooltip title={formattedFileSize}>
              <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>{formattedFileSize}</Typography>
            </Tooltip>
          </CellBox>
        )
      }
    },
    { field: 'actions', headerName: 'Actions', sortable: false, filterable: false, minWidth: 200,
      renderCell: (params: GridRenderCellParams<DownloadRecord>) => (
        <ActionsCell
          row={params.row}
          onOpenFile={onOpenFile}
          onRetry={onRetry}
          ipc={ipc}
          handleSingleDelete={handleSingleDelete}
        />
      )
    },
  ], [onOpenFile, onRetry, handleSingleDelete, ipc]);

  return (
    <Box sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <StatusFilter
            statusCounts={statusCounts}
            filterStatus={filterStatus}
            setFilterStatus={setFilterStatus}
          />
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button variant="contained" onClick={() => setIsUrlInputDialogOpen(true)} startIcon={<PlayArrowIcon />}
              sx={{
                textTransform: 'none',
                minWidth: 'auto',
                px: 1,
                py: 0.5,
                borderRadius: 2,
              }}
            >
              Add New
            </Button>
            {selectedRowIds.length > 0 && (
              <Button variant="outlined" color="error" onClick={handleBulkDelete} startIcon={<DeleteIcon />}
                sx={{
                  textTransform: 'none',
                  minWidth: 'auto',
                  px: 1,
                  py: 0.5,
                  borderRadius: 2,
                }}
              >
                Delete Selected ({selectedRowIds.length})
              </Button>
            )}
            <Button variant="outlined" onClick={onRefresh} startIcon={<RefreshIcon />}
              sx={{
                textTransform: 'none',
                minWidth: 'auto',
                px: 1,
                py: 0.5,
                borderRadius: 2,
              }}
            >
              Refresh
            </Button>
          </Box>
        </Box>
      </Box>

      <UrlInputDialog
        isOpen={isUrlInputDialogOpen}
        onClose={() => setIsUrlInputDialogOpen(false)}
        onConfirm={handleAddDownload}
      />

      <Box sx={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column'}}>
          <DataGrid
            rows={filteredDownloads}
            columns={columns}
            pageSizeOptions={[5, 10, 25, 50]}
            paginationModel={paginationModel}
            onPaginationModelChange={setPaginationModel}
            checkboxSelection
            sortingOrder={['asc', 'desc']}
            disableRowSelectionOnClick
            rowSelectionModel={rowSelectionModel}
            onRowSelectionModelChange={(newSelectionModel) => {
              setRowSelectionModel(newSelectionModel);
            }}
            getRowId={(row) => row.id}
            sx={{
              '& .MuiDataGrid-columnHeaders': {
                backgroundColor: '#f5f5f5',
                fontWeight: 'bold',
              },
              '& .MuiDataGrid-columnHeaderTitleContainer': {
                justifyContent: 'center',
              },
              '& .MuiDataGrid-cell': {
                fontSize: '0.8rem', // Default cell font size
              },
              '& .MuiDataGrid-columnHeaderTitle': {
                fontSize: '0.85rem', // Header font size
              },
              borderColor: 'primary.light',
              '& .MuiDataGrid-cell:hover': {
                color: 'primary.main',
              },
            }}
          />
        {/*)}*/}
      </Box>

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={confirmDialog.onConfirm}
        onCancel={handleDialogCancel}
        type={confirmDialog.type}
        confirmText="Delete"
        cancelText="Cancel"
      />
    </Box>
  );
});

export default DownloadHistory;
