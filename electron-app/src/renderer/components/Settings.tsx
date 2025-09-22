import * as React from 'react';
import { AppSettings } from '../../shared/types';
import { useIPC } from '../hooks/useIPC';
import { Box, Button, TextField, Select, MenuItem, FormControl, InputLabel, Checkbox, FormControlLabel, Typography, Paper, Divider, Tooltip, IconButton } from '@mui/material';
import Grid from '@mui/material/Grid';
import RefreshIcon from '@mui/icons-material/Refresh';
import get from 'lodash.get';

import './Settings.css';

import enTranslations from '../locales/en.json';
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

const Settings: React.FC<SettingsProps> = ({ settings, onSave, onReset, ytDlpVersion, ffmpegVersion, onRefreshVersions }) => {
  const [formSettings, setFormSettings] = React.useState<AppSettings>(settings);
  const [translations, setTranslations] = React.useState<any>({});
  const [hasChanges, setHasChanges] = React.useState(false);
  const ipc = useIPC();

  const t = (key: string, fallback?: string): string => get(translations, key, fallback || key);

  React.useEffect(() => {
    setTranslations(locales[formSettings.language] || {});
  }, [formSettings.language]);

  React.useEffect(() => {
    setFormSettings(settings);
    setHasChanges(false);
  }, [settings]);

  React.useEffect(() => {
    setHasChanges(JSON.stringify(formSettings) !== JSON.stringify(settings));
  }, [formSettings, settings]);

  const handleInputChange = (field: keyof AppSettings, value: any) => {
    // Ensure numeric fields are stored as numbers
    const numericFields: (keyof AppSettings)[] = ['maxConcurrentDownloads', 'httpPort', 'wsPort'];
    const finalValue = numericFields.includes(field) ? Number(value) : value;
    setFormSettings(prev => ({ ...prev, [field]: finalValue }));
  };

  const handleFolderPicker = async () => {
    const result = await ipc.openFolderDialog();
    if (result && !result.canceled && result.filePaths.length > 0) {
      handleInputChange('downloadPath', result.filePaths[0]);
    }
  };

  const handleSave = () => {
    onSave(formSettings);
  };

  const [ytDlpUpdate, setYtDlpUpdate] = React.useState<{ status: 'idle' | 'checking' | 'available' | 'up-to-date' | 'installing' | 'installed'; latestVersion?: string }>({ status: 'idle' });

  const handleCheckForUpdate = async (dependency: 'yt-dlp' | 'ffmpeg') => {
    if (dependency === 'yt-dlp') {
      setYtDlpUpdate({ status: 'checking' });
      try {
        const latestVersion = await ipc.checkForUpdates('yt-dlp');
        if (latestVersion && latestVersion !== ytDlpVersion) {
          setYtDlpUpdate({ status: 'available', latestVersion });
        } else {
          setYtDlpUpdate({ status: 'up-to-date' });
        }
      } catch (error) {
        console.error('Failed to check for yt-dlp update:', error);
        setYtDlpUpdate({ status: 'idle' }); // Reset on error
      }
    }
  };

  const handleInstallUpdate = async (dependency: 'yt-dlp' | 'ffmpeg') => {
    console.log('Installing update for', dependency);
    if (dependency === 'yt-dlp') {
      setYtDlpUpdate(prev => ({ ...prev, status: 'installing' }));
      try {
        const result = await ipc.installDependency('yt-dlp');
        console.log('Install result:', result);
        if (result.success) {
          setYtDlpUpdate({ status: 'installed' });
          onRefreshVersions(); // Refresh versions after install
        } else {
          // Handle installation failure
          console.error('yt-dlp installation failed:', result.message);
          setYtDlpUpdate({ status: 'available' }); // Go back to available state
        }
      } catch (error) {
        console.error('Failed to install yt-dlp update:', error);
        setYtDlpUpdate({ status: 'available' });
      }
    }
  };

  return (
    <Paper elevation={3} sx={{ p: 3, mt: 2 }}>
      <Box sx={{ maxWidth: '960px', margin: 'auto' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h5" component="h2">{t('settings.title')}</Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button variant="contained" color="primary" onClick={handleSave} disabled={!hasChanges}>
              {t('settings.save_changes')}
            </Button>
            <Button variant="outlined" color="secondary" onClick={onReset}>
              {t('settings.reset_to_defaults')}
            </Button>
          </Box>
        </Box>

        <Divider sx={{ mb: 3 }} />

        <Grid container className="settings-container">
        {/* General Settings */}
        <Grid className="settings-item md-6">
          <FormControl fullWidth margin="normal">
            <InputLabel>{t('settings.language')}</InputLabel>
            <Select
              value={formSettings.language}
              label={t('settings.language')}
              onChange={(e) => handleInputChange('language', e.target.value)}
            >
              <MenuItem value="en">English</MenuItem>
              <MenuItem value="ko">한국어</MenuItem>
            </Select>
          </FormControl>
        </Grid>

        {/* Download Settings */}
        <Grid className="settings-item">
          <Typography variant="h6" gutterBottom>{t('settings.sections.downloads.title')}</Typography>
        </Grid>
        <Grid className="settings-item md-8">
          <TextField
            fullWidth
            label={t('settings.sections.downloads.directory')}
            value={formSettings.downloadPath}
            variant="outlined"
          />
        </Grid>
        <Grid className="settings-item md-4">
            <Button fullWidth variant="contained" onClick={handleFolderPicker} sx={{ height: '100%' }}>{t('settings.sections.downloads.directory_placeholder', 'Browse')}</Button>
        </Grid>
        <Grid className="settings-item md-6">
          <FormControl fullWidth margin="normal">
            <InputLabel>{t('settings.sections.downloads.quality')}</InputLabel>
            <Select
              value={formSettings.videoQuality}
              label={t('settings.sections.downloads.quality')}
              onChange={(e) => handleInputChange('videoQuality', e.target.value)}
            >
              <MenuItem value="best">Best</MenuItem>
              <MenuItem value="1080p">1080p</MenuItem>
              <MenuItem value="720p">720p</MenuItem>
              <MenuItem value="480p">480p</MenuItem>
            </Select>
          </FormControl>
        </Grid>
        <Grid className="settings-item md-6">
          <TextField
            fullWidth
            margin="normal"
            label={t('settings.sections.downloads.concurrent')}
            type="number"
            value={formSettings.maxConcurrentDownloads}
            onChange={(e) => handleInputChange('maxConcurrentDownloads', e.target.value)}
          />
        </Grid>
        <Grid className="settings-item">
          <TextField
            fullWidth
            margin="normal"
            label={t('settings.sections.downloads.output_template')}
            value={formSettings.outputTemplate}
            onChange={(e) => handleInputChange('outputTemplate', e.target.value)}
          />
        </Grid>

        {/* UI Settings */}
        <Grid className="settings-item">
          <Typography variant="h6" gutterBottom>{t('settings.sections.application.title')}</Typography>
        </Grid>
        <Grid className="settings-item">
          <FormControlLabel
            control={<Checkbox checked={formSettings.minimizeToTray} onChange={(e) => handleInputChange('minimizeToTray', e.target.checked)} />}
            label={t('settings.sections.application.minimize_to_tray')}
          />
        </Grid>
        <Grid className="settings-item">
          <FormControlLabel
            control={<Checkbox checked={formSettings.showNotifications} onChange={(e) => handleInputChange('showNotifications', e.target.checked)} />}
            label={t('settings.sections.application.show_notifications')}
          />
        </Grid>

        {/* Version Info */}
        <Grid className="settings-item">
            <Typography variant="h6" gutterBottom>{t('settings.sections.dependencies.title')}</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                <Typography variant="body1">yt-dlp: {ytDlpVersion}</Typography>
                <Box sx={{ width: 16 }} />
                <Typography variant="body1">FFmpeg: {ffmpegVersion}</Typography>
                <Box sx={{ flexGrow: 1 }} />
                <Tooltip title={t('settings.sections.dependencies.check_for_updates', 'Refresh')}>
                    <IconButton onClick={onRefreshVersions} size="small">
                        <RefreshIcon />
                    </IconButton>
                </Tooltip>
                <Button onClick={() => handleCheckForUpdate('yt-dlp')} disabled={ytDlpUpdate.status === 'checking' || ytDlpUpdate.status === 'installing'}>
                    {ytDlpUpdate.status === 'checking' ? 'Checking...' : t('settings.sections.dependencies.check_for_updates')}
                </Button>
            </Box>
            {ytDlpUpdate.status === 'available' && (
                <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Typography variant="body2">Update available: {ytDlpUpdate.latestVersion}</Typography>
                    <Button variant="contained" onClick={() => handleInstallUpdate('yt-dlp')}>
                        {t('settings.sections.dependencies.install_update')}
                    </Button>
                </Box>
            )}
            {ytDlpUpdate.status === 'installing' && <Typography variant="body2" sx={{ mt: 1 }}>Installing update...</Typography>}
            {ytDlpUpdate.status === 'up-to-date' && <Typography variant="body2" sx={{ mt: 1 }}>yt-dlp is up to date.</Typography>}
            {ytDlpUpdate.status === 'installed' && <Typography variant="body2" sx={{ mt: 1 }}>yt-dlp has been updated.</Typography>}
        </Grid>
              </Grid>
            </Box>
          </Paper>  );
};

export default Settings;