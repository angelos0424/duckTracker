import { MoreHorizontal, Play, Pause, Trash2, Calendar, Clock } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Progress } from "./ui/progress";
import { Card, CardContent } from "./ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { DownloadItem } from "./DownloadTable";

interface DownloadCardProps {
  items: DownloadItem[];
  onPlay: (id: string) => void;
  onPause: (id: string) => void;
  onDelete: (id: string) => void;
}

export function DownloadCard({ items, onPlay, onPause, onDelete }: DownloadCardProps) {
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
    <div className="md:hidden space-y-4">
      {items.map((item) => (
        <Card key={item.id} className="border border-gray-200">
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1 mr-2">
                <h3 className="font-medium text-gray-900 text-sm leading-tight mb-1">
                  {item.title}
                </h3>
                <p className="text-xs text-gray-500 truncate">
                  {item.url}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
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
            </div>
            
            <div className="flex items-center justify-between mb-3">
              {getStatusBadge(item.status)}
              <div className="flex items-center gap-2">
                <Progress value={item.progress} className="w-20 h-2" />
                <span className="text-sm text-gray-600">{item.progress}%</span>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-3 text-xs text-gray-500">
              <div className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                <span>요청: {item.requestDate}</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span>생성: {item.createdDate}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}