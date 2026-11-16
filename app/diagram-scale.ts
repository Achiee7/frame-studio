import type {Result} from './solver';
export type Diagram='M'|'V'|'N'|'u';
export type DiagramReference={maximum:number;cameraScale:number};
export function diagramMaximum(result:Result,view:Diagram){return view==='u'?result.maxDisplacement/1000:Math.max(0,...result.samples.map(p=>Math.abs(p[view])));}
export function diagramPixels(value:number,reference:DiagramReference|undefined,amplitude:number,cameraScale:number){return reference&&reference.maximum>0?value/reference.maximum*amplitude*cameraScale/reference.cameraScale:0;}
export class DiagramScales{
 private values:Partial<Record<Diagram,DiagramReference>>={};
 get(view:Diagram,result:Result|null,cameraScale:number){if(!this.values[view]&&result&&result.applicability?.ok!==false){const maximum=diagramMaximum(result,view);if(Number.isFinite(maximum)&&maximum>1e-12)this.values[view]={maximum,cameraScale};}return this.values[view];}
 fit(view:Diagram,result:Result,cameraScale:number){delete this.values[view];return this.get(view,result,cameraScale);}
 clear(){this.values={};}
}
