import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Activity,
  Layers,
  Shield,
  Eye,
  Briefcase,
  Package,
  LogIn,
  LogOut,
  RefreshCw,
  Crosshair,
} from 'lucide-react';
import type {
  Camera,
  CameraCapabilities,
  MotionDetection,
  MotionRegion,
  LineDetection,
  FieldDetection,
  TamperDetection,
  UnattendedBaggageDetection,
  ObjectRemovalDetection,
  RegionEntrance,
  RegionExiting,
  Point,
} from '../../../types';
import { api } from '../../../api';
import { EventsSvgOverlay } from './EventsSvgOverlay';
import { MotionDetectionForm } from './MotionDetectionForm';
import { LineCrossingForm } from './LineCrossingForm';
import { IntrusionDetectionForm } from './IntrusionDetectionForm';
import { TamperDetectionForm } from './TamperDetectionForm';
import { UnattendedBaggageForm } from './UnattendedBaggageForm';
import { ObjectRemovalForm } from './ObjectRemovalForm';
import { RegionEntranceForm } from './RegionEntranceForm';
import { RegionExitingForm } from './RegionExitingForm';

export const isZeroArea = (pts?: Point[]): boolean => {
  if (!pts || pts.length < 4) return true;
  const minX = Math.min(...pts.map((p) => p.x));
  const maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  const maxY = Math.max(...pts.map((p) => p.y));
  return (maxX - minX) < 15 || (maxY - minY) < 15;
};

export const normalizeRectPoints = (pts?: Point[]): Point[] => {
  if (!pts || pts.length < 4) return pts || [];
  const minX = Math.min(...pts.slice(0, 4).map((p) => p.x));
  const maxX = Math.max(...pts.slice(0, 4).map((p) => p.x));
  const minY = Math.min(...pts.slice(0, 4).map((p) => p.y));
  const maxY = Math.max(...pts.slice(0, 4).map((p) => p.y));
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
};

interface EventsTabProps {
  camera: Camera;
  capabilities: CameraCapabilities | null;
  setSaveStatus: React.Dispatch<React.SetStateAction<{ success: boolean; message: string } | null>>;
  refreshKey?: number;
  onRegisterRefresh?: (fn: () => Promise<void>) => void;
  snapshotKey?: number;
  onRefreshPreview?: () => void;
}

