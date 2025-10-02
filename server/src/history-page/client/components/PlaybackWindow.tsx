import { useCallback, useEffect, useMemo, useRef, useState, type FC } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

interface PlaybackWindowProps {
    title: string;
    streamUrl: string;
    urlId: string;
    onClose: () => void;
    onReload?: () => void;
    downloadUrl?: string;
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
const DEFAULT_DIMENSIONS: Dimensions = { width: 360, height: 202 };

function clampDimensions(candidate: Dimensions): Dimensions {
    if (typeof window === 'undefined') {
        return {
            width: Math.max(MIN_WIDTH, candidate.width),
            height: Math.max(MIN_HEIGHT, candidate.height)
        };
    }

    const maxWidth = Math.max(MIN_WIDTH, Math.min(window.innerWidth - VIEWPORT_MARGIN * 2, MAX_WIDTH));
    const maxHeight = Math.max(MIN_HEIGHT, Math.min(window.innerHeight - VIEWPORT_MARGIN * 2, MAX_HEIGHT));

    return {
        width: Math.min(Math.max(MIN_WIDTH, candidate.width), maxWidth),
        height: Math.min(Math.max(MIN_HEIGHT, candidate.height), maxHeight)
    };
}

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
    onReload,
    downloadUrl
}) => {
    const [dimensions, setDimensions] = useState<Dimensions>(() => clampDimensions(DEFAULT_DIMENSIONS));
    const [position, setPosition] = useState<Position>(() => clampPosition(computeInitialPosition(DEFAULT_DIMENSIONS), DEFAULT_DIMENSIONS));
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
    const dragCleanupRef = useRef<(() => void) | null>(null);
    const resizeCleanupRef = useRef<(() => void) | null>(null);

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

    useEffect(() => {
        setErrorMessage(null);
    }, [streamUrl]);

    const handlePointerMoveDrag = useCallback(
        (initialPosition: Position, startX: number, startY: number) => (event: PointerEvent) => {
            event.preventDefault();
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
            if (event.pointerType === 'mouse' && event.button !== 0) {
                return;
            }
            event.preventDefault();
            dragCleanupRef.current?.();
            const initialPosition = { ...position };
            const startX = event.clientX;
            const startY = event.clientY;
            setIsDragging(true);
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
        [handlePointerMoveDrag, position]
    );

    const startResize = useCallback(
        (event: ReactPointerEvent<HTMLDivElement>) => {
            if (event.pointerType === 'mouse' && event.button !== 0) {
                return;
            }
            event.preventDefault();
            resizeCleanupRef.current?.();
            const initialSize = { ...dimensions };
            const startX = event.clientX;
            const startY = event.clientY;
            setIsResizing(true);
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
        [dimensions, handlePointerMoveResize]
    );

    const handleVideoError = useCallback(() => {
        setErrorMessage('동영상을 재생할 수 없습니다. 파일이 삭제되었는지 확인해주세요.');
    }, []);

    const handleVideoCanPlay = useCallback(() => {
        setErrorMessage(null);
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
    }, [tryAutoplay, videoElement, streamUrl]);

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
        return classes.join(' ');
    }, [errorMessage, isDragging, isResizing]);

    const videoId = useMemo(() => `playback-video-${urlId}`, [urlId]);

    return (
        <div
            className={containerClassName}
            data-url-id={urlId}
            style={{
                width: `${dimensions.width}px`,
                height: `${dimensions.height}px`,
                top: `${position.top}px`,
                left: `${position.left}px`
            }}
        >
            <div className="playback-window__header" onPointerDown={startDrag} role="presentation">
                <div className="playback-window__title" title={title || '(제목 없음)'}>
                    {title || '(제목 없음)'}
                </div>
                <div className="playback-window__header-actions">
                    {downloadUrl ? (
                        <a
                            className="playback-window__icon-button"
                            href={downloadUrl}
                            title="파일 다운로드"
                            aria-label="파일 다운로드"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M11 5h2v8h3l-4 4-4-4h3z" />
                                <path d="M5 19h14v2H5z" />
                            </svg>
                        </a>
                    ) : null}
                    {onReload ? (
                        <button
                            type="button"
                            className="playback-window__icon-button"
                            title="다시 불러오기"
                            aria-label="다시 불러오기"
                            onClick={onReload}
                        >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M12 6a6 6 0 1 0 5.918 5.071l1.97.353A8 8 0 1 1 12 4v2z" />
                                <path d="M20 4v6h-6l2.146-2.146A6.002 6.002 0 0 0 12 6V4a8.002 8.002 0 0 1 6.854 3.77z" />
                            </svg>
                        </button>
                    ) : null}
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
                        src={streamUrl}
                        controls
                        playsInline
                        ref={handleVideoRef}
                        onCanPlay={handleVideoCanPlay}
                        onError={handleVideoError}
                    />
                )}
            </div>
            <div className="playback-window__resize-handle" role="presentation" onPointerDown={startResize} />
        </div>
    );
};

