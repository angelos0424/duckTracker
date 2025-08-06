import React, { useState, useEffect, useCallback } from 'react';
import { useNeutralinoService } from '../hooks/useNeutralinoService';
import { ServerConfig } from '../types/types';

const Settings: React.FC = () => {
  const neutralinoService = useNeutralinoService();
  const [settings, setSettings] = useState<ServerConfig>({
    downloadPath: '',
    maxConcurrentDownloads: 1,
    preferredQuality: 'best',
    autoStartDownload: true,
    autoOpenFolder: false,
  });
  const [originalSettings, setOriginalSettings] = useState<ServerConfig | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const fetchedSettings = await neutralinoService.getSettings();
        setSettings(fetchedSettings);
        setOriginalSettings(fetchedSettings);
      } catch (error) {
        console.error('Failed to fetch settings:', error);
        // Handle error, e.g., show a message to the user
      }
    };
    fetchSettings();
  }, [neutralinoService]); // Todo 이거 없애야할지 확인 필요.

  useEffect(() => {
    if (originalSettings) {
      setIsDirty(JSON.stringify(settings) !== JSON.stringify(originalSettings));
    }
  }, [settings, originalSettings]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type, checked } = e.target as HTMLInputElement;
    setSettings(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
    setErrors(prev => ({ ...prev, [name]: '' })); // Clear error on change
  }, []);

  const handleNumberChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const numValue = parseInt(value, 10);
    if (isNaN(numValue) || numValue < 1) {
      setErrors(prev => ({ ...prev, [name]: 'Must be a positive number.' }));
    } else {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
    setSettings(prev => ({
      ...prev,
      [name]: numValue,
    }));
  }, []);

  const handleBrowseFolder = useCallback(async () => {
    try {
      const result = await Neutralino.os.showOpenDialog('Select Download Folder', {
        filters: [{ name: 'All Files', extensions: ['*'] }],
        multiSelections: false,
        dialogType: 'DIRECTORY',
      });
      if (result && result.length > 0) {
        setSettings(prev => ({ ...prev, downloadPath: result[0] }));
        setErrors(prev => ({ ...prev, downloadPath: '' }));
      }
    } catch (error) {
      console.error('Failed to open folder dialog:', error);
      // Handle error, e.g., show a message to the user
    }
  }, []);

  const validateSettings = useCallback(() => {
    const newErrors: { [key: string]: string } = {};
    if (!settings.downloadPath) {
      newErrors.downloadPath = 'Download path cannot be empty.';
    }
    if (settings.maxConcurrentDownloads < 1) {
      newErrors.maxConcurrentDownloads = 'Must be a positive number.';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [settings]);

  const handleSaveSettings = useCallback(async () => {
    if (!validateSettings()) {
      return;
    }
    try {
      await neutralinoService.saveSettings(settings);
      setOriginalSettings(settings); // Update original settings after successful save
      setIsDirty(false);
      // Optionally show a success message
    } catch (error) {
      console.error('Failed to save settings:', error);
      // Handle error, e.g., show a message to the user
    }
  }, [settings, neutralinoService, validateSettings]);

  const handleResetSettings = useCallback(async () => {
    try {
      await neutralinoService.resetSettings();
      const fetchedSettings = await neutralinoService.getSettings(); // Fetch default settings
      setSettings(fetchedSettings);
      setOriginalSettings(fetchedSettings);
      setIsDirty(false);
      setErrors({});
      // Optionally show a success message
    } catch (error) {
      console.error('Failed to reset settings:', error);
      // Handle error
    }
  }, [neutralinoService]);

  return (
    <div className="settings">
      <div className="settings-header">
        <h2>Application Settings</h2>
        <div className="settings-actions">
          <button
            className="save-button"
            onClick={handleSaveSettings}
            disabled={!isDirty || Object.keys(errors).length > 0}
          >
            Save Changes
          </button>
          <button className="reset-button" onClick={handleResetSettings}>
            Reset to Defaults
          </button>
        </div>
      </div>

      <form className="settings-form" onSubmit={(e) => e.preventDefault()}>
        <div className="settings-section">
          <h3>General Settings</h3>
          <div className="form-group">
            <label htmlFor="downloadPath">Download Path:</label>
            <div className="folder-picker">
              <input
                type="text"
                id="downloadPath"
                name="downloadPath"
                value={settings.downloadPath}
                onChange={handleChange}
                className={`folder-input ${errors.downloadPath ? 'error' : ''}`}
                readOnly
              />
              <button type="button" className="folder-browse-button" onClick={handleBrowseFolder}>
                Browse
              </button>
            </div>
            {errors.downloadPath && <span className="form-error">{errors.downloadPath}</span>}
            <span className="form-help">
              The folder where all downloaded videos will be saved.
            </span>
          </div>

          <div className="form-group">
            <label htmlFor="maxConcurrentDownloads">Max Concurrent Downloads:</label>
            <input
              type="number"
              id="maxConcurrentDownloads"
              name="maxConcurrentDownloads"
              value={settings.maxConcurrentDownloads}
              onChange={handleNumberChange}
              min="1"
              className={`number-input ${errors.maxConcurrentDownloads ? 'error' : ''}`}
            />
            {errors.maxConcurrentDownloads && <span className="form-error">{errors.maxConcurrentDownloads}</span>}
            <span className="form-help">
              Maximum number of videos to download simultaneously.
            </span>
          </div>

          <div className="form-group">
            <label htmlFor="preferredQuality">Preferred Video Quality:</label>
            <select
              id="preferredQuality"
              name="preferredQuality"
              value={settings.preferredQuality}
              onChange={handleChange}
              className="quality-select"
            >
              <option value="best">Best Available</option>
              <option value="1080p">1080p</option>
              <option value="720p">720p</option>
              <option value="480p">480p</option>
              <option value="360p">360p</option>
              <option value="worst">Worst Available</option>
            </select>
            <span className="form-help">
              Choose the default video quality for downloads.
            </span>
          </div>
        </div>

        <div className="settings-section">
          <h3>Automation</h3>
          <div className="checkbox-group">
            <label htmlFor="autoStartDownload" className="checkbox-label">
              <input
                type="checkbox"
                id="autoStartDownload"
                name="autoStartDownload"
                checked={settings.autoStartDownload}
                onChange={handleChange}
              />
              <span className="checkbox-text">Automatically start download after adding URL</span>
            </label>
            <label htmlFor="autoOpenFolder" className="checkbox-label">
              <input
                type="checkbox"
                id="autoOpenFolder"
                name="autoOpenFolder"
                checked={settings.autoOpenFolder}
                onChange={handleChange}
              />
              <span className="checkbox-text">Open download folder after completion</span>
            </label>
          </div>
        </div>
      </form>
    </div>
  );
};

export default Settings;
