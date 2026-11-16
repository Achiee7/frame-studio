import {createContext,useContext} from 'react';
import {defaultUnits} from './units';
export const UnitContext=createContext(defaultUnits);
export const useUnits=()=>useContext(UnitContext);
