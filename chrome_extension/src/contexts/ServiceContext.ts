import React from 'react';
import { Observer } from '../services/Observer';
import { ToolbarService } from '../services/ToolbarService';

interface IServiceContext {
  observer: Observer | null;
  toolbarService: typeof ToolbarService;
}

export const ServiceContext = React.createContext<IServiceContext>({
  observer: null,
  toolbarService: ToolbarService, // ToolbarService는 static 메서드만 있으므로 클래스 자체를 제공
});
