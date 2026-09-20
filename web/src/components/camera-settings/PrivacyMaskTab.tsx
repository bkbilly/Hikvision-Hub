import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  EyeOff,
  Edit3,
  Trash2,
  Save,
  RefreshCw,
  Info,
  X,
} from 'lucide-react';
import type { Camera, PrivacyMask, PrivacyMaskRegion, Point } from '../../types';
import { api } from '../../api';

interface PrivacyMaskTabProps {
  camera: Camera;
  snapshotKey?: number;
  refreshKey?: number;
  onRefreshPreview?: () => void;
  setSaveStatus: React.Dispatch<React.SetStateAction<{ success: boolean; message: string } | null>>;
  onRegisterRefresh?: (refreshFn: () => Promise<void>) => void;
}

export const PrivacyMaskTab: React.FC<PrivacyMaskTabProps> = ({
  camera,
  snapshotKey: externalSnapshotKey,
  refreshKey,
  onRefreshPreview,
  setSaveStatus,
  onRegisterRefresh,
}) => {
  const [mask, setMask] = useState<PrivacyMask | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [activeMaskId, setActiveMaskId] = useState<number>(1);

  // Drawing state
  const [drawStep, setDrawStep] = useState<'first' | 'second' | null>(null);
  const [drawCorner1, setDrawCorner1] = useState<Point | null>(null);
  const [drawHoverPt, setDrawHoverPt] = useState<Point | null>(null);

  // Dragging state
  const [draggingCorner, setDraggingCorner] = useState<number | null>(null);
  const [dragAnchorPos, setDragAnchorPos] = useState<Point | null>(null);
  const [isDraggingRect, setIsDraggingRect] = useState<boolean>(false);
  const [dragStartPos, setDragStartPos] = useState<Point | null>(null);
  const [dragStartCoords, setDragStartCoords] = useState<Point[] | null>(null);

  const [localSnapshotKey, setLocalSnapshotKey] = useState<number>(Date.now());
  const effectiveSnapshotKey = externalSnapshotKey || localSnapshotKey;
  const svgRef = useRef<SVGSVGElement | null>(null);

  const refreshPreview = () => {
    setLocalSnapshotKey(Date.now());
    onRefreshPreview?.();
  };

  const handleCancelDrawing = useCallback(() => {
    setDrawStep(null);
    setDrawCorner1(null);
    setDrawHoverPt(null);
    setDraggingCorner(null);
    setDragAnchorPos(null);
    setIsDraggingRect(false);
    setDragStartPos(null);
    setDragStartCoords(null);
  }, []);

  const handleRefresh = async () => {
    handleCancelDrawing();
    refreshPreview();
    await loadPrivacyMask();
  };

  const loadPrivacyMask = useCallback(async () => {
    if (!camera) return;
    setIsLoading(true);
    try {
      const res = await api.getCameraPrivacyMask(camera.id);
      setMask(res);
    } catch (err: any) {
      console.warn('privacy mask load error', err);
      // Initialize with default empty configuration if not yet configured
      setMask({
        enabled: false,
        normalized_screen_width: 704,
        normalized_screen_height: 480,
        regions: [],
      });
    } finally {
      setIsLoading(false);
    }
  }, [camera]);

  useEffect(() => {
    loadPrivacyMask();
  }, [loadPrivacyMask, refreshKey]);

  useEffect(() => {
    if (onRegisterRefresh) {
      onRegisterRefresh(async () => {
        handleCancelDrawing();
        await loadPrivacyMask();
      });
    }
  }, [onRegisterRefresh, loadPrivacyMask, handleCancelDrawing]);

  // Helper to find or create region by ID (1..4)
  const getActiveRegion = useCallback((): PrivacyMaskRegion | undefined => {
    return mask?.regions.find((r) => r.id === activeMaskId);
  }, [mask, activeMaskId]);

  const updateActiveRegion = useCallback(
    (updater: (prev: PrivacyMaskRegion) => PrivacyMaskRegion) => {
      setMask((prev) => {
        if (!prev) return prev;
        const exists = prev.regions.some((r) => r.id === activeMaskId);
        let updatedRegions: PrivacyMaskRegion[];
        if (exists) {
          updatedRegions = prev.regions.map((r) => (r.id === activeMaskId ? updater(r) : r));
        } else {
          const newReg = updater({
            id: activeMaskId,
            enabled: true,
            coordinates: [],
          });
          updatedRegions = [...prev.regions, newReg];
        }
        return {
          ...prev,
          regions: updatedRegions,
        };
      });
    },
    [activeMaskId]
  );

  const handleClearMask = (id: number) => {
    setMask((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        regions: prev.regions.filter((r) => r.id !== id),
      };
    });
    if (drawStep) {
      handleCancelDrawing();
    }
  };

  const handleClearAll = () => {
    setMask((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        regions: [],
      };
    });
    handleCancelDrawing();
  };

  const handleStartDrawing = () => {
    setDrawStep('first');
    setDrawCorner1(null);
    setDrawHoverPt(null);
  };

  // Convert client pointer event coordinates (clientX, clientY) to SVG normalized (0..1000) coordinates
  const getSVGPoint = useCallback((clientX: number, clientY: number): Point => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
    const x = Math.round(((clientX - rect.left) / rect.width) * 1000);
    const y = Math.round(((clientY - rect.top) / rect.height) * 1000);
    return {
      x: Math.max(0, Math.min(1000, x)),
      y: Math.max(0, Math.min(1000, y)),
    };
  }, []);

  const handleSVGPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const pos = getSVGPoint(e.clientX, e.clientY);

    // Drawing a new rectangle
    if (drawStep === 'first') {
      setDrawCorner1(pos);
      setDrawHoverPt(pos);
      setDrawStep('second');
      return;
    } else if (drawStep === 'second' && drawCorner1) {
      const p1 = drawCorner1;
      const p2 = pos;
      const minX = Math.min(p1.x, p2.x);
      const maxX = Math.max(p1.x, p2.x);
      const minY = Math.min(p1.y, p2.y);
      const maxY = Math.max(p1.y, p2.y);

      // Require a minimum size
      if (maxX - minX >= 20 && maxY - minY >= 20) {
        const rectCorners: Point[] = [
          { x: minX, y: minY },
          { x: maxX, y: minY },
          { x: maxX, y: maxY },
          { x: minX, y: maxY },
        ];
        updateActiveRegion((prev) => ({
          ...prev,
          enabled: true,
          coordinates: rectCorners,
        }));
      }

      setDrawStep(null);
      setDrawCorner1(null);
      setDrawHoverPt(null);
      return;
    }
  };

  // Window-level pointer listeners while dragging or drawing to ensure 100% smooth tracking without drops
  useEffect(() => {
    if (draggingCorner === null && !isDraggingRect && drawStep !== 'second') return;

    const onGlobalPointerMove = (e: PointerEvent) => {
      const pos = getSVGPoint(e.clientX, e.clientY);

      if (drawStep === 'second') {
        setDrawHoverPt(pos);
        return;
      }

      const activeReg = getActiveRegion();
      if (!activeReg || !activeReg.coordinates || activeReg.coordinates.length < 4) return;

      // Resizing active rectangle by dragging a corner relative to its fixed opposite anchor
      if (draggingCorner !== null && dragAnchorPos) {
        const anchor = dragAnchorPos;
        let newMinX = 0;
        let newMaxX = 1000;
        let newMinY = 0;
        let newMaxY = 1000;

        if (draggingCorner === 0) {
          // Top-Left (Anchor is Bottom-Right)
          newMinX = Math.max(0, Math.min(pos.x, anchor.x - 10));
          newMinY = Math.max(0, Math.min(pos.y, anchor.y - 10));
          newMaxX = anchor.x;
          newMaxY = anchor.y;
        } else if (draggingCorner === 1) {
          // Top-Right (Anchor is Bottom-Left)
          newMinX = anchor.x;
          newMinY = Math.max(0, Math.min(pos.y, anchor.y - 10));
          newMaxX = Math.min(1000, Math.max(pos.x, anchor.x + 10));
          newMaxY = anchor.y;
        } else if (draggingCorner === 2) {
          // Bottom-Right (Anchor is Top-Left)
          newMinX = anchor.x;
          newMinY = anchor.y;
          newMaxX = Math.min(1000, Math.max(pos.x, anchor.x + 10));
          newMaxY = Math.min(1000, Math.max(pos.y, anchor.y + 10));
        } else if (draggingCorner === 3) {
          // Bottom-Left (Anchor is Top-Right)
          newMinX = Math.max(0, Math.min(pos.x, anchor.x - 10));
          newMinY = anchor.y;
          newMaxX = anchor.x;
          newMaxY = Math.min(1000, Math.max(pos.y, anchor.y + 10));
        }

        const newCoords: Point[] = [
          { x: newMinX, y: newMinY }, // 0: TL
          { x: newMaxX, y: newMinY }, // 1: TR
          { x: newMaxX, y: newMaxY }, // 2: BR
          { x: newMinX, y: newMaxY }, // 3: BL
        ];

        updateActiveRegion((prev) => ({ ...prev, coordinates: newCoords }));
        return;
      }

      // Dragging entire rectangle body
      if (isDraggingRect && dragStartPos && dragStartCoords && dragStartCoords.length === 4) {
        let dx = pos.x - dragStartPos.x;
        let dy = pos.y - dragStartPos.y;

        const minX = dragStartCoords[0].x;
        const maxX = dragStartCoords[1].x;
        const minY = dragStartCoords[0].y;
        const maxY = dragStartCoords[2].y;

        if (minX + dx < 0) dx = -minX;
        if (maxX + dx > 1000) dx = 1000 - maxX;
        if (minY + dy < 0) dy = -minY;
        if (maxY + dy > 1000) dy = 1000 - maxY;

        const translatedCoords = dragStartCoords.map((pt) => ({
          x: pt.x + dx,
          y: pt.y + dy,
        }));

        updateActiveRegion((prev) => ({ ...prev, coordinates: translatedCoords }));
        return;
      }
    };

    const onGlobalPointerUp = () => {
      setDraggingCorner(null);
      setDragAnchorPos(null);
      setIsDraggingRect(false);
      setDragStartPos(null);
      setDragStartCoords(null);
    };

    window.addEventListener('pointermove', onGlobalPointerMove);
    window.addEventListener('pointerup', onGlobalPointerUp);
    window.addEventListener('pointercancel', onGlobalPointerUp);

    return () => {
      window.removeEventListener('pointermove', onGlobalPointerMove);
      window.removeEventListener('pointerup', onGlobalPointerUp);
      window.removeEventListener('pointercancel', onGlobalPointerUp);
    };
  }, [
    draggingCorner,
    dragAnchorPos,
    isDraggingRect,
    dragStartPos,
    dragStartCoords,
    drawStep,
    getActiveRegion,
    updateActiveRegion,
    getSVGPoint,
  ]);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!camera || !mask) return;

    setIsSaving(true);
    setSaveStatus(null);
    try {
      const res = await api.setCameraPrivacyMask(camera.id, mask);
      setSaveStatus({ success: true, message: res.message || 'Privacy mask saved successfully' });
      refreshPreview();
      await loadPrivacyMask();
    } catch (err: any) {
      setSaveStatus({ success: false, message: err.message || 'Failed to save privacy mask' });
    } finally {
      setIsSaving(false);
    }
  };

  const activeReg = getActiveRegion();
  const hasActiveCoords = Boolean(activeReg?.coordinates && activeReg.coordinates.length >= 4);

  return (
    <div className="space-y-4">
      {/* 1. Interactive Video Snapshot with SVG Overlay (at the top) */}
      <div className="flex justify-center w-full">
        <div className="relative w-full max-w-2xl aspect-video rounded-xl overflow-hidden border border-slate-800 bg-black select-none shadow-lg group">
          <img
            src={api.getSnapshotUrl(camera.id, effectiveSnapshotKey)}
            alt="Camera Snapshot"
            className="w-full h-full object-cover pointer-events-none block"
          />

          {/* SVG Overlay for Privacy Masks */}
          <svg
            ref={svgRef}
            viewBox="0 0 1000 1000"
            preserveAspectRatio="none"
            className={`absolute inset-0 w-full h-full touch-none select-none ${
              drawStep ? 'cursor-crosshair' : 'cursor-default'
            }`}
            onPointerDown={handleSVGPointerDown}
          >
            {/* Render all configured masks */}
            {mask?.regions.map((reg) => {
              if (!reg.coordinates || reg.coordinates.length < 4) return null;
              const isActive = reg.id === activeMaskId;

              const minX = Math.min(...reg.coordinates.map((p) => p.x));
              const maxX = Math.max(...reg.coordinates.map((p) => p.x));
              const minY = Math.min(...reg.coordinates.map((p) => p.y));
              const maxY = Math.max(...reg.coordinates.map((p) => p.y));
              const w = maxX - minX;
              const h = maxY - minY;

              if (isActive) {
                // Active Mask: rendered with solid black body and bright cyan accent border + handles
                return (
                  <g key={reg.id}>
                    {/* Draggable Rect Body */}
                    <rect
                      x={minX}
                      y={minY}
                      width={w}
                      height={h}
                      fill="rgba(0, 0, 0, 0.92)"
                      stroke="#38bdf8"
                      strokeWidth="3"
                      className="cursor-move"
                      onPointerDown={(e) => {
                        if (drawStep) return;
                        e.stopPropagation();
                        setIsDraggingRect(true);
                        setDragStartPos(getSVGPoint(e.clientX, e.clientY));
                        setDragStartCoords(reg.coordinates);
                      }}
                    />

                    {/* Mask Label & Drag Icon in Center */}
                    <text
                      x={minX + w / 2}
                      y={minY + h / 2}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill="#38bdf8"
                      fontSize="36"
                      fontWeight="bold"
                      pointerEvents="none"
                      className="font-mono select-none"
                    >
                      Mask {reg.id}
                    </text>

                    {/* 4 Interactive Corner Handles */}
                    {reg.coordinates.map((pt, idx) => {
                      const isDraggingThis = draggingCorner === idx;
                      return (
                        <g key={idx} className="cursor-crosshair">
                          {/* Invisible larger hit target (radius 26) for easy grabbing */}
                          <circle
                            cx={pt.x}
                            cy={pt.y}
                            r="26"
                            fill="transparent"
                            className="cursor-crosshair"
                            onPointerDown={(e) => {
                              if (drawStep) return;
                              e.stopPropagation();
                              const oppIdx = (idx + 2) % 4;
                              setDraggingCorner(idx);
                              setDragAnchorPos(reg.coordinates[oppIdx]);
                            }}
                          />
                          {/* Visible handle circle without scale jumping */}
                          <circle
                            cx={pt.x}
                            cy={pt.y}
                            r={isDraggingThis ? 16 : 14}
                            fill={isDraggingThis ? '#38bdf8' : '#0284c7'}
                            stroke="#ffffff"
                            strokeWidth="3"
                            className="pointer-events-none drop-shadow-md transition-colors"
                          />
                          {/* Corner number indicator */}
                          <text
                            x={pt.x}
                            y={pt.y + 4}
                            textAnchor="middle"
                            fill="#ffffff"
                            fontSize="11"
                            fontWeight="bold"
                            className="pointer-events-none font-mono select-none"
                          >
                            {idx + 1}
                          </text>
                        </g>
                      );
                    })}
                  </g>
                );
              }

              // Inactive Masks: solid black fill with dashed outline and click-to-select
              return (
                <g
                  key={reg.id}
                  className="cursor-pointer transition-opacity opacity-85 hover:opacity-100"
                  onClick={() => {
                    if (!drawStep) {
                      setActiveMaskId(reg.id);
                    }
                  }}
                >
                  <rect
                    x={minX}
                    y={minY}
                    width={w}
                    height={h}
                    fill="rgba(0, 0, 0, 0.85)"
                    stroke="rgba(255, 255, 255, 0.45)"
                    strokeWidth="2"
                    strokeDasharray="8 6"
                  />
                  <text
                    x={minX + w / 2}
                    y={minY + h / 2}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="rgba(255, 255, 255, 0.7)"
                    fontSize="32"
                    fontWeight="bold"
                    pointerEvents="none"
                    className="font-mono select-none"
                  >
                    Mask {reg.id}
                  </text>
                </g>
              );
            })}

            {/* Drawing Preview Rectangle */}
            {drawStep === 'second' && drawCorner1 && drawHoverPt && (
              <g pointerEvents="none">
                <rect
                  x={Math.min(drawCorner1.x, drawHoverPt.x)}
                  y={Math.min(drawCorner1.y, drawHoverPt.y)}
                  width={Math.abs(drawHoverPt.x - drawCorner1.x)}
                  height={Math.abs(drawHoverPt.y - drawCorner1.y)}
                  fill="rgba(2, 132, 199, 0.25)"
                  stroke="#38bdf8"
                  strokeWidth="3"
                  strokeDasharray="8 6"
                />
                <circle cx={drawCorner1.x} cy={drawCorner1.y} r="10" fill="#38bdf8" />
                <circle cx={drawHoverPt.x} cy={drawHoverPt.y} r="10" fill="#38bdf8" />
              </g>
            )}
          </svg>

          {/* Top Right Action: Refresh Snapshot Preview & Restore State */}
          <div className="absolute top-2 right-2 flex items-center gap-1.5 opacity-90 group-hover:opacity-100 transition-opacity z-10">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isLoading}
              title="Refresh Snapshot & Restore Saved State"
              className="p-1.5 bg-black/70 hover:bg-black/90 text-slate-300 hover:text-white backdrop-blur-md rounded-lg border border-white/10 shadow-md transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-blue-400' : ''}`} />
            </button>
          </div>

          {/* Privacy Mask Disabled Notification Banner */}
          {!mask?.enabled && !drawStep && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-slate-950/85 border border-slate-700/80 text-slate-300 px-3.5 py-1 rounded-full text-xs font-medium flex items-center gap-2 shadow-xl backdrop-blur-md pointer-events-none z-10">
              <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
              <span>Privacy Mask is currently disabled</span>
            </div>
          )}

          {/* Drawing Step Banner */}
          {drawStep && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-slate-900/95 border border-blue-500/80 text-blue-300 px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-2 shadow-2xl backdrop-blur-md animate-pulse z-10">
              <Edit3 className="w-4 h-4 text-blue-400" />
              <span>
                {drawStep === 'first'
                  ? `Click to place 1st corner of Mask ${activeMaskId}`
                  : `Click to place opposite corner and complete Mask ${activeMaskId}`}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 2. Mask Selector Pills & Actions Bar (below image preview) */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-xl bg-slate-900 border border-slate-800">
        <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
          {[1, 2, 3, 4].map((id) => {
            const reg = mask?.regions.find((r) => r.id === id);
            const isConfigured = Boolean(reg?.coordinates && reg.coordinates.length >= 4);
            const isActive = activeMaskId === id;

            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setActiveMaskId(id);
                  handleCancelDrawing();
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-blue-600 text-white font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    isConfigured
                      ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50'
                      : 'bg-slate-600'
                  }`}
                />
                <span>Mask {id}</span>
                {isConfigured && (
                  <span className="text-[10px] opacity-75 font-bold">
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Per-Mask Quick Action Buttons */}
        <div className="flex items-center gap-2 ml-auto">
          {drawStep ? (
            <button
              type="button"
              onClick={handleCancelDrawing}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" /> Cancel Drawing
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStartDrawing}
              className="px-2.5 py-1 bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 text-blue-400 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>{hasActiveCoords ? `Redraw Mask ${activeMaskId}` : `Draw Mask ${activeMaskId}`}</span>
            </button>
          )}

          {hasActiveCoords && (
            <button
              type="button"
              onClick={() => handleClearMask(activeMaskId)}
              title={`Delete Mask ${activeMaskId}`}
              className="p-1.5 bg-slate-800 hover:bg-rose-950/60 hover:text-rose-400 text-slate-400 rounded-lg text-xs transition-colors cursor-pointer border border-transparent hover:border-rose-800/50"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}

          {(mask?.regions.length ?? 0) > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              className="px-2 py-1 text-[11px] text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
            >
              Clear All
            </button>
          )}
        </div>
      </div>

      {/* 3. Privacy Mask Box with Description, Enable Toggle & Bottom Save Button (below image preview) */}
      <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
        {/* Header with Title, Description, and Global Enable Switch */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <EyeOff className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold text-white">Privacy Mask</h4>
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                  Up to 4 Rectangles
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Conceal private areas (e.g. neighbours' windows, public streets) directly on the camera sensor.
              </p>
            </div>
          </div>

          {/* Global Enable Switch */}
          <div className="flex items-center gap-2 self-start sm:self-center">
            <label className="flex items-center gap-2 text-xs text-slate-300 font-medium cursor-pointer">
              <span>Enable Privacy Mask</span>
              <input
                type="checkbox"
                checked={mask?.enabled ?? false}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setMask((prev) => (prev ? { ...prev, enabled: checked } : null));
                }}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600 relative"></div>
            </label>
          </div>
        </div>

        {/* Active Mask Status & Coordinates */}
        <div className="border-t border-slate-800/80 pt-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-200">
                Mask {activeMaskId} Status & Coordinates
              </span>
              {hasActiveCoords && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                  Configured
                </span>
              )}
            </div>
          </div>

          {hasActiveCoords && activeReg?.coordinates ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
              <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                <span className="text-blue-400 font-bold block text-[10px] uppercase">Top-Left</span>
                <span className="text-slate-300">
                  X: {activeReg.coordinates[0].x}, Y: {activeReg.coordinates[0].y}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                <span className="text-blue-400 font-bold block text-[10px] uppercase">Top-Right</span>
                <span className="text-slate-300">
                  X: {activeReg.coordinates[1].x}, Y: {activeReg.coordinates[1].y}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                <span className="text-blue-400 font-bold block text-[10px] uppercase">Bottom-Right</span>
                <span className="text-slate-300">
                  X: {activeReg.coordinates[2].x}, Y: {activeReg.coordinates[2].y}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                <span className="text-blue-400 font-bold block text-[10px] uppercase">Bottom-Left</span>
                <span className="text-slate-300">
                  X: {activeReg.coordinates[3].x}, Y: {activeReg.coordinates[3].y}
                </span>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-lg bg-slate-950/40 border border-dashed border-slate-800 text-center text-xs text-slate-500">
              No rectangle configured for Mask {activeMaskId}. Click{' '}
              <strong className="text-blue-400">Draw Mask {activeMaskId}</strong> above to place a 90° rectangle.
            </div>
          )}

          <div className="flex items-start gap-2 text-xs text-slate-400 pt-1">
            <Info className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
            <p>
              You can drag the four corner handles to resize the rectangle, or click and drag inside the rectangle to move it. All corners strictly maintain 90° angles as required by the camera hardware.
            </p>
          </div>
        </div>

        {/* Save Privacy Mask button at the bottom (like Events) */}
        <div className="flex justify-end pt-2 border-t border-slate-800/60">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || isLoading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-blue-600/20 transition-all cursor-pointer"
          >
            <Save className={`w-3.5 h-3.5 ${isSaving ? 'animate-spin' : ''}`} />
            <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
