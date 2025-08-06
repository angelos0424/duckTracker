import NeutralinoApp from "node-neutralino";
import { DatabaseManager } from "../database/DatabaseManager";
import { FrontendMessage, BackendMessage, DownloadConfig, ServerStatus } from "../shared/interfaces";

import { YtdlpService } from "../services/YtdlpService";
import {DownloadRecord} from "../../react-src/src/types/types";

export async function handleFrontendMessage(
  app: NeutralinoApp,
  databaseManager: DatabaseManager,
  ytdlpService: YtdlpService, // Add ytdlpService here
  config: DownloadConfig,
  message: FrontendMessage
) {
  const { type, data, id } = message;
  console.log('handleFrontendMessage: ', type, data, id)
  try {
    let response: any;

    switch (type) {
      case 'getHistories':
        console.log('[server] getHistories');
        response = await databaseManager.getDownloads();
        break;
      case 'getServerStatus':
        console.log('[server] getServerStatus');
        response = {
          running: true,
          httpPort: config.port,
          wsPort: 8080,
        } as ServerStatus;
        break;
      case 'startDownload':
        console.log(`[server] startDownload: url=${data.url}, urlId=${data.urlId}`);
        const res: Omit<DownloadRecord, 'id' | 'created_at'> = {
          url: data.url,
          url_id: data.urlId,
          title: '',
          status: 'pending',
          progress: 0,
          file_path: '',
          error_message: '',
          end_time: '',
          start_time: new Date().toISOString(),
        };

        app.events.broadcast('backend-send', {
          id,
          type,
          data: '',
        })

        app.events.broadcast('download-update', res);

        await ytdlpService.startDownload(data.url, data.urlId);
        return;
      case 'openFileLocation':
        const filePath = '/Users/windows11/Downloads/극한직업 연예인 매니저ㅋㅋㅋ [Mit2mgRUThE].mp4';
        const escapedCommand = `open "${filePath}"`; // 쌍따옴표로 감싸기

        console.log(`${escapedCommand}`);

        await app.os.execCommand(escapedCommand);
        console.log('openFileLocation done');
        break;
      default:
        console.log(`[server] Unknown message type: ${type}`);
        app.events.broadcast('backend-send', {
          id,
          type,
          error: `Unknown message type: ${type}`,
        });
        return;
    }

    app.events.broadcast('backend-send', {
      id,
      type,
      data: response,
    });

  } catch (error) {
    app.events.broadcast('backend-send', {
      id,
      type,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
