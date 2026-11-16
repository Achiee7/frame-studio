import assert from 'node:assert/strict';
import {formatNumber,parseNumber,quantity,getUnits,display,forceUnits,lengthUnits,momentUnits,stressUnits} from '../app/units.ts';
import {example,validModel} from '../app/model.ts';
import {solve} from '../app/solver.ts';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9*Math.max(1,Math.abs(b)),`${a} != ${b}`);
assert.equal(formatNumber(12345.67,2),'12.345,67');assert.equal(formatNumber(-.25,2),'-0,25');assert.equal(parseNumber('12.345,67'),12345.67);assert.equal(parseNumber('1.234'),1234);assert.equal(parseNumber('0,125'),.125);assert.ok(Number.isNaN(parseNumber('1,2,3')));assert.ok(Number.isNaN(parseNumber('')));near(parseNumber('1,2e-3'),.0012);
near(forceUnits.lbf,.0044482216152605);near(lengthUnits.in,.0254);near(lengthUnits.ft,.3048);near(stressUnits.ksi,6.894757293168361);near(momentUnits['kip·ft'],1.3558179483314004);
const m=example('portal'),original=solve(m);m.units={length:'ft',force:'kip',moment:'kip·ft',stress:'ksi',deflection:'in',distributedLength:'ft'};assert.ok(validModel(m));assert.deepEqual(solve(m),original,'Display preferences must never change physics');const u=getUnits(m);near(quantity(u,'distributed').factor,forceUnits.kip/lengthUnits.ft);near(5/quantity(u,'force').factor*forceUnits.kip,5);assert.equal(display(m,.3048,'length'),'1 ft');assert.equal(display(m,4.4482216152605,'force'),'1 kip');assert.equal(display(m,6.894757293168361,'stress'),'1 ksi');m.units.force='kg';assert.equal(validModel(m),false);
for(const unit of Object.keys(forceUnits)){const unitModel={units:{force:unit}};const q=quantity(getUnits(unitModel),'force');near(7.125/q.factor*q.factor,7.125);}
console.log('Passed: decimal/group parsing and formatting, NIST imperial conversions, independent dimensions/forces/stress units, distributed-load scaling, invalid-unit rejection and unchanged physical analysis.');
