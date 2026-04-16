import { useCallback, useState } from 'react';
import type { DownloadRequestResponse, FormatOption } from '../types.js';
import type { AddDownloadDialogMode } from '../../shared/types.js';

export type DialogMode = AddDownloadDialogMode;

interface DialogState {
    open: boolean;
    mode: DialogMode;
    urlValue: string;
    errorMessage: string;
    isSubmitting: boolean;
    selectedFormatId: string;
    formatOptions: FormatOption[];
    formatTitle: string;
    formatUrlId: string;
}

const initialState: DialogState = {
    open: false,
    mode: 'url',
    urlValue: '',
    errorMessage: '',
    isSubmitting: false,
    selectedFormatId: '',
    formatOptions: [],
    formatTitle: '',
    formatUrlId: ''
};

export function useDialogState(enableFormatSelection: boolean) {
    const [state, setState] = useState<DialogState>(initialState);

    const openDialog = useCallback(() => {
        setState((current) => ({
            ...current,
            open: true,
            mode: 'url',
            errorMessage: '',
            urlValue: '',
            isSubmitting: false,
            selectedFormatId: '',
            formatOptions: [],
            formatTitle: '',
            formatUrlId: ''
        }));
    }, []);

    const closeDialog = useCallback(() => {
        setState(initialState);
    }, []);

    const setUrlValue = useCallback((value: string) => {
        setState((current) => ({ ...current, urlValue: value }));
    }, []);

    const setError = useCallback((message: string) => {
        setState((current) => ({ ...current, errorMessage: message }));
    }, []);

    const setSubmitting = useCallback((submitting: boolean) => {
        setState((current) => ({ ...current, isSubmitting: submitting }));
    }, []);

    const backToUrl = useCallback(() => {
        if (!enableFormatSelection) {
            return;
        }
        setState((current) => ({
            ...current,
            mode: 'url',
            isSubmitting: false,
            errorMessage: '',
            formatOptions: [],
            selectedFormatId: '',
            formatTitle: '',
            formatUrlId: '',
            open: true
        }));
    }, [enableFormatSelection]);

    const selectFormat = useCallback((formatId: string) => {
        setState((current) => ({ ...current, selectedFormatId: formatId, errorMessage: '' }));
    }, []);

    const openFormatSelection = useCallback(
        (details: { options: FormatOption[]; title: string; urlId: string; url: string }) => {
            if (!enableFormatSelection) {
                return;
            }
            const initialOption = details.options.find((option) => option.isAudioOnly !== true) ?? details.options[0] ?? null;
            setState((current) => ({
                ...current,
                open: true,
                mode: 'format',
                isSubmitting: false,
                errorMessage: '',
                formatOptions: details.options,
                selectedFormatId: initialOption ? initialOption.id : '',
                formatTitle: details.title,
                formatUrlId: details.urlId,
                urlValue: details.url || current.urlValue
            }));
        },
        [enableFormatSelection]
    );

    const resetForFormat = useCallback(
        (response: DownloadRequestResponse) => {
            if (!enableFormatSelection) {
                return;
            }
            openFormatSelection({
                options: response.options ?? [],
                title: response.title ?? '',
                urlId: response.item?.urlId ?? '',
                url: response.url ?? ''
            });
        },
        [enableFormatSelection, openFormatSelection]
    );

    return {
        state,
        openDialog,
        closeDialog,
        setUrlValue,
        setError,
        setSubmitting,
        resetForFormat,
        backToUrl,
        selectFormat,
        openFormatSelection
    } as const;
}
