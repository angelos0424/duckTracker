import { MoreHorizontal, Play, Pause, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Progress } from "./ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

export interface DownloadItem {
  id: string;
  title: string;
  url: string;
  status: 'completed' | 'downloading' | 'pending' | 'failed';
  progress: number;
  requestDate: string;
  createdDate: string;
  fileSize?: string;
}

interface DownloadTableProps {
  items: DownloadItem[];
  onPlay: (id: string) => void;
  onPause: (id: string) => void;
  onDelete: (id: string) => void;
}

export function DownloadTable({ items, onPlay, onPause, onDelete }: DownloadTableProps) {
  const getStatusBadge = (status: DownloadItem['status']) => {
    const statusConfig = {
      completed: { label: 'Completed', variant: 'default' as const, className: 'bg-green-100 text-green-800' },
      downloading: { label: 'Downloading', variant: 'secondary' as const, className: 'bg-blue-100 text-blue-800' },
      pending: { label: 'Pending', variant: 'outline' as const, className: 'bg-yellow-100 text-yellow-800' },
      failed: { label: 'Failed', variant: 'destructive' as const, className: 'bg-red-100 text-red-800' }
    };
    
    const config = statusConfig[status];
    return (
      <Badge variant={config.variant} className={config.className}>
        {config.label}
      </Badge>
    );
  };

  return (
    <div className="hidden md:block bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-900">제목</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-900">상태</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-900">진행률</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-900">요청일</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-900">생성일</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-900">업데이트</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-900">작업</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {items.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50">
                <td className="px-4 py-4">
                  <div className="max-w-md">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {item.title}
                    </div>
                    <div className="text-xs text-gray-500 truncate mt-1">
                      {item.url}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4">
                  {getStatusBadge(item.status)}
                </td>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-2">
                    <Progress value={item.progress} className="w-16 h-2" />
                    <span className="text-sm text-gray-600">{item.progress}%</span>
                  </div>
                </td>
                <td className="px-4 py-4 text-sm text-gray-600">
                  {item.requestDate}
                </td>
                <td className="px-4 py-4 text-sm text-gray-600">
                  {item.createdDate}
                </td>
                <td className="px-4 py-4 text-sm text-gray-600">
                  {item.createdDate}
                </td>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => item.status === 'downloading' ? onPause(item.id) : onPlay(item.id)}
                      className="w-8 h-8 p-0"
                    >
                      {item.status === 'downloading' ? (
                        <Pause className="w-4 h-4" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="w-8 h-8 p-0">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onDelete(item.id)} className="text-red-600">
                          <Trash2 className="w-4 h-4 mr-2" />
                          삭제
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}