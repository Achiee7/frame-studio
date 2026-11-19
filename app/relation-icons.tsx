type Props={size?:number;strokeWidth?:number};
function glyph(path:string){
  return function RelationIcon({size=18,strokeWidth=1.65}:Props){
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path}/></svg>;
  };
}
export const Horizontal=glyph('M3 10h4v4H3z M17 10h4v4h-4z M7 12h10');
export const Vertical=glyph('M10 3h4v4h-4z M10 17h4v4h-4z M12 7v10');
export const Parallel=glyph('M3 19L12 5 M12 19L21 5');
export const Perpendicular=glyph('M5 3v16h16 M5 14h5v5');
export const Collinear=glyph('M3 19l6-6 M15 10l6-6 M11 12l2-1.8');
