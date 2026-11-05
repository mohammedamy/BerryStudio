import { Component } from 'react'
export default class SceneBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  render() {
    if (!this.state.error) return this.props.children
    return <div className="cl-error" role="alert"><h2>{this.props.lang === 'ar' ? 'تعذرت المعاينة' : 'The preview could not start'}</h2><p>{this.state.error.message}</p><p>{this.props.lang === 'ar' ? 'القطع والوصلات محفوظة. ارجع إلى الخياطة وتحقق من الوصلات ثم أعد المحاولة.' : 'Your pieces and seams are kept. Go back to sewing, check the seams, then try again.'}</p><button className="cl-btn cl-btn-primary" onClick={this.props.onRecover}>{this.props.lang === 'ar' ? 'العودة إلى الخياطة' : 'Back to sewing'}</button></div>
  }
}
