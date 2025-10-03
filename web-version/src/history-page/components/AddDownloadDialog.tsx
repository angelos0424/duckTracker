import React from 'react';
import { AddDownloadDialog as SharedAddDownloadDialog } from '../shared/components/AddDownloadDialog.js';

interface ServerAddDownloadDialogProps {
    enableFormatSelection?: boolean;
}

export const AddDownloadDialog: React.FC<ServerAddDownloadDialogProps> = ({ enableFormatSelection = false }) => (
    <SharedAddDownloadDialog
        open={false}
        mode="url"
        urlValue=""
        errorMessage=""
        isSubmitting={false}
        enableFormatSelection={enableFormatSelection}
        formatOptions={[]}
        selectedFormatId=""
        formatTitle=""
    />
);
