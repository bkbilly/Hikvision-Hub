import React from 'react';
import type {
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

interface EventsSvgOverlayProps {
  svgRef: React.RefObject<SVGSVGElement | null>;
  activeSmartEvent: string;
  motion: MotionDetection | null;
  lineDetection: LineDetection | null;
  intrusion: FieldDetection | null;
  tamper: TamperDetection | null;
  unattended: UnattendedBaggageDetection | null;
  objectRemoval: ObjectRemovalDetection | null;
  regionEntrance: RegionEntrance | null;
  regionExiting: RegionExiting | null;
  isPolygonMotion: boolean;
  drawStep: 'first' | 'second' | null;
  drawIntrusionStep: number | null;
  isDrawingNormalMotion: boolean;
  normalMotionDrawPoints: Point[];
  drawExpertRectCorner1: Point | null;
  drawHoverPt: Point | null;
  isPaintingGrid: boolean;
  gridBrushMode: boolean;
  gridDragStart: { r: number; c: number } | null;
  gridDragCurrent: { r: number; c: number } | null;
  activeExpertAreaIndex: number;
  getExpertRegions: () => MotionRegion[];
  getActiveRegionPoints: () => Point[];
  getGridDimensions: () => { cols: number; rows: number; total: number };
  parseGridMap: (gridMap?: string) => boolean[][];
  onSVGPointerDown: (e: React.PointerEvent<SVGSVGElement>) => void;
  onSVGPointerMove: (e: React.PointerEvent<SVGSVGElement>) => void;
  onGridDragStart: (r: number, c: number) => void;
  draggingPoint: string | null;
  setDraggingPoint: (pt: string | null) => void;
}

export const EventsSvgOverlay: React.FC<EventsSvgOverlayProps> = ({
  svgRef,
  activeSmartEvent,
  motion,
  lineDetection,
  intrusion,
  tamper,
  unattended,
  objectRemoval,
  regionEntrance,
  regionExiting,
  isPolygonMotion,
  drawStep,
  drawIntrusionStep,
  isDrawingNormalMotion,
  normalMotionDrawPoints,
  drawExpertRectCorner1,
  drawHoverPt,
  isPaintingGrid,
  gridBrushMode,
  gridDragStart,
  gridDragCurrent,
  activeExpertAreaIndex,
  getExpertRegions,
  getActiveRegionPoints,
  getGridDimensions,
  parseGridMap,
  onSVGPointerDown,
  onSVGPointerMove,
  onGridDragStart,
  draggingPoint,
  setDraggingPoint,
}) => {
  // Line points & perpendicular arrows
  const pt1 = lineDetection?.coordinates?.[0] || { x: 200, y: 500 };
  const pt2 = lineDetection?.coordinates?.[1] || { x: 800, y: 500 };
  const dx = pt2.x - pt1.x;
  const dy = pt2.y - pt1.y;
  const lineLen = Math.max(1, Math.sqrt(dx * dx + dy * dy));

  let rawNx = -dy / lineLen;
  let rawNy = dx / lineLen;
  if (rawNx > 0 || (Math.abs(rawNx) < 0.001 && rawNy > 0)) {
    rawNx = -rawNx;
    rawNy = -rawNy;
  }

  const normAx = rawNx;
  const normAy = rawNy;
  const normBx = -rawNx;
  const normBy = -rawNy;
  const midX = (pt1.x + pt2.x) / 2;
  const midY = (pt1.y + pt2.y) / 2;
  const arrowAEnd = {
    x: Math.round(midX + normAx * 45),
    y: Math.round(midY + normAy * 45),
  };
  const arrowBEnd = {
    x: Math.round(midX + normBx * 45),
    y: Math.round(midY + normBy * 45),
  };

  // 4-point coordinates for other events
  const iPts: Point[] = intrusion?.coordinates && intrusion.coordinates.length >= 4
    ? intrusion.coordinates
    : [
        { x: 200, y: 200 },
        { x: 800, y: 200 },
        { x: 800, y: 800 },
        { x: 200, y: 800 },
      ];

  const tPts: Point[] = tamper?.coordinates && tamper.coordinates.length >= 4
    ? tamper.coordinates
    : [
        { x: 200, y: 200 },
        { x: 800, y: 200 },
        { x: 800, y: 800 },
        { x: 200, y: 800 },
      ];

  const uPts: Point[] = unattended?.coordinates && unattended.coordinates.length >= 4
    ? unattended.coordinates
    : [
        { x: 250, y: 250 },
        { x: 750, y: 250 },
        { x: 750, y: 750 },
        { x: 250, y: 750 },
      ];

  const rPts: Point[] = objectRemoval?.coordinates && objectRemoval.coordinates.length >= 4
    ? objectRemoval.coordinates
    : [
        { x: 300, y: 300 },
        { x: 700, y: 300 },
        { x: 700, y: 700 },
        { x: 300, y: 700 },
      ];

  const ePts: Point[] = regionEntrance?.coordinates && regionEntrance.coordinates.length >= 4
    ? regionEntrance.coordinates
    : [
        { x: 200, y: 200 },
        { x: 800, y: 200 },
        { x: 800, y: 800 },
        { x: 200, y: 800 },
      ];

  const xPts: Point[] = regionExiting?.coordinates && regionExiting.coordinates.length >= 4
    ? regionExiting.coordinates
    : [
        { x: 200, y: 200 },
        { x: 800, y: 200 },
        { x: 800, y: 800 },
        { x: 200, y: 800 },
      ];

  // Helper to render 4-point interactive zone overlay
  const render4PointRegionSVG = (
    pts: Point[],
    enabled: boolean,
    strokeColor: string,
    fillColor: string,
    textColor: string = '#ffffff'
  ) => {
    if (drawIntrusionStep !== null) {
      return (
        <g className="pointer-events-none">
          {drawIntrusionStep >= 2 && (
            <g transform={`translate(${pts[0].x}, ${pts[0].y})`}>
              <circle r="26" fill={strokeColor} stroke="#ffffff" strokeWidth="4" className="drop-shadow-xl" />
              <text x="0" y="7" fill={textColor} fontSize="18" fontWeight="bold" textAnchor="middle">1</text>
            </g>
          )}

          {drawIntrusionStep >= 3 && (
            <>
              <line x1={pts[0].x} y1={pts[0].y} x2={pts[1].x} y2={pts[1].y} stroke={strokeColor} strokeWidth="6" />
              <g transform={`translate(${pts[1].x}, ${pts[1].y})`}>
                <circle r="26" fill={strokeColor} stroke="#ffffff" strokeWidth="4" className="drop-shadow-xl" />
                <text x="0" y="7" fill={textColor} fontSize="18" fontWeight="bold" textAnchor="middle">2</text>
              </g>
            </>
          )}

          {drawIntrusionStep >= 4 && (
            <>
              <line x1={pts[1].x} y1={pts[1].y} x2={pts[2].x} y2={pts[2].y} stroke={strokeColor} strokeWidth="6" />
              <g transform={`translate(${pts[2].x}, ${pts[2].y})`}>
                <circle r="26" fill={strokeColor} stroke="#ffffff" strokeWidth="4" className="drop-shadow-xl" />
                <text x="0" y="7" fill={textColor} fontSize="18" fontWeight="bold" textAnchor="middle">3</text>
              </g>
            </>
          )}

          {drawHoverPt && drawIntrusionStep === 2 && (
            <line x1={pts[0].x} y1={pts[0].y} x2={drawHoverPt.x} y2={drawHoverPt.y} stroke={strokeColor} strokeWidth="6" strokeDasharray="10,10" />
          )}
          {drawHoverPt && drawIntrusionStep === 3 && (
            <line x1={pts[1].x} y1={pts[1].y} x2={drawHoverPt.x} y2={drawHoverPt.y} stroke={strokeColor} strokeWidth="6" strokeDasharray="10,10" />
          )}
          {drawHoverPt && drawIntrusionStep === 4 && (
            <polygon
              points={`${pts[0].x},${pts[0].y} ${pts[1].x},${pts[1].y} ${pts[2].x},${pts[2].y} ${drawHoverPt.x},${drawHoverPt.y}`}
              fill={fillColor}
              stroke={strokeColor}
              strokeWidth="6"
              strokeDasharray="10,10"
            />
          )}

          {drawHoverPt && (
            <g transform={`translate(${drawHoverPt.x}, ${drawHoverPt.y})`}>
              <circle r="26" fill={strokeColor} stroke="#ffffff" strokeWidth="4" strokeDasharray="6,6" opacity="0.85" className="drop-shadow-xl" />
              <text x="0" y="7" fill={textColor} fontSize="18" fontWeight="bold" textAnchor="middle">{drawIntrusionStep}</text>
            </g>
          )}
        </g>
      );
    }

    if (enabled) {
      return (
        <>
          <polygon
            points={`${pts[0].x},${pts[0].y} ${pts[1].x},${pts[1].y} ${pts[2].x},${pts[2].y} ${pts[3].x},${pts[3].y}`}
            fill={fillColor}
            stroke={strokeColor}
            strokeWidth="8"
            strokeLinejoin="round"
          />
          {pts.map((p, idx) => (
            <g
              key={idx}
              transform={`translate(${p.x}, ${p.y})`}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDraggingPoint(String(idx + 1));
              }}
              className="cursor-grab active:cursor-grabbing"
            >
              <circle r="28" fill={strokeColor} stroke="#ffffff" strokeWidth="5" className="drop-shadow-xl" />
              <text x="0" y="8" fill={textColor} fontSize="18" fontWeight="bold" textAnchor="middle">{idx + 1}</text>
            </g>
          ))}
        </>
      );
    }

    return null;
  };

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 1000 1000"
      preserveAspectRatio="none"
      className={`absolute inset-0 w-full h-full touch-none select-none ${
        draggingPoint
          ? 'cursor-grabbing'
          : drawStep || drawIntrusionStep
          ? 'cursor-crosshair'
          : activeSmartEvent === 'motion' && (motion?.mode || 'normal') === 'normal'
          ? 'cursor-crosshair'
          : isPaintingGrid
          ? 'cursor-cell'
          : 'cursor-default'
      }`}
      onPointerDown={onSVGPointerDown}
      onPointerMove={onSVGPointerMove}
    >
      <defs>
        <marker id="arrowhead-a" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="8" markerHeight="8" orient="auto">
          <path d="M 0 1 L 10 5 L 0 9 z" fill="#f59e0b" />
        </marker>
        <marker id="arrowhead-b" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="8" markerHeight="8" orient="auto">
          <path d="M 0 1 L 10 5 L 0 9 z" fill="#06b6d4" />
        </marker>
        <marker id="arrowhead-both" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M 0 1 L 10 5 L 0 9 z" fill="#e2e8f0" />
        </marker>
      </defs>

      {/* --- OVERLAY 1: LINE CROSSING --- */}
      {activeSmartEvent === 'line' && lineDetection && (
        <>
          {drawStep === 'second' && (
            <g className="pointer-events-none">
              <line
                x1={pt1.x}
                y1={pt1.y}
                x2={drawHoverPt ? drawHoverPt.x : pt1.x}
                y2={drawHoverPt ? drawHoverPt.y : pt1.y}
                stroke="#f59e0b"
                strokeWidth="8"
                strokeDasharray="12,12"
                strokeOpacity="0.9"
              />
              <g transform={`translate(${pt1.x}, ${pt1.y})`}>
                <circle r="26" fill="#f59e0b" stroke="#ffffff" strokeWidth="4" className="drop-shadow-xl animate-pulse" />
                <text x="0" y="7" fill="#000000" fontSize="18" fontWeight="bold" textAnchor="middle">1</text>
              </g>
              {drawHoverPt && (
                <g transform={`translate(${drawHoverPt.x}, ${drawHoverPt.y})`}>
                  <circle r="26" fill="#06b6d4" stroke="#ffffff" strokeWidth="4" strokeDasharray="6,6" opacity="0.85" className="drop-shadow-xl" />
                  <text x="0" y="7" fill="#000000" fontSize="18" fontWeight="bold" textAnchor="middle">2</text>
                </g>
              )}
            </g>
          )}

          {!drawStep && lineDetection.enabled && (
            <>
              <line
                x1={pt1.x}
                y1={pt1.y}
                x2={pt2.x}
                y2={pt2.y}
                stroke="#f59e0b"
                strokeWidth="10"
                strokeOpacity="0.95"
              />

              {lineDetection.direction === 'rightToLeft' && (
                <line
                  x1={arrowBEnd.x}
                  y1={arrowBEnd.y}
                  x2={arrowAEnd.x}
                  y2={arrowAEnd.y}
                  stroke="#f59e0b"
                  strokeWidth="10"
                  markerEnd="url(#arrowhead-a)"
                />
              )}
              {lineDetection.direction === 'leftToRight' && (
                <line
                  x1={arrowAEnd.x}
                  y1={arrowAEnd.y}
                  x2={arrowBEnd.x}
                  y2={arrowBEnd.y}
                  stroke="#06b6d4"
                  strokeWidth="10"
                  markerEnd="url(#arrowhead-b)"
                />
              )}
              {lineDetection.direction === 'both' && (
                <line
                  x1={arrowAEnd.x}
                  y1={arrowAEnd.y}
                  x2={arrowBEnd.x}
                  y2={arrowBEnd.y}
                  stroke="#e2e8f0"
                  strokeWidth="8"
                  markerStart="url(#arrowhead-both)"
                  markerEnd="url(#arrowhead-both)"
                />
              )}

              <g
                transform={`translate(${pt1.x}, ${pt1.y})`}
                onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); setDraggingPoint('1'); }}
                className="cursor-grab active:cursor-grabbing"
              >
                <circle r="30" fill="#f59e0b" stroke="#ffffff" strokeWidth="5" className="drop-shadow-xl" />
                <text x="0" y="8" fill="#000000" fontSize="20" fontWeight="bold" textAnchor="middle">1</text>
              </g>

              <g
                transform={`translate(${pt2.x}, ${pt2.y})`}
                onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); setDraggingPoint('2'); }}
                className="cursor-grab active:cursor-grabbing"
              >
                <circle r="30" fill="#06b6d4" stroke="#ffffff" strokeWidth="5" className="drop-shadow-xl" />
                <text x="0" y="8" fill="#000000" fontSize="20" fontWeight="bold" textAnchor="middle">2</text>
              </g>
            </>
          )}
        </>
      )}

      {/* --- OVERLAY 2: MOTION DETECTION NORMAL MODE (GRID OR POLYGON AREA) --- */}
      {activeSmartEvent === 'motion' && (motion?.mode || 'normal') === 'normal' && (() => {
        const { cols, rows } = getGridDimensions();
        const parsedGrid = parseGridMap(motion?.grid_map);
        const hasNormArea = Boolean(motion?.coordinates && motion.coordinates.length >= 3);
        return (
          <g className="select-none">
            {/* Standard cameras: render Grid Map */}
            {!isPolygonMotion && (
              <>
                {parsedGrid.map((row, r) =>
                  row.map((cellActive, c) => {
                    const cellW = 1000 / cols;
                    const cellH = 1000 / rows;
                    const x = c * cellW;
                    const y = r * cellH;
                    return (
                      <rect
                        key={`${r}-${c}`}
                        x={x}
                        y={y}
                        width={cellW}
                        height={cellH}
                        fill={
                          cellActive
                            ? motion?.enabled
                              ? 'rgba(16, 185, 129, 0.38)'
                              : 'rgba(100, 116, 139, 0.25)'
                            : 'transparent'
                        }
                        stroke={
                          cellActive
                            ? motion?.enabled
                              ? 'rgba(16, 185, 129, 0.85)'
                              : 'rgba(100, 116, 139, 0.6)'
                            : 'rgba(255, 255, 255, 0.12)'
                        }
                        strokeWidth={cellActive ? 1.2 : 0.5}
                        strokeDasharray={cellActive ? undefined : '2,2'}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          onGridDragStart(r, c);
                        }}
                        className="cursor-crosshair transition-colors duration-75 hover:opacity-80"
                      />
                    );
                  })
                )}

                {/* Live Drag-Selection Marquee Box */}
                {gridDragStart && gridDragCurrent && (() => {
                  const rMin = Math.min(gridDragStart.r, gridDragCurrent.r);
                  const rMax = Math.max(gridDragStart.r, gridDragCurrent.r);
                  const cMin = Math.min(gridDragStart.c, gridDragCurrent.c);
                  const cMax = Math.max(gridDragStart.c, gridDragCurrent.c);
                  const cellW = 1000 / cols;
                  const cellH = 1000 / rows;
                  const marqueeX = cMin * cellW;
                  const marqueeY = rMin * cellH;
                  const marqueeW = (cMax - cMin + 1) * cellW;
                  const marqueeH = (rMax - rMin + 1) * cellH;
                  return (
                    <rect
                      x={marqueeX}
                      y={marqueeY}
                      width={marqueeW}
                      height={marqueeH}
                      fill={gridBrushMode ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)'}
                      stroke={gridBrushMode ? '#10b981' : '#ef4444'}
                      strokeWidth="2.5"
                      strokeDasharray="6,4"
                      className="pointer-events-none animate-pulse"
                    />
                  );
                })()}
              </>
            )}

            {/* Polygon-capable cameras: render 3+ Point Polygon */}
            {isPolygonMotion && hasNormArea && !isDrawingNormalMotion && motion?.coordinates && (
              <g>
                <polygon
                  points={motion.coordinates.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill={motion.enabled ? 'rgba(16, 185, 129, 0.32)' : 'rgba(100, 116, 139, 0.25)'}
                  stroke={motion.enabled ? '#10b981' : '#64748b'}
                  strokeWidth="6"
                  strokeLinejoin="round"
                />
                {motion.coordinates.map((pt, idx) => (
                  <g
                    key={idx}
                    transform={`translate(${pt.x}, ${pt.y})`}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDraggingPoint(String(idx + 1));
                    }}
                    className="cursor-grab active:cursor-grabbing"
                  >
                    <circle
                      r="26"
                      fill={motion.enabled ? '#10b981' : '#64748b'}
                      stroke="#ffffff"
                      strokeWidth="4"
                      className="drop-shadow-xl"
                    />
                    <text x="0" y="7" fill="#000000" fontSize="18" fontWeight="bold" textAnchor="middle">
                      {idx + 1}
                    </text>
                  </g>
                ))}
              </g>
            )}

            {/* Live Normal Motion Polygon Drawing in Progress */}
            {isDrawingNormalMotion && (
              <g className="pointer-events-none">
                {normalMotionDrawPoints.length > 0 && (
                  <polyline
                    points={normalMotionDrawPoints.map((p) => `${p.x},${p.y}`).join(' ')}
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="6"
                  />
                )}
                {drawHoverPt && normalMotionDrawPoints.length > 0 && (
                  <line
                    x1={normalMotionDrawPoints[normalMotionDrawPoints.length - 1].x}
                    y1={normalMotionDrawPoints[normalMotionDrawPoints.length - 1].y}
                    x2={drawHoverPt.x}
                    y2={drawHoverPt.y}
                    stroke="#10b981"
                    strokeWidth="6"
                    strokeDasharray="8,8"
                  />
                )}
                {normalMotionDrawPoints.map((pt, idx) => (
                  <g key={idx} transform={`translate(${pt.x}, ${pt.y})`}>
                    <circle r="24" fill="#10b981" stroke="#ffffff" strokeWidth="4" className="drop-shadow-lg" />
                    <text x="0" y="7" fill="#000000" fontSize="16" fontWeight="bold" textAnchor="middle">
                      {idx + 1}
                    </text>
                  </g>
                ))}
                {drawHoverPt && (
                  <g transform={`translate(${drawHoverPt.x}, ${drawHoverPt.y})`}>
                    <circle r="20" fill="#06b6d4" stroke="#ffffff" strokeWidth="3" opacity="0.8" />
                    <text x="0" y="6" fill="#000000" fontSize="14" fontWeight="bold" textAnchor="middle">
                      {normalMotionDrawPoints.length + 1}
                    </text>
                  </g>
                )}
              </g>
            )}
          </g>
        );
      })()}

      {/* --- OVERLAY 3: MOTION DETECTION EXPERT MODE (MULTI-AREAS WITH 90° RECTANGLES) --- */}
      {activeSmartEvent === 'motion' && motion?.mode === 'expert' && (
        <>
          {/* Inactive but enabled background areas */}
          {getExpertRegions().map((reg, idx) => {
            if (idx === activeExpertAreaIndex || !reg.enabled || !motion.enabled) return null;
            const pts = reg.coordinates && reg.coordinates.length >= 4
              ? reg.coordinates
              : [
                  { x: 150 + (idx % 4) * 80, y: 150 + (idx % 4) * 80 },
                  { x: 650 + (idx % 4) * 80, y: 150 + (idx % 4) * 80 },
                  { x: 650 + (idx % 4) * 80, y: 650 + (idx % 4) * 80 },
                  { x: 150 + (idx % 4) * 80, y: 650 + (idx % 4) * 80 },
                ];
            const areaMidX = Math.round((pts[0].x + pts[1].x + pts[2].x + pts[3].x) / 4);
            const areaMidY = Math.round((pts[0].y + pts[1].y + pts[2].y + pts[3].y) / 4);
            return (
              <g key={idx} className="pointer-events-none opacity-80">
                <polygon
                  points={`${pts[0].x},${pts[0].y} ${pts[1].x},${pts[1].y} ${pts[2].x},${pts[2].y} ${pts[3].x},${pts[3].y}`}
                  fill="rgba(6, 182, 212, 0.15)"
                  stroke="#06b6d4"
                  strokeWidth="4"
                  strokeDasharray="8,8"
                  strokeLinejoin="round"
                />
                <g transform={`translate(${areaMidX}, ${areaMidY})`}>
                  <rect x="-36" y="-14" width="72" height="28" rx="6" fill="rgba(15, 23, 42, 0.85)" stroke="#06b6d4" strokeWidth="1.5" />
                  <text x="0" y="5" fill="#38bdf8" fontSize="12" fontWeight="bold" textAnchor="middle">Area {idx + 1}</text>
                </g>
              </g>
            );
          })}

          {/* Live 90° Rectangle Drawing Preview */}
          {drawStep === 'second' && drawExpertRectCorner1 && drawHoverPt && (
            <rect
              x={Math.min(drawExpertRectCorner1.x, drawHoverPt.x)}
              y={Math.min(drawExpertRectCorner1.y, drawHoverPt.y)}
              width={Math.abs(drawHoverPt.x - drawExpertRectCorner1.x)}
              height={Math.abs(drawHoverPt.y - drawExpertRectCorner1.y)}
              fill="rgba(16, 185, 129, 0.28)"
              stroke="#10b981"
              strokeWidth="4"
              strokeDasharray="8,6"
              className="pointer-events-none animate-pulse"
            />
          )}

          {/* Active selected area with 4 handles (Area 1 is always enabled) */}
          {!drawStep && render4PointRegionSVG(
            getActiveRegionPoints(),
            Boolean((activeExpertAreaIndex === 0 || motion.regions?.[activeExpertAreaIndex]?.enabled) && motion.enabled),
            '#10b981',
            'rgba(16, 185, 129, 0.28)',
            '#000000'
          )}
        </>
      )}

      {/* --- OVERLAY 4: INTRUSION REGION --- */}
      {activeSmartEvent === 'intrusion' && intrusion && (
        render4PointRegionSVG(iPts, intrusion.enabled, '#a855f7', 'rgba(168, 85, 247, 0.25)')
      )}

      {/* --- OVERLAY 5: REGION ENTRANCE --- */}
      {activeSmartEvent === 'entrance' && regionEntrance && (
        render4PointRegionSVG(ePts, regionEntrance.enabled, '#6366f1', 'rgba(99, 102, 241, 0.25)')
      )}

      {/* --- OVERLAY 6: REGION EXITING --- */}
      {activeSmartEvent === 'exiting' && regionExiting && (
        render4PointRegionSVG(xPts, regionExiting.enabled, '#ec4899', 'rgba(236, 72, 153, 0.25)')
      )}

      {/* --- OVERLAY 7: VIDEO TAMPERING --- */}
      {activeSmartEvent === 'tamper' && (
        <>
          {/* Live 90° Rectangle Drawing Preview */}
          {drawStep === 'second' && drawExpertRectCorner1 && drawHoverPt && (
            <rect
              x={Math.min(drawExpertRectCorner1.x, drawHoverPt.x)}
              y={Math.min(drawExpertRectCorner1.y, drawHoverPt.y)}
              width={Math.abs(drawHoverPt.x - drawExpertRectCorner1.x)}
              height={Math.abs(drawHoverPt.y - drawExpertRectCorner1.y)}
              fill="rgba(244, 63, 94, 0.25)"
              stroke="#f43f5e"
              strokeWidth="4"
              strokeDasharray="8,6"
              className="pointer-events-none animate-pulse"
            />
          )}

          {!drawStep && tamper && render4PointRegionSVG(
            tPts,
            tamper.enabled,
            '#f43f5e',
            'rgba(244, 63, 94, 0.25)',
            '#ffffff'
          )}
        </>
      )}

      {/* --- OVERLAY 8: UNATTENDED BAGGAGE --- */}
      {activeSmartEvent === 'unattended' && unattended && (
        render4PointRegionSVG(uPts, unattended.enabled, '#14b8a6', 'rgba(20, 184, 166, 0.25)')
      )}

      {/* --- OVERLAY 9: OBJECT REMOVAL --- */}
      {activeSmartEvent === 'removal' && objectRemoval && (
        render4PointRegionSVG(rPts, objectRemoval.enabled, '#f97316', 'rgba(249, 115, 22, 0.25)')
      )}
    </svg>
  );
};
