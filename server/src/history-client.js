(function () {
  function ready(callback) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback, { once: true });
    } else {
      callback();
    }
  }

  function parseProps() {
    const propsElement = document.getElementById("history-props");
    if (!propsElement) {
      return null;
    }
    try {
      const raw = propsElement.textContent || "{}";
      return JSON.parse(raw);
    } catch (error) {
      console.error("Failed to parse history props", error);
      return null;
    }
  }

  function formatProgress(value) {
    if (!Number.isFinite(value)) {
      return 0;
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return 0;
    }
    if (numeric <= 0) {
      return 0;
    }
    if (numeric >= 100) {
      return 100;
    }
    return Math.round(numeric);
  }

  function getProgressFromItem(item) {
    if (item && Number.isFinite(item.percent)) {
      return formatProgress(item.percent);
    }
    return item && item.status === "completed" ? 100 : 0;
  }

  function formatFileSize(bytes) {
    if (bytes === null || bytes === undefined) {
      return null;
    }
    const numeric = typeof bytes === "number" ? bytes : Number(bytes);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return null;
    }
    const megabytes = numeric / (1024 * 1024);
    if (megabytes >= 1000) {
      const gigabytes = megabytes / 1024;
      return gigabytes.toFixed(2) + " GB";
    }
    return megabytes.toFixed(2) + " MB";
  }

  function validateUrl(value) {
    try {
      const parsed = new URL(value);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch (_error) {
      return false;
    }
  }

  function deriveUrlId(value) {
    try {
      const parsed = new URL(value);
      if (parsed.searchParams.has("list")) {
        return parsed.searchParams.get("list") || "";
      }
      const pathname = parsed.pathname || "";
      const shortsMatch = pathname.match(/\/shorts\/([a-zA-Z0-9_-]{11})/u);
      if (shortsMatch && shortsMatch[1]) {
        return shortsMatch[1];
      }
      const watchId = parsed.searchParams.get("v");
      if (watchId) {
        return watchId;
      }
      if (parsed.hostname === "youtu.be") {
        const parts = pathname.split("/");
        if (parts.length > 1 && parts[1]) {
          return parts[1];
        }
      }
      return parsed.href;
    } catch (_error) {
      return "";
    }
  }

  function extractFilename(response, fallback) {
    const disposition = response.headers.get("Content-Disposition");
    if (!disposition) {
      return fallback;
    }
    const encodedMatch = /filename\*=UTF-8''([^;]+)/iu.exec(disposition);
    const quotedMatch = /filename="?([^";]+)"?/iu.exec(disposition);
    const raw = (encodedMatch && encodedMatch[1]) || (quotedMatch && quotedMatch[1]);
    if (!raw) {
      return fallback;
    }
    try {
      return decodeURIComponent(raw.trim());
    } catch (_error) {
      return raw.trim();
    }
  }

  function buildPageLink(baseParams, overrides) {
    const params = new URLSearchParams(baseParams);
    Object.keys(overrides || {}).forEach(function (key) {
      const value = overrides[key];
      if (value === null || value === undefined) {
        params.delete(key);
      } else {
        params.set(key, String(value));
      }
    });
    const queryString = params.toString();
    return queryString ? "?" + queryString : "";
  }

  ready(function () {
    if (typeof window === "undefined") {
      return;
    }

    if (!window.React || !window.ReactDOM) {
      console.error("React and ReactDOM must be loaded before history client initialises.");
      return;
    }

    const initialProps = parseProps();
    if (!initialProps) {
      return;
    }

    const ReactGlobal = window.React;
    const ReactDOMGlobal = window.ReactDOM;
    const h = ReactGlobal.createElement;
    const Fragment = ReactGlobal.Fragment;
    const useCallback = ReactGlobal.useCallback;
    const useEffect = ReactGlobal.useEffect;
    const useMemo = ReactGlobal.useMemo;
    const useState = ReactGlobal.useState;
    const hydrateRoot = ReactDOMGlobal.hydrateRoot;

    function ProgressCell(props) {
      return h(
        "div",
        { className: "progress-wrapper", role: "progressbar", "aria-valuenow": props.progress, "aria-valuemin": 0, "aria-valuemax": 100 },
        h(
          "div",
          { className: "progress-track" },
          h("div", { className: "progress-fill", style: { width: props.progress + "%" } })
        ),
        h("span", { className: "progress-value" }, props.progress + "%")
      );
    }

    function ActionsCell(props) {
      const status = props.item.status || "";
      const isActive = status === "downloading" || status === "queued";
      const fileExists = Boolean(props.item.filePath);
      const downloadBusy = Boolean(props.isDownloadPending);
      const stopBusy = Boolean(props.isStopPending);
      const resumeBusy = Boolean(props.isResumePending);
      const removeBusy = Boolean(props.isRemovePending);
      const deleteBusy = Boolean(props.isDeletePending);
      const canDownload = !props.downloadDisabled && !downloadBusy;

      return h(
        Fragment,
        null,
        h(
          "button",
          {
            className: "icon-button stop-button",
            "data-url-id": props.urlId,
            title: "다운로드 정지",
            "aria-label": "다운로드 정지",
            disabled: !isActive || stopBusy,
            onClick: props.onStop
              ? function (event) {
                  event.preventDefault();
                  props.onStop(props.urlId);
                }
              : undefined
          },
          h(
            "svg",
            { viewBox: "0 0 24 24", "aria-hidden": "true" },
            h("path", { d: "M8 5h3v14H8zm5 0h3v14h-3z" })
          )
        ),
        h(
          "button",
          {
            className: "icon-button resume-button",
            "data-url-id": props.urlId,
            title: "다운로드 재시작",
            "aria-label": "다운로드 재시작",
            disabled: isActive || resumeBusy,
            onClick: props.onResume
              ? function (event) {
                  event.preventDefault();
                  props.onResume(props.urlId);
                }
              : undefined
          },
          h(
            "svg",
            { viewBox: "0 0 24 24", "aria-hidden": "true" },
            h("path", { d: "M8 5v14l11-7z" })
          )
        ),
        h(
          "button",
          {
            className: "icon-button download-button",
            "data-url-id": props.urlId,
            title: props.downloadTitle,
            "aria-label": props.downloadTitle,
            disabled: !canDownload,
            "data-loading": downloadBusy ? "true" : undefined,
            "aria-busy": downloadBusy ? "true" : undefined,
            onClick: props.onDownload
              ? function (event) {
                  event.preventDefault();
                  props.onDownload(props.urlId);
                }
              : undefined
          },
          h("span", { className: "spinner", "aria-hidden": "true" }),
          h(
            "svg",
            { viewBox: "0 0 24 24", "aria-hidden": "true" },
            h("path", { d: "M5 20h14v-2H5v2zm7-18l-5.5 6h3.5v6h4v-6H17L12 2z" })
          )
        ),
        h(
          "button",
          {
            className: "icon-button remove-file-button",
            "data-url-id": props.urlId,
            title: fileExists ? "파일만 삭제" : "삭제할 파일이 없습니다.",
            "aria-label": "파일 삭제",
            disabled: !fileExists || removeBusy,
            onClick: props.onRemoveFile
              ? function (event) {
                  event.preventDefault();
                  props.onRemoveFile(props.urlId);
                }
              : undefined
          },
          h(
            "svg",
            { viewBox: "0 0 24 24", "aria-hidden": "true" },
            h("path", { d: "M16 9v10H8V9h8m-1.5-6h-5l-1 1H5v2h14V4h-3.5l-1-1z" }),
            h("path", { d: "M10 11h1.5v6H10zm2.5 0H14v6h-1.5z" })
          )
        ),
        h(
          "button",
          {
            className: "icon-button delete-button",
            "data-url-id": props.urlId,
            title: "이력 삭제",
            "aria-label": "이력 삭제",
            disabled: deleteBusy,
            onClick: props.onDelete
              ? function (event) {
                  event.preventDefault();
                  props.onDelete(props.urlId);
                }
              : undefined
          },
          h(
            "svg",
            { viewBox: "0 0 24 24", "aria-hidden": "true" },
            h("path", { d: "M16 9v10H8V9h8m-1.5-6h-5l-1 1H5v2h14V4h-3.5l-1-1z" })
          )
        )
      );
    }

    function TableRow(props) {
      const item = props.item;
      const downloadPending = props.downloadPending || {};
      const stopPending = props.stopPending || {};
      const resumePending = props.resumePending || {};
      const removePending = props.removePending || {};
      const deletePending = props.deletePending || {};
      const title = (item.title && item.title.trim()) || "";
      const urlId = item.urlId || "";
      const status = item.status || "unknown";
      const createdAt = item.createdAt || "-";
      const updatedAt = item.updatedAt || "-";
      const sourceUrl = item.url || "";
      const urlDisplay = sourceUrl || urlId || "";
      const statusClass = "status-badge status-" + status;
      const progressValue = getProgressFromItem(item);
      const fileAvailable = Boolean(item.filePath);
      const downloadDisabled = !fileAvailable || status !== "completed";
      const downloadTitle = downloadDisabled ? "완료된 항목만 다운로드할 수 있습니다." : "파일 다운로드";

      var rawSize = item.fileSizeBytes;
      var sizeValue = null;
      if (typeof rawSize === "number") {
        sizeValue = rawSize;
      } else if (rawSize !== null && rawSize !== undefined) {
        var parsedSize = Number(rawSize);
        sizeValue = Number.isFinite(parsedSize) && parsedSize >= 0 ? parsedSize : null;
      }
      const fileSizeText = formatFileSize(sizeValue);
      const fileSizeTitle =
        fileSizeText && typeof sizeValue === "number" && Number.isFinite(sizeValue)
          ? sizeValue.toLocaleString() + " bytes"
          : undefined;

      return h(
        "tr",
        { "data-url-id": urlId, "data-status": status, "data-source-url": sourceUrl, "data-file-path": item.filePath || "" },
        h(
          "td",
          { className: "title", "data-label": "제목" },
          h("div", { className: "title-text", title: title || "(제목 없음)" }, title ? title : h("span", { className: "muted" }, "(제목 없음)")),
          h(
            "div",
            { className: "title-url", title: urlDisplay || "-" },
            sourceUrl
              ? h("a", { href: sourceUrl, target: "_blank", rel: "noopener noreferrer" }, urlDisplay)
              : urlDisplay
              ? urlDisplay
              : h("span", { className: "muted" }, "-")
          )
        ),
        h(
          "td",
          { className: "status", "data-label": "상태" },
          h("span", { className: statusClass }, status)
        ),
        h(
          "td",
          { className: "progress", "data-label": "진행률" },
          h(ProgressCell, { progress: progressValue })
        ),
        h(
          "td",
          { className: "size", "data-label": "크기" },
          fileSizeText
            ? h("span", { title: fileSizeTitle }, fileSizeText)
            : h("span", { className: "muted" }, "-")
        ),
        h("td", { className: "created", "data-label": "생성일" }, createdAt),
        h("td", { className: "updated", "data-label": "업데이트" }, updatedAt),
        h(
          "td",
          { className: "actions", "data-label": "작업" },
          h(ActionsCell, {
            item: item,
            urlId: urlId,
            downloadTitle: downloadTitle,
            downloadDisabled: downloadDisabled,
            onStop: props.onStop,
            onResume: props.onResume,
            onDownload: props.onDownload,
            onRemoveFile: props.onRemoveFile,
            onDelete: props.onDelete,
            isDownloadPending: downloadPending[urlId],
            isStopPending: stopPending[urlId],
            isResumePending: resumePending[urlId],
            isRemovePending: removePending[urlId],
            isDeletePending: deletePending[urlId]
          })
        )
      );
    }

    function HistoryTable(props) {
      const rows = props.items || [];
      const header = h(
        "thead",
        null,
        h(
          "tr",
          null,
          h("th", null, "제목"),
          h("th", null, "상태"),
          h("th", null, "진행률"),
          h("th", null, "크기"),
          h("th", null, "생성일"),
          h("th", null, "업데이트"),
          h("th", { className: "actions-column" }, "작업")
        )
      );

      if (rows.length === 0) {
        return h(
          "table",
          { role: "grid" },
          header,
          h(
            "tbody",
            null,
            h(
              "tr",
              { className: "empty-row" },
              h("td", { colSpan: 7 }, "검색 결과가 없습니다.")
            )
          )
        );
      }

      return h(
        "table",
        { role: "grid" },
        header,
        h(
          "tbody",
          null,
          rows.map(function (item, index) {
            const key = item.urlId || "row-" + index;
            return h(TableRow, {
              key: key,
              item: item,
              onStop: props.onStop,
              onResume: props.onResume,
              onDownload: props.onDownload,
              onRemoveFile: props.onRemoveFile,
              onDelete: props.onDelete,
              downloadPending: props.downloadPending,
              stopPending: props.stopPending,
              resumePending: props.resumePending,
              removePending: props.removePending,
              deletePending: props.deletePending
            });
          })
        )
      );
    }

    function Pagination(props) {
      const baseParams = new URLSearchParams();
      if (props.searchTerm) {
        baseParams.set("search", props.searchTerm);
      }
      baseParams.set("pageSize", String(props.pageSize));

      const prevLink = props.page > 1 ? buildPageLink(baseParams, { page: props.page - 1 }) : null;
      const nextLink = props.page < props.totalPages ? buildPageLink(baseParams, { page: props.page + 1 }) : null;

      return h(
        "div",
        { className: "pagination" },
        prevLink ? h("a", { href: prevLink, "aria-label": "이전 페이지" }, "이전") : h("span", { className: "disabled" }, "이전"),
        h("span", { className: "current" }, props.page + " / " + props.totalPages),
        nextLink ? h("a", { href: nextLink, "aria-label": "다음 페이지" }, "다음") : h("span", { className: "disabled" }, "다음")
      );
    }

    function SearchForm(props) {
      return h(
        "form",
        { method: "GET", action: "/history", className: "search-form" },
        h("label", { htmlFor: "search", className: "visually-hidden" }, "URL ID 또는 제목 검색"),
        h("input", {
          type: "text",
          id: "search",
          name: "search",
          placeholder: "URL ID 또는 제목 검색",
          defaultValue: props.searchTerm || "",
          "aria-label": "URL ID 또는 제목 검색"
        }),
        h("button", { type: "submit", className: "primary" }, "검색")
      );
    }

    function AddDownloadDialog(props) {
      return h(
        "div",
        {
          className: "dialog-backdrop" + (props.open ? " visible" : ""),
          "data-dialog": "add-download",
          hidden: !props.open,
          onClick: function (event) {
            if (event.target === event.currentTarget && props.onClose) {
              props.onClose();
            }
          }
        },
        h(
          "div",
          { className: "dialog", role: "dialog", "aria-modal": "true", "aria-labelledby": "add-download-title" },
          h("h2", { id: "add-download-title" }, "다운로드 추가"),
          h("p", null, "다운로드할 영상의 URL을 입력하세요."),
          h(
            "form",
            {
              "data-form": "add-download",
              onSubmit: function (event) {
                event.preventDefault();
                if (props.onSubmit) {
                  props.onSubmit();
                }
              }
            },
            h("label", { htmlFor: "download-url", className: "visually-hidden" }, "다운로드 URL"),
            h("input", {
              type: "url",
              id: "download-url",
              name: "url",
              placeholder: "https://",
              required: true,
              value: props.urlValue,
              onChange: function (event) {
                if (props.onUrlChange) {
                  props.onUrlChange(event.target.value);
                }
              }
            }),
            h("p", { className: "form-helper", "data-error-message": true, hidden: !props.errorMessage }, props.errorMessage || "유효한 URL을 입력해주세요."),
            h(
              "div",
              { className: "dialog-buttons" },
              h(
                "button",
                {
                  type: "button",
                  className: "secondary",
                  "data-action": "cancel-dialog",
                  onClick: function (event) {
                    event.preventDefault();
                    if (props.onClose) {
                      props.onClose();
                    }
                  }
                },
                "취소"
              ),
              h("button", { type: "submit", className: "primary", disabled: props.isSubmitting }, props.isSubmitting ? "요청 중..." : "다운로드 요청")
            )
          )
        )
      );
    }

    function HistoryApp(props) {
      const [items, setItems] = useState(function () {
        return (props.items || []).map(function (item) {
          return Object.assign({}, item);
        });
      });
      const [dialogOpen, setDialogOpen] = useState(false);
      const [urlValue, setUrlValue] = useState("");
      const [formError, setFormError] = useState("");
      const [isSubmitting, setIsSubmitting] = useState(false);
      const [downloadPending, setDownloadPending] = useState({});
      const [stopPending, setStopPending] = useState({});
      const [resumePending, setResumePending] = useState({});
      const [removePending, setRemovePending] = useState({});
      const [deletePending, setDeletePending] = useState({});

      const updateItemState = useCallback(function (state) {
        if (!state || !state.urlId) {
          return;
        }
        setItems(function (previous) {
          let found = false;
          const next = previous.map(function (entry) {
            if (entry.urlId !== state.urlId) {
              return entry;
            }
            found = true;
            const updated = Object.assign({}, entry);
            if (typeof state.title === "string") {
              updated.title = state.title;
            }
            if (typeof state.url === "string") {
              updated.url = state.url;
            }
            if (typeof state.status === "string") {
              updated.status = state.status;
            }
            if (Object.prototype.hasOwnProperty.call(state, "filePath")) {
              updated.filePath = typeof state.filePath === "string" ? state.filePath : null;
            }
            if (Object.prototype.hasOwnProperty.call(state, "fileSizeBytes")) {
              var rawSizeUpdate = state.fileSizeBytes;
              if (rawSizeUpdate === null || rawSizeUpdate === undefined) {
                updated.fileSizeBytes = null;
              } else {
                var numericSize = Number(rawSizeUpdate);
                updated.fileSizeBytes = Number.isFinite(numericSize) && numericSize >= 0 ? numericSize : null;
              }
            }
            if (Object.prototype.hasOwnProperty.call(state, "error")) {
              updated.lastError = state.error ? String(state.error) : "";
            }
            if (Object.prototype.hasOwnProperty.call(state, "lastError")) {
              updated.lastError = state.lastError ? String(state.lastError) : "";
            }
            if (Object.prototype.hasOwnProperty.call(state, "percent")) {
              const numeric = Number(state.percent);
              updated.percent = Number.isFinite(numeric) ? numeric : 0;
            }
            return updated;
          });
          return found ? next : previous;
        });
      }, []);

      const setBusy = useCallback(function (setter, urlId, value) {
        setter(function (previous) {
          const next = Object.assign({}, previous);
          if (value) {
            next[urlId] = true;
          } else {
            delete next[urlId];
          }
          return next;
        });
      }, []);

      const removeFileAfterDownload = useCallback(function (urlId, background) {
        return fetch("/history/" + encodeURIComponent(urlId) + "/file", { method: "DELETE" })
          .then(function (response) {
            if (!response.ok) {
              if (response.status !== 404) {
                return response
                  .json()
                  .catch(function () {
                    return {};
                  })
                  .then(function (data) {
                    if (!background) {
                      window.alert((data && data.error) || "다운로드 후 파일 삭제에 실패했습니다.");
                    }
                  });
              }
              return null;
            }
            return response
              .json()
              .catch(function () {
                return null;
              })
              .then(function (state) {
                if (state) {
                  updateItemState(state);
                }
                return state;
              });
          })
          .catch(function () {
            if (!background) {
              window.alert("다운로드 후 파일 삭제 중 오류가 발생했습니다.");
            }
          });
      }, [updateItemState]);

      const handleDownload = useCallback(function (urlId) {
        if (!urlId || downloadPending[urlId]) {
          return;
        }
        setBusy(setDownloadPending, urlId, true);
        fetch("/history/" + encodeURIComponent(urlId) + "/file", { method: "GET" })
          .then(function (response) {
            if (!response.ok) {
              return response
                .json()
                .catch(function () {
                  return {};
                })
                .then(function (data) {
                  window.alert((data && data.error) || "파일을 다운로드할 수 없습니다.");
                });
            }
            return response.blob().then(function (blob) {
              const filename = extractFilename(response, urlId + ".bin");
              const objectUrl = URL.createObjectURL(blob);
              let revoked = false;
              const revoke = function () {
                if (revoked) {
                  return;
                }
                revoked = true;
                try {
                  URL.revokeObjectURL(objectUrl);
                } catch (_error) {
                  // ignore
                }
              };
              const revokeTimeout = window.setTimeout(revoke, 120000);
              window.addEventListener(
                "pagehide",
                function () {
                  window.clearTimeout(revokeTimeout);
                  revoke();
                },
                { once: true }
              );

              const isIos =
                /iP(ad|hone|od)/i.test(window.navigator.userAgent) ||
                (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
              const supportsDownloadAttribute = "download" in HTMLAnchorElement.prototype && !isIos;
              let navigatedAway = false;

              if (supportsDownloadAttribute) {
                const anchor = document.createElement("a");
                anchor.href = objectUrl;
                anchor.download = filename;
                anchor.rel = "noopener";
                document.body.appendChild(anchor);
                anchor.click();
                anchor.remove();
              } else {
                const openedWindow = window.open(objectUrl, "_blank", "noopener");
                if (!openedWindow) {
                  navigatedAway = true;
                  window.location.href = objectUrl;
                }
              }

              if (navigatedAway) {
                removeFileAfterDownload(urlId, true);
              } else {
                return removeFileAfterDownload(urlId, false);
              }
              return null;
            });
          })
          .catch(function () {
            window.alert("파일 다운로드 중 오류가 발생했습니다.");
          })
          .finally(function () {
            setBusy(setDownloadPending, urlId, false);
          });
      }, [downloadPending, removeFileAfterDownload, setBusy, setDownloadPending]);

      const handleRemoveFile = useCallback(function (urlId) {
        if (!urlId || removePending[urlId]) {
          return;
        }
        const confirmed = window.confirm("이력은 유지하고 서버에 저장된 파일만 삭제합니다. 계속하시겠습니까?");
        if (!confirmed) {
          return;
        }
        setBusy(setRemovePending, urlId, true);
        fetch("/history/" + encodeURIComponent(urlId) + "/file", { method: "DELETE" })
          .then(function (response) {
            return response
              .json()
              .catch(function () {
                return null;
              })
              .then(function (state) {
                if (!response.ok) {
                  window.alert((state && state.error) || "파일 삭제에 실패했습니다.");
                  return;
                }
                if (state) {
                  updateItemState(state);
                }
              });
          })
          .catch(function () {
            window.alert("파일 삭제 중 오류가 발생했습니다.");
          })
          .finally(function () {
            setBusy(setRemovePending, urlId, false);
          });
      }, [removePending, setBusy, setRemovePending, updateItemState]);

      const handleDelete = useCallback(function (urlId) {
        if (!urlId || deletePending[urlId]) {
          return;
        }
        const confirmed = window.confirm("정말로 이 다운로드 이력을 삭제하시겠습니까? 파일도 함께 삭제됩니다.");
        if (!confirmed) {
          return;
        }
        setBusy(setDeletePending, urlId, true);
        fetch("/history/" + encodeURIComponent(urlId), { method: "DELETE" })
          .then(function (response) {
            return response
              .json()
              .catch(function () {
                return null;
              })
              .then(function (data) {
                if (!response.ok) {
                  window.alert((data && data.error) || "삭제에 실패했습니다.");
                  return;
                }
                window.location.reload();
              });
          })
          .catch(function () {
            window.alert("삭제 중 오류가 발생했습니다.");
          })
          .finally(function () {
            setBusy(setDeletePending, urlId, false);
          });
      }, [deletePending, setBusy, setDeletePending]);

      const handleStop = useCallback(function (urlId) {
        if (!urlId || stopPending[urlId]) {
          return;
        }
        setBusy(setStopPending, urlId, true);
        fetch("/stop_download", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ urlId: urlId })
        })
          .then(function (response) {
            return response
              .json()
              .catch(function () {
                return null;
              })
              .then(function (state) {
                if (!response.ok) {
                  window.alert((state && state.error) || "다운로드 정지에 실패했습니다.");
                  return;
                }
                if (state) {
                  updateItemState(state);
                }
              });
          })
          .catch(function () {
            window.alert("다운로드 정지 중 오류가 발생했습니다.");
          })
          .finally(function () {
            setBusy(setStopPending, urlId, false);
          });
      }, [stopPending, setBusy, setStopPending, updateItemState]);

      const handleResume = useCallback(function (urlId) {
        if (!urlId || resumePending[urlId]) {
          return;
        }
        setBusy(setResumePending, urlId, true);
        fetch("/restart_download", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ urlId: urlId })
        })
          .then(function (response) {
            return response
              .json()
              .catch(function () {
                return null;
              })
              .then(function (state) {
                if (!response.ok) {
                  window.alert((state && state.error) || "다운로드 재시작에 실패했습니다.");
                  return;
                }
                if (state) {
                  updateItemState(state);
                }
              });
          })
          .catch(function () {
            window.alert("다운로드 재시작 중 오류가 발생했습니다.");
          })
          .finally(function () {
            setBusy(setResumePending, urlId, false);
          });
      }, [resumePending, setBusy, setResumePending, updateItemState]);

      const handleOpenDialog = useCallback(function () {
        setDialogOpen(true);
        setFormError("");
        setUrlValue("");
      }, []);

      const handleCloseDialog = useCallback(function () {
        setDialogOpen(false);
        setFormError("");
        setUrlValue("");
      }, []);

      const handleDialogSubmit = useCallback(function () {
        const trimmed = urlValue.trim();
        if (!validateUrl(trimmed)) {
          setFormError("유효한 URL을 입력해주세요.");
          return;
        }
        setFormError("");
        setIsSubmitting(true);
        fetch("/history/request-download", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: trimmed, urlId: deriveUrlId(trimmed) })
        })
          .then(function (response) {
            return response
              .json()
              .catch(function () {
                return {};
              })
              .then(function (data) {
                if (!response.ok) {
                  window.alert((data && data.error) || "다운로드 요청에 실패했습니다.");
                  return;
                }
                handleCloseDialog();
                window.location.reload();
              });
          })
          .catch(function () {
            window.alert("다운로드 요청 중 오류가 발생했습니다.");
          })
          .finally(function () {
            setIsSubmitting(false);
          });
      }, [urlValue, handleCloseDialog]);

      useEffect(function () {
        let active = true;
        let socket = null;
        let reconnectTimer = null;

        function connect() {
          if (!active) {
            return;
          }
          const wsPath = props.wsPath || "/";
          const normalisedPath = wsPath.startsWith("/") ? wsPath : "/" + wsPath;
          const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
          const url = protocol + "//" + window.location.host + normalisedPath;
          try {
            socket = new WebSocket(url);
          } catch (error) {
            console.error("웹소켓 연결 실패", error);
            reconnectTimer = window.setTimeout(connect, 2000);
            return;
          }

          socket.addEventListener("message", function (event) {
            try {
              const data = JSON.parse(String(event.data));
              if (data && data.type === "download" && data.payload) {
                updateItemState(data.payload);
              } else if (data && data.type === "download-finished" && data.payload) {
                const payload = Object.assign({}, data.payload, { percent: 100 });
                updateItemState(payload);
              }
            } catch (err) {
              console.error("웹소켓 메시지 파싱 실패", err);
            }
          });

          socket.addEventListener("close", function () {
            if (!active) {
              return;
            }
            reconnectTimer = window.setTimeout(connect, 2000);
          });

          socket.addEventListener("error", function () {
            if (socket) {
              socket.close();
            }
          });
        }

        connect();

        return function () {
          active = false;
          if (socket) {
            socket.close();
          }
          if (reconnectTimer) {
            window.clearTimeout(reconnectTimer);
          }
        };
      }, [props.wsPath, updateItemState]);

      const summary = useMemo(function () {
        return {
          total: props.total,
          showingFrom: props.showingFrom,
          showingTo: props.showingTo,
          page: props.page,
          pageSize: props.pageSize,
          totalPages: props.totalPages,
          searchTerm: props.searchTerm || ""
        };
      }, [props.total, props.showingFrom, props.showingTo, props.page, props.pageSize, props.totalPages, props.searchTerm]);

      return h(
        Fragment,
        null,
        h(
          "div",
          { className: "card" },
          h("h1", null, "다운로드 이력"),
          h(
            "div",
            { className: "toolbar" },
            h(SearchForm, { searchTerm: summary.searchTerm }),
            h(
              "div",
              { className: "toolbar-actions" },
              h(
                "button",
                {
                  type: "button",
                  className: "secondary",
                  onClick: function () {
                    window.location.reload();
                  }
                },
                "새로고침"
              ),
              h(
                "button",
                { type: "button", className: "primary", onClick: handleOpenDialog },
                "다운로드 추가"
              )
            )
          ),
          h(HistoryTable, {
            items: items,
            onStop: handleStop,
            onResume: handleResume,
            onDownload: handleDownload,
            onRemoveFile: handleRemoveFile,
            onDelete: handleDelete,
            downloadPending: downloadPending,
            stopPending: stopPending,
            resumePending: resumePending,
            removePending: removePending,
            deletePending: deletePending
          }),
          h(
            "div",
            { className: "summary" },
            h(
              "span",
              null,
              "총 " +
                summary.total.toLocaleString() +
                "건 중 " +
                summary.showingFrom.toLocaleString() +
                "-" +
                summary.showingTo.toLocaleString() +
                " 표시"
            ),
            h(Pagination, {
              page: summary.page,
              totalPages: summary.totalPages,
              pageSize: summary.pageSize,
              searchTerm: summary.searchTerm
            })
          )
        ),
        h(AddDownloadDialog, {
          open: dialogOpen,
          onClose: handleCloseDialog,
          onSubmit: handleDialogSubmit,
          urlValue: urlValue,
          onUrlChange: function (value) {
            setUrlValue(value);
            if (formError) {
              setFormError("");
            }
          },
          errorMessage: formError,
          isSubmitting: isSubmitting
        })
      );
    }

    const rootElement = document.getElementById("history-root");
    if (!rootElement) {
      return;
    }

    hydrateRoot(rootElement, h(HistoryApp, initialProps));
  });
})();
