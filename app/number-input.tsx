import {useUnits} from './unit-context';
import {settingNumber} from './units';
import {useEffect,useState} from 'react';
import {inputNumber,parseNumber} from './units';
export default function NumberInput({value,onCommit,label,min,max,className,autoFocus=false}:{value:number;onCommit:(v:number)=>void;label:string;min?:number;max?:number;className?:string;autoFocus?:boolean}){
 const units=useUnits(),[focused,setFocused]=useState(false);
 const [text,setText]=useState(inputNumber(value)),[invalid,setInvalid]=useState(false);
 useEffect(()=>{setText(inputNumber(value));setInvalid(false);},[value]);
 function commit(){if(text===inputNumber(value)){setInvalid(false);return;}const v=parseNumber(text);if(!Number.isFinite(v)||(min!==undefined&&v<min)||(max!==undefined&&v>max)){setInvalid(true);return;}setInvalid(false);if(v!==value)onCommit(v);else setText(inputNumber(value));}
 return <input className={className} aria-label={label} aria-invalid={invalid} title={invalid?'Enter a valid value, using a comma for decimals.':undefined} type="text" inputMode="decimal" autoFocus={autoFocus} value={focused||invalid?text:settingNumber(value,units,false)} onFocus={()=>setFocused(true)} onChange={e=>{setText(e.target.value);setInvalid(false);}} onBlur={()=>{commit();setFocused(false);}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur();}if(e.key==='Escape'){setText(inputNumber(value));setInvalid(false);}}}/>;
}