export const EventsTab: React.FC<EventsTabProps> = ({
  camera,
  capabilities,
  setSaveStatus,
  refreshKey,
  onRegisterRefresh,
  snapshotKey: externalSnapshotKey,
  onRefreshPreview,
}) => {
  const [activeSmartEvent, setActiveSmartEvent] = useState<
    'motion' | 'line' | 'intrusion' | 'tamper' | 'unattended' | 'removal' | 'entrance' | 'exiting'
  >('motion');

  const [localSnapshotKey, setLocalSnapshotKey] = useState(Date.now());
  const effectiveSnapshotKey = externalSnapshotKey || localSnapshotKey;
  const isMountedRef = useRef(true);

  const refreshPreview = () => {
    setLocalSnapshotKey(Date.now());
    onRefreshPreview?.();
  };

  // Smart Event Data States
  const [motion, setMotion] = useState<MotionDetection | null>(null);
  const [lineDetection, setLineDetection] = useState<LineDetection | null>(null);
  const [intrusion, setIntrusion] = useState<FieldDetection | null>(null);
  const [tamper, setTamper] = useState<TamperDetection | null>(null);
  const [unattended, setUnattended] = useState<UnattendedBaggageDetection | null>(null);
  const [objectRemoval, setObjectRemoval] = useState<ObjectRemovalDetection | null>(null);
  const [regionEntrance, setRegionEntrance] = useState<RegionEntrance | null>(null);
  const [regionExiting, setRegionExiting] = useState<RegionExiting | null>(null);

  // Overlay Drawing / Dragging States
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [drawStep, setDrawStep] = useState<'first' | 'second' | null>(null);
  const [drawExpertRectCorner1, setDrawExpertRectCorner1] = useState<Point | null>(null);
  const [drawIntrusionStep, setDrawIntrusionStep] = useState<number | null>(null);
  const [drawHoverPt, setDrawHoverPt] = useState<Point | null>(null);
  const [draggingPoint, setDraggingPoint] = useState<string | null>(null);

  // Expert Mode Rectangle Body Dragging
  const [isDraggingExpertBody, setIsDraggingExpertBody] = useState(false);
  const [dragExpertBodyStart, setDragExpertBodyStart] = useState<Point | null>(null);
  const [dragExpertBodyOrig, setDragExpertBodyOrig] = useState<Point[] | null>(null);

  // Normal mode motion polygon drawing state
  const [isDrawingNormalMotion, setIsDrawingNormalMotion] = useState(false);
  const [normalMotionDrawPoints, setNormalMotionDrawPoints] = useState<Point[]>([]);

  // Normal mode motion grid drag/paint state
  const [isPaintingGrid, setIsPaintingGrid] = useState(false);
  const [gridBrushMode, setGridBrushMode] = useState<boolean | null>(null);
  const [gridDragStart, setGridDragStart] = useState<{ r: number; c: number } | null>(null);
  const [gridDragCurrent, setGridDragCurrent] = useState<{ r: number; c: number } | null>(null);
  const [gridInitialState, setGridInitialState] = useState<boolean[][] | null>(null);

  // Expert mode active area index
  const [activeExpertAreaIndex, setActiveExpertAreaIndex] = useState<number>(0);

  // Target Size Filter (Min / Max Size) States
  const [drawSizeMode, setDrawSizeMode] = useState<'min' | 'max' | null>(null);
  const [drawSizeCorner1, setDrawSizeCorner1] = useState<Point | null>(null);
  const [dragSizeAnchorPos, setDragSizeAnchorPos] = useState<Point | null>(null);
  const [isDraggingSizeBody, setIsDraggingSizeBody] = useState<'min' | 'max' | null>(null);
  const [dragSizeBodyStart, setDragSizeBodyStart] = useState<Point | null>(null);
  const [dragSizeBodyOrig, setDragSizeBodyOrig] = useState<Point[] | null>(null);

  const loadEventsData = useCallback(async () => {
    setDrawStep(null);
    setDrawIntrusionStep(null);
    setDrawExpertRectCorner1(null);
    setIsDrawingNormalMotion(false);
    setNormalMotionDrawPoints([]);
    setDrawHoverPt(null);
    setDraggingPoint(null);
    setIsDraggingExpertBody(false);
    setDragExpertBodyStart(null);
    setDragExpertBodyOrig(null);
    setDrawSizeMode(null);
    setDrawSizeCorner1(null);
    setDragSizeAnchorPos(null);
    setIsDraggingSizeBody(null);
    setDragSizeBodyStart(null);
    setDragSizeBodyOrig(null);

    await Promise.allSettled([
      api.getCameraMotion(camera.id)
        .then((res) => {
          if (!isMountedRef.current) return;
          let regions = res.regions ? [...res.regions] : [];
          while (regions.length < 8) {
            const idx = regions.length;
            const offset = (idx % 4) * 60;
            regions.push({
              id: idx + 1,
              enabled: false,
              sensitivity: res.sensitivity || 50,
              day_sensitivity: res.day_sensitivity || res.sensitivity || 60,
              night_sensitivity: res.night_sensitivity || res.sensitivity || 40,
              percentage: 20,
              coordinates: [
                { x: 150 + offset, y: 150 + offset },
                { x: 650 + offset, y: 150 + offset },
                { x: 650 + offset, y: 650 + offset },
                { x: 150 + offset, y: 650 + offset },
              ],
            });
          }
          regions = regions.map((reg, idx) => {
            if (isZeroArea(reg.coordinates)) {
              const offset = (idx % 4) * 60;
              return {
                ...reg,
                enabled: false,
                coordinates: [
                  { x: 150 + offset, y: 150 + offset },
                  { x: 650 + offset, y: 150 + offset },
                  { x: 650 + offset, y: 650 + offset },
                  { x: 150 + offset, y: 650 + offset },
                ],
              };
            }
            return {
              ...reg,
              coordinates: normalizeRectPoints(reg.coordinates),
            };
          });
          setMotion({ ...res, regions });
        })
        .catch((err) => console.warn('motion error', err)),

      api.getCameraLineDetection(camera.id)
        .then((res) => {
          if (isMountedRef.current) setLineDetection(res);
        })
        .catch((err) => console.warn('line error', err)),

      api.getCameraIntrusion(camera.id)
        .then((res) => {
          if (isMountedRef.current) setIntrusion(res);
        })
        .catch((err) => console.warn('intrusion error', err)),

      api.getCameraTamper(camera.id)
        .then((res) => {
          if (isMountedRef.current) setTamper(res);
        })
        .catch((err) => console.warn('tamper error', err)),

      api.getCameraUnattendedBaggage(camera.id)
        .then((res) => {
          if (isMountedRef.current) setUnattended(res);
        })
        .catch(() => {
          if (isMountedRef.current) setUnattended(null);
        }),

      api.getCameraObjectRemoval(camera.id)
        .then((res) => {
          if (isMountedRef.current) setObjectRemoval(res);
        })
        .catch(() => {
          if (isMountedRef.current) setObjectRemoval(null);
        }),

      api.getCameraRegionEntrance(camera.id)
        .then((res) => {
          if (isMountedRef.current) setRegionEntrance(res);
        })
        .catch(() => {
          if (isMountedRef.current) setRegionEntrance(null);
        }),

      api.getCameraRegionExiting(camera.id)
        .then((res) => {
          if (isMountedRef.current) setRegionExiting(res);
        })
        .catch(() => {
          if (isMountedRef.current) setRegionExiting(null);
        }),
    ]);
  }, [camera.id]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    onRegisterRefresh?.(loadEventsData);
    return () => {
      onRegisterRefresh?.(undefined as any);
    };
  }, [loadEventsData, onRegisterRefresh]);

  useEffect(() => {
    loadEventsData();
  }, [loadEventsData, refreshKey]);

  // Esc key & PointerUp window listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (drawStep || drawIntrusionStep || isDrawingNormalMotion || drawSizeMode) {
          handleCancelDrawing();
        }
        resetGridDrag();
      } else if (e.key === 'Enter') {
        if (isDrawingNormalMotion && normalMotionDrawPoints.length >= 3) {
          handleFinishNormalMotionPolygon();
        }
      }
    };
    const onWindowPointerUp = () => {
      handlePointerUp();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('pointerup', onWindowPointerUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('pointerup', onWindowPointerUp);
    };
  }, [drawStep, drawIntrusionStep, isDrawingNormalMotion, normalMotionDrawPoints, isPaintingGrid, gridDragStart, gridInitialState, gridBrushMode, drawSizeMode]);

  // Capabilities helpers
  const supportsTargetDetection = Boolean(
    capabilities?.has_target_detection ||
    camera?.ip === '192.168.2.176'
  );

  const isPolygonMotion = Boolean(
    capabilities?.has_polygon_motion ||
    (motion?.coordinates && motion.coordinates.length >= 3) ||
    camera?.ip === '192.168.2.176'
  );

  // Supported smart event tabs dynamically filtered by camera capabilities
  const supportedSmartEvents = ([
    {
      id: 'motion' as const,
      label: 'Motion',
      icon: Activity,
      color: 'text-emerald-400',
      activeBg: 'bg-emerald-600',
      has: capabilities ? capabilities.has_motion_detection : true,
    },
    {
      id: 'line' as const,
      label: 'Line Crossing',
      icon: Layers,
      color: 'text-amber-400',
      activeBg: 'bg-amber-600',
      has: capabilities ? capabilities.has_line_detection : true,
    },
    {
      id: 'intrusion' as const,
      label: 'Intrusion',
      icon: Shield,
      color: 'text-purple-400',
      activeBg: 'bg-purple-600',
      has: capabilities ? capabilities.has_intrusion_detection : true,
    },
    {
      id: 'entrance' as const,
      label: 'Region Entrance',
      icon: LogIn,
      color: 'text-indigo-400',
      activeBg: 'bg-indigo-600',
      has: capabilities ? Boolean(capabilities.has_region_entrance) : true,
    },
    {
      id: 'exiting' as const,
      label: 'Region Exiting',
      icon: LogOut,
      color: 'text-pink-400',
      activeBg: 'bg-pink-600',
      has: capabilities ? Boolean(capabilities.has_region_exiting) : true,
    },
    {
      id: 'tamper' as const,
      label: 'Tampering',
      icon: Eye,
      color: 'text-rose-400',
      activeBg: 'bg-rose-600',
      has: capabilities ? capabilities.has_tamper_detection : true,
    },
    {
      id: 'unattended' as const,
      label: 'Unattended Baggage',
      icon: Briefcase,
      color: 'text-teal-400',
      activeBg: 'bg-teal-600',
      has: capabilities ? Boolean(capabilities.has_unattended_baggage) : true,
    },
    {
      id: 'removal' as const,
      label: 'Object Removal',
      icon: Package,
      color: 'text-orange-400',
      activeBg: 'bg-orange-600',
      has: capabilities ? Boolean(capabilities.has_object_removal) : true,
    },
  ] as const).filter((item) => item.has);

  // Grid dimension & serialization helpers
  const getGridDimensions = () => {
    const cols = motion?.column_granularity && motion.column_granularity > 0 ? motion.column_granularity : 22;
    let rows = motion?.row_granularity && motion.row_granularity > 0 ? motion.row_granularity : 0;
    if (rows <= 0 && motion?.grid_map) {
      const cleanHex = motion.grid_map.replace(/[^0-9a-fA-F]/g, '');
      const hexPerRow = Math.ceil(cols / 8) * 2;
      if (cleanHex.length > 0 && cleanHex.length % hexPerRow === 0) {
        rows = cleanHex.length / hexPerRow;
      }
    }
    if (rows <= 0) {
      rows = 15;
    }
    return { cols, rows, total: cols * rows };
  };

  const parseGridMap = (hexStr?: string): boolean[][] => {
    const { cols, rows } = getGridDimensions();
    const bytesPerRow = Math.ceil(cols / 8);
    const hexPerRow = bytesPerRow * 2;
    const cleanHex = hexStr ? hexStr.replace(/[^0-9a-fA-F]/g, '') : '';

    const grid: boolean[][] = [];
    for (let r = 0; r < rows; r++) {
      const row: boolean[] = [];
      const rowHex = cleanHex.substr(r * hexPerRow, hexPerRow);

      for (let c = 0; c < cols; c++) {
        if (!hexStr || hexStr.trim() === '') {
          row.push(true);
          continue;
        }
        const byteOffset = Math.floor(c / 8);
        const bitOffset = 7 - (c % 8);
        if (rowHex.length >= (byteOffset + 1) * 2) {
          const byteVal = parseInt(rowHex.substr(byteOffset * 2, 2), 16);
          if (!isNaN(byteVal)) {
            row.push(((byteVal >> bitOffset) & 1) === 1);
          } else {
            row.push(false);
          }
        } else {
          row.push(false);
        }
      }
      grid.push(row);
    }
    return grid;
  };

  const serializeGridMap = (grid: boolean[][]): string => {
    const { cols, rows } = getGridDimensions();
    const bytesPerRow = Math.ceil(cols / 8);
    let hex = '';

    for (let r = 0; r < rows; r++) {
      for (let b = 0; b < bytesPerRow; b++) {
        let byteVal = 0;
        for (let bit = 0; bit < 8; bit++) {
          const colIndex = b * 8 + bit;
          if (colIndex < cols && grid[r]?.[colIndex]) {
            byteVal |= (1 << (7 - bit));
          }
        }
        hex += byteVal.toString(16).padStart(2, '0');
      }
    }
    return hex;
  };

  const countActiveGridCells = (hexStr?: string): number => {
    const grid = parseGridMap(hexStr);
    let count = 0;
    for (const row of grid) {
      for (const cell of row) {
        if (cell) count++;
      }
    }
    return count;
  };

  const getExpertRegions = (): MotionRegion[] => {
    const regions = motion?.regions ? [...motion.regions] : [];
    while (regions.length < 8) {
      const idx = regions.length;
      const offset = (idx % 4) * 60;
      regions.push({
        id: idx + 1,
        enabled: false,
        sensitivity: motion?.sensitivity || 50,
        day_sensitivity: motion?.day_sensitivity || motion?.sensitivity || 60,
        night_sensitivity: motion?.night_sensitivity || motion?.sensitivity || 40,
        percentage: 20,
        coordinates: [
          { x: 150 + offset, y: 150 + offset },
          { x: 650 + offset, y: 150 + offset },
          { x: 650 + offset, y: 650 + offset },
          { x: 150 + offset, y: 650 + offset },
        ],
      });
    }
    return regions.map((reg, idx) => {
      if (isZeroArea(reg.coordinates)) {
        const offset = (idx % 4) * 60;
        return {
          ...reg,
          enabled: false,
          coordinates: [
            { x: 150 + offset, y: 150 + offset },
            { x: 650 + offset, y: 150 + offset },
            { x: 650 + offset, y: 650 + offset },
            { x: 150 + offset, y: 650 + offset },
          ],
        };
      }
      return {
        ...reg,
        coordinates: normalizeRectPoints(reg.coordinates),
      };
    });
  };

  const updateActiveExpertRegion = (partial: Partial<MotionRegion>) => {
    if (!motion) return;
    const currentRegions = getExpertRegions();
    currentRegions[activeExpertAreaIndex] = {
      ...currentRegions[activeExpertAreaIndex],
      ...partial,
    };
    setMotion({ ...motion, regions: currentRegions });
  };

  const resetGridDrag = () => {
    setIsPaintingGrid(false);
    setGridBrushMode(null);
    setGridDragStart(null);
    setGridDragCurrent(null);
    setGridInitialState(null);
  };

  const handleGridDragStart = (r: number, c: number) => {
    if (!motion) return;
    const initialGrid = parseGridMap(motion.grid_map);
    const initialVal = initialGrid[r]?.[c] ?? false;
    const targetBrushMode = !initialVal;

    const updated = initialGrid.map((rowArr, rowIdx) =>
      rowArr.map((cellVal, colIdx) => (rowIdx === r && colIdx === c ? targetBrushMode : cellVal))
    );

    setGridBrushMode(targetBrushMode);
    setGridDragStart({ r, c });
    setGridDragCurrent({ r, c });
    setGridInitialState(initialGrid);
    setIsPaintingGrid(true);
    setMotion({ ...motion, grid_map: serializeGridMap(updated) });
  };

  const handlePointerUp = () => {
    resetGridDrag();
    setDragSizeAnchorPos(null);
    setIsDraggingSizeBody(null);
    setDragSizeBodyStart(null);
    setDragSizeBodyOrig(null);
    setIsDraggingExpertBody(false);
    setDragExpertBodyStart(null);
    setDragExpertBodyOrig(null);
    if (!drawStep && !drawIntrusionStep && !drawSizeMode) {
      setDraggingPoint(null);
    }
  };

  const handleSelectAllGrid = () => {
    if (!motion) return;
    const { cols, rows } = getGridDimensions();
    const fullGrid: boolean[][] = [];
    for (let r = 0; r < rows; r++) {
      fullGrid.push(new Array(cols).fill(true));
    }
    resetGridDrag();
    setMotion({ ...motion, grid_map: serializeGridMap(fullGrid) });
  };

  const handleClearAllGrid = () => {
    if (!motion) return;
    const { cols, rows } = getGridDimensions();
    const emptyGrid: boolean[][] = [];
    for (let r = 0; r < rows; r++) {
      emptyGrid.push(new Array(cols).fill(false));
    }
    resetGridDrag();
    setMotion({ ...motion, grid_map: serializeGridMap(emptyGrid) });
  };

  const handleInvertGrid = () => {
    if (!motion) return;
    const current = parseGridMap(motion.grid_map);
    const inverted = current.map((row) => row.map((cell) => !cell));
    resetGridDrag();
    setMotion({ ...motion, grid_map: serializeGridMap(inverted) });
  };

  const getNormalizedCoordinates = (e: { clientX: number; clientY: number }): Point | null => {
    if (!svgRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    const normX = Math.round(Math.max(0, Math.min(1000, (clientX / rect.width) * 1000)));
    const normY = Math.round(Math.max(0, Math.min(1000, (clientY / rect.height) * 1000)));
    return { x: normX, y: normY };
  };

  const getActiveRegionPoints = (): Point[] => {
    if (activeSmartEvent === 'motion' && motion?.mode === 'expert') {
      const regions = getExpertRegions();
      const r = regions[activeExpertAreaIndex];
      const offset = (activeExpertAreaIndex % 4) * 60;
      return r?.coordinates && !isZeroArea(r.coordinates)
        ? normalizeRectPoints(r.coordinates)
        : [
            { x: 150 + offset, y: 150 + offset },
            { x: 650 + offset, y: 150 + offset },
            { x: 650 + offset, y: 650 + offset },
            { x: 150 + offset, y: 650 + offset },
          ];
    }
    if (activeSmartEvent === 'motion' && (motion?.mode || 'normal') === 'normal') {
      return motion?.coordinates && motion.coordinates.length >= 3
        ? motion.coordinates
        : [
            { x: 200, y: 200 },
            { x: 800, y: 200 },
            { x: 800, y: 800 },
            { x: 200, y: 800 },
          ];
    }
    if (activeSmartEvent === 'tamper') {
      return tamper?.coordinates && tamper.coordinates.length >= 4
        ? tamper.coordinates
        : [
            { x: 100, y: 100 },
            { x: 900, y: 100 },
            { x: 900, y: 900 },
            { x: 100, y: 900 },
          ];
    }
    if (activeSmartEvent === 'intrusion') {
      return intrusion?.coordinates && intrusion.coordinates.length >= 4
        ? intrusion.coordinates
        : [
            { x: 200, y: 200 },
            { x: 800, y: 200 },
            { x: 800, y: 800 },
            { x: 200, y: 800 },
          ];
    }
    if (activeSmartEvent === 'entrance') {
      return regionEntrance?.coordinates && regionEntrance.coordinates.length >= 4
        ? regionEntrance.coordinates
        : [
            { x: 200, y: 200 },
            { x: 800, y: 200 },
            { x: 800, y: 800 },
            { x: 200, y: 800 },
          ];
    }
    if (activeSmartEvent === 'exiting') {
      return regionExiting?.coordinates && regionExiting.coordinates.length >= 4
        ? regionExiting.coordinates
        : [
            { x: 200, y: 200 },
            { x: 800, y: 200 },
            { x: 800, y: 800 },
            { x: 200, y: 800 },
          ];
    }
    if (activeSmartEvent === 'unattended') {
      return unattended?.coordinates && unattended.coordinates.length >= 4
        ? unattended.coordinates
        : [
            { x: 250, y: 250 },
            { x: 750, y: 250 },
            { x: 750, y: 750 },
            { x: 250, y: 750 },
          ];
    }
    if (activeSmartEvent === 'removal') {
      return objectRemoval?.coordinates && objectRemoval.coordinates.length >= 4
        ? objectRemoval.coordinates
        : [
            { x: 300, y: 300 },
            { x: 700, y: 300 },
            { x: 700, y: 700 },
            { x: 300, y: 700 },
          ];
    }
    return [{ x: 200, y: 200 }, { x: 800, y: 200 }, { x: 800, y: 800 }, { x: 200, y: 800 }];
  };

  const handleStartDrawing = () => {
    if (!lineDetection) return;
    setActiveSmartEvent('line');
    setLineDetection({ ...lineDetection, enabled: true });
    setDrawStep('first');
    setDrawIntrusionStep(null);
    setDrawHoverPt(null);
    setDraggingPoint(null);
  };

  const handleStart4PointDrawing = (
    evt: 'intrusion' | 'tamper' | 'unattended' | 'removal' | 'motion_expert' | 'entrance' | 'exiting'
  ) => {
    if (evt === 'motion_expert') {
      setActiveSmartEvent('motion');
      if (motion) {
        const currentRegions = getExpertRegions();
        currentRegions[activeExpertAreaIndex] = {
          ...currentRegions[activeExpertAreaIndex],
          enabled: true,
        };
        setMotion({ ...motion, enabled: true, mode: 'expert', regions: currentRegions });
      }
      setDrawExpertRectCorner1(null);
      setDrawStep('first');
      setDrawIntrusionStep(null);
      setDrawHoverPt(null);
      setDraggingPoint(null);
      return;
    }
    if (evt === 'tamper') {
      setActiveSmartEvent('tamper');
      if (tamper) {
        setTamper({ ...tamper, enabled: true });
      }
      setDrawExpertRectCorner1(null);
      setDrawStep('first');
      setDrawIntrusionStep(null);
      setDrawHoverPt(null);
      setDraggingPoint(null);
      return;
    }
    setActiveSmartEvent(evt);
    if (evt === 'intrusion' && intrusion) {
      setIntrusion({ ...intrusion, enabled: true });
    } else if (evt === 'unattended' && unattended) {
      setUnattended({ ...unattended, enabled: true });
    } else if (evt === 'removal' && objectRemoval) {
      setObjectRemoval({ ...objectRemoval, enabled: true });
    } else if (evt === 'entrance' && regionEntrance) {
      setRegionEntrance({ ...regionEntrance, enabled: true });
    } else if (evt === 'exiting' && regionExiting) {
      setRegionExiting({ ...regionExiting, enabled: true });
    }
    setDrawIntrusionStep(1);
    setDrawStep(null);
    setDrawHoverPt(null);
    setDraggingPoint(null);
  };

  const handleStartNormalMotionPolygon = () => {
    setActiveSmartEvent('motion');
    setIsDrawingNormalMotion(true);
    setNormalMotionDrawPoints([]);
    setDrawStep(null);
    setDrawIntrusionStep(null);
    setDrawHoverPt(null);
    setDraggingPoint(null);
  };

  const handleFinishNormalMotionPolygon = () => {
    if (normalMotionDrawPoints.length >= 3 && motion) {
      setMotion({
        ...motion,
        enabled: true,
        coordinates: normalMotionDrawPoints,
      });
    }
    setIsDrawingNormalMotion(false);
    setNormalMotionDrawPoints([]);
    setDrawHoverPt(null);
  };

  // Target Size Filter helpers
  const getCurrentMinSize = (): Point[] | undefined => {
    switch (activeSmartEvent) {
      case 'line': return lineDetection?.min_size;
      case 'intrusion': return intrusion?.min_size;
      case 'entrance': return regionEntrance?.min_size;
      case 'exiting': return regionExiting?.min_size;
      case 'unattended': return unattended?.min_size;
      case 'removal': return objectRemoval?.min_size;
      default: return undefined;
    }
  };

  const getCurrentMaxSize = (): Point[] | undefined => {
    switch (activeSmartEvent) {
      case 'line': return lineDetection?.max_size;
      case 'intrusion': return intrusion?.max_size;
      case 'entrance': return regionEntrance?.max_size;
      case 'exiting': return regionExiting?.max_size;
      case 'unattended': return unattended?.max_size;
      case 'removal': return objectRemoval?.max_size;
      default: return undefined;
    }
  };

  const updateCurrentMinSize = (pts: Point[] | undefined) => {
    switch (activeSmartEvent) {
      case 'line':
        if (lineDetection) setLineDetection({ ...lineDetection, min_size: pts });
        break;
      case 'intrusion':
        if (intrusion) setIntrusion({ ...intrusion, min_size: pts });
        break;
      case 'entrance':
        if (regionEntrance) setRegionEntrance({ ...regionEntrance, min_size: pts });
        break;
      case 'exiting':
        if (regionExiting) setRegionExiting({ ...regionExiting, min_size: pts });
        break;
      case 'unattended':
        if (unattended) setUnattended({ ...unattended, min_size: pts });
        break;
      case 'removal':
        if (objectRemoval) setObjectRemoval({ ...objectRemoval, min_size: pts });
        break;
    }
  };

  const updateCurrentMaxSize = (pts: Point[] | undefined) => {
    switch (activeSmartEvent) {
      case 'line':
        if (lineDetection) setLineDetection({ ...lineDetection, max_size: pts });
        break;
      case 'intrusion':
        if (intrusion) setIntrusion({ ...intrusion, max_size: pts });
        break;
      case 'entrance':
        if (regionEntrance) setRegionEntrance({ ...regionEntrance, max_size: pts });
        break;
      case 'exiting':
        if (regionExiting) setRegionExiting({ ...regionExiting, max_size: pts });
        break;
      case 'unattended':
        if (unattended) setUnattended({ ...unattended, max_size: pts });
        break;
      case 'removal':
        if (objectRemoval) setObjectRemoval({ ...objectRemoval, max_size: pts });
        break;
    }
  };

  const handleStartDrawMinSize = () => {
    if (activeSmartEvent === 'line' && lineDetection && !lineDetection.enabled) {
      setLineDetection({ ...lineDetection, enabled: true });
    } else if (activeSmartEvent === 'intrusion' && intrusion && !intrusion.enabled) {
      setIntrusion({ ...intrusion, enabled: true });
    } else if (activeSmartEvent === 'entrance' && regionEntrance && !regionEntrance.enabled) {
      setRegionEntrance({ ...regionEntrance, enabled: true });
    } else if (activeSmartEvent === 'exiting' && regionExiting && !regionExiting.enabled) {
      setRegionExiting({ ...regionExiting, enabled: true });
    } else if (activeSmartEvent === 'unattended' && unattended && !unattended.enabled) {
      setUnattended({ ...unattended, enabled: true });
    } else if (activeSmartEvent === 'removal' && objectRemoval && !objectRemoval.enabled) {
      setObjectRemoval({ ...objectRemoval, enabled: true });
    }
    setDrawSizeMode('min');
    setDrawSizeCorner1(null);
    setDrawStep(null);
    setDrawIntrusionStep(null);
    setDrawHoverPt(null);
    setDraggingPoint(null);
  };

  const handleStartDrawMaxSize = () => {
    if (activeSmartEvent === 'line' && lineDetection && !lineDetection.enabled) {
      setLineDetection({ ...lineDetection, enabled: true });
    } else if (activeSmartEvent === 'intrusion' && intrusion && !intrusion.enabled) {
      setIntrusion({ ...intrusion, enabled: true });
    } else if (activeSmartEvent === 'entrance' && regionEntrance && !regionEntrance.enabled) {
      setRegionEntrance({ ...regionEntrance, enabled: true });
    } else if (activeSmartEvent === 'exiting' && regionExiting && !regionExiting.enabled) {
      setRegionExiting({ ...regionExiting, enabled: true });
    } else if (activeSmartEvent === 'unattended' && unattended && !unattended.enabled) {
      setUnattended({ ...unattended, enabled: true });
    } else if (activeSmartEvent === 'removal' && objectRemoval && !objectRemoval.enabled) {
      setObjectRemoval({ ...objectRemoval, enabled: true });
    }
    setDrawSizeMode('max');
    setDrawSizeCorner1(null);
    setDrawStep(null);
    setDrawIntrusionStep(null);
    setDrawHoverPt(null);
    setDraggingPoint(null);
  };

  const handleClearMinSize = () => updateCurrentMinSize(undefined);
  const handleClearMaxSize = () => updateCurrentMaxSize(undefined);
  const handleClearAllSizes = () => {
    updateCurrentMinSize(undefined);
    updateCurrentMaxSize(undefined);
  };

  const handleStartDragSizeCorner = (type: 'min' | 'max', cornerIdx: number, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const currentPts = type === 'min' ? getCurrentMinSize() : getCurrentMaxSize();
    if (!currentPts || currentPts.length < 4) return;
    const oppIdx = (cornerIdx + 2) % 4;
    setDragSizeAnchorPos(currentPts[oppIdx]);
    setDraggingPoint(`${type}-corner-${cornerIdx}`);
  };

  const handleStartDragSizeBody = (type: 'min' | 'max', e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const currentPts = type === 'min' ? getCurrentMinSize() : getCurrentMaxSize();
    if (!currentPts || currentPts.length < 4) return;
    const pos = getNormalizedCoordinates(e);
    if (!pos) return;
    setIsDraggingSizeBody(type);
    setDragSizeBodyStart(pos);
    setDragSizeBodyOrig(currentPts);
    setDraggingPoint(`${type}-body`);
  };

  const handleStartDragExpertBody = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const pos = getNormalizedCoordinates(e);
    if (!pos) return;
    const currentPts = getActiveRegionPoints();
    if (!currentPts || currentPts.length < 4) return;
    setIsDraggingExpertBody(true);
    setDragExpertBodyStart(pos);
    setDragExpertBodyOrig(currentPts);
    setDraggingPoint('expert-body');
  };

  const handleCancelDrawing = () => {
    setDrawStep(null);
    setDrawIntrusionStep(null);
    setDrawExpertRectCorner1(null);
    setIsDrawingNormalMotion(false);
    setNormalMotionDrawPoints([]);
    setDrawHoverPt(null);
    setDraggingPoint(null);
    setIsDraggingExpertBody(false);
    setDragExpertBodyStart(null);
    setDragExpertBodyOrig(null);
    setDrawSizeMode(null);
    setDrawSizeCorner1(null);
    setDragSizeAnchorPos(null);
    setIsDraggingSizeBody(null);
    setDragSizeBodyStart(null);
    setDragSizeBodyOrig(null);
    resetGridDrag();
  };

  const handleSVGPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const pos = getNormalizedCoordinates(e);
    if (!pos) return;

    // Target Size Filter (Min / Max Size) 2-click 90-degree rectangle drawing
    if (drawSizeMode) {
      if (!drawSizeCorner1) {
        setDrawSizeCorner1(pos);
        setDrawHoverPt(pos);
      } else {
        const p1 = drawSizeCorner1;
        const p2 = pos;
        const minX = Math.min(p1.x, p2.x);
        const maxX = Math.max(p1.x, p2.x);
        const minY = Math.min(p1.y, p2.y);
        const maxY = Math.max(p1.y, p2.y);
        if (maxX - minX >= 15 && maxY - minY >= 15) {
          const rectCorners: Point[] = [
            { x: minX, y: minY },
            { x: maxX, y: minY },
            { x: maxX, y: maxY },
            { x: minX, y: maxY },
          ];
          if (drawSizeMode === 'min') {
            updateCurrentMinSize(rectCorners);
          } else {
            updateCurrentMaxSize(rectCorners);
          }
        }
        setDrawSizeMode(null);
        setDrawSizeCorner1(null);
        setDrawHoverPt(null);
      }
      return;
    }

    if (activeSmartEvent === 'line' && drawStep) {
      if (!lineDetection) return;
      if (drawStep === 'first') {
        const p2 = lineDetection.coordinates?.[1] || { x: Math.min(1000, pos.x + 100), y: pos.y };
        setLineDetection({
          ...lineDetection,
          enabled: true,
          coordinates: [pos, p2],
        });
        setDrawHoverPt(pos);
        setDrawStep('second');
      } else if (drawStep === 'second') {
        const p1 = lineDetection.coordinates?.[0] || { x: 200, y: 500 };
        setLineDetection({
          ...lineDetection,
          enabled: true,
          coordinates: [p1, pos],
        });
        setDrawStep(null);
        setDrawHoverPt(null);
      }
      return;
    }

    // Expert Mode: 90-degree rectangle 2-click drawing (Area 1 is always enabled)
    if (activeSmartEvent === 'motion' && motion?.mode === 'expert' && drawStep) {
      if (drawStep === 'first') {
        setDrawExpertRectCorner1(pos);
        setDrawStep('second');
        setDrawHoverPt(pos);
      } else if (drawStep === 'second' && drawExpertRectCorner1) {
        const p1 = drawExpertRectCorner1;
        const p2 = pos;
        const minX = Math.min(p1.x, p2.x);
        const maxX = Math.max(p1.x, p2.x);
        const minY = Math.min(p1.y, p2.y);
        const maxY = Math.max(p1.y, p2.y);
        const rectCorners = [
          { x: minX, y: minY },
          { x: maxX, y: minY },
          { x: maxX, y: maxY },
          { x: minX, y: maxY },
        ];
        const currentRegions = getExpertRegions();
        currentRegions[activeExpertAreaIndex] = {
          ...currentRegions[activeExpertAreaIndex],
          enabled: true,
          coordinates: rectCorners,
        };
        setMotion({ ...motion, enabled: true, regions: currentRegions });
        setDrawStep(null);
        setDrawExpertRectCorner1(null);
        setDrawHoverPt(null);
      }
      return;
    }

    // Tamper Detection: 90-degree rectangle 2-click drawing
    if (activeSmartEvent === 'tamper' && drawStep) {
      if (drawStep === 'first') {
        setDrawExpertRectCorner1(pos);
        setDrawStep('second');
        setDrawHoverPt(pos);
      } else if (drawStep === 'second' && drawExpertRectCorner1) {
        const p1 = drawExpertRectCorner1;
        const p2 = pos;
        const minX = Math.min(p1.x, p2.x);
        const maxX = Math.max(p1.x, p2.x);
        const minY = Math.min(p1.y, p2.y);
        const maxY = Math.max(p1.y, p2.y);
        const rectCorners = [
          { x: minX, y: minY },
          { x: maxX, y: minY },
          { x: maxX, y: maxY },
          { x: minX, y: maxY },
        ];
        if (tamper) {
          setTamper({ ...tamper, enabled: true, coordinates: rectCorners });
        }
        setDrawStep(null);
        setDrawExpertRectCorner1(null);
        setDrawHoverPt(null);
      }
      return;
    }

    // Normal Mode Motion: drawing a polygon of 3-10 points
    if (activeSmartEvent === 'motion' && (motion?.mode || 'normal') === 'normal' && isDrawingNormalMotion) {
      if (normalMotionDrawPoints.length >= 10) return;
      setNormalMotionDrawPoints([...normalMotionDrawPoints, pos]);
      return;
    }

    // 4-Point Regions (Intrusion, Unattended, Removal, Entrance, Exiting)
    if (
      (activeSmartEvent === 'intrusion' ||
        activeSmartEvent === 'unattended' ||
        activeSmartEvent === 'removal' ||
        activeSmartEvent === 'entrance' ||
        activeSmartEvent === 'exiting') &&
      drawIntrusionStep
    ) {
      const curCoords = [...getActiveRegionPoints()];
      curCoords[drawIntrusionStep - 1] = pos;

      if (activeSmartEvent === 'intrusion' && intrusion) {
        setIntrusion({ ...intrusion, enabled: true, coordinates: curCoords });
      } else if (activeSmartEvent === 'entrance' && regionEntrance) {
        setRegionEntrance({ ...regionEntrance, enabled: true, coordinates: curCoords });
      } else if (activeSmartEvent === 'exiting' && regionExiting) {
        setRegionExiting({ ...regionExiting, enabled: true, coordinates: curCoords });
      } else if (activeSmartEvent === 'unattended' && unattended) {
        setUnattended({ ...unattended, enabled: true, coordinates: curCoords });
      } else if (activeSmartEvent === 'removal' && objectRemoval) {
        setObjectRemoval({ ...objectRemoval, enabled: true, coordinates: curCoords });
      }

      if (drawIntrusionStep < 4) {
        setDrawHoverPt(pos);
        setDrawIntrusionStep((drawIntrusionStep + 1) as 1 | 2 | 3 | 4);
      } else {
        setDrawHoverPt(null);
        setDrawIntrusionStep(null);
      }
      return;
    }

    if (activeSmartEvent === 'motion' && (motion?.mode || 'normal') === 'normal') {
      if (!isPolygonMotion) {
        const { cols, rows } = getGridDimensions();
        const c = Math.max(0, Math.min(cols - 1, Math.floor(pos.x / (1000 / cols))));
        const r = Math.max(0, Math.min(rows - 1, Math.floor(pos.y / (1000 / rows))));
        handleGridDragStart(r, c);
      }
      return;
    }
  };

  const handleMoveAtPosition = (pos: Point) => {
    if (
      activeSmartEvent === 'motion' &&
      motion &&
      (motion.mode || 'normal') === 'normal' &&
      !isPolygonMotion &&
      isPaintingGrid &&
      gridDragStart &&
      gridInitialState &&
      gridBrushMode !== null
    ) {
      const { cols, rows } = getGridDimensions();
      const curC = Math.max(0, Math.min(cols - 1, Math.floor(pos.x / (1000 / cols))));
      const curR = Math.max(0, Math.min(rows - 1, Math.floor(pos.y / (1000 / rows))));

      if (curR !== gridDragCurrent?.r || curC !== gridDragCurrent?.c) {
        setGridDragCurrent({ r: curR, c: curC });
        const rMin = Math.min(gridDragStart.r, curR);
        const rMax = Math.max(gridDragStart.r, curR);
        const cMin = Math.min(gridDragStart.c, curC);
        const cMax = Math.max(gridDragStart.c, curC);

        const newGrid = gridInitialState.map((rowArr, rowIdx) =>
          rowArr.map((cellVal, colIdx) => {
            if (rowIdx >= rMin && rowIdx <= rMax && colIdx >= cMin && colIdx <= cMax) {
              return gridBrushMode;
            }
            return cellVal;
          })
        );
        setMotion({ ...motion, grid_map: serializeGridMap(newGrid) });
      }
      return;
    }

    if (!draggingPoint) return;

    // Target Size Filter Corner Resizing (Cartesian 90-degree rectangle preservation with opposite corner anchor)
    if ((draggingPoint.startsWith('min-corner-') || draggingPoint.startsWith('max-corner-')) && dragSizeAnchorPos) {
      const isMin = draggingPoint.startsWith('min-corner-');
      const cornerIdx = parseInt(draggingPoint.split('-')[2], 10);
      const anchor = dragSizeAnchorPos;
      let newMinX = 0;
      let newMaxX = 1000;
      let newMinY = 0;
      let newMaxY = 1000;

      if (cornerIdx === 0) {
        // Top-Left (Anchor is Bottom-Right)
        newMinX = Math.max(0, Math.min(pos.x, anchor.x - 10));
        newMinY = Math.max(0, Math.min(pos.y, anchor.y - 10));
        newMaxX = anchor.x;
        newMaxY = anchor.y;
      } else if (cornerIdx === 1) {
        // Top-Right (Anchor is Bottom-Left)
        newMinX = anchor.x;
        newMinY = Math.max(0, Math.min(pos.y, anchor.y - 10));
        newMaxX = Math.min(1000, Math.max(pos.x, anchor.x + 10));
        newMaxY = anchor.y;
      } else if (cornerIdx === 2) {
        // Bottom-Right (Anchor is Top-Left)
        newMinX = anchor.x;
        newMinY = anchor.y;
        newMaxX = Math.min(1000, Math.max(pos.x, anchor.x + 10));
        newMaxY = Math.min(1000, Math.max(pos.y, anchor.y + 10));
      } else if (cornerIdx === 3) {
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

      if (isMin) {
        updateCurrentMinSize(newCoords);
      } else {
        updateCurrentMaxSize(newCoords);
      }
      return;
    }

    // Target Size Filter Body Translation
    if (isDraggingSizeBody && dragSizeBodyStart && dragSizeBodyOrig && dragSizeBodyOrig.length === 4) {
      let dx = pos.x - dragSizeBodyStart.x;
      let dy = pos.y - dragSizeBodyStart.y;

      const minX = dragSizeBodyOrig[0].x;
      const maxX = dragSizeBodyOrig[1].x;
      const minY = dragSizeBodyOrig[0].y;
      const maxY = dragSizeBodyOrig[2].y;

      if (minX + dx < 0) dx = -minX;
      if (maxX + dx > 1000) dx = 1000 - maxX;
      if (minY + dy < 0) dy = -minY;
      if (maxY + dy > 1000) dy = 1000 - maxY;

      const translatedCoords: Point[] = dragSizeBodyOrig.map((pt) => ({
        x: pt.x + dx,
        y: pt.y + dy,
      }));

      if (isDraggingSizeBody === 'min') {
        updateCurrentMinSize(translatedCoords);
      } else {
        updateCurrentMaxSize(translatedCoords);
      }
      return;
    }

    // Expert Mode Body Translation (moving whole 90-degree rectangle)
    if (isDraggingExpertBody && dragExpertBodyStart && dragExpertBodyOrig && dragExpertBodyOrig.length === 4) {
      let dx = pos.x - dragExpertBodyStart.x;
      let dy = pos.y - dragExpertBodyStart.y;

      const minX = Math.min(...dragExpertBodyOrig.map((p) => p.x));
      const maxX = Math.max(...dragExpertBodyOrig.map((p) => p.x));
      const minY = Math.min(...dragExpertBodyOrig.map((p) => p.y));
      const maxY = Math.max(...dragExpertBodyOrig.map((p) => p.y));

      if (minX + dx < 0) dx = -minX;
      if (maxX + dx > 1000) dx = 1000 - maxX;
      if (minY + dy < 0) dy = -minY;
      if (maxY + dy > 1000) dy = 1000 - maxY;

      const translatedCoords: Point[] = dragExpertBodyOrig.map((pt) => ({
        x: pt.x + dx,
        y: pt.y + dy,
      }));

      const currentRegions = getExpertRegions();
      currentRegions[activeExpertAreaIndex] = {
        ...currentRegions[activeExpertAreaIndex],
        coordinates: translatedCoords,
      };
      setMotion({ ...motion!, regions: currentRegions });
      return;
    }

    if (activeSmartEvent === 'line' && lineDetection) {
      const coords = [...(lineDetection.coordinates || [{ x: 200, y: 500 }, { x: 800, y: 500 }])];
      if (draggingPoint === '1') {
        coords[0] = pos;
      } else if (draggingPoint === '2') {
        coords[1] = pos;
      }
      setLineDetection({ ...lineDetection, coordinates: coords });
    } else if (activeSmartEvent === 'motion' && motion?.mode === 'expert') {
      // Expert Mode: Dragging any corner preserves 90-degree rectangle geometry!
      const currentRegions = getExpertRegions();
      const offset = (activeExpertAreaIndex % 4) * 60;
      const oldCoords =
        currentRegions[activeExpertAreaIndex]?.coordinates && !isZeroArea(currentRegions[activeExpertAreaIndex].coordinates)
          ? [...currentRegions[activeExpertAreaIndex].coordinates]
          : [
              { x: 150 + offset, y: 150 + offset },
              { x: 650 + offset, y: 150 + offset },
              { x: 650 + offset, y: 650 + offset },
              { x: 150 + offset, y: 650 + offset },
            ];
      const newCoords = [...oldCoords];
      const idx = parseInt(draggingPoint, 10) - 1;
      if (idx === 0) {
        const clX = Math.max(0, Math.min(pos.x, oldCoords[1].x - 10));
        const clY = Math.max(0, Math.min(pos.y, oldCoords[3].y - 10));
        newCoords[0] = { x: clX, y: clY };
        newCoords[1] = { x: newCoords[1].x, y: clY };
        newCoords[3] = { x: clX, y: newCoords[3].y };
      } else if (idx === 1) {
        const clX = Math.min(1000, Math.max(pos.x, oldCoords[0].x + 10));
        const clY = Math.max(0, Math.min(pos.y, oldCoords[2].y - 10));
        newCoords[1] = { x: clX, y: clY };
        newCoords[0] = { x: newCoords[0].x, y: clY };
        newCoords[2] = { x: clX, y: newCoords[2].y };
      } else if (idx === 2) {
        const clX = Math.min(1000, Math.max(pos.x, oldCoords[3].x + 10));
        const clY = Math.min(1000, Math.max(pos.y, oldCoords[1].y + 10));
        newCoords[2] = { x: clX, y: clY };
        newCoords[1] = { x: clX, y: newCoords[1].y };
        newCoords[3] = { x: newCoords[3].x, y: clY };
      } else if (idx === 3) {
        const clX = Math.max(0, Math.min(pos.x, oldCoords[2].x - 10));
        const clY = Math.min(1000, Math.max(pos.y, oldCoords[0].y + 10));
        newCoords[3] = { x: clX, y: clY };
        newCoords[0] = { x: clX, y: newCoords[0].y };
        newCoords[2] = { x: newCoords[2].x, y: clY };
      }
      currentRegions[activeExpertAreaIndex] = {
        ...currentRegions[activeExpertAreaIndex],
        coordinates: newCoords,
      };
      setMotion({ ...motion, regions: currentRegions });
    } else if (activeSmartEvent === 'tamper' && tamper) {
      // Video Tampering: Dragging any corner preserves 90-degree rectangle geometry!
      const oldCoords =
        tamper?.coordinates && tamper.coordinates.length >= 4
          ? [...tamper.coordinates]
          : [
              { x: 100, y: 100 },
              { x: 900, y: 100 },
              { x: 900, y: 900 },
              { x: 100, y: 900 },
            ];
      const newCoords = [...oldCoords];
      const idx = parseInt(draggingPoint, 10) - 1;
      if (idx === 0) {
        const clX = Math.max(0, Math.min(pos.x, oldCoords[1].x - 10));
        const clY = Math.max(0, Math.min(pos.y, oldCoords[3].y - 10));
        newCoords[0] = { x: clX, y: clY };
        newCoords[1] = { x: newCoords[1].x, y: clY };
        newCoords[3] = { x: clX, y: newCoords[3].y };
      } else if (idx === 1) {
        const clX = Math.min(1000, Math.max(pos.x, oldCoords[0].x + 10));
        const clY = Math.max(0, Math.min(pos.y, oldCoords[2].y - 10));
        newCoords[1] = { x: clX, y: clY };
        newCoords[0] = { x: newCoords[0].x, y: clY };
        newCoords[2] = { x: clX, y: newCoords[2].y };
      } else if (idx === 2) {
        const clX = Math.min(1000, Math.max(pos.x, oldCoords[3].x + 10));
        const clY = Math.min(1000, Math.max(pos.y, oldCoords[1].y + 10));
        newCoords[2] = { x: clX, y: clY };
        newCoords[1] = { x: clX, y: newCoords[1].y };
        newCoords[3] = { x: newCoords[3].x, y: clY };
      } else if (idx === 3) {
        const clX = Math.max(0, Math.min(pos.x, oldCoords[2].x - 10));
        const clY = Math.min(1000, Math.max(pos.y, oldCoords[0].y + 10));
        newCoords[3] = { x: clX, y: clY };
        newCoords[0] = { x: clX, y: newCoords[0].y };
        newCoords[2] = { x: newCoords[2].x, y: clY };
      }
      setTamper({ ...tamper, coordinates: newCoords });
    } else if (
      activeSmartEvent === 'motion' &&
      (motion?.mode || 'normal') === 'normal' &&
      motion?.coordinates &&
      motion.coordinates.length >= 3
    ) {
      const coords = [...motion.coordinates];
      const idx = parseInt(draggingPoint, 10) - 1;
      if (idx >= 0 && idx < coords.length) {
        coords[idx] = pos;
        setMotion({ ...motion, coordinates: coords });
      }
    } else if (
      activeSmartEvent === 'intrusion' ||
      activeSmartEvent === 'unattended' ||
      activeSmartEvent === 'removal' ||
      activeSmartEvent === 'entrance' ||
      activeSmartEvent === 'exiting'
    ) {
      const coords = [...getActiveRegionPoints()];
      const idx = parseInt(draggingPoint, 10) - 1;
      if (idx >= 0 && idx < 4) {
        coords[idx] = pos;
        if (activeSmartEvent === 'intrusion' && intrusion) {
          setIntrusion({ ...intrusion, coordinates: coords });
        } else if (activeSmartEvent === 'entrance' && regionEntrance) {
          setRegionEntrance({ ...regionEntrance, coordinates: coords });
        } else if (activeSmartEvent === 'exiting' && regionExiting) {
          setRegionExiting({ ...regionExiting, coordinates: coords });
        } else if (activeSmartEvent === 'unattended' && unattended) {
          setUnattended({ ...unattended, coordinates: coords });
        } else if (activeSmartEvent === 'removal' && objectRemoval) {
          setObjectRemoval({ ...objectRemoval, coordinates: coords });
        }
      }
    }
  };

  const moveHandlerRef = useRef<(pos: Point) => void>(handleMoveAtPosition);
  moveHandlerRef.current = handleMoveAtPosition;

  const upHandlerRef = useRef<() => void>(handlePointerUp);
  upHandlerRef.current = handlePointerUp;

  useEffect(() => {
    if (!draggingPoint && !isPaintingGrid) return;

    const onGlobalPointerMove = (e: PointerEvent) => {
      const pos = getNormalizedCoordinates(e);
      if (pos) {
        moveHandlerRef.current(pos);
      }
    };

    const onGlobalPointerUp = () => {
      upHandlerRef.current();
    };

    window.addEventListener('pointermove', onGlobalPointerMove);
    window.addEventListener('pointerup', onGlobalPointerUp);
    window.addEventListener('pointercancel', onGlobalPointerUp);
    window.addEventListener('blur', onGlobalPointerUp);

    const prevUserSelect = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;
    document.body.style.userSelect = 'none';
    if (draggingPoint) {
      document.body.style.cursor = 'grabbing';
    }

    return () => {
      window.removeEventListener('pointermove', onGlobalPointerMove);
      window.removeEventListener('pointerup', onGlobalPointerUp);
      window.removeEventListener('pointercancel', onGlobalPointerUp);
      window.removeEventListener('blur', onGlobalPointerUp);
      document.body.style.userSelect = prevUserSelect;
      document.body.style.cursor = prevCursor;
    };
  }, [draggingPoint, isPaintingGrid]);

  const handleSVGPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const pos = getNormalizedCoordinates(e);
    if (!pos) return;

    if (drawStep === 'second' || drawIntrusionStep !== null || isDrawingNormalMotion || (drawSizeMode && drawSizeCorner1)) {
      setDrawHoverPt(pos);
      return;
    }

    // If dragging point or painting grid, window listener handles pointermove
    if (draggingPoint || isPaintingGrid) return;
  };

  // Check if current event is disabled
  const isCurrentEventDisabled = (): boolean => {
    switch (activeSmartEvent) {
      case 'motion':
        if (!motion?.enabled) return true;
        if (motion.mode === 'expert') {
          const regions = getExpertRegions();
          return !regions[activeExpertAreaIndex]?.enabled;
        }
        return false;
      case 'line':
        return !lineDetection?.enabled;
      case 'intrusion':
        return !intrusion?.enabled;
      case 'entrance':
        return !regionEntrance?.enabled;
      case 'exiting':
        return !regionExiting?.enabled;
      case 'tamper':
        return !tamper?.enabled;
      case 'unattended':
        return !unattended?.enabled;
      case 'removal':
        return !objectRemoval?.enabled;
      default:
        return false;
    }
  };

  const getCurrentEventName = (): string => {
    switch (activeSmartEvent) {
      case 'motion':
        if (!motion?.enabled) return 'Motion Detection';
        if (motion.mode === 'expert') {
          return `Motion Area ${activeExpertAreaIndex + 1}`;
        }
        return 'Motion Detection';
      case 'line':
        return 'Line Crossing';
      case 'intrusion':
        return 'Intrusion Detection';
      case 'entrance':
        return 'Region Entrance';
      case 'exiting':
        return 'Region Exiting';
      case 'tamper':
        return 'Video Tampering';
      case 'unattended':
        return 'Unattended Baggage';
      case 'removal':
        return 'Object Removal';
      default:
        return 'Event';
    }
  };

  // Save Event Handlers
  const handleSaveMotion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!camera || !motion) return;
    try {
      const res = await api.setCameraMotion(camera.id, motion);
      setSaveStatus({ success: true, message: res.message });
      const updated = await api.getCameraMotion(camera.id);
      if (updated) {
        let regions = updated.regions ? [...updated.regions] : [];
        while (regions.length < 8) {
          const idx = regions.length;
          const offset = (idx % 4) * 60;
          regions.push({
            id: idx + 1,
            enabled: false,
            sensitivity: updated.sensitivity || 50,
            day_sensitivity: updated.day_sensitivity || updated.sensitivity || 60,
            night_sensitivity: updated.night_sensitivity || updated.sensitivity || 40,
            percentage: 20,
            coordinates: [
              { x: 150 + offset, y: 150 + offset },
              { x: 650 + offset, y: 150 + offset },
              { x: 650 + offset, y: 650 + offset },
              { x: 150 + offset, y: 650 + offset },
            ],
          });
        }
        regions = regions.map((reg, idx) => {
          if (isZeroArea(reg.coordinates)) {
            const offset = (idx % 4) * 60;
            return {
              ...reg,
              enabled: false,
              coordinates: [
                { x: 150 + offset, y: 150 + offset },
                { x: 650 + offset, y: 150 + offset },
                { x: 650 + offset, y: 650 + offset },
                { x: 150 + offset, y: 650 + offset },
              ],
            };
          }
          return {
            ...reg,
            coordinates: normalizeRectPoints(reg.coordinates),
          };
        });
        setMotion({ ...updated, regions });
      }
    } catch (err: any) {
      setSaveStatus({ success: false, message: err.message || 'Failed to save motion detection' });
    }
  };

  const handleSaveLineDetection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!camera || !lineDetection) return;
    try {
      const res = await api.setCameraLineDetection(camera.id, lineDetection);
      setSaveStatus({ success: true, message: res.message });
    } catch (err: any) {
      setSaveStatus({ success: false, message: err.message || 'Failed to save line crossing' });
    }
  };

  const handleSaveIntrusion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!camera || !intrusion) return;
    try {
      const res = await api.setCameraIntrusion(camera.id, intrusion);
      setSaveStatus({ success: true, message: res.message });
    } catch (err: any) {
      setSaveStatus({ success: false, message: err.message || 'Failed to save intrusion detection' });
    }
  };

  const handleSaveTamper = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!camera || !tamper) return;
    try {
      const res = await api.setCameraTamper(camera.id, tamper);
      setSaveStatus({ success: true, message: res.message });
    } catch (err: any) {
      setSaveStatus({ success: false, message: err.message || 'Failed to save tamper detection' });
    }
  };

  const handleSaveRegionEntrance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!camera || !regionEntrance) return;
    try {
      const res = await api.setCameraRegionEntrance(camera.id, regionEntrance);
      setSaveStatus({ success: true, message: res.message });
    } catch (err: any) {
      setSaveStatus({ success: false, message: err.message || 'Failed to save region entrance' });
    }
  };

  const handleSaveRegionExiting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!camera || !regionExiting) return;
    try {
      const res = await api.setCameraRegionExiting(camera.id, regionExiting);
      setSaveStatus({ success: true, message: res.message });
    } catch (err: any) {
      setSaveStatus({ success: false, message: err.message || 'Failed to save region exiting' });
    }
  };

  const handleSaveUnattended = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!camera || !unattended) return;
    try {
      const res = await api.setCameraUnattendedBaggage(camera.id, unattended);
      setSaveStatus({ success: true, message: res.message });
    } catch (err: any) {
      setSaveStatus({ success: false, message: err.message || 'Failed to save unattended baggage' });
    }
  };

  const handleSaveObjectRemoval = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!camera || !objectRemoval) return;
    try {
      const res = await api.setCameraObjectRemoval(camera.id, objectRemoval);
      setSaveStatus({ success: true, message: res.message });
    } catch (err: any) {
      setSaveStatus({ success: false, message: err.message || 'Failed to save object removal' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Smart Event Types Selection Bar (Top Horizontal Navigation) */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 bg-slate-900/90 border border-slate-800 rounded-xl overflow-x-auto shadow-sm">
        {supportedSmartEvents.map((evt) => {
          const Icon = evt.icon;
          const isActive = activeSmartEvent === evt.id;
          return (
            <button
              key={evt.id}
              type="button"
              onClick={() => {
                setActiveSmartEvent(evt.id);
                handleCancelDrawing();
              }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                isActive
                  ? `${evt.activeBg} text-white shadow-md font-bold scale-[1.02]`
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : evt.color}`} />
              <span>{evt.label}</span>
            </button>
          );
        })}
      </div>

      {/* Live Preview with Interactive SVG Overlay */}
      <div className="flex justify-center w-full">
        <div className="relative w-full max-w-2xl aspect-video rounded-xl overflow-hidden border border-slate-800 bg-black select-none shadow-lg group">
          <img
            src={api.getSnapshotUrl(camera.id, effectiveSnapshotKey)}
            alt="Camera Snapshot"
            className="w-full h-full object-cover pointer-events-none block"
          />

          {/* Interactive SVG Overlay */}
          <EventsSvgOverlay
            svgRef={svgRef}
            activeSmartEvent={activeSmartEvent}
            motion={motion}
            lineDetection={lineDetection}
            intrusion={intrusion}
            tamper={tamper}
            unattended={unattended}
            objectRemoval={objectRemoval}
            regionEntrance={regionEntrance}
            regionExiting={regionExiting}
            isPolygonMotion={isPolygonMotion}
            drawStep={drawStep}
            drawIntrusionStep={drawIntrusionStep}
            isDrawingNormalMotion={isDrawingNormalMotion}
            normalMotionDrawPoints={normalMotionDrawPoints}
            drawExpertRectCorner1={drawExpertRectCorner1}
            drawHoverPt={drawHoverPt}
            isPaintingGrid={isPaintingGrid}
            gridBrushMode={gridBrushMode ?? false}
            gridDragStart={gridDragStart}
            gridDragCurrent={gridDragCurrent}
            activeExpertAreaIndex={activeExpertAreaIndex}
            getExpertRegions={getExpertRegions}
            getActiveRegionPoints={getActiveRegionPoints}
            getGridDimensions={getGridDimensions}
            parseGridMap={parseGridMap}
            onSVGPointerDown={handleSVGPointerDown}
            onSVGPointerMove={handleSVGPointerMove}
            onGridDragStart={handleGridDragStart}
            draggingPoint={draggingPoint}
            setDraggingPoint={setDraggingPoint}
            drawSizeMode={drawSizeMode}
            drawSizeCorner1={drawSizeCorner1}
            currentMinSize={getCurrentMinSize()}
            currentMaxSize={getCurrentMaxSize()}
            onStartDragSizeCorner={handleStartDragSizeCorner}
            onStartDragSizeBody={handleStartDragSizeBody}
            onStartDragExpertBody={handleStartDragExpertBody}
          />

          {/* Top Right Action: Refresh Snapshot & Events (Icon Only) */}
          <div className="absolute top-2 right-2 flex items-center gap-1.5 opacity-90 group-hover:opacity-100 transition-opacity z-10">
            <button
              type="button"
              onClick={() => {
                refreshPreview();
                loadEventsData();
              }}
              title="Refresh Snapshot & Events"
              className="p-1.5 bg-black/70 hover:bg-black/90 text-slate-300 hover:text-white backdrop-blur-md rounded-lg border border-white/10 shadow-md transition-all cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Event Disabled / Not in Use Notice Banner on top of video preview */}
          {isCurrentEventDisabled() && !drawStep && !drawIntrusionStep && !isDrawingNormalMotion && !drawSizeMode && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-slate-950/85 border border-slate-700/80 text-slate-300 px-3.5 py-1 rounded-full text-xs font-medium flex items-center gap-2 shadow-xl backdrop-blur-md pointer-events-none z-10">
              <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
              <span>{getCurrentEventName()} is disabled (not used)</span>
            </div>
          )}

          {/* Step Instruction Banner during Drawing */}
          {(drawStep || drawIntrusionStep || isDrawingNormalMotion || drawSizeMode) && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-slate-900/95 border border-amber-500/80 text-amber-300 px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-2 shadow-2xl backdrop-blur-md animate-pulse">
              <Crosshair className="w-4 h-4 text-amber-400" />
              <span>
                {drawSizeMode === 'min' && !drawSizeCorner1 && 'Min. Size Filter: Click to place Corner 1 of 90° Rectangle'}
                {drawSizeMode === 'min' && drawSizeCorner1 && 'Min. Size Filter: Click opposite corner to complete 90° Rectangle'}
                {drawSizeMode === 'max' && !drawSizeCorner1 && 'Max. Size Filter: Click to place Corner 1 of 90° Rectangle'}
                {drawSizeMode === 'max' && drawSizeCorner1 && 'Max. Size Filter: Click opposite corner to complete 90° Rectangle'}
                {isDrawingNormalMotion && `Click to place polygon vertices (${normalMotionDrawPoints.length} placed, at least 3 required)`}
                {drawStep === 'first' && (
                  activeSmartEvent === 'motion'
                    ? `Area ${activeExpertAreaIndex + 1}: Click to place Corner 1 of 90° Rectangle`
                    : activeSmartEvent === 'tamper'
                    ? 'Step 1 of 2: Click to place Corner 1 of 90° Tamper Rectangle'
                    : 'Step 1 of 2: Click on snapshot to place Point 1 (Start)'
                )}
                {drawStep === 'second' && (
                  activeSmartEvent === 'motion'
                    ? `Area ${activeExpertAreaIndex + 1}: Click opposite corner to complete 90° Rectangle`
                    : activeSmartEvent === 'tamper'
                    ? 'Step 2 of 2: Click opposite corner to complete 90° Tamper Rectangle'
                    : 'Step 2 of 2: Click to place Point 2 (End)'
                )}
                {drawIntrusionStep && (
                  activeSmartEvent === 'intrusion' ? `Step ${drawIntrusionStep} of 4: Click to place Intrusion Corner ${drawIntrusionStep}` :
                  activeSmartEvent === 'entrance' ? `Step ${drawIntrusionStep} of 4: Click to place Region Entrance Corner ${drawIntrusionStep}` :
                  activeSmartEvent === 'exiting' ? `Step ${drawIntrusionStep} of 4: Click to place Region Exiting Corner ${drawIntrusionStep}` :
                  activeSmartEvent === 'unattended' ? `Step ${drawIntrusionStep} of 4: Click to place Baggage Corner ${drawIntrusionStep}` :
                  `Step ${drawIntrusionStep} of 4: Click to place Object Removal Corner ${drawIntrusionStep}`
                )}
              </span>
              {isDrawingNormalMotion && normalMotionDrawPoints.length >= 3 && (
                <button
                  type="button"
                  onClick={handleFinishNormalMotionPolygon}
                  className="ml-2 px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[10px] font-bold cursor-pointer"
                >
                  Finish Polygon ({normalMotionDrawPoints.length} pts)
                </button>
              )}
              <button
                type="button"
                onClick={handleCancelDrawing}
                className="ml-2 px-2 py-0.5 bg-black/60 hover:bg-black/90 text-slate-300 rounded text-[10px] border border-white/10 cursor-pointer"
              >
                Cancel (Esc)
              </button>
            </div>
          )}
        </div>
      </div>

      {/* --- SINGLE ACTIVE FORM --- */}
      {activeSmartEvent === 'motion' && motion && (
        <MotionDetectionForm
          motion={motion}
          setMotion={setMotion}
          isPolygonMotion={isPolygonMotion}
          supportsTargetDetection={supportsTargetDetection}
          activeExpertAreaIndex={activeExpertAreaIndex}
          setActiveExpertAreaIndex={setActiveExpertAreaIndex}
          getExpertRegions={getExpertRegions}
          updateActiveExpertRegion={updateActiveExpertRegion}
          getGridDimensions={getGridDimensions}
          countActiveGridCells={countActiveGridCells}
          onSelectAllGrid={handleSelectAllGrid}
          onClearAllGrid={handleClearAllGrid}
          onInvertGrid={handleInvertGrid}
          onStartNormalMotionPolygon={handleStartNormalMotionPolygon}
          onStartExpertRect={() => handleStart4PointDrawing('motion_expert')}
          onSave={handleSaveMotion}
        />
      )}

      {activeSmartEvent === 'line' && lineDetection && (
        <LineCrossingForm
          lineDetection={lineDetection}
          setLineDetection={setLineDetection}
          supportsTargetDetection={supportsTargetDetection}
          onStartDrawing={handleStartDrawing}
          onSave={handleSaveLineDetection}
          onStartDrawMinSize={handleStartDrawMinSize}
          onStartDrawMaxSize={handleStartDrawMaxSize}
          onClearMinSize={handleClearMinSize}
          onClearMaxSize={handleClearMaxSize}
          onClearAllSizes={handleClearAllSizes}
          drawingMode={drawSizeMode}
        />
      )}

      {activeSmartEvent === 'intrusion' && intrusion && (
        <IntrusionDetectionForm
          intrusion={intrusion}
          setIntrusion={setIntrusion}
          supportsTargetDetection={supportsTargetDetection}
          onStartDrawing={() => handleStart4PointDrawing('intrusion')}
          onSave={handleSaveIntrusion}
          onStartDrawMinSize={handleStartDrawMinSize}
          onStartDrawMaxSize={handleStartDrawMaxSize}
          onClearMinSize={handleClearMinSize}
          onClearMaxSize={handleClearMaxSize}
          onClearAllSizes={handleClearAllSizes}
          drawingMode={drawSizeMode}
        />
      )}

      {activeSmartEvent === 'tamper' && tamper && (
        <TamperDetectionForm
          tamper={tamper}
          setTamper={setTamper}
          onStartDrawing={() => handleStart4PointDrawing('tamper')}
          onSave={handleSaveTamper}
        />
      )}

      {activeSmartEvent === 'unattended' && unattended && (
        <UnattendedBaggageForm
          unattended={unattended}
          setUnattended={setUnattended}
          onStartDrawing={() => handleStart4PointDrawing('unattended')}
          onSave={handleSaveUnattended}
          onStartDrawMinSize={handleStartDrawMinSize}
          onStartDrawMaxSize={handleStartDrawMaxSize}
          onClearMinSize={handleClearMinSize}
          onClearMaxSize={handleClearMaxSize}
          onClearAllSizes={handleClearAllSizes}
          drawingMode={drawSizeMode}
        />
      )}

      {activeSmartEvent === 'removal' && objectRemoval && (
        <ObjectRemovalForm
          objectRemoval={objectRemoval}
          setObjectRemoval={setObjectRemoval}
          onStartDrawing={() => handleStart4PointDrawing('removal')}
          onSave={handleSaveObjectRemoval}
          onStartDrawMinSize={handleStartDrawMinSize}
          onStartDrawMaxSize={handleStartDrawMaxSize}
          onClearMinSize={handleClearMinSize}
          onClearMaxSize={handleClearMaxSize}
          onClearAllSizes={handleClearAllSizes}
          drawingMode={drawSizeMode}
        />
      )}

      {activeSmartEvent === 'entrance' && regionEntrance && (
        <RegionEntranceForm
          regionEntrance={regionEntrance}
          setRegionEntrance={setRegionEntrance}
          supportsTargetDetection={supportsTargetDetection}
          onStartDrawing={() => handleStart4PointDrawing('entrance')}
          onSave={handleSaveRegionEntrance}
          onStartDrawMinSize={handleStartDrawMinSize}
          onStartDrawMaxSize={handleStartDrawMaxSize}
          onClearMinSize={handleClearMinSize}
          onClearMaxSize={handleClearMaxSize}
          onClearAllSizes={handleClearAllSizes}
          drawingMode={drawSizeMode}
        />
      )}

      {activeSmartEvent === 'exiting' && regionExiting && (
        <RegionExitingForm
          regionExiting={regionExiting}
          setRegionExiting={setRegionExiting}
          supportsTargetDetection={supportsTargetDetection}
          onStartDrawing={() => handleStart4PointDrawing('exiting')}
          onSave={handleSaveRegionExiting}
          onStartDrawMinSize={handleStartDrawMinSize}
          onStartDrawMaxSize={handleStartDrawMaxSize}
          onClearMinSize={handleClearMinSize}
          onClearMaxSize={handleClearMaxSize}
          onClearAllSizes={handleClearAllSizes}
          drawingMode={drawSizeMode}
        />
      )}
    </div>
  );
};
