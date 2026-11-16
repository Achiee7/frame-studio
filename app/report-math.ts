import katex from 'katex';
import {mathCss} from './report-math-css';
import {formatNumber} from './units';
export const calculationCss=mathCss+`
.calculation{margin:24px 0;padding:22px;border:1px solid #dbe6df;border-radius:10px;background:#fcfdfc}
.calculation h3{font-size:18px;margin:0 0 14px}.calculation h4{font-size:14px;margin:22px 0 8px;color:#28664f}
.equation{overflow-x:auto;padding:9px 12px;margin:12px 0;background:#f2f7f4;border-radius:6px;font-size:13px}
.equation .katex-display{margin:.6em 0;text-align:left}.katex-display>.katex{white-space:nowrap;text-align:left}
.calculation p{max-width:80ch}.calc-table{font-variant-numeric:tabular-nums}.calc-table td{padding:6px 9px}
.calculation details{margin:15px 0}.calculation summary{cursor:pointer;color:#28664f}.trace-note{font-size:11px;color:#607368}
@media print{.calculation{padding:16px;break-inside:auto}.equation{break-inside:avoid;font-size:10px;overflow:visible}.calculation details>*{display:block}.calculation h4{break-after:avoid}.calculation table{font-size:9px}}
`;
export function texNumber(v:number,digits=6):string{
 if(!Number.isFinite(v))throw Error('Non-finite value in calculation report');
 if(v!==0&&(Math.abs(v)<1e-4||Math.abs(v)>=1e7)){const [m,e]=v.toExponential(digits).split('e');return `${formatNumber(Number(m),digits).replace(',','{,}').replaceAll('.','{.}')}\\times10^{${Number(e)}}`;}
 return formatNumber(v,digits).replace(',','{,}').replaceAll('.','{.}');
}
export function equation(tex:string){try{return '<div class="equation">'+katex.renderToString(tex,{displayMode:true,throwOnError:true,trust:false,strict:'error',output:'htmlAndMathml'})+'</div>';}catch(error){throw Error('Invalid report equation: '+tex+' — '+(error as Error).message);}}
export const matrix=(rows:number[][],digits=5)=>'\\begin{bmatrix}'+rows.map(row=>row.map(v=>texNumber(v,digits)).join('&')).join('\\\\')+'\\end{bmatrix}';
export const vector=(xs:number[],digits=6)=>matrix(xs.map(x=>[x]),digits);
