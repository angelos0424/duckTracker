import * as React from 'react';
import { AppSettings } from '../../shared/types';
import {useIPC} from "../hooks/useIPC";
import {Box} from "@mui/material";
const get = require('lodash.get');
// @ts-ignore
import enTranslations from '../locales/en.json';
// @ts-ignore
import koTranslations from '../locales/ko.json';

const locales: Record<string, any> = {
  en: enTranslations,
  ko: koTranslations
};

interface SettingsProps {
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
  onReset: () => void;
  ytDlpVersion: string;
  ffmpegVersion: string;
  onRefreshVersions: () => void;
}

const Settings: React.FC<SettingsProps> = ({
  settings,
  onSave,
  onReset,
  ytDlpVersion,
  ffmpegVersion,
  onRefreshVersions,
}) => {
  const [formSettings, setFormSettings] = React.useState<AppSettings>(settings);
  const [translations, setTranslations] = React.useState<any>({});
  const [hasChanges, setHasChanges] = React.useState(false);
  const [validationErrors, setValidationErrors] = React.useState<Record<string, string>>({});
  const [showResetConfirm, setShowResetConfirm] = React.useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isInstalling, setIsInstalling] = React.useState<string | null>(null);
  const ipc = useIPC();

  // Translation function
  const t = (key: string, fallback?: string): string => {
    return get(translations, key, fallback || key);
  };

  // Load translations when language changes
  React.useEffect(() => {
    const lang = formSettings.language || 'en';
    setTranslations(locales[lang] || {});
  }, [formSettings.language]);

  // Update form when settings prop changes
  React.useEffect(() => {
    setFormSettings(settings);
    setHasChanges(false);
  }, [settings]);

  // Check if form has changes
  React.useEffect(() => {
    const changed = JSON.stringify(formSettings) !== JSON.stringify(settings);
    setHasChanges(changed);
  }, [formSettings, settings]);

  // Validate form settings
  React.useEffect(() => {
    const errors: Record<string, string> = {};

    // Validate download path
    if (!formSettings.downloadPath.trim()) {
      errors.downloadPath = 'Download path is required';
    }

    // Validate concurrent downloads
    if (formSettings.maxConcurrentDownloads < 1 || formSettings.maxConcurrentDownloads > 10) {
      errors.maxConcurrentDownloads = 'Must be between 1 and 10';
    }

    // Validate HTTP port
    if (formSettings.httpPort < 1024 || formSettings.httpPort > 65535) {
      errors.httpPort = 'Must be between 1024 and 65535';
    }

    // Validate WebSocket port
    if (formSettings.wsPort < 1024 || formSettings.wsPort > 65535) {
      errors.wsPort = 'Must be between 1024 and 65535';
    }

    // Validate output template
    if (!formSettings.outputTemplate || !formSettings.outputTemplate.trim()) {
      errors.outputTemplate = 'Output template is required';
    }

    setValidationErrors(errors);
  }, [formSettings]);

  const handleInputChange = (field: keyof AppSettings, value: any) => {
    setFormSettings(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleFolderPicker = async () => {
    try {
      // Use IPC to open folder dialog
      const result = await window.electronAPI.openFolderDialog();
      if (result && !result.canceled && result.filePaths.length > 0) {
        handleInputChange('downloadPath', result.filePaths[0]);
      }
    } catch (error) {
      console.error('Failed to open folder dialog:', error);
    }
  };

  const handleSave = async () => {
    // Check if there are validation errors
    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    // Check if ports changed (requires server restart)
    const portsChanged = formSettings.httpPort !== settings.httpPort || 
                        formSettings.wsPort !== settings.wsPort;

    if (portsChanged) {
      setShowSaveConfirm(true);
    } else {
      await performSave();
    }
  };

  const performSave = async () => {
    setIsSaving(true);
    try {
      await onSave(formSettings);
      
      // Check if server restart is needed
      const portsChanged = formSettings.httpPort !== settings.httpPort || 
                          formSettings.wsPort !== settings.wsPort;
      
      if (portsChanged) {
        // Restart server with new ports
        await window.electronAPI.restartServer();
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setIsSaving(false);
      setShowSaveConfirm(false);
    }
  };

  const handleReset = () => {
    setShowResetConfirm(true);
  };

  const performReset = async () => {
    try {
      await onReset();
    } catch (error) {
      console.error('Failed to reset settings:', error);
    } finally {
      setShowResetConfirm(false);
    }
  };

  const handleCheckForUpdates = async (dependency: 'yt-dlp') => {
    const latestVersion = await window.electronAPI.checkForUpdates(dependency);

    if (latestVersion && latestVersion !== ytDlpVersion) {
      alert(`A new version of yt-dlp is available: ${latestVersion}`);
    } else if (latestVersion) {
      alert(`You have the latest version of yt-dlp: ${ytDlpVersion}`);
    } else {
      alert('Could not check for updates.');
    }
    onRefreshVersions();
  };

  const handleDownload = async (dependency: 'yt-dlp') => {
    setIsInstalling(dependency);
    try {
      const result = await window.electronAPI.installDependency(dependency);
      alert(result.message);

      if (result.success) {
        onRefreshVersions();
      } 
    } catch (error) {
      console.error(`Failed to install ${dependency}:`, error);
      alert(`An error occurred while installing ${dependency}.`);
    } finally {
      setIsInstalling(null);
    }
  };

  const videoQualityOptions = [
    { value: 'best', label: 'Best Available Quality', description: 'Highest quality available' },
    { value: '1080p', label: '1080p (Full HD)', description: '1920x1080 resolution' },
    { value: '720p', label: '720p (HD)', description: '1280x720 resolution' },
    { value: '480p', label: '480p (SD)', description: '854x480 resolution' }
  ];

  const openTemplatePage = () => {
    ipc.openExternalUrl("https://github.com/yt-dlp/yt-dlp?tab=readme-ov-file#output-template-examples");
  }

  if (!translations) return <div>Loading...</div>;

  return (
    <Box className="settings" mt={2}>
      <div className="settings-header">
        <h2>{t('settings.title')}</h2>
        <div className="settings-actions">
          <button 
            onClick={handleSave} 
            className="save-button"
            disabled={!hasChanges}
          >
            {t('settings.save_changes')}
          </button>
          <button onClick={handleReset} className="reset-button">
            {t('settings.reset_to_defaults')}
          </button>
        </div>
      </div>
      
      <div className="settings-form">
        {/* Language Section */}
        <div className="settings-section">
          <h3>{t('settings.language')}</h3>
          <div className="form-group">
            <select
              id="language"
              value={formSettings.language}
              onChange={(e) => handleInputChange('language', e.target.value as 'en' | 'ko')}
              className="quality-select"
            >
              <option value="en">English</option>
              <option value="ko">한국어</option>
            </select>
          </div>
        </div>

        {/* Download Directory Section */}
        <div className="settings-section">
          <h3>{t('settings.sections.downloads.title')}</h3>
          
          <div className="form-group">
            <label htmlFor="downloadPath">{t('settings.sections.downloads.directory')}</label>
            <div className="folder-picker">
              <input
                type="text"
                id="downloadPath"
                value={formSettings.downloadPath}
                onChange={(e) => handleInputChange('downloadPath', e.target.value)}
                className={`folder-input ${validationErrors.downloadPath ? 'error' : ''}`}
                placeholder={t('settings.sections.downloads.directory_placeholder')}
              />
              <button 
                type="button" 
                onClick={handleFolderPicker}
                className="folder-browse-button"
              >
                Browse
              </button>
            </div>
            {validationErrors.downloadPath && (
              <small className="form-error">{validationErrors.downloadPath}</small>
            )}
            <small className="form-help">{t('settings.sections.downloads.directory_help')}</small>
          </div>

          <div className="form-group">
            <label htmlFor="videoQuality">{t('settings.sections.downloads.quality')}</label>
            <select
              id="videoQuality"
              value={formSettings.videoQuality}
              onChange={(e) => handleInputChange('videoQuality', e.target.value)}
              className="quality-select"
            >
              {videoQualityOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {t(`settings.sections.downloads.quality_help.${option.value}`)}
                </option>
              ))}
            </select>
            <small className="form-help">
              {t(`settings.sections.downloads.quality_help.${formSettings.videoQuality}`)}
            </small>
          </div>

          <div className="form-group">
            <label htmlFor="maxConcurrentDownloads">{t('settings.sections.downloads.concurrent')}</label>
            <input
              type="number"
              id="maxConcurrentDownloads"
              value={formSettings.maxConcurrentDownloads}
              onChange={(e) => handleInputChange('maxConcurrentDownloads', parseInt(e.target.value) || 1)}
              min="1"
              max="10"
              className={`number-input ${validationErrors.maxConcurrentDownloads ? 'error' : ''}`}
            />
            {validationErrors.maxConcurrentDownloads && (
              <small className="form-error">{validationErrors.maxConcurrentDownloads}</small>
            )}
            <small className="form-help">{t('settings.sections.downloads.concurrent_help')}</small>
          </div>

          <div className="form-group">
            <label htmlFor="outputTemplate">{t('settings.sections.downloads.output_template')}</label>
            <input
              type="text"
              id="outputTemplate"
              value={formSettings.outputTemplate}
              onChange={(e) => handleInputChange('outputTemplate', e.target.value)}
              className={`folder-input ${validationErrors.outputTemplate ? 'error' : ''}`}
              placeholder={t('settings.sections.downloads.output_template_placeholder')}
            />
            {validationErrors.outputTemplate && (
              <small className="form-error">{validationErrors.outputTemplate}</small>
            )}
            <small className="form-help">
              {t('settings.sections.downloads.output_template_help')} <code>%(title)s [%(id)s].%(ext)s     </code>
              <span className="tab-badge" style={{cursor:'pointer'}} onClick={openTemplatePage}>Examples</span>
            </small>
          </div>
        </div>

        {/* Server Configuration Section */}
        <div className="settings-section">
          <h3>{t('settings.sections.server.title')}</h3>
          
          <div className="form-group">
            <label htmlFor="Port">{t('settings.sections.server.port')}</label>
            <input
              type="number"
              id="Port"
              value={formSettings.httpPort}
              onChange={(e) => handleInputChange('httpPort', parseInt(e.target.value) || 8080)}
              min="1024"
              max="65535"
              className={`number-input ${validationErrors.httpPort ? 'error' : ''}`}
            />
            {validationErrors.httpPort && (
              <small className="form-error">{validationErrors.httpPort}</small>
            )}
            <small className="form-help">{t('settings.sections.server.http_port_help')}</small>
          </div>
        </div>

        {/* Application Behavior Section */}
        <div className="settings-section">
          <h3>{t('settings.sections.application.title')}</h3>

          <div className="form-group checkbox-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={formSettings.minimizeToTray}
                onChange={(e) => handleInputChange('minimizeToTray', (e.target as HTMLInputElement).checked)}
              />
              <span className="checkbox-text">{t('settings.sections.application.minimize_to_tray')}</span>
            </label>
            <small className="form-help">{t('settings.sections.application.minimize_to_tray_help')}</small>
          </div>

          <div className="form-group checkbox-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={formSettings.showNotifications}
                onChange={(e) => handleInputChange('showNotifications', (e.target as HTMLInputElement).checked)}
              />
              <span className="checkbox-text">{t('settings.sections.application.show_notifications')}</span>
            </label>
            <small className="form-help">{t('settings.sections.application.show_notifications_help')}</small>
          </div>
        </div>

        {/* Dependencies Section */}
        <div className="settings-section">
          <h3>{t('settings.sections.dependencies.title')}</h3>
          
          {/* yt-dlp subsection */}
          <div className="dependency-item">
            <div className="dependency-info">
              <span className="dependency-name">yt-dlp</span>
              <span className="dependency-version">{ytDlpVersion}</span>
            </div>
            <div className="dependency-actions">
              <button className="action-button" onClick={() => handleCheckForUpdates('yt-dlp')} disabled={isInstalling !== null}>
                {t('settings.sections.dependencies.check_for_updates')}
              </button>
              <button className="action-button" onClick={() => handleDownload('yt-dlp')} disabled={isInstalling !== null}>
                {isInstalling === 'yt-dlp' ? t('settings.sections.dependencies.installing') : t('settings.sections.dependencies.install_update')}
              </button>
            </div>
          </div>

          {/* ffmpeg subsection */}
          <div className="dependency-item">
            <div className="dependency-info">
              <span className="dependency-name">ffmpeg</span>
              <span className="dependency-version">{ffmpegVersion}</span>
            </div>
            <div className="dependency-actions">
              <span className="dependency-status">{t('settings.sections.dependencies.managed_automatically')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Save Confirmation Dialog */}
      {showSaveConfirm && (
        <div className="dialog-overlay">
          <div className="dialog-container">
            <div className="dialog-content">
              <div className="dialog-header">
                <span className="dialog-icon">⚠️</span>
                <h3 className="dialog-title">{t('settings.dialogs.save_confirm_title')}</h3>
              </div>
              <div className="dialog-body">
                <p className="dialog-message">
                  {t('settings.dialogs.save_confirm_message')}
                </p>
              </div>
              <div className="dialog-actions">
                <button 
                  className="dialog-button cancel-button"
                  onClick={() => setShowSaveConfirm(false)}
                  disabled={isSaving}
                >
                  {t('settings.dialogs.cancel_button')}
                </button>
                <button 
                  className="dialog-button confirm-button warning"
                  onClick={performSave}
                  disabled={isSaving}
                >
                  {isSaving ? t('settings.save_changes') : t('settings.dialogs.save_confirm_button')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reset Confirmation Dialog */}
      {showResetConfirm && (
        <div className="dialog-overlay">
          <div className="dialog-container">
            <div className="dialog-content">
              <div className="dialog-header">
                <span className="dialog-icon">🔄</span>
                <h3 className="dialog-title">{t('settings.dialogs.reset_confirm_title')}</h3>
              </div>
              <div className="dialog-body">
                <p className="dialog-message">
                  {t('settings.dialogs.reset_confirm_message')}
                </p>
              </div>
              <div className="dialog-actions">
                <button 
                  className="dialog-button cancel-button"
                  onClick={() => setShowResetConfirm(false)}
                >
                  {t('settings.dialogs.cancel_button')}
                </button>
                <button 
                  className="dialog-button confirm-button danger"
                  onClick={performReset}
                >
                  {t('settings.dialogs.reset_confirm_button')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Box>
  );
};

export default Settings;