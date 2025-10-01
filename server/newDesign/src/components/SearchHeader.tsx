import { Search, RefreshCw, Plus } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

interface SearchHeaderProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  onRefresh: () => void;
  onAddDownload: () => void;
}

export function SearchHeader({ 
  searchValue, 
  onSearchChange, 
  onRefresh, 
  onAddDownload 
}: SearchHeaderProps) {
  return (
    <div className="bg-gray-50 p-4 rounded-lg mb-6">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="flex-1 w-full sm:w-auto">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="URL ID 또는 제목 검색"
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-10 bg-white border-gray-200"
            />
          </div>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button 
            variant="default" 
            size="sm"
            className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-700"
          >
            관리
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={onRefresh}
            className="flex-1 sm:flex-none"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            새로고침
          </Button>
          <Button 
            variant="default"
            size="sm"
            onClick={onAddDownload}
            className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            다운로드 추가
          </Button>
        </div>
      </div>
    </div>
  );
}