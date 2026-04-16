import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FC } from 'react';

import type { CSSProperties, PointerEvent as ReactPointerEvent, SyntheticEvent } from 'react';

interface PlaybackWindowProps {
    title: string;
    streamUrl: string;
    urlId: string;
    onClose: () => void;
    onReload?: () => void;
}

interface Position {
    top: number;
    left: number;
}

interface Dimensions {
    width: number;
    height: number;
}

const MIN_WIDTH = 260;
const MIN_HEIGHT = 146;
const MAX_WIDTH = 960;
const MAX_HEIGHT = 720;
const VIEWPORT_MARGIN = 16;
const DEFAULT_VIDEO_DIMENSIONS: Dimensions = { width: 360, height: 202 };
const INVALID_FILENAME_CHARACTERS = /[\\/:*?"<>|\u0000-\u001F]/gu;

interface ViewportBounds {
    maxWidth: number;
    maxHeight: number;
}

type WindowState = 'default' | 'minimized' | 'maximized';

function getViewportBounds(): ViewportBounds {
    if (typeof window === 'undefined') {
        return {
            maxWidth: MAX_WIDTH,
            maxHeight: MAX_HEIGHT
        };
    }

    return {
        maxWidth: Math.max(MIN_WIDTH, Math.min(window.innerWidth - VIEWPORT_MARGIN * 2, MAX_WIDTH)),
        maxHeight: Math.max(MIN_HEIGHT, Math.min(window.innerHeight - VIEWPORT_MARGIN * 2, MAX_HEIGHT))
    };
}

function clampDimensions(candidate: Dimensions): Dimensions {
    const { maxWidth, maxHeight } = getViewportBounds();

    return {
        width: Math.min(Math.max(MIN_WIDTH, candidate.width), maxWidth),
        height: Math.min(Math.max(MIN_HEIGHT, candidate.height), maxHeight)
    };
}

function computeWindowDimensions(videoWidth: number, videoHeight: number, chromeHeight: number): Dimensions {
    const effectiveWidth = videoWidth > 0 ? videoWidth : DEFAULT_VIDEO_DIMENSIONS.width;
    const effectiveHeight = videoHeight > 0 ? videoHeight : DEFAULT_VIDEO_DIMENSIONS.height;
    const aspectRatio = effectiveWidth / effectiveHeight;
    const { maxWidth, maxHeight } = getViewportBounds();
    const maxVideoHeight = Math.max(0, maxHeight - chromeHeight);
    const minVideoHeight = Math.max(0, MIN_HEIGHT - chromeHeight);

    let width = Math.min(effectiveWidth, maxWidth);
    let height = width / aspectRatio;

    if (maxVideoHeight > 0 && height > maxVideoHeight) {
        height = maxVideoHeight;
        width = height * aspectRatio;
    }

    if (width < MIN_WIDTH) {
        width = MIN_WIDTH;
        height = width / aspectRatio;
    }

    if (height < minVideoHeight) {
        height = minVideoHeight;
        width = height * aspectRatio;
    }

    if (width > maxWidth) {
        width = maxWidth;
        height = width / aspectRatio;
    }

    if (maxVideoHeight > 0 && height > maxVideoHeight) {
        height = maxVideoHeight;
        width = height * aspectRatio;
    }

    const containerHeight = height + chromeHeight;

    return clampDimensions({
        width: Math.round(width),
        height: Math.round(containerHeight)
    });
}

function normaliseDownloadBaseName(title: string): string | null {
    const trimmed = title.trim();
    if (!trimmed) {
        return null;
    }
    const sanitised = trimmed.replace(INVALID_FILENAME_CHARACTERS, '_').replace(/\s+/gu, ' ').trim();
    const withoutTrailingDots = sanitised.replace(/\.+$/u, '');
    if (!withoutTrailingDots) {
        return null;
    }
    const MAX_BASE_LENGTH = 180;
    if (withoutTrailingDots.length <= MAX_BASE_LENGTH) {
        return withoutTrailingDots;
    }
    return withoutTrailingDots.slice(0, MAX_BASE_LENGTH).trim();
}

function buildStreamUrl(streamUrl: string, downloadBaseName: string | null): string {
    if (!streamUrl) {
        return streamUrl;
    }
    if (!downloadBaseName) {
        return streamUrl;
    }
    try {
        const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
        const url = new URL(streamUrl, base);
        url.searchParams.set('downloadName', downloadBaseName);
        return url.toString();
    } catch (error) {
        return streamUrl;
    }
}

const MinimizeIcon = () => (
    <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="6" y="13" width="12" height="2" rx="1" />
    </svg>
);

const MaximizeIcon = () => (
    <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="5" y="5" width="14" height="14" rx="2" ry="2" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
);

const RestoreIcon = () => (
    <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 9a1 1 0 0 1 1-1h6V6H7a3 3 0 0 0-3 3v8h2z" />
        <rect x="10" y="10" width="8" height="8" rx="2" ry="2" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
);

function clampPosition(candidate: Position, size: Dimensions): Position {
    if (typeof window === 'undefined') {
        return candidate;
    }

    const maxLeft = Math.max(VIEWPORT_MARGIN, window.innerWidth - size.width - VIEWPORT_MARGIN);
    const maxTop = Math.max(VIEWPORT_MARGIN, window.innerHeight - size.height - VIEWPORT_MARGIN);

    return {
        top: Math.min(Math.max(VIEWPORT_MARGIN, candidate.top), maxTop),
        left: Math.min(Math.max(VIEWPORT_MARGIN, candidate.left), maxLeft)
    };
}

function computeInitialPosition(size: Dimensions): Position {
    if (typeof window === 'undefined') {
        return { top: VIEWPORT_MARGIN, left: VIEWPORT_MARGIN };
    }

    const top = Math.max(VIEWPORT_MARGIN, window.innerHeight - size.height - VIEWPORT_MARGIN);
    const left = Math.max(VIEWPORT_MARGIN, window.innerWidth - size.width - VIEWPORT_MARGIN);
    return { top, left };
}

export const PlaybackWindow: FC<PlaybackWindowProps> = ({
    title,
    streamUrl,
    urlId,
    onClose,
    onReload
}) => {
    const [dimensions, setDimensions] = useState<Dimensions>(() =>
        clampDimensions({
            width: DEFAULT_VIDEO_DIMENSIONS.width,
            height: DEFAULT_VIDEO_DIMENSIONS.height
        })
    );
    const [position, setPosition] = useState<Position>(() =>
        clampPosition(
            computeInitialPosition({
                width: DEFAULT_VIDEO_DIMENSIONS.width,
                height: DEFAULT_VIDEO_DIMENSIONS.height
            }),
            {
                width: DEFAULT_VIDEO_DIMENSIONS.width,
                height: DEFAULT_VIDEO_DIMENSIONS.height
            }
        )
    );
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [windowState, setWindowState] = useState<WindowState>('default');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
    const dragCleanupRef = useRef<(() => void) | null>(null);
    const resizeCleanupRef = useRef<(() => void) | null>(null);
    const previousLayoutRef = useRef<{ dimensions: Dimensions; position: Position } | null>(null);
    const hasInteractedRef = useRef(false);
    const headerRef = useRef<HTMLDivElement | null>(null);
    const headerHeightRef = useRef(0);
    const downloadBaseName = useMemo(() => normaliseDownloadBaseName(title), [title]);
    const resolvedStreamUrl = useMemo(() => buildStreamUrl(streamUrl, downloadBaseName), [downloadBaseName, streamUrl]);
    const getDefaultWindowDimensions = useCallback(
        () => computeWindowDimensions(DEFAULT_VIDEO_DIMENSIONS.width, DEFAULT_VIDEO_DIMENSIONS.height, headerHeightRef.current),
        []
    );

    useEffect(() => {
        const handleWindowResize = () => {
            setDimensions((prev) => {
                const next = clampDimensions(prev);
                setPosition((current) => clampPosition(current, next));
                return next;
            });
        };

        window.addEventListener('resize', handleWindowResize);
        return () => {
            window.removeEventListener('resize', handleWindowResize);
        };
    }, []);

    useEffect(() => {
        return () => {
            dragCleanupRef.current?.();
            resizeCleanupRef.current?.();
        };
    }, []);

    useEffect(() => {
        setPosition((current) => clampPosition(current, dimensions));
    }, [dimensions]);

    useLayoutEffect(() => {
        if (!headerRef.current) {
            return;
        }
        const measuredHeight = Math.round(headerRef.current.getBoundingClientRect().height);
        if (measuredHeight === headerHeightRef.current) {
            return;
        }
        const delta = measuredHeight - headerHeightRef.current;
        headerHeightRef.current = measuredHeight;
        setDimensions((prev) => {
            const next = clampDimensions({
                ...prev,
                height: prev.height + delta
            });
            if (next.width === prev.width && next.height === prev.height) {
                return prev;
            }
            return next;
        });
        if (previousLayoutRef.current) {
            const updatedDimensions = clampDimensions({
                ...previousLayoutRef.current.dimensions,
                height: previousLayoutRef.current.dimensions.height + delta
            });
            previousLayoutRef.current = {
                dimensions: updatedDimensions,
                position: clampPosition(previousLayoutRef.current.position, updatedDimensions)
            };
        }
    }, [dimensions.width, title, windowState]);

    useEffect(() => {
        setErrorMessage(null);
        hasInteractedRef.current = false;
        setWindowState('default');
        previousLayoutRef.current = null;
        const resetDimensions = getDefaultWindowDimensions();
        setDimensions(resetDimensions);
        setPosition(() => clampPosition(computeInitialPosition(resetDimensions), resetDimensions));
    }, [getDefaultWindowDimensions, streamUrl]);


    const handlePointerMoveDrag = useCallback(
        (initialPosition: Position, startX: number, startY: number) => (event: PointerEvent) => {
            event.preventDefault();
            event.stopPropagation();
            const deltaX = event.clientX - startX;
            const deltaY = event.clientY - startY;
            const nextPosition = clampPosition(
                {
                    top: initialPosition.top + deltaY,
                    left: initialPosition.left + deltaX
                },
                dimensions
            );
            setPosition(nextPosition);
        },
        [dimensions]
    );

    const handlePointerMoveResize = useCallback(
        (initialSize: Dimensions, startX: number, startY: number) => (event: PointerEvent) => {
            event.preventDefault();
            event.stopPropagation();
            const deltaX = event.clientX - startX;
            const deltaY = event.clientY - startY;
            const nextSize = clampDimensions({
                width: initialSize.width + deltaX,
                height: initialSize.height + deltaY
            });
            setDimensions(nextSize);
            setPosition((current) => clampPosition(current, nextSize));
        },
        []
    );

    const startDrag = useCallback(
        (event: ReactPointerEvent<HTMLDivElement>) => {
            if (windowState === 'maximized') {
                return;
            }
            if (event.pointerType === 'mouse' && event.button !== 0) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            dragCleanupRef.current?.();
            const initialPosition = { ...position };
            const startX = event.clientX;
            const startY = event.clientY;
            setIsDragging(true);
            hasInteractedRef.current = true;
            const moveListener = handlePointerMoveDrag(initialPosition, startX, startY);
            const stopDragging = () => {
                window.removeEventListener('pointermove', moveListener);
                window.removeEventListener('pointerup', stopDragging);
                window.removeEventListener('pointercancel', stopDragging);
                setIsDragging(false);
                if (dragCleanupRef.current === stopDragging) {
                    dragCleanupRef.current = null;
                }
            };
            window.addEventListener('pointermove', moveListener);
            window.addEventListener('pointerup', stopDragging);
            window.addEventListener('pointercancel', stopDragging);
            dragCleanupRef.current = stopDragging;
        },
        [handlePointerMoveDrag, position, windowState]
    );

    const startResize = useCallback(
        (event: ReactPointerEvent<HTMLDivElement>) => {
            if (windowState !== 'default') {
                return;
            }
            if (event.pointerType === 'mouse' && event.button !== 0) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            resizeCleanupRef.current?.();
            const initialSize = { ...dimensions };
            const startX = event.clientX;
            const startY = event.clientY;
            setIsResizing(true);
            hasInteractedRef.current = true;
            const moveListener = handlePointerMoveResize(initialSize, startX, startY);
            const stopResizing = () => {
                window.removeEventListener('pointermove', moveListener);
                window.removeEventListener('pointerup', stopResizing);
                window.removeEventListener('pointercancel', stopResizing);
                setIsResizing(false);
                if (resizeCleanupRef.current === stopResizing) {
                    resizeCleanupRef.current = null;
                }
            };
            window.addEventListener('pointermove', moveListener);
            window.addEventListener('pointerup', stopResizing);
            window.addEventListener('pointercancel', stopResizing);
            resizeCleanupRef.current = stopResizing;
        },
        [dimensions, handlePointerMoveResize, windowState]
    );

    const handleVideoError = useCallback(() => {
        setErrorMessage('동영상을 재생할 수 없습니다. 파일이 삭제되었는지 확인해주세요.');
    }, []);

    const handleVideoCanPlay = useCallback(() => {
        setErrorMessage(null);
    }, []);

    const handleVideoLoadedMetadata = useCallback((event: SyntheticEvent<HTMLVideoElement>) => {
        const { videoWidth, videoHeight } = event.currentTarget;
        const nextDimensions = computeWindowDimensions(videoWidth, videoHeight, headerHeightRef.current);

        setDimensions(nextDimensions);
        setPosition((current) => {
            const nextPosition = hasInteractedRef.current
                ? clampPosition(current, nextDimensions)
                : clampPosition(computeInitialPosition(nextDimensions), nextDimensions);
            if (previousLayoutRef.current) {
                previousLayoutRef.current = {
                    dimensions: nextDimensions,
                    position: nextPosition
                };
            }
            return nextPosition;
        });
    }, []);

    const tryAutoplay = useCallback((video: HTMLVideoElement | null) => {
        if (!video) {
            return;
        }
        const playPromise = video.play();
        if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(() => {
                // Autoplay was likely prevented; the user can start playback manually.
            });
        }
    }, []);

    const handleVideoRef = useCallback((node: HTMLVideoElement | null) => {
        setVideoElement(node);
    }, []);

    useEffect(() => {
        if (videoElement) {
            tryAutoplay(videoElement);
        }
    }, [tryAutoplay, videoElement, resolvedStreamUrl]);

    useEffect(() => {
        if (!videoElement) {
            return;
        }
        if ('disablePictureInPicture' in videoElement) {
            videoElement.disablePictureInPicture = true;
        }
        if ('disableRemotePlayback' in videoElement) {
            (videoElement as HTMLVideoElement & { disableRemotePlayback?: boolean }).disableRemotePlayback = true;
        }
        const handleEnterPictureInPicture = (event: Event) => {
            event.preventDefault();
            if (document.pictureInPictureElement === videoElement && typeof document.exitPictureInPicture === 'function') {
                void document.exitPictureInPicture().catch(() => undefined);
            }
        };
        videoElement.addEventListener('enterpictureinpicture', handleEnterPictureInPicture);
        return () => {
            videoElement.removeEventListener('enterpictureinpicture', handleEnterPictureInPicture);
        };
    }, [videoElement]);

    const restoreFromMaximized = useCallback(() => {
        const previous = previousLayoutRef.current;
        if (!previous) {
            previousLayoutRef.current = null;
            return;
        }
        const nextDimensions = clampDimensions(previous.dimensions);
        setDimensions(nextDimensions);
        setPosition(() => clampPosition(previous.position, nextDimensions));
        previousLayoutRef.current = null;
    }, []);

    const handleToggleMaximize = useCallback(() => {
        hasInteractedRef.current = true;
        if (windowState === 'maximized') {
            restoreFromMaximized();
            setWindowState('default');
            return;
        }
        previousLayoutRef.current = {
            dimensions: { ...dimensions },
            position: { ...position }
        };
        setWindowState('maximized');
    }, [dimensions, position, restoreFromMaximized, windowState]);

    const handleToggleMinimize = useCallback(() => {
        hasInteractedRef.current = true;
        if (windowState === 'minimized') {
            setWindowState('default');
            return;
        }
        if (windowState === 'maximized') {
            restoreFromMaximized();
        }
        setWindowState('minimized');
    }, [restoreFromMaximized, windowState]);

    const isMinimized = windowState === 'minimized';
    const isMaximized = windowState === 'maximized';

    const resolvedDimensions = useMemo(() => {
        if (isMaximized) {
            const { maxWidth, maxHeight } = getViewportBounds();
            return { width: maxWidth, height: maxHeight };
        }
        return dimensions;
    }, [dimensions, isMaximized]);

    const resolvedPosition = useMemo(() => {
        if (isMaximized) {
            return { top: VIEWPORT_MARGIN, left: VIEWPORT_MARGIN };
        }
        return position;
    }, [isMaximized, position]);

    const containerStyle = useMemo<CSSProperties>(() => {
        const style: CSSProperties = {
            width: `${resolvedDimensions.width}px`,
            top: `${resolvedPosition.top}px`,
            left: `${resolvedPosition.left}px`
        };
        if (!isMinimized) {
            style.height = `${resolvedDimensions.height}px`;
        }
        return style;
    }, [isMinimized, resolvedDimensions, resolvedPosition]);

    const containerClassName = useMemo(() => {
        const classes = ['playback-window'];
        if (isDragging) {
            classes.push('playback-window--dragging');
        }
        if (isResizing) {
            classes.push('playback-window--resizing');
        }
        if (errorMessage) {
            classes.push('playback-window--error');
        }
        if (isMinimized) {
            classes.push('playback-window--minimized');
        }
        if (isMaximized) {
            classes.push('playback-window--maximized');
        }
        return classes.join(' ');
    }, [errorMessage, isDragging, isMaximized, isMinimized, isResizing]);

    const videoId = useMemo(() => `playback-video-${urlId}`, [urlId]);

    return (
        <div className={containerClassName} data-url-id={urlId} style={containerStyle}>
            <div className="playback-window__header" onPointerDown={startDrag} role="presentation" ref={headerRef}>
                <div className="playback-window__title" title={title || '(제목 없음)'}>
                    {title || '(제목 없음)'}
                </div>
                <div className="playback-window__header-actions">
                    <button
                        type="button"
                        className="playback-window__icon-button"
                        title={isMinimized ? '창 복원' : '창 최소화'}
                        aria-label={isMinimized ? '창 복원' : '창 최소화'}
                        onClick={handleToggleMinimize}
                    >
                        {isMinimized ? <RestoreIcon /> : <MinimizeIcon />}
                    </button>
                    <button
                        type="button"
                        className="playback-window__icon-button"
                        title={isMaximized ? '창 복원' : '창 최대화'}
                        aria-label={isMaximized ? '창 복원' : '창 최대화'}
                        onClick={handleToggleMaximize}
                    >
                        {isMaximized ? <RestoreIcon /> : <MaximizeIcon />}
                    </button>
                    <button
                        type="button"
                        className="playback-window__icon-button playback-window__close"
                        title="창 닫기"
                        aria-label="창 닫기"
                        onClick={onClose}
                    >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M18.3 5.71 12 12l6.3 6.29-1.42 1.42L10.59 13.4 4.3 19.71 2.89 18.3 9.17 12 2.89 5.71 4.3 4.29l6.29 6.3 6.29-6.3z" />
                        </svg>
                    </button>
                </div>
            </div>
            <div className="playback-window__body">
                {errorMessage ? (
                    <div className="playback-window__error" role="alert">
                        <p>{errorMessage}</p>
                        {onReload ? (
                            <button type="button" className="button button--primary" onClick={onReload}>
                                다시 시도
                            </button>
                        ) : null}
                    </div>
                ) : (
                    <video
                        id={videoId}
                        key={streamUrl}
                        className="playback-window__video"
                        src={resolvedStreamUrl}
                        controls
                        playsInline
                        disablePictureInPicture
                        disableRemotePlayback
                        ref={handleVideoRef}
                        onLoadedMetadata={handleVideoLoadedMetadata}
                        onCanPlay={handleVideoCanPlay}
                        onError={handleVideoError}
                    />
                )}
            </div>
            <div className="playback-window__resize-handle" role="presentation" onPointerDown={startResize} />
        </div>
    );
};
