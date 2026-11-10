import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import PiecesStep, { roleLabel } from './PiecesStep.jsx'
import { autoPlan } from './autoSetup'

const piece = (id, en, ar, extra = {}) => ({ id, label: { en, ar }, outline: [[0, 0], [20, 0], [20, 30], [0, 30]], ...extra })
const source = { designId: 'pieces-test', pieces: [
  piece('front', 'Front bodice', 'الصدر الأمامي'),
  piece('back', 'Back skirt', 'التنورة الخلفية'),
  piece('sleeve', 'Short sleeve', 'كم قصير'),
  piece('mystery', 'Mystery', 'غامض', { role: 'unknown' }),
] }
const render = lang => { const { plan } = autoPlan(source); return renderToStaticMarkup(<PiecesStep source={source} plan={plan} lang={lang} onAnswer={() => {}} />) }

describe('Pieces step', () => {
  it('shows every piece as a card, already set up, without raw objects', () => {
    const html = render('en')
    expect(html.match(/cl-piece-card/g)).toHaveLength(4)
    expect(html).toContain('Front bodice')
    expect(html).toContain('Try it on')
    expect(html).not.toContain('[object Object]')
    expect(html).not.toContain('Needs a choice')
  })
  it('renders Arabic labels and sleeve auto-sew guidance chip', () => {
    const html = render('ar')
    expect(html).toContain('الصدر الأمامي')
    expect(html).toContain('نصف الرأس للأمام')
    expect(html).not.toContain('[object Object]')
  })
  it('uses friendly names instead of schema role ids', () => {
    for (const role of ['front-panel', 'hip-panel-back', 'sleeve', 'pocket']) {
      expect(roleLabel(role, 'en')).not.toMatch(/-/)
      expect(roleLabel(role, 'ar')).not.toBe(role)
    }
  })
})
