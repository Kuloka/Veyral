import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {feature} from 'topojson-client';
import {geoNaturalEarth1,geoPath,geoCentroid} from 'd3-geo';

const require=createRequire(import.meta.url);
const atlas=require('world-atlas/countries-110m.json');
const codes=require('i18n-iso-countries');
const collection=feature(atlas,atlas.objects.countries);
const projection=geoNaturalEarth1().fitExtent([[18,24],[982,476]],collection);
const draw=geoPath(projection);
const points={};
const coordinates={};
const shapes=[];

for(const country of collection.features){
  const code=codes.numericToAlpha2(String(country.id).padStart(3,'0'));
  const outline=draw(country);
  if(outline)shapes.push(`<path d="${outline}"/>`);
  if(!code)continue;
  const center=projection(geoCentroid(country));
  coordinates[code]=geoCentroid(country);
  if(center&&Number.isFinite(center[0])&&Number.isFinite(center[1]))points[code]=[Math.round(center[0]*10)/10,Math.round(center[1]*10)/10];
}

// Small territories disappear from the 1:110m outline; keep their markers visible.
for(const [code,longitude,latitude] of [
  ['SG',103.82,1.35],['HK',114.17,22.32],['MO',113.54,22.2],
  ['BH',50.55,26.07],['MT',14.38,35.94],['MU',57.55,-20.35],
  ['SC',55.45,-4.62],['RE',55.54,-21.12],['XK',21.16,42.66],
  ['MC',7.42,43.74],['LI',9.55,47.15],['IM',-4.55,54.24]
]){
  const point=projection([longitude,latitude]);
  points[code]=[Math.round(point[0]*10)/10,Math.round(point[1]*10)/10];
  coordinates[code]=[longitude,latitude];
}

const target=path.resolve('assets');
fs.mkdirSync(target,{recursive:true});
fs.writeFileSync(path.join(target,'world.svg'),`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 500" aria-hidden="true"><g fill="#20222b" stroke="#343744" stroke-width=".6" stroke-linejoin="round">${shapes.join('')}</g></svg>`);
fs.writeFileSync(path.join(target,'map-data.js'),`window.VEYRAL_MAP_POINTS=${JSON.stringify(points)};\n`);
fs.writeFileSync(path.join(target,'country-coordinates.json'),JSON.stringify(coordinates));
