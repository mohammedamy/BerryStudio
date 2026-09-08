import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import PatternReview from './PatternReview'
import Header from '../ui/Header'
import { planPattern } from './patternPlan'
const pieces=[
 {id:'front',label:{en:'Front bodice',ar:'صدر أمامي'},role:'front-panel',outline:[[0,0],[10,2],[22,0],[24,10],[20,25],[0,25]],darts:[[[10,15],[8,25],[12,25]]]},
 {id:'back',label:{en:'Back bodice',ar:'صدر خلفي'},role:'back-panel',cutOnFold:true,outline:[[0,0],[20,0],[24,10],[20,25],[0,25]]},
 {id:'custom',label:{en:'My custom panel',ar:'قطعتي الخاصة'},outline:[[0,0],[26,0],[30,42],[0,42]]},
 {id:'waist',label:{en:'Waistband',ar:'حزام الخصر'},role:'waistband',cutOnFold:false,bilateral:false,outline:[[0,0],[45,0],[45,5],[0,5]]},
]
const source={designId:'fixture',designName:'Studio dress · component preview',pieces}
describe('pattern review UI',()=>{
 for(const lang of ['en','ar'])it(`renders every source piece and accessible multiple-choice groups in ${lang}`,()=>{
  const markup=renderToStaticMarkup(<PatternReview source={source} plan={planPattern(source)} lang={lang} onAnswer={()=>{}} onContinue={()=>{}} />)
  expect(markup.match(/class="cl-piece-card"/g)).toHaveLength(4)
  expect(markup).toContain('<fieldset>');expect(markup).toContain('type="radio"')
  expect(markup).not.toContain('[object Object]')
  if(process.env.BERRY_UI_PREVIEW_DIR){
   mkdirSync(process.env.BERRY_UI_PREVIEW_DIR,{recursive:true})
   const css=readFileSync('src/index.css','utf8')
   const header=renderToStaticMarkup(<Header embedded configuring lang={lang} />)
   writeFileSync(`${process.env.BERRY_UI_PREVIEW_DIR}/review-${lang}.html`,`<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cloth Lab component preview — no simulation</title><style>html,body{height:100%;margin:0}${css}</style><div class="cloth-lab-root" dir="${lang==='ar'?'rtl':'ltr'}">${header}${markup}</div></html>`)
  }
 })
})
