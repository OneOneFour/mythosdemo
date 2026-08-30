/* Named colours, lifted from the concept art. Content refers to colours by
   NAME, never by hex, so a look row is diffable and a palette swap is one
   file. Lives in `data` because it is content; `core/color.js` holds the
   arithmetic and knows no names. */

export const COL = {
  air:    '#000000',
  soilA:  '#8d6842', soilB: '#7d5b39', soilC: '#5e4229',
  limeA:  '#dcd6c6', limeB: '#c5beaa', limeD: '#8b8270',
  cuA:    '#e0a066', cuB:   '#c07a40', cuC:   '#8c5326', cuD:  '#5c3416',
  irA:    '#a3a3ad', irB:   '#74747f', irC:   '#4a4a54', irD:  '#2c2c34',
  woodA:  '#8f6739', woodB: '#6d4b28', woodC: '#4d3419', woodD: '#33220f',
  veinA:  '#f0aa5e',
  abyC:   '#0a0810',
  brickA: '#b4553f', brickB: '#8e3f2e', brickC: '#5e2a1e',
  hot:    '#ff9a3c', ember: '#ffd469',
  ui:     '#d2c9b2', uiDim: '#7b7361', uiBack: '#0d0b12',
  heart:  '#d8433a', heartDim: '#2c2028'
};
